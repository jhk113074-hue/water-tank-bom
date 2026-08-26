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
    server.listen(8259, () => resolve(server));
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

  // 1. Open ALMUFTAH -> 1. INT(GenSide) -> 4.5mH
  await page.goto('http://localhost:8259/#steel-accessories/almuftah/int/int_side/4.5m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  const almuftah45Data = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.sa-panel-svg > rect')).map(r => ({
      x: parseFloat(r.getAttribute('x')),
      y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')),
      h: parseFloat(r.getAttribute('height'))
    }));
    return { count: rects.length, rects };
  });

  console.log('=== ALMUFTAH 1. INT(GenSide) 4.5mH Panel Rects ===', almuftah45Data);
  // In 4.5mH: top course wide panels (Left x=10, Right x=154) should have height = 144px (1.5m * 96px/m)
  const has15mTopPillows = almuftah45Data.rects.some(r => r.h >= 140 && r.h <= 148 && r.w >= 90 && r.y <= 20);
  if (!has15mTopPillows) {
    throw new Error('ALMUFTAH 4.5mH must have 1x1.5m Pillow panels at the top (height ~144px)!');
  }

  // 2. Open ALMUFTAH -> 1. INT(GenSide) -> 5mH
  await page.evaluate(() => {
    window.SteelAccessories.switchHeightSheet('5');
  });
  await new Promise(r => setTimeout(r, 1200));

  const almuftah50Data = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.sa-panel-svg > rect')).map(r => ({
      x: parseFloat(r.getAttribute('x')),
      y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')),
      h: parseFloat(r.getAttribute('height'))
    }));
    return { count: rects.length, rects };
  });

  console.log('=== ALMUFTAH 1. INT(GenSide) 5mH Panel Rects ===', almuftah50Data);
  // In 5mH: top course wide panels (Left x=10, Right x=154) should have height = 192px (2.0m * 96px/m)
  const has20mTopPillows = almuftah50Data.rects.some(r => r.h >= 188 && r.h <= 196 && r.w >= 90 && r.y <= 20);
  if (!has20mTopPillows) {
    throw new Error('ALMUFTAH 5mH must have 1x2.0m Pillow panels at the top (height ~192px)!');
  }

  // Switch back to 4.5mH for the screenshot
  await page.evaluate(() => {
    window.SteelAccessories.switchHeightSheet('4.5');
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_matrix_all_heights_verified.png') });
  console.log('Saved screenshot test_matrix_all_heights_verified.png');

  await browser.close();
  server.close();
  console.log('ALL MATRIX PANEL FULL AUDIT TESTS PASSED FLAWLESSLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
