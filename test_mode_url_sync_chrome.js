const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const relPath = req.url.split('?')[0].split('#')[0].replace(/^\/+/, '');
      let filePath = path.join(__dirname, relPath || 'index.html');
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found: ' + req.url); return; }
        let contentType = 'text/html';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.json')) contentType = 'application/json';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(8256, () => resolve(server));
  });
}

async function run() {
  const server = await startLocalServer();
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disk-cache-size=1']
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 1100 });

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Test 1: Direct navigation to #steel-accessories/almuftah/int/int_side/2.5m
  await page.goto('http://localhost:8256/#steel-accessories/almuftah/int/int_side/2.5m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1800));

  const state1 = await page.evaluate(() => {
    const hash = window.location.hash;
    const diagram = window.SteelAccessories ? window.SteelAccessories.getCurrentDiagramId() : null;
    const height = window.SteelAccessories ? window.SteelAccessories.getCurrentHeight() : null;
    const party = window.PartNaming ? window.PartNaming.activeParty() : null;
    return { hash, diagram, height, party };
  });

  console.log('=== TEST 1 (INT Navigation) ===', state1);
  if (!state1.hash.includes('int') || !state1.hash.includes('2.5m') || state1.diagram !== 'int_side') {
    throw new Error('Test 1 failed to restore int mode state from URL!');
  }

  // Test 2: Switch to External mode via setReinfOptionViewMode
  await page.evaluate(() => {
    if (window.SteelAccessories) {
      window.SteelAccessories.setReinfOptionViewMode('ext');
    }
  });
  await new Promise(r => setTimeout(r, 600));

  const state2 = await page.evaluate(() => {
    const hash = window.location.hash;
    const diagram = window.SteelAccessories ? window.SteelAccessories.getCurrentDiagramId() : null;
    return { hash, diagram };
  });

  console.log('=== TEST 2 (Switch to EXT) ===', state2);
  if (!state2.hash.includes('ext') || state2.diagram !== 'ext_side') {
    throw new Error('Test 2 failed to update URL hash to ext mode!');
  }

  // Test 3: Switch back to Internal mode via setReinfOptionViewMode
  await page.evaluate(() => {
    if (window.SteelAccessories) {
      window.SteelAccessories.setReinfOptionViewMode('int');
    }
  });
  await new Promise(r => setTimeout(r, 600));

  const state3 = await page.evaluate(() => {
    const hash = window.location.hash;
    const diagram = window.SteelAccessories ? window.SteelAccessories.getCurrentDiagramId() : null;
    return { hash, diagram };
  });

  console.log('=== TEST 3 (Switch to INT) ===', state3);
  if (!state3.hash.includes('int') || state3.diagram !== 'int_side') {
    throw new Error('Test 3 failed to update URL hash to int mode!');
  }

  // Test 4: Direct URL navigation with EXT
  await page.goto('http://localhost:8256/#steel-accessories/ext/ext_side/3m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1800));

  const state4 = await page.evaluate(() => {
    const hash = window.location.hash;
    const diagram = window.SteelAccessories ? window.SteelAccessories.getCurrentDiagramId() : null;
    const height = window.SteelAccessories ? window.SteelAccessories.getCurrentHeight() : null;
    return { hash, diagram, height };
  });

  console.log('=== TEST 4 (Direct EXT Navigation) ===', state4);
  if (!state4.hash.includes('ext') || state4.diagram !== 'ext_side' || state4.height !== '3') {
    throw new Error('Test 4 failed to restore direct ext navigation!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_mode_url_sync_verified.png') });
  console.log('Saved screenshot test_mode_url_sync_verified.png');

  await browser.close();
  server.close();
  console.log('ALL MODE URL SYNC TESTS PASSED FLAWLESSLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
