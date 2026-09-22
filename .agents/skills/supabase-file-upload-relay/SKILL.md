---
name: supabase-file-upload-relay
description: >
  Architecture and copy-paste code for forms on shared PHP hosting that need
  file uploads forwarded to a third-party webhook (Make.com, Zapier, etc.).
  Files go browser → Supabase Storage; text data + URLs go browser →
  PHP relay → webhook. Eliminates webhook file size limit errors (HTTP 413).
---

# Supabase File Upload Relay Pattern

## Architecture

```
Browser uploads files  ──►  Supabase Storage  ──►  public URLs
Browser sends JSON     ──►  submit.php         ──►  Make.com / Zapier
                                               └──►  Supabase Postgres (backup)
```

## Supabase Setup Checklist

- [ ] Create project (EU/West region for UK users)
- [ ] Storage → New bucket — name: `YOUR_BUCKET`, **Public: ON**, no file size limit
- [ ] SQL Editor → Add INSERT policy on bucket for `anon` role:
      `CREATE POLICY "anon upload" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'YOUR_BUCKET');`
- [ ] SQL Editor → Add SELECT policy (public read):
      `CREATE POLICY "public read" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'YOUR_BUCKET');`
- [ ] Create submissions table with `file_urls text[]` column
- [ ] Add INSERT policy on table for `anon` role + enable RLS
- [ ] Settings → API → collect:
  - **Project URL** → `https://YOURREF.supabase.co`
  - **anon key** → safe in browser JS
  - **service_role key** → server/PHP only, never in browser

## index.html — Add CDN before your app script

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="app.js"></script>
```

## JavaScript — app.js

### Constants + lazy client
```javascript
const SUPABASE_URL      = 'https://YOURREF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

function getSupabaseClient() {
  if (!window._supabaseClient) {
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return window._supabaseClient;
}
```

### Upload files, return public URLs
```javascript
async function uploadFilesToSupabase(files, onProgress) {
  const client     = getSupabaseClient();
  const urls       = [];
  const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(
      Math.round((i / files.length) * 82),
      `Uploading file ${i + 1} of ${files.length}…`
    );

    const random   = Math.random().toString(36).slice(2, 10);
    const safeName = files[i].name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = `${datePrefix}/${random}_${safeName}`;

    const { error } = await client.storage
      .from('YOUR_BUCKET')
      .upload(path, files[i], { cacheControl: '31536000', upsert: false });

    if (error) throw new Error(`Upload failed for ${files[i].name}: ${error.message}`);

    const { data } = client.storage.from('YOUR_BUCKET').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
```

### In handleSubmit — upload first, send JSON
```javascript
async function handleSubmit(e) {
  e.preventDefault();

  // 1. Upload files to Supabase Storage
  let fileUrls = [];
  if (uploadedFiles.length > 0) {
    try { fileUrls = await uploadFilesToSupabase(uploadedFiles, updateProgress); }
    catch (err) { console.error('Upload error:', err.message); }
    // Continues without files rather than blocking the whole submission
  }

  // 2. Build payload with URLs (no binary)
  const payload = {
    ...allTextFields,
    file_urls: fileUrls,
    uploaded_files_count: fileUrls.length,
  };

  // 3. Send JSON to PHP relay
  const sent = await sendWithRetry(payload);
}
```

### sendWithRetry — JSON only (no FormData/files)
```javascript
function sendWithRetry(payload, onProgress) {
  const MAX = 3;
  return new Promise(resolve => {
    let attempt = 0;
    function tryOnce() {
      attempt++;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/submit.php');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { if (onProgress) onProgress(100); resolve(true); }
        else scheduleRetry();
      };
      xhr.onerror = scheduleRetry;
      xhr.send(JSON.stringify(payload));
    }
    function scheduleRetry() {
      if (attempt < MAX) setTimeout(tryOnce, attempt * 1500);
      else resolve(false);
    }
    tryOnce();
  });
}
```

## PHP — submit.php

```php
header('Content-Type: application/json');

define('SUPABASE_URL',         'https://YOURREF.supabase.co');
define('SUPABASE_SERVICE_KEY', 'YOUR_SERVICE_ROLE_KEY'); // server only
define('WEBHOOK_URL',          'https://hook.eu1.make.com/YOUR_HOOK');

function aslm_curl(string $url, string $json, array $extraHeaders = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $json,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $extraHeaders),
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

// Read JSON body (sent as application/json by the browser)
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload) || empty($payload['email'])) {
    http_response_code(400); echo json_encode(['ok' => false]); exit;
}

// 1. Save to Supabase Postgres (backup — don't abort if this fails)
[$dbResp, $dbCode] = aslm_curl(
    SUPABASE_URL . '/rest/v1/YOUR_TABLE',
    json_encode($payload),
    ['apikey: ' . SUPABASE_SERVICE_KEY, 'Authorization: Bearer ' . SUPABASE_SERVICE_KEY, 'Prefer: return=minimal']
);

// 2. Forward to webhook as JSON (tiny — no files = no 413)
[$makeResp, $makeCode, $makeErr] = aslm_curl(WEBHOOK_URL, json_encode($payload));
if ($makeCode < 200 || $makeCode >= 300) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Could not reach upstream service.']);
    exit;
}

echo json_encode(['ok' => true]);
```

## Public URL Format

Every uploaded file gets a permanent public URL:
```
https://YOURREF.supabase.co/storage/v1/object/public/BUCKET/YYYY-MM-DD/randomid_filename.jpg
```

Direct download — no auth headers needed. Paste into browser to verify.

## Make.com — Using file_urls

`file_urls` arrives as an array. To attach files to emails:
```
Webhook → Iterator (Array: file_urls[]) → HTTP GET {{value}} → Email attachment
```

## Diagnosing 413 Errors

Check `submit_error.log` next to `submit.php` on the server (cPanel File Manager).
```
FAIL (502): Could not reach upstream service. | Upstream returned 413
```
= webhook payload too large. Switch to this pattern to fix permanently.
