# Reinicia server.js (puerto 5005) y espera a que /api/health responda.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/restart-backend.ps1
#
# NOTA DE ENCODING: este archivo debe mantenerse ASCII puro (sin acentos ni guiones largos).
# Windows PowerShell 5.1 lo lee como ANSI y los caracteres multibyte rompen el parseo.
#
# Detalle ya pagado: NO usar -RedirectStandardOutput/-RedirectStandardError al lanzar node.
# Con redireccion el proceso queda vivo pero nunca llega a escuchar el puerto.
# El arranque tarda ~6-10s (conexion a SQL Server), por eso el bucle de espera.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$nodeExe = (Get-Command node).Source

# Solo mata el node que corre ESTE server.js: no toca vite ni server.gutt_system.js.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'server\.js\s*$' -and $_.CommandLine -notmatch 'gutt_system' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

$proc = Start-Process -FilePath $nodeExe -ArgumentList 'server.js' -WorkingDirectory $repo -WindowStyle Hidden -PassThru
Write-Host "server.js lanzado (PID $($proc.Id)), esperando /api/health..."

$ok = $false
foreach ($i in 1..20) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5005/api/health' -TimeoutSec 2 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            Write-Host "OK - backend arriba en $i s (PID $($proc.Id))"
            $ok = $true
            break
        }
    } catch {
        # health todavia no responde; se reintenta
    }
}

if (-not $ok) {
    Write-Host "FALLO - /api/health no respondio en 20s. Revisar con: Get-Process -Id $($proc.Id)"
    exit 1
}
exit 0
