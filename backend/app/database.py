import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import settings


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def initialize() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "uploads").mkdir(exist_ok=True)
    with connection() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                original_filename TEXT NOT NULL,
                source_path TEXT,
                status TEXT NOT NULL,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                duration_seconds REAL,
                speakers_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                start_seconds REAL NOT NULL,
                end_seconds REAL NOT NULL,
                speaker_id TEXT NOT NULL,
                text TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_segments_job_position ON segments(job_id, position);
            """
        )


@contextmanager
def connection():
    db = sqlite3.connect(settings.data_dir / "transcripts.sqlite3")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def create_job(job_id: str, filename: str, source_path: Path) -> None:
    now = utc_now()
    with connection() as db:
        db.execute(
            "INSERT INTO jobs (id, original_filename, source_path, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)",
            (job_id, filename, str(source_path), now, now),
        )


def get_job(job_id: str):
    with connection() as db:
        return db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()


def list_jobs():
    with connection() as db:
        return db.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()


def next_queued_job():
    with connection() as db:
        job = db.execute("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").fetchone()
        if job:
            db.execute("UPDATE jobs SET status = 'processing', updated_at = ? WHERE id = ?", (utc_now(), job["id"]))
            return db.execute("SELECT * FROM jobs WHERE id = ?", (job["id"],)).fetchone()
    return None


def update_job(job_id: str, status: str, error: str | None = None, duration_seconds: float | None = None) -> None:
    with connection() as db:
        db.execute(
            "UPDATE jobs SET status = ?, error = ?, duration_seconds = COALESCE(?, duration_seconds), updated_at = ? WHERE id = ?",
            (status, error, duration_seconds, utc_now(), job_id),
        )


def clear_source_path(job_id: str) -> None:
    with connection() as db:
        db.execute("UPDATE jobs SET source_path = NULL, updated_at = ? WHERE id = ?", (utc_now(), job_id))


def save_result(job_id: str, segments: list[dict], duration_seconds: float | None) -> None:
    speaker_ids = sorted({item["speaker_id"] for item in segments})
    speakers = {speaker_id: speaker_id.replace("SPEAKER_", "Speaker ") for speaker_id in speaker_ids}
    with connection() as db:
        db.execute("DELETE FROM segments WHERE job_id = ?", (job_id,))
        db.executemany(
            "INSERT INTO segments (job_id, position, start_seconds, end_seconds, speaker_id, text) VALUES (?, ?, ?, ?, ?, ?)",
            [(job_id, index, item["start_seconds"], item["end_seconds"], item["speaker_id"], item["text"]) for index, item in enumerate(segments)],
        )
        db.execute(
            "UPDATE jobs SET status = 'completed', source_path = NULL, duration_seconds = ?, speakers_json = ?, updated_at = ? WHERE id = ?",
            (duration_seconds, json.dumps(speakers), utc_now(), job_id),
        )


def segments_for_job(job_id: str):
    with connection() as db:
        return db.execute("SELECT * FROM segments WHERE job_id = ? ORDER BY position", (job_id,)).fetchall()


def rename_speaker(job_id: str, speaker_id: str, name: str) -> None:
    with connection() as db:
        job = db.execute("SELECT speakers_json FROM jobs WHERE id = ?", (job_id,)).fetchone()
        speakers = json.loads(job["speakers_json"])
        if speaker_id not in speakers:
            raise KeyError(speaker_id)
        speakers[speaker_id] = name
        db.execute("UPDATE jobs SET speakers_json = ?, updated_at = ? WHERE id = ?", (json.dumps(speakers), utc_now(), job_id))


def delete_job(job_id: str) -> tuple[bool, str | None]:
    with connection() as db:
        job = db.execute("SELECT source_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return False, None
        db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        return True, job["source_path"]
