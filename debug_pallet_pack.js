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
    server.listen(8238, () => resolve(server));
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

  await page.goto('http://localhost:8238/#tab-pallet-packing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

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
  await new Promise(r => setTimeout(r, 800));

  const debugInfo = await page.evaluate(() => {
    window.PalletPacking.syncPendingFromBOM();
    const pendingList = window.PalletPacking.getPendingList ? window.PalletPacking.getPendingList() : [];

    const Ht = 80, Fh = 70, Ph = 150, limit = 2000;
    const simA = window.PalletPacking.executeScenarioEngine ? window.PalletPacking.executeScenarioEngine('A', JSON.parse(JSON.stringify(pendingList)), Ht, Fh, Ph, limit) : null;
    const simB = window.PalletPacking.executeScenarioEngine ? window.PalletPacking.executeScenarioEngine('B', JSON.parse(JSON.stringify(pendingList)), Ht, Fh, Ph, limit) : null;
    const simC = window.PalletPacking.executeScenarioEngine ? window.PalletPacking.executeScenarioEngine('C', JSON.parse(JSON.stringify(pendingList)), Ht, Fh, Ph, limit) : null;

    return {
      pendingList,
      simA: simA ? { count: simA.pallets.length, pallets: simA.pallets } : null,
      simC: simC ? { count: simC.pallets.length, pallets: simC.pallets } : null
    };
  });

  console.log('=== DEBUG PALLET PACKING ===');
  console.log(JSON.stringify(debugInfo, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
