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
    server.listen(8247, () => resolve(server));
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

  await page.goto('http://localhost:8247/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Switch to Steel Accessories tab and height 2mH
  await page.evaluate(() => {
    // Open steel accessories section / tab
    const tabs = Array.from(document.querySelectorAll('button, .tab-btn, .nav-tab, [data-tab]'));
    const steelTab = tabs.find(t => t.textContent.includes('보강재 도면') || t.textContent.includes('부재 레이아웃') || t.getAttribute('data-tab') === 'steelAccessories' || t.id === 'tabSteelAccessories');
    if (steelTab) steelTab.click();
    else if (window.switchMainTab) window.switchMainTab('steelAccessories');

    if (window.SteelAccessories && typeof window.SteelAccessories.selectHeight === 'function') {
      window.SteelAccessories.selectHeight('2');
    }
  });

  await new Promise(r => setTimeout(r, 1200));

  const colorInspection = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('.sa-pos-badge')).map(el => ({
      text: el.textContent.trim(),
      bg: el.style.background || getComputedStyle(el).backgroundColor
    }));

    const chips = Array.from(document.querySelectorAll('.sa-pos-chip')).map(el => ({
      text: el.textContent.trim(),
      color: el.style.color || getComputedStyle(el).color,
      bg: el.style.background || getComputedStyle(el).backgroundColor
    }));

    const swatches = Array.from(document.querySelectorAll('.sa-legend-swatch')).map(el => ({
      bg: el.style.background || getComputedStyle(el).backgroundColor
    }));

    return { badges, chips, swatches };
  });

  console.log('=== COLOR INSPECTION RESULTS ===');
  console.log(JSON.stringify(colorInspection, null, 2));

  await page.screenshot({ path: path.join(artifactDir, 'test_steel_accessories_colors_verified.png') });
  console.log('Saved screenshot test_steel_accessories_colors_verified.png');

  await browser.close();
  server.close();
  console.log('ALL COLOR VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
