"""Step 2: join MinT/MaxT by region and Taiwan calendar date, never array index."""
import argparse
import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from forecast_config import RAW_PATH, CSV_PATH, REGIONS

COLUMNS = ('regionName', 'dataDate', 'mint', 'maxt')
TAIPEI = timezone(timedelta(hours=8))


def get(node, key, default=None):
    if not isinstance(node, dict):
        return default
    return next((v for k, v in node.items() if k.lower() == key.lower()), default)


def array(value):
    return value if isinstance(value, list) else ([] if value is None else [value])


def locations(node):
    """Accept records.locations.location and CWA file-JSON envelopes/casing."""
    if isinstance(node, list):
        for child in node:
            yield from locations(child)
    elif isinstance(node, dict):
        if get(node, 'locationName') and get(node, 'weatherElement') is not None:
            yield node
        else:
            for child in node.values():
                if isinstance(child, (list, dict)):
                    yield from locations(child)


def temperature(value):
    if isinstance(value, list):
        return temperature(value[0]) if value else None
    if isinstance(value, dict):
        for key in ('value', 'parameterName', 'MinTemperature', 'MaxTemperature', 'MinT', 'MaxT', '#text'):
            candidate = get(value, key)
            if candidate is not None:
                return temperature(candidate)
        return None
    try:
        if value is None or isinstance(value, bool) or str(value).strip() == '':
            return None
        number = float(value)
        return number if math.isfinite(number) and -80 <= number <= 60 else None
    except (ValueError, TypeError):
        return None


def date_of(value):
    if not isinstance(value, str):
        raise ValueError('預報日期遺漏或格式不正確。')
    try:
        time = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return (time.astimezone(TAIPEI) if time.tzinfo else time).date().isoformat()
    except ValueError:
        raise ValueError(f'無法解析預報日期：{value}') from None


def parse_forecast(payload):
    if not isinstance(payload, dict):
        raise ValueError('預報 JSON 必須是物件。')
    values = defaultdict(lambda: {'mint': [], 'maxt': []})
    aliases = {'mint': 'mint', '最低溫度': 'mint', 'mintemperature': 'mint',
               'maxt': 'maxt', '最高溫度': 'maxt', 'maxtemperature': 'maxt'}
    for location in locations(payload):
        region = get(location, 'locationName')
        if region not in REGIONS:
            continue
        for element in array(get(location, 'weatherElement')):
            # Standard elementName + time[] form, plus file API MinT/MaxT subtrees.
            metric = aliases.get(str(get(element, 'elementName', '')).lower())
            series = [(metric, get(element, 'time'))] if metric else [
                (kind, get(get(element, name, {}), 'time')) for name, kind in [('MinT', 'mint'), ('MaxT', 'maxt')]
            ]
            for kind, periods in series:
                for period in array(periods):
                    day = date_of(get(period, 'startTime', get(period, 'dataTime', get(period, 'date'))))
                    value = temperature(get(period, 'elementValue', get(period, 'parameter', get(period, 'value'))))
                    # Register the date even for a missing value; never silently shorten a week.
                    if value is not None:
                        values[(region, day)][kind].append(value)
                    else:
                        values[(region, day)]
    rows = []
    for region in REGIONS:
        for name, day in sorted(values):
            if name != region:
                continue
            metrics = values[(name, day)]
            if not metrics['mint'] or not metrics['maxt']:
                raise ValueError(f'{region} {day} 缺少有效 MinT 或 MaxT；停止匯入以保留原資料。')
            low, high = min(metrics['mint']), max(metrics['maxt'])
            if low > high:
                raise ValueError(f'{region} {day} 的最低溫高於最高溫。')
            rows.append(dict(zip(COLUMNS, (region, day, low, high))))
    validate_week(rows)
    return rows


def validate_week(rows):
    """Require exactly six regions and seven common, consecutive dates."""
    if len(rows) != 42 or {r['regionName'] for r in rows} != set(REGIONS):
        raise ValueError(f'必須包含六大地區各七天，共 42 筆完整預報；目前 {len(rows)} 筆。')
    dates = sorted({r['dataDate'] for r in rows})
    if len(dates) != 7 or any((datetime.fromisoformat(b) - datetime.fromisoformat(a)).days != 1 for a, b in zip(dates, dates[1:])):
        raise ValueError('六區必須使用相同且連續的七個預報日期。')
    if len({(r['regionName'], r['dataDate']) for r in rows}) != 42:
        raise ValueError('地區／日期存在重複資料。')
    for row in rows:
        if temperature(row['mint']) is None or temperature(row['maxt']) is None or float(row['mint']) > float(row['maxt']):
            raise ValueError('氣溫值無效或最低溫高於最高溫。')


def write_csv(rows, output=CSV_PATH):
    output = Path(output)
    temporary = output.with_suffix('.csv.tmp')
    with temporary.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=RAW_PATH)
    parser.add_argument('--output', type=Path, default=CSV_PATH)
    args = parser.parse_args()
    try:
        rows = parse_forecast(json.loads(args.input.read_text(encoding='utf-8-sig')))
        write_csv(rows, args.output)
        print(f'解析成功：六區 × 七天 = {len(rows)} 筆，已輸出 {args.output.name}')
        for row in rows[:7]:
            print(row)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
