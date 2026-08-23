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
    server.listen(8212, () => resolve(server));
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

  // Test 1: Direct load with #mold-groups
  console.log('1. Direct load with #mold-groups URL...');
  await page.goto('http://localhost:8212/#mold-groups', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const count1 = await page.evaluate(() => {
    return {
      buttons: document.querySelectorAll('#moldGroupCompanyTabsContainer button').length,
      panels: document.querySelectorAll('#moldCompanyPanelCatalogContainer > div > div > div').length
    };
  });
  console.log('Test 1 direct load counts:', count1);
  if (count1.buttons === 0 || count1.panels === 0) {
    throw new Error('Test 1 failed: MOLD GROUPS was empty on direct load!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_first_screen_load_direct_ok.png') });
  console.log('Saved test_first_screen_load_direct_ok.png');

  // Test 2: Fresh page load, expand SYSTEM SETTINGS accordion, click MOLD GROUPS
  console.log('2. Fresh load, click SYSTEM SETTINGS -> MOLD GROUPS...');
  await page.goto('http://localhost:8212', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const settingsToggle = document.getElementById('btnToggleSettingsGroup');
    if (settingsToggle) settingsToggle.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const moldBtn = document.querySelector('.subtab-btn[data-tab="tab-mold-groups"]');
    if (moldBtn) moldBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const count2 = await page.evaluate(() => {
    return {
      buttons: document.querySelectorAll('#moldGroupCompanyTabsContainer button').length,
      panels: document.querySelectorAll('#moldCompanyPanelCatalogContainer > div > div > div').length
    };
  });
  console.log('Test 2 menu click counts:', count2);
  if (count2.buttons === 0 || count2.panels === 0) {
    throw new Error('Test 2 failed: MOLD GROUPS was empty on submenu click!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_first_click_submenu_ok.png') });
  console.log('Saved test_first_click_submenu_ok.png');

  await browser.close();
  server.close();
  console.log('All first-screen rendering tests passed 100%!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
