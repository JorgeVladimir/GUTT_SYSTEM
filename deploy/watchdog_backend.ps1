# Vigilante simple del backend de GUTT_SYSTEM (server.js, puerto 5005).
# Se ejecuta cada pocos minutos via Task Scheduler (tarea GuttSystemWatchdog, sin privilegios
# de administrador). Si nadie responde en /api/health, levanta node server.js de nuevo.
# No reemplaza un servicio real de Windows (NSSM) -- eso requiere admin, ver conversacion del
# 2026-08-18. Esto es la red de seguridad mientras tanto.

$ErrorActionPreference = 'SilentlyContinue'
$logFile = "C:\GUTT_SYSTEM\logs\watchdog.log"

$healthy = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5005/api/health" -TimeoutSec 5 -UseBasicParsing
    if ($resp.StatusCode -eq 200) { $healthy = $true }
} catch {}

if (-not $healthy) {
    # Solo mata el proceso node que corre ESTE server.js (por linea de comando), no cualquier node.exe
    # que el usuario pueda tener abierto para otra cosa (vite, server.gutt_system.js, etc.).
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
        $_.CommandLine -match 'server\.js\s*$' -and $_.CommandLine -notmatch 'server\.gutt_system\.js'
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Start-Sleep -Seconds 2

    Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server.js" `
        -WorkingDirectory "C:\GUTT_SYSTEM" -WindowStyle Hidden

    Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - backend caido, reiniciado"
} else {
    Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - ok"
}
