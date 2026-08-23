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
    server.listen(8205, () => resolve(server));
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

  console.log('1. Loading web application...');
  await page.goto('http://localhost:8205', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // 1. Click MOLD GROUPS tab
  console.log('2. Clicking MOLD GROUPS tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-mold-groups"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Take screenshot of YSACC default view
  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_ysacc_chrome.png') });
  console.log('Saved test_mold_groups_ysacc_chrome.png');

  // 2. Switch company to HAYOUNG by clicking button
  console.log('3. Switching to HAYOUNG Spec in MOLD GROUPS...');
  await page.evaluate(() => {
    window.MoldGroupManager.setActiveParty('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 1000));

  // Create a mold group for HAYOUNG
  console.log('4. Creating 500x1000 Mold Group for HAYOUNG...');
  await page.evaluate(() => {
    window.MoldGroupManager.addGroup('500x1000 Standard Mold', ['GR-0510-D', 'GF-0510-D'], 'hayoung_spec');
    window.MoldGroupManager.renderUI();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_hayoung_chrome.png') });
  console.log('Saved test_mold_groups_hayoung_chrome.png');

  await browser.close();
  server.close();
  console.log('Verification finished cleanly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
