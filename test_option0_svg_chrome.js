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
    server.listen(8172, () => resolve(server));
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

  page.on('dialog', async dialog => {
    console.log('Dialog:', dialog.message());
    await dialog.accept();
  });

  console.log('Navigating to http://localhost:8172/#panel-config/hayoung/rf_mf_bf_dn ...');
  await page.goto('http://localhost:8172/#panel-config/hayoung/rf_mf_bf_dn', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    if (window.syncTabFromUrlHash) window.syncTabFromUrlHash();
    const btn = document.querySelector('.tab-btn[data-tab="tab-side-panel-config"]');
    if (btn) btn.click();
    const sub0Btn = document.querySelector('.btnMatrixSubOptTab[data-num="0"]');
    if (sub0Btn) sub0Btn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_option0_cad_panels_chrome.png') });
  console.log('Captured test_option0_cad_panels_chrome.png');

  await browser.close();
  server.close();
}

run();
