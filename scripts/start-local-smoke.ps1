$ErrorActionPreference = 'Stop'

$repository = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $env:TEMP 'philabantay-phase1-smoke'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 4000 is already in use. Stop the existing API before the smoke test.'
}
if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 5174 is already in use. Stop the existing web server before the smoke test.'
}

$status = (& npx supabase status | ConvertFrom-Json)
$env:SUPABASE_URL = $status.API_URL
$env:SUPABASE_PUBLISHABLE_KEY = $status.PUBLISHABLE_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $status.SECRET_KEY
$env:API_PORT = '4000'
$env:WEB_ORIGIN = 'http://localhost:5174,http://127.0.0.1:5174'

$api = Start-Process -FilePath 'npm.cmd' `
  -ArgumentList @('run', 'start', '--workspace', '@barbershop/api') `
  -WorkingDirectory $repository `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDirectory 'api.out.log') `
  -RedirectStandardError (Join-Path $logDirectory 'api.err.log') `
  -PassThru

$env:VITE_DATA_BACKEND = 'api'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:4000/api/v1'
$web = Start-Process -FilePath 'npm.cmd' `
  -ArgumentList @('run', 'dev', '--workspace', '@barbershop/web', '--', '--host', '127.0.0.1') `
  -WorkingDirectory $repository `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDirectory 'web.out.log') `
  -RedirectStandardError (Join-Path $logDirectory 'web.err.log') `
  -PassThru

$deadline = (Get-Date).AddSeconds(45)
$ready = $false
do {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health' -TimeoutSec 2
    $page = Invoke-WebRequest -Uri 'http://127.0.0.1:5174/' -UseBasicParsing -TimeoutSec 2
    $ready = $health.data.status -eq 'ok' -and $page.StatusCode -eq 200
  } catch {
    $ready = $false
  }
  if (-not $ready) { Start-Sleep -Milliseconds 500 }
} until ($ready -or (Get-Date) -gt $deadline)

if (-not $ready) {
  Stop-Process -Id $api.Id, $web.Id -Force -ErrorAction SilentlyContinue
  throw "Local smoke servers did not become ready. Inspect $logDirectory."
}

[pscustomobject]@{
  ApiPid = $api.Id
  WebPid = $web.Id
  LogDirectory = $logDirectory
  Ready = $ready
} | ConvertTo-Json
