const { execSync } = require('child_process');

console.log('Deploying hosting to Firebase...');
try {
  const out = execSync('npx firebase-tools deploy --only hosting --non-interactive', {
    stdio: 'inherit',
    cwd: __dirname
  });
  console.log('Firebase deploy completed successfully.');
} catch (e) {
  console.error('Firebase deploy failed:', e.message);
  process.exit(1);
}
