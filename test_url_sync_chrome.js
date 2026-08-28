const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

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
    server.listen(8171, () => resolve(server));
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

  page.on('dialog', async dialog => {
    console.log('Dialog:', dialog.message());
    await dialog.accept();
  });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('Test 1: Navigate to #panel-config/hayoung/opt2-side_1m');
  await page.goto('http://localhost:8171/#panel-config/hayoung/opt2-side_1m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const state1 = await page.evaluate(() => {
    return {
      cust: window.selectedCustomerPresetId,
      subOpt: window.selectedSubOptNum,
      hash: window.location.hash
    };
  });
  console.log('State 1:', state1);
  assert(state1.cust === 'hayoung' || state1.cust === 'hayoung_spec', 'Customer preset must be hayoung or hayoung_spec');
  assert.strictEqual(state1.subOpt, 2, 'Sub-option must be 2');

  console.log('Test 2: Click WATANI tab');
  await page.evaluate(() => {
    const custBtns = Array.from(document.querySelectorAll('.btnMatrixCustTab'));
    const wataniBtn = custBtns.find(b => b.textContent.includes('WATANI'));
    if (wataniBtn) wataniBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const state2 = await page.evaluate(() => {
    return {
      cust: window.selectedCustomerPresetId,
      subOpt: window.selectedSubOptNum,
      hash: window.location.hash
    };
  });
  console.log('State 2:', state2);
  assert(state2.cust === 'watani' || state2.cust === 'watani_spec', 'Customer preset must be watani or watani_spec');
  assert(state2.hash.includes('watani'), 'Hash must contain watani');

  console.log('Test 3: Click Option 4 - Partition tab');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.btnMatrixSubOptTab'));
    const opt4Btn = btns.find(b => b.getAttribute('data-num') === '4' || b.textContent.includes('Option 4') || b.textContent.includes('OPT4'));
    if (opt4Btn) opt4Btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const state3 = await page.evaluate(() => {
    return {
      cust: window.selectedCustomerPresetId,
      subOpt: window.selectedSubOptNum,
      hash: window.location.hash
    };
  });
  console.log('State 3:', state3);
  assert.strictEqual(state3.subOpt, 4, 'Sub-option must be 4');
  assert(state3.hash.includes('opt4-parti_1m') || state3.hash.includes('opt4'), 'Hash must contain opt4');

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_url_sync_chrome.png') });
  console.log('Captured test_url_sync_chrome.png');

  console.log('ALL URL SYNC TESTS PASSED!');
  await browser.close();
  server.close();
}

run();
