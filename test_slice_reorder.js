const assert = require('assert');

// Mock browser globals
global.window = {
  selectedCustomerPresetId: 'test_cust',
  setCustomerMatrixStorage: (c, o, m) => {
    console.log(`Saved matrix for ${c} opt ${o} (${m.length} rows)`);
  }
};
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); }
};

const Catalog1x1 = require('./panel_catalog_1x1.js');
const PanelSvgDiagram = require('./panel_svg_diagram.js');

console.log('Testing Panel Slice Reordering Engine...');

// Build initial dummy panelMatrix with side1x1 rows
const blankGrades = { '1mH': '', '1.5mH': '', '2mH': '', '2.5mH': '', '3mH': '', '3.5mH': '', '4mH': '', '4.5mH': '', '5mH': '' };
const panelMatrix = [];

Object.keys(Catalog1x1.SIDE_1X1_BY_HEIGHT).forEach(h => {
  const slices = Catalog1x1.SIDE_1X1_BY_HEIGHT[h];
  slices.forEach((slice, i) => {
    const label = h + 'mH · Slice ' + (i + 1) + '/' + slices.length + ' (' + slice.sizeM + 'm)';
    const wideGrades = Object.assign({}, blankGrades);
    wideGrades[h + 'mH'] = slice.wide;
    const sliceKey = 'side1x1.' + h + '.slice' + i;
    panelMatrix.push({
      key: sliceKey + '.wide', section: 'side1x1', role: 'wide', slot: sliceKey + '.wide',
      heightKey: h, sliceKey: 'slice' + i, isVariant: false, label: label, heightGrades: wideGrades
    });
    const narrowGrades = Object.assign({}, blankGrades);
    narrowGrades[h + 'mH'] = slice.narrow;
    panelMatrix.push({
      key: sliceKey + '.narrow', section: 'side1x1', role: 'narrow', slot: sliceKey + '.narrow',
      heightKey: h, sliceKey: 'slice' + i, isVariant: false, label: label, heightGrades: narrowGrades
    });
  });
});

global.panelMatrix = panelMatrix;
global.sideMatrixOption = 2;
global.optionMatrixStorage = { 2: panelMatrix };

// Require app.js logic simulated
function reorderPanelSlices(hFloat, fromIdx, toIdx) {
  const hStr = String(hFloat);
  const numSlices = (hFloat === 1.5) ? 2 : (hFloat === 2.5) ? 3 : (hFloat === 3.5) ? 4 : (hFloat === 4.5) ? 5 : 1;
  const sliceRows = [];
  for (let i = 0; i < numSlices; i++) {
    const prefix = `side1x1.${hStr}.slice${i}.`;
    const wideRow = panelMatrix.find(r => r.key === prefix + 'wide');
    const narrowRow = panelMatrix.find(r => r.key === prefix + 'narrow');
    let sizeM = 1.0;
    if (wideRow && wideRow.label) {
      const match = wideRow.label.match(/\(([\d\.]+)m\)/);
      if (match) sizeM = parseFloat(match[1]);
    } else if (i === numSlices - 1 && hStr.includes('.5')) {
      sizeM = 0.5;
    }
    sliceRows.push({
      sizeM: sizeM,
      wide: wideRow ? wideRow.heightGrades[hStr + 'mH'] : '',
      narrow: narrowRow ? narrowRow.heightGrades[hStr + 'mH'] : ''
    });
  }

  const moved = sliceRows.splice(fromIdx, 1)[0];
  sliceRows.splice(toIdx, 0, moved);

  for (let i = 0; i < numSlices; i++) {
    const prefix = `side1x1.${hStr}.slice${i}.`;
    const slice = sliceRows[i];
    const newLabel = `${hStr}mH · Slice ${i + 1}/${numSlices} (${slice.sizeM}m)`;
    const wideRow = panelMatrix.find(r => r.key === prefix + 'wide');
    if (wideRow) { wideRow.heightGrades[hStr + 'mH'] = slice.wide; wideRow.label = newLabel; }
    const narrowRow = panelMatrix.find(r => r.key === prefix + 'narrow');
    if (narrowRow) { narrowRow.heightGrades[hStr + 'mH'] = slice.narrow; narrowRow.label = newLabel; }
  }
}

// Initial 1.5mH state: Slice 0 is 1m (SF20LX), Slice 1 is 0.5m (NH10HN)
const w0Before = panelMatrix.find(r => r.key === 'side1x1.1.5.slice0.wide');
const w1Before = panelMatrix.find(r => r.key === 'side1x1.1.5.slice1.wide');
assert.strictEqual(w0Before.heightGrades['1.5mH'], 'SF20LX');
assert.strictEqual(w1Before.heightGrades['1.5mH'], 'NH10HN');

// Move Slice 1 (0.5m top) to Slice 0 (0.5m bottom)
reorderPanelSlices(1.5, 1, 0);

const w0After = panelMatrix.find(r => r.key === 'side1x1.1.5.slice0.wide');
const w1After = panelMatrix.find(r => r.key === 'side1x1.1.5.slice1.wide');
console.log('1.5mH Slice 0 after move:', w0After.label, w0After.heightGrades['1.5mH']);
console.log('1.5mH Slice 1 after move:', w1After.label, w1After.heightGrades['1.5mH']);

assert(w0After.label.includes('0.5m'), 'Slice 0 must now be 0.5m');
assert.strictEqual(w0After.heightGrades['1.5mH'], 'NH10HN', 'Slice 0 must now have the 0.5m part NH10HN');
assert(w1After.label.includes('1m'), 'Slice 1 must now be 1m');
assert.strictEqual(w1After.heightGrades['1.5mH'], 'SF20LX', 'Slice 1 must now have the 1m part SF20LX');

console.log('ALL SLICE REORDERING TESTS PASSED!');
