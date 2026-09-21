-- SQLite schema; keep aligned with lib/db.ts
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
