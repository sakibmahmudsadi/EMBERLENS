# Running and deploying EMBERLENS

The app can run as a single container: FastAPI serves both `/api/v1/*` and the
compiled React app from the same origin. The national DuckDB file is persistent
external data and is deliberately excluded from the image. The container startup
check refuses to serve an empty or wrong-scope database.

## Local Docker run

Requirements: Docker Desktop with the Linux container engine running and Docker
Compose v2. From the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Force deploy-data | Out-Null
# Copy the validated database into deploy-data only after its writer has closed cleanly.
Copy-Item backend/emberlens-bangladesh.duckdb deploy-data/emberlens-bangladesh.duckdb
docker compose build
docker compose up -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
```

Open `http://127.0.0.1:8080/`. Set `EMBERLENS_DATA_DIR` to the directory
containing the database and `WEB_PORT` to change the host port. On Linux, set
`EMBERLENS_UID`/`EMBERLENS_GID` to the directory owner so the API can write
DuckDB WAL/checkpoint sidecars. Compose binds that directory read/write because
DuckDB must create those files beside the database. The container filesystem is
read-only outside `/tmp` and that mounted data directory. The only published
port is the web/API port.

To stop the local container:

```powershell
docker compose down
```

## Public host requirements

- A host that runs Docker images, exposes the configured `PORT`, supports a
  persistent writable disk, and can retain at least the database and its DuckDB
  sidecar files. Do not rely on an ephemeral container filesystem.
- Mount the prepared data directory at `/var/lib/emberlens`; keep the DB
  filename `emberlens-bangladesh.duckdb`. Startup verifies the Bangladesh AOI,
  both registered Standard products, and a non-empty observation table before
  launching one API worker.
- Terminate TLS at the host's HTTPS proxy/load balancer. Serve frontend and API
  through the same public origin; this avoids exposing cross-origin API access.
- Do not put the FIRMS MAP_KEY in the image or runtime environment. The deployed
  showcase reads the frozen DuckDB snapshot and makes no NASA download requests.
- Back up the DuckDB file only after the API has closed it cleanly. Keep the
  validated raw CSVs and manifests as the recovery source.

No public host, domain, TLS endpoint, or deployment credentials are configured
in this repository yet. The container setup is portable; a public deployment
still needs a hosting account and a persistent disk sized for the database.
