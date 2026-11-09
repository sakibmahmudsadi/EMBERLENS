<#Requires -Version 7>
<#
.SYNOPSIS
  Stop EMBERLENS processes that were started by start_emberlens.ps1.

.DESCRIPTION
  Reads .runtime/backend.pid.json and .runtime/frontend.pid.json and stops
  ONLY those PIDs — after verifying each PID still belongs to an EMBERLENS
  process (executable match + command-line marker). Unrelated python/node
  processes are never touched. Stale runtime files are removed. Safe to run
  when the app is already stopped. Never deletes the database, manifests,
  or exports; only the .runtime/ metadata for EMBERLENS.

.EXAMPLE
  .\stop_emberlens.ps1
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$BackendPidFile = Join-Path $RuntimeDir "backend.pid.json"
$FrontendPidFile = Join-Path $RuntimeDir "frontend.pid.json"

function Test-ProcessAlive([int]$PidValue) {
  if (-not $PidValue -or $PidValue -le 0) { return $false }
  return [bool](Get-Process -Id $PidValue -ErrorAction SilentlyContinue)
}

function Test-Owner([int]$PidValue, [string]$Kind) {
  """Return $true only if this PID still looks like OUR process."""
  if (-not (Test-ProcessAlive $PidValue)) { return $true }  # already gone = safe to clean up
  $proc = Get-Process -Id $PidValue -ErrorAction SilentlyContinue
  try {
    $detail = Get-CimInstance Win32_Process -Filter "ProcessId=$PidValue" -ErrorAction Stop
    $cmd = [string]$detail.CommandLine
    $exe = [string]$detail.ExecutablePath
  } catch {
    # If we cannot inspect it, do NOT kill it — could be reused by a stranger.
    Write-Host "  [skip] PID $PidValue could not be inspected; leaving it alone."
    return $false
  }
  $lowerCmd = ($cmd + " " + $exe).ToLowerInvariant()
  $expected = if ($Kind -eq "backend") { @("backend.app:app", "uvicorn") } else { @("vite", "node") }
  $ok = $false
  foreach ($needle in $expected) {
    if ($lowerCmd.Contains($needle.ToLowerInvariant())) { $ok = $true }
  }
  if (-not $ok) {
    Write-Host "  [skip] PID $PidValue is not an EMBERLENS $Kind process (cmd: $exe); leaving it alone."
    return $false
  }
  return $true
}

if (-not (Test-Path -LiteralPath $RuntimeDir)) {
  Write-Host "No .runtime/ directory — EMBERLENS is not running (or was already stopped)."
  exit 0
}

$stopped = 0; $skipped = 0; $cleaned = 0
foreach ($f in @($BackendPidFile, $FrontendPidFile)) {
  if (-not (Test-Path -LiteralPath $f)) { continue }
  $kind = if ($f -eq $BackendPidFile) { "backend" } else { "frontend" }
  try {
    $meta = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json
    $pidValue = [int]$meta.pid
    $port = $meta.port
  } catch {
    Write-Host "  [warn] unreadable $f — removing it."
    Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    $cleaned++; continue
  }

  $targets = @()
  if ($pidValue) { $targets += $pidValue }
  # npm wrapper children (Vite node) own the LISTEN socket, not the wrapper PID.
  if ($port) {
    try {
      $listener = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($listener -and $listener.OwningProcess -and $listener.OwningProcess -ne $pidValue) {
        $targets += [int]$listener.OwningProcess
      }
    } catch {}
  }

  foreach ($t in ($targets | Select-Object -Unique)) {
    if (-not (Test-ProcessAlive $t)) { continue }
    if (-not (Test-Owner $t $kind)) { $skipped++; continue }
    try {
      Stop-Process -Id $t -Force -ErrorAction SilentlyContinue
      $stopped++
      Write-Host "  $kind (PID $t, port $port): stopped."
    } catch {
      Write-Host "  $kind (PID $t): stop failed: $($_.Exception.Message)"
      $skipped++
    }
  }
  if ($targets.Count -eq 0) {
    Write-Host "  $kind (port $port): no process to stop."
  }
  Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
  $cleaned++
}

# Drop empty dirs quietly (logs remain under .runtime/logs/; that is fine).
foreach ($d in @($LogDir = Join-Path $RuntimeDir "logs", $RuntimeDir)) {
  if ((Test-Path -LiteralPath $d) -and (-not (Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue))) {
    Remove-Item -LiteralPath $d -Force -ErrorAction SilentlyContinue
  }
}

if ($stopped -eq 0 -and $cleaned -eq 0 -and $skipped -eq 0) {
  Write-Host "EMBERLENS was not running, or no runtime metadata was found."
} elseif ($stopped -gt 0) {
  Write-Host "Stopped $stopped EMBERLENS process(es); cleaned $cleaned file(s). Logs kept in .runtime\logs\ if any existed."
} else {
  Write-Host "No EMBERLENS processes stopped ($skipped skipped); cleaned $cleaned stale file(s). Nothing else was touched."
}
