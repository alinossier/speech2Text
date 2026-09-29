import gc
from pathlib import Path

from .config import settings


def transcribe(source_path: Path) -> tuple[list[dict], float | None]:
    """Run the three local stages: ASR, word alignment, then speaker attribution."""
    if not settings.hf_token:
        raise RuntimeError("STT_HF_TOKEN is required for speaker diarization.")

    import torch
    import whisperx
    from whisperx.diarize import DiarizationPipeline

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available inside the backend container.")

    device = "cuda"
    audio = whisperx.load_audio(str(source_path))
    model = whisperx.load_model(
        settings.model_name,
        device,
        compute_type="float16",
        language="en",
        download_root=str(settings.model_cache),
    )
    result = model.transcribe(audio, batch_size=8)
    del model
    gc.collect()
    torch.cuda.empty_cache()

    align_model, metadata = whisperx.load_align_model(language_code="en", device=device, model_dir=str(settings.model_cache))
    result = whisperx.align(result["segments"], align_model, metadata, audio, device, return_char_alignments=False)
    del align_model
    gc.collect()
    torch.cuda.empty_cache()

    diarizer = DiarizationPipeline(token=settings.hf_token, device=device)
    diarized = diarizer(audio)
    result = whisperx.assign_word_speakers(diarized, result)
    del diarizer
    gc.collect()
    torch.cuda.empty_cache()

    segments = [
        {
            "start_seconds": float(segment.get("start", 0)),
            "end_seconds": float(segment.get("end", 0)),
            "speaker_id": segment.get("speaker", "SPEAKER_UNKNOWN"),
            "text": segment.get("text", "").strip(),
        }
        for segment in result["segments"]
        if segment.get("text", "").strip()
    ]
    duration = max((segment["end_seconds"] for segment in segments), default=None)
    return segments, duration
