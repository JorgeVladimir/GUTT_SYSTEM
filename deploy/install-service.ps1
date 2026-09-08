# ============================================================================
# install-service.ps1 - Deja GUTT_SYSTEM corriendo como servicio de arranque.
#
#   Abrir PowerShell COMO ADMINISTRADOR y ejecutar:
#     powershell -NoProfile -ExecutionPolicy Bypass -File C:\GUTT_SYSTEM\deploy\install-service.ps1
#
#   Desinstalar:
#     powershell -NoProfile -ExecutionPolicy Bypass -File C:\GUTT_SYSTEM\deploy\install-service.ps1 -Desinstalar
#
# QUE RESUELVE
# Hasta ahora el backend vivia de una tarea programada 'GuttSystemWatchdog' que corre
# cada 3 minutos SIN privilegios: solo revive el proceso si se cae, y solo mientras el
# usuario este con sesion iniciada. Si el equipo se reinicia y nadie entra, el sistema
# no arranca y el dominio publico devuelve 502. Eso no se puede vender.
#
# DOS MODOS, se elige el mejor disponible automaticamente:
#   1. NSSM   - servicio de Windows de verdad. Se usa si nssm.exe esta en el PATH o en
#               deploy\nssm.exe. Es la opcion preferida.
#   2. TAREA  - tarea programada corriendo como SYSTEM, disparada AL ARRANQUE del equipo,
#               "ejecutar aunque el usuario no haya iniciado sesion", sin limite de tiempo
#               y con reintentos. No necesita descargar nada. Es el fallback.
#
# En ambos casos se deja tambien el watchdog cada 3 minutos como red de seguridad: si el
# proceso queda vivo pero deja de responder /api/health (cuelgue de driver SQL, por ejemplo),
# el servicio no lo nota pero el watchdog si.
#
# NOTA DE ENCODING: este archivo debe mantenerse ASCII puro (sin acentos ni guiones largos).
# Windows PowerShell 5.1 lo lee como ANSI y los caracteres multibyte rompen el parseo.
# ============================================================================
param(
    [switch]$Desinstalar,
    [string]$Repo = 'C:\GUTT_SYSTEM',
    [string]$NombreServicio = 'GuttSystemBackend',
    [string]$NombreWatchdog = 'GuttSystemWatchdog'
)

$ErrorActionPreference = 'Stop'

function Escribir($nivel, $texto) {
    $color = switch ($nivel) { 'OK' { 'Green' } 'ERROR' { 'Red' } 'AVISO' { 'Yellow' } default { 'Gray' } }
    Write-Host ("  [{0}] {1}" -f $nivel, $texto) -ForegroundColor $color
}

# --- 1. Exige elevacion. Sin admin no se puede crear un servicio ni una tarea SYSTEM. ---
$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ''
    Escribir 'ERROR' 'Este script necesita privilegios de administrador.'
    Write-Host ''
    Write-Host '  Abra PowerShell como administrador (clic derecho > Ejecutar como administrador) y corra:'
    Write-Host ("    powershell -NoProfile -ExecutionPolicy Bypass -File {0}\deploy\install-service.ps1" -f $Repo)
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host '  GUTT_SYSTEM - Instalacion del servicio de backend'
Write-Host ('  ' + ('-' * 64))

# --- 2. Desinstalacion ---
if ($Desinstalar) {
    $svc = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
    if ($svc) {
        Stop-Service -Name $NombreServicio -Force -ErrorAction SilentlyContinue
        $nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
        if ($nssm) { & $nssm.Source remove $NombreServicio confirm | Out-Null }
        else { & sc.exe delete $NombreServicio | Out-Null }
        Escribir 'OK' ("Servicio {0} eliminado." -f $NombreServicio)
    } else {
        Escribir 'AVISO' ("No existe el servicio {0}." -f $NombreServicio)
    }
    if (Get-ScheduledTask -TaskName $NombreServicio -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $NombreServicio -Confirm:$false
        Escribir 'OK' ("Tarea {0} eliminada." -f $NombreServicio)
    }
    Write-Host ''
    exit 0
}

# --- 3. Verificaciones previas: sin esto el servicio arranca y muere en silencio ---
if (-not (Test-Path (Join-Path $Repo 'server.js'))) {
    Escribir 'ERROR' ("No se encontro server.js en {0}. Use -Repo para indicar la ruta correcta." -f $Repo)
    exit 1
}
if (-not (Test-Path (Join-Path $Repo 'api\.env'))) {
    Escribir 'ERROR' ("Falta {0}\api\.env. El backend no puede conectarse a SQL Server sin ese archivo." -f $Repo)
    exit 1
}
if (-not (Test-Path (Join-Path $Repo 'dist\index.html'))) {
    Escribir 'AVISO' 'No existe dist\index.html. El backend servira solo la API, no el frontend. Corra: npm run build'
}

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Escribir 'ERROR' 'No se encontro node.exe en el PATH. Instale Node.js o agreguelo al PATH del sistema.'
    exit 1
}
$nodeExe = $nodeCmd.Source
Escribir 'OK' ("Node: {0}" -f $nodeExe)

$logs = Join-Path $Repo 'logs'
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }

# El proceso que ya este corriendo se detiene: dos instancias pelean por el puerto 5005.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'server\.js\s*$' -and $_.CommandLine -notmatch 'gutt_system' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# --- 4. Modo NSSM (preferido) ---
# Se busca en deploy\, en el PATH y en C:\nssm (donde ya quedo de un intento previo de
# instalacion: el servicio GuttSystemBackend estaba registrado apuntando a C:\nssm\nssm.exe
# pero detenido, porque esa sesion no tenia privilegios para terminar de configurarlo).
$nssm = $null
foreach ($candidato in @((Join-Path $Repo 'deploy\nssm.exe'), 'C:\nssm\nssm.exe')) {
    if (Test-Path $candidato) { $nssm = $candidato; break }
}
if (-not $nssm) {
    $enPath = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($enPath) { $nssm = $enPath.Source }
}

