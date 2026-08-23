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
    server.listen(8196, () => resolve(server));
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
  await page.goto('http://localhost:8196/#panel-config/ysacc/opt1-side', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Check YSACC
  const ysaccOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('YSACC opening inputs count:', ysaccOpenings);
  if (ysaccOpenings !== 0) throw new Error('YSACC should have 0 opening inputs');

  // Switch to MNT Spec
  console.log('2. Switching to MNT Spec...');
  await page.evaluate(() => {
    const mntBtn = document.querySelector('.btnMatrixCustTab[data-id="mnt_spec"]');
    if (mntBtn) mntBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const mntOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('MNT opening inputs count:', mntOpenings);
  if (mntOpenings === 0) throw new Error('MNT should have separate opening inputs');
  await page.screenshot({ path: path.join(artifactDir, 'test_mnt_separate_opening_inputs_chrome.png') });

  // Switch to WATANI Spec
  console.log('3. Switching to WATANI Spec...');
  await page.evaluate(() => {
    const wataniBtn = document.querySelector('.btnMatrixCustTab[data-id="watani_spec"]');
    if (wataniBtn) wataniBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const wataniOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('WATANI opening inputs count:', wataniOpenings);
  if (wataniOpenings === 0) throw new Error('WATANI should have separate opening inputs');
  await page.screenshot({ path: path.join(artifactDir, 'test_watani_separate_opening_inputs_chrome.png') });

  // Switch to HAYOUNG Spec
  console.log('4. Switching to HAYOUNG Spec...');
  await page.evaluate(() => {
    const hayoungBtn = document.querySelector('.btnMatrixCustTab[data-id="hayoung_spec"]');
    if (hayoungBtn) hayoungBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const hayoungOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('HAYOUNG opening inputs count:', hayoungOpenings);
  if (hayoungOpenings === 0) throw new Error('HAYOUNG should have separate opening inputs');
  await page.screenshot({ path: path.join(artifactDir, 'test_hayoung_separate_opening_inputs_chrome.png') });

  // Switch to ALMUFTAH Spec
  console.log('5. Switching to ALMUFTAH Spec...');
  await page.evaluate(() => {
    const alBtn = document.querySelector('.btnMatrixCustTab[data-id="almuftah"]');
    if (alBtn) alBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const alOpenings = await page.evaluate(() => {
    return document.querySelectorAll('input[id^="input_opening_"]').length;
  });
  console.log('ALMUFTAH opening inputs count:', alOpenings);
  if (alOpenings === 0) throw new Error('ALMUFTAH should have separate opening inputs');
  await page.screenshot({ path: path.join(artifactDir, 'test_almuftah_separate_opening_inputs_chrome.png') });

  await browser.close();
  server.close();
  console.log('All non-YSACC opening input separation tests verified successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
