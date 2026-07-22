# Project Rules for WATER_TANK_BOM

## Automatic Build, DB Sync, Versioning & Deployment Directive
Whenever code files (`.js`, `.html`, `.css`, etc.) or database files (`parts_db.json`) are updated:
1. ALWAYS increment the version badge (`v=X.Y.Z`) on the header title in `index.html` (e.g. `v=2.0.6`).
2. ALWAYS run `npm run build` to verify web app static build readiness.
3. ALWAYS run `npm run upload-db` to synchronize `parts_db.json` data with Firebase Firestore DB.
4. ALWAYS stage, commit with clear descriptive commit messages, and push to GitHub repository (`git push origin main`).
