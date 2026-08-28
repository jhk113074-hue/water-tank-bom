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
    server.listen(8242, () => resolve(server));
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
  await page.goto('http://localhost:8242/#tab-pallet-packing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  const diag = await page.evaluate(() => {
    const currentPallet = {
      id: 1,
      palletType: "1x2m",
      items: [
        { partNo: "ST20SX", qty: 6 },
        { partNo: "ST20SL", qty: 1 },
        { partNo: "ST20SR", qty: 1 },
        { partNo: "ST20HU85", qty: 2 }
      ]
    };

    const Ht = 80, Fh = 70, Ph = 150, limit = 2000;
    const partNo = "BF20BX";

    const dims = window.PalletPacking.getPanelDimensions(partNo);
    const pType = window.PalletPacking.getActualPalletTypeForPallet(currentPallet);
    const cap = (pType === "1x2m" && Math.max(dims.w, dims.l) <= 1000) ? 2 : 1;

    const fit = window.PalletPacking.getFitQty(currentPallet, partNo, 1, Ht, Fh, Ph, limit);
    const valid = window.PalletPacking.isPalletPhysicallyValid ? window.PalletPacking.isPalletPhysicallyValid({
      palletType: "1x2m",
      items: [...currentPallet.items, { partNo, qty: 1 }]
    }) : null;

    const tiers = window.PalletPacking.expandPalletItemsToTiers({
      palletType: "1x2m",
      items: [...currentPallet.items, { partNo, qty: 1 }]
    });

    return {
      dims,
      pType,
      cap,
      fit,
      valid,
      tiers
    };
  });

  console.log('DIAGNOSTIC RESULT:', JSON.stringify(diag, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
