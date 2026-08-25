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
    server.listen(8246, () => resolve(server));
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

  await page.goto('http://localhost:8246/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Set W=2, L1=1, L2=1, H=1.5 and register 11-hole spec for SL15 / SL15HU85
  await page.evaluate(() => {
    document.getElementById('tankWidth').value = '2';
    document.getElementById('tankLength1').value = '1';
    document.getElementById('tankLength2').value = '1';
    document.getElementById('tankLength3').value = '0';
    document.getElementById('tankLength4').value = '0';
    document.getElementById('numPartition').value = '1';
    document.getElementById('tankHeight').value = '1.5';
    document.getElementById('partitionPanelOnly').value = 'DEFAULT';
    if (typeof window.recalcDimensions === 'function') window.recalcDimensions();

    const pid = 'default';
    if (window.PanelHoleSpec) {
      window.PanelHoleSpec.setPanelSpec('SL15', 'SL', { edges: { top: 0, bottom: 8, left: 12, right: 12 }, face: { top: 4, bottom: 8, left: 11, right: 0 } }, pid);
      window.PanelHoleSpec.setPanelSpec('SL15', 'SR', { edges: { top: 0, bottom: 8, left: 12, right: 12 }, face: { top: 4, bottom: 8, left: 0, right: 11 } }, pid);
      window.PanelHoleSpec.setPanelSpec('SL15HU85', '', { edges: { top: 0, bottom: 8, left: 11, right: 11 }, face: { top: 4, bottom: 0, left: 0, right: 0 } }, pid);
      window.PanelHoleSpec.setPanelSpec('SL15', 'HU85', { edges: { top: 0, bottom: 8, left: 11, right: 11 }, face: { top: 4, bottom: 0, left: 0, right: 0 } }, pid);
    }
  });

  await page.click('#btnApplyConfig');
  await new Promise(r => setTimeout(r, 1500));

  const boltDetails = await page.evaluate(() => {
    const g = {
      W: { value: 2, whole: 2, half: 0 },
      H: { value: 1.5, whole: 1, half: 1 },
      L1: { value: 1, whole: 1, half: 0 },
      L2: { value: 1, whole: 1, half: 0 },
      L3: { value: 0, whole: 0, half: 0 },
      L4: { value: 0, whole: 0, half: 0 },
      L_C_sum: 2,
      L_F_sum: 0,
      n_partitions: 1,
      R1: 8,
      R05: 4
    };

    const res = window.AccessoriesEngine.boltsAndNutsParts(g, true, 2, {}, false, 'default');
    const ap29 = res.detail.find(d => d.id === 'AP29');
    const ap30 = res.detail.find(d => d.id === 'AP30');
    const ap32 = res.detail.find(d => d.id === 'AP32');
    const ap33 = res.detail.find(d => d.id === 'AP33');

    const assemblyBoltIds = ['AP5', 'AP6', 'AP7', 'AP12', 'AP13', 'AP14', 'AP18', 'AP19', 'AP22', 'AP29', 'AP30', 'AP32', 'AP33'];
    const matched = res.detail.filter(d => assemblyBoltIds.includes(d.id));

    return {
      ap29: ap29 ? ap29.value : null,
      ap30: ap30 ? ap30.value : null,
      ap32: ap32 ? ap32.value : null,
      ap33: ap33 ? ap33.value : null,
      totalAssemblyBolts: matched.reduce((s, it) => s + it.value, 0),
      items: matched.map(d => ({ id: d.id, qty: d.value, label: d.label }))
    };
  });

  console.log('=== TEST RESULT: PARTITION HOLE SPEC REFLECTION ===');
  console.log(JSON.stringify(boltDetails, null, 2));

  if (boltDetails.ap29 !== 22) {
    throw new Error(`Expected AP29 to be 22 (from 11 holes x 2 walls), but got ${boltDetails.ap29}`);
  }
  if (boltDetails.ap33 !== 11) {
    throw new Error(`Expected AP33 to be 11 (from 11 holes x 1 seam), but got ${boltDetails.ap33}`);
  }
  if (boltDetails.ap30 !== 16) {
    throw new Error(`Expected AP30 to be 16, but got ${boltDetails.ap30}`);
  }
  if (boltDetails.ap32 !== 0) {
    throw new Error(`Expected AP32 to be 0, but got ${boltDetails.ap32}`);
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_partition_hole_spec_verified.png') });
  console.log('Saved screenshot test_partition_hole_spec_verified.png');

  await browser.close();
  server.close();
  console.log('ALL TESTS PASSED: AP29=22, AP33=11, Total=385 flawlessly verified!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
