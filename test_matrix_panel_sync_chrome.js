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
    server.listen(8258, () => resolve(server));
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

  // 1. Check YSACC (Split 2m panel) on 1. INT(GenSide) 2mH
  await page.goto('http://localhost:8258/#steel-accessories/ysacc/int/int_side/2m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  const ysaccPanels = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.sa-panel-svg > rect')).map(r => ({
      x: parseFloat(r.getAttribute('x')),
      y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')),
      h: parseFloat(r.getAttribute('height'))
    }));
    return { count: rects.length, rects };
  });

  console.log('=== YSACC 1. INT(GenSide) 2mH Panel Rects ===', ysaccPanels);
  if (ysaccPanels.count < 6) {
    throw new Error('YSACC 2mH should have split panels (6+ outer rects), got: ' + ysaccPanels.count);
  }

  // 2. Switch to HAYOUNG (Monolithic 2m panel) on 1. INT(GenSide) 2mH
  await page.evaluate(() => {
    if (window.PartNaming) window.PartNaming.setActiveParty('HAYOUNG');
    if (window.SteelAccessories) {
      window.SteelAccessories.switchDiagramTab('int_side');
      window.SteelAccessories.switchHeightSheet('2');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const hayoungPanels = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.sa-panel-svg > rect')).map(r => ({
      x: parseFloat(r.getAttribute('x')),
      y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')),
      h: parseFloat(r.getAttribute('height'))
    }));
    return { count: rects.length, rects };
  });

  console.log('=== HAYOUNG 1. INT(GenSide) 2mH Panel Rects (Monolithic) ===', hayoungPanels);
  // Monolithic 2m panel on Left & Right has height = 80px (40px/m * 2m)
  const hasMonolithic2m = hayoungPanels.rects.some(r => r.h >= 75 && r.w >= 38);
  if (!hasMonolithic2m) {
    throw new Error('HAYOUNG 2mH should have 1x2m monolithic panels (height 80px), but not found!');
  }

  // 3. Test Option 2 (2. INT(Side_1m_O))
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('int_side_1x1');
    window.SteelAccessories.switchHeightSheet('2.5');
  });
  await new Promise(r => setTimeout(r, 1200));

  const opt2Panels = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.sa-panel-svg > rect')).map(r => ({
      x: parseFloat(r.getAttribute('x')),
      y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')),
      h: parseFloat(r.getAttribute('height'))
    }));
    return { count: rects.length, rects };
  });

  console.log('=== Option 2 (2. INT(Side_1m_O)) 2.5mH Panel Rects ===', opt2Panels);
  if (opt2Panels.count < 6) {
    throw new Error('Option 2 should render slice tiers!');
  }

  // 4. Test Option 4 (4. INT(PART_1m_O))
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('int_partition_2');
    window.SteelAccessories.switchHeightSheet('2.5');
  });
  await new Promise(r => setTimeout(r, 1200));

  const opt4Panels = await page.evaluate(() => {
    const isPinkStroke = Array.from(document.querySelectorAll('.sa-panel-svg > rect')).some(r => r.getAttribute('stroke') === '#db2777');
    return { isPinkStroke };
  });

  console.log('=== Option 4 (4. INT(PART_1m_O)) 2.5mH isPinkStroke ===', opt4Panels);
  if (!opt4Panels.isPinkStroke) {
    throw new Error('Option 4 Partition should have pink partition styling!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_matrix_panel_sync_verified.png') });
  console.log('Saved screenshot test_matrix_panel_sync_verified.png');

  await browser.close();
  server.close();
  console.log('ALL MATRIX PANEL SYNC TESTS PASSED FLAWLESSLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
