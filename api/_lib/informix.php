<?php

declare(strict_types=1);

function informix_connection(): PDO
{
    $driver = getenv('INFORMIX_ODBC_DRIVER') ?: 'IBM INFORMIX ODBC DRIVER';
    $host = getenv('INFORMIX_HOST') ?: '';
    $port = getenv('INFORMIX_PORT') ?: '9088';
    $database = getenv('INFORMIX_DATABASE') ?: '';
    $server = getenv('INFORMIX_SERVER') ?: '';
    $protocol = getenv('INFORMIX_PROTOCOL') ?: 'onsoctcp';
    $user = getenv('INFORMIX_USER') ?: '';
    $password = getenv('INFORMIX_PASSWORD') ?: '';

    if ($host === '' || $database === '' || $server === '' || $user === '') {
        throw new RuntimeException('Informix env vars are incomplete.');
    }

    $dsn = sprintf(
        'odbc:Driver={%s};Host=%s;Server=%s;Service=%s;Protocol=%s;Database=%s;',
        $driver,
        $host,
        $server,
        $port,
        $protocol,
        $database
    );

    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function map_role(string $dbRole): string
{
    $role = strtoupper(trim($dbRole));

    // Direct match (role already in app format)
    $allowed = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'TELLER', 'MEMBER', 'CREDIT_OFFICER'];
    if (in_array($role, $allowed, true)) {
        return $role;
    }

    // Pattern mapping from Informix bcaperf descriptions (Spanish/AFC conventions)
    $patterns = [
        'ADMIN'          => '/ADMIN|SIST|SISTEMA|DIRECTIV|DIRECCI/i',
        'MANAGER'        => '/GERENTE|GERENCIA|MANAGER|JEFE|JEFATURA|SUB.?GERENTE/i',
        'ACCOUNTANT'     => '/CONTAB|CONTADOR|AUDITORIA?|AUDITORE?|FINANC/i',
        'TELLER'         => '/CAJA|VENTANILLA|TELLER|RECAUDAD/i',
        'CREDIT_OFFICER' => '/CR[EÉ]DITO|ASESOR|OFICIAL|EVALUAD/i',
    ];

    foreach ($patterns as $appRole => $pattern) {
        if (preg_match($pattern, $role)) {
            return $appRole;
        }
    }

    return 'MEMBER';
}

function map_user_row(array $row): array
{
    return [
        'id' => (string)($row['id'] ?? ''),
        'name' => (string)($row['name'] ?? ''),
        'pin' => (string)($row['pin'] ?? ''),
        'role' => map_role((string)($row['role'] ?? 'MEMBER')),
        'accounts' => [],
        'transactions' => [],
        'loans' => [],
        'needsPinChange' => false,
    ];
}

function normalize_text(?string $value): string
{
    return trim((string)($value ?? ''));
}

function parse_code_list(string $envName): array
{
    $raw = (string)(getenv($envName) ?: '');
    if ($raw === '') {
        return [];
    }

    $parts = array_map(
        static fn (string $item): string => strtoupper(trim($item)),
        explode(',', $raw)
    );

    return array_values(array_filter($parts, static fn (string $item): bool => $item !== ''));
}

function infer_account_type(string $productCode, string $productDescription): ?string
{
    $code = strtoupper(trim($productCode));
    $description = strtoupper(trim($productDescription));

    $savingsCodes = parse_code_list('INFORMIX_TCDV_SAVINGS_CODES');
    $certificateCodes = parse_code_list('INFORMIX_TCDV_CERTIFICATE_CODES');

    if ($code !== '' && in_array($code, $savingsCodes, true)) {
        return 'AHORRO_VISTA';
    }

    if ($code !== '' && in_array($code, $certificateCodes, true)) {
        return 'CERTIFICADO_APORTACION';
    }

    if (str_contains($description, 'AHORRO') || str_contains($description, 'VISTA')) {
        return 'AHORRO_VISTA';
    }

    if (str_contains($description, 'CERTIFICADO') || str_contains($description, 'APORTACION')) {
        return 'CERTIFICADO_APORTACION';
    }

    return null;
}

function map_informix_account_row(array $row): ?array
{
    $accountId = normalize_text((string)($row['account_id'] ?? $row['id'] ?? ''));
    $accountNumber = normalize_text((string)($row['account_number'] ?? $row['number'] ?? ''));
    $currency = normalize_text((string)($row['currency'] ?? 'USD'));
    $productCode = normalize_text((string)($row['product_code'] ?? $row['cod_tcdv'] ?? ''));
    $productName = normalize_text((string)($row['product_name'] ?? $row['des_tcdv'] ?? ''));
    $balanceRaw = $row['balance'] ?? $row['saldo'] ?? 0;
    $balance = is_numeric($balanceRaw) ? (float)$balanceRaw : 0.0;

    if ($accountNumber === '') {
        return null;
    }

    $type = infer_account_type($productCode, $productName);
    if ($type === null) {
        return null;
    }

    if ($accountId === '') {
        $accountId = strtolower('acc-' . $accountNumber);
    }

    return [
        'id' => $accountId,
        'type' => $type,
        'number' => $accountNumber,
        'balance' => round($balance, 2),
        'currency' => $currency !== '' ? $currency : 'USD',
    ];
}
