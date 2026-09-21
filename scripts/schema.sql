-- Taiwan CWA Weather GIS - Database Schema (PostgreSQL / Supabase)

-- 1. Weather Stations Table (Static/Metadata)
CREATE TABLE IF NOT EXISTS weather_stations (
  station_id VARCHAR(32) PRIMARY KEY,
  station_name VARCHAR(128) NOT NULL,
  county_name VARCHAR(64) NOT NULL,
  town_name VARCHAR(64),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Weather Observations Table (Time-series / Snapshots)
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
);

-- 3. Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_weather_stations_county ON weather_stations(county_name);
CREATE INDEX IF NOT EXISTS idx_weather_observations_station_time ON weather_observations(station_id, obs_time DESC);
CREATE INDEX IF NOT EXISTS idx_weather_observations_obs_time ON weather_observations(obs_time DESC);
