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
    server.listen(8201, () => resolve(server));
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
  await page.goto('http://localhost:8201/#panel-config/ysacc/opt1-side', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Check Sidebar Button
  const sidebarBtnText = await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-opening-spec"]');
    return btn ? btn.textContent.trim() : null;
  });
  console.log('Sidebar Button Text:', sidebarBtnText);
  if (!sidebarBtnText.includes('HOLE DRILLING SPEC')) throw new Error('Sidebar button should say HOLE DRILLING SPEC');

  // Check Toolbar text
  const toolbarText = await page.evaluate(() => {
    const el = document.getElementById('panelMatrixSubOptTabsWrapper');
    return el ? el.innerText : '';
  });
  console.log('Toolbar contains Hole Drilling Spec Mode:', toolbarText.includes('Hole Drilling Spec Mode'));

  // Switch to Hole Drilling Spec Tab
  console.log('2. Switching to HOLE DRILLING SPEC tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-opening-spec"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_hole_drilling_spec_tab_chrome.png') });
  console.log('Saved test_hole_drilling_spec_tab_chrome.png');

  await browser.close();
  server.close();
  console.log('Hole drilling spec renaming test verified successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
