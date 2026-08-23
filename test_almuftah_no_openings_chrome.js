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
    server.listen(8222, () => resolve(server));
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

  await page.goto('http://localhost:8222/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // 1. Simulate the exact matrix from user screenshot for ALMUFTAH
  await page.evaluate(() => {
    const almuftahMatrix = [
      { name: 'Row 1', heightGrades: { '1H': 'KB100', '2H': 'KB200', '3H': 'KB300', '4H': 'KB400', '5H': 'KB500' } },
      { name: 'Row 2', heightGrades: { '1H': 'KF100', '2H': 'KF100BX', '3H': 'KF200', '4H': 'KF200BX' } },
      { name: 'Row 3', heightGrades: { '1H': 'KF300', '2H': 'KF300BX', '3H': 'KF300LX', '4H': 'KF400', '5H': 'KF400BX', '6H': 'KF500' } },
      { name: 'Row 4', heightGrades: { '1H': 'KL100', '2H': 'KL100HX' } }
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
  console.log('Resulting ALMUFTAH panel codes (should have NO opening suffixes):', panelCodes);

  const expectedBaseCodes = ['KB100', 'KB200', 'KB300', 'KB400', 'KB500', 'KF100', 'KF200', 'KF300', 'KF400', 'KF500', 'KL100'];
  const hasOnlyPureBases = panelCodes.every(c => expectedBaseCodes.includes(c));
  const hasNoDuplicateOrSuffixes = !panelCodes.some(c => c.endsWith('BX') || c.endsWith('LX') || c.endsWith('HX') || c.endsWith('BP'));

  console.log('Has ONLY pure bases:', hasOnlyPureBases);
  console.log('Has NO opening suffixes:', hasNoDuplicateOrSuffixes);

  if (!hasOnlyPureBases || !hasNoDuplicateOrSuffixes) {
    throw new Error('Opening suffixes were not stripped properly!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_almuftah_pure_base_no_openings.png') });
  console.log('Saved test_almuftah_pure_base_no_openings.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: Panel Costing generated with ONLY pure base panel codes (Opening specs excluded)!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
