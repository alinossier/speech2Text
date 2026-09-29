import asyncio
import json
import uuid
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from . import database
from .config import settings
from .transcriber import transcribe
from .transcript_format import group_transcript

SUPPORTED_EXTENSIONS = {".mp3", ".mp4", ".wav"}


class SpeakerRename(BaseModel):
    name: str = Field(min_length=1, max_length=80)


def serialize_job(job, include_segments: bool = False) -> dict:
    response = {
        "id": job["id"],
        "filename": job["original_filename"],
        "status": job["status"],
        "error": job["error"],
        "createdAt": job["created_at"],
        "updatedAt": job["updated_at"],
        "durationSeconds": job["duration_seconds"],
        "speakers": json.loads(job["speakers_json"]),
        "audioDeleted": job["source_path"] is None,
    }
    if include_segments:
        response["segments"] = [
            {
                "startSeconds": segment["start_seconds"],
                "endSeconds": segment["end_seconds"],
                "speakerId": segment["speaker_id"],
                "text": segment["text"],
            }
            for segment in database.segments_for_job(job["id"])
        ]
    return response


async def worker() -> None:
    while True:
        job = database.next_queued_job()
        if not job:
            await asyncio.sleep(1)
            continue
        source_path = Path(job["source_path"])
        try:
            segments, duration = await asyncio.to_thread(transcribe, source_path)
            if database.get_job(job["id"]) is None:
                continue
            database.save_result(job["id"], segments, duration)
        except Exception as error:
            if database.get_job(job["id"]) is not None:
                database.update_job(job["id"], "failed", str(error))
        finally:
            source_path.unlink(missing_ok=True)
            if database.get_job(job["id"]) is not None:
                database.clear_source_path(job["id"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize()
    task = asyncio.create_task(worker())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="Local Speech-to-Text", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model": settings.model_name}


@app.post("/api/jobs", status_code=201)
async def create_job(request: Request, audio: UploadFile = File(...)):
    suffix = Path(audio.filename or "").suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(415, "Only .mp3, .mp4, and .wav files are supported.")
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.upload_limit_bytes:
        raise HTTPException(413, f"Files must be {settings.upload_limit_gb} GB or smaller.")

    job_id = str(uuid.uuid4())
    source_path = settings.data_dir / "uploads" / f"{job_id}{suffix}"
    bytes_written = 0
    try:
        with source_path.open("wb") as target:
            while chunk := await audio.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > settings.upload_limit_bytes:
                    raise HTTPException(413, f"Files must be {settings.upload_limit_gb} GB or smaller.")
                target.write(chunk)
        database.create_job(job_id, Path(audio.filename).name, source_path)
    except Exception:
        source_path.unlink(missing_ok=True)
        raise
    finally:
        await audio.close()
    return serialize_job(database.get_job(job_id))


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(404, "Transcript not found.")
    return serialize_job(job, include_segments=True)


@app.get("/api/jobs")
def get_jobs():
    return [serialize_job(job) for job in database.list_jobs()]


@app.patch("/api/jobs/{job_id}/speakers/{speaker_id}")
def update_speaker(job_id: str, speaker_id: str, payload: SpeakerRename):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(404, "Transcript not found.")
    try:
        database.rename_speaker(job_id, speaker_id, payload.name.strip())
    except KeyError:
        raise HTTPException(404, "Speaker not found.") from None
    return serialize_job(database.get_job(job_id), include_segments=True)


@app.get("/api/jobs/{job_id}/export/{format_name}")
def export_transcript(job_id: str, format_name: str, timestamp_interval_seconds: int = Query(default=60, ge=1, le=3600)):
    job = database.get_job(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(404, "Completed transcript not found.")
    segments = database.segments_for_job(job_id)
    speakers = json.loads(job["speakers_json"])
    if format_name == "txt":
        output = "\n\n".join(
            f"{f'[{format_time(start)}] ' if start is not None else ''}{speakers.get(speaker_id, speaker_id)}: {text}"
            for start, speaker_id, text in group_transcript(segments, timestamp_interval_seconds)
        )
        media_type = "text/plain"
    elif format_name == "srt":
        output = "\n\n".join(f"{index + 1}\n{format_srt_time(item['start_seconds'])} --> {format_srt_time(item['end_seconds'])}\n{speakers.get(item['speaker_id'], item['speaker_id'])}: {item['text']}" for index, item in enumerate(segments))
        media_type = "application/x-subrip"
    else:
        raise HTTPException(404, "Unsupported export format.")
    filename = f"{Path(job['original_filename']).stem}.{format_name}"
    return PlainTextResponse(output, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.delete("/api/jobs/{job_id}", status_code=204)
def remove_job(job_id: str):
    found, source_path = database.delete_job(job_id)
    if not found:
        raise HTTPException(404, "Transcript not found.")
    if source_path:
        Path(source_path).unlink(missing_ok=True)


def format_time(seconds: float) -> str:
    seconds = int(seconds)
    return f"{seconds // 3600:02}:{(seconds % 3600) // 60:02}:{seconds % 60:02}"


def format_srt_time(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    return f"{milliseconds // 3600000:02}:{(milliseconds % 3600000) // 60000:02}:{(milliseconds % 60000) // 1000:02},{milliseconds % 1000:03}"
