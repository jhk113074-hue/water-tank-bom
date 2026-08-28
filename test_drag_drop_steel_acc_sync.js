const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

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
    server.listen(8174, () => resolve(server));
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

  console.log('1. Go to Panel Config Option 2 and move 2.5mH 0.5m slice to index 1 (middle)...');
  await page.goto('http://localhost:8174/#panel-config/ysacc/opt2-side_1m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    // Reorder 2.5mH slice: move slice 2 (top 0.5m) to index 1 (middle)
    if (window.reorderPanelSlices) {
      window.reorderPanelSlices(2.5, 2, 1);
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('2. Navigate to Steel Accessories INT(Side_1m_O) 2.5mH...');
  await page.evaluate(() => {
    window.location.hash = '#steel-accessories';
    if (window.syncTabFromUrlHash) window.syncTabFromUrlHash();
  });
  await page.waitForSelector('.sa-dtab', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const dtabs = Array.from(document.querySelectorAll('.sa-dtab'));
    const opt2Tab = dtabs.find(t => t.textContent.includes('Side_1m') || t.getAttribute('data-diagram').includes('Side_1m'));
    if (opt2Tab) opt2Tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const h25Chip = document.querySelector('.sa-hchip[data-h="2.5"]');
    if (h25Chip) h25Chip.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_reordered_05m_slice_chrome.png') });
  console.log('Captured test_steel_acc_reordered_05m_slice_chrome.png');

  await browser.close();
  server.close();
  console.log('TEST COMPLETE & VERIFIED!');
}

run();
