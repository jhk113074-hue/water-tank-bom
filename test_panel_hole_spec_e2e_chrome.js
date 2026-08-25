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
    server.listen(8225, () => resolve(server));
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
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8225/#panel-hole-spec', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-panel-hole-spec"]');
    if (btn) btn.click();
    else if (typeof window.switchTab === 'function') window.switchTab('tab-panel-hole-spec');
  });

  await page.waitForFunction(() => {
    return window.PanelHoleSpec && document.getElementById('panelHoleSpecFormContainer');
  }, { timeout: 10000 });

  // 1. Switch to HAYOUNG preset
  console.log('Switching to HAYOUNG preset in PanelHoleSpec...');
  await page.evaluate(() => {
    window.PanelHoleSpec.setActiveParty('hayoung_spec');
  });
  await new Promise(r => setTimeout(r, 400));

  // 2. Fill in form for GW-1010-A + SX and save
  console.log('Filling in form for GW-1010-A + SX and saving...');
  await page.evaluate(() => {
    document.getElementById('holeSpecPanelCode').value = 'GW-1010-A';
    document.getElementById('holeSpecOpeningCode').value = 'SX';
    document.getElementById('holeSpecEdge_top').value = '8';
    document.getElementById('holeSpecEdge_bottom').value = '8';
    document.getElementById('holeSpecEdge_left').value = '6';
    document.getElementById('holeSpecEdge_right').value = '6';
    document.getElementById('holeSpecFace_top').value = '2';
    document.getElementById('holeSpecFace_bottom').value = '2';
    document.getElementById('holeSpecFace_left').value = '1';
    document.getElementById('holeSpecFace_right').value = '1';
    document.getElementById('holeSpecFaceNote').value = 'SX 노즐 개공부';
    window.PanelHoleSpec.updateCombinedPreview();
    window.PanelHoleSpec.saveFromForm();
  });
  await new Promise(r => setTimeout(r, 600));

  // 4. Verify saved spec via API
  const spec = await page.evaluate(() => {
    return window.PanelHoleSpec.getPanelSpec('GW-1010-A', 'SX', 'hayoung_spec');
  });
  console.log('Saved Spec:', JSON.stringify(spec));

  if (!spec || spec.edges.top !== 8 || spec.edges.bottom !== 8 || spec.edges.left !== 6 || spec.edges.right !== 6 ||
      spec.face.top !== 2 || spec.face.bottom !== 2 || spec.face.left !== 1 || spec.face.right !== 1 || spec.face.note !== 'SX 노즐 개공부') {
    throw new Error('Panel hole spec did not save correctly!');
  }

  // 5. Screenshot verification
  await page.screenshot({ path: path.join(artifactDir, 'test_panel_hole_spec_verified.png') });
  console.log('Saved test_panel_hole_spec_verified.png');

  // 6. Clean up test record
  await page.evaluate(() => {
    window.PanelHoleSpec.removePanelSpec('GW-1010-A', 'SX', 'hayoung_spec');
  });

  await browser.close();
  server.close();
  console.log('TEST PASSED: Panel Hole Spec 4-direction Face holes and composite key verified cleanly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
