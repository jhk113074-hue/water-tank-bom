const assert = require('assert');

// Mock browser globals
global.window = {};

const Catalog = require('./panel_catalog.js');
const Catalog1x1 = require('./panel_catalog_1x1.js');
const CatalogPartitionAlt = require('./panel_catalog_partition_alt.js');
const Rules = require('./panel_rules.js');
const PanelEngine = require('./panel_engine.js');

console.log('Testing PanelEngine Independent Monolithic 0.5x1.5m & 0.5x2.0m Modes...');

// --- Test 1: 1.5mH Mono ONLY (2.0mH is Split) ---
const tank15 = { W: 3.5, L1: 3.0, L2: 0, L3: 0, L4: 0, H: 1.5, qty: 1 };
const res15Mono = PanelEngine.computePanelBomItems(tank15, p => ({ partNo: p, nameKo: p }), { half15Mode: 'monolithic', half20Mode: 'split' });
const hside15 = res15Mono.items.find(it => it.catalogKey === 'side.TOP_15.hside');
const qside15 = res15Mono.items.find(it => it.catalogKey === 'side.TOP_15.qside');
assert(hside15, '1.5mH hside should exist');
assert.strictEqual(qside15, undefined, '1.5mH qside should be omitted in mono15 mode');
assert(hside15.spec.includes('0.5x1.5m'), '1.5mH Spec should reflect 0.5x1.5m');

// In the same configuration (half15Mode: monolithic, half20Mode: split), a 2.0mH tank should be split:
const tank20 = { W: 3.5, L1: 3.0, L2: 0, L3: 0, L4: 0, H: 2.0, qty: 1 };
const res20Split = PanelEngine.computePanelBomItems(tank20, p => ({ partNo: p, nameKo: p }), { half15Mode: 'monolithic', half20Mode: 'split' });
const hsideA20Split = res20Split.items.find(it => it.catalogKey === 'side.TOP_20.hside_a');
const hsideB20Split = res20Split.items.find(it => it.catalogKey === 'side.TOP_20.hside_b');
assert(hsideA20Split, '2.0mH hside_a should exist in split mode');
assert(hsideB20Split, '2.0mH hside_b should exist in split mode');

// --- Test 2: 2.0mH Mono ONLY (1.5mH is Split) ---
const res15Split = PanelEngine.computePanelBomItems(tank15, p => ({ partNo: p, nameKo: p }), { half15Mode: 'split', half20Mode: 'monolithic' });
const hside15_2 = res15Split.items.find(it => it.catalogKey === 'side.TOP_15.hside');
const qside15_2 = res15Split.items.find(it => it.catalogKey === 'side.TOP_15.qside');
assert(hside15_2, '1.5mH hside should exist');
assert(qside15_2, '1.5mH qside should exist in split mode');

const res20Mono = PanelEngine.computePanelBomItems(tank20, p => ({ partNo: p, nameKo: p }), { half15Mode: 'split', half20Mode: 'monolithic' });
const hsideA20Mono = res20Mono.items.find(it => it.catalogKey === 'side.TOP_20.hside_a');
const hsideB20Mono = res20Mono.items.find(it => it.catalogKey === 'side.TOP_20.hside_b');
assert(hsideA20Mono, '2.0mH hside_a should exist in mono mode');
assert.strictEqual(hsideB20Mono, undefined, '2.0mH hside_b should be omitted in mono mode');
assert(hsideA20Mono.spec.includes('0.5x2.0m'), '2.0mH Spec should reflect 0.5x2.0m');

// --- Test 3: BOTH Monolithic (3.0mH tank which has TOP_20 + LOWER) ---
const tank30 = { W: 3.5, L1: 3.0, L2: 0, L3: 0, L4: 0, H: 3.0, qty: 1 };
const res30Mono = PanelEngine.computePanelBomItems(tank30, p => ({ partNo: p, nameKo: p }), { half15Mode: 'monolithic', half20Mode: 'monolithic' });
const hsideA30 = res30Mono.items.find(it => it.catalogKey === 'side.TOP_20.hside_a');
const hsideB30 = res30Mono.items.find(it => it.catalogKey === 'side.TOP_20.hside_b');
assert(hsideA30, '3.0mH hside_a should exist');
assert.strictEqual(hsideB30, undefined, '3.0mH hside_b should be omitted');

console.log('ALL INDEPENDENT 0.5x1.5m & 0.5x2.0m TESTS PASSED!');
