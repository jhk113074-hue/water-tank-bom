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
    server.listen(8141, () => resolve(server));
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

  console.log('Navigating to http://localhost:8141/ ...');
  await page.goto('http://localhost:8141/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Switching to BOLT LOGIC & AUDIT tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="tab-bolt-recipes"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Initial Bolt URL:', await page.url());
  await page.screenshot({ path: path.join(artifactDir, 'test_bolt_logic_company_tabs_ysacc.png') });
  console.log('Captured test_bolt_logic_company_tabs_ysacc.png');

  // Click MNT company tab
  console.log('Clicking MNT company tab...');
  await page.evaluate(() => {
    const mntTab = Array.from(document.querySelectorAll('.bolt-company-tab')).find(b => b.textContent.includes('MNT'));
    if (mntTab) mntTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('MNT Bolt URL:', await page.url());
  await page.screenshot({ path: path.join(artifactDir, 'test_bolt_logic_company_tabs_mnt.png') });
  console.log('Captured test_bolt_logic_company_tabs_mnt.png');

  await browser.close();
  server.close();
}

run();
