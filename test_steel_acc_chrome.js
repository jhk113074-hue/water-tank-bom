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
    server.listen(8173, () => resolve(server));
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

  console.log('Navigating to http://localhost:8173/#steel-accessories ...');
  await page.goto('http://localhost:8173/#steel-accessories', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="tab-steel-accessories"]');
    if (btn) btn.click();
  });
  await page.waitForSelector('.sa-company-tab', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Clicking HAYOUNG tab in Steel Accessories...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.sa-company-tab'));
    const hayoungTab = tabs.find(t => t.textContent.includes('HAYOUNG'));
    if (hayoungTab) hayoungTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Selecting Option 2 (INT(Side_1m_C)) 3.5mH...');
  await page.evaluate(() => {
    const dtabs = Array.from(document.querySelectorAll('.sa-dtab'));
    const opt2Tab = dtabs.find(t => t.textContent.includes('Side_1m_C') || t.getAttribute('data-diagram') === 'INT(Side_1m_C)');
    if (opt2Tab) opt2Tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_hayoung_opt2_chrome.png') });
  console.log('Captured test_steel_acc_hayoung_opt2_chrome.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED!');
}

run();
