const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0].split('#')[0];
      let filePath = path.join(__dirname, urlPath);
      if (filePath === __dirname || filePath === __dirname + '\\' || filePath === __dirname + '/') {
        filePath = path.join(__dirname, 'index.html');
      }
      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          console.warn('404 for:', urlPath);
          res.writeHead(404);
          res.end('Not found: ' + urlPath);
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
    server.listen(8199, () => resolve(server));
  });
}

async function run() {
  const server = await startLocalServer();
  console.log('Test server started on port 8199');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disk-cache-size=1']
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 950 });

  const errors = [];
  page.on('pageerror', err => {
    console.error('Browser Page Error:', err.message);
    errors.push(err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('favicon')) {
        console.error('Browser Console Error:', txt);
        errors.push(txt);
      }
    }
  });

  console.log('1. Loading web application...');
  await page.goto('http://localhost:8199/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  // Check initial company state (YSACC)
  const initialCompany = await page.evaluate(() => {
    return {
      currentCompanyId: window.CompanyAuth.getCurrentCompanyId(),
      currentCompany: window.CompanyAuth.getCurrentCompany(),
      currencyCode: window.getSystemCurrencyCode(),
      selectedPreset: window.selectedCustomerPresetId,
      headerText: document.getElementById('headerCompanyNameText')?.textContent?.trim()
    };
  });
  console.log('Initial Company State:', JSON.stringify(initialCompany));
  if (initialCompany.currentCompanyId !== 'ysacc') {
    throw new Error(`Expected initial company to be ysacc, got ${initialCompany.currentCompanyId}`);
  }

  // 2. Test switching to MNT
  console.log('2. Testing login as MNT...');
  const mntLoginRes = await page.evaluate(() => {
    const res = window.CompanyAuth.login('mnt', 'mnt');
    return {
      res,
      currentCompanyId: window.CompanyAuth.getCurrentCompanyId(),
      currencyCode: window.getSystemCurrencyCode(),
      selectedPreset: window.selectedCustomerPresetId,
      headerText: document.getElementById('headerCompanyNameText')?.textContent?.trim()
    };
  });
  console.log('MNT Login Result:', JSON.stringify(mntLoginRes));
  if (!mntLoginRes.res.success || mntLoginRes.currentCompanyId !== 'mnt' || mntLoginRes.headerText !== 'MNT') {
    throw new Error('MNT login failed or did not update company state');
  }

  // 3. Test price overlay isolation under MNT
  console.log('3. Testing price overlay under MNT...');
  const mntPriceRes = await page.evaluate(() => {
    window.CompanyAuth.saveCurrentCompanyPrice('WBT-1440', 88.55);
    window.CompanyAuth.applyCompanyPricesToDb('mnt');
    const part = (window.partsDb || []).find(p => p.partNo === 'WBT-1440');
    return {
      partNo: part?.partNo,
      price: part?.price
    };
  });
  console.log('MNT WBT-1440 Price:', JSON.stringify(mntPriceRes));
  if (mntPriceRes.price !== 88.55) {
    throw new Error(`Expected MNT price to be 88.55, got ${mntPriceRes.price}`);
  }

  // 4. Test switching to ALMUFTAH and verifying price is isolated
  console.log('4. Testing login as ALMUFTAH and price isolation...');
  const almuftahLoginRes = await page.evaluate(() => {
    const res = window.CompanyAuth.login('almuftah', 'almuftah');
    const part = (window.partsDb || []).find(p => p.partNo === 'WBT-1440');
    return {
      res,
      currentCompanyId: window.CompanyAuth.getCurrentCompanyId(),
      currencyCode: window.getSystemCurrencyCode(),
      currencySymbol: window.getSystemCurrencySymbol(),
      selectedPreset: window.selectedCustomerPresetId,
      headerText: document.getElementById('headerCompanyNameText')?.textContent?.trim(),
      partPrice: part?.price
    };
  });
  console.log('ALMUFTAH State & Price:', JSON.stringify(almuftahLoginRes));
  if (almuftahLoginRes.currentCompanyId !== 'almuftah' || almuftahLoginRes.currencyCode !== 'QAR' || almuftahLoginRes.partPrice === 88.55) {
    throw new Error(`ALMUFTAH price isolation check failed! Price should not be 88.55, got ${almuftahLoginRes.partPrice}`);
  }

  // 5. Test switching to ALHILAL
  console.log('5. Testing login as ALHILAL...');
  const alhilalLoginRes = await page.evaluate(() => {
    const res = window.CompanyAuth.login('alhilal', 'alhilal');
    return {
      res,
      currentCompanyId: window.CompanyAuth.getCurrentCompanyId(),
      currencyCode: window.getSystemCurrencyCode(),
      currencySymbol: window.getSystemCurrencySymbol(),
      selectedPreset: window.selectedCustomerPresetId,
      headerText: document.getElementById('headerCompanyNameText')?.textContent?.trim()
    };
  });
  console.log('ALHILAL State:', JSON.stringify(alhilalLoginRes));
  if (alhilalLoginRes.currentCompanyId !== 'alhilal' || alhilalLoginRes.currencyCode !== 'SAR' || alhilalLoginRes.selectedPreset !== 'alhilal_spec') {
    throw new Error('ALHILAL state check failed');
  }

  // 6. Test part availability / usage management (사용여부)
  console.log('6. Testing Part Availability (사용여부) per Company...');
  const partUsageRes = await page.evaluate(() => {
    // Switch to YSACC (admin)
    window.CompanyAuth.login('ysacc', 'ysacc');
    
    // Check initial status
    const initialStatus = window.CompanyAuth.isPartEnabled('WBT-1440', 'almuftah');
    
    // Disable WBT-1440 for almuftah
    window.CompanyAuth.setPartStatus('WBT-1440', false, 'almuftah');
    
    const almuftahDisabled = !window.CompanyAuth.isPartEnabled('WBT-1440', 'almuftah');
    const ysaccEnabled = window.CompanyAuth.isPartEnabled('WBT-1440', 'ysacc');
    const statusMap = window.CompanyAuth.getPartCompanyStatus('WBT-1440');

    return {
      initialStatus,
      almuftahDisabled,
      ysaccEnabled,
      statusMap
    };
  });
  console.log('Part Usage Test Result:', JSON.stringify(partUsageRes));
  if (!partUsageRes.almuftahDisabled || !partUsageRes.ysaccEnabled || partUsageRes.statusMap.almuftah !== false) {
    throw new Error('Part availability per-company check failed');
  }

  // 7. Test UI rendering: open Company Settings tab and Master DB table
  console.log('7. Testing UI rendering for Company Settings tab & Part Master DB...');
  await page.evaluate(() => {
    const compSettingsBtn = document.querySelector('.subtab-btn[data-tab="tab-company-settings"]');
    if (compSettingsBtn) compSettingsBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  const compSettingsRendered = await page.evaluate(() => {
    const tab = document.getElementById('tab-company-settings');
    return {
      tabActive: tab?.classList.contains('active'),
      hasCompanyCards: tab?.querySelectorAll('button')?.length > 0,
      profileNameInput: document.getElementById('compSettingName')?.value
    };
  });
  console.log('Company Settings UI Render:', JSON.stringify(compSettingsRendered));
  if (!compSettingsRendered.tabActive) {
    throw new Error('Company settings tab failed to activate');
  }

  // Switch to Master DB and test Usage column
  await page.evaluate(() => {
    const masterDbBtn = document.querySelector('.tab-btn[data-tab="tab-parts-db-master"]');
    if (masterDbBtn) masterDbBtn.click();
    window.renderPartsDbMasterTable();
  });
  await new Promise(r => setTimeout(r, 600));

  const masterDbUsageCol = await page.evaluate(() => {
    const table = document.getElementById('tablePartsMasterDb');
    const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const hasUsageTh = ths.some(t => t.includes('사용여부'));
    const firstRowButtons = table.querySelector('tbody tr')?.querySelectorAll('button')?.length || 0;
    return {
      hasUsageTh,
      firstRowButtons
    };
  });
  console.log('Master DB Usage Column Render:', JSON.stringify(masterDbUsageCol));
  if (!masterDbUsageCol.hasUsageTh) {
    throw new Error('Master DB table is missing the 사용여부 column');
  }

  console.log('\nTotal console errors during test:', errors.length);
  if (errors.length > 0) {
    console.error('Errors encountered:', errors);
    throw new Error(`Encountered ${errors.length} browser errors during test`);
  }

  console.log('\n>>> ALL MULTI-TENANT COMPANY AUTH & PART USAGE TESTS PASSED PERFECTLY! <<<');

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
