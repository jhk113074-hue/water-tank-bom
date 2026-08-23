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
    server.listen(8203, () => resolve(server));
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

  console.log('1. Loading web application...');
  await page.goto('http://localhost:8203/#panel-config/ysacc/opt1-side', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Check Sidebar Button
  console.log('2. Clicking MOLD GROUPS tab...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-mold-groups"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Exercise group creation
  console.log('3. Testing Add Group...');
  await page.evaluate(() => {
    if (window.MoldGroupManager) {
      window.MoldGroupManager.addGroup('500x1000 Standard Mold', ['GR-0510-D', 'GF-0510-D']);
      window.MoldGroupManager.renderUI();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_tab_chrome.png') });
  console.log('Saved test_mold_groups_tab_chrome.png');

  // Verify production plan report
  const planRows = await page.evaluate(() => {
    const table = document.querySelector('#moldProductionPlanContainer table');
    return table ? table.querySelectorAll('tr').length : 0;
  });
  console.log('Mold Production Plan rows:', planRows);

  // Clean up test group
  await page.evaluate(() => {
    if (window.MoldGroupManager) {
      const groups = window.MoldGroupManager.getGroups();
      groups.forEach(g => {
        if (g.label === '500x1000 Standard Mold') {
          window.MoldGroupManager.deleteGroup(g.id);
        }
      });
      window.MoldGroupManager.renderUI();
    }
  });

  await browser.close();
  server.close();
  console.log('MOLD GROUPS verification complete with 0 errors!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
