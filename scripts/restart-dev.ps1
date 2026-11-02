# Reinicia os processos de desenvolvimento (servidor de gerenciamento 8090 com o painel em /admin, backend 8080 e frontend 5173)
# quando algum arquivo do projeto mudou desde o último reinício. Usado pelo hook "Stop" do Claude Code (.claude/settings.json),
# mas também pode ser rodado à mão:  powershell -ExecutionPolicy Bypass -File scripts/restart-dev.ps1 -Force
# O banco (porta 27017) não é reiniciado: só é iniciado se não estiver rodando.
param([switch]$Force)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root ".claude\dev-servers"
$marker = Join-Path $stateDir "last-restart"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$watched = @(
  "frontend\src", "frontend\public\modelos", "frontend\index.html", "frontend\vite.config.js", "frontend\package.json", "frontend\.env",
  "backend\src", "backend\index.js", "backend\package.json", "backend\.env",
  "server\src", "server\index.js", "server\package.json", "server\.env",
  "server\admin-panel\src", "server\admin-panel\index.html", "server\admin-panel\vite.config.js", "server\admin-panel\package.json"
) | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }

function Get-LastChange {
  $files = Get-ChildItem -Path $watched -Recurse -File -ErrorAction SilentlyContinue
  ($files | Measure-Object -Property LastWriteTimeUtc -Maximum).Maximum
}

$lastRestart = if (Test-Path $marker) { (Get-Item $marker).LastWriteTimeUtc } else { [datetime]::MinValue }
$lastChange = Get-LastChange
if (-not $Force -and $lastChange -le $lastRestart) { exit 0 }

function Stop-Tree([int]$processId) {
  # Pelo cmd: no PowerShell 5.1 o aviso "processo não encontrado" viraria erro e pararia o script.
  & cmd.exe /c "taskkill /PID $processId /T /F >nul 2>&1"
}

# Encerra o servidor que este script iniciou da última vez (a árvore inteira: cmd -> npm -> node --watch -> node).
function Stop-Started([string]$name) {
  $pidFile = Join-Path $stateDir "$name.pid"
  if (Test-Path $pidFile) {
    Stop-Tree ([int](Get-Content $pidFile))
    Remove-Item $pidFile -Force
  }
}

# Garantia para servidores iniciados por fora do script: encerra quem está na porta e, se o pai
# for um "node --watch" ou npm (que reiniciaria o filho), encerra o pai também.
function Stop-Port([int]$port) {
  $owners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $owners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    $parent = if ($process) { Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)" -ErrorAction SilentlyContinue }
    if ($parent -and $parent.CommandLine -match "--watch|npm") { Stop-Tree $parent.ProcessId }
    Stop-Tree $processId
  }
}

function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Start-Hidden([string]$name, [string]$directory, [string]$npmArgs) {
  $log = Join-Path $stateDir "$name.log"
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm $npmArgs > `"$log`" 2>&1" -WorkingDirectory $directory -WindowStyle Hidden -PassThru
  Set-Content -Path (Join-Path $stateDir "$name.pid") -Value $process.Id
}

if (-not (Test-Port 27017)) {
  Start-Hidden "database" (Join-Path $root "server") "run db:local"
  for ($i = 0; $i -lt 40 -and -not (Test-Port 27017); $i++) { Start-Sleep -Milliseconds 500 }
}

foreach ($name in "server", "backend", "frontend") { Stop-Started $name }
foreach ($port in 8090, 8080, 5173) { Stop-Port $port }
for ($i = 0; $i -lt 20 -and ((Test-Port 8090) -or (Test-Port 8080) -or (Test-Port 5173)); $i++) { Start-Sleep -Milliseconds 250 }

# Painel: gera o build (servido pelo servidor em /admin) se o código dele mudou depois do último build.
$panel = Join-Path $root "server\admin-panel"
$panelBuild = Join-Path $panel "dist\index.html"
$panelSources = @("src", "index.html", "vite.config.js", "package.json") | ForEach-Object { Join-Path $panel $_ }
$panelChange = (Get-ChildItem -Path $panelSources -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property LastWriteTimeUtc -Maximum).Maximum
if (-not (Test-Path $panelBuild) -or $panelChange -gt (Get-Item $panelBuild).LastWriteTimeUtc) {
  $panelLog = Join-Path $stateDir "admin-panel.log"
  if (-not (Test-Path (Join-Path $panel "node_modules"))) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm install --no-audit --no-fund > `"$panelLog`" 2>&1" -WorkingDirectory $panel -WindowStyle Hidden -Wait
  }
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run build >> `"$panelLog`" 2>&1" -WorkingDirectory $panel -WindowStyle Hidden -Wait
}

# Ordem: servidor (dono do banco) -> backend (pede dados ao servidor) -> frontend.
Start-Hidden "server" (Join-Path $root "server") "run dev"
for ($i = 0; $i -lt 40 -and -not (Test-Port 8090); $i++) { Start-Sleep -Milliseconds 500 }
Start-Hidden "backend" (Join-Path $root "backend") "run dev"
Start-Hidden "frontend" (Join-Path $root "frontend") "run dev -- --port 5173 --strictPort"

# Espera todos responderem (até ~30 s) antes de avisar.
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  Start-Sleep -Milliseconds 500
  $ready = (Test-Port 8090) -and (Test-Port 8080) -and (Test-Port 5173)
}

Set-Content -Path $marker -Value (Get-Date -Format o)
$message = if ($ready) { "Signa Ludus reiniciado (web 5173, backend 8080, servidor 8090, painel 127.0.0.1:8090/admin)." } else { "Reiniciei os servidores, mas eles ainda não responderam. Veja .claude/dev-servers/*.log" }
@{ systemMessage = $message } | ConvertTo-Json -Compress
exit 0
