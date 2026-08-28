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
    server.listen(8156, () => resolve(server));
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

  console.log('Navigating to http://localhost:8156/#steel-accessories/ysacc/1/1.5m ...');
  await page.goto('http://localhost:8156/#steel-accessories/ysacc/1/1.5m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-panel-svg', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_tabs_before_drag_chrome.png') });
  console.log('Captured test_steel_tabs_before_drag_chrome.png');

  console.log('Simulating HTML5 drag and drop of tab 2 to the first position ...');
  const result = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.sa-dtab-wrap');
    if (wraps.length < 2) return { success: false, msg: 'not enough tabs' };

    const srcWrap = wraps[1]; // second tab (e.g. 2. INT(Side_1m_O))
    const targetWrap = wraps[0]; // first tab (e.g. 1. INT(GenSide))

    const dataTransfer = new DataTransfer();
    srcWrap.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    targetWrap.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: targetWrap.getBoundingClientRect().left, dataTransfer }));
    targetWrap.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: targetWrap.getBoundingClientRect().left, dataTransfer }));
    srcWrap.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));

    const raw = localStorage.getItem('water_tank_steel_accessories_layout_v1');
    const ov = raw ? JSON.parse(raw) : {};
    return { success: true, diagramOrder: ov.diagramOrder };
  });

  console.log('Drag result:', JSON.stringify(result, null, 2));
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_tabs_after_drag_chrome.png') });
  console.log('Captured test_steel_tabs_after_drag_chrome.png');

  await browser.close();
  server.close();
}

run();
