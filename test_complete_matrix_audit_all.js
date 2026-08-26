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
    server.listen(8260, () => resolve(server));
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

  const artifactDir = 'C:\\Users\\jhk01\\.gemini\\antigravity\\brain\\b4515719-662a-4aca-803d-9f2255e9e562\\.user_uploaded';

  await page.goto('http://localhost:8260/#steel-accessories/almuftah/int/int_side/4.5m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  const auditResults = await page.evaluate(() => {
    const companies = ['YSACC (Default)', 'HAYOUNG', 'MNT', 'WATANI', 'ALMUFTAH'];
    const diagrams = [
      { id: 'int_side', title: '1. INT(GenSide)', opt: 1 },
      { id: 'int_side_1x1', title: '2. INT(Side_1m_O)', opt: 2 },
      { id: 'int_partition_1', title: '3. INT(GenPart)', opt: 3 },
      { id: 'int_partition_2', title: '4. INT(PART_1m_O)', opt: 4 },
      { id: 'ext_side', title: '5. EXT(GenSide)', opt: 1 },
      { id: 'ext_side_1x1', title: '6. EXT(1x1m)', opt: 2 }
    ];
    const heights = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];

    const summary = { totalTested: 0, passed: 0, failed: 0, details: [] };

    companies.forEach(company => {
      diagrams.forEach(diag => {
        heights.forEach(hStr => {
          summary.totalTested++;
          try {
            const struct = window.SteelAccessories.getMatrixPanelStructure(diag, hStr, company);
            const H = parseFloat(hStr);

            if (!struct || !Array.isArray(struct.sections) || struct.sections.length === 0) {
              throw new Error(`Empty sections for ${company} ${diag.title} ${hStr}mH`);
            }

            // Verify that all sections are within [0, H] and cover columns [0, 1], [1, 1.5], [1.5, 2.5]
            const colCoverage = { 0: 0, 1: 0, 2: 0 };
            struct.sections.forEach(sec => {
              const x1 = sec.xRange[0], x2 = sec.xRange[1];
              const y1 = sec.yRange[0], y2 = sec.yRange[1];

              if (y1 < -0.001 || y2 > H + 0.001 || y1 >= y2) {
                throw new Error(`Invalid yRange [${y1}, ${y2}] for H=${H}`);
              }

              const len = y2 - y1;
              if (x1 === 0 && x2 === 1) colCoverage[0] += len;
              else if (x1 === 1 && x2 === 1.5) colCoverage[1] += len;
              else if (x1 === 1.5 && x2 === 2.5) colCoverage[2] += len;
            });

            // Each column must sum up to H
            ['0', '1', '2'].forEach(c => {
              if (Math.abs(colCoverage[c] - H) > 0.01) {
                throw new Error(`Column ${c} coverage ${colCoverage[c]} !== H=${H}`);
              }
            });

            // Specific check for OP1 top pillow:
            if (diag.opt === 1 && (hStr === '1.5' || hStr === '2.5' || hStr === '3.5' || hStr === '4.5')) {
              const topPillowL = struct.sections.find(s => s.xRange[0] === 0 && s.xRange[1] === 1 && Math.abs(s.yRange[1] - H) < 0.01);
              if (!topPillowL || Math.abs((topPillowL.yRange[1] - topPillowL.yRange[0]) - 1.5) > 0.01) {
                throw new Error(`Top 1.5m Pillow panel on Left column not 1.5m high! Found: ${topPillowL ? (topPillowL.yRange[1] - topPillowL.yRange[0]) : 'none'}`);
              }
            }

            if (diag.opt === 1 && (hStr === '2' || hStr === '3' || hStr === '4' || hStr === '5')) {
              const topPillowL = struct.sections.find(s => s.xRange[0] === 0 && s.xRange[1] === 1 && Math.abs(s.yRange[1] - H) < 0.01);
              if (!topPillowL || Math.abs((topPillowL.yRange[1] - topPillowL.yRange[0]) - 2.0) > 0.01) {
                throw new Error(`Top 2.0m Pillow panel on Left column not 2.0m high! Found: ${topPillowL ? (topPillowL.yRange[1] - topPillowL.yRange[0]) : 'none'}`);
              }
            }

            summary.passed++;
          } catch (err) {
            summary.failed++;
            summary.details.push({ company, diag: diag.title, hStr, error: err.message });
          }
        });
      });
    });

    return summary;
  });

  console.log('=== FULL EXHAUSTIVE AUDIT RESULT ===', auditResults);
  if (auditResults.failed > 0) {
    console.error('FAILED CASES:', auditResults.details);
    throw new Error(`Exhaustive audit failed with ${auditResults.failed} errors!`);
  }

  // Take screenshot of ALMUFTAH 4.5mH
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('int_side');
    window.SteelAccessories.switchHeightSheet('4.5');
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'test_complete_audit_4_5m.png') });

  // Take screenshot of ALMUFTAH 2mH
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('int_side');
    window.SteelAccessories.switchHeightSheet('2');
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'test_complete_audit_2m.png') });

  // Take screenshot of ALMUFTAH 3.5mH
  await page.evaluate(() => {
    window.SteelAccessories.switchDiagramTab('int_side');
    window.SteelAccessories.switchHeightSheet('3.5');
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'test_complete_audit_3_5m.png') });

  await browser.close();
  server.close();
  console.log(`TOTAL TESTED: ${auditResults.totalTested} | PASSED: ${auditResults.passed} | FAILED: ${auditResults.failed}`);
  console.log('100% FULL EXHAUSTIVE VERIFICATION COMPLETED WITH 0 ERRORS!');
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
