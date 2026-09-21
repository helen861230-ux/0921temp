import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const f of envFiles) {
    const fullPath = path.resolve(process.cwd(), f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [k, ...rest] = trimmed.split("=");
          const v = rest.join("=").trim().replace(/^['"](.*)['"]$/, "$1");
          if (!process.env[k.trim()]) {
            process.env[k.trim()] = v;
          }
        }
      }
    }
  }
}

function parseNum(val) {
  if (val === undefined || val === null || val === "" || val === "-99" || val === "-999" || val === "-99.0") {
    return null;
  }
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function runSync() {
  loadEnv();
  const apiKey = process.env.CWA_API_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  console.log("==================================================");
  console.log(" Taiwan CWA Weather GIS - Milestone 2 Sync Script");
  console.log("==================================================\n");

  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL is not set in .env.local");
    console.error("Please add your Supabase connection string to .env.local:");
    console.error('DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres"');
    process.exit(1);
  }

  if (!apiKey) {
    console.error("❌ ERROR: CWA_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log(`🔌 Connecting to Supabase PostgreSQL...`);
  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("localhost") ? false : "require",
    max: 5,
    connect_timeout: 10,
  });

  try {
    // 1. Run migrations / ensure schema
    console.log("🛠️  Ensuring database schema and constraints...");
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

    await sql`CREATE INDEX IF NOT EXISTS idx_weather_stations_county ON weather_stations(county_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_weather_observations_station_time ON weather_observations(station_id, obs_time DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_weather_observations_obs_time ON weather_observations(obs_time DESC)`;

    console.log("✅ Schema verified (tables `weather_stations`, `weather_observations` and constraints ready).");

    // 2. Fetch CWA data
    console.log("\n📡 Fetching CWA dataset O-A0003-001...");
    const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=${apiKey}&limit=20`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CWA API failed with status ${res.status}`);
    }
    const cwaJson = await res.json();
    const rawStations = cwaJson.records?.Station || [];
    console.log(`📥 Fetched ${rawStations.length} station records.`);

    // 3. Normalize data
    const stationsToUpsert = [];
    const observationsToInsert = [];

    for (const raw of rawStations) {
      const wgs84 = raw.GeoInfo?.Coordinates?.find(c => c.CoordinateName === "WGS84") || raw.GeoInfo?.Coordinates?.[0];
      const station_id = raw.StationId;
      const station_name = raw.StationName;
      const county_name = raw.GeoInfo?.CountyName || "未知縣市";
      const town_name = raw.GeoInfo?.TownName || null;
      const latitude = wgs84 ? parseNum(wgs84.StationLatitude) : null;
      const longitude = wgs84 ? parseNum(wgs84.StationLongitude) : null;
      const altitude = parseNum(raw.GeoInfo?.StationAltitude);
      const obs_time = raw.ObsTime?.DateTime;

      stationsToUpsert.push({
        station_id,
        station_name,
        county_name,
        town_name,
        latitude,
        longitude,
        altitude,
      });

      if (obs_time) {
        observationsToInsert.push({
          station_id,
          obs_time,
          weather: raw.WeatherElement?.Weather === "-99" ? "正常" : (raw.WeatherElement?.Weather || "正常"),
          air_temperature: parseNum(raw.WeatherElement?.AirTemperature),
          relative_humidity: parseNum(raw.WeatherElement?.RelativeHumidity),
          precipitation: parseNum(raw.WeatherElement?.Now?.Precipitation),
          wind_speed: parseNum(raw.WeatherElement?.WindSpeed),
          wind_direction: parseNum(raw.WeatherElement?.WindDirection),
          air_pressure: parseNum(raw.WeatherElement?.AirPressure),
          uv_index: parseNum(raw.WeatherElement?.UVIndex),
        });
      }
    }

    // 4. Upsert stations
    console.log(`💾 Upserting ${stationsToUpsert.length} stations...`);
    await sql`
      INSERT INTO weather_stations ${sql(
        stationsToUpsert,
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

    // 5. Insert observations (First run)
    console.log(`📊 Inserting observations (Run 1)...`);
    const inserted1 = await sql`
      INSERT INTO weather_observations ${sql(
        observationsToInsert,
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
    console.log(`✅ Run 1 inserted: ${inserted1.length} observations.`);

    // 6. Idempotency test (Run 2: identical observations)
    console.log(`🔁 Testing idempotency by inserting identical batch again (Run 2)...`);
    const inserted2 = await sql`
      INSERT INTO weather_observations ${sql(
        observationsToInsert,
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
    console.log(`✅ Run 2 inserted: ${inserted2.length} observations (Skipped ${observationsToInsert.length - inserted2.length} duplicates).`);

    if (inserted2.length === 0) {
      console.log("🎉 SUCCESS: Duplicate prevention verified! 0 duplicate rows created.");
    } else {
      console.warn("⚠️ Warning: Duplicate rows were inserted.");
    }

    const [totalStations] = await sql`SELECT COUNT(*)::int AS count FROM weather_stations`;
    const [totalObs] = await sql`SELECT COUNT(*)::int AS count FROM weather_observations`;
    console.log(`\n📈 Database Totals:`);
    console.log(`   - Total Stations: ${totalStations.count}`);
    console.log(`   - Total Observations: ${totalObs.count}`);

  } catch (err) {
    console.error("❌ Database operation failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runSync();
