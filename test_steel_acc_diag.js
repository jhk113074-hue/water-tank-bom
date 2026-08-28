const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const relPath = req.url.split('?')[0].split('#')[0].replace(/^\/+/, '');
      let filePath = path.join(__dirname, relPath || 'index.html');
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
    server.listen(8180, () => resolve(server));
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

  await page.goto('http://localhost:8180/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const diag = await page.evaluate(() => {
    const sa = window.SteelAccessories;
    return {
      hasSa: !!sa,
      container: !!document.getElementById('steelAccessoriesContainer'),
      tabElActive: document.getElementById('tab-steel-accessories').classList.contains('active')
    };
  });
  console.log('Diagnostic 1:', diag);

  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-steel-accessories"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  const diag2 = await page.evaluate(() => {
    return {
      containerHtmlLen: document.getElementById('steelAccessoriesContainer').innerHTML.length,
      tabElActive: document.getElementById('tab-steel-accessories').classList.contains('active')
    };
  });
  console.log('Diagnostic 2:', diag2);

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_diag.png') });

  await browser.close();
  server.close();
}

run();
