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
    server.listen(8198, () => resolve(server));
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
  await page.goto('http://localhost:8198/#panel-config/ysacc/opt0-rf_mf_bf_dn', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Check that separate opening mode is active by default for YSACC
  const ysaccOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('YSACC initial opening inputs count:', ysaccOpenings);
  if (ysaccOpenings === 0) throw new Error('YSACC should now have separate opening inputs by default');

  // Check what values are displayed in the first few cells
  const firstRowValues = await page.evaluate(() => {
    const pInput = document.querySelector('input[id^="input_matrix_0_"]');
    const oInput = document.querySelector('input[id^="input_opening_0_"]');
    return {
      partNo: pInput ? pInput.value : null,
      opening: oInput ? oInput.value : null
    };
  });
  console.log('First cell values:', firstRowValues);

  await page.screenshot({ path: path.join(artifactDir, 'test_ysacc_default_separate_inputs_chrome.png') });
  console.log('Saved test_ysacc_default_separate_inputs_chrome.png');

  await browser.close();
  server.close();
  console.log('YSACC default separate opening verification complete!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
