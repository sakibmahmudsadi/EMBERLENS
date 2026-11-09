# Future cloud deployment (archived)

Container assets here are preserved for a future cloud deployment. They are **not part of the current development or presentation workflow** and are not invoked by `start_emberlens.ps1`.

Contents:

- `Dockerfile` — multi-stage image (Node frontend build + Python runtime); `CMD ["python", "-m", "backend.container_start"]`
- `compose.yaml` — single-service compose (bind-mounts `./deploy-data`, `emberlens:local`)
- `.dockerignore` — build context exclusions
- `backend/container_start.py` — fail-fast DB check then `uvicorn backend.app:app` (Docker-only entrypoint)

The native Windows path (`.\start_emberlens.ps1` / `.\stop_emberlens.ps1`) uses `backend.app:app` directly and does not use these files. A future cloud task should re-verify the image against the then-current backend/frontend code before building.
