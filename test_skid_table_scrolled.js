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
    server.listen(8132, () => resolve(server));
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

  console.log('Navigating to http://localhost:8132/#steel-skid-logic ...');
  await page.goto('http://localhost:8132/#steel-skid-logic', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking STEEL SKID LOGIC sidebar link...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.sidebar-link, .nav-item, a, button')).find(el => el.textContent.includes('STEEL SKID LOGIC'));
    if (btn) btn.click();
    else if (window.location) window.location.hash = '#steel-skid-logic';
  });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Scrolling down to the table...');
  await page.evaluate(() => {
    const tbl = document.querySelector('table');
    if (tbl) tbl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_skid_table_scrolled.png') });
  console.log('Captured test_steel_skid_table_scrolled.png');

  await browser.close();
  server.close();
}

run();
