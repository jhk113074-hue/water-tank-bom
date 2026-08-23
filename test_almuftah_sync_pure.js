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
    server.listen(8221, () => resolve(server));
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

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8221/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // 1. Simulate custom ALMUFTAH matrix in localStorage containing KR100BP, KB200BP, etc.
  await page.evaluate(() => {
    const almuftahMatrix = [
      { name: 'Roof Panel', heightGrades: { '1H': 'KR100BP', '2H': 'KR100BP', '3H': 'KR100BX' } },
      { name: 'Bottom Panel', heightGrades: { '1H': 'KB200BP', '2H': 'KB200BBP', '3H': 'KB200BX' } },
      { name: 'Side Panel 1H', heightGrades: { '1H': 'KS100BP', '2H': 'KS100BP' } },
      { name: 'Side Panel 2H', heightGrades: { '2H': 'KS200BP' } }
    ];
    localStorage.setItem('water_tank_panel_matrix_almuftah_opt0', JSON.stringify(almuftahMatrix));
    localStorage.setItem('water_tank_panel_matrix_almuftah_opt1', JSON.stringify(almuftahMatrix));
  });

  // 2. Switch to Costing tab, subtab panels, company almuftah
  await page.evaluate(() => {
    window.switchCostingSubTab('panels');
    window.setActiveCostingPartyId('almuftah');
  });
  await new Promise(r => setTimeout(r, 400));

  // 3. Trigger autoSyncCostingCompanyPanels
  console.log('Triggering autoSyncCostingCompanyPanels for ALMUFTAH...');
  await page.evaluate(() => {
    window.autoSyncCostingCompanyPanels('almuftah');
  });
  await new Promise(r => setTimeout(r, 500));

  // 4. Verify panel list
  const panelCodes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#costingPanelTableBody tr td:first-child input')).map(i => i.value);
  });
  console.log('Resulting ALMUFTAH panel codes:', panelCodes);

  const containsOnlyAlmuftah = panelCodes.every(c => c.startsWith('KR') || c.startsWith('KB') || c.startsWith('KS') || c.startsWith('N'));
  console.log('Contains ONLY Almuftah panels (no YSACC panels):', containsOnlyAlmuftah);

  if (!containsOnlyAlmuftah) {
    throw new Error('Non-Almuftah panels were not deleted!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_almuftah_pure_sync.png') });
  console.log('Saved test_almuftah_pure_sync.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: Only company panels shown and all other company panels deleted!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
