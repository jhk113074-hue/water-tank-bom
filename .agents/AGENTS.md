# Project Rules for WATER_TANK_BOM

## Mandatory Pre-Completion Verification & Runtime Test Directive
Before declaring any modification task complete or presenting results to the user:
1. **Runtime Verification First**: ALWAYS run empirical execution tests (e.g. `node -e "..."` or test scripts) to execute all modified functions, engines, and calculations.
2. **Zero Errors**: Verify that all modified modules run cleanly with 0 exceptions or runtime errors.
3. **Never Guess or Assume**: Never declare a task complete without actual runtime validation.

## Automatic Build, DB Sync, Versioning & Deployment Directive
Whenever code files (`.js`, `.html`, `.css`, etc.) or database files (`parts_db.json`) are updated:
1. ALWAYS increment the version badge (`v=X.Y.Z`) on the header title in `index.html` (e.g. `v=2.0.6`).
2. ALWAYS run `npm run build` to verify web app static build readiness.
3. ALWAYS run `npm run upload-db` to synchronize `parts_db.json` data with Firebase Firestore DB.
4. ALWAYS stage, commit with clear descriptive commit messages, and push to GitHub repository (`git push origin main`).
