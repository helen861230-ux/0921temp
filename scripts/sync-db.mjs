import nextEnv from "@next/env";
import { fetchCWAWeatherStations } from "../lib/cwa.ts";
import { getDbClient, getDatabaseStats } from "../lib/db.ts";
import { ingestWeather } from "../lib/sync.ts";

nextEnv.loadEnvConfig(process.cwd());
try {
  const result = await fetchCWAWeatherStations();
  console.log("SQLite sync:", ingestWeather(result.stations));
  console.log("Database:", getDatabaseStats());
} catch (error) {
  console.error(error instanceof Error ? error.message : "Sync failed");
  process.exitCode = 1;
} finally {
  if (global._sqliteDb) getDbClient().close();
}
