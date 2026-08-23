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
    server.listen(8206, () => resolve(server));
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

  console.log('1. Loading web application...');
  await page.goto('http://localhost:8206', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Check subtab-btn position
  const subTabOrder = await page.evaluate(() => {
    const subMenu = document.getElementById('settingsSubMenuContainer');
    if (!subMenu) return [];
    return Array.from(subMenu.querySelectorAll('.subtab-btn')).map(b => ({
      tab: b.getAttribute('data-tab'),
      text: b.textContent.trim()
    }));
  });
  console.log('SYSTEM SETTINGS Submenu Order:', subTabOrder);

  const moldIndex = subTabOrder.findIndex(s => s.tab === 'tab-mold-groups');
  const panelMatrixIndex = subTabOrder.findIndex(s => s.tab === 'tab-side-panel-config');

  console.log(`MOLD GROUPS Index: ${moldIndex}, PANEL CONFIG Index: ${panelMatrixIndex}`);
  if (moldIndex === -1 || panelMatrixIndex === -1 || moldIndex !== panelMatrixIndex - 1) {
    throw new Error(`MOLD GROUPS must be directly above PANEL CONFIG (Matrix) in SYSTEM SETTINGS! (found moldIndex=${moldIndex}, panelIndex=${panelMatrixIndex})`);
  }

  // Click MOLD GROUPS in submenu
  console.log('2. Clicking MOLD GROUPS subtab button...');
  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-mold-groups"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_in_system_settings_chrome.png') });
  console.log('Saved test_mold_groups_in_system_settings_chrome.png');

  await browser.close();
  server.close();
  console.log('Navigation placement verified successfully with 0 errors!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
