import { NextResponse } from "next/server";
import { fetchCWAWeatherStations } from "@/lib/cwa";
import { ingestWeather } from "@/lib/sync";

export const runtime = "nodejs";

// POST /api/sync: Write-only synchronization endpoint (SQLite backend)
export async function POST(request: Request) {
  const startTime = performance.now();

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (limitParam !== null && (!/^\d+$/.test(limitParam) || !Number.isSafeInteger(limit) || limit! < 1 || limit! > 5000)) {
      return NextResponse.json({ success: false, error: "limit must be an integer from 1 to 5000" }, { status: 400 });
    }
    const cwaResult = await fetchCWAWeatherStations(undefined, { limit });
    const result = ingestWeather(cwaResult.stations);
    const elapsedMs = Math.round(performance.now() - startTime);

    return NextResponse.json({
      success: true,
      message: "CWA weather data synchronized to SQLite database",
      engine: "sqlite",
      ...result,
      elapsed_ms: elapsedMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("SQLite database sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error instanceof Error ? error.message : null) || "Failed to synchronize weather data to SQLite database",
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
