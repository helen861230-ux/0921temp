"use client";

import { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface WeatherStationGIS {
  station_id: string;
  station_name: string;
  county_name: string;
  town_name: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  obs_time: string | null;
  weather: string | null;
  air_temperature: number | null;
  relative_humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  air_pressure: number | null;
  uv_index: number | null;
}

interface TaiwanWeatherMapProps {
  stations: WeatherStationGIS[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  selectedStationId?: string | null;
  onSelectStation?: (station: WeatherStationGIS) => void;
}

/**
 * Returns color hex according to air temperature (Taiwan weather scale)
 */
function getTemperatureColor(temp: number | null): string {
  if (temp === null || isNaN(temp)) return "#64748b"; // Slate 500
  if (temp >= 32) return "#ef4444"; // Red 500 (Very Hot)
  if (temp >= 28) return "#f97316"; // Orange 500 (Hot)
  if (temp >= 24) return "#eab308"; // Yellow 500 (Warm)
  if (temp >= 20) return "#10b981"; // Emerald 500 (Mild)
  if (temp >= 15) return "#06b6d4"; // Cyan 500 (Cool)
  return "#3b82f6"; // Blue 500 (Cold)
}

/**
 * Creates custom circular Leaflet HTML DivIcon showing temperature badge
 */
function createStationMarkerIcon(station: WeatherStationGIS, isSelected: boolean) {
  const color = getTemperatureColor(station.air_temperature);
  const tempDisplay =
    station.air_temperature !== null
      ? `${Math.round(station.air_temperature)}°`
      : "--";

  const borderColor = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.4)";
  const ringStyle = isSelected ? "ring-4 ring-indigo-400 scale-110" : "";

  const html = `
    <div style="
      background-color: ${color};
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 700;
      font-size: 11px;
      width: 32px;
      height: 32px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid ${borderColor};
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      transition: transform 0.15s ease-in-out;
    " class="${ringStyle}">
      ${tempDisplay}
    </div>
  `;

  return L.divIcon({
    html,
    className: "cwa-weather-station-marker",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

export default function TaiwanWeatherMap({
  stations,
  loading,
  error,
  onRetry,
  selectedStationId,
  onSelectStation,
}: TaiwanWeatherMapProps) {
  const [activeStation, setActiveStation] = useState<WeatherStationGIS | null>(null);

  // Filter valid coordinates (Taiwan bounding box: lat 20.5~26.5, lon 118.0~123.0)
  const { validStations, invalidCount } = useMemo(() => {
    let invalid = 0;
    const valid = stations.filter((s) => {
      const lat = s.latitude;
      const lon = s.longitude;
      const isValid =
        typeof lat === "number" &&
        typeof lon === "number" &&
        !isNaN(lat) &&
        !isNaN(lon) &&
        lat >= 20.0 &&
        lat <= 27.0 &&
        lon >= 118.0 &&
        lon <= 123.5;

      if (!isValid) {
        invalid++;
      }
      return isValid;
    });

    return { validStations: valid, invalidCount: invalid };
  }, [stations]);

  // Center on Taiwan
  const taiwanCenter: [number, number] = [23.75, 120.95];
  const initialZoom = 7.5;

  return (
    <div className="relative w-full h-[640px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <svg
            className="animate-spin h-8 w-8 text-indigo-400"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm font-medium text-slate-300">
            載入 PostgreSQL 測站空間資料...
          </span>
        </div>
      )}

      {/* Error Overlay */}
      {error && !loading && (
        <div className="absolute inset-0 z-[1000] bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-rose-400 text-3xl mb-2">⚠️</div>
          <h3 className="text-base font-bold text-white mb-1">
            GIS 資料載入失敗
          </h3>
          <p className="text-xs text-rose-300/90 max-w-md mb-4">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              重新查詢 (/api/weather)
            </button>
          )}
        </div>
      )}

      {/* Empty State Overlay */}
      {!loading && !error && validStations.length === 0 && (
        <div className="absolute inset-0 z-[1000] bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-indigo-400 text-3xl mb-2">📡</div>
          <h3 className="text-base font-bold text-white mb-1">
            PostgreSQL 資料庫目前尚無測站觀測資料
          </h3>
          <p className="text-xs text-slate-400 max-w-md mb-4">
            請點選上方開發管理工具的「立即執行寫入同步 (POST /api/sync)」以從 CWA 擷取並儲存即時氣象資料。
          </p>
        </div>
      )}

      {/* Map Control Bar / Legend */}
      <div className="absolute top-3 right-3 z-[900] bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-lg text-xs space-y-2 pointer-events-auto">
        <div className="flex items-center justify-between gap-4 font-semibold text-white">
          <span>氣候地圖圖例</span>
          <span className="text-[10px] text-slate-400 font-normal">氣溫 (°C)</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="flex items-center gap-1 text-blue-400">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> &lt;15°
          </span>
          <span className="flex items-center gap-1 text-cyan-400">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" /> 15-20°
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 20-24°
          </span>
          <span className="flex items-center gap-1 text-yellow-400">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> 24-28°
          </span>
          <span className="flex items-center gap-1 text-orange-400">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> 28-32°
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> &ge;32°
          </span>
        </div>
        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
          <span>標記測站: {validStations.length} 站</span>
          {invalidCount > 0 && (
            <span className="text-amber-400">略過無效座標: {invalidCount} 筆</span>
          )}
        </div>
      </div>

      {/* Leaflet Map */}
      <MapContainer
        center={taiwanCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validStations.map((station) => {
          const isSelected =
            selectedStationId === station.station_id ||
            activeStation?.station_id === station.station_id;

          return (
            <Marker
              key={station.station_id}
              position={[station.latitude!, station.longitude!]}
              icon={createStationMarkerIcon(station, isSelected)}
              eventHandlers={{
                click: () => {
                  setActiveStation(station);
                  if (onSelectStation) {
                    onSelectStation(station);
                  }
                },
              }}
            >
              <Popup className="cwa-station-popup">
                <div className="p-1 text-slate-900 text-xs min-w-[220px]">
                  {/* Station Name and ID */}
                  <div className="flex items-center justify-between border-b pb-1 mb-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">
                        {station.station_name}
                      </h4>
                      <div className="text-[11px] text-slate-500">
                        {station.county_name} {station.town_name || ""}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border">
                      {station.station_id}
                    </span>
                  </div>

                  {/* Telemetry Metrics */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] my-2">
                    <div>
                      <span className="text-slate-500">氣溫:</span>{" "}
                      <strong className="text-slate-900">
                        {station.air_temperature !== null
                          ? `${station.air_temperature} °C`
                          : "--"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">相對濕度:</span>{" "}
                      <strong className="text-slate-900">
                        {station.relative_humidity !== null
                          ? `${station.relative_humidity} %`
                          : "--"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">累積降雨:</span>{" "}
                      <strong className="text-slate-900">
                        {station.precipitation !== null
                          ? `${station.precipitation} mm`
                          : "--"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">風速:</span>{" "}
                      <strong className="text-slate-900">
                        {station.wind_speed !== null
                          ? `${station.wind_speed} m/s`
                          : "--"}
                      </strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">測站海拔:</span>{" "}
                      <strong className="text-slate-900">
                        {station.altitude !== null ? `${station.altitude} m` : "--"}
                      </strong>
                    </div>
                  </div>

                  {/* Observation Timestamp */}
                  <div className="border-t pt-1.5 text-[10px] text-slate-500">
                    <div>
                      觀測時間:{" "}
                      <span className="font-mono text-slate-700">
                        {station.obs_time || "--"}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
