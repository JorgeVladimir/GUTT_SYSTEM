# ============================================================================
# preflight.ps1 - Checklist ejecutable de "listo para instalar en un cliente".
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\GUTT_SYSTEM\deploy\preflight.ps1
#
# No es documentacion: cada punto se COMPRUEBA. Sale con codigo 0 solo si todo lo
# bloqueante pasa. Pensado para correrlo antes de una instalacion y despues de cada
# despliegue, y para que el resultado se pueda pegar en un acta de entrega.
#
# NOTA DE ENCODING: mantener en ASCII puro (Windows PowerShell 5.1 lo lee como ANSI).
# ============================================================================
param(
    [string]$Repo = 'C:\GUTT_SYSTEM',
    [string]$UrlSalud = 'http://127.0.0.1:5005/api/health'
)

$ErrorActionPreference = 'Continue'

$script:Fallos = 0
$script:Avisos = 0

function Resultado($estado, $titulo, $detalle) {
    switch ($estado) {
        'OK'    { Write-Host ("  [ OK ] {0}" -f $titulo) -ForegroundColor Green }
        'FALLA' { Write-Host ("  [FALLA] {0}" -f $titulo) -ForegroundColor Red; $script:Fallos++ }
        'AVISO' { Write-Host ("  [AVISO] {0}" -f $titulo) -ForegroundColor Yellow; $script:Avisos++ }
    }
    if ($detalle) { Write-Host ("         {0}" -f $detalle) -ForegroundColor DarkGray }
}

