# Glamora V6 — Render deployment (college demo)

## Before deployment
Upload the **contents** of this folder to the top level of the GitHub repository. The repository's main page should show `package.json`, `server.js`, `glamindex.html`, `script.js`, and `style.css` directly. Do not upload only the enclosing folder as a nested directory.

## Render Web Service settings
- Runtime: **Node** (not Docker)
- Branch: `main` (or the branch containing these files)
- Root Directory: leave blank when `package.json` is visible at the repository root
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Region: Singapore if available; otherwise choose the closest available region
- Compute: Free is suitable for a temporary demo, with limitations

The service does not require a custom domain to start. The generated `onrender.com` URL can be used as a staging/demo link.

## Environment variables
Set these in the Render dashboard only when needed:
- `NODE_ENV=production`
- `SQLITE_DB_PATH=./glamora.sqlite`
- `UPLOAD_DIR=./uploads`
- `GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID`
- `GOOGLE_MAPS_API_KEY` (optional for the map; add your key in Render, never in source code)
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (leave blank to use clearly labelled demo payment mode)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (optional; use a unique password of at least 12 characters)

## Free plan limitations
Render Free services may sleep after inactivity. Their filesystem is ephemeral, so SQLite changes and uploaded files can be lost after restarts or redeployments. Use this for a college presentation/demo only; use persistent storage and additional security/testing before real customer use.

## Quick checks after deploy
1. Open `/api/health` and confirm it returns `ok: true`.
2. Open the home page and confirm the Glamora emblem appears in the header.
3. Confirm the visitor counter increments after refresh.
4. Confirm Instagram links appear on the demo artist cards and artist profile modal.
5. Create a test customer account and test a demo booking. Do not use real payments for the college demo.

## Google Maps
A live Google Map requires an enabled Maps JavaScript API and a correctly restricted API key. Without the key, the website uses its fallback map panel; other page features should still work.
