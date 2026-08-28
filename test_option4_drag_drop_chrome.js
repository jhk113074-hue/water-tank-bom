const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const relPath = req.url.split('?')[0].split('#')[0].replace(/^\/+/, '');
      let filePath = path.join(__dirname, relPath || 'index.html');
      console.log('REQ URL:', req.url, '-> filePath:', filePath, 'exists:', fs.existsSync(filePath));
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
    server.listen(8179, () => resolve(server));
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

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('1. Navigating to panel config option 4...');
  await page.goto('http://localhost:8179/#panel-config/ysacc/opt4-parti_1m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3500));

  console.log('2. Reordering slice...');
  await page.evaluate(() => {
    window.reorderPanelSlices(2.5, 2, 1);
  });
  await new Promise(r => setTimeout(r, 1500));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_option4_reordered_middle_chrome.png') });
  console.log('Saved test_option4_reordered_middle_chrome.png');

  console.log('3. Switch to Steel Accessories 4. INT(PART_1m_O) 2.5mH...');
  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-steel-accessories"]');
    if (btn) btn.click();
    if (window.SteelAccessories && typeof window.SteelAccessories.switchView === 'function') {
      window.SteelAccessories.switchView('ysacc', 'int_partition_2', '2.5');
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_opt4_reordered_middle_chrome.png') });
  console.log('Saved test_steel_acc_opt4_reordered_middle_chrome.png');

  await browser.close();
  server.close();
  console.log('DONE!');
}

run();
