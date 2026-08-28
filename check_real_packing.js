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
    server.listen(8239, () => resolve(server));
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

  await page.goto('http://localhost:8239/', { waitUntil: 'domcontentloaded' });
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
  await page.evaluate(() => {
    if (typeof window.switchTab === 'function') window.switchTab('tab-pallet-packing');
  });
  await new Promise(r => setTimeout(r, 1000));

  const result = await page.evaluate(() => {
    window.PalletPacking.syncPendingFromBOM();
    window.PalletPacking.runAutoPack();

    const currentPallets = window.PalletPacking.getPallets();
    return currentPallets.map(p => ({
      id: p.id,
      palletType: p.palletType,
      items: p.items,
      height: window.PalletPacking.calculatePalletHeight(p.items, 80, 70, 150)
    }));
  });

  console.log('=== REAL PALLET PACKING RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
