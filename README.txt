Glamora COMPLETE V6.1
=======================

V6.1 COUNTER FIX: The visitor counter now increments when glamindex.html is opened directly, using a local per-browser fallback. This local count is not shared with other people. For the real shared SQLite counter and backend features (login, booking, artist data), start the website with START_GLAMORA.bat and open http://localhost:3000. Do not rely on double-clicking glamindex.html for full backend functionality.

START ON WINDOWS
1. Extract the ZIP using Extract All.
2. Open the extracted folder. The files package.json, server.js, style.css, glamindex.html and START_GLAMORA.bat should be directly inside this folder.
3. Double-click START_GLAMORA.bat.
4. On first launch, wait while npm installs dependencies. Internet access is required for this first install.
5. The browser should open automatically. If not, visit http://localhost:3000.
6. Keep the black command window open while testing the site.

CSS FIX IN V6
The local stylesheet and local asset references in glamindex.html and workspace.html use relative paths (./style.css, ./script.js and ./assets/...). This fixes the leading-slash asset-path problem that caused a plain, unstyled page when glamindex.html was opened from a Windows file path. The CSS should also load through the local server.

REQUIREMENTS
- Node.js 22.5 or newer (Node's built-in SQLite is used).
- Internet connection for the first npm install and remote fonts/portfolio imagery.

DEMO LOGIN
Customer: customer@Glamora.demo
Password: demo123
Artist: artist@Glamora.demo
Password: demo123
These are demo credentials only. Do not use real customer data or deploy them as production credentials.

NOTES
- If START_GLAMORA.bat reports an error, take a photo of the full black window and share it.
- Do not upload .env files, passwords, or a real database to a public repository.
- Render free hosting has ephemeral local storage; SQLite data and uploaded files may reset after restart/redeploy.
