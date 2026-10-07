"""Refresh the local history dataset, at most once per 15 minutes per server."""
import shutil
import subprocess
import threading
import time
from datetime import datetime, timedelta

from backfill_history import TAIPEI, backfill
from database import query_forecasts, query_metadata
from export_weather import export_weather
from forecast_config import DB_PATH, ROOT

_lock = threading.Lock()
_last_attempt = 0
_last_day = None
_last_result = None


def update_history(force=False):
    global _last_attempt, _last_day, _last_result
    with _lock:
        today = datetime.now(TAIPEI).date()
        if not force and _last_day == today and time.monotonic() - _last_attempt < 900:
            return _last_result
        _last_attempt, _last_day = time.monotonic(), today
        try:
            if query_metadata(DB_PATH).get('kind') != 'station_history':
                return None
            rows = query_forecasts(db_path=DB_PATH)
            latest = max(datetime.fromisoformat(r['dataDate']).date() for r in rows)
            partial = [datetime.fromisoformat(r['dataDate']).date() for r in rows if r['isPartial']]
            start = min(partial + [min(latest + timedelta(days=1), today)])
            node = shutil.which('node')
            if not node:
                raise RuntimeError('需要 Node.js 22.18 以上才能同步當日觀測。')
            result = subprocess.run([node, 'scripts/sync-db.mjs'], cwd=ROOT,
                                    capture_output=True, timeout=60)
            if result.returncode:
                raise RuntimeError('CWA 當日觀測同步失敗，請檢查網路與本機 API 授權碼。')
            backfill(start, today)
            export_weather()
            _last_result = (True, f'已更新至 {today.isoformat()}；今天為尚未完整的觀測樣本。')
        except Exception:
            # Never surface request URLs, subprocess output or API credentials.
            _last_result = (False, '自動更新未完成（網路、API、套件或日資料尚未公布）；保留既有資料。可稍後按「立即更新資料」。')
        return _last_result
