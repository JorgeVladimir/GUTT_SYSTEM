<?php

declare(strict_types=1);

require_once __DIR__ . '/../_lib/bootstrap.php';
require_once __DIR__ . '/../_lib/informix.php';

require_method('POST');

$payload = read_json_body();
$type = trim((string)($payload['type'] ?? ''));

if ($type === '') {
    send_json(400, [
        'ok' => false,
        'error' => 'type is required',
    ]);
}

try {
    $pdo = informix_connection();
    $sql = getenv('INFORMIX_REPORT_QUERY') ?: '';

    if ($sql === '') {
        send_json(200, []);
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$type]);
    $rows = $stmt->fetchAll();

    send_json(200, is_array($rows) ? $rows : []);
} catch (Throwable $error) {
    error_log('generate.php error: ' . $error->getMessage());
    send_json(500, [
        'ok' => false,
        'error' => 'Internal server error',
    ]);
}
