const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startLocalServer(port = 8299) {
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
    server.listen(port, () => resolve(server));
  });
}

async function runTest() {
  console.log('=== Starting E2E Verification: Startup Login Window & ALMUFTAH Insulation Naming ===');
  const server = await startLocalServer(8299);
  console.log('Local test server running on port 8299');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disk-cache-size=1']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', err => console.error('Browser Page Error:', err.message));
    page.on('console', msg => {
      const txt = msg.text();
      if (msg.type() === 'error' || txt.includes('[CompanyAuth]') || txt.includes('login') || txt.includes('Login')) {
        console.log('Browser Console:', txt);
      }
    });

    // Clean session
    await page.goto('http://localhost:8299/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.removeItem('water_tank_company_remember_login_v1');
      localStorage.removeItem('water_tank_company_session_v1');
    });

    // Reload page to simulate a fresh visit
    await page.goto('http://localhost:8299/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    // Test 1: Verify Startup Login Modal is Visible
    const modalDisplay = await page.evaluate(() => {
      const modal = document.getElementById('companyLoginModal');
      return modal ? window.getComputedStyle(modal).display : 'null';
    });
    console.log(`1. Initial Startup Login Modal display: ${modalDisplay} (expected flex)`);
    if (modalDisplay !== 'flex') {
      throw new Error(`Expected companyLoginModal display to be "flex" on startup, got "${modalDisplay}"`);
    }

    // Verify 5 company cards exist in modal
    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.comp-login-card').length;
    });
    console.log(`2. Company login cards rendered: ${cardCount} (expected 5)`);
    if (cardCount !== 5) {
      throw new Error(`Expected 5 company cards, found ${cardCount}`);
    }

    // Take screenshot of Startup Login Modal
    await page.screenshot({ path: path.resolve(__dirname, 'startup_login_window.png') });
    console.log('Saved screenshot: startup_login_window.png');

    // Test 2: Click ALMUFTAH company card
    await page.evaluate(() => {
      window.CompanyAuth.selectCompanyCard('almuftah');
    });

    const selectedVal = await page.evaluate(() => {
      return document.getElementById('companyLoginSelect').value;
    });
    console.log(`3. Selected company in select: ${selectedVal} (expected almuftah)`);
    if (selectedVal !== 'almuftah') {
      throw new Error(`Expected almuftah, got ${selectedVal}`);
    }

    // Fill password using quick fill button and login
    await page.evaluate(() => {
      window.CompanyAuth.fillDefaultPassword();
      window.CompanyAuth.submitLoginModal();
    });

    // Wait for modal to close
    await new Promise(r => setTimeout(r, 300));
    const modalDisplayAfterLogin = await page.evaluate(() => {
      const modal = document.getElementById('companyLoginModal');
      return modal ? window.getComputedStyle(modal).display : 'null';
    });
    console.log(`4. Modal display after login: ${modalDisplayAfterLogin} (expected none)`);
    if (modalDisplayAfterLogin !== 'none') {
      throw new Error(`Expected modal to close after login, but display is ${modalDisplayAfterLogin}`);
    }

    // Verify current company is almuftah
    const curCompId = await page.evaluate(() => {
      return window.CompanyAuth.getCurrentCompanyId();
    });
    console.log(`5. Active Company ID: ${curCompId} (expected almuftah)`);
    if (curCompId !== 'almuftah') {
      throw new Error(`Expected almuftah, got ${curCompId}`);
    }

    // Test 3: Verify ALMUFTAH Insulation Naming Convention
    const insulationResult = await page.evaluate(() => {
      // 1. Set 25mm insulation
      const insSelect = document.getElementById('insulationType');
      if (insSelect) {
        insSelect.value = 'Insulated(25mm)';
        insSelect.dispatchEvent(new Event('change'));
      }
      if (typeof window.recalculateBOM === 'function') {
        window.recalculateBOM();
      }

      const panelItemsIns = (window.bomItems || []).filter(item => item && ((item.category && item.category.toUpperCase().includes('PANEL')) || (item.partNo && item.partNo.startsWith('K'))));
      const firstPanelIns = panelItemsIns[0];

      // 2. Set non-insulated
      if (insSelect) {
        insSelect.value = 'Non-Insulated';
        insSelect.dispatchEvent(new Event('change'));
      }
      if (typeof window.recalculateBOM === 'function') {
        window.recalculateBOM();
      }

      const panelItemsNon = (window.bomItems || []).filter(item => item && ((item.category && item.category.toUpperCase().includes('PANEL')) || (item.partNo && item.partNo.startsWith('K'))));
      const firstPanelNon = panelItemsNon[0];

      return {
        insulatedPartNo: firstPanelIns ? firstPanelIns.partNo : null,
        hasInsSuffix: firstPanelIns ? firstPanelIns.partNo.includes('INS') : false,
        nonInsulatedPartNo: firstPanelNon ? firstPanelNon.partNo : null,
        hasNoInsSuffix: firstPanelNon ? !firstPanelNon.partNo.includes('INS') : true
      };
    });

    console.log(`6. Insulation BOM Test Result:`, JSON.stringify(insulationResult, null, 2));
    if (!insulationResult.hasInsSuffix) {
      throw new Error(`Expected insulated panel partNo to have "INS", got: ${insulationResult.insulatedPartNo}`);
    }
    if (!insulationResult.hasNoInsSuffix) {
      throw new Error(`Expected non-insulated panel partNo to NOT have "INS", got: ${insulationResult.nonInsulatedPartNo}`);
    }

    // Take screenshot of ALMUFTAH workspace with BOM
    await page.screenshot({ path: path.resolve(__dirname, 'almuftah_workspace_bom.png') });
    console.log('Saved screenshot: almuftah_workspace_bom.png');

    // Test 4: Logout Test
    await page.evaluate(() => {
      window.CompanyAuth.logout();
    });
    await new Promise(r => setTimeout(r, 200));

    const modalDisplayAfterLogout = await page.evaluate(() => {
      const modal = document.getElementById('companyLoginModal');
      return modal ? window.getComputedStyle(modal).display : 'null';
    });
    console.log(`7. Modal display after logout: ${modalDisplayAfterLogout} (expected flex)`);
    if (modalDisplayAfterLogout !== 'flex') {
      throw new Error(`Expected login modal to show after logout, got ${modalDisplayAfterLogout}`);
    }

    console.log('=== ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED ===');
  } finally {
    await browser.close();
    server.close();
  }
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
