<?php
/**
 * Emergency Housing Group Maintenance Form — same-origin relay.
 *
 * Files are uploaded directly from the browser to Supabase Storage,
 * so this script only receives a small JSON payload containing text data
 * and public Supabase file URLs. It does two things:
 *
 *  1. Saves a full record to Supabase Postgres (permanent backup / admin view).
 *  2. Forwards the JSON payload to the Make.com webhook.
 *
 * Because there are no binary attachments, the Make.com 413 "Request Entity
 * Too Large" error that was occurring on every submission is now impossible.
 */

header('Content-Type: application/json');

/* ── Logging ─────────────────────────────────────────────────────────────── */
function aslm_log(string $msg): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n";
    @file_put_contents(__DIR__ . '/submit_error.log', $line, FILE_APPEND | LOCK_EX);
}

function aslm_fail(int $httpCode, string $error, string $logDetail = ''): void
{
    aslm_log('FAIL (' . $httpCode . '): ' . $error . ($logDetail !== '' ? ' | ' . $logDetail : ''));
    http_response_code($httpCode);
    echo json_encode(['ok' => false, 'error' => $error]);
    exit;
}

set_error_handler(function ($severity, $message, $file, $line) {
    if (in_array($severity, [E_ERROR, E_USER_ERROR], true)) {
        aslm_fail(500, 'Server error while processing submission.', "PHP error: $message in $file:$line");
    }
    aslm_log("PHP notice ($severity): $message in $file:$line");
    return true;
});

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            header('Content-Type: application/json');
            http_response_code(500);
        }
        aslm_log('FATAL: ' . $err['message'] . ' in ' . $err['file'] . ':' . $err['line']);
        echo json_encode(['ok' => false, 'error' => 'Server error while processing submission.']);
    }
});

/* ── Config ──────────────────────────────────────────────────────────────── */
define('SUPABASE_URL',         'https://dpmzxkxcppqfnkkyysbj.supabase.co');
define('SUPABASE_SERVICE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbXp4a3hjcHBxZm5ra3l5c2JqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA2MzUzNiwiZXhwIjoyMTAyNjM5NTM2fQ.X-nOBdVf013FVJUn9owiPNfHp-Ug-N6NPcVRUOSZ8V0');
define('MAKE_WEBHOOK_URL',     'https://hook.eu1.make.com/ykaaofu4q8kbkrm91rr0fib67zoaz9me');

/* ── Helper: make a curl call and return [responseBody, httpCode, errorStr] */
function aslm_curl(string $url, string $jsonBody, array $extraHeaders = []): array
{
    $headers = array_merge([
        'Content-Type: application/json',
    ], $extraHeaders);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $jsonBody,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 30,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    return [$body, $code, $err];
}

