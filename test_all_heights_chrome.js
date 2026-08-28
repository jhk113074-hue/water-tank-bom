const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url.split('?')[0].split('#')[0]);
      if (filePath === __dirname || filePath === __dirname + '\\' || filePath === __dirname + '/') {
        filePath = path.join(__dirname, 'index.html');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        let contentType = 'text/html';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.json')) contentType = 'application/json';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(8143, () => resolve(server));
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
  await page.setViewport({ width: 1440, height: 1000 });

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  console.log('Navigating to http://localhost:8143/#steel-accessories/1/2m ...');
  await page.goto('http://localhost:8143/#steel-accessories/1/2m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-panel-svg', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const badges = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.sa-hchip')).map(c => ({
      height: c.querySelector('.sa-hchip-h')?.textContent,
      badge: c.querySelector('.sa-hchip-badge')?.textContent
    }));
  });
  console.log('Height Chip Badges at 2mH:', JSON.stringify(badges));

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_2m_panel_chrome.png') });
  console.log('Captured test_steel_2m_panel_chrome.png');

  // Navigate to 3mH
  console.log('Navigating to http://localhost:8143/#steel-accessories/1/3m ...');
  await page.goto('http://localhost:8143/#steel-accessories/1/3m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_3m_panel_chrome.png') });
  console.log('Captured test_steel_3m_panel_chrome.png');

  await browser.close();
  server.close();
}

run();
