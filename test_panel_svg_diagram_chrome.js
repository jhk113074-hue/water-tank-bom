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
    server.listen(8161, () => resolve(server));
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

  console.log('Navigating to http://localhost:8161/#panel-config ...');
  await page.goto('http://localhost:8161/#panel-config', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';
  await page.screenshot({ path: path.join(artifactDir, 'test_2d_cad_diagram_matrix_chrome.png') });
  console.log('Captured test_2d_cad_diagram_matrix_chrome.png');

  // Test clicking on a panel SVG cell to verify focus
  console.log('Clicking SVG panel cell for 3mH side...');
  await page.evaluate(() => {
    window.onSvgPanelClick('side.LOWER.side', '3mH');
  });
  await new Promise(r => setTimeout(r, 800));

  await page.screenshot({ path: path.join(artifactDir, 'test_2d_cad_diagram_clicked_chrome.png') });
  console.log('Captured test_2d_cad_diagram_clicked_chrome.png');

  await browser.close();
  server.close();
}

run();
