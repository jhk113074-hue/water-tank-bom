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
    server.listen(8219, () => resolve(server));
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
    console.log('Dialog opened:', dialog.message());
    await dialog.accept();
  });

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  console.log('1. Loading web app ...');
  await page.goto('http://localhost:8219/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('2. Clicking sidebar COSTING tab...');
  await page.click('.tab-btn[data-tab="tab-costing"]');
  await new Promise(r => setTimeout(r, 500));

  console.log('3. Switching to Subtab 4 (Panel Cost Table)...');
  await page.evaluate(() => {
    window.switchCostingSubTab('panels');
  });
  await new Promise(r => setTimeout(r, 400));

  console.log('4. Switching Company to ALMUFTAH Spec...');
  await page.evaluate(() => {
    window.setActiveCostingPartyId('almuftah');
  });
  await new Promise(r => setTimeout(r, 500));

  console.log('5. Clicking [업체별 판넬 동기화 (Auto-Sync Panels)] button...');
  await page.evaluate(() => {
    window.autoSyncCostingCompanyPanels('almuftah');
  });
  await new Promise(r => setTimeout(r, 600));

  const renderedCodes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#costingPanelTableBody tr td:first-child input')).map(i => i.value);
  });
  console.log('Rendered ALMUFTAH Panels Count:', renderedCodes.length);
  console.log('Rendered Panel codes sample:', renderedCodes.slice(0, 8));

  // Check that NO YSACC codes (DF10, BF10, etc.) are present
  const hasYsaccCodes = renderedCodes.some(c => c.startsWith('DF') || c.startsWith('BF') || c.startsWith('SF'));
  console.log('Has mixed YSACC codes:', hasYsaccCodes);

  if (hasYsaccCodes) {
    throw new Error('YSACC panels should have been removed from ALMUFTAH table!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_almuftah_synced_panels_chrome.png') });
  console.log('Saved test_almuftah_synced_panels_chrome.png');

  await browser.close();
  server.close();
  console.log('AUTO-SYNC PANELS TEST COMPLETED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
