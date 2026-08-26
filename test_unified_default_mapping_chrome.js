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
    server.listen(8265, () => resolve(server));
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

  await page.goto('http://localhost:8265/#steel-accessories/almuftah/int/int_side/4.5m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-option-mapping-bar table tbody tr');

  // 1. Verify Unified Default Table UI structure
  const tableData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-option-mapping-bar table tbody tr'));
    const info = rows.map(r => {
      const label = r.querySelector('td:first-child')?.innerText.trim();
      const selects = Array.from(r.querySelectorAll('select'));
      const sampleOptions = selects.length > 0 ? Array.from(selects[0].options).map(o => ({ val: o.value, text: o.text })) : [];
      return { label, selectCount: selects.length, sampleOptions };
    });
    return info;
  });

  console.log('=== Unified Default Mapping Table UI Structure ===', JSON.stringify(tableData, null, 2));

  if (tableData.length !== 2) {
    throw new Error(`Expected 2 rows in Default Mapping table, found ${tableData.length}`);
  }
  if (!tableData[0].label.includes('측판') || tableData[0].sampleOptions.length !== 4) {
    throw new Error('Row 1 must be Side Panel with exactly 4 options (INT/EXT x Gen/1M)!');
  }
  if (!tableData[1].label.includes('칸막이') || tableData[1].sampleOptions.length !== 4) {
    throw new Error('Row 2 must be Partition with exactly 4 options (INT/EXT x Gen/1M)!');
  }

  // 2. Test Quick buttons
  await page.evaluate(() => {
    // Set all side to 외부GenSide (ext_side)
    window.SteelAccessories.setAllHeightOption('side', 'ext_side');
    // Set all partition to 내부Part_1M (int_partition_1m)
    window.SteelAccessories.setAllHeightOption('part', 'int_partition_1m');
  });
  await new Promise(r => setTimeout(r, 800));

  const verifyQuickOpts = await page.evaluate(() => {
    const opts = window.SteelAccessories.getPartyOptions('ALMUFTAH');
    return {
      sideByHeight: opts.sideByHeight,
      partByHeight: opts.partByHeight
    };
  });

  console.log('=== Verified Quick Apply Options ===', verifyQuickOpts);
  if (verifyQuickOpts.sideByHeight['4.5'] !== 'ext_side' || verifyQuickOpts.partByHeight['4.5'] !== 'int_partition_1m') {
    throw new Error('Quick Apply options mismatch!');
  }

  // 3. Test Individual Dropdown Change for 4.5mH: Side to ext_side_1m
  await page.evaluate(() => {
    window.SteelAccessories.updateHeightOption('side', '4.5', 'ext_side_1m');
  });
  await new Promise(r => setTimeout(r, 800));

  const verifyIndivOpts = await page.evaluate(() => {
    const opts = window.SteelAccessories.getPartyOptions('ALMUFTAH');
    return opts.sideByHeight['4.5'];
  });

  console.log('=== Verified Individual Dropdown 4.5mH Side ===', verifyIndivOpts);
  if (verifyIndivOpts !== 'ext_side_1m') {
    throw new Error('Individual dropdown change for 4.5mH failed!');
  }

  // 4. Capture screenshot of the unified default bar
  await page.screenshot({ path: path.join(artifactDir, 'test_unified_default_mapping_verified.png') });
  console.log('Saved screenshot test_unified_default_mapping_verified.png');

  await browser.close();
  server.close();
  console.log('ALL UNIFIED DEFAULT REINFORCEMENT MAPPING TESTS PASSED FLAWLESSLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
