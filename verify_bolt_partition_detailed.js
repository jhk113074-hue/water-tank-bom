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
    server.listen(8237, () => resolve(server));
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

  await page.goto('http://localhost:8237/#bolt-logic-audit', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
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

    return {
      total: res.total,
      detail: res.detail.map(d => ({
        id: d.id,
        label: d.label,
        partNo: d.partNo,
        qty: d.value,
        formula: d.formula,
        section: d.section
      }))
    };
  });

  console.log('=== Detailed Breakdown W=2, L1=1, L2=1, H=2m ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
