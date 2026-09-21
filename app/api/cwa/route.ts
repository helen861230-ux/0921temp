import { NextResponse } from "next/server";
import { fetchCWAWeatherStations } from "@/lib/cwa";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const stationId = searchParams.get("stationId") || undefined;
    const county = searchParams.get("county") || undefined;
    const includeRaw = searchParams.get("raw") === "true";

    const result = await fetchCWAWeatherStations(process.env.CWA_API_KEY, {
      limit,
      stationId,
    });

    let filteredStations = result.stations;
    if (county) {
      filteredStations = filteredStations.filter((s) =>
        s.county_name.includes(county)
      );
    }

    return NextResponse.json({
      success: true,
      dataset: result.resourceId,
      timestamp: new Date().toISOString(),
      count: filteredStations.length,
      stations: filteredStations,
      rawSample: includeRaw ? result.rawStations.slice(0, 3) : undefined,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch CWA data:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error instanceof Error ? error.message : null) || "Unknown error occurred while querying CWA API",
      },
      { status: 500 }
    );
  }
}
