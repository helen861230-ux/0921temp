import { getDbClient, upsertWeatherStations, insertWeatherObservations } from "./db.ts";
import type { NormalizedStationData } from "./cwa.ts";

/** One transaction commits both metadata and observations, or rolls everything back. */
export function ingestWeather(stations: NormalizedStationData[]) {
  return getDbClient().transaction(() => {
    const stations_upserted = upsertWeatherStations(stations);
    const observations = stations.filter((s) => s.obs_time);
    const observations_inserted = insertWeatherObservations(observations);
    return {
      stations_upserted,
      observations_inserted,
      duplicates_skipped: observations.length - observations_inserted,
    };
  })();
}
