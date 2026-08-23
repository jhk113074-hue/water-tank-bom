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
    server.listen(8207, () => resolve(server));
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

  console.log('1. Loading web application...');
  await page.goto('http://localhost:8207', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // 1. Click MOLD GROUPS subtab inside SYSTEM SETTINGS
  console.log('2. Clicking MOLD GROUPS submenu button...');
  await page.evaluate(() => {
    const btn = document.querySelector('.subtab-btn[data-tab="tab-mold-groups"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 2. Check YSACC panels
  const ysaccPanels = await page.evaluate(() => {
    return window.MoldGroupManager.getCompanyPanels('default').map(p => p.partNo);
  });
  console.log('YSACC Pure Base Panels:', ysaccPanels);

  const hasSuffixedCodeInYSACC = ysaccPanels.some(p => p.endsWith('TX') || p.endsWith('BX') || p.endsWith('SX') || p.endsWith('BP'));
  console.log('YSACC has suffixed codes (should be false):', hasSuffixedCodeInYSACC);
  if (hasSuffixedCodeInYSACC) throw new Error('YSACC panels should only contain pure base codes without opening suffixes!');

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_pure_ysacc_chrome.png') });
  console.log('Saved test_mold_groups_pure_ysacc_chrome.png');

  // 3. Switch to HAYOUNG
  console.log('3. Switching to HAYOUNG Spec...');
  await page.evaluate(() => {
    window.MoldGroupManager.setActiveParty('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 1000));

  const hayoungPanels = await page.evaluate(() => {
    return window.MoldGroupManager.getCompanyPanels('hayoung_spec').map(p => p.partNo);
  });
  console.log('HAYOUNG Pure Base Panels:', hayoungPanels);

  const hasYsaccCodeInHayoung = hayoungPanels.some(p => p.startsWith('BF') || p.startsWith('SF') || p.startsWith('NF') || p.startsWith('RF'));
  console.log('HAYOUNG has YSACC codes (should be false):', hasYsaccCodeInHayoung);
  if (hasYsaccCodeInHayoung) throw new Error('HAYOUNG panels should only contain HAYOUNG-specific codes!');

  await page.screenshot({ path: path.join(artifactDir, 'test_mold_groups_pure_hayoung_chrome.png') });
  console.log('Saved test_mold_groups_pure_hayoung_chrome.png');

  await browser.close();
  server.close();
  console.log('Pure base panel code verification passed cleanly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
