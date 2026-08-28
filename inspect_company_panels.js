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
    server.listen(8220, () => resolve(server));
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

  await page.goto('http://localhost:8220/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  const inspection = await page.evaluate(() => {
    const res = {};
    ['default', 'hayoung_spec', 'almuftah', 'mnt', 'watani'].forEach(pid => {
      const panelsFromMold = window.MoldGroupManager.getCompanyPanels(pid);
      res[pid] = {
        count: panelsFromMold.length,
        panels: panelsFromMold.map(p => p.partNo)
      };
    });
    return res;
  });

  console.log('Inspecting company panels:', JSON.stringify(inspection, null, 2));

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