# Get-ScheduledTask NO devuelve las tareas cuyo principal es SYSTEM cuando la consulta
# corre sin elevacion: no falla, simplemente no las ve. Sin distinguir "no existe" de
# "no puedo verla", el preflight declaraba NO LISTO un equipo correctamente instalado,
# que es peor que no verificar nada: manda a reinstalar algo que ya estaba bien.
$Elevado = ([Security.Principal.WindowsPrincipal] `
            [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

function EstadoTarea([string]$nombre) {
    if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) { return 'SI' }
    if (-not $Elevado) { return 'INDETERMINADO' }
    return 'NO'
}

function Leer-Env([string]$ruta) {
    $mapa = @{}
    if (-not (Test-Path $ruta)) { return $mapa }
    foreach ($linea in (Get-Content $ruta)) {
        $t = $linea.Trim()
        if ($t -eq '' -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
        $i = $t.IndexOf('=')
        $mapa[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
    return $mapa
}

Write-Host ''
Write-Host '  GUTT SYSTEM - Verificacion previa a produccion'
Write-Host ('  ' + ('=' * 66))
Write-Host ("  Equipo: {0}   Fecha: {1}" -f $env:COMPUTERNAME, (Get-Date -Format 'yyyy-MM-dd HH:mm'))
Write-Host ''

# --- 1. Archivos del proyecto ---
Write-Host '  1. Archivos y build'
if (Test-Path (Join-Path $Repo 'server.js')) { Resultado 'OK' 'server.js presente' $null }
else { Resultado 'FALLA' 'No se encontro server.js' ("Ruta revisada: {0}" -f $Repo) }

$distIndex = Join-Path $Repo 'dist\index.html'
if (Test-Path $distIndex) {
    $edadDist = (Get-Date) - (Get-Item $distIndex).LastWriteTime
    if ($edadDist.TotalDays -gt 30) {
        Resultado 'AVISO' 'dist/ existe pero tiene mas de 30 dias' 'Puede no reflejar el codigo actual. Corra: npm run build'
    } else {
        Resultado 'OK' ("dist/ construido hace {0:N0} dia(s)" -f $edadDist.TotalDays) $null
    }
} else {
    Resultado 'FALLA' 'No existe dist/index.html' 'El backend serviria solo la API. Corra: npm run build'
}

if (Test-Path (Join-Path $Repo 'node_modules')) { Resultado 'OK' 'node_modules instalado' $null }
else { Resultado 'FALLA' 'Falta node_modules' 'Corra: npm install' }

# --- 2. Configuracion ---
Write-Host ''
Write-Host '  2. Configuracion (api\.env)'
$rutaEnv = Join-Path $Repo 'api\.env'
$cfg = Leer-Env $rutaEnv
if ($cfg.Count -eq 0) {
    Resultado 'FALLA' 'No se pudo leer api\.env' ("Ruta: {0}" -f $rutaEnv)
} else {
    $obligatorias = @('SQL_SERVER_HOST','SQL_SERVER_DATABASE','SQL_SERVER_USER','SQL_SERVER_PASSWORD','JWT_SECRET')
    $faltan = $obligatorias | Where-Object { -not $cfg[$_] }
    if ($faltan.Count -eq 0) { Resultado 'OK' 'Variables obligatorias definidas' $null }
    else { Resultado 'FALLA' 'Faltan variables obligatorias' ($faltan -join ', ') }

    if ($cfg['JWT_SECRET'] -and $cfg['JWT_SECRET'].Length -lt 32) {
        Resultado 'FALLA' 'JWT_SECRET demasiado corto' 'Use al menos 32 caracteres aleatorios: un secreto debil permite falsificar sesiones.'
    } elseif ($cfg['JWT_SECRET']) {
        Resultado 'OK' ("JWT_SECRET de {0} caracteres" -f $cfg['JWT_SECRET'].Length) $null
    }

    if ($cfg['SMTP_USER'] -and $cfg['SMTP_PASS']) {
        Resultado 'OK' 'SMTP configurado' 'Verifique el envio real con: node tools\smtp.mjs destino@dominio.com'
    } else {
        Resultado 'AVISO' 'SMTP sin configurar' 'La recuperacion de contrasena no enviara correo; el enlace queda en el log del servidor.'
    }
}

# --- 3. Base de datos ---
Write-Host ''
Write-Host '  3. Base de datos'
if ($cfg['SQL_SERVER_HOST']) {
    $srv = $cfg['SQL_SERVER_HOST']
    if ($cfg['SQL_SERVER_INSTANCE']) { $srv = "$srv\$($cfg['SQL_SERVER_INSTANCE'])" }
    $cadena = "Server=$srv;Database=$($cfg['SQL_SERVER_DATABASE']);User Id=$($cfg['SQL_SERVER_USER']);Password=$($cfg['SQL_SERVER_PASSWORD']);TrustServerCertificate=True;Encrypt=True;Connect Timeout=10"
    try {
        $cn = New-Object System.Data.SqlClient.SqlConnection($cadena)
        $cn.Open()
        $cmd = $cn.CreateCommand()
        # Se comprueban las tablas que los procesos de cierre necesitan: si falta alguna,
        # el sistema arranca igual y falla recien el dia del cierre mensual.
        $cmd.CommandText = @"
SELECT
  (SELECT COUNT(*) FROM dbo.PlanCuentas) AS Cuentas,
  (SELECT COUNT(*) FROM sys.tables WHERE name IN
     ('ReclasificacionCartera','ParametrosProvisionCartera','PonderacionesRiesgo',
      'ParametrosPatrimonioTecnico','ParametrosRegulatorios')) AS TablasProceso,
  (SELECT COUNT(*) FROM dbo.Usuarios WHERE Activo = 1) AS UsuariosActivos
"@
        $r = $cmd.ExecuteReader()
        if ($r.Read()) {
            $cuentas = $r['Cuentas']; $tablas = $r['TablasProceso']; $usuarios = $r['UsuariosActivos']
            Resultado 'OK' ("Conexion a {0} correcta" -f $cfg['SQL_SERVER_DATABASE']) ("Servidor: {0}" -f $srv)
            if ($cuentas -ge 1000) { Resultado 'OK' ("Catalogo Unico de Cuentas cargado ({0} cuentas)" -f $cuentas) $null }
            else { Resultado 'FALLA' ("Catalogo de cuentas incompleto ({0} cuentas)" -f $cuentas) 'Se esperan ~1100 del Catalogo Unico SEPS.' }
            if ($tablas -eq 5) { Resultado 'OK' 'Tablas de procesos regulatorios presentes' 'Reclasificacion de cartera, provisiones, ponderaciones y limites.' }
            else { Resultado 'FALLA' ("Faltan tablas de procesos regulatorios ({0} de 5)" -f $tablas) 'Ejecute db\sqlserver\30_, 31_ y 32_ con: node tools\run-sql.mjs <archivo>' }
            if ($usuarios -ge 1) { Resultado 'OK' ("{0} usuario(s) activo(s)" -f $usuarios) $null }
            else { Resultado 'FALLA' 'No hay usuarios activos' 'Nadie podria iniciar sesion.' }
        }
        $r.Close(); $cn.Close()

        # Migraciones pendientes. Este punto existe por un caso real: 20_ice_seps.sql
        # estuvo commiteado sin ejecutarse y dejo la aprobacion de creditos caida,
        # escribiendo columnas que no existian. Un esquema incompleto arranca igual y
        # falla el dia que se usa el modulo afectado.
        Push-Location $Repo
        try {
            $salidaMigr = & node tools\migrate.mjs 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                Resultado 'OK' 'Esquema al dia: sin migraciones pendientes' $null
            } else {
                $lineaPend = ($salidaMigr -split "`n" | Where-Object { $_ -match 'Pendientes:' }) -join ' '
                Resultado 'FALLA' 'Hay migraciones de base de datos sin aplicar' `
                    (("{0} - aplique con: node tools\migrate.mjs --aplicar" -f $lineaPend.Trim()))
            }
        } catch {
            Resultado 'AVISO' 'No se pudo comprobar el estado de las migraciones' $_.Exception.Message
        } finally { Pop-Location }
    } catch {
        Resultado 'FALLA' 'No se pudo conectar a SQL Server' $_.Exception.Message
    }
} else {
    Resultado 'FALLA' 'Sin datos de conexion a SQL Server' 'Revise api\.env'
}

# --- 4. Servicio ---
Write-Host ''
Write-Host '  4. Arranque automatico'
$svc = Get-Service -Name 'GuttSystemBackend' -ErrorAction SilentlyContinue
$tarea = (EstadoTarea 'GuttSystemBackend') -eq 'SI'
if ($svc) {
    if ($svc.Status -eq 'Running') { Resultado 'OK' 'Servicio GuttSystemBackend en ejecucion' ("Inicio: {0}" -f $svc.StartType) }
    else { Resultado 'FALLA' ("Servicio GuttSystemBackend detenido ({0})" -f $svc.Status) 'Arranque con: Start-Service GuttSystemBackend' }
} elseif ($tarea) {
    Resultado 'OK' 'Tarea GuttSystemBackend registrada (arranque del equipo, como SYSTEM)' 'Para un servicio de Windows real, ponga nssm.exe en deploy\ y reinstale.'
} else {
    Resultado 'FALLA' 'El backend no tiene arranque automatico' 'Ejecute como administrador: deploy\install-service.ps1'
}

switch (EstadoTarea 'GuttSystemWatchdog') {
    'SI' { Resultado 'OK' 'Watchdog registrado' 'Revive el backend si deja de responder /api/health.' }
    'NO' { Resultado 'AVISO' 'Sin watchdog' 'Un proceso colgado (vivo pero sin responder) no se recuperaria solo.' }
    default { Resultado 'AVISO' 'Watchdog no verificable sin elevacion' 'Repita en PowerShell como administrador para comprobarlo.' }
}

# --- 5. Salud del backend ---
Write-Host ''
Write-Host '  5. Backend en linea'
try {
    $resp = Invoke-WebRequest -Uri $UrlSalud -TimeoutSec 8 -UseBasicParsing
    if ($resp.StatusCode -eq 200) { Resultado 'OK' ("{0} responde 200" -f $UrlSalud) $null }
    else { Resultado 'FALLA' ("{0} respondio {1}" -f $UrlSalud, $resp.StatusCode) $null }
} catch {
    Resultado 'FALLA' ("{0} no responde" -f $UrlSalud) $_.Exception.Message
}

# --- 6. Respaldos ---
Write-Host ''
Write-Host '  6. Respaldos'
switch (EstadoTarea 'GuttSystemBackupDB') {
    'SI' { Resultado 'OK' 'Tarea de respaldo diaria registrada' $null }
    'NO' { Resultado 'FALLA' 'Sin respaldo automatico de la base' 'Ejecute como administrador: deploy\backup-db.ps1 -Instalar' }
    default { Resultado 'AVISO' 'Tarea de respaldo no verificable sin elevacion' 'Repita en PowerShell como administrador para comprobarlo.' }
}

$dirBk = Join-Path $Repo 'backups'
if (Test-Path $dirBk) {
    $ultimo = Get-ChildItem -Path $dirBk -Filter '*.bak' -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($ultimo) {
        $horas = ((Get-Date) - $ultimo.LastWriteTime).TotalHours
        if ($horas -le 26) { Resultado 'OK' ("Ultimo respaldo hace {0:N1} h" -f $horas) ("{0} ({1:N1} MB)" -f $ultimo.Name, ($ultimo.Length / 1MB)) }
        else { Resultado 'FALLA' ("El ultimo respaldo tiene {0:N0} h" -f $horas) 'La tarea diaria no esta corriendo.' }
    } else {
        Resultado 'FALLA' 'No hay ningun respaldo en disco' 'Genere el primero: deploy\backup-db.ps1'
    }
} else {
    Resultado 'FALLA' ("No existe {0}" -f $dirBk) 'Genere el primer respaldo: deploy\backup-db.ps1'
}

# --- 7. Espacio en disco ---
Write-Host ''
Write-Host '  7. Recursos del equipo'
$unidad = (Get-Item $Repo).PSDrive.Name
$disco = Get-PSDrive -Name $unidad
$libresGB = [math]::Round($disco.Free / 1GB, 1)
if ($libresGB -ge 20) { Resultado 'OK' ("{0} GB libres en {1}:" -f $libresGB, $unidad) $null }
elseif ($libresGB -ge 5) { Resultado 'AVISO' ("Solo {0} GB libres en {1}:" -f $libresGB, $unidad) 'Los respaldos y los logs necesitan espacio.' }
else { Resultado 'FALLA' ("Espacio critico: {0} GB libres en {1}:" -f $libresGB, $unidad) $null }

# --- Resumen ---
Write-Host ''
Write-Host ('  ' + ('=' * 66))
if ($script:Fallos -eq 0 -and $script:Avisos -eq 0) {
    Write-Host '  LISTO PARA PRODUCCION - todos los puntos superados.' -ForegroundColor Green
} elseif ($script:Fallos -eq 0) {
    Write-Host ("  LISTO CON OBSERVACIONES - {0} aviso(s), ningun bloqueante." -f $script:Avisos) -ForegroundColor Yellow
} else {
    Write-Host ("  NO LISTO - {0} punto(s) bloqueante(s) y {1} aviso(s)." -f $script:Fallos, $script:Avisos) -ForegroundColor Red
}
Write-Host ''
exit ([int]($script:Fallos -gt 0))
