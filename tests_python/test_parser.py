import unittest
from datetime import date, timedelta
from parse_weather import parse_forecast
from forecast_config import REGIONS


def payload():
    locations = []
    for region in REGIONS:
        elements = []
        for metric, value in [('MaxT', 30), ('MinT', 20)]:
            periods = [{'startTime': (date(2026, 10, 5) + timedelta(days=i)).isoformat() + 'T06:00:00+08:00',
                        'parameter': {'parameterName': str(value + i)}} for i in range(7)]
            elements.append({'elementName': metric, 'time': periods if metric == 'MinT' else periods[::-1]})
        locations.append({'locationName': region, 'weatherElement': elements})
    return {'records': {'locations': [{'location': locations}]}}


class ParserTests(unittest.TestCase):
    def test_pair_by_date_not_order(self):
        rows = parse_forecast(payload())
        self.assertEqual(len(rows), 42)
        self.assertTrue(all(row['maxt'] - row['mint'] == 10 for row in rows))

    def test_missing_temperature_rejected(self):
        data = payload()
        data['records']['locations'][0]['location'][0]['weatherElement'][0]['time'][0]['parameter']['parameterName'] = '-99'
        with self.assertRaises(ValueError):
            parse_forecast(data)

    def test_invalid_date_rejected(self):
        data = payload()
        data['records']['locations'][0]['location'][0]['weatherElement'][0]['time'][0]['startTime'] = 'invalid'
        with self.assertRaises(ValueError):
            parse_forecast(data)
