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
    server.listen(8211, () => resolve(server));
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

  console.log('1. Loading web application on home page...');
  await page.goto('http://localhost:8211', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('2. Clicking MOLD GROUPS directly on first screen...');
  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-mold-groups"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_first_click_direct.png') });
  console.log('Saved test_mold_groups_first_click_direct.png');

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
