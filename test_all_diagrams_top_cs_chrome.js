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
    server.listen(8249, () => resolve(server));
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

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8249/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Test 1: Check 1. INT(GenSide) at 2mH
  await page.evaluate(() => {
    if (window.switchMainTab) window.switchMainTab('steelAccessories');
    if (window.SteelAccessories) {
      window.SteelAccessories.switchDiagramTab('int_side');
      window.SteelAccessories.switchHeightSheet('2');
    }
  });
  await new Promise(r => setTimeout(r, 800));

  const intResult = await page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll('.sa-pos-marker text')).map(t => t.textContent.trim());
    return { markers };
  });

  console.log('=== 1. INT(GenSide) 2mH MARKERS ===', intResult.markers);
  if (!intResult.markers.some(m => m.includes('CS3'))) {
    throw new Error('CS3 not found on 1. INT(GenSide) 2mH!');
  }

  // Test 2: Check 5. EXT(GenSide) at 2mH
  await page.evaluate(() => {
    if (window.SteelAccessories) {
      window.SteelAccessories.switchDiagramTab('ext_side');
      window.SteelAccessories.switchHeightSheet('2');
    }
  });
  await new Promise(r => setTimeout(r, 800));

  const extResult = await page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll('.sa-pos-marker text')).map(t => t.textContent.trim());
    return { markers };
  });

  console.log('=== 5. EXT(GenSide) 2mH MARKERS ===', extResult.markers);
  if (!extResult.markers.some(m => m.includes('CS3'))) {
    throw new Error('CS3 not found on 5. EXT(GenSide) 2mH!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_all_diagrams_top_cs_verified.png') });
  console.log('Saved screenshot test_all_diagrams_top_cs_verified.png');

  await browser.close();
  server.close();
  console.log('ALL DIAGRAMS TOP CS VERIFIED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
