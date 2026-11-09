<#Requires -Version 7>
<#
.SYNOPSIS
  Start EMBERLENS (FastAPI + Vite) natively on Windows with duplicate protection.

.DESCRIPTION
  One-command native startup for local presentation:
    .\start_emberlens.ps1
  Verifies Python/Node/npm, backend/frontend directories, the national DuckDB
  file, and that ports 8000/5173 are free. If .runtime/ already tracks running
  EMBERLENS processes, it exits without launching duplicates. Processes are
  started detached with logs under .runtime/logs/ and PIDs recorded in
  .runtime/*.json (no secrets stored). On startup failure, only the processes
  this run started are cleaned up.

  Defaults (inspected from the project, not guessed):
    Backend:  127.0.0.1:8000  (vite.config.ts proxy default + backend README)
    Frontend: 127.0.0.1:5173  (Vite default + backend/config.py CORS default)
  Both can be overridden with -BackendPort / -FrontendPort / -BackendHost.

.PARAMETER BackendPort
  Backend listen port (default 8000).
.PARAMETER FrontendPort
  Frontend listen port (default 5173).
.PARAMETER BackendHost
  Backend bind host (default 127.0.0.1).
.NOTES
  Prerequisites (see README "First-time setup"): backend venv at
  backend/.venv, frontend node_modules installed, national DuckDB present.
  This script never installs dependencies and never deletes data.
#>
[CmdletBinding()]
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173,
  [string]$BackendHost = "127.0.0.1"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$BackendPidFile = Join-Path $RuntimeDir "backend.pid.json"
$FrontendPidFile = Join-Path $RuntimeDir "frontend.pid.json"

function Write-HostColored([string]$Message, [ConsoleColor]$Color = "White") {
  Write-Host $Message -ForegroundColor $Color
}

function Get-ListeningPort([int]$Port) {
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c }
  } catch {}
  try {
    $line = netstat -ano | Select-String "[:.]$Port\s" | Select-Object -First 1
    if ($line) { return $line }
  } catch {}
  return $null
}

function Test-PortFree([int]$Port, [string]$Label) {
  $hit = Get-ListeningPort $Port
  if ($hit) {
    $pidField = ""
    try { $pidField = " (PID " + $hit.OwningProcess + ")" } catch {}
    Write-HostColored "$Label port $Port is already in use$pidField. Start another instance with -FrontendPort/-BackendPort or run .\stop_emberlens.ps1 if it is an old EMBERLENS run." "Yellow"
    return $false
  }
  return $true
}

function Test-ProcessAlive([int]$PidValue) {
  if (-not $PidValue -or $PidValue -le 0) { return $false }
  return [bool](Get-Process -Id $PidValue -ErrorAction SilentlyContinue)
}

function Stop-Launched([int]$PidValue, [string]$Label) {
  if (-not $PidValue) { return }
  if (Test-ProcessAlive $PidValue) {
    try {
      Stop-Process -Id $PidValue -Force -ErrorAction SilentlyContinue
      Write-Host "[cleanup] stopped $Label (PID $PidValue)"
    } catch {
      Write-Host "[cleanup] could not stop $Label (PID $PidValue): $($_.Exception.Message)"
    }
  }
}

function Wait-ForUrl {
  param([string]$Url, [int]$TimeoutSec = 60, [string]$Label)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch {
      try {
        $ex = $_.Exception.Response
        if ($ex -and [int]$ex.StatusCode -ge 200 -and [int]$ex.StatusCode -lt 500) { return $true }
      } catch {}
    }
    Start-Sleep -Seconds 1
  }
  Write-HostColored "$Label did not respond at $Url within $TimeoutSec s." "Red"
  return $false
}

# ---- Preflight: duplicates (read .runtime first, before port checks) ----
if (Test-Path -LiteralPath $RuntimeDir) {
  foreach ($f in @($BackendPidFile, $FrontendPidFile)) {
    if (Test-Path -LiteralPath $f) {
      try {
        $meta = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json
        if ($meta.pid -and (Test-ProcessAlive ([int]$meta.pid))) {
          Write-HostColored "EMBERLENS is already running (see $f). Not launching duplicates. Run .\stop_emberlens.ps1 to stop it first." "Yellow"
          exit 0
        }
      } catch {
        Write-Host "[warn] could not parse $f; will replace it on successful startup."
      }
    }
  }
} else {
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ---- Preflight: tools and dirs ----
Write-Host "[1/6] Checking prerequisites..."
$pythonExe = $null
$venvPy = Join-Path $ProjectRoot "backend/.venv/Scripts/python.exe"
if (Test-Path -LiteralPath $venvPy) {
  $pythonExe = $venvPy
  Write-Host "  venv python: $venvPy"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  Write-HostColored "  ! backend/.venv not found. First-time setup required:" "Yellow"
  Write-Host "    cd backend"
  Write-Host "    python -m venv .venv"
  Write-Host "    .venv/Scripts/python -m pip install -r requirements-prod.txt"
  Write-Host "    .venv/Scripts/python -m pip install pytest==9.2.0 ruff==0.17.4"
  Write-Host "  Will try system python on PATH, but backend/.venv is recommended."
  $pythonExe = (Get-Command python -ErrorAction Stop).Source
} else {
  Write-HostColored "Python not found. Install Python 3.12+ or create backend/.venv (see above)." "Red"
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-HostColored "Node.js not found. Install Node.js 20+ (frontend needs it)." "Red"
  exit 1
}
$nodeVer = (& node --version) 2>&1
Write-Host "  node $nodeVer"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-HostColored "npm not found. Install npm with Node.js." "Red"
  exit 1
}
$npmVer = (& npm --version) 2>&1
Write-Host "  npm $npmVer"

$backendDir = Join-Path $ProjectRoot "backend"
$frontendDir = Join-Path $ProjectRoot "frontend"
if (-not (Test-Path -LiteralPath $backendDir -PathType Container)) {
  Write-HostColored "Backend directory missing: $backendDir" "Red"; exit 1
}
if (-not (Test-Path -LiteralPath $frontendDir -PathType Container)) {
  Write-HostColored "Frontend directory missing: $frontendDir" "Red"; exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $frontendDir "node_modules") -PathType Container)) {
  Write-HostColored "Frontend dependencies missing: $frontendDir/node_modules" "Red"
  Write-Host "  First-time setup:  cd frontend; npm ci"
  exit 1
}

# ---- Database (config-driven, never hardcoded to a user dir) ----
$dbPath = $env:EMBERLENS_DB
if (-not $dbPath -or [string]::IsNullOrWhiteSpace($dbPath)) {
  $dbPath = Join-Path $ProjectRoot "backend/emberlens-bangladesh.duckdb"
} elseif (-not [System.IO.Path]::IsPathRooted($dbPath)) {
  $dbPath = Join-Path $ProjectRoot $dbPath.TrimStart(".\")
}
if (-not (Test-Path -LiteralPath $dbPath -PathType Leaf)) {
  Write-HostColored "National DuckDB not found at: $dbPath" "Red"
  Write-Host "  Set `$env:EMBERLENS_DB to its location, or restore backend/emberlens-bangladesh.duckdb."
  Write-Host "  This script will not create or overwrite the database."
  exit 1
}
Write-Host "  database: $dbPath"

# Env sanity (informational; missing optional vars use backend defaults)
if (-not $env:FRONTEND_ORIGINS -and -not $env:FRONTEND_ORIGIN) {
  Write-Host "  FRONTEND_ORIGINS not set — backend default (5173 CORS) will apply."
}
if (-not $env:DATA_ROOT) {
  Write-Host "  DATA_ROOT not set — backend default (project data/) will apply."
}

# ---- Ports ----
Write-Host "[2/6] Checking ports..."
if (-not (Test-PortFree $BackendPort "Backend")) { exit 1 }
if (-not (Test-PortFree $FrontendPort "Frontend")) { exit 1 }

$backendLog = Join-Path $LogDir "backend.log"
$frontendLog = Join-Path $LogDir "frontend.log"
$backendErr = Join-Path $LogDir "backend.err.log"
$frontendErr = Join-Path $LogDir "frontend.err.log"
("backend","frontend") | ForEach-Object {
  foreach ($f in @("$LogDir/$_.log","$LogDir/$_.err.log")) {
    if (-not (Test-Path -LiteralPath $f)) { New-Item -ItemType File -Force -Path $f | Out-Null }
  }
}

$started = @()
try {
  # ---- Backend (cwd = project root; modules run from repo root) ----
  Write-Host "[3/6] Starting FastAPI backend ($BackendHost`:$BackendPort)..."
  $backend = Start-Process -FilePath $pythonExe -ArgumentList @(
      "-m", "uvicorn", "backend.app:app",
      "--host", $BackendHost, "--port", "$BackendPort"
    ) -WorkingDirectory $ProjectRoot -PassThru `
    -WindowStyle Hidden -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr
  $started += $backend
  $backendMeta = @{
    pid = $backend.Id
    kind = "backend"
    started_at = (Get-Date).ToUniversalTime().ToString("o")
    project_root = $ProjectRoot
    host = $BackendHost
    port = $BackendPort
    health_url = "http://$BackendHost`:$BackendPort/api/v1/health"
    python = $pythonExe
    db_path = $dbPath
    log_out = $backendLog
    log_err = $backendErr
  }
  $backendMeta | ConvertTo-Json | Set-Content -LiteralPath $BackendPidFile -Encoding utf8

  if (-not (Wait-ForUrl $backendMeta.health_url 60 "Backend")) {
    throw "Backend health check failed. See $backendLog and $backendErr"
  }
  Write-Host "  backend healthy."

  # ---- Frontend (Vite dev: npm run dev -- --port N --host --strictPort) ----
  Write-Host "[4/6] Starting Vite frontend ($FrontendPort)..."
  $npmCmd = "npm.cmd"
  if (-not (Get-Command $npmCmd -ErrorAction SilentlyContinue)) { $npmCmd = "npm" }
  $frontend = Start-Process -FilePath $npmCmd -ArgumentList @("run", "dev", "--", "--port", "$FrontendPort", "--host", "127.0.0.1", "--strictPort") -WorkingDirectory $frontendDir -PassThru `
    -WindowStyle Hidden -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr
  $started += $frontend
  $frontendMeta = @{
    pid = $frontend.Id
    kind = "frontend"
    started_at = (Get-Date).ToUniversalTime().ToString("o")
    project_root = $ProjectRoot
    host = "127.0.0.1"
    port = $FrontendPort
    url = "http://127.0.0.1`:$FrontendPort"
    log_out = $frontendLog
    log_err = $frontendErr
  }
  $frontendMeta | ConvertTo-Json | Set-Content -LiteralPath $FrontendPidFile -Encoding utf8

  # Vite can take a moment; poll the root page for any 2xx/3xx/404 (SPA responds)
  Write-Host "[5/6] Waiting for frontend..."
  if (-not (Wait-ForUrl $frontendMeta.url 45 "Frontend")) {
    throw "Frontend did not respond. See $frontendLog and $frontendErr"
  }
  Write-Host "  frontend responding."

  # npm.cmd spawns the real Vite node child; record listener PID so stop can
  # clean the child, not only the npm wrapper.
  Start-Sleep -Seconds 1
  $listener = Get-ListeningPort $FrontendPort
  if ($listener -and $listener.OwningProcess) {
    $frontendMeta.pid = [int]$listener.OwningProcess
    $frontendMeta | ConvertTo-Json | Set-Content -LiteralPath $FrontendPidFile -Encoding utf8
    Write-Host "  frontend listener PID $($listener.OwningProcess) recorded."
  }

  Write-Host "[6/6] EMBERLENS is ready."
  Write-Host ""
  Write-Host "  Frontend:  $($frontendMeta.url)"
  Write-Host "  Backend:   http://$BackendHost`:$BackendPort"
  Write-Host "  Health:    $($backendMeta.health_url)"
  Write-Host "  Logs:      $backendLog"
  Write-Host "             $frontendLog"
  Write-Host "  Stop with: .\stop_emberlens.ps1"
} catch {
  Write-HostColored "Startup failed: $($_.Exception.Message)" "Red"
  foreach ($p in $started) { Stop-Launched ([int]$p.Id) "started process" }
  foreach ($f in @($BackendPidFile, $FrontendPidFile)) {
    if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
  }
  exit 1
}
