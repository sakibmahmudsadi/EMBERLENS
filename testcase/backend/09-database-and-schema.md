# 09 — Database and schema (DuckDB)

Target: `backend/db/database.py`

---

## BE-TC-111 — Schema creates all tables and indexes idempotently
- **Type / Priority:** Functional / P0 · **Refs:** DATA_DICT §2; PIPE §7
- **Steps:** `init_db(":memory:")`; `migrate()` twice; `\d` equivalent listing tables
- **Expected:** `source_snapshot`, `fire_observation`, `data_availability`, `aoi`, `calendar_aggregate`; indexes `idx_obs_sensor_platform_time`, `idx_obs_snapshot`, `idx_obs_fingerprint`, `idx_cal_aoi_period`; second `migrate()` is a no-op (no error, no duplicates); FKs declared (`fire_observation.source_snapshot_id → source_snapshot`), noting DuckDB does not enforce FKs on `INSERT OR IGNORE` paths — see BE-TC-114.
- **Status:** Not executed

## BE-TC-112 — Schema is one-shot `CREATE IF NOT EXISTS` with **no migration versioning**
- **Type / Priority:** NonFunctional / P1 · **Refs:** ARCHITECTURE §3; D-28
- **Steps:** create DB at v0 schema; later add a column to `SCHEMA`; re-run `migrate()`; inspect table definition
- **Expected (spec):** Alembic (or documented upgrade path) adds the column; old DB upgraded or explicit error-with-command.
- **Actual (code review):** existing file DBs never gain new columns; app may fail with obscure binder errors after schema edits. Acceptable only if frozen for demo and documented.
- **Status:** Code-review finding — D-28

## BE-TC-113 — `source_snapshot.source_file_uri` stores absolute path (privacy/ops)
- **Type / Priority:** Security / P1 · **Refs:** API §10; D-01
- **Steps:** load any file; `SELECT source_file_uri FROM source_snapshot`
- **Expected (spec):** repo-relative or opaque object key; no `C:\Users\<name>\…`.
- **Status:** Covered by BE-TC-005 (client-visible) — confirm storage too

## BE-TC-114 — FK from fire_observation to source_snapshot is unenforced under `INSERT OR IGNORE`
- **Type / Priority:** DataIntegrity / P1 · **Refs:** DATA_DICT §2; D-12/D-13 adjacency
- **Steps:** in scratch DB, `DELETE` the parent snapshot, then attempt to insert an observation for it; inspect result
- **Expected (spec):** rejected (parent must exist); or documented that DuckDB FKs are not enforced and pipeline guarantees order.
- **Status:** Not executed

## BE-TC-115 — `source_row_fingerprint` has an index but no uniqueness constraint
- **Type / Priority:** DataIntegrity / P1 · **Refs:** DATA_DICT §4; PIPE §5
- **Steps:** attempt two observations with identical fingerprint and different snapshot ids (via loader bug BE-TC-076); query duplicates
- **Expected:** unique index scoped `(product_id, collection_version, source_row_fingerprint)` or explicit would-be-duplicates report; current index speeds lookup but does not prevent the silent drop.
- **Status:** Not executed

## BE-TC-116 — Query observations ordering is deterministic and indexed
- **Type / Priority:** NonFunctional / P1 · **Refs:** API §3; ARCHITECTURE §11
- **Steps:** `ORDER BY acquired_at_utc, observation_id`; verify with 10k synthetic rows that pages are stable and EXPLAIN uses an ordered scan (not full-table sort) if performance matters
- **Expected:** stable order; no Boyce–Codd surprises; no sort spill for demo-size data (~2k rows — fine).
- **Status:** Not executed

## BE-TC-117 — `page` / `page_size` clamps preserve `total` integrity
- **Type / Priority:** Boundary / P1 · **Refs:** API §3
- **Steps:** `page=0`, `page_size=0`, `page_size=10000`, on empty and 1-row results; compare `total`
- **Expected:** `total` from filtered count, unaffected by clamping; page ≥ 1; page_size ∈ [1,1000].
- **Status:** Not executed

## BE-TC-118 — Case sensitivity: database collation vs Python filters
- **Type / Priority:** Boundary / P2 · **Refs:** D-25
- **Steps:** insert `MODIS_NRT`; query `sensor IN ('modis_nrt')`; also `product_id ILIKE` path used by `/coverage`
- **Expected:** both behaviours documented; one consistent convention; tests pin it.
- **Status:** Not executed

## BE-TC-119 — `observations_for_calendar` ignores AOI/time in SQL (all rows pulled)
- **Type / Priority:** Performance / P2 · **Refs:** ARCHITECTURE §11; D-29
- **Steps:** inspect SQL; time aggregator on full table vs filtered; note EXPLAIN
- **Expected (spec):** filter in SQL (`WHERE acquired_at_utc >= ? AND …`) once data grows; for prototype (~2k rows) acceptable but documented.
- **Status:** Code-review finding — D-29 (low)

## BE-TC-120 — `calendar_aggregate` upsert is deterministic (uuid5) — no duplicates
- **Type / Priority:** DataIntegrity / P1 · **Refs:** METH §14; D-23
- **Steps:** run `/calendar` twice; `SELECT count(*), count(DISTINCT aggregate_id) FROM calendar_aggregate`
- **Expected:** equal counts; `generated_at_utc` refreshed (known side effect — see BE-TC-050).
- **Status:** Not executed

## BE-TC-121 — DuckDB WAL and `*.duckdb` binary are not version-controlled
- **Type / Priority:** Security / P2 · **Refs:** CLAUDE.md §5; .gitignore
- **Steps:** check `.gitignore` for `*.duckdb`, `*.duckdb.wal`; `git status` in project root shows `backend/emberlens.duckdb` as untracked or ignored
- **Expected:** both ignored (data must not enter git; it also carries ingestion paths). Current `.gitignore` covers `*.sqlite`/`*.db` but **not** `*.duckdb` — add both patterns.
- **Status:** Code-review finding — D-20 adjacency

## BE-TC-122 — AOI geometry survives WKT round-trip (Polygon vs MultiPolygon)
- **Type / Priority:** Boundary / P1 · **Refs:** DATA_DICT §2 (`aoi`); ARCHITECTURE §6
- **Steps:** store `MultiPolygon`; retrieve via `get_aoi`; compare `covers()` results vs original; store polygon with hole; concave polygon; antimeridian polygon if ever supported
- **Expected:** geometry semantics preserved; `crs` column intact; holes behave in `covers`.
- **Status:** Not executed

## BE-TC-123 — Timestamps: mixing naive/aware datetimes must not corrupt comparisons
- **Type / Priority:** Boundary / P1 · **Refs:** ARCHITECTURE §6; D-30
- **Steps:** insert aware datetime into DuckDB `TIMESTAMP` column; read back; compare to naive `datetime.now(timezone.utc)`; inspect `_serialize` output offsets
- **Expected:** either all UTC-aware with explicit `Z`/offset in API output, or all naive documented as UTC; no mixed naive/aware comparisons at API boundary; verify sorting matches wall-clock order.
- **Status:** Not executed (DuckDB timestamp behaviour to be pinned by test)

## BE-TC-124 — Concurrent readers during `/calendar` recompute (WAL growth)
- **Type / Priority:** NonFunctional / P2 · **Refs:** ARCHITECTURE §11; D-23
- **Steps:** two threads hammer `/calendar` for 60 s on scratch DB; observe WAL size and lock errors; then inspect `calendar_aggregate` row count
- **Expected:** no corruption; WAL bounded; readers do not mutate; or documented "single-writer demo only".
- **Status:** Not executed
