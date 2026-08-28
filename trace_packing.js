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
    server.listen(8241, () => resolve(server));
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

  await page.goto('http://localhost:8241/#tab-pallet-packing', { waitUntil: 'domcontentloaded' });
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

  await page.evaluate(() => {
    if (typeof window.switchTab === 'function') window.switchTab('tab-pallet-packing');
  });
  await new Promise(r => setTimeout(r, 1000));

  const trace = await page.evaluate(() => {
    window.PalletPacking.syncPendingFromBOM();
    const pList = window.PalletPacking.getPendingList ? window.PalletPacking.getPendingList() : [];

    const Ht = 80, Fh = 70, Ph = 150, limit = 2000;
    const sorted = pList.slice().sort((a, b) => {
      const rankA = window.PalletPacking.getPanelStackingRank ? window.PalletPacking.getPanelStackingRank(a.partNo) : 0;
      const rankB = window.PalletPacking.getPanelStackingRank ? window.PalletPacking.getPanelStackingRank(b.partNo) : 0;
      if (rankA !== rankB) return rankA - rankB;

      const dimsA = window.PalletPacking.getPanelDimensions(a.partNo);
      const dimsB = window.PalletPacking.getPanelDimensions(b.partNo);
      const maxA = Math.max(dimsA.w || 1000, dimsA.l || 1000);
      const maxB = Math.max(dimsB.w || 1000, dimsB.l || 1000);
      return maxB - maxA;
    });

    const logs = [];
    let currentPallet = { id: 1, palletType: "1x2m", items: [] };
    const simPallets = [currentPallet];

    sorted.forEach(item => {
      let remaining = item.totalQty;
      while (remaining > 0) {
        const fit = window.PalletPacking.getFitQty(currentPallet, item.partNo, remaining, Ht, Fh, Ph, limit);
        logs.push({
          palletId: currentPallet.id,
          partNo: item.partNo,
          remaining,
          fit,
          currentItems: JSON.parse(JSON.stringify(currentPallet.items))
        });
        if (fit > 0) {
          const ex = currentPallet.items.find(i => i.partNo === item.partNo);
          if (ex) ex.qty += fit;
          else currentPallet.items.push({ partNo: item.partNo, qty: fit });
          remaining -= fit;
        } else {
          currentPallet = { id: currentPallet.id + 1, palletType: "1x2m", items: [] };
          simPallets.push(currentPallet);
          const fit2 = window.PalletPacking.getFitQty(currentPallet, item.partNo, remaining, Ht, Fh, Ph, limit);
          logs.push({
            action: 'created_new_pallet',
            newPalletId: currentPallet.id,
            partNo: item.partNo,
            remaining,
            fit2
          });
          if (fit2 > 0) {
            currentPallet.items.push({ partNo: item.partNo, qty: fit2 });
            remaining -= fit2;
          } else {
            break;
          }
        }
      }
    });

    return {
      pList,
      logs,
      simPallets
    };
  });

  console.log('TRACE LOGS:');
  console.log(JSON.stringify(trace, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
