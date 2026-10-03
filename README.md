# Local Speech-to-Text

Local, GPU-backed transcription for conversation recordings. The frontend and backend are separate services: the browser uploads directly to the backend API, so they can run on different machines on a trusted network.

## Prerequisites

- NVIDIA driver working on the GPU host (`nvidia-smi` must succeed)
- Docker Engine with NVIDIA Container Toolkit
- A Hugging Face read token with access to `pyannote/speaker-diarization-community-1` for diarization

Copy `.env.example` to `.env`, set `STT_HF_TOKEN`, and accept the model's Hugging Face user agreement once.

## Run on one host

```bash
docker compose up --build
```

Open `http://localhost:8080`. The backend API is available on `http://localhost:8001`; the first transcription downloads the transcription, alignment, and diarization models into the mounted model cache.

## Run on separate hosts

1. On the GPU host, copy `backend/.env.example` to `backend/.env`, configure `STT_API_ORIGINS` with the UI URL, then run `docker compose -f backend/compose.yml up -d --build`.
2. On the UI host, set `VITE_API_BASE_URL` in `frontend/.env` to the private backend URL and run `docker compose -f frontend/compose.yml up -d --build`.
3. Restrict port `8000` to the trusted LAN/VPN with the host firewall. There is no built-in authentication in this release.

Completed uploads are deleted automatically from the backend. Transcript data remains until the user deletes it from the UI.

In a completed transcript, use **Show timestamps every** to choose the spacing for the on-screen transcript, copied text, and TXT download. Choose **speaker turn** to timestamp each change of speaker. The choice is saved in the browser. SRT downloads retain a timestamp for each caption.
