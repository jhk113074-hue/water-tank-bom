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
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(8095, () => resolve(server));
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
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:8095/#sealing-tape/ysacc', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Single click ALMUFTAH Spec button inside Sealing Tape container
  console.log('Single clicking ALMUFTAH Spec inside Sealing Tape container...');
  await page.evaluate(() => {
    const container = document.getElementById('sealingTapeMasterFullContainer');
    if (!container) return;
    const btns = Array.from(container.querySelectorAll('button'));
    const target = btns.find(b => b.textContent.includes('ALMUFTAH Spec'));
    if (target) target.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'correct_almuftah_single_click.png') });
  console.log('Captured correct_almuftah_single_click.png');

  // Single click WATANI Spec button inside Sealing Tape container
  console.log('Single clicking WATANI Spec inside Sealing Tape container...');
  await page.evaluate(() => {
    const container = document.getElementById('sealingTapeMasterFullContainer');
    if (!container) return;
    const btns = Array.from(container.querySelectorAll('button'));
    const target = btns.find(b => b.textContent.includes('WATANI Spec'));
    if (target) target.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'correct_watani_single_click.png') });
  console.log('Captured correct_watani_single_click.png');

  await browser.close();
  server.close();
}

run();
