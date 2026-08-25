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
    server.listen(8231, () => resolve(server));
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

  await page.goto('http://localhost:8231/#bolt-logic-audit', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    const g = {
      W: { value: 2, whole: 2, half: 0 },
      H: { value: 2, whole: 2, half: 0 },
      L1: { value: 2, whole: 2, half: 0 },
      L2: { value: 0, whole: 0, half: 0 },
      L3: { value: 0, whole: 0, half: 0 },
      L4: { value: 0, whole: 0, half: 0 },
      L_C_sum: 2,
      L_F_sum: 0,
      n_partitions: 0,
      R1: 8,
      R05: 4
    };

    const isIntReinf = true;
    const materialOption = 2; // SS304
    const overrides = {};
    const presetId = 'default';

    // 1. Case A: Standard Side (S_1M = false)
    const resStandard = window.AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides, false, presetId);

    // 2. Case B: 1m Side Stacking (S_1M = true)
    const res1mSide = window.AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides, true, presetId);

    const rowsToCheck = ['AP5', 'AP6', 'AP7', 'AP12', 'AP13', 'AP14', 'AP18', 'AP19', 'AP22'];

    const compareList = rowsToCheck.map(rId => {
      const itemStd = resStandard.detail.find(d => d.id === rId) || {};
      const item1m = res1mSide.detail.find(d => d.id === rId) || {};
      return {
        id: rId,
        label: itemStd.label,
        partNo: itemStd.partNo,
        standardQty: itemStd.value,
        side1mQty: item1m.value
      };
    });

    return {
      compareList,
      totalStd: resStandard.total,
      total1m: res1mSide.total
    };
  });

  console.log('=== 2x2x2m Standard vs 1m Side Option Result ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
