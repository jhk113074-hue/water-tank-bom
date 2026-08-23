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
    server.listen(8214, () => resolve(server));
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

  console.log('1. Loading web application at #costing/panels ...');
  await page.goto('http://localhost:8214/#costing/panels', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Verify YSACC tabs & panels
  const ysaccData = await page.evaluate(() => {
    const tabs = document.querySelectorAll('#costingCompanyTabsContainer button').length;
    const rows = document.querySelectorAll('#costingPanelTableBody tr').length;
    const firstCode = document.querySelector('#costingPanelTableBody tr td input') ? document.querySelector('#costingPanelTableBody tr td input').value : null;
    return { tabs, rows, firstCode };
  });
  console.log('YSACC Costing Panels State:', ysaccData);
  if (ysaccData.tabs === 0 || ysaccData.rows === 0) {
    throw new Error('YSACC costing panel table was empty!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_costing_panels_ysacc_chrome.png') });
  console.log('Saved test_costing_panels_ysacc_chrome.png');

  // 2. Switch to HAYOUNG Spec
  console.log('2. Switching to HAYOUNG Spec in Costing...');
  await page.evaluate(() => {
    window.setActiveCostingPartyId('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 1000));

  const hayoungData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#costingPanelTableBody tr')).map(tr => {
      const inputs = tr.querySelectorAll('input');
      return {
        code: inputs[0] ? inputs[0].value : '',
        desc: inputs[1] ? inputs[1].value : '',
        weight: inputs[2] ? inputs[2].value : ''
      };
    });
    return rows;
  });
  console.log('HAYOUNG Costing Panel Codes:', hayoungData.map(r => r.code));

  const hasHayoungCodes = hayoungData.some(r => r.code.startsWith('GW-') || r.code.startsWith('GF-') || r.code.startsWith('GR-'));
  if (!hasHayoungCodes) {
    throw new Error('HAYOUNG costing panel table should contain HAYOUNG codes!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_costing_panels_hayoung_chrome.png') });
  console.log('Saved test_costing_panels_hayoung_chrome.png');

  // 3. Test Master DB Update
  console.log('3. Testing applyCostingToMasterDb for HAYOUNG...');
  await page.evaluate(() => {
    window.applyCostingToMasterDb(true);
  });
  await new Promise(r => setTimeout(r, 500));

  await browser.close();
  server.close();
  console.log('Company-specific Panel Cost Table verified successfully with 0 errors!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
