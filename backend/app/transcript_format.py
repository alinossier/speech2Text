def group_transcript(segments, interval_seconds: int) -> list[tuple[float | None, str, str]]:
    blocks = []
    next_timestamp = float("-inf")
    for segment in segments:
        start = segment["start_seconds"]
        speaker_id = segment["speaker_id"]
        timed = (not blocks or blocks[-1][1] != speaker_id) if interval_seconds == 0 else start >= next_timestamp
        if timed:
            next_timestamp = start + interval_seconds
        if blocks and blocks[-1][1] == speaker_id and not timed:
            previous_start, _, previous_text = blocks[-1]
            blocks[-1] = (previous_start, speaker_id, f"{previous_text} {segment['text']}")
        else:
            blocks.append((start if timed else None, speaker_id, segment["text"]))
    return blocks
