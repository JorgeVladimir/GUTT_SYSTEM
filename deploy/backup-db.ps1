# ============================================================================
# backup-db.ps1 - Respaldo de la base SQLGUTPATATE con retencion.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\GUTT_SYSTEM\deploy\backup-db.ps1
#   powershell ... -File deploy\backup-db.ps1 -Instalar     (registra la tarea diaria 02:00, requiere admin)
#   powershell ... -File deploy\backup-db.ps1 -Verificar    (RESTORE VERIFYONLY del ultimo respaldo)
#
# POR QUE EXISTE
# Un core bancario sin respaldo probado no se puede vender ni instalar en un cliente.
# Este script hace respaldo COMPLETO con COMPRESSION y CHECKSUM, y aplica retencion.
# CHECKSUM no es decorativo: sin el, un respaldo corrupto se descubre el dia que hay que
# restaurarlo. -Verificar corre RESTORE VERIFYONLY, que es la unica forma de saber que el
# archivo sirve sin restaurar encima de la base productiva.
#
# Las credenciales salen de api\.env (SQL_SERVER_*), nunca se escriben aqui.
#
# NOTA DE ENCODING: mantener este archivo en ASCII puro. Windows PowerShell 5.1 lo lee
# como ANSI y un acento rompe el parseo.
# ============================================================================
param(
    [switch]$Instalar,
    [switch]$Verificar,
    [string]$Repo = 'C:\GUTT_SYSTEM',
    [string]$Destino = 'C:\GUTT_SYSTEM\backups',
    [int]$RetencionDias = 14
)

$ErrorActionPreference = 'Stop'

function Escribir($nivel, $texto) {
    $color = switch ($nivel) { 'OK' { 'Green' } 'ERROR' { 'Red' } 'AVISO' { 'Yellow' } default { 'Gray' } }
    Write-Host ("  [{0}] {1}" -f $nivel, $texto) -ForegroundColor $color
}

# --- Leer api\.env sin dependencias externas (el repo no tiene dotenv) ---
function Leer-Env([string]$ruta) {
    $mapa = @{}
    if (-not (Test-Path $ruta)) { return $mapa }
    foreach ($linea in (Get-Content $ruta)) {
        $t = $linea.Trim()
        if ($t -eq '' -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
        $i = $t.IndexOf('=')
        $clave = $t.Substring(0, $i).Trim()
        $valor = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
        if ($clave -ne '') { $mapa[$clave] = $valor }
    }
    return $mapa
}

$env_ = Leer-Env (Join-Path $Repo 'api\.env')
$servidor = $env_['SQL_SERVER_HOST']
if ($env_['SQL_SERVER_INSTANCE']) { $servidor = "$servidor\$($env_['SQL_SERVER_INSTANCE'])" }
$baseDatos = $env_['SQL_SERVER_DATABASE']
$usuario   = $env_['SQL_SERVER_USER']
$clave     = $env_['SQL_SERVER_PASSWORD']

if (-not $servidor -or -not $baseDatos -or -not $usuario -or -not $clave) {
    Escribir 'ERROR' ("Faltan SQL_SERVER_HOST / SQL_SERVER_DATABASE / SQL_SERVER_USER / SQL_SERVER_PASSWORD en {0}\api\.env" -f $Repo)
    exit 1
}

# --- Instalacion de la tarea diaria ---
if ($Instalar) {
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Escribir 'ERROR' 'Registrar la tarea programada requiere PowerShell como administrador.'
        exit 1
    }
    $script = Join-Path $Repo 'deploy\backup-db.ps1'
    if (Get-ScheduledTask -TaskName 'GuttSystemBackupDB' -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName 'GuttSystemBackupDB' -Confirm:$false
    }
    $accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $script)
    $disp = New-ScheduledTaskTrigger -Daily -At 2am
    $ent = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $opc = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    Register-ScheduledTask -TaskName 'GuttSystemBackupDB' -Action $accion -Trigger $disp `
        -Principal $ent -Settings $opc `
        -Description 'GUTT SYSTEM - Respaldo diario de la base de datos a las 02:00 con retencion.' | Out-Null
    Escribir 'OK' 'Tarea GuttSystemBackupDB registrada (diaria, 02:00, como SYSTEM).'
    exit 0
}

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino -Force | Out-Null }
$logFile = Join-Path $Repo 'logs\backup-db.log'
if (-not (Test-Path (Split-Path $logFile))) { New-Item -ItemType Directory -Path (Split-Path $logFile) -Force | Out-Null }

