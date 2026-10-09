# Glamora V6.1.0 — Change notes

- Fixed CSS and local asset references to use relative paths in the main page and workspace.
- Kept the V5 CSS design, logo emblem/wordmark, Instagram link handling, counter logic, SQLite backend and Render setup.
- Updated the Windows launcher with clearer checks, dependency installation, and browser opening.
- Updated package version and setup instructions.

Validation: JavaScript syntax checks and ZIP integrity are run before delivery. A full live server test depends on installing npm packages in the user's environment.

- Visitor counter no longer stays fixed at 100 when the API cannot be reached: it falls back to a per-browser local counter. The shared total requires running the Node.js server.
