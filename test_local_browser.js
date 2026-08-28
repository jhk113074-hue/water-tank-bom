const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static HTTP server
function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url.split('?')[0].split('#')[0]);
      if (filePath === __dirname || filePath === __dirname + '\\' || filePath === __dirname + '/') {
        filePath = path.join(__dirname, 'index.html');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        let contentType = 'text/html';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.json')) contentType = 'application/json';

        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });

    server.listen(8085, () => {
      console.log('Local test server running at http://localhost:8085/');
      resolve(server);
    });
  });
}

async function testLocalApp() {
  const server = await startLocalServer();

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disk-cache-size=1']
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1400, height: 900 });

  console.log('Navigating to http://localhost:8085/#sealing-tape/ysacc ...');
  await page.goto('http://localhost:8085/#sealing-tape/ysacc', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Screenshot 1: Initial load
  await page.screenshot({ path: path.join(artifactDir, 'local_browser_1_initial.png') });
  console.log('Screenshot 1 captured: local_browser_1_initial.png');

  // Click WATANI Spec button
  console.log('Clicking WATANI Spec button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent.includes('WATANI Spec'));
    if (target) target.click();
  });

  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'local_browser_2_watani_clicked.png') });
  console.log('Screenshot 2 captured: local_browser_2_watani_clicked.png');

  // Click ALMUFTAH Spec button
  console.log('Clicking ALMUFTAH Spec button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent.includes('ALMUFTAH Spec'));
    if (target) target.click();
  });

  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'local_browser_3_almuftah_clicked.png') });
  console.log('Screenshot 3 captured: local_browser_3_almuftah_clicked.png');

  // Switch tab to BOM INPUT
  console.log('Clicking BOM INPUT tab...');
  await page.evaluate(() => {
    const bomTab = document.querySelector('.tab-btn[data-tab="tab-bom"]');
    if (bomTab) bomTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'local_browser_4_bom_tab.png') });

  // Switch back to SEALING TAPE MASTER tab
  console.log('Clicking SEALING TAPE MASTER tab...');
  await page.evaluate(() => {
    const stTab = document.querySelector('.tab-btn[data-tab="tab-sealing-tape-master"]');
    if (stTab) stTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'local_browser_5_returned_to_st_master.png') });

  await browser.close();
  server.close();
  console.log('Local Chrome Browser automated test complete!');
}

testLocalApp().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
