/**
 * Emergency Housing Group — Web Service Server
 * Built for Render deployment. Serves static assets and provides
 * a server-side relay to Supabase DB and Make.com webhook.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dpmzxkxcppqfnkkyysbj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbXp4a3hjcHBxZm5ra3l5c2JqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA2MzUzNiwiZXhwIjoyMTAyNjM5NTM2fQ.X-nOBdVf013FVJUn9owiPNfHp-Ug-N6NPcVRUOSZ8V0';
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL || 'https://hook.eu1.make.com/ykaaofu4q8kbkrm91rr0fib67zoaz9me';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8'
};

async function handleSubmission(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 10 * 1024 * 1024) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);

      const name = (payload.name || payload.full_name || '').trim();
      const email = (payload.email || payload.user_email || '').trim();

      if (!name || !email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Name and email are required' }));
        return;
      }

      // Ensure company identifiers are always attached to the payload
      payload.company_name = payload.company_name || 'Emergency Housing Group';
      payload.company = payload.company || 'Emergency Housing Group';
      payload.brand = payload.brand || 'Emergency Housing Group';
      payload.source = payload.source || 'Emergency Housing Group Maintenance Portal';

      const fileUrls = Array.isArray(payload.file_urls) ? payload.file_urls : [];

      const dbRecord = {
        name: String(payload.name || ''),
        email: String(payload.email || ''),
        phone: String(payload.phone || ''),
        full_address: String(payload.full_address || ''),
        address_line_1: String(payload.address_line_1 || ''),
        address_line_2: String(payload.address_line_2 || ''),
        address_line_3: String(payload.address_line_3 || ''),
        city: String(payload.city || ''),
        postcode: String(payload.postcode || ''),
        issue_code: String(payload.issue_code || ''),
        issue_label: String(payload.issue_label || ''),
        other_issue_text: String(payload.other_issue_text || ''),
        further_info: String(payload.further_info || ''),
        troubleshooting_summary: String(payload.troubleshooting_summary || ''),
        troubleshooting_answers: payload.troubleshooting_answers || null,
        troubleshooting_path: payload.troubleshooting_path || [],
        boiler_error_code: String(payload.boiler_error_code || ''),
        internal_priority: String(payload.internal_priority || 'normal'),
        engineer_required: Boolean(payload.engineer_required || false),
        request_closed: Boolean(payload.request_closed || false),
        responsibility_type: String(payload.responsibility_type || ''),
        alert_type: String(payload.alert_type || ''),
        final_action: String(payload.final_action || ''),
        file_urls: fileUrls,
        file_count: fileUrls.length,
        submitted_at: String(payload.submitted_at || new Date().toISOString()),
        make_webhook_sent: false
      };

      // 1. Insert into Supabase Postgres
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/maintenance_submissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(dbRecord)
        });
      } catch (dbErr) {
        console.error('[EHG Server] Supabase DB insert error:', dbErr.message);
      }

      // 2. Forward to Make.com Webhook
      try {
        const makeRes = await fetch(MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!makeRes.ok) {
          console.warn('[EHG Server] Make.com returned status:', makeRes.status);
        }
      } catch (makeErr) {
        console.error('[EHG Server] Make.com webhook error:', makeErr.message);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

    } catch (parseErr) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
    }
  });
}

function serveStatic(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Security: Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = req.url.split('?')[0];

  // Submission endpoints
  if (req.method === 'POST' && (cleanUrl === '/submit.php' || cleanUrl === '/api/submit')) {
    handleSubmission(req, res);
    return;
  }

  // Health check
  if (req.method === 'GET' && (cleanUrl === '/health' || cleanUrl === '/api/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Emergency Housing Group Form' }));
    return;
  }

  // Default: static file serving
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`[Emergency Housing Group] Server running on port ${PORT}`);
});
