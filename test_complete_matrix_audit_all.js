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
    server.listen(8261, () => resolve(server));
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

  await page.goto('http://localhost:8261/#steel-accessories/almuftah/int/int_side/4.5m', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // 1. Audit all 8 diagrams x 5 companies x 9 heights = 360 combinations
  const auditResults = await page.evaluate(() => {
    const companies = ['YSACC (Default)', 'HAYOUNG', 'MNT', 'WATANI', 'ALMUFTAH'];
    const diagrams = [
      { id: 'int_side', title: '1. INT(GenSide)', opt: 1 },
      { id: 'int_side_1x1', title: '2. INT(Side_1m_O)', opt: 2 },
      { id: 'int_partition_1', title: '3. INT(GenPart)', opt: 3 },
      { id: 'int_partition_2', title: '4. INT(PART_1m_O)', opt: 4 },
      { id: 'ext_side', title: '5. EXT(GenSide)', opt: 1 },
      { id: 'ext_side_1x1', title: '6. EXT(Side_1m_O)', opt: 2 },
      { id: 'ext_partition', title: '7. EXT(GenPart)', opt: 3 },
      { id: 'ext_partition_1m', title: '8. EXT(PART_1m_O)', opt: 4 }
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

            ['0', '1', '2'].forEach(c => {
              if (Math.abs(colCoverage[c] - H) > 0.01) {
                throw new Error(`Column ${c} coverage ${colCoverage[c]} !== H=${H}`);
              }
            });

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

  console.log('=== FULL EXHAUSTIVE 8-DIAGRAM AUDIT RESULT ===', auditResults);
  if (auditResults.failed > 0) {
    console.error('FAILED CASES:', auditResults.details);
    throw new Error(`Exhaustive audit failed with ${auditResults.failed} errors!`);
  }

  // 2. Test UI External Reinforcement Mapping Table
  await page.evaluate(() => {
    window.SteelAccessories.setReinfOptionViewMode('ext');
  });
  await new Promise(r => setTimeout(r, 1000));

  const extTableData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.sa-option-mapping-bar tbody tr'));
    const rowLabels = rows.map(r => r.querySelector('td')?.innerText.trim());
    return {
      rowCount: rows.length,
      rowLabels: rowLabels
    };
  });

  console.log('=== External Mapping Table UI Check ===', extTableData);
  if (extTableData.rowCount !== 2 || !extTableData.rowLabels.some(l => l.includes('칸막이') || l.includes('Part'))) {
    throw new Error('External Mapping Table must have 2 rows including External Partition!');
  }

  // 3. Test quick buttons in External mode
  await page.evaluate(() => {
    window.SteelAccessories.setAllHeightOption('extPart', 'ext_partition_1m');
  });
  await new Promise(r => setTimeout(r, 800));

  const verifyUpdatedOpts = await page.evaluate(() => {
    const opts = window.SteelAccessories.getPartyOptions('ALMUFTAH');
    return opts.extPart;
  });

  console.log('=== Verified ALMUFTAH extPart options ===', verifyUpdatedOpts);
  if (verifyUpdatedOpts['4.5'] !== 'ext_partition_1m') {
    throw new Error('extPart update failed to set 4.5m to ext_partition_1m!');
  }

  // Capture screenshot of External Mode Mapping Table
  await page.screenshot({ path: path.join(artifactDir, 'test_ext_reinf_partition_mapping_verified.png') });
  console.log('Saved screenshot test_ext_reinf_partition_mapping_verified.png');

  await browser.close();
  server.close();
  console.log(`TOTAL TESTED: ${auditResults.totalTested} | PASSED: ${auditResults.passed} | FAILED: ${auditResults.failed}`);
  console.log('ALL EXTERNAL REINFORCEMENT & PARTITION TESTS PASSED WITH 100% SUCCESS!');
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
