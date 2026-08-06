const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log("Navigating to the deployed site...");
  await page.goto('https://jhk113074-hue.github.io/water-tank-bom/');
  
  // Wait for the version badge
  await page.waitForSelector('.version-badge', { timeout: 10000 }).catch(() => null);
  
  // Actually, wait, the version badge doesn't have a class in the DOM!
  // I noticed earlier it was <span style="...">v=4.40.29</span>
  // Let's just find the text containing "v="
  const versionElement = await page.evaluate(() => {
    const h1 = document.getElementById('headerTitle');
    if (!h1) return null;
    const spans = h1.getElementsByTagName('span');
    for (let span of spans) {
      if (span.innerText.includes('v=')) {
        return span.innerText;
      }
    }
    return null;
  });
  
  console.log("Found Version Badge:", versionElement);
  
  // Also check if the layout changes are there (e.g. no L4_H1_OUT)
  // Let's click on 1.5mH tab
  // First wait for the diagrams to load
  await page.waitForTimeout(2000);
  
  console.log("Script finished.");
  await browser.close();
})();
