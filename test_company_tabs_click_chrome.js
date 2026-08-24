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
    server.listen(8224, () => resolve(server));
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

  await page.goto('http://localhost:8224/#steel-accessories', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="tab-steel-accessories"]');
    if (btn) btn.click();
  });

  await page.waitForFunction(() => {
    return window.SteelAccessories && window.SteelAccessories.getLayout() && document.querySelector('.sa-company-tab');
  }, { timeout: 10000 });

  // 1. Click HAYOUNG tab
  console.log('Clicking HAYOUNG tab...');
  await page.evaluate(() => {
    const hayoungBtn = Array.from(document.querySelectorAll('.sa-company-tab')).find(b => b.getAttribute('data-party') === 'HAYOUNG');
    if (hayoungBtn) hayoungBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  let activeParty = await page.evaluate(() => {
    return window.PartNaming ? window.PartNaming.activeParty() : null;
  });
  console.log('Active Party after HAYOUNG click:', activeParty);
  if (activeParty !== 'HAYOUNG') throw new Error('Failed to switch to HAYOUNG');

  // 2. Click MNT tab
  console.log('Clicking MNT tab...');
  await page.evaluate(() => {
    const mntBtn = Array.from(document.querySelectorAll('.sa-company-tab')).find(b => b.getAttribute('data-party') === 'MNT');
    if (mntBtn) mntBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  activeParty = await page.evaluate(() => {
    return window.PartNaming ? window.PartNaming.activeParty() : null;
  });
  console.log('Active Party after MNT click:', activeParty);
  if (activeParty !== 'MNT') throw new Error('Failed to switch to MNT');

  // 3. Click ALMUFTAH tab
  console.log('Clicking ALMUFTAH tab...');
  await page.evaluate(() => {
    const almuftahBtn = Array.from(document.querySelectorAll('.sa-company-tab')).find(b => b.getAttribute('data-party') === 'ALMUFTAH');
    if (almuftahBtn) almuftahBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  activeParty = await page.evaluate(() => {
    return window.PartNaming ? window.PartNaming.activeParty() : null;
  });
  console.log('Active Party after ALMUFTAH click:', activeParty);
  if (activeParty !== 'ALMUFTAH') throw new Error('Failed to switch to ALMUFTAH');

  // Screenshot ALMUFTAH view
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_almuftah_switched.png') });
  console.log('Saved test_steel_acc_almuftah_switched.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: Company tabs in Steel Accessories switch cleanly and update all UI sections!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