function Registrar($texto) {
    Add-Content -Path $logFile -Value ("{0} - {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto)
}

function Ejecutar-Sql([string]$consulta, [int]$timeout = 3600) {
    $cadena = "Server=$servidor;Database=master;User Id=$usuario;Password=$clave;TrustServerCertificate=True;Encrypt=True"
    $conexion = New-Object System.Data.SqlClient.SqlConnection($cadena)
    $conexion.Open()
    try {
        $cmd = $conexion.CreateCommand()
        $cmd.CommandText = $consulta
        $cmd.CommandTimeout = $timeout
        $cmd.ExecuteNonQuery() | Out-Null
    } finally { $conexion.Close() }
}

function Consultar-Sql([string]$consulta, [int]$timeout = 60) {
    $cadena = "Server=$servidor;Database=master;User Id=$usuario;Password=$clave;TrustServerCertificate=True;Encrypt=True"
    $conexion = New-Object System.Data.SqlClient.SqlConnection($cadena)
    $conexion.Open()
    try {
        $cmd = $conexion.CreateCommand()
        $cmd.CommandText = $consulta
        $cmd.CommandTimeout = $timeout
        return $cmd.ExecuteScalar()
    } finally { $conexion.Close() }
}

# --- Verificacion del ultimo respaldo ---
if ($Verificar) {
    $ultimo = Get-ChildItem -Path $Destino -Filter '*.bak' -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $ultimo) { Escribir 'ERROR' ("No hay respaldos en {0}" -f $Destino); exit 1 }
    Write-Host ''
    Escribir 'INFO' ("Verificando {0} ({1:N1} MB)..." -f $ultimo.Name, ($ultimo.Length / 1MB))
    try {
        Ejecutar-Sql ("RESTORE VERIFYONLY FROM DISK = N'{0}' WITH CHECKSUM" -f $ultimo.FullName)
        Escribir 'OK' 'El respaldo es integro y restaurable.'
        Registrar ("VERIFICADO OK - " + $ultimo.Name)
        exit 0
    } catch {
        Escribir 'ERROR' ("El respaldo NO paso la verificacion: {0}" -f $_.Exception.Message)
        Registrar ("VERIFICACION FALLIDA - " + $ultimo.Name + " - " + $_.Exception.Message)
        exit 1
    }
}

# --- Respaldo completo ---
$sello = Get-Date -Format 'yyyyMMdd_HHmmss'
$archivo = Join-Path $Destino ("{0}_{1}.bak" -f $baseDatos, $sello)

Write-Host ''
Write-Host ('  Respaldo de {0} en {1}' -f $baseDatos, $servidor)
Write-Host ('  ' + ('-' * 64))

# COMPRESSION no existe en SQL Server Express: el motor aborta el BACKUP entero con
# "BACKUP DATABASE WITH COMPRESSION is not supported on Express Edition". Se detecta la
# edicion y se omite la opcion en vez de fallar. EngineEdition 4 = Express.
$opciones = 'INIT, CHECKSUM, STATS = 10'
try {
    $edicion = [int](Consultar-Sql "SELECT CAST(SERVERPROPERTY('EngineEdition') AS INT)")
    if ($edicion -ne 4) { $opciones = 'INIT, COMPRESSION, CHECKSUM, STATS = 10' }
    else { Escribir 'INFO' 'SQL Server Express: se respalda sin COMPRESSION (la edicion no la soporta).' }
} catch {
    Escribir 'AVISO' 'No se pudo determinar la edicion de SQL Server; se respalda sin COMPRESSION.'
}

try {
    $sql = @"
BACKUP DATABASE [$baseDatos]
TO DISK = N'$archivo'
WITH $opciones,
     NAME = N'$baseDatos respaldo completo $sello';
"@
    Ejecutar-Sql $sql
    $info = Get-Item $archivo
    Escribir 'OK' ("Respaldo creado: {0} ({1:N1} MB)" -f $info.Name, ($info.Length / 1MB))
    Registrar ("RESPALDO OK - {0} - {1:N1} MB" -f $info.Name, ($info.Length / 1MB))
} catch {
    Escribir 'ERROR' ("Fallo el respaldo: {0}" -f $_.Exception.Message)
    Registrar ("RESPALDO FALLIDO - " + $_.Exception.Message)
    exit 1
}

# --- Verificacion inmediata: un respaldo sin verificar no cuenta como respaldo ---
try {
    Ejecutar-Sql ("RESTORE VERIFYONLY FROM DISK = N'{0}' WITH CHECKSUM" -f $archivo)
    Escribir 'OK' 'Verificacion de integridad superada (RESTORE VERIFYONLY).'
    Registrar ("VERIFICADO OK - " + (Split-Path $archivo -Leaf))
} catch {
    Escribir 'ERROR' ("El respaldo se creo pero NO pasa la verificacion: {0}" -f $_.Exception.Message)
    Registrar ("VERIFICACION FALLIDA - " + (Split-Path $archivo -Leaf))
    exit 1
}

# --- Retencion ---
$limite = (Get-Date).AddDays(-$RetencionDias)
$viejos = Get-ChildItem -Path $Destino -Filter '*.bak' | Where-Object { $_.LastWriteTime -lt $limite }
# Nunca se borra el ultimo respaldo, aunque sea mas viejo que la retencion: quedarse sin
# ninguno por una tarea que dejo de correr es peor que guardar uno de mas.
$total = (Get-ChildItem -Path $Destino -Filter '*.bak').Count
if ($viejos -and $total -gt $viejos.Count) {
    foreach ($v in $viejos) {
        Remove-Item $v.FullName -Force
        Registrar ("PURGADO - " + $v.Name)
    }
    Escribir 'OK' ("Retencion aplicada: {0} respaldo(s) de mas de {1} dias eliminados." -f $viejos.Count, $RetencionDias)
} else {
    Escribir 'INFO' ("Retencion: nada que purgar ({0} respaldo(s) en disco)." -f $total)
}

Write-Host ''
exit 0
