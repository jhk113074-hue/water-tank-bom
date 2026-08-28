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
    server.listen(8155, () => resolve(server));
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
    console.log('Dialog type:', dialog.type(), 'message:', dialog.message());
    if (dialog.type() === 'prompt') {
      await dialog.accept('1. INT(GenSide) (복사본)');
    } else {
      await dialog.accept();
    }
  });

  console.log('Navigating to http://localhost:8155/#steel-accessories/ysacc/1/1.5m ...');
  await page.goto('http://localhost:8155/#steel-accessories/ysacc/1/1.5m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-panel-svg', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  console.log('Clicking [📋 탭 복사하기] ...');
  const copyBtn = await page.$('button[data-action="copy-diagram"]');
  if (copyBtn) {
    await copyBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  }

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_copied_tab_1_5m_chrome.png') });
  console.log('Captured test_steel_copied_tab_1_5m_chrome.png');

  console.log('Switching to 2mH in copied tab ...');
  const chip2m = await page.$('button.sa-hchip[data-h="2"]');
  if (chip2m) {
    await chip2m.click();
    await new Promise(r => setTimeout(r, 1500));
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_copied_tab_2m_chrome.png') });
  console.log('Captured test_steel_copied_tab_2m_chrome.png');

  await browser.close();
  server.close();
}

run();
