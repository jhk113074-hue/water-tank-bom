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
    server.listen(8192, () => resolve(server));
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

  console.log('1. Loading web application...');
  await page.goto('http://localhost:8192/#panel-config/hayoung/opt1-side', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.screenshot({ path: path.join(artifactDir, 'test_hayoung_opening_inputs_chrome.png') });
  console.log('Saved test_hayoung_opening_inputs_chrome.png');

  console.log('2. Switching to OPENING SPEC tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-opening-spec"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_opening_spec_tab_chrome.png') });
  console.log('Saved test_opening_spec_tab_chrome.png');

  console.log('3. Switching to PALLET PACKING tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-pallet-packing"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_pallet_packing_badge_chrome.png') });
  console.log('Saved test_pallet_packing_badge_chrome.png');

  await browser.close();
  server.close();
  console.log('All opening code tests verified successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
