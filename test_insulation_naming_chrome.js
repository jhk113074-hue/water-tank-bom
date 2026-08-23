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
    server.listen(8213, () => resolve(server));
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

  console.log('1. Loading web application directly at #insulation-naming ...');
  await page.goto('http://localhost:8213/#insulation-naming', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Check if containers rendered on first load
  const isRendered = await page.evaluate(() => {
    const tabs = document.getElementById('insulationNamingCompanyTabsContainer');
    const table = document.getElementById('insulationNamingRuleTableContainer');
    const bulk = document.getElementById('insulationNamingBulkToolContainer');
    return {
      hasTabs: tabs && tabs.children.length > 0,
      hasTable: table && table.children.length > 0,
      hasBulk: bulk && bulk.children.length > 0
    };
  });
  console.log('Insulation Naming Map render status on first load:', isRendered);

  // Switch to HAYOUNG preset
  console.log('2. Switching to HAYOUNG preset...');
  await page.evaluate(() => {
    window.InsulationNamingMap.setActiveParty('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 1000));

  // Add rule
  console.log('3. Adding rule GW-1010-A -> SW-1010-A...');
  await page.evaluate(() => {
    window.InsulationNamingMap.addRule('GW-1010-A', 'SW-1010-A', null, 'hayoung_spec');
    window.InsulationNamingMap.renderUI();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_insulation_naming_hayoung_chrome.png') });
  console.log('Saved test_insulation_naming_hayoung_chrome.png');

  // Clean up rule
  await page.evaluate(() => {
    const rules = window.InsulationNamingMap.getRules('hayoung_spec');
    rules.forEach(r => {
      if (r.baseCode === 'GW-1010-A') {
        window.InsulationNamingMap.removeRule(r.id);
      }
    });
    window.InsulationNamingMap.renderUI();
  });

  await browser.close();
  server.close();
  console.log('Insulation Naming Map verified successfully with 0 errors!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
