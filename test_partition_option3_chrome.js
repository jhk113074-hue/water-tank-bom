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
    server.listen(8236, () => resolve(server));
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
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8236/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Set W=2, L1=1, L2=1, H=1.5
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
  });

  console.log('Generating BOM with Option 3 (DEFAULT preset)...');
  await page.click('#btnApplyConfig');
  await new Promise(r => setTimeout(r, 1200));

  const opt3Items = await page.evaluate(() => {
    return (window.bomItems || []).filter(i => (i.category || '').toLowerCase().includes('panel') || (i.catalogKey && i.catalogKey.includes('partition'))).map(i => ({
      catalogKey: i.catalogKey,
      partNo: i.partNo,
      partName: i.partName,
      qty: i.qty
    }));
  });
  console.log('BOM Option 3 Partition Items:', JSON.stringify(opt3Items, null, 2));

  // Verify that partition items are SL15 / partition1x1 and NOT PF15MX / PH15HU15
  const hasOpt3Part = opt3Items.some(i => i.partNo.includes('SL15') || (i.catalogKey && i.catalogKey.startsWith('partition1x1.')));
  const hasOpt4Part = opt3Items.some(i => i.partNo.includes('PF15MX') || i.partNo.includes('PH15HU15'));

  if (!hasOpt3Part) {
    throw new Error('Option 3 should produce SL15 partition panel!');
  }
  if (hasOpt4Part) {
    throw new Error('Option 3 should NOT produce PF15MX / PH15HU15!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_partition_opt3_applied.png') });
  console.log('Saved test_partition_opt3_applied.png');

  // Test Option 4 switch
  console.log('Switching to Option 4 in dropdown...');
  await page.evaluate(() => {
    document.getElementById('partitionPanelOnly').value = 'Option 4';
  });
  await page.click('#btnApplyConfig');
  await new Promise(r => setTimeout(r, 1200));

  const opt4Items = await page.evaluate(() => {
    return (window.bomItems || []).filter(i => (i.category || '').toLowerCase().includes('panel') || (i.catalogKey && i.catalogKey.includes('partition'))).map(i => ({
      catalogKey: i.catalogKey,
      partNo: i.partNo,
      partName: i.partName,
      qty: i.qty
    }));
  });
  console.log('BOM Option 4 Partition Items:', JSON.stringify(opt4Items, null, 2));

  const hasOpt4Part2 = opt4Items.some(i => i.partNo.includes('PF15MX') || i.partNo.includes('PH15HU15'));
  if (!hasOpt4Part2) {
    throw new Error('Option 4 should produce PF15MX / PH15HU15!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_partition_opt4_applied.png') });
  console.log('Saved test_partition_opt4_applied.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: Partition Option 3 and Option 4 work accurately!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
