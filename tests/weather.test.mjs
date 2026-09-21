import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getDbClient, queryLatestWeather, getDatabaseStats } from '../lib/db.ts';
import { ingestWeather } from '../lib/sync.ts';
import { normalizeStationData } from '../lib/cwa.ts';

const directory = mkdtempSync(path.join(tmpdir(), 'weather-test-'));
process.env.SQLITE_PATH = path.join(directory, 'test.db');
after(() => { getDbClient().close(); rmSync(directory, { recursive: true }); });
const sample = {
  station_id: 'TEST', station_name: '臺北', county_name: '臺北市', town_name: '中正區',
  latitude: 25.03, longitude: 121.51, altitude: 5, obs_time: '2026-09-21T12:00:00+08:00',
  weather: '晴', air_temperature: 30, relative_humidity: 65, precipitation: 0,
  wind_speed: 2, wind_direction: 180, air_pressure: 1010, uv_index: null,
};
test('repeat sync is idempotent; metadata updates and latest observation/filter contract is preserved', () => {
  assert.equal(ingestWeather([sample]).observations_inserted, 1);
  assert.equal(ingestWeather([sample]).duplicates_skipped, 1);
  assert.equal(getDatabaseStats().observations_count, 1);
  ingestWeather([{ ...sample, station_name: '臺北更新', obs_time: '2026-09-21T13:00:00+08:00', air_temperature: 31 }]);
  const rows = queryLatestWeather({ county_name: '臺北市', station_id: 'TEST', limit: 1 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].station_name, '臺北更新');
  assert.equal(rows[0].air_temperature, 31);
  assert.equal(queryLatestWeather({ county_name: '臺南市' }).length, 0);
});
test('a failed observation rolls back station metadata; foreign keys are enforced', () => {
  assert.throws(() => ingestWeather([{ ...sample, station_id: 'BROKEN', obs_time: {} }]));
  assert.equal(queryLatestWeather({ station_id: 'BROKEN' }).length, 0);
  assert.throws(() => getDbClient().prepare('INSERT INTO weather_observations (station_id, obs_time) VALUES (?, ?)').run('missing', 'now'), /FOREIGN KEY/);
});
test('missing observation time keeps station metadata without creating observation', () => {
  ingestWeather([{ ...sample, station_id: 'EMPTY', obs_time: '' }]);
  assert.equal(queryLatestWeather({ station_id: 'EMPTY' })[0].obs_time, null);
});
test('CWA normalization preserves zero, rejects missing values and avoids non-WGS84 coordinates', () => {
  const row = normalizeStationData({ StationId: 'X', StationName: '測試', ObsTime: { DateTime: sample.obs_time },
    GeoInfo: { Coordinates: [{ CoordinateName: 'TWD67', StationLatitude: '25', StationLongitude: '121' }], StationAltitude: '-999.0', CountyName: '臺北市' },
    WeatherElement: { AirTemperature: '-99.0', RelativeHumidity: '65', Now: { Precipitation: '0' }, WindSpeed: 'Infinity' } });
  assert.equal(row.latitude, null);
  assert.equal(row.altitude, null);
  assert.equal(row.air_temperature, null);
  assert.equal(row.wind_speed, null);
  assert.equal(row.precipitation, 0);
});
test('standalone SQL schema matches application tables and indexes', () => {
  const sqlDb = new Database(':memory:');
  sqlDb.exec(readFileSync('scripts/schema.sql', 'utf8'));
  const schema = db => db.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all().map(r => ({ name: r.name, sql: r.sql.replace(/\s+/g, ' ') }));
  assert.deepEqual(schema(sqlDb), schema(getDbClient()));
  sqlDb.close();
});

test('GIS rejects invalid coordinates while retaining offshore stations', async () => {
  const { hasValidCoordinates } = await import('../lib/coordinates.ts');
  for (const latitude of [null, NaN, Infinity, 91]) assert.equal(hasValidCoordinates({ latitude, longitude: 121 }), false);
  assert.equal(hasValidCoordinates({ latitude: 25, longitude: 181 }), false);
  assert.equal(hasValidCoordinates({ latitude: 10.38, longitude: 114.36 }), true);
  assert.equal(hasValidCoordinates(sample), true);
});
