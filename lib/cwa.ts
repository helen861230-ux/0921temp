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

export function cleanStationData(raw: CWAStationRaw): CleanedStation {
  const wgs84 = raw.GeoInfo.Coordinates.find(
    (c) => c.CoordinateName === "WGS84"
  ) || raw.GeoInfo.Coordinates[0];

  return {
    stationId: raw.StationId,
    stationName: raw.StationName,
    countyName: raw.GeoInfo.CountyName || "未知縣市",
    townName: raw.GeoInfo.TownName || "",
    latitude: wgs84 ? parseNum(wgs84.StationLatitude) : null,
    longitude: wgs84 ? parseNum(wgs84.StationLongitude) : null,
    altitude: parseNum(raw.GeoInfo.StationAltitude),
    obsTime: raw.ObsTime?.DateTime || "",
    weather: raw.WeatherElement.Weather === "-99" ? "正常" : (raw.WeatherElement.Weather || "正常"),
    airTemperature: parseNum(raw.WeatherElement.AirTemperature),
    relativeHumidity: parseNum(raw.WeatherElement.RelativeHumidity),
    precipitation: parseNum(raw.WeatherElement.Now?.Precipitation),
    windSpeed: parseNum(raw.WeatherElement.WindSpeed),
    windDirection: parseNum(raw.WeatherElement.WindDirection),
    airPressure: parseNum(raw.WeatherElement.AirPressure),
    uvIndex: parseNum(raw.WeatherElement.UVIndex),
  };
}

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
  const cleanedStations = rawStations.map(cleanStationData);

  return {
    success: data?.success === "true" || data?.success === true,
    resourceId: data?.result?.resource_id || "O-A0003-001",
    totalCount: cleanedStations.length,
    stations: cleanedStations,
    rawStations: rawStations,
  };
}
