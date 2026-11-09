# Deployment note — native primary path, container archived

**Native Windows execution is the only supported workflow for current development and the competition presentation.** Run:

```powershell
.\start_emberlens.ps1
.\stop_emberlens.ps1
```

See the root `README.md` ("Run natively") for prerequisites, URLs, and log locations. Docker is not required.

## Future cloud deployment (separate task)

A previous container setup is preserved under `archive/future-cloud-deployment/docker/` (`Dockerfile`, `compose.yaml`, `.dockerignore`, `backend/container_start.py`). It was verified previously (single-container, FastAPI serving API + built SPA, DuckDB on a persistent bind mount, startup refusing an empty/wrong-scope database) and is kept for a future public deployment. It is not active, not part of the presentation, and not invoked by the native launcher. Re-verify it against then-current code before any cloud use; it still needs a host, persistent disk, TLS at the edge, and the DuckDB filename `emberlens-bangladesh.duckdb` mounted at `/var/lib/emberlens`.
