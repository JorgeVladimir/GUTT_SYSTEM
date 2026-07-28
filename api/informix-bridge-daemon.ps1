# ============================================================
# api/informix-bridge-daemon.ps1
# Bridge 32-bit PERSISTENTE: Node.js (x64) -> PowerShell 32-bit -> IBM Informix ODBC (x86)
#
# A diferencia de informix-bridge.ps1 (un proceso nuevo + una conexion ODBC nueva
# por cada consulta), este script se lanza UNA vez y mantiene la conexion ODBC
# abierta, atendiendo muchas consultas en el mismo proceso via un protocolo
# NDJSON (una linea de request -> una linea de response) por stdin/stdout.
# Esto elimina el costo de arrancar PowerShell y abrir/cerrar ODBC en cada query.
#
# Protocolo:
#   Linea 1 de stdin  -> connection string (texto plano)
#   Lineas siguientes -> { "id": <int>, "sql": "...", "params": [...] }
#   stdout, una linea por request -> { "id": <int>, "ok": true, "rows": [...] }
#                                  o { "id": <int>, "ok": false, "error": "..." }
# ============================================================

[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $env:INFORMIXDIR) {
    $env:INFORMIXDIR = 'C:\Informix'
}

function Send-Response($id, $rows, $errorMsg) {
    $resp = [ordered]@{ id = $id }
    if ($errorMsg) {
        $resp.ok    = $false
        $resp.error = $errorMsg
    } else {
        $resp.ok   = $true
        $resp.rows = $rows
    }
    $json = $resp | ConvertTo-Json -Compress -Depth 6
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

$connStr = [Console]::In.ReadLine()
if (-not $connStr) {
    exit 1
}

$conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
$conn.Open()

try {
    while ($true) {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) { break }   # EOF: Node cerro stdin -> terminar
        if ($line.Trim() -eq '') { continue }

        $id = $null
        try {
            $req = $line | ConvertFrom-Json
        } catch {
            continue
        }

        $id     = $req.id
        $sql    = $req.sql
        $params = $req.params

        try {
            if ($conn.State -ne [System.Data.ConnectionState]::Open) {
                try { $conn.Close() } catch {}
                $conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
                $conn.Open()
            }

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

            Send-Response $id $rows.ToArray() $null
        } catch {
            Send-Response $id $null $_.Exception.Message
        }
    }
} finally {
    try { if ($conn.State -eq [System.Data.ConnectionState]::Open) { $conn.Close() } } catch {}
}
