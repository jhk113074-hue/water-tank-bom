const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url.split('?')[0].split('#')[0]);
      if (filePath === __dirname || filePath === __dirname + '\\' || filePath === __dirname + '/') {
        filePath = path.join(__dirname, 'index.html');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        let contentType = 'text/html';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.json')) contentType = 'application/json';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(8152, () => resolve(server));
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
  await page.setViewport({ width: 1440, height: 1000 });

  page.on('dialog', async dialog => {
    console.log('Dialog opened:', dialog.message());
    await dialog.accept();
  });

  console.log('Navigating to http://localhost:8152/#steel-accessories/mnt/1/4.5m ...');
  await page.goto('http://localhost:8152/#steel-accessories/mnt/1/4.5m', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sa-panel-svg', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  console.log('Clicking [보강재 수정 삭제] button under MNT ...');
  const btn = await page.$('button[data-action="reset-reinforcing-height"]');
  if (btn) {
    await btn.click();
    await new Promise(r => setTimeout(r, 2000));
  }

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_mnt_delete_reinf_chrome.png') });
  console.log('Captured test_steel_mnt_delete_reinf_chrome.png');

  const spec = await page.evaluate(() => {
    const raw = localStorage.getItem('water_tank_steel_accessories_layout_v1');
    const ov = raw ? JSON.parse(raw) : {};
    return ov['__heightspec__::MNT::int_side::4.5'];
  });
  console.log('Spec after click:', JSON.stringify(spec, null, 2));

  await browser.close();
  server.close();
}

run();
