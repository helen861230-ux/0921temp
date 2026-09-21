import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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

  console.log("=========================================================");
  console.log(" Taiwan CWA Weather GIS - SQLite Database Sync & Test");
  console.log("=========================================================\n");

  if (!apiKey) {
    console.error("❌ ERROR: CWA_API_KEY is not set in .env.local");
    process.exit(1);
  }

  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "weather.db");
  console.log(`📁 Local SQLite Database File: ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  try {
    // 1. Initialize schema
    console.log("🛠️  Ensuring SQLite tables and indexes...");
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
    console.log("✅ Tables `weather_stations` and `weather_observations` are ready.");

    // 2. Fetch CWA data
    console.log("\n📡 Fetching CWA dataset O-A0003-001...");
    const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=${apiKey}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CWA API failed with status ${res.status}`);
    }
    const cwaJson = await res.json();
    const rawStations = cwaJson.records?.Station || [];
    console.log(`📥 Fetched ${rawStations.length} station records from CWA.`);

    // 3. Normalize records
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

    // 4. Upsert stations into weather_stations
    console.log(`💾 Upserting ${stationsToUpsert.length} stations into SQLite...`);
    const upsertStationStmt = db.prepare(`
      INSERT INTO weather_stations (
        station_id, station_name, county_name, town_name, latitude, longitude, altitude, updated_at
      ) VALUES (
        @station_id, @station_name, @county_name, @town_name, @latitude, @longitude, @altitude, datetime('now')
      )
      ON CONFLICT(station_id) DO UPDATE SET
        station_name = excluded.station_name,
        county_name = excluded.county_name,
        town_name = excluded.town_name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        altitude = excluded.altitude,
        updated_at = datetime('now')
    `);

    const runStationsBatch = db.transaction((rows) => {
      for (const row of rows) {
        upsertStationStmt.run(row);
      }
    });
    runStationsBatch(stationsToUpsert);

    // 5. Insert observations (Run 1)
    console.log(`📊 Inserting observations into SQLite (Run 1)...`);
    const insertObsStmt = db.prepare(`
      INSERT OR IGNORE INTO weather_observations (
        station_id, obs_time, weather, air_temperature, relative_humidity,
        precipitation, wind_speed, wind_direction, air_pressure, uv_index, created_at
      ) VALUES (
        @station_id, @obs_time, @weather, @air_temperature, @relative_humidity,
        @precipitation, @wind_speed, @wind_direction, @air_pressure, @uv_index, datetime('now')
      )
    `);

    let run1Inserted = 0;
    const runObsBatch1 = db.transaction((rows) => {
      for (const row of rows) {
        const info = insertObsStmt.run(row);
        if (info.changes > 0) run1Inserted += info.changes;
      }
    });
    runObsBatch1(observationsToInsert);
    console.log(`✅ Run 1 inserted: ${run1Inserted} observations.`);

    // 6. Test idempotency (Run 2: identical batch)
    console.log(`🔁 Testing idempotency by inserting identical batch again (Run 2)...`);
    let run2Inserted = 0;
    const runObsBatch2 = db.transaction((rows) => {
      for (const row of rows) {
        const info = insertObsStmt.run(row);
        if (info.changes > 0) run2Inserted += info.changes;
      }
    });
    runObsBatch2(observationsToInsert);
    console.log(`✅ Run 2 inserted: ${run2Inserted} observations (Skipped ${observationsToInsert.length - run2Inserted} duplicates).`);

    if (run2Inserted === 0) {
      console.log("🎉 SUCCESS: Duplicate prevention verified! Exactly 0 duplicate rows created.");
    } else {
      console.warn("⚠️ Warning: Duplicate rows were inserted.");
    }

    // 7. Print summary
    const stationsCount = db.prepare("SELECT COUNT(*) AS c FROM weather_stations").get().c;
    const obsCount = db.prepare("SELECT COUNT(*) AS c FROM weather_observations").get().c;
    console.log(`\n📈 Local SQLite Totals:`);
    console.log(`   - Total Stations: ${stationsCount}`);
    console.log(`   - Total Observations: ${obsCount}`);

  } catch (err) {
    console.error("❌ SQLite operation failed:", err);
    process.exit(1);
  } finally {
    db.close();
  }
}

runSync();
