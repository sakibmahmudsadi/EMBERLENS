# 10 — Security and error contract

API §9 envelope, §10 limits, CLAUDE.md §5 security gate.

---

## BE-TC-125 — All errors use the documented envelope (or a documented deviation)
- **Type / Priority:** Functional / P0 · **Refs:** API §9; D-21
- **Steps:** trigger 404 (`AOI_NOT_FOUND`), 422 (`INVALID_DATE_RANGE`), 422 (`WINDOW_TOO_LARGE`), 404 (`OBSERVATION_NOT_FOUND`), 405, 500 (BE-TC-057)
- **Expected (spec):** every response — including 5xx — is `{"error":{"code","message","request_id","details"}}`; HTTP status matches class; no FastAPI `{"detail": "..."}` leaks; `request_id` present and unique per request.
- **Actual:** application HTTP errors, request validation, 404/405 routing errors, and unexpected 500s use the documented top-level envelope. Every response carries a unique `X-Request-ID`, repeated in the body. Unexpected server messages are generic and omit exception details.
- **Automation:** `tests/test_api.py::test_observation_not_found`, `test_invalid_date_range`, `test_validation_method_and_not_found_errors_use_stable_envelope`, `test_unexpected_errors_use_generic_envelope_without_leaking_exception` · **Status:** Automated pass; D-21 closed

## BE-TC-126 — Error details never echo raw SQL, paths or connection strings
- **Type / Priority:** Security / P0 · **Refs:** API §10
- **Steps:** force 422/404/500; inspect `details`; trigger DB lock fault in scratch ENV-1
- **Expected:** generic message + opaque code; no driver text, no `C:\` paths, no SQL fragments; server logs (if any) carry `run_id`, not data.
- **Status:** Not executed

## BE-TC-127 — No absolute filesystem paths in any client response
- **Type / Priority:** Security / P0 · **Refs:** API §10; D-01
- **Steps:** sweep all GET/POST endpoints; regex response bodies for `[A-Za-z]:\\`, `/home/`, `source_file_uri`
- **Expected:** clean; only repo-relative/opaque identifiers.
- **Status:** Partial verification: `/data-sources` and export manifests test absolute-path/key redaction; a complete response sweep remains open.

## BE-TC-128 — CORS is explicit-origin only, no wildcard with credentials
- **Type / Priority:** Security / P1 · **Refs:** ARCHITECTURE §10; API §10
- **Pre:** default settings (`FRONTEND_ORIGIN` unset → `http://localhost:5173`)
- **Steps:** preflight `OPTIONS` from `http://evil.example`; from configured origin; `GET` with credentialled fetch; inspect `access-control-allow-*`
- **Expected:** configured origin reflected only; unconfigured origin rejected/absent; methods/headers not `*` in production profile (or explicitly documented for local demo); no `allow_credentials=true` + `allow_origins=["*"]`.
- **Actual (code review):** origin is configurable (good) but `allow_methods=["*"]`, `allow_headers=["*"]`, `allow_credentials=True` — acceptable for local demo; tighten for any deployed instance.
- **Status:** Code-review finding — D-31 (low/config)

## BE-TC-129 — Rate limiting on expensive endpoints (exports, calendar recompute)
- **Type / Priority:** Security / P1 · **Refs:** API §10
- **Steps:** N=200 sequential POSTs `/api/v1/exports` in <10 s; same for GET `/calendar`
- **Expected:** 429 with `Retry-After` after threshold, or documented single-user demo deployment with a compensating control; never unbounded CPU burn.
- **Actual (code review):** no rate limiting at all (and `/calendar` recomputes+writes on every call — free DoS amplifier).
- **Status:** Code-review finding — D-32

## BE-TC-130 — No authentication/authorization is acceptable only for a local demo, and is documented as such
- **Type / Priority:** Security / P1 · **Refs:** API §10; PRD §6 (no public API in prototype)
- **Steps:** call any endpoint without credentials; inspect `docs/`; check deployment notes (`infrastructure/README.md`, if any)
- **Expected:** anonymous read access is explicitly scoped (local demo / controlled network); no claim of public safety; write path (exports are read-only compute) is the only dangerous surface; P2 includes host allowlist.
- **Status:** Not executed (policy review)

## BE-TC-131 — Security headers are absent (acceptable? document it)
- **Type / Priority:** Security / P2 · **Refs:** D-31
- **Steps:** inspect response headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy` on `/docs`, `Referrer-Policy`)
- **Expected:** either set by the reverse proxy (and documented), or app sets minimum; `/docs` where enabled is protected or disabled in any exposed deployment.
- **Status:** Not executed

## BE-TC-132 — Request body / query size bounds
- **Type / Priority:** Security / P2 · **Refs:** API §10
- **Steps:** POST `/api/v1/exports` with 50 MB JSON; URL with 100 KB query string; `sensors=` with 10k tokens
- **Expected:** 413/422 with bounded message; no memory blow; no traceback.
- **Status:** Not executed

## BE-TC-133 — Logs / errors / manifests never contain secret VALUES
- **Type / Priority:** Security / P0 · **Refs:** CLAUDE.md §5; PIPE §5
- **Steps:** grep code for logging of `os.environ`, `settings`, request headers; run exports; inspect any `print`/`logging` output; inspect manifest `source_endpoint` for `<MAP_KEY>` placeholder vs real key
- **Expected:** only names/booleans; `<MAP_KEY>` templated; no keyed URLs in logs or manifests (current manifest uses `<MAP_KEY>` — good).
- **Status:** Not executed

## BE-TC-134 — Content-Disposition filename is fixed and safe
- **Type / Priority:** Security / P2 · **Refs:** API §7
- **Steps:** export; inspect `Content-Disposition`
- **Expected:** constant `emberlens-<type>.<ext>`; no user input interpolated; no header injection possible via dataset_type (pattern-validated).
- **Status:** Not executed

## BE-TC-135 — Method-not-allowed and 404 for unknown routes do not leak stack info
- **Type / Priority:** Functional / P2 · **Refs:** API §9
- **Steps:** `POST /api/v1/nope`; `GET /api/v1/Observations` (case); `GET //api/v1//health`
- **Expected:** 404/405 with generic JSON; router normalizes; no internal paths in body.
- **Status:** Not executed
