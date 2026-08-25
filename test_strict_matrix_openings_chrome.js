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
    server.listen(8233, () => resolve(server));
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

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8233/#panel-hole-spec', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-panel-hole-spec"]');
    if (btn) btn.click();
    else if (typeof window.switchTab === 'function') window.switchTab('tab-panel-hole-spec');
  });

  await page.waitForFunction(() => {
    return window.PanelHoleSpec && document.getElementById('panelHoleSpecFormContainer');
  }, { timeout: 10000 });

  // 1. Select SF10 panel
  console.log('Selecting SF10 panel...');
  await page.evaluate(() => {
    window.PanelHoleSpec.selectBaseCode('SF10');
  });
  await new Promise(r => setTimeout(r, 400));

  const sf10Rows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#panelHoleSpecFormContainer tbody tr'));
    return rows.map(r => r.getAttribute('data-opening-key'));
  });
  console.log('SF10 Displayed Opening Rows:', sf10Rows);

  if (sf10Rows.includes('BP') || sf10Rows.includes('BX')) {
    throw new Error('SF10 should not have BP or BX!');
  }
  if (!sf10Rows.includes('SX') || !sf10Rows.includes('HX') || !sf10Rows.includes('LX')) {
    throw new Error('SF10 missing required matrix openings!');
  }

  // Screenshot SF10
  await page.screenshot({ path: path.join(artifactDir, 'test_sf10_strict_matrix_openings.png') });
  console.log('Saved test_sf10_strict_matrix_openings.png');

  // 2. Select BF10 panel
  console.log('Selecting BF10 panel...');
  await page.evaluate(() => {
    window.PanelHoleSpec.selectBaseCode('BF10');
  });
  await new Promise(r => setTimeout(r, 400));

  const bf10Rows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#panelHoleSpecFormContainer tbody tr'));
    return rows.map(r => r.getAttribute('data-opening-key'));
  });
  console.log('BF10 Displayed Opening Rows:', bf10Rows);

  if (bf10Rows.includes('SX') || bf10Rows.includes('HX') || bf10Rows.includes('HL')) {
    throw new Error('BF10 should not have SX, HX, or HL!');
  }
  if (!bf10Rows.includes('BP') || !bf10Rows.includes('BX')) {
    throw new Error('BF10 missing required matrix openings!');
  }

  // Screenshot BF10
  await page.screenshot({ path: path.join(artifactDir, 'test_bf10_strict_matrix_openings.png') });
  console.log('Saved test_bf10_strict_matrix_openings.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: Strict matrix openings per panel verified cleanly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
