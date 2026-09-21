import fs from "node:fs";
import path from "node:path";

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

async function inspectCWA() {
  loadEnv();
  const apiKey = process.env.CWA_API_KEY;
  console.log("=========================================");
  console.log(" Taiwan CWA Weather GIS - Milestone 1");
  console.log(" Dataset: O-A0003-001 (自動站氣象資料)");
  console.log("=========================================\n");

  if (!apiKey) {
    console.error("❌ ERROR: CWA_API_KEY is not set in .env.local or .env");
    process.exit(1);
  }

  console.log(`🔑 CWA API Key detected: ${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`);
  console.log("📡 Connecting to CWA Open Data API (O-A0003-001)...");

  const startTime = Date.now();
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=${apiKey}&limit=5`;

  try {
    const res = await fetch(url);
    const latency = Date.now() - startTime;
    console.log(` HTTP Status: ${res.status} ${res.statusText} (${latency}ms)`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ CWA API returned error:", errorText);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`✅ Success flag: ${data.success}`);
    console.log(`📦 Resource ID: ${data.result?.resource_id}`);
    
    const stations = data.records?.Station || [];
    console.log(`📍 Retrieved ${stations.length} sample stations (limited to 5):\n`);

    stations.forEach((s, idx) => {
      const wgs84 = s.GeoInfo?.Coordinates?.find(c => c.CoordinateName === "WGS84") || s.GeoInfo?.Coordinates?.[0];
      console.log(`[${idx + 1}] 🏛️  ${s.StationName} (${s.StationId})`);
      console.log(`    📍 Location: ${s.GeoInfo?.CountyName} ${s.GeoInfo?.TownName}`);
      console.log(`    🌐 Coordinates: Lat ${wgs84?.StationLatitude}, Lon ${wgs84?.StationLongitude}, Alt ${s.GeoInfo?.StationAltitude}m`);
      console.log(`    🕒 Time: ${s.ObsTime?.DateTime}`);
      console.log(`    🌡️  Temp: ${s.WeatherElement?.AirTemperature}°C | 💧 Humidity: ${s.WeatherElement?.RelativeHumidity}% | 🌧️ Rain: ${s.WeatherElement?.Now?.Precipitation}mm`);
      console.log(`    💨 Wind: ${s.WeatherElement?.WindSpeed} m/s (Direction: ${s.WeatherElement?.WindDirection}°)`);
      console.log("");
    });

    console.log("✨ Milestone 1 CWA API connection and verification completed successfully!");
  } catch (err) {
    console.error("❌ Failed to request CWA API:", err);
    process.exit(1);
  }
}

inspectCWA();
