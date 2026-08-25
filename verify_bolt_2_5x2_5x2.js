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
    server.listen(8232, () => resolve(server));
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

  await page.goto('http://localhost:8232/#bolt-logic-audit', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    // W=2.5, L1=2.5, H=2
    // W: value=2.5, whole=2, half=1
    // L1: value=2.5, whole=2, half=1
    // H: value=2, whole=2, half=0
    const g = {
      W: { value: 2.5, whole: 2, half: 1 },
      H: { value: 2, whole: 2, half: 0 },
      L1: { value: 2.5, whole: 2, half: 1 },
      L2: { value: 0, whole: 0, half: 0 },
      L3: { value: 0, whole: 0, half: 0 },
      L4: { value: 0, whole: 0, half: 0 },
      L_C_sum: 2,
      L_F_sum: 1,
      n_partitions: 0,
      R1: 8,
      R05: 4
    };

    const isIntReinf = true;
    const materialOption = 2; // SS304
    const overrides = {};
    const presetId = 'default';

    // 1. Standard calculation
    const resStandard = window.AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides, false, presetId);
    const res1mSide = window.AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides, true, presetId);

    // 2. Theoretical formulas for 2.5 x 2.5 x 2m:
    // W_C = 2, W_F = 1
    // L_C = 2, L_F = 1
    // L_C + L_F - 1 = 2 + 1 - 1 = 2 seams along Length
    // W_C + W_F - 1 = 2 + 1 - 1 = 2 seams along Width
    // Perimeter Whole = 2 * (L_C + W_C) = 2 * (2 + 2) = 8m
    // Perimeter Half = 2 * (L_F + W_F) = 2 * (1 + 1) = 4 * 0.5m = 2m (total perimeter = 10m)
    // AP5 (Roof V): (R1*W_C + R05*W_F) * (L_C + L_F - 1) = (8*2 + 4*1) * 2 = 20 * 2 = 40
    // AP6 (Roof H): (R1*L_C + R05*L_F) * (W_C + W_F - 1) = (8*2 + 4*1) * 2 = 20 * 2 = 40
    // AP7 (Roof Perimeter): R1*2*(sumLi_C+W_C) + R05*2*(sumLi_F+W_F) = 8*2*(2+2) + 4*2*(1+1) = 64 + 16 = 80
    // AP12 (Bottom V): (8*W_C + 4*W_F) * (L_C + L_F - 1) = (16 + 4) * 2 = 40
    // AP13 (Bottom H): (8*L_C + 4*L_F) * (W_C + W_F - 1) = (16 + 4) * 2 = 40
    // AP14 (Bottom Perimeter): 8*2*(sumLi_C+W_C) + 4*2*(sumLi_F+W_F) - AP24 = 64 + 16 - 0 = 80
    // AP18 (Side V): (W_C+W_F-1 + L_C+L_F-1)*2 * 8 * 2m = (2 + 2)*2 * 8 = 4 * 2 * 8 = 8 * 8 = 64 (or 2m courses)
    // Formula for AP18: H_O*((W_C+W_F-1)+(L_C+L_F-1))*2*8 = 2 * (2 + 2) * 2 * 8 = 128
    // AP19 (Side H): for single 2m panel = 0; for 1m side = 8 * (W_O+L_O)*2 * (2-1) = 8 * 5 * 2 * 1 = 80
    // AP22 (Corner): 4 * 2 * 8 * 2m = 128
    // AP41 (Skid/Side): ((L1_C+W_C)*2 + (L1_F+W_F)*2)*2 = (8 + 4)*2 = 24

    const rowsToCheck = ['AP5', 'AP6', 'AP7', 'AP12', 'AP13', 'AP14', 'AP18', 'AP19', 'AP22', 'AP41', 'AP66', 'AP9', 'AP10', 'AP15', 'AP16', 'AP26', 'AP27'];

    const summary = rowsToCheck.map(rId => {
      const item = resStandard.detail.find(d => d.id === rId) || {};
      const item1m = res1mSide.detail.find(d => d.id === rId) || {};
      return {
        id: rId,
        label: item.label || '',
        partNo: item.partNo || '',
        qty: item.value,
        qty1mSide: item1m.value
      };
    });

    return {
      summary,
      totalBolts: resStandard.total,
      allRows: resStandard.detail.filter(d => d.value > 0).map(d => ({ id: d.id, label: d.label, partNo: d.partNo, qty: d.value }))
    };
  });

  console.log('=== 2.5 x 2.5 x 2m Result ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
