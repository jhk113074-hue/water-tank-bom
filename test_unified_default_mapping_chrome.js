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
    server.listen(8266, () => resolve(server));
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

  await page.goto('http://localhost:8266/#steel-accessories/almuftah/int/int_side/4.5m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-option-mapping-bar');

  // 1. Verify Mode 1: 전체 Default (Global)
  await page.evaluate(() => {
    window.SteelAccessories.setReinfOptionViewMode('global');
  });
  await new Promise(r => setTimeout(r, 800));

  const globalData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-option-mapping-bar table tbody tr'));
    return rows.map(r => ({
      label: r.querySelector('td:first-child')?.innerText.trim(),
      optCount: r.querySelector('select')?.options.length
    }));
  });
  console.log('=== Mode 1: Global Default UI ===', globalData);
  if (globalData.length !== 2 || globalData[0].optCount !== 4 || globalData[1].optCount !== 4) {
    throw new Error('Global Default mode must have 2 rows with 4 options each!');
  }

  // 2. Verify Mode 2: 내부보강 Default (Internal)
  await page.evaluate(() => {
    window.SteelAccessories.setReinfOptionViewMode('int');
  });
  await new Promise(r => setTimeout(r, 800));

  const intData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-option-mapping-bar table tbody tr'));
    return rows.map(r => ({
      label: r.querySelector('td:first-child')?.innerText.trim(),
      optCount: r.querySelector('select')?.options.length
    }));
  });
  console.log('=== Mode 2: Internal Default UI ===', intData);
  if (intData.length !== 2 || intData[0].optCount !== 2 || intData[1].optCount !== 2) {
    throw new Error('Internal Default mode must have 2 rows with 2 INT options each!');
  }

  // 3. Verify Mode 3: 외부보강 Default (External)
  await page.evaluate(() => {
    window.SteelAccessories.setReinfOptionViewMode('ext');
  });
  await new Promise(r => setTimeout(r, 800));

  const extData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-option-mapping-bar table tbody tr'));
    return rows.map(r => ({
      label: r.querySelector('td:first-child')?.innerText.trim(),
      optCount: r.querySelector('select')?.options.length
    }));
  });
  console.log('=== Mode 3: External Default UI ===', extData);
  if (extData.length !== 2 || extData[0].optCount !== 2 || extData[1].optCount !== 2) {
    throw new Error('External Default mode must have 2 rows with 2 EXT options each!');
  }

  // Switch back to Global for final screenshot
  await page.evaluate(() => {
    window.SteelAccessories.setReinfOptionViewMode('global');
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(artifactDir, 'test_three_default_mapping_modes_verified.png') });
  console.log('Saved screenshot test_three_default_mapping_modes_verified.png');

  await browser.close();
  server.close();
  console.log('ALL 3 DEFAULT MAPPING MODES (GLOBAL, INTERNAL, EXTERNAL) PASSED 100% PERFECTLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