/* ── Main ────────────────────────────────────────────────────────────────── */
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        aslm_fail(405, 'Method not allowed');
    }

    if (!function_exists('curl_init')) {
        aslm_fail(500, 'Server misconfiguration — please email your report instead.', 'curl extension not available');
    }

    // Read payload — supports application/json, $_POST, FormData, or JSON in $_POST['payload']
    $raw     = file_get_contents('php://input');
    $payload = null;

    if (!empty($raw)) {
        // Strip UTF-8 BOM if present
        $rawClean = preg_replace('/^[\xEF\xBB\xBF]+/', '', $raw);
        $payload  = json_decode($rawClean, true);
    }

    // Fallback 1: JSON sent inside $_POST parameter
    if (!is_array($payload) && !empty($_POST['payload'])) {
        $payload = json_decode($_POST['payload'], true);
    } elseif (!is_array($payload) && !empty($_POST['data'])) {
        $payload = json_decode($_POST['data'], true);
    }

    // Fallback 2: Standard $_POST / FormData (e.g. cached client JS or traditional form submission)
    if (!is_array($payload) && !empty($_POST)) {
        $payload = $_POST;
    }

    // Normalize field aliases if present
    if (is_array($payload)) {
        if (empty($payload['name'])) {
            if (!empty($payload['full_name']))     $payload['name'] = $payload['full_name'];
            elseif (!empty($payload['full-name'])) $payload['name'] = $payload['full-name'];
        }
        if (empty($payload['email'])) {
            if (!empty($payload['user_email']))     $payload['email'] = $payload['user_email'];
            elseif (!empty($payload['email_address'])) $payload['email'] = $payload['email_address'];
        }
    }

    // Validate minimum required fields
    $name  = isset($payload['name'])  ? trim((string)$payload['name'])  : '';
    $email = isset($payload['email']) ? trim((string)$payload['email']) : '';

    if (!is_array($payload) || $name === '' || $email === '') {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? 'none';
        $rawLen      = strlen($raw ?? '');
        $postKeys    = !empty($_POST) ? implode(',', array_keys($_POST)) : 'none';
        $rawSnippet  = !empty($raw) ? substr(preg_replace('/\s+/', ' ', $raw), 0, 150) : 'empty';

        $diag = sprintf(
            'CT: %s | RawLen: %d | IsArray: %s | Name: "%s" | Email: "%s" | $_POST keys: [%s] | Raw: "%s"',
            $contentType,
            $rawLen,
            is_array($payload) ? 'yes' : 'no',
            $name,
            $email,
            $postKeys,
            $rawSnippet
        );
        aslm_fail(400, 'Missing or invalid submission data', $diag);
    }

    /* ── 1. Save to Supabase Postgres ──────────────────────────────────── */
    // file_urls is an array of Supabase Storage public URLs sent by the browser
    $fileUrls = $payload['file_urls'] ?? [];
    if (!is_array($fileUrls)) {
        $fileUrls = [];
    }

    $dbRecord = [
        'name'                    => (string)($payload['name']              ?? ''),
        'email'                   => (string)($payload['email']             ?? ''),
        'phone'                   => (string)($payload['phone']             ?? ''),
        'full_address'            => (string)($payload['full_address']      ?? ''),
        'address_line_1'          => (string)($payload['address_line_1']   ?? ''),
        'address_line_2'          => (string)($payload['address_line_2']   ?? ''),
        'address_line_3'          => (string)($payload['address_line_3']   ?? ''),
        'city'                    => (string)($payload['city']              ?? ''),
        'postcode'                => (string)($payload['postcode']          ?? ''),
        'issue_code'              => (string)($payload['issue_code']        ?? ''),
        'issue_label'             => (string)($payload['issue_label']       ?? ''),
        'other_issue_text'        => (string)($payload['other_issue_text']  ?? ''),
        'further_info'            => (string)($payload['further_info']      ?? ''),
        'troubleshooting_summary' => (string)($payload['troubleshooting_summary'] ?? ''),
        'troubleshooting_answers' => $payload['troubleshooting_answers'] ?? null,
        'troubleshooting_path'    => $payload['troubleshooting_path']    ?? [],
        'boiler_error_code'       => (string)($payload['boiler_error_code'] ?? ''),
        'internal_priority'       => (string)($payload['internal_priority'] ?? 'normal'),
        'engineer_required'       => (bool)($payload['engineer_required']   ?? false),
        'request_closed'          => (bool)($payload['request_closed']      ?? false),
        'responsibility_type'     => (string)($payload['responsibility_type'] ?? ''),
        'alert_type'              => (string)($payload['alert_type']         ?? ''),
        'final_action'            => (string)($payload['final_action']       ?? ''),
        'file_urls'               => $fileUrls,
        'file_count'              => count($fileUrls),
        'submitted_at'            => (string)($payload['submitted_at']       ?? date('c')),
        'make_webhook_sent'       => false,
    ];

    [$dbResp, $dbCode, $dbErr] = aslm_curl(
        SUPABASE_URL . '/rest/v1/maintenance_submissions',
        json_encode($dbRecord),
        [
            'apikey: '        . SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
            'Prefer: return=minimal',
        ]
    );

    if ($dbCode < 200 || $dbCode >= 300) {
        // Log the failure but do NOT abort — Make.com delivery matters more.
        aslm_log('Supabase DB insert failed (' . $dbCode . '): ' . ($dbErr ?: $dbResp));
    }

    /* ── 2. Forward to Make.com webhook (pure JSON, no files) ──────────── */
    // Ensure company identifier is always present in Make.com payload
    $payload['company_name'] = $payload['company_name'] ?? 'Emergency Housing Group';
    $payload['company']      = $payload['company']      ?? 'Emergency Housing Group';
    $payload['brand']        = $payload['brand']        ?? 'Emergency Housing Group';
    $payload['source']       = $payload['source']       ?? 'Emergency Housing Group Maintenance Portal';

    [$makeResp, $makeCode, $makeErr] = aslm_curl(
        MAKE_WEBHOOK_URL,
        json_encode($payload)
    );

    if ($makeResp === false || $makeCode < 200 || $makeCode >= 300) {
        // Update Supabase record with failure note (best-effort)
        if ($dbCode >= 200 && $dbCode < 300) {
            // We can't easily get the inserted row id without RETURNING=representation,
            // so just log; the record is still saved.
        }
        aslm_fail(502, 'Could not reach upstream service.', $makeErr ?: ('Upstream returned ' . $makeCode));
    }

    echo json_encode(['ok' => true]);

} catch (\Throwable $e) {
    aslm_fail(500, 'Server error while processing submission.', $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
}
