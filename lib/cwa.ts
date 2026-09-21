export interface CWACoordinate {
  CoordinateName: string;
  CoordinateFormat: string;
  StationLatitude: string;
  StationLongitude: string;
}

export interface CWAGeoInfo {
  Coordinates: CWACoordinate[];
  StationAltitude: string;
  CountyName: string;
  TownName: string;
  CountyCode: string;
  TownCode: string;
}

export interface CWAWeatherElement {
  Weather?: string;
  VisibilityDescription?: string;
  SunshineDuration?: string;
  Now?: {
    Precipitation?: string;
  };
  WindDirection?: string;
  WindSpeed?: string;
  AirTemperature?: string;
  RelativeHumidity?: string;
  AirPressure?: string;
  UVIndex?: string;
  Max10MinAverage?: {
    WindSpeed?: string;
    Occurred_at?: {
      WindDirection?: string;
      DateTime?: string;
    };
  };
  GustInfo?: {
    PeakGustSpeed?: string;
    Occurred_at?: {
      WindDirection?: string;
      DateTime?: string;
    };
  };
  DailyExtreme?: {
    DailyHigh?: {
      TemperatureInfo?: {
        AirTemperature?: string;
        Occurred_at?: {
          DateTime?: string;
        };
      };
    };
    DailyLow?: {
      TemperatureInfo?: {
        AirTemperature?: string;
        Occurred_at?: {
          DateTime?: string;
        };
      };
    };
  };
}

export interface CWAStationRaw {
  StationName: string;
  StationId: string;
  ObsTime: {
    DateTime: string;
  };
  GeoInfo: CWAGeoInfo;
  WeatherElement: CWAWeatherElement;
}

export interface CleanedStation {
  stationId: string;
  stationName: string;
  countyName: string;
  townName: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  obsTime: string;
  weather: string;
  airTemperature: number | null;
  relativeHumidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  airPressure: number | null;
  uvIndex: number | null;
}

/**
 * Normalizes CWA special missing value indicators (-99, -999, etc.)
 */
function parseNum(val: string | undefined): number | null {
  if (val === undefined || val === null || val === "" || val === "-99" || val === "-999" || val === "-99.0") {
    return null;
  }
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export interface NormalizedStationData {
  station_id: string;
  station_name: string;
  county_name: string;
  town_name: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  obs_time: string;
  weather: string;
  air_temperature: number | null;
  relative_humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  air_pressure: number | null;
  uv_index: number | null;
}

/**
 * Converts CWA raw station into consistent snake_case normalized data matching the database schema.
 */
export function normalizeStationData(raw: CWAStationRaw): NormalizedStationData {
  const wgs84 = raw.GeoInfo.Coordinates?.find(
    (c) => c.CoordinateName === "WGS84"
  ) || raw.GeoInfo.Coordinates?.[0];

  return {
    station_id: raw.StationId,
    station_name: raw.StationName,
    county_name: raw.GeoInfo.CountyName || "未知縣市",
    town_name: raw.GeoInfo.TownName || "",
    latitude: wgs84 ? parseNum(wgs84.StationLatitude) : null,
    longitude: wgs84 ? parseNum(wgs84.StationLongitude) : null,
    altitude: parseNum(raw.GeoInfo.StationAltitude),
    obs_time: raw.ObsTime?.DateTime || "",
    weather: raw.WeatherElement.Weather === "-99" ? "正常" : (raw.WeatherElement.Weather || "正常"),
    air_temperature: parseNum(raw.WeatherElement.AirTemperature),
    relative_humidity: parseNum(raw.WeatherElement.RelativeHumidity),
    precipitation: parseNum(raw.WeatherElement.Now?.Precipitation),
    wind_speed: parseNum(raw.WeatherElement.WindSpeed),
    wind_direction: parseNum(raw.WeatherElement.WindDirection),
    air_pressure: parseNum(raw.WeatherElement.AirPressure),
    uv_index: parseNum(raw.WeatherElement.UVIndex),
  };
}


export const cleanStationData = normalizeStationData;

export async function fetchCWAWeatherStations(apiKey?: string, options?: { limit?: number; stationId?: string }) {
  const key = apiKey || process.env.CWA_API_KEY;
  if (!key) {
    throw new Error("Missing CWA API Key. Please set CWA_API_KEY in .env.local");
  }

  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001");
  url.searchParams.set("Authorization", key);
  if (options?.limit) {
    url.searchParams.set("limit", options.limit.toString());
  }
  if (options?.stationId) {
    url.searchParams.set("StationId", options.stationId);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    // Next.js fetch revalidation (cache for 60 seconds)
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`CWA API request failed with status ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawStations: CWAStationRaw[] = data?.records?.Station || [];
  const normalizedStations: NormalizedStationData[] = rawStations.map(normalizeStationData);

  return {
    success: data?.success === "true" || data?.success === true,
    resourceId: data?.result?.resource_id || "O-A0003-001",
    totalCount: normalizedStations.length,
    stations: normalizedStations,
    rawStations: rawStations,
  };
}

