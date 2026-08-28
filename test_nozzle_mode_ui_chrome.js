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
    server.listen(8158, () => resolve(server));
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

  page.on('dialog', async dialog => {
    console.log('Dialog:', dialog.message());
    await dialog.accept();
  });

  console.log('Navigating to http://localhost:8158/#panel-config ...');
  await page.goto('http://localhost:8158/#panel-config', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Selecting HAYOUNG Spec ...');
  await page.evaluate(() => {
    const custBtns = Array.from(document.querySelectorAll('.btnMatrixCustTab'));
    const hayoungBtn = custBtns.find(b => b.textContent.includes('HAYOUNG'));
    if (hayoungBtn) hayoungBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Setting Nozzle Panel Mode to 0.5m x 1m (2EA) ...');
  await page.evaluate(() => {
    window.updateCustNozzlePanelMode('0.5m_x2');
  });
  await new Promise(r => setTimeout(r, 1500));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_nozzle_mode_panel_config_chrome.png') });
  console.log('Captured test_nozzle_mode_panel_config_chrome.png');

  console.log('Navigating to #bom ...');
  await page.goto('http://localhost:8158/#bom', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_nozzle_mode_bom_output_chrome.png') });
  console.log('Captured test_nozzle_mode_bom_output_chrome.png');

  await browser.close();
  server.close();
}

run();
