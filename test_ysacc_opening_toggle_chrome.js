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
    server.listen(8197, () => resolve(server));
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

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('1. Loading web application with YSACC Spec...');
  await page.goto('http://localhost:8197/#panel-config/ysacc/opt1-side', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Toggle YSACC Spec to Separate Product / Opening mode
  console.log('2. Toggling YSACC Spec to Separate Product / Opening mode...');
  await page.evaluate(() => {
    if (window.updateCustCodeEmbedsOpening) {
      window.updateCustCodeEmbedsOpening(false);
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  const ysaccSeparateOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('YSACC in separate mode opening inputs count:', ysaccSeparateOpenings);
  if (ysaccSeparateOpenings === 0) throw new Error('YSACC in separate mode should have separate opening inputs');

  await page.screenshot({ path: path.join(artifactDir, 'test_ysacc_separate_opening_mode_chrome.png') });
  console.log('Saved test_ysacc_separate_opening_mode_chrome.png');

  // Toggle YSACC Spec back to Embedded Code mode
  console.log('3. Toggling YSACC Spec back to Embedded Code mode...');
  await page.evaluate(() => {
    if (window.updateCustCodeEmbedsOpening) {
      window.updateCustCodeEmbedsOpening(true);
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  const ysaccEmbeddedOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('YSACC in embedded mode opening inputs count:', ysaccEmbeddedOpenings);
  if (ysaccEmbeddedOpenings !== 0) throw new Error('YSACC in embedded mode should have 0 separate opening inputs');

  await page.screenshot({ path: path.join(artifactDir, 'test_ysacc_embedded_opening_mode_chrome.png') });
  console.log('Saved test_ysacc_embedded_opening_mode_chrome.png');

  await browser.close();
  server.close();
  console.log('YSACC opening mode toggle verified successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
