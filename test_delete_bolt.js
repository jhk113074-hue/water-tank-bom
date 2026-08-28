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
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(8115, () => resolve(server));
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
  await page.setViewport({ width: 1440, height: 900 });

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  console.log('Navigating to http://localhost:8115/#bolt-logic ...');
  await page.goto('http://localhost:8115/#bolt-logic', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Editing location text in left audit table...');
  await page.evaluate(() => {
    const locInput = document.querySelector('input[onchange*="updateBoltLocationOverride"]');
    if (locInput) {
      locInput.value = 'CUSTOM ROOF PANEL ASSEMBLE LOCATION';
      locInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Editing location description in right setting table...');
  await page.evaluate(() => {
    const settingLocInput = document.querySelector('input[onchange*="updateBoltSettingField"][onchange*="location"]');
    if (settingLocInput) {
      settingLocInput.value = 'CUSTOM SETTING LOCATION DESC';
      settingLocInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_editable_location_text.png') });
  console.log('Captured test_editable_location_text.png');

  await browser.close();
  server.close();
}

run();
