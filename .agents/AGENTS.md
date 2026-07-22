# Project Rules for WATER_TANK_BOM

## Automatic Build, DB Sync & Deployment Directive
Whenever code files (`.js`, `.html`, `.css`, etc.) or database files (`parts_db.json`) are updated:
1. ALWAYS run `npm run build` to verify web app static build readiness.
2. ALWAYS run `npm run upload-db` to synchronize `parts_db.json` data with Firebase Firestore DB.
3. ALWAYS stage, commit with clear descriptive commit messages, and push to GitHub repository (`git push origin main`).
