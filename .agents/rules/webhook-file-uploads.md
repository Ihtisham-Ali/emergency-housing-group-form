# Rule: Never Send Binary Files Directly to Third-Party Webhooks

When building forms that collect file uploads AND forward data to a
third-party automation webhook (Make.com, Zapier, n8n, Pipedream, etc.):

- **DO NOT** send binary files directly in the webhook POST body.
- **ALWAYS** upload files to cloud storage first (Supabase Storage, S3,
  Cloudinary, etc.) and include only the resulting public URLs in the
  webhook payload.

## Why

- Make.com webhooks: hard **5 MB payload limit** → HTTP 413 on every
  submission containing photos/videos, no visible error to the user,
  shows "Submission Failed" instead.
- Zapier webhooks: similar ~10 MB limit.
- n8n webhooks: depends on host memory, often restrictive.
- Binary files in webhooks also block retries (binary can't be stored
  in localStorage as a fallback).

## Diagnosis

If a form posts to a same-origin PHP relay and that relay forwards to
a webhook, check the PHP error log first (e.g. `submit_error.log` next
to `submit.php` on the server — readable via cPanel File Manager).

```
[2026-08-07 11:02:18] FAIL (502): Could not reach upstream service. | Upstream returned 413
```

The entry `Upstream returned 413` = payload too large for the webhook.
This is **not** a PHP bug — PHP and curl are working fine. Make.com is
rejecting the oversized request.

## Fix Pattern

1. Upload files from the browser **directly** to Supabase Storage (anon key)
2. Collect the returned public URLs
3. Include `file_urls: ["https://...supabase.co/storage/..."]` array in the JSON payload
4. Send only the JSON (no binary) to the PHP relay → webhook
5. Webhook receives a tiny payload — no size limit issues ever

## Related Skill

Use the `supabase-file-upload-relay` skill for the full implementation
pattern with copy-paste JavaScript and PHP code.
