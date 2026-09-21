"use client";

import { useEffect, useState, useMemo } from "react";
import { CleanedStation } from "@/lib/cwa";

interface ApiResponse {
  success: boolean;
  dataset: string;
  timestamp: string;
  count: number;
  stations: CleanedStation[];
  error?: string;
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [selectedCounty, setSelectedCounty] = useState<string>("全部");
  const [selectedStation, setSelectedStation] = useState<CleanedStation | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "json">("cards");
  const [fetchLatency, setFetchLatency] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const res = await fetch("/api/cwa?limit=100&raw=true");
      const elapsed = Math.round(performance.now() - start);
      setFetchLatency(elapsed);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to load CWA data");
      }
      setData(json);
      if (json.stations && json.stations.length > 0) {
        setSelectedStation(json.stations[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to CWA API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const counties = useMemo(() => {
    if (!data?.stations) return ["全部"];
    const set = new Set<string>();
    data.stations.forEach((s) => {
      if (s.countyName) set.add(s.countyName);
    });
    return ["全部", ...Array.from(set)];
  }, [data]);

  const filteredStations = useMemo(() => {
    if (!data?.stations) return [];
    return data.stations.filter((s) => {
      const matchesCounty =
        selectedCounty === "全部" || s.countyName === selectedCounty;
      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        s.stationName.toLowerCase().includes(query) ||
        s.stationId.toLowerCase().includes(query) ||
        s.townName.toLowerCase().includes(query) ||
        s.countyName.toLowerCase().includes(query);
      return matchesCounty && matchesSearch;
    });
  }, [data, selectedCounty, search]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Milestone 1 Complete
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Dataset: O-A0003-001
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
              Taiwan CWA Weather GIS
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              自動站氣象資料觀測與 API 驗證介面 (Central Weather Administration Open Data API)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>更新中...</span>
                </>
              ) : (
                <>
                  <span>重新擷取資料</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Status Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400">連線狀態</div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500 animate-pulse"}`} />
              <span className="text-lg font-bold text-white">
                {error ? "連線異常" : "連線正常 (200 OK)"}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              API 端點: <code className="text-slate-300">/api/cwa</code>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400">已取得測站數</div>
            <div className="mt-2 text-2xl font-bold text-white">
              {data ? `${data.count} 站` : "--"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              符合篩選: {filteredStations.length} 站
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400">觀測資料時間</div>
            <div className="mt-2 text-sm font-semibold text-slate-200 truncate">
              {data?.stations?.[0]?.obsTime || "--"}
            </div>
            <div className="text-xs text-slate-500 mt-1">臺灣中央氣象署標準時區</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-400">API 回應延遲</div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">
              {fetchLatency !== null ? `${fetchLatency} ms` : "--"}
            </div>
            <div className="text-xs text-slate-500 mt-1">Next.js Edge / Serverless Proxy</div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-950/40 border border-rose-800 text-rose-300 p-4 rounded-xl flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-rose-200">無法連線至 CWA 氣象資料庫</p>
              <p className="text-xs mt-1 text-rose-300/80">{error}</p>
              <p className="text-xs mt-2 text-slate-400">
                請確認 <code className="text-slate-200">.env.local</code> 中的{" "}
                <code className="text-slate-200">CWA_API_KEY</code> 是否有效。
              </p>
            </div>
          </div>
        )}

        {/* Controls and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="搜尋測站名稱、站號或鄉鎮..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-64"
            />
            <select
              value={selectedCounty}
              onChange={(e) => setSelectedCounty(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "cards"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              測站卡片檢視
            </button>
            <button
              onClick={() => setViewMode("json")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "json"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              原始 JSON 檢視
            </button>
          </div>
        </div>

        {/* View Mode Content */}
        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStations.map((station) => {
              const isSelected = selectedStation?.stationId === station.stationId;
              return (
                <div
                  key={station.stationId}
                  onClick={() => setSelectedStation(station)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 bg-slate-900/50 hover:bg-slate-900/90 ${
                    isSelected
                      ? "border-blue-500/80 shadow-md shadow-blue-500/10"
                      : "border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">
                          {station.stationName}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {station.stationId}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        📍 {station.countyName} {station.townName}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-blue-400">
                        {station.airTemperature !== null
                          ? `${station.airTemperature}°`
                          : "--"}
                      </span>
                      <div className="text-[10px] text-slate-500">氣溫</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs">
                    <div>
                      <span className="text-slate-500">相對濕度</span>
                      <p className="font-semibold text-slate-300 mt-0.5">
                        {station.relativeHumidity !== null
                          ? `${station.relativeHumidity}%`
                          : "--"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">累積降雨</span>
                      <p className="font-semibold text-slate-300 mt-0.5">
                        {station.precipitation !== null
                          ? `${station.precipitation} mm`
                          : "--"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">風速 / 風向</span>
                      <p className="font-semibold text-slate-300 mt-0.5">
                        {station.windSpeed !== null
                          ? `${station.windSpeed} m/s`
                          : "--"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] text-slate-500 flex justify-between items-center font-mono">
                    <span>
                      WGS84: {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
                    </span>
                    <span>海拔: {station.altitude ?? "--"}m</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-400 font-mono">
              <span>GET /api/cwa Response JSON</span>
              <span>Dataset: O-A0003-001</span>
            </div>
            <pre className="p-4 text-xs font-mono text-emerald-400/90 bg-slate-950 rounded-lg overflow-x-auto max-h-[600px]">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
