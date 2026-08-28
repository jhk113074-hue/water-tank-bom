const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url.split('?')[0].split('#')[0]);
      if (filePath === __dirname || filePath === __dirname + '\\' || filePath === __dirname + '/') {
        filePath = path.join(__dirname, 'index.html');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        let contentType = 'text/html';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.json')) contentType = 'application/json';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(8144, () => resolve(server));
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
  await page.setViewport({ width: 1440, height: 1000 });

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // 1. Go to YSACC (Default) at 1.5mH
  console.log('1. Navigating to YSACC 1.5mH ...');
  await page.goto('http://localhost:8144/#steel-accessories/ysacc/1/1.5m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-panel-svg', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // Screenshot YSACC
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_company_isolation_ysacc.png') });
  console.log('Captured test_steel_company_isolation_ysacc.png');

  // 2. Click MNT tab
  console.log('2. Clicking MNT tab ...');
  await page.evaluate(() => {
    const mntTab = Array.from(document.querySelectorAll('.sa-company-tab')).find(t => t.textContent.includes('MNT'));
    if (mntTab) mntTab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Screenshot MNT
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_company_isolation_mnt.png') });
  console.log('Captured test_steel_company_isolation_mnt.png');

  // Verify hash and party
  const partyInfo = await page.evaluate(() => {
    const activeTab = document.querySelector('.sa-company-tab.active')?.textContent.trim();
    const hash = window.location.hash;
    return { activeTab, hash };
  });
  console.log('Current Party Info:', JSON.stringify(partyInfo));

  await browser.close();
  server.close();
}

run();
