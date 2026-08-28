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
    server.listen(8245, () => resolve(server));
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

  await page.goto('http://localhost:8245/#bolt-logic-audit', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    // Check Option 3 (Alt 1.5m single) vs Option 4 (1m + 0.5m split)
    const g = {
      W: { value: 2, whole: 2, half: 0 },
      H: { value: 1.5, whole: 1, half: 1 },
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

    const res = window.AccessoriesEngine.boltsAndNutsParts(g, true, 2, {}, false, 'default');
    const assemblyBoltIds = ['AP5', 'AP6', 'AP7', 'AP12', 'AP13', 'AP14', 'AP18', 'AP19', 'AP22', 'AP29', 'AP30', 'AP32', 'AP33'];

    return res.detail.filter(d => assemblyBoltIds.includes(d.id)).map(d => ({
      id: d.id,
      label: d.label,
      partNo: d.partNo,
      qty: d.value,
      section: d.section
    }));
  });

  console.log('=== Checked 1.5mH result ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
