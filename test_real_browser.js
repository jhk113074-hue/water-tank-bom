const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function testRealBrowser() {
  console.log('Launching real Chrome browser UI test...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log('Navigating to https://water-tank-bom.web.app/#sealing-tape/ysacc ...');
  await page.goto('https://water-tank-bom.web.app/#sealing-tape/ysacc', { waitUntil: 'domcontentloaded', timeout: 15000 });

  await new Promise(r => setTimeout(r, 2500));

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  // Screenshot 1: Initial load
  await page.screenshot({ path: path.join(artifactDir, 'browser_test_1_initial.png') });
  console.log('Screenshot 1 captured: browser_test_1_initial.png');

  // Click WATANI Spec button via evaluate
  console.log('Clicking WATANI Spec button in real Chrome...');
  const clickedWatani = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent.includes('WATANI Spec'));
    if (target) {
      target.click();
      return true;
    }
    return false;
  });

  console.log('Clicked WATANI Spec:', clickedWatani);
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(artifactDir, 'browser_test_2_watani_clicked.png') });
  console.log('Screenshot 2 captured: browser_test_2_watani_clicked.png');

  // Switch tab to BOM INPUT
  console.log('Clicking BOM INPUT tab in real Chrome...');
  await page.evaluate(() => {
    const bomTab = document.querySelector('.tab-btn[data-tab="tab-bom"]');
    if (bomTab) bomTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'browser_test_3_bom_tab.png') });
  console.log('Screenshot 3 captured: browser_test_3_bom_tab.png');

  // Switch back to SEALING TAPE MASTER tab
  console.log('Clicking SEALING TAPE MASTER tab in real Chrome...');
  await page.evaluate(() => {
    const stTab = document.querySelector('.tab-btn[data-tab="tab-sealing-tape-master"]');
    if (stTab) stTab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'browser_test_4_returned_to_st_master.png') });
  console.log('Screenshot 4 captured: browser_test_4_returned_to_st_master.png');

  await browser.close();
  console.log('Chrome Browser automated test complete!');
}

testRealBrowser().catch(err => {
  console.error('Browser Test Error:', err);
  process.exit(1);
});
