"""Step 1: retrieve F-A0010-001 as JSON without logging the API key."""
import argparse
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from forecast_config import ROOT, RAW_PATH

DATASET = 'F-A0010-001'
ENDPOINTS = (
    f'https://opendata.cwa.gov.tw/api/v1/rest/datastore/{DATASET}',
    f'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/{DATASET}',
)


def fetch_weather(output=RAW_PATH):
    load_dotenv(ROOT / '.env.local')
    load_dotenv(ROOT / '.env')
    key = os.environ.get('CWA_API_KEY')
    if not key:
        raise ValueError('請在 .env.local 設定自己的 CWA_API_KEY。')
    statuses = []
    for endpoint in ENDPOINTS:
        try:
            response = requests.get(endpoint, params={'Authorization': key, 'format': 'JSON'}, timeout=30)
        except requests.RequestException:
            raise RuntimeError('CWA 連線失敗，請檢查網路後重試。') from None
        statuses.append(response.status_code)
        if response.status_code == 404:
            continue
        if not response.ok:
            raise RuntimeError(f'CWA 回傳 HTTP {response.status_code}；請確認金鑰及資料集權限。')
        try:
            payload = response.json()
        except ValueError:
            raise ValueError('CWA 回應不是 JSON；原有檔案未覆蓋。') from None
        if not isinstance(payload, dict) or not any(k in payload for k in ('records', 'cwaopendata', 'cwbopendata')):
            raise ValueError('CWA JSON 缺少預報資料，原有檔案未覆蓋。')
        if payload.get('success') in (False, 'false'):
            raise ValueError('CWA 回報查詢失敗，原有檔案未覆蓋。')
        output = Path(output)
        temporary = output.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(output)
        return payload
    raise RuntimeError(f'{DATASET} 的 REST 與檔案介面均回傳 404。請確認老師指定的資料集是否仍可下載，或提供同資料集的 JSON；不會以觀測資料或假資料替代。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=RAW_PATH)
    args = parser.parse_args()
    try:
        payload = fetch_weather(args.output)
        print(f'已下載 {DATASET} JSON：{args.output.name}')
        print('JSON 最上層欄位：', ', '.join(payload.keys()))
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
