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
    server.listen(8140, () => resolve(server));
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

  console.log('Navigating directly to #steel-accessories/mnt/int_side/5m ...');
  await page.goto('http://localhost:8140/#steel-accessories/mnt/int_side/5m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const initialUrl = await page.url();
  console.log('Current URL:', initialUrl);

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_url_sync_mnt.png') });
  console.log('Captured test_steel_url_sync_mnt.png');

  // Click Diagram Tab 3 (INT(GenPART))
  console.log('Clicking Tab 3: INT(GenPART)...');
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.sa-dtab');
    if (tabs.length >= 3) tabs[2].click();
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log('URL after clicking Tab 3:', await page.url());

  // Click Height 4mH
  console.log('Clicking Height 4mH...');
  await page.evaluate(() => {
    const hBtn = document.querySelector('.sa-hchip[data-h="4"]');
    if (hBtn) hBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log('URL after clicking 4mH:', await page.url());

  // Click Company Tab WATANI
  console.log('Clicking Company Tab WATANI...');
  await page.evaluate(() => {
    const cTab = document.querySelector('.sa-company-tab[data-party="WATANI"]');
    if (cTab) cTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log('URL after clicking WATANI:', await page.url());

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_url_sync_watani.png') });
  console.log('Captured test_steel_url_sync_watani.png');

  await browser.close();
  server.close();
}

run();
