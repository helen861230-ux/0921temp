"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import MapWrapper from "@/components/MapWrapper";
import type { WeatherStationGIS } from "@/components/TaiwanWeatherMap";

interface DatabaseStats {
  connected: boolean;
  stations_count: number;
  observations_count: number;
  latest_obs_time: string | null;
}

interface SyncResult {
  success: boolean;
  message?: string;
  stations_upserted?: number;
  observations_inserted?: number;
  duplicates_skipped?: number;
  elapsed_ms?: number;
  error?: string;
}

export default function Home() {
  const [viewMode, setViewMode] = useState<"map" | "cards" | "json">("map");
  const [dataSource, setDataSource] = useState<"cwa_live" | "sqlite_db">("sqlite_db");
  const [stations, setStations] = useState<WeatherStationGIS[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [selectedCounty, setSelectedCounty] = useState<string>("全部");
  const [selectedStation, setSelectedStation] = useState<WeatherStationGIS | null>(null);
  const [fetchLatency, setFetchLatency] = useState<number | null>(null);

  const requestId = useRef(0);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);

  // Admin / Dev Tooling State
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [dbAvailable, setDbAvailable] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showAdminTools, setShowAdminTools] = useState<boolean>(true);

  // Check Database Status
  const checkDbStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/weather?stats=true");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.stats) {
          setDbStats(json.stats);
          setDbAvailable(true);
        }
      } else {
        setDbAvailable(false);
      }
    } catch {
      setDbAvailable(false);
    }
  }, []);

  // Fetch weather data. For GIS map, strictly query /api/weather.
  const loadData = useCallback(async (source: "cwa_live" | "sqlite_db", mode: "map" | "cards" | "json") => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      // Per Milestone 3 constraint: GIS Map must strictly query /api/weather
      const endpoint =
        mode === "map" || source === "sqlite_db"
          ? "/api/weather?limit=500"
          : "/api/cwa?limit=100";

      const res = await fetch(endpoint);
      if (currentRequest !== requestId.current) return;
      const elapsed = Math.round(performance.now() - start);
      setFetchLatency(elapsed);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error! status: ${res.status}`);
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to load data");
      }

      if (currentRequest !== requestId.current) return;
      const items: WeatherStationGIS[] = json.stations || [];
      setLoadedSource(mode === "map" ? "sqlite_db" : source);
      setStations(items);
      if (items.length > 0) {
        setSelectedStation(items[0]);
      }
    } catch (err: unknown) {
      if (currentRequest !== requestId.current) return;
      setStations([]);
      setError(err instanceof Error ? err.message : "Failed to fetch weather observations");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  // Trigger POST /api/sync (Write-Only Dev Tooling)
  const handleTriggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
      });
      const json = await res.json();
      setSyncResult(json);
      if (json.success) {
        await checkDbStatus();
        await loadData(dataSource, viewMode);
      }
    } catch (err: unknown) {
      setSyncResult({
        success: false,
        error: err instanceof Error ? err.message : "Sync request failed",
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(checkDbStatus);
  }, [checkDbStatus]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void loadData(dataSource, viewMode); });
    const requests = requestId;
    return () => { active = false; requests.current++; };
  }, [dataSource, viewMode, loadData]);

  const counties = useMemo(() => {
    const set = new Set<string>();
    stations.forEach((s) => {
      if (s.county_name) set.add(s.county_name);
    });
    return ["全部", ...Array.from(set)];
  }, [stations]);

  const filteredStations = useMemo(() => {
    if (loadedSource !== (viewMode === "map" ? "sqlite_db" : dataSource)) return [];
    return stations.filter((s) => {
      const matchesCounty =
        selectedCounty === "全部" || s.county_name === selectedCounty;
      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        s.station_name.toLowerCase().includes(query) ||
        s.station_id.toLowerCase().includes(query) ||
        (s.town_name && s.town_name.toLowerCase().includes(query)) ||
        s.county_name.toLowerCase().includes(query);
      return matchesCounty && matchesSearch;
    });
  }, [stations, selectedCounty, search, loadedSource, viewMode, dataSource]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Milestone 3 Live
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Taiwan Weather GIS
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Leaflet + OpenStreetMap
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
              Taiwan CWA Weather GIS
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              臺灣氣象 GIS 空間圖台與地理資訊觀測 (GIS Visualization backed by SQLite /api/weather)
            </p>
          </div>

          {/* View Mode & Source Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Tabs */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
              <button
                onClick={() => setViewMode("map")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  viewMode === "map"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🗺️</span>
                <span>GIS 地圖</span>
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  viewMode === "cards"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>📋</span>
                <span>測站卡片</span>
              </button>
              <button
                onClick={() => setViewMode("json")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  viewMode === "json"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>{`{ }`}</span>
                <span>JSON</span>
              </button>
            </div>

            {/* Non-map mode source switch */}
            {viewMode !== "map" && (
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setDataSource("cwa_live")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                    dataSource === "cwa_live"
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  CWA 即時
                </button>
                <button
                  onClick={() => setDataSource("sqlite_db")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                    dataSource === "sqlite_db"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  SQLite
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Development & Admin Tooling Panel */}
        <section className="bg-slate-900/60 border border-indigo-900/40 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-950/20 border-b border-indigo-900/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
              <span>🛠️ 開發與管理工具 (Development / Admin Tooling)</span>
              <span className="text-slate-500">|</span>
              <span className={dbAvailable ? "text-emerald-400" : "text-amber-400"}>
                {dbAvailable ? "● SQLite 資料庫已連線" : "○ SQLite 尚未連線"}
              </span>
            </div>
            <button
              onClick={() => setShowAdminTools(!showAdminTools)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {showAdminTools ? "收合" : "展開"}
            </button>
          </div>

          {showAdminTools && (
            <div className="p-4 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-slate-300 font-medium">
                    氣象資料庫同步管道 (CWA O-A0003-001 → SQLite)
                  </p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    觸發 <code className="text-indigo-300">POST /api/sync</code>，寫入測站詮釋資料並新增觀測紀錄 (具防重複機制)。
                  </p>
                </div>
                <button
                  onClick={handleTriggerSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors shadow"
                >
                  {syncing ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
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
                      <span>同步中...</span>
                    </>
                  ) : (
                    <span>立即執行寫入同步 (POST /api/sync)</span>
                  )}
                </button>
              </div>

              {/* Sync Feedback Message */}
              {syncResult && (
                <div
                  className={`p-3 rounded-lg border ${
                    syncResult.success
                      ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                      : "bg-rose-950/40 border-rose-800 text-rose-300"
                  }`}
                >
                  {syncResult.success ? (
                    <div className="flex items-center justify-between">
                      <span>
                        ✅ 同步成功！更新測站: {syncResult.stations_upserted}，新增觀測紀錄:{" "}
                        {syncResult.observations_inserted}，略過重複:{" "}
                        {syncResult.duplicates_skipped}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        費時 {syncResult.elapsed_ms}ms
                      </span>
                    </div>
                  ) : (
                    <div>❌ 同步失敗: {syncResult.error}</div>
                  )}
                </div>
              )}

              {/* Database Stats */}
              {dbStats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500">資料庫內測站總數:</span>
                    <span className="font-bold text-white ml-2">{dbStats.stations_count} 站</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500">累計觀測紀錄筆數:</span>
                    <span className="font-bold text-indigo-400 ml-2">
                      {dbStats.observations_count} 筆
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                    <span className="text-slate-500">最新存檔時間:</span>
                    <span className="font-mono text-slate-300 ml-2 text-[11px]">
                      {dbStats.latest_obs_time ? new Date(dbStats.latest_obs_time).toLocaleTimeString() : "--"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-950/40 border border-rose-800 text-rose-300 p-4 rounded-xl flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-rose-200">後端資料查詢異常</p>
              <p className="text-xs mt-1 text-rose-300/80">{error}</p>
              <p className="text-xs mt-2 text-slate-400">
                請確認本機 data 資料夾可寫入，再重試查詢或執行資料同步。
              </p>
            </div>
          </div>
        )}

        {/* Filters and Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="搜尋測站名稱、站號或鄉鎮..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
            />
            <select
              value={selectedCounty}
              onChange={(e) => setSelectedCounty(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-3">
            <span>
              資料來源端點:{" "}
              <code className="text-indigo-300 font-mono">
                {viewMode === "map" ? "/api/weather" : dataSource === "cwa_live" ? "/api/cwa" : "/api/weather"}
              </code>
            </span>
            {fetchLatency !== null && (
              <span className="text-emerald-400 font-mono">{fetchLatency}ms</span>
            )}
          </div>
        </div>

        {/* View Mode Render */}
        {viewMode === "map" && (
          <div className="space-y-3">
            <MapWrapper
              stations={filteredStations}
              loading={loading || loadedSource !== "sqlite_db" && !error}
              error={error}
              onRetry={() => loadData(dataSource, "map")}
              selectedStationId={selectedStation?.station_id}
              onSelectStation={(st) => setSelectedStation(st)}
            />
          </div>
        )}

        {viewMode === "cards" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStations.map((station) => {
              const isSelected = selectedStation?.station_id === station.station_id;
              return (
                <div
                  key={station.station_id}
                  onClick={() => setSelectedStation(station)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 bg-slate-900/50 hover:bg-slate-900/90 ${
                    isSelected
                      ? "border-indigo-500/80 shadow-md shadow-indigo-500/10"
                      : "border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">
                          {station.station_name}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {station.station_id}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        📍 {station.county_name} {station.town_name || ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-indigo-400">
                        {station.air_temperature !== null
                          ? `${station.air_temperature}°`
                          : "--"}
                      </span>
                      <div className="text-[10px] text-slate-500">氣溫</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs">
                    <div>
                      <span className="text-slate-500">相對濕度</span>
                      <p className="font-semibold text-slate-300 mt-0.5">
                        {station.relative_humidity !== null
                          ? `${station.relative_humidity}%`
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
                        {station.wind_speed !== null
                          ? `${station.wind_speed} m/s`
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
        )}

        {viewMode === "json" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-400 font-mono">
              <span>GET /api/weather Response Data</span>
              <span>Total: {filteredStations.length} Stations</span>
            </div>
            <pre className="p-4 text-xs font-mono text-emerald-400/90 bg-slate-950 rounded-lg overflow-x-auto max-h-[600px]">
              {JSON.stringify(filteredStations, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
