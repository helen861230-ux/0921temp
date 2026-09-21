import { NextResponse } from "next/server";
import { queryLatestWeather, getDatabaseStats } from "@/lib/db";

// GET /api/weather: Minimal backend query endpoint for stored weather data
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_URL is not configured in .env.local",
      },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const county_name = searchParams.get("county") || undefined;
    const station_id = searchParams.get("station_id") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 100;
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = await getDatabaseStats();
      return NextResponse.json({
        success: true,
        stats,
      });
    }

    const stations = await queryLatestWeather({
      county_name,
      station_id,
      limit,
    });

    return NextResponse.json({
      success: true,
      source: "supabase_postgresql",
      count: stations.length,
      stations,
    });
  } catch (error: any) {
    console.error("Database query error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to query weather observations from database",
      },
      { status: 500 }
    );
  }
}
