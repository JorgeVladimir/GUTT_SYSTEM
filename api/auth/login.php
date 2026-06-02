<?php

declare(strict_types=1);

require_once __DIR__ . '/../_lib/bootstrap.php';
require_once __DIR__ . '/../_lib/informix.php';

require_method('POST');

$payload = read_json_body();
$id = strtolower(trim((string)($payload['id'] ?? '')));
$pin = trim((string)($payload['pin'] ?? ''));

if ($id === '' || $pin === '') {
    send_json(400, [
        'ok' => false,
        'error' => 'id and pin are required',
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
    $sql = getenv('INFORMIX_LOGIN_QUERY') ?: $defaultSql;

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row) {
        send_json(401, ['ok' => false, 'error' => 'Invalid credentials']);
    }

    $dbPin = trim((string)($row['pin'] ?? ''));
    if ($dbPin !== $pin) {
        send_json(401, ['ok' => false, 'error' => 'Invalid credentials']);
    }

    send_json(200, map_user_row($row));
} catch (Throwable $error) {
    error_log('login.php error: ' . $error->getMessage());
    send_json(500, [
        'ok' => false,
        'error' => 'Internal server error',
    ]);
}
