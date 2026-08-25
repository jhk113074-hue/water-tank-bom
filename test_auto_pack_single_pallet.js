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
    server.listen(8240, () => resolve(server));
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

  await page.goto('http://localhost:8240/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Set W=2, L1=1, L2=1, H=2
  await page.evaluate(() => {
    document.getElementById('tankWidth').value = '2';
    document.getElementById('tankLength1').value = '1';
    document.getElementById('tankLength2').value = '1';
    document.getElementById('tankLength3').value = '0';
    document.getElementById('tankLength4').value = '0';
    document.getElementById('numPartition').value = '1';
    document.getElementById('tankHeight').value = '2';
    document.getElementById('partitionPanelOnly').value = 'DEFAULT';
    if (typeof window.recalcDimensions === 'function') window.recalcDimensions();
  });

  await page.click('#btnApplyConfig');
  await new Promise(r => setTimeout(r, 1200));

  // Switch to Pallet Packing Tab
  console.log('Switching to Pallet Packing tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-pallet-packing"]');
    if (btn) btn.click();
    else if (typeof window.switchTab === 'function') window.switchTab('tab-pallet-packing');
  });
  await new Promise(r => setTimeout(r, 1000));

  // Run Auto Packing
  console.log('Clicking Run Auto Packing...');
  await page.click('#btnAutoPack');
  await new Promise(r => setTimeout(r, 1500));

  const palletInfo = await page.evaluate(() => {
    const pallets = window.PalletPacking.getPallets();
    const Ht = 80, Fh = 70, Ph = 150;
    return pallets.map(p => ({
      id: p.id,
      palletType: p.palletType,
      items: p.items,
      height: window.PalletPacking.calculatePalletHeight(p.items, Ht, Fh, Ph, p.palletType)
    }));
  });

  console.log('Pack Results:', JSON.stringify(palletInfo, null, 2));

  if (palletInfo.length !== 1) {
    throw new Error(`Expected 1 pallet for 2x(1+1)x2m tank, but got ${palletInfo.length} pallets!`);
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_auto_pack_single_pallet_verified.png') });
  console.log('Saved test_auto_pack_single_pallet_verified.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: 1x2m Single Pallet auto-pack consolidation verified cleanly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
