const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Find current version from the badge
const versionMatch = html.match(/<span style="[^"]*">v=(\d+)\.(\d+)\.(\d+)<\/span>/);
if (!versionMatch) {
  console.error("Could not find version string in index.html (looking for badge)");
  process.exit(1);
}

const major = parseInt(versionMatch[1]);
const minor = parseInt(versionMatch[2]);
let patch = parseInt(versionMatch[3]);

// Bump patch version
patch += 1;
const newVersion = `${major}.${minor}.${patch}`;
const newVString = `v=${newVersion}`;
const timestamp = Date.now();
const cacheBustVersion = `${newVersion}_${timestamp}`;

// Replace all ?v=X.Y.Z (and ?v=X.Y.Z_12345) with the new cache bust version for resources
html = html.replace(/\?v=\d+\.\d+\.\d+(_\d+)?/g, `?v=${cacheBustVersion}`);
// Replace the display version v=X.Y.Z text
html = html.replace(/v=\d+\.\d+\.\d+(?![_\d])/g, newVString);

// Inject global app version variable for the cache buster script
if (html.includes('<script id="version-data">')) {
  html = html.replace(/<script id="version-data">.*?<\/script>/, `<script id="version-data">window.APP_VERSION="${cacheBustVersion}";</script>`);
} else {
  html = html.replace('</head>', `  <script id="version-data">window.APP_VERSION="${cacheBustVersion}";</script>\n</head>`);
}

fs.writeFileSync(indexPath, html);

// Generate version.json
const versionData = {
  version: cacheBustVersion,
  semantic: newVersion,
  timestamp: timestamp
};
fs.writeFileSync(path.join(__dirname, 'version.json'), JSON.stringify(versionData, null, 2));

console.log(`[Build Success] Version bumped to ${newVersion} (Cache bust: ${timestamp})`);
console.log(`[Build Success] Static Web Application is ready to serve directly.`);
