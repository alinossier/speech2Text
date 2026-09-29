import unittest

from backend.app.transcript_format import group_transcript


class TranscriptFormatTests(unittest.TestCase):
    def test_interval_and_speaker_changes(self):
        segments = [
            {"start_seconds": 0, "speaker_id": "A", "text": "Hello"},
            {"start_seconds": 12, "speaker_id": "A", "text": "world."},
            {"start_seconds": 20, "speaker_id": "B", "text": "Yes."},
            {"start_seconds": 65, "speaker_id": "B", "text": "Later"},
            {"start_seconds": 70, "speaker_id": "B", "text": "again."},
        ]

        self.assertEqual(group_transcript(segments, 60), [
            (0, "A", "Hello world."),
            (None, "B", "Yes."),
            (65, "B", "Later again."),
        ])
        self.assertEqual(group_transcript(segments, 120), [
            (0, "A", "Hello world."),
            (None, "B", "Yes. Later again."),
        ])


if __name__ == "__main__":
    unittest.main()
