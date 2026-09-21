import { NextResponse } from "next/server";
import { queryLatestWeather, getDatabaseStats } from "@/lib/db";

// GET /api/weather: Minimal backend query endpoint for stored SQLite weather data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const county_name = searchParams.get("county") || undefined;
    const station_id = searchParams.get("station_id") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 500;
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = getDatabaseStats();
      return NextResponse.json({
        success: true,
        stats,
      });
    }

    const stations = queryLatestWeather({
      county_name,
      station_id,
      limit,
    });

    return NextResponse.json({
      success: true,
      source: "sqlite",
      count: stations.length,
      stations,
    });
  } catch (error: any) {
    console.error("SQLite database query error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to query weather observations from SQLite",
      },
      { status: 500 }
    );
  }
}
