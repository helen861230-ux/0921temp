import unittest
from unittest.mock import patch, Mock
from datetime import datetime
import auto_update as updater


class AutoUpdateTests(unittest.TestCase):
    def setUp(self):
        updater._last_attempt = 0
        updater._last_day = None
        updater._last_result = None

    def test_updates_partial_days_and_throttles(self):
        with patch.object(updater, 'datetime') as clock, \
                patch.object(updater, 'query_metadata', return_value={'kind': 'station_history'}), \
                patch.object(updater, 'query_forecasts', return_value=[{'dataDate': '2026-10-05', 'isPartial': 1}]), \
                patch.object(updater.shutil, 'which', return_value='/bin/node'), \
                patch.object(updater.subprocess, 'run', return_value=Mock(returncode=0)), \
                patch.object(updater, 'backfill') as backfill, \
                patch.object(updater, 'export_weather'):
            clock.now.return_value = datetime(2026, 10, 7, tzinfo=updater.TAIPEI)
            clock.fromisoformat.side_effect = datetime.fromisoformat
            self.assertTrue(updater.update_history()[0])
            self.assertTrue(updater.update_history()[0])
            self.assertEqual(backfill.call_count, 1)
            self.assertEqual(backfill.call_args.args[0].isoformat(), '2026-10-05')
            clock.now.return_value = datetime(2026, 10, 8, tzinfo=updater.TAIPEI)
            updater.update_history()
            self.assertEqual(backfill.call_count, 2)

    def test_network_failure_does_not_overwrite_history(self):
        with patch.object(updater, 'query_metadata', return_value={'kind': 'station_history'}), \
                patch.object(updater, 'query_forecasts', return_value=[{'dataDate': '2026-10-05', 'isPartial': 1}]), \
                patch.object(updater.shutil, 'which', return_value='/bin/node'), \
                patch.object(updater.subprocess, 'run', return_value=Mock(returncode=1)), \
                patch.object(updater, 'backfill') as backfill:
            self.assertFalse(updater.update_history()[0])
            backfill.assert_not_called()

    def test_forecast_mode_is_not_replaced(self):
        with patch.object(updater, 'query_metadata', return_value={'kind': 'forecast'}), \
                patch.object(updater.subprocess, 'run') as run:
            self.assertIsNone(updater.update_history())
            run.assert_not_called()
