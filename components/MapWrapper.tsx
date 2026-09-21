"use client";

import dynamic from "next/dynamic";
import type { WeatherStationGIS } from "./TaiwanWeatherMap";

const DynamicTaiwanWeatherMap = dynamic(() => import("./TaiwanWeatherMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[640px] rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400">
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
      <span className="text-sm font-medium text-slate-400">
        載入 Leaflet GIS 圖台...
      </span>
    </div>
  ),
});

export interface MapWrapperProps {
  stations: WeatherStationGIS[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  selectedStationId?: string | null;
  onSelectStation?: (station: WeatherStationGIS) => void;
}

export default function MapWrapper(props: MapWrapperProps) {
  return <DynamicTaiwanWeatherMap {...props} />;
}
