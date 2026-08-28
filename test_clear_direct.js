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
    server.listen(8126, () => resolve(server));
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

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:8126/#bom-output ...');
  await page.goto('http://localhost:8126/#bom-output', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  console.log('Clicking BOM OUTPUT tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="tab-bom-output"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const itemsBefore = await page.evaluate(() => {
    return document.querySelectorAll('#tbodyBOM tr').length;
  });
  console.log('Items in BOM table before Clear All:', itemsBefore);

  console.log('Clicking Clear All button...');
  await page.evaluate(() => {
    window.confirm = () => true;
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Clear All'));
    if (btn) btn.click();
    else if (window.resetBOMItemsList) window.resetBOMItemsList();
  });
  await new Promise(r => setTimeout(r, 1000));

  const itemsAfter = await page.evaluate(() => {
    return document.querySelectorAll('#tbodyBOM tr').length;
  });
  console.log('Items in BOM table after Clear All:', itemsAfter);

  const tbodyHtml = await page.evaluate(() => {
    return document.getElementById('tbodyBOM')?.innerHTML;
  });
  console.log('tbodyBOM innerHTML:', tbodyHtml);

  await browser.close();
  server.close();
}

run();
