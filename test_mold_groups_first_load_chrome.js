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
    server.listen(8208, () => resolve(server));
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

  // Test Direct First Screen Load at #mold-groups URL
  console.log('1. Direct first-screen load at URL: #mold-groups ...');
  await page.goto('http://localhost:8208/#mold-groups', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Check if containers are populated on first screen load
  const isPopulatedOnFirstLoad = await page.evaluate(() => {
    const tabs = document.getElementById('moldGroupCompanyTabsContainer');
    const catalog = document.getElementById('moldCompanyPanelCatalogContainer');
    const editor = document.getElementById('moldGroupEditorContainer');
    const plan = document.getElementById('moldProductionPlanContainer');

    return {
      hasTabs: tabs && tabs.children.length > 0,
      hasCatalog: catalog && catalog.children.length > 0,
      hasEditor: editor && editor.children.length > 0,
      hasPlan: plan && plan.children.length > 0
    };
  });
  console.log('First load population status:', isPopulatedOnFirstLoad);

  if (!isPopulatedOnFirstLoad.hasTabs || !isPopulatedOnFirstLoad.hasCatalog || !isPopulatedOnFirstLoad.hasEditor || !isPopulatedOnFirstLoad.hasPlan) {
    throw new Error('MOLD GROUPS should be fully rendered and populated on direct first load!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_first_load_chrome.png') });
  console.log('Saved test_mold_groups_first_load_chrome.png');

  await browser.close();
  server.close();
  console.log('Direct first-load verification passed successfully with 0 errors!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
