import { NextResponse } from "next/server";
import { fetchCWAWeatherStations, normalizeStationData } from "@/lib/cwa";
import {
  initDatabaseSchema,
  upsertWeatherStations,
  insertWeatherObservations,
  WeatherStationRecord,
  WeatherObservationRecord,
} from "@/lib/db";

// POST /api/sync: Write-only synchronization endpoint (SQLite backend)
export async function POST(request: Request) {
  const startTime = performance.now();

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    // 1. Ensure SQLite database schema and constraints exist
    initDatabaseSchema();

    // 2. Fetch latest data from CWA dataset O-A0003-001
    const cwaResult = await fetchCWAWeatherStations(process.env.CWA_API_KEY, {
      limit,
    });

    const rawStations = cwaResult.rawStations;
    const normalizedList = rawStations.map(normalizeStationData);

    // 3. Prepare station metadata records
    const stationsToUpsert: WeatherStationRecord[] = normalizedList.map((s) => ({
      station_id: s.station_id,
      station_name: s.station_name,
      county_name: s.county_name,
      town_name: s.town_name || null,
      latitude: s.latitude,
      longitude: s.longitude,
      altitude: s.altitude,
    }));

    // 4. Prepare observation time-series records
    const observationsToInsert: WeatherObservationRecord[] = normalizedList
      .filter((s) => s.obs_time)
      .map((s) => ({
        station_id: s.station_id,
        obs_time: s.obs_time,
        weather: s.weather,
        air_temperature: s.air_temperature,
        relative_humidity: s.relative_humidity,
        precipitation: s.precipitation,
        wind_speed: s.wind_speed,
        wind_direction: s.wind_direction,
        air_pressure: s.air_pressure,
        uv_index: s.uv_index,
      }));

    // 5. Upsert stations into weather_stations
    const stationsUpsertedCount = upsertWeatherStations(stationsToUpsert);

    // 6. Insert observations with ON CONFLICT DO NOTHING (prevents duplicates)
    const observationsInsertedCount = insertWeatherObservations(observationsToInsert);

    const duplicatesSkipped =
      observationsToInsert.length - observationsInsertedCount;
    const elapsedMs = Math.round(performance.now() - startTime);

    return NextResponse.json({
      success: true,
      message: "CWA weather data synchronized to SQLite database",
      engine: "sqlite",
      stations_upserted: stationsUpsertedCount,
      observations_inserted: observationsInsertedCount,
      duplicates_skipped: duplicatesSkipped,
      elapsed_ms: elapsedMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("SQLite database sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to synchronize weather data to SQLite database",
      },
      { status: 500 }
    );
  }
}

// Explicitly reject GET requests to uphold write-only requirement
export async function GET() {
  return NextResponse.json(
    {
      error: "Method Not Allowed. /api/sync is write-only; use POST to trigger synchronization.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
