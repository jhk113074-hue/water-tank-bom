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
    server.listen(8217, () => resolve(server));
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
  await page.goto('http://localhost:8217/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('2. Clicking sidebar COSTING tab...');
  await page.click('.tab-btn[data-tab="tab-costing"]');
  await new Promise(r => setTimeout(r, 800));

  // Check subtab 1 inputs
  const matValues = await page.evaluate(() => {
    return {
      smc: document.getElementById('costMatSmcPrice').value,
      gc: document.getElementById('costMatGcPrice').value,
      skin: document.getElementById('costMatInsSkinPrice').value,
      mdi: document.getElementById('costMatInsMdiPrice').value,
      polyol: document.getElementById('costMatInsPolyolPrice').value
    };
  });
  console.log('Materials Values:', matValues);
  if (!matValues.smc || !matValues.gc || !matValues.skin) {
    throw new Error('Materials inputs were blank!');
  }
  await page.screenshot({ path: path.join(artifactDir, 'test_tab_fixed_materials.png') });

  // 3. Click Subtab 2 (Labour Cost)
  console.log('3. Clicking Subtab 2 (Labour Cost)...');
  await page.click('#costSubTabBtn-labour');
  await new Promise(r => setTimeout(r, 500));
  const labValues = await page.evaluate(() => {
    return {
      weekdays: document.getElementById('costWorkHoursWeekdays').value,
      direct: document.getElementById('costDirectLaborYear').value,
      rateDisplay: document.getElementById('costDirectLaborRateDisplay').innerText
    };
  });
  console.log('Labour Values:', labValues);
  if (!labValues.weekdays || !labValues.direct) {
    throw new Error('Labour inputs were blank!');
  }
  await page.screenshot({ path: path.join(artifactDir, 'test_tab_fixed_labour.png') });

  // 4. Click Subtab 3 (Equipment List)
  console.log('4. Clicking Subtab 3 (Equipment List)...');
  await page.click('#costSubTabBtn-equipment');
  await new Promise(r => setTimeout(r, 500));
  const eqRows = await page.evaluate(() => {
    return document.querySelectorAll('#costingEquipmentTableBody tr').length;
  });
  console.log('Equipment Rows:', eqRows);
  if (eqRows === 0) throw new Error('Equipment table empty!');
  await page.screenshot({ path: path.join(artifactDir, 'test_tab_fixed_equipment.png') });

  // 5. Click Subtab 4 (Panel Cost Table)
  console.log('5. Clicking Subtab 4 (Panel Cost Table)...');
  await page.click('#costSubTabBtn-panels');
  await new Promise(r => setTimeout(r, 500));
  const panelRows = await page.evaluate(() => {
    return document.querySelectorAll('#costingPanelTableBody tr').length;
  });
  console.log('Panel Rows:', panelRows);
  if (panelRows === 0) throw new Error('Panel table empty!');
  await page.screenshot({ path: path.join(artifactDir, 'test_tab_fixed_panels.png') });

  // 6. Switch to HAYOUNG Spec and recheck
  console.log('6. Clicking HAYOUNG Spec preset tab...');
  await page.evaluate(() => {
    window.setActiveCostingPartyId('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(artifactDir, 'test_tab_fixed_hayoung_panels.png') });

  await browser.close();
  server.close();
  console.log('All tab clicking and input rendering verified with 0 errors!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
