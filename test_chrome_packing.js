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
    server.listen(8121, () => resolve(server));
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
  await page.setViewport({ width: 1440, height: 900 });

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  console.log('Navigating to http://localhost:8121/#pallet-packing ...');
  await page.goto('http://localhost:8121/#pallet-packing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Setting tank inputs: 2m x 2m x 2m (clearing L2, L3, L4)...');
  await page.evaluate(() => {
    document.getElementById('tankLength1').value = '2';
    document.getElementById('tankLength2').value = '0';
    document.getElementById('tankLength3').value = '0';
    document.getElementById('tankLength4').value = '0';
    document.getElementById('tankWidth').value = '2';
    document.getElementById('tankHeight').value = '2';
    if (window.recalculateBOM) window.recalculateBOM();
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Running Auto Packing in Chrome...');
  await page.evaluate(() => {
    if (window.PalletPacking && window.PalletPacking.runAutoPack) {
      window.PalletPacking.runAutoPack();
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_2x2x2_packing_chrome.png') });
  console.log('Captured test_2x2x2_packing_chrome.png');

  const palletCount = await page.evaluate(() => {
    return document.querySelectorAll('#palletsDashboard .card, #palletsDashboard > div').length;
  });
  console.log('Pallet Count in Chrome:', palletCount);

  await browser.close();
  server.close();
}

run();
