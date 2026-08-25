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
    server.listen(8226, () => resolve(server));
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

  await page.goto('http://localhost:8226/#panel-hole-spec', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const btn = document.querySelector('button[data-tab="tab-panel-hole-spec"]');
    if (btn) btn.click();
    else if (typeof window.switchTab === 'function') window.switchTab('tab-panel-hole-spec');
  });

  await page.waitForFunction(() => {
    return window.PanelHoleSpec && document.getElementById('panelHoleSpecFormContainer');
  }, { timeout: 10000 });

  // 1. Select BF10 panel
  console.log('Selecting BF10 panel...');
  await page.evaluate(() => {
    window.PanelHoleSpec.selectBaseCode('BF10');
  });
  await new Promise(r => setTimeout(r, 400));

  // 2. Fill in NONE Flange holes and click copy to all
  console.log('Filling NONE Flange and copying to all openings (BP/BX/etc)...');
  await page.evaluate(() => {
    document.getElementById('row_NONE_edge_top').value = '8';
    document.getElementById('row_NONE_edge_bottom').value = '8';
    document.getElementById('row_NONE_edge_left').value = '8';
    document.getElementById('row_NONE_edge_right').value = '8';
    window.PanelHoleSpec.copyFlangeFromDefaultToAll();
  });
  await new Promise(r => setTimeout(r, 300));

  // 3. Fill in BP and BX face holes
  console.log('Filling BP and BX face holes...');
  await page.evaluate(() => {
    // BP Face
    document.getElementById('row_BP_face_top').value = '2';
    document.getElementById('row_BP_face_bottom').value = '2';
    document.getElementById('row_BP_face_left').value = '2';
    document.getElementById('row_BP_face_right').value = '2';
    document.getElementById('row_BP_face_note').value = 'BP 바닥 드레인';

    // BX Face
    document.getElementById('row_BX_face_top').value = '4';
    document.getElementById('row_BX_face_bottom').value = '4';
    document.getElementById('row_BX_face_left').value = '4';
    document.getElementById('row_BX_face_right').value = '4';
    document.getElementById('row_BX_face_note').value = 'BX 드레인 박스';
  });
  await new Promise(r => setTimeout(r, 300));

  // 4. Click Save All
  console.log('Saving all variants simultaneously...');
  await page.evaluate(() => {
    window.PanelHoleSpec.saveAllFromForm();
  });
  await new Promise(r => setTimeout(r, 600));

  // 5. Verify saved specs
  const specs = await page.evaluate(() => {
    return {
      none: window.PanelHoleSpec.getPanelSpec('BF10', '', 'default'),
      bp: window.PanelHoleSpec.getPanelSpec('BF10', 'BP', 'default'),
      bx: window.PanelHoleSpec.getPanelSpec('BF10', 'BX', 'default')
    };
  });
  console.log('Saved Specs:', JSON.stringify(specs, null, 2));

  if (!specs.none || specs.none.edges.top !== 8 || specs.none.edges.bottom !== 8) {
    throw new Error('NONE spec failed to save');
  }
  if (!specs.bp || specs.bp.edges.top !== 8 || specs.bp.face.top !== 2 || specs.bp.face.note !== 'BP 바닥 드레인') {
    throw new Error('BP spec failed to save or inherit Flange');
  }
  if (!specs.bx || specs.bx.edges.top !== 8 || specs.bx.face.top !== 4 || specs.bx.face.note !== 'BX 드레인 박스') {
    throw new Error('BX spec failed to save or inherit Flange');
  }

  // 6. Screenshot verification
  await page.screenshot({ path: path.join(artifactDir, 'test_simultaneous_hole_spec_verified.png') });
  console.log('Saved test_simultaneous_hole_spec_verified.png');

  // 7. Cleanup test data
  await page.evaluate(() => {
    window.PanelHoleSpec.removePanelSpec('BF10', '', 'default');
    window.PanelHoleSpec.removePanelSpec('BF10', 'BP', 'default');
    window.PanelHoleSpec.removePanelSpec('BF10', 'BX', 'default');
    window.PanelHoleSpec.renderUI();
  });

  await browser.close();
  server.close();
  console.log('TEST PASSED: Simultaneous BF/SF + BP/BX multi-variant hole spec editor verified cleanly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
