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
    server.listen(8223, () => resolve(server));
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

  await page.goto('http://localhost:8223/#steel-accessories', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const btn = document.querySelector('.tab-btn[data-tab="tab-steel-accessories"]');
    if (btn) btn.click();
  });

  await page.waitForFunction(() => {
    return window.SteelAccessories && window.SteelAccessories.getLayout() && document.querySelector('.sa-option-mapping-bar');
  }, { timeout: 10000 });

  const state = await page.evaluate(() => {
    return {
      hasSA: typeof window.SteelAccessories !== 'undefined',
      layoutLoaded: !!(window.SteelAccessories && window.SteelAccessories.getLayout()),
      containerHTML: document.getElementById('steelAccessoriesContainer') ? document.getElementById('steelAccessoriesContainer').innerHTML.substring(0, 300) : 'no container'
    };
  });
  console.log('SteelAccessories State:', state);

  // 2. Check internal options mapping table is present
  const hasOptionBar = await page.evaluate(() => {
    return !!document.querySelector('.sa-option-mapping-bar');
  });
  console.log('Has Option Mapping Bar:', hasOptionBar);
  if (!hasOptionBar) throw new Error('Option Mapping Bar not found!');

  // 3. Test changing Side 3mH to INT(Side_1m_O)
  await page.evaluate(() => {
    window.SteelAccessories.updateHeightOption('intSide', '3', 'int_side_1m');
  });
  await new Promise(r => setTimeout(r, 400));

  // 4. Test changing Partition 3mH to INT(PART_1m_O)
  await page.evaluate(() => {
    window.SteelAccessories.updateHeightOption('intPart', '3', 'int_partition_1m');
  });
  await new Promise(r => setTimeout(r, 400));

  const savedOptions = await page.evaluate(() => {
    return window.SteelAccessories.getPartyOptions();
  });
  console.log('Saved INT options for 3mH:', savedOptions.intSide['3'], savedOptions.intPart['3']);

  if (savedOptions.intSide['3'] !== 'int_side_1m' || savedOptions.intPart['3'] !== 'int_partition_1m') {
    throw new Error('Internal height options did not update!');
  }

  // Screenshot INT view
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_int_mapping.png') });
  console.log('Saved test_steel_acc_int_mapping.png');

  // 5. Switch to External Reinforcement option mode
  await page.evaluate(() => {
    window.SteelAccessories.setReinfOptionViewMode('ext');
  });
  await new Promise(r => setTimeout(r, 400));

  // 6. Test changing Ext Side 4mH to EXT(1x1m)
  await page.evaluate(() => {
    window.SteelAccessories.updateHeightOption('extSide', '4', 'ext_1x1m');
  });
  await new Promise(r => setTimeout(r, 400));

  const savedExtOptions = await page.evaluate(() => {
    return window.SteelAccessories.getPartyOptions();
  });
  console.log('Saved EXT option for 4mH:', savedExtOptions.extSide['4']);
  if (savedExtOptions.extSide['4'] !== 'ext_1x1m') {
    throw new Error('External height options did not update!');
  }

  // Screenshot EXT view
  await page.screenshot({ path: path.join(artifactDir, 'test_steel_acc_ext_mapping.png') });
  console.log('Saved test_steel_acc_ext_mapping.png');

  await browser.close();
  server.close();
  console.log('TEST PASSED: Steel Accessories height-by-height options for Internal and External reinforcement working seamlessly!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
