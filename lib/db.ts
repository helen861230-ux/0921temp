import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface WeatherStationRecord {
  station_id: string;
  station_name: string;
  county_name: string;
  town_name: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  updated_at?: string;
}

export interface WeatherObservationRecord {
  id?: number;
  station_id: string;
  obs_time: string;
  weather: string | null;
  air_temperature: number | null;
  relative_humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  air_pressure: number | null;
  uv_index: number | null;
  created_at?: string;
}

export interface StationLatestWeather extends WeatherStationRecord {
  obs_time: string | null;
  weather: string | null;
  air_temperature: number | null;
  relative_humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  air_pressure: number | null;
  uv_index: number | null;
}

// Global client singleton to avoid reopening SQLite file continuously
declare global {
  // eslint-disable-next-line no-var
  var _sqliteDb: Database.Database | undefined;
}

export function getDbClient(): Database.Database {
  if (!global._sqliteDb) {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, "weather.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    global._sqliteDb = db;
    initDatabaseSchema(db);
  }

  return global._sqliteDb;
}

/**
 * Initializes SQLite tables and indexes.
 */
export function initDatabaseSchema(dbInstance?: Database.Database) {
  const db = dbInstance || getDbClient();

  db.exec(`
    CREATE TABLE IF NOT EXISTS weather_stations (
      station_id TEXT PRIMARY KEY,
      station_name TEXT NOT NULL,
      county_name TEXT NOT NULL,
      town_name TEXT,
      latitude REAL,
      longitude REAL,
      altitude REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weather_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL REFERENCES weather_stations(station_id) ON DELETE CASCADE,
      obs_time TEXT NOT NULL,
      weather TEXT,
      air_temperature REAL,
      relative_humidity REAL,
      precipitation REAL,
      wind_speed REAL,
      wind_direction REAL,
      air_pressure REAL,
      uv_index REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT uq_station_obs_time UNIQUE (station_id, obs_time)
    );

    CREATE INDEX IF NOT EXISTS idx_weather_stations_county ON weather_stations(county_name);
    CREATE INDEX IF NOT EXISTS idx_weather_observations_station_time ON weather_observations(station_id, obs_time DESC);
    CREATE INDEX IF NOT EXISTS idx_weather_observations_obs_time ON weather_observations(obs_time DESC);
  `);
}

/**
 * Bulk upserts weather stations inside an atomic transaction.
 */
export function upsertWeatherStations(stations: WeatherStationRecord[]): number {
  if (stations.length === 0) return 0;
  const db = getDbClient();

  const insertStmt = db.prepare(`
    INSERT INTO weather_stations (
      station_id, station_name, county_name, town_name, latitude, longitude, altitude, updated_at
    ) VALUES (
      @station_id, @station_name, @county_name, @town_name, @latitude, @longitude, @altitude, datetime('now')
    )
    ON CONFLICT (station_id) DO UPDATE SET
      station_name = excluded.station_name,
      county_name = excluded.county_name,
      town_name = excluded.town_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      altitude = excluded.altitude,
      updated_at = datetime('now')
  `);

  const runBatch = db.transaction((rows: WeatherStationRecord[]) => {
    for (const row of rows) {
      insertStmt.run(row);
    }
  });

  runBatch(stations);
  return stations.length;
}

/**
 * Bulk inserts weather observations with ON CONFLICT DO NOTHING (prevents duplicates).
 */
export function insertWeatherObservations(
  observations: WeatherObservationRecord[]
): number {
  if (observations.length === 0) return 0;
  const db = getDbClient();

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO weather_observations (
      station_id, obs_time, weather, air_temperature, relative_humidity,
      precipitation, wind_speed, wind_direction, air_pressure, uv_index, created_at
    ) VALUES (
      @station_id, @obs_time, @weather, @air_temperature, @relative_humidity,
      @precipitation, @wind_speed, @wind_direction, @air_pressure, @uv_index, datetime('now')
    )
  `);

  let newlyInserted = 0;
  const runBatch = db.transaction((rows: WeatherObservationRecord[]) => {
    for (const row of rows) {
      const info = insertStmt.run(row);
      if (info.changes > 0) {
        newlyInserted += info.changes;
      }
    }
  });

  runBatch(observations);
  return newlyInserted;
}

/**
 * Minimal query for latest weather observations stored in SQLite.
 */
export function queryLatestWeather(options?: {
  county_name?: string;
  station_id?: string;
  limit?: number;
}): StationLatestWeather[] {
  const db = getDbClient();
  const limit = options?.limit || 500;
  const county = options?.county_name || null;
  const stationId = options?.station_id || null;

  const stmt = db.prepare(`
    SELECT
      s.station_id,
      s.station_name,
      s.county_name,
      s.town_name,
      s.latitude,
      s.longitude,
      s.altitude,
      s.updated_at,
      o.obs_time,
      o.weather,
      o.air_temperature,
      o.relative_humidity,
      o.precipitation,
      o.wind_speed,
      o.wind_direction,
      o.air_pressure,
      o.uv_index
    FROM weather_stations s
    LEFT JOIN weather_observations o ON s.station_id = o.station_id
      AND o.obs_time = (
        SELECT MAX(o2.obs_time)
        FROM weather_observations o2
        WHERE o2.station_id = s.station_id
      )
    WHERE (:county IS NULL OR s.county_name = :county)
      AND (:stationId IS NULL OR s.station_id = :stationId)
    ORDER BY s.station_id
    LIMIT :limit
  `);

  return stmt.all({
    county,
    stationId,
    limit,
  }) as StationLatestWeather[];
}

/**
 * Database health and statistics check.
 */
export function getDatabaseStats() {
  const db = getDbClient();

  const stationsCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM weather_stations")
    .get() as { count: number };

  const observationsCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM weather_observations")
    .get() as { count: number };

  const latestObsRow = db
    .prepare("SELECT obs_time FROM weather_observations ORDER BY obs_time DESC LIMIT 1")
    .get() as { obs_time: string | null } | undefined;

  return {
    connected: true,
    engine: "sqlite",
    stations_count: stationsCountRow?.count || 0,
    observations_count: observationsCountRow?.count || 0,
    latest_obs_time: latestObsRow?.obs_time || null,
  };
}
