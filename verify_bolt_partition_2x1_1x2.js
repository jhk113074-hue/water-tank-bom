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
    server.listen(8235, () => resolve(server));
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

  await page.goto('http://localhost:8235/#bolt-logic-audit', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    // W=2, L1=1, L2=1, H=2, n_partitions=1
    const g = {
      W: { value: 2, whole: 2, half: 0 },
      H: { value: 2, whole: 2, half: 0 },
      L1: { value: 1, whole: 1, half: 0 },
      L2: { value: 1, whole: 1, half: 0 },
      L3: { value: 0, whole: 0, half: 0 },
      L4: { value: 0, whole: 0, half: 0 },
      L_C_sum: 2,
      L_F_sum: 0,
      n_partitions: 1,
      R1: 8,
      R05: 4
    };

    const isIntReinf = true;
    const materialOption = 2; // SS304
    const overrides = {};
    const presetId = 'default';

    const res = window.AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides, false, presetId);

    const partitionRows = ['AP29', 'AP30', 'AP31', 'AP32', 'AP33', 'AP34', 'AP35', 'AP36', 'AP37', 'AP57', 'AP58', 'AP59', 'AP60', 'AP67', 'AP69', 'AP74', 'AP75'];
    const outerRows = ['AP5', 'AP6', 'AP7', 'AP12', 'AP13', 'AP14', 'AP18', 'AP19', 'AP22', 'AP41', 'AP66'];

    const partitionSummary = partitionRows.map(rId => {
      const item = res.detail.find(d => d.id === rId) || {};
      return {
        id: rId,
        label: item.label || '',
        partNo: item.partNo || '',
        qty: item.value
      };
    });

    const outerSummary = outerRows.map(rId => {
      const item = res.detail.find(d => d.id === rId) || {};
      return {
        id: rId,
        label: item.label || '',
        partNo: item.partNo || '',
        qty: item.value
      };
    });

    return {
      outerSummary,
      partitionSummary,
      totalBolts: res.total,
      allRows: res.detail.filter(d => d.value > 0).map(d => ({ id: d.id, label: d.label, partNo: d.partNo, qty: d.value }))
    };
  });

  console.log('=== Partition 2 x (1+1) x 2m Result ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
