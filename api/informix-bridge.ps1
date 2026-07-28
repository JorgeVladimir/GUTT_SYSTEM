# ============================================================
# api/informix-bridge.ps1
# Bridge 32-bit: Node.js (x64) -> PowerShell 32-bit -> IBM Informix ODBC (x86)
#
# Se ejecuta via: C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe
# Recibe JSON por stdin: { connStr, sql, params }
# Devuelve JSON por stdout: [ { col: val, ... }, ... ]
# ============================================================

[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# El driver IBM Informix ODBC necesita INFORMIXDIR para ubicar sus librerías GLS (traducción de idioma)
if (-not $env:INFORMIXDIR) {
    $env:INFORMIXDIR = 'C:\Informix'
}

$raw = [Console]::In.ReadToEnd()

try {
    $req = $raw | ConvertFrom-Json
} catch {
    Write-Error "JSON de entrada invalido: $_"
    exit 1
}

$connStr = $req.connStr
$sql     = $req.sql
$params  = $req.params

if (-not $connStr -or -not $sql) {
    Write-Error "connStr y sql son obligatorios"
    exit 1
}

try {
    $conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
    $conn.Open()

    $cmd = New-Object System.Data.Odbc.OdbcCommand($sql, $conn)
    $cmd.CommandTimeout = 20

    if ($params -ne $null) {
        foreach ($p in $params) {
            $dbParam = New-Object System.Data.Odbc.OdbcParameter("", [System.DBNull]::Value)
            if ($p -ne $null) {
                $dbParam.Value = $p
            }
            $cmd.Parameters.Add($dbParam) | Out-Null
        }
    }

    $adapter = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
    $dt      = New-Object System.Data.DataTable
    $adapter.Fill($dt) | Out-Null
    $conn.Close()

    $rows = New-Object System.Collections.Generic.List[hashtable]

    foreach ($row in $dt.Rows) {
        $obj = @{}
        foreach ($col in $dt.Columns) {
            $val = $row[$col.ColumnName]
            if ($val -is [System.DBNull]) {
                $obj[$col.ColumnName] = $null
            } else {
                $obj[$col.ColumnName] = $val.ToString().Trim()
            }
        }
        $rows.Add($obj)
    }

    # Siempre devolver array
    if ($rows.Count -eq 0) {
        Write-Output "[]"
    } else {
        $rows.ToArray() | ConvertTo-Json -Compress -Depth 5
    }

} catch {
    $msg = $_.Exception.Message
    Write-Error $msg
    exit 1
}
