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
    server.listen(8248, () => resolve(server));
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

  await page.goto('http://localhost:8248/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Switch to Steel Accessories tab -> 5. EXT(GenSide) -> 2mH
  await page.evaluate(() => {
    if (window.switchMainTab) window.switchMainTab('steelAccessories');
    if (window.SteelAccessories) {
      window.SteelAccessories.switchDiagramTab('ext_side');
      window.SteelAccessories.switchHeightSheet('2');
    }
  });

  await new Promise(r => setTimeout(r, 1200));

  const result = await page.evaluate(() => {
    const layout = window.SteelAccessories ? window.SteelAccessories.getLayout() : null;
    const extSide = layout ? layout.diagrams.find(d => d.id === 'ext_side') : null;
    const extPart = layout ? layout.diagrams.find(d => d.id === 'ext_partition') : null;

    const extSideTopCs = {};
    if (extSide && extSide.heightSpecs) {
      for (const [h, spec] of Object.entries(extSide.heightSpecs)) {
        const H = parseFloat(h);
        const topKey = Object.keys(spec.positions || {}).find(k => k.startsWith('CS') && Math.abs(spec.positions[k].y - H) < 0.01);
        extSideTopCs[h] = topKey ? { key: topKey, y: spec.positions[topKey].y } : null;
      }
    }

    const extPartTopCs = {};
    if (extPart && extPart.heightSpecs) {
      for (const [h, spec] of Object.entries(extPart.heightSpecs)) {
        const H = parseFloat(h);
        const topKey = Object.keys(spec.positions || {}).find(k => k.startsWith('CS') && Math.abs(spec.positions[k].y - H) < 0.01);
        extPartTopCs[h] = topKey ? { key: topKey, y: spec.positions[topKey].y } : null;
      }
    }

    const markersOnScreen = Array.from(document.querySelectorAll('.sa-pos-marker text')).map(t => t.textContent.trim());

    return { extSideTopCs, extPartTopCs, markersOnScreen };
  });

  console.log('=== EXT TOP CS VERIFICATION RESULTS ===');
  console.log(JSON.stringify(result, null, 2));

  // Verify that all heights have a top CS
  const heights = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
  for (const h of heights) {
    if (!result.extSideTopCs[h]) throw new Error(`Missing top CS for ext_side ${h}mH!`);
    if (!result.extPartTopCs[h]) throw new Error(`Missing top CS for ext_partition ${h}mH!`);
  }

  if (!result.markersOnScreen.some(m => m.includes('CS3'))) {
    throw new Error('Expected CS3 marker to be visible on 2mH screen, but got: ' + result.markersOnScreen.join(', '));
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_ext_top_cs_verified.png') });
  console.log('Saved screenshot test_ext_top_cs_verified.png');

  await browser.close();
  server.close();
  console.log('ALL TOP CS TESTS PASSED FLAWLESSLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