$modo = ''
if ($nssm) {
    Escribir 'INFO' ("NSSM encontrado en {0}: se instala como servicio de Windows." -f $nssm)
    $svc = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
    if ($svc) {
        Stop-Service -Name $NombreServicio -Force -ErrorAction SilentlyContinue
        & $nssm remove $NombreServicio confirm | Out-Null
        Start-Sleep -Seconds 2
    }
    & $nssm install $NombreServicio $nodeExe 'server.js' | Out-Null
    & $nssm set $NombreServicio AppDirectory $Repo | Out-Null
    & $nssm set $NombreServicio DisplayName 'GUTT SYSTEM - Backend (API + frontend, puerto 5005)' | Out-Null
    & $nssm set $NombreServicio Description 'Core bancario GUTT SYSTEM. Sirve la API y el build de dist/ en el puerto 5005.' | Out-Null
    & $nssm set $NombreServicio Start SERVICE_AUTO_START | Out-Null
    & $nssm set $NombreServicio AppStdout (Join-Path $logs 'backend.out.log') | Out-Null
    & $nssm set $NombreServicio AppStderr (Join-Path $logs 'backend.err.log') | Out-Null
    # Rotacion: sin esto el log crece sin limite hasta llenar el disco.
    & $nssm set $NombreServicio AppRotateFiles 1 | Out-Null
    & $nssm set $NombreServicio AppRotateOnline 1 | Out-Null
    & $nssm set $NombreServicio AppRotateBytes 10485760 | Out-Null
    # Reinicio automatico si el proceso muere, con espera creciente.
    & $nssm set $NombreServicio AppExit Default Restart | Out-Null
    & $nssm set $NombreServicio AppRestartDelay 5000 | Out-Null
    Start-Service -Name $NombreServicio
    $modo = 'servicio de Windows (NSSM)'
} else {
    # --- 5. Modo TAREA SYSTEM (fallback sin descargas) ---
    Escribir 'INFO' 'NSSM no disponible: se instala como tarea programada SYSTEM al arranque.'
    Escribir 'INFO' 'Para un servicio de Windows real, copie nssm.exe a deploy\nssm.exe y vuelva a correr este script.'

    if (Get-ScheduledTask -TaskName $NombreServicio -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $NombreServicio -Confirm:$false
    }

    $accion = New-ScheduledTaskAction -Execute $nodeExe -Argument 'server.js' -WorkingDirectory $Repo
    $disparador = New-ScheduledTaskTrigger -AtStartup
    $entidad = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # ExecutionTimeLimit 0 = sin limite (un backend no "termina").
    # RestartCount/RestartInterval cubren la caida del proceso.
    $opciones = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd `
        -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

    Register-ScheduledTask -TaskName $NombreServicio -Action $accion -Trigger $disparador `
        -Principal $entidad -Settings $opciones `
        -Description 'GUTT SYSTEM - Backend (API + frontend, puerto 5005). Arranca con el equipo, sin requerir sesion iniciada.' | Out-Null

    Start-ScheduledTask -TaskName $NombreServicio
    $modo = 'tarea programada SYSTEM al arranque'
}

# --- 6. Watchdog: el servicio revive un proceso MUERTO; el watchdog revive uno COLGADO ---
$watchdogScript = Join-Path $Repo 'deploy\watchdog_backend.ps1'
if (Test-Path $watchdogScript) {
    if (Get-ScheduledTask -TaskName $NombreWatchdog -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $NombreWatchdog -Confirm:$false
    }
    $accionW = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $watchdogScript)
    $dispW = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) `
        -RepetitionInterval (New-TimeSpan -Minutes 3)
    $entidadW = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $opcW = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $NombreWatchdog -Action $accionW -Trigger $dispW `
        -Principal $entidadW -Settings $opcW `
        -Description 'GUTT SYSTEM - Revisa /api/health cada 3 minutos y relanza el backend si no responde.' | Out-Null
    Escribir 'OK' ("Watchdog {0} reinstalado como SYSTEM, cada 3 minutos." -f $NombreWatchdog)
} else {
    Escribir 'AVISO' ("No se encontro {0}: no se instalo el watchdog." -f $watchdogScript)
}

# --- 7. Verificacion: no se declara instalado hasta que /api/health responda ---
Write-Host ''
Escribir 'INFO' 'Esperando a que /api/health responda...'
$arriba = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5005/api/health' -TimeoutSec 2 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $arriba = $true; break }
    } catch { }
}

Write-Host ''
if ($arriba) {
    Escribir 'OK' ("Backend arriba como {0}." -f $modo)
    Escribir 'OK' 'Sobrevive al reinicio del equipo y no necesita sesion iniciada.'
    Write-Host ''
    Write-Host '  Comprobar estado:'
    if ($nssm) { Write-Host ("    Get-Service {0}" -f $NombreServicio) }
    else { Write-Host ("    Get-ScheduledTask {0} | Get-ScheduledTaskInfo" -f $NombreServicio) }
    Write-Host ("    Get-Content {0}\logs\watchdog.log -Tail 5" -f $Repo)
    Write-Host ''
    exit 0
}

Escribir 'ERROR' 'El backend no respondio en 30 segundos.'
Write-Host ("  Revise {0}\logs\backend.err.log y que SQL Server acepte las credenciales de api\.env." -f $Repo)
Write-Host ''
exit 1
