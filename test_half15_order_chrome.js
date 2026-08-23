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
    server.listen(8188, () => resolve(server));
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

  console.log('1. Navigating to panel config option 3...');
  await page.goto('http://localhost:8188/#panel-config/ysacc/opt3-partition', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  
  await page.screenshot({ path: path.join(artifactDir, 'test_half15_opt3_default_top10.png') });
  console.log('Saved test_half15_opt3_default_top10.png');

  console.log('2. Toggling to 500x500(Top) + 500x1000(Bottom)...');
  await page.evaluate(() => {
    window.updateCustHalf15Split('top05_bot10');
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_half15_opt3_inverted_top05.png') });
  console.log('Saved test_half15_opt3_inverted_top05.png');

  console.log('3. Navigating to Option 1 - Side...');
  await page.evaluate(() => {
    const opt1Btn = document.querySelector('.btnMatrixSubOptTab[data-num="1"]');
    if (opt1Btn) opt1Btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_half15_opt1_inverted_top05.png') });
  console.log('Saved test_half15_opt1_inverted_top05.png');

  console.log('4. Clicking diagram center column to toggle back to default...');
  await page.evaluate(() => {
    const colGroup = document.querySelector('.svg-top15-col');
    if (colGroup) {
      colGroup.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(artifactDir, 'test_half15_opt1_toggled_back_top10.png') });
  console.log('Saved test_half15_opt1_toggled_back_top10.png');

  await browser.close();
  server.close();
  console.log('All verification steps completed successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
