<?php

declare(strict_types=1);

require_once __DIR__ . '/../_lib/bootstrap.php';
require_once __DIR__ . '/../_lib/informix.php';

require_method('GET');

$id = strtolower(trim((string)($_GET['id'] ?? '')));
if ($id === '') {
    send_json(400, [
        'ok' => false,
        'error' => 'id is required',
    ]);
}

try {
    $pdo = informix_connection();

    $defaultSql = "
        SELECT FIRST 1
            TRIM(CAST(u.usua_cod_usua AS LVARCHAR(30)))     AS id,
            TRIM(u.usua_nom_usua)                           AS name,
            TRIM(u.usua_passwd)                             AS pin,
            TRIM(COALESCE(p.perf_des_perf, 'SOCIO'))        AS role
        FROM afccajapatate:bcausua u
        LEFT JOIN afccajapatate:bcaperf p
            ON p.perf_cod_perf = u.usua_cod_perf
        WHERE LOWER(TRIM(CAST(u.usua_cod_usua AS LVARCHAR(30)))) = ?
    ";
    $sql = getenv('INFORMIX_PROFILE_QUERY') ?: $defaultSql;

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row) {
        send_json(404, [
            'ok' => false,
            'error' => 'User not found',
        ]);
    }

    $user = map_user_row($row);

    $accountsSql = getenv('INFORMIX_ACCOUNTS_QUERY') ?: "
        SELECT
            TRIM(CAST(dpvi.cod_dpvi AS LVARCHAR(30))) AS account_id,
            TRIM(CAST(dpvi.num_cuen AS LVARCHAR(30))) AS account_number,
            COALESCE(dpvi.sld_disp, dpvi.sld_cont, dpvi.sld_act, 0) AS balance,
            TRIM(COALESCE(dpvi.cod_mone, 'USD')) AS currency,
            TRIM(COALESCE(dpvi.cod_tcdv, tcdv.cod_tcdv)) AS product_code,
            TRIM(COALESCE(tcdv.des_tcdv, '')) AS product_name
        FROM afccajapatate:bcadpvi dpvi
        LEFT JOIN afccajapatate:bcatcdv tcdv
            ON tcdv.cod_tcdv = dpvi.cod_tcdv
        WHERE LOWER(TRIM(CAST(dpvi.cod_soci AS LVARCHAR(30)))) = ?
    ";

    if (trim($accountsSql) !== '') {
        $accountsStmt = $pdo->prepare($accountsSql);
        $accountsStmt->execute([$id]);
        $accountsRows = $accountsStmt->fetchAll();

        $accounts = [];
        foreach ($accountsRows as $accountRow) {
            $mapped = map_informix_account_row((array)$accountRow);
            if ($mapped !== null) {
                $accounts[] = $mapped;
            }
        }

        $user['accounts'] = $accounts;
    }

    send_json(200, $user);
} catch (Throwable $error) {
    error_log('get_profile.php error: ' . $error->getMessage());
    send_json(500, [
        'ok' => false,
        'error' => 'Internal server error',
    ]);
}
