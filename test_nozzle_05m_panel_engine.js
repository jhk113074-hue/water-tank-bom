const assert = require('assert');

// Mock browser globals
global.window = {};

const Catalog = require('./panel_catalog.js');
const Catalog1x1 = require('./panel_catalog_1x1.js');
const CatalogPartitionAlt = require('./panel_catalog_partition_alt.js');
const Rules = require('./panel_rules.js');
const PanelEngine = require('./panel_engine.js');

console.log('Testing PanelEngine Nozzle 0.5m x 2EA Mode...');

const tank = { W: 4, L1: 5, L2: 0, L3: 0, L4: 0, H: 3, qty: 1 };

// 1. Standard 1m mode
const res1m = PanelEngine.computePanelBomItems(tank, (partNo) => ({ partNo, nameKo: partNo }), { nozzlePanelMode: '1m' });
const nozzle1m = res1m.items.find(it => it.catalogKey === 'side.LOWER.side_nozzle');
console.log('1m mode nozzle item:', nozzle1m);
assert(nozzle1m, 'Nozzle panel must exist in 1m mode');
assert.strictEqual(nozzle1m.qty, 1, 'Nozzle qty should be 1 in 1m mode');

// 2. 0.5m x 2EA mode
const res05m = PanelEngine.computePanelBomItems(tank, (partNo) => ({ partNo, nameKo: partNo }), { nozzlePanelMode: '0.5m_x2' });
const nozzle05m = res05m.items.find(it => it.catalogKey === 'side.LOWER.side_nozzle');
console.log('0.5m_x2 mode nozzle item:', nozzle05m);
assert(nozzle05m, 'Nozzle panel must exist in 0.5m_x2 mode');
assert.strictEqual(nozzle05m.qty, 2, 'Nozzle qty should be doubled (2) in 0.5m_x2 mode');
assert(nozzle05m.spec.includes('0.5m x 2EA'), 'Spec should reflect 0.5m x 2EA');

// 3. Sealing Tape
const tape1m = PanelEngine.sealingTapeDetail(tank, { nozzlePanelMode: '1m' });
const tape05m = PanelEngine.sealingTapeDetail(tank, { nozzlePanelMode: '0.5m_x2' });
console.log('Sealing tape 1m mode total meters:', tape1m.totalMeters);
console.log('Sealing tape 0.5m_x2 mode total meters:', tape05m.totalMeters);
assert(tape05m.totalMeters > tape1m.totalMeters, 'Sealing tape total meters should increase for extra 0.5m joint seam');

console.log('ALL PANEL ENGINE NOZZLE 0.5m TESTS PASSED!');
