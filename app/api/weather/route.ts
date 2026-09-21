import { NextResponse } from "next/server";
import { queryLatestWeather, getDatabaseStats } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/weather: Minimal backend query endpoint for stored SQLite weather data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const county_name = searchParams.get("county") || undefined;
    const station_id = searchParams.get("station_id") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 500;
    if (searchParams.has("limit") && (!/^\d+$/.test(searchParams.get("limit")!) || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000)) {
      return NextResponse.json({ success: false, error: "limit must be an integer from 1 to 5000" }, { status: 400 });
    }
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
  } catch (error: unknown) {
    console.error("SQLite database query error:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error instanceof Error ? error.message : null) || "Failed to query weather observations from SQLite",
      },
      { status: 500 }
    );
  }
}
