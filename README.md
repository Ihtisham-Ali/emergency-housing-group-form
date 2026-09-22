# Emergency Housing Group — Repair & Maintenance Portal

Modern, responsive, multi-step property repair reporting portal for **Emergency Housing Group** ("Providing Homes, Restoring Stability").

## Features

- **Branded Design**: Emergency Housing Group visual identity, logo, and responsive property background (`bg.png`).
- **Step-by-Step Reporting**: Contact Details, Issue Category & Details, Guided Troubleshooting, and Review & Submit.
- **Direct Supabase File Uploads**: Photos and videos are uploaded directly from the client to Supabase Storage with real-time progress indicators, eliminating file size limits (HTTP 413).
- **Postgres Database Record**: Submissions are automatically recorded in Supabase Postgres.
- **Make.com Webhook Integration**: Lightweight JSON payloads containing public Supabase file URLs are immediately relayed to Make.com automation.
- **Resilient Fallback**: Gracefully handles static hosting or offline states via localStorage backups and direct client webhook fallbacks.

## Deployment on Render

### Option 1: Render Web Service (Recommended)
1. Push this repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com/), click **New +** → **Web Service**.
3. Connect this GitHub repository (`emergency-housing-group-form`).
4. Render will automatically detect Node.js:
   - **Build Command**: `npm install` (or leave blank)
   - **Start Command**: `npm start`
5. Click **Create Web Service**. Your form is live!

### Option 2: Render Blueprint
Render will automatically detect `render.yaml` if you choose **New +** → **Blueprint**.

---

© 2026 Emergency Housing Group · Secure & Confidential
