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
    server.listen(8218, () => resolve(server));
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

  console.log('1. Loading web application ...');
  await page.goto('http://localhost:8218/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('2. Clicking sidebar COSTING tab...');
  await page.click('.tab-btn[data-tab="tab-costing"]');
  await new Promise(r => setTimeout(r, 600));

  // Stress test: rapid subtab switching
  console.log('3. Rapid subtab switching test (10 iterations)...');
  const subtabs = ['labour', 'equipment', 'panels', 'materials'];
  for (let i = 0; i < 10; i++) {
    const target = subtabs[i % subtabs.length];
    await page.click(`#costSubTabBtn-${target}`);
    await new Promise(r => setTimeout(r, 80));
  }

  // Stress test: rapid company switching
  console.log('4. Rapid company preset switching test...');
  await page.evaluate(() => {
    window.setActiveCostingPartyId('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 100));

  await page.evaluate(() => {
    window.setActiveCostingPartyId('default');
  });
  await new Promise(r => setTimeout(r, 100));

  await page.evaluate(() => {
    window.setActiveCostingPartyId('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 200));

  // Verify panels on HAYOUNG
  await page.click('#costSubTabBtn-panels');
  await new Promise(r => setTimeout(r, 300));
  const hayoungPanelRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#costingPanelTableBody tr input')).map(i => i.value).slice(0, 3);
  });
  console.log('HAYOUNG Panel check after stress test:', hayoungPanelRows);
  if (!hayoungPanelRows[0].startsWith('GR-')) {
    throw new Error('HAYOUNG panel codes should start with GR-');
  }

  // Navigate away and back
  console.log('5. Navigating away to Pallet Packing and back to Costing...');
  await page.click('.tab-btn[data-tab="tab-pallet-packing"]');
  await new Promise(r => setTimeout(r, 400));
  await page.click('.tab-btn[data-tab="tab-costing"]');
  await new Promise(r => setTimeout(r, 400));

  // Verify materials
  await page.click('#costSubTabBtn-materials');
  await new Promise(r => setTimeout(r, 300));
  const finalMat = await page.evaluate(() => {
    return {
      smc: document.getElementById('costMatSmcPrice').value,
      gc: document.getElementById('costMatGcPrice').value,
      skin: document.getElementById('costMatInsSkinPrice').value
    };
  });
  console.log('Final Materials State:', finalMat);
  if (!finalMat.smc || !finalMat.gc || !finalMat.skin) {
    throw new Error('Materials inputs lost after stress test!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_costing_stress_passed.png') });
  console.log('Saved test_costing_stress_passed.png');

  await browser.close();
  server.close();
  console.log('STABILITY STRESS TEST PASSED WITH 100% SUCCESS!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
