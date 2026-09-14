# Local development installation. ASCII for Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$pgRepo = Split-Path -Parent $PSScriptRoot
$pgScratch = Join-Path $pgRepo 'scratch/postgres-install'
$pgEnvFile = Join-Path $pgRepo 'api/.env'
$pgInstallDir = 'C:\Program Files\PostgreSQL\18'
$pgService = 'postgresql-x64-18'
$pgInstaller = Join-Path $pgScratch 'postgresql-18.6-1-windows-x64.exe'
$pgUrl = 'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64.exe'
New-Item -ItemType Directory -Path $pgScratch -Force | Out-Null

if (-not (Test-Path -LiteralPath $pgEnvFile)) { throw 'Missing api/.env' }
$pgEnvText = [IO.File]::ReadAllText($pgEnvFile)
function Get-PgSetting([string]$Key) {
    $pgMatch = [regex]::Match($script:pgEnvText, '(?m)^' + [regex]::Escape($Key) + '=(.*)\r?$')
    if ($pgMatch.Success) { return $pgMatch.Groups[1].Value.Trim().Trim('"').Trim("'") }
    return ''
}
function Set-PgSettingIfMissing([string]$Key, [string]$Value) {
    if (Get-PgSetting $Key) { return }
    if ([regex]::IsMatch($script:pgEnvText, '(?m)^' + [regex]::Escape($Key) + '=')) {
        $script:pgEnvText = [regex]::Replace($script:pgEnvText, '(?m)^' + [regex]::Escape($Key) + '=.*$', $Key + '=' + $Value)
    } else { $script:pgEnvText += "`r`n" + $Key + '=' + $Value }
}
function New-PgPassword {
    $pgBytes = New-Object byte[] 32
    $pgRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $pgRandom.GetBytes($pgBytes) } finally { $pgRandom.Dispose() }
    return 'Gutt!' + [BitConverter]::ToString($pgBytes).Replace('-', '').ToLowerInvariant()
}

$pgExisting = Get-Service -Name $pgService -ErrorAction SilentlyContinue
if ($pgExisting) {
    if (-not (Get-PgSetting 'GUTT_PG_ADMIN_PASSWORD')) { throw 'Existing PostgreSQL: admin credentials required; installation not changed.' }
    Write-Output ('PostgreSQL service already exists: ' + $pgExisting.Status)
    exit 0
}
if (Test-Path -LiteralPath (Join-Path $pgInstallDir 'data/PG_VERSION')) { throw 'Existing PostgreSQL data directory; installation not changed.' }
if (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5432 is already in use.' }

if (-not (Test-Path -LiteralPath $pgInstaller)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Output 'Downloading official PostgreSQL 18.6 installer...'
    $pgClient = New-Object Net.WebClient
    try { $pgClient.DownloadFile($pgUrl, $pgInstaller) } finally { $pgClient.Dispose() }
}
$pgSignature = Get-AuthenticodeSignature -LiteralPath $pgInstaller
if ($pgSignature.Status -ne 'Valid' -or $pgSignature.SignerCertificate.Subject -notmatch 'EnterpriseDB') {
    throw 'Installer signature validation failed.'
}
Set-PgSettingIfMissing 'GUTT_PG_HOST' '127.0.0.1'
Set-PgSettingIfMissing 'GUTT_PG_PORT' '5432'
Set-PgSettingIfMissing 'GUTT_PG_DATABASE' 'gutt_system_dev'
Set-PgSettingIfMissing 'GUTT_PG_USER' 'gutt_app'
Set-PgSettingIfMissing 'GUTT_PG_PASSWORD' (New-PgPassword)
Set-PgSettingIfMissing 'GUTT_PG_ADMIN_PASSWORD' (New-PgPassword)
Set-PgSettingIfMissing 'GUTT_PG_SSL' 'false'
if ((Get-PgSetting 'GUTT_PG_HOST') -ne '127.0.0.1' -or (Get-PgSetting 'GUTT_PG_PORT') -ne '5432') { throw 'Existing target configuration differs from local installation.' }
[IO.File]::WriteAllText($pgEnvFile, $pgEnvText, (New-Object Text.UTF8Encoding($false)))

$pgOptions = Join-Path $pgScratch 'installer.options'
[IO.File]::WriteAllText($pgOptions, '', (New-Object Text.UTF8Encoding($false)))
$pgAcl = New-Object Security.AccessControl.FileSecurity
$pgAcl.SetAccessRuleProtection($true, $false)
foreach ($pgSid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $pgAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($pgSid)), 'FullControl', 'Allow')))
}
Set-Acl -LiteralPath $pgOptions -AclObject $pgAcl
$pgOptionLines = @(
    'mode=unattended', 'unattendedmodeui=none', 'enable-components=server,commandlinetools',
    'disable-components=pgAdmin,stackbuilder', ('prefix=' + $pgInstallDir),
    ('datadir=' + $pgInstallDir + '\data'), 'serverport=5432',
    ('servicename=' + $pgService), 'superaccount=postgres',
    ('superpassword=' + (Get-PgSetting 'GUTT_PG_ADMIN_PASSWORD')),
    'create_shortcuts=0', 'debuglevel=0'
)
try {
    [IO.File]::WriteAllLines($pgOptions, $pgOptionLines, (New-Object Text.UTF8Encoding($false)))
    Write-Output 'Installing PostgreSQL service (Windows may request elevation)...'
    $pgProcess = Start-Process -FilePath $pgInstaller -ArgumentList @('--optionfile', ('"' + $pgOptions + '"')) -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    if ($pgProcess.ExitCode -ne 0) { throw ('PostgreSQL installer exit code: ' + $pgProcess.ExitCode) }
} finally {
    if (Test-Path -LiteralPath $pgOptions) { Remove-Item -LiteralPath $pgOptions -Force }
}
$pgReady = Join-Path $pgInstallDir 'bin/pg_isready.exe'
& $pgReady -h 127.0.0.1 -p 5432
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL is not accepting connections.' }
Write-Output 'PostgreSQL installed. Credentials saved only in api/.env.'
