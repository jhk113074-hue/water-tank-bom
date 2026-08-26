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
    server.listen(8257, () => resolve(server));
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

  // 1. Open ALMUFTAH -> 1. INT(GenSide) -> 2mH
  await page.goto('http://localhost:8257/#steel-accessories/almuftah/int/int_side/2m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));

  const intSideData1 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-cmp tbody tr[data-member-id]')).map(tr => {
      const part = tr.querySelector('.sa-cmp-part') ? tr.querySelector('.sa-cmp-part').textContent.trim() : '';
      const pos = tr.querySelector('.sa-pos-chip') ? tr.querySelector('.sa-pos-chip').textContent.trim() : '';
      return { part, pos };
    });
    return { diagram: window.SteelAccessories.getCurrentDiagramId(), height: window.SteelAccessories.getCurrentHeight(), count: rows.length, rows };
  });

  console.log('=== 1. INT(GenSide) 2mH ===', intSideData1);
  if (intSideData1.count === 0 || intSideData1.diagram !== 'int_side') {
    throw new Error('INT(GenSide) 2mH should have members, but was empty or wrong diagram!');
  }

  // 2. Switch to ALMUFTAH -> 5. EXT(GenSide) -> 2mH
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('ext_side');
    window.SteelAccessories.switchHeightSheet('2');
  });
  await new Promise(r => setTimeout(r, 1200));

  const extSideData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-cmp tbody tr[data-member-id]')).map(tr => {
      const part = tr.querySelector('.sa-cmp-part') ? tr.querySelector('.sa-cmp-part').textContent.trim() : '';
      const pos = tr.querySelector('.sa-pos-chip') ? tr.querySelector('.sa-pos-chip').textContent.trim() : '';
      return { part, pos };
    });
    return { diagram: window.SteelAccessories.getCurrentDiagramId(), height: window.SteelAccessories.getCurrentHeight(), count: rows.length, rows };
  });

  console.log('=== 2. EXT(GenSide) 2mH ===', extSideData);
  if (extSideData.count === 0 || extSideData.diagram !== 'ext_side') {
    throw new Error('EXT(GenSide) 2mH should have members, but was empty or wrong diagram!');
  }

  // 3. Edit scale on EXT(GenSide)
  await page.evaluate(() => {
    const firstInp = document.querySelector('.sa-tbl-scale-input');
    if (firstInp) {
      firstInp.value = 'perim * 2';
      firstInp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 600));

  // 4. Switch back to 1. INT(GenSide) 2mH and verify INT is intact
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('int_side');
    window.SteelAccessories.switchHeightSheet('2');
  });
  await new Promise(r => setTimeout(r, 1200));

  const intSideData2 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-cmp tbody tr[data-member-id]')).map(tr => {
      const part = tr.querySelector('.sa-cmp-part') ? tr.querySelector('.sa-cmp-part').textContent.trim() : '';
      const pos = tr.querySelector('.sa-pos-chip') ? tr.querySelector('.sa-pos-chip').textContent.trim() : '';
      return { part, pos };
    });
    return { diagram: window.SteelAccessories.getCurrentDiagramId(), height: window.SteelAccessories.getCurrentHeight(), count: rows.length, rows };
  });

  console.log('=== 3. INT(GenSide) 2mH (after EXT edit) ===', intSideData2);
  if (intSideData2.count !== intSideData1.count || intSideData2.diagram !== 'int_side') {
    throw new Error('INT(GenSide) was corrupted by EXT edit!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_db_isolation_verified.png') });
  console.log('Saved screenshot test_db_isolation_verified.png');

  await browser.close();
  server.close();
  console.log('ALL DB ISOLATION TESTS PASSED PERFECTLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
