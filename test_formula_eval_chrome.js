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
    server.listen(8255, () => resolve(server));
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

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8255/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    if (window.switchMainTab) {
      window.switchMainTab('tab-steel-accessories');
    } else {
      const btn = document.querySelector('[data-tab="tab-steel-accessories"]');
      if (btn) btn.click();
    }
    if (window.SteelAccessories) {
      window.SteelAccessories.render('steelAccessoriesContainer');
      window.SteelAccessories.switchDiagramTab('int_side');
      window.SteelAccessories.switchHeightSheet('2.5');
    }
  });

  await page.waitForSelector('.sa-cmp thead th', { timeout: 6000 });

  // Check table headers and evaluation badges
  const tableData = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('.sa-cmp thead th')).map(th => th.textContent.trim());
    const rows = Array.from(document.querySelectorAll('.sa-cmp tbody tr[data-member-id]')).map(tr => {
      const part = tr.querySelector('.sa-cmp-part') ? tr.querySelector('.sa-cmp-part').textContent.trim() : '';
      const pos = tr.querySelector('.sa-pos-chip') ? tr.querySelector('.sa-pos-chip').textContent.trim() : '';
      const scaleInput = tr.querySelector('.sa-tbl-scale-input') ? tr.querySelector('.sa-tbl-scale-input').value.trim() : '';
      const scaleVal = tr.querySelector('.sa-scale-eval-val') ? tr.querySelector('.sa-scale-eval-val').textContent.trim() : '';
      const drawnQty = tr.querySelector('.sa-num') ? tr.querySelector('.sa-num').textContent.trim() : '';
      const verdict = tr.querySelector('.sa-cmp-verdict') ? tr.querySelector('.sa-cmp-verdict').textContent.trim() : '';
      return { part, pos, scaleInput, scaleVal, drawnQty, verdict };
    });

    return { headers, rows };
  });

  console.log('=== TABLE HEADERS ===', tableData.headers);
  console.log('=== TABLE ROWS SAMPLE ===', JSON.stringify(tableData.rows.slice(0, 6), null, 2));

  if (!tableData.headers.some(h => h.includes('수식 계산값'))) {
    throw new Error('Header "수식 계산값" column is missing!');
  }

  // Test live typing in first scale input
  const liveTypingResult = await page.evaluate(() => {
    const firstInp = document.querySelector('.sa-tbl-scale-input');
    if (!firstInp) return null;
    firstInp.value = '4 * 2 + 2';
    firstInp.dispatchEvent(new Event('input', { bubbles: true }));
    const tr = firstInp.closest('tr');
    const scaleVal = tr.querySelector('.sa-scale-eval-val') ? tr.querySelector('.sa-scale-eval-val').textContent.trim() : '';
    const drawnQty = tr.querySelector('.sa-num') ? tr.querySelector('.sa-num').textContent.trim() : '';
    return { scaleVal, drawnQty };
  });

  console.log('=== LIVE TYPING RESULT ===', liveTypingResult);
  if (!liveTypingResult || !liveTypingResult.scaleVal.includes('10')) {
    throw new Error('Live scale evaluation failed to update badge with 10!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test_formula_eval_display_verified.png') });
  console.log('Saved screenshot test_formula_eval_display_verified.png');

  await browser.close();
  server.close();
  console.log('ALL FORMULA EVALUATION TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
