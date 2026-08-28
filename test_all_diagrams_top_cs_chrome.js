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
    server.listen(8250, () => resolve(server));
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

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8250/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Click on the sidebar button with id or text 'Steel Accessories'
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, .tab-btn'));
    const target = btns.find(b => b.textContent.includes('STEEL ACCESSORIES') || b.getAttribute('data-tab') === 'tab-steel-accessories');
    if (target) target.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const diagInfo = await page.evaluate(() => {
    const host = document.getElementById('steelAccessoriesContainer');
    const dTabs = Array.from(document.querySelectorAll('.sa-dtab')).map(t => t.textContent.trim());
    const hTabs = Array.from(document.querySelectorAll('.sa-htab')).map(t => t.textContent.trim());
    const markers = Array.from(document.querySelectorAll('.sa-pos-marker text')).map(t => t.textContent.trim());
    const rightPosRows = Array.from(document.querySelectorAll('.sa-pos-badge')).map(b => b.textContent.trim());

    return {
      hostLen: host ? host.innerHTML.length : 0,
      dTabs,
      hTabs,
      markers,
      rightPosRows
    };
  });

  console.log('=== DEBUG DIAG INFO ===', JSON.stringify(diagInfo, null, 2));

  await page.screenshot({ path: path.join(artifactDir, 'test_debug_steel_accessories.png') });
  console.log('Saved debug screenshot');

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
