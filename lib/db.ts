import postgres from "postgres";

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

// Global client singleton to avoid exhausting connections in development hot reload
declare global {
  // eslint-disable-next-line no-var
  var _sqlClient: postgres.Sql | undefined;
}

export function getDbClient(): postgres.Sql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL in environment. Please add DATABASE_URL=<supabase_postgresql_connection_string> to .env.local"
    );
  }

  if (!global._sqlClient) {
    global._sqlClient = postgres(databaseUrl, {
      ssl: databaseUrl.includes("localhost") ? false : "require",
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return global._sqlClient;
}

/**
 * Initializes tables and indexes if they do not already exist.
 */
export async function initDatabaseSchema() {
  const sql = getDbClient();

  await sql`
    CREATE TABLE IF NOT EXISTS weather_stations (
      station_id VARCHAR(32) PRIMARY KEY,
      station_name VARCHAR(128) NOT NULL,
      county_name VARCHAR(64) NOT NULL,
      town_name VARCHAR(64),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      altitude DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS weather_observations (
      id BIGSERIAL PRIMARY KEY,
      station_id VARCHAR(32) NOT NULL REFERENCES weather_stations(station_id) ON DELETE CASCADE,
      obs_time TIMESTAMPTZ NOT NULL,
      weather VARCHAR(64),
      air_temperature DOUBLE PRECISION,
      relative_humidity DOUBLE PRECISION,
      precipitation DOUBLE PRECISION,
      wind_speed DOUBLE PRECISION,
      wind_direction DOUBLE PRECISION,
      air_pressure DOUBLE PRECISION,
      uv_index DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_station_obs_time UNIQUE (station_id, obs_time)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_weather_stations_county ON weather_stations(county_name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_weather_observations_station_time ON weather_observations(station_id, obs_time DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_weather_observations_obs_time ON weather_observations(obs_time DESC)
  `;
}

/**
 * Bulk upserts weather stations.
 */
export async function upsertWeatherStations(stations: WeatherStationRecord[]) {
  if (stations.length === 0) return 0;
  const sql = getDbClient();

  // Perform batch upsert
  await sql`
    INSERT INTO weather_stations ${sql(
      stations,
      "station_id",
      "station_name",
      "county_name",
      "town_name",
      "latitude",
      "longitude",
      "altitude"
    )}
    ON CONFLICT (station_id) DO UPDATE SET
      station_name = EXCLUDED.station_name,
      county_name = EXCLUDED.county_name,
      town_name = EXCLUDED.town_name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      altitude = EXCLUDED.altitude,
      updated_at = NOW()
  `;

  return stations.length;
}

/**
 * Bulk inserts weather observations.
 * ON CONFLICT (station_id, obs_time) DO NOTHING guarantees idempotency (no duplicates).
 */
export async function insertWeatherObservations(
  observations: WeatherObservationRecord[]
) {
  if (observations.length === 0) return 0;
  const sql = getDbClient();

  const inserted = await sql`
    INSERT INTO weather_observations ${sql(
      observations,
      "station_id",
      "obs_time",
      "weather",
      "air_temperature",
      "relative_humidity",
      "precipitation",
      "wind_speed",
      "wind_direction",
      "air_pressure",
      "uv_index"
    )}
    ON CONFLICT (station_id, obs_time) DO NOTHING
    RETURNING id
  `;

  return inserted.length;
}

/**
 * Minimal query for latest weather observations stored in the database.
 */
export async function queryLatestWeather(options?: {
  county_name?: string;
  station_id?: string;
  limit?: number;
}): Promise<StationLatestWeather[]> {
  const sql = getDbClient();
  const limit = options?.limit || 100;

  let query = sql`
    SELECT DISTINCT ON (s.station_id)
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
    WHERE 1=1
  `;

  if (options?.county_name) {
    query = sql`${query} AND s.county_name = ${options.county_name}`;
  }

  if (options?.station_id) {
    query = sql`${query} AND s.station_id = ${options.station_id}`;
  }

  query = sql`
    ${query}
    ORDER BY s.station_id, o.obs_time DESC NULLS LAST
    LIMIT ${limit}
  `;

  const rows = await query;
  return rows as unknown as StationLatestWeather[];
}

/**
 * Database health and statistics check.
 */
export async function getDatabaseStats() {
  const sql = getDbClient();

  const [stationsCount] = await sql`SELECT COUNT(*)::int AS count FROM weather_stations`;
  const [observationsCount] = await sql`SELECT COUNT(*)::int AS count FROM weather_observations`;
  const [latestObs] = await sql`
    SELECT obs_time FROM weather_observations ORDER BY obs_time DESC LIMIT 1
  `;

  return {
    connected: true,
    stations_count: stationsCount?.count || 0,
    observations_count: observationsCount?.count || 0,
    latest_obs_time: latestObs?.obs_time || null,
  };
}
