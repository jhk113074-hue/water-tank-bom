const assert = require('assert');

// Test 1: PartNaming module
require('./part_naming.js');
console.log('Testing PartNaming...');
const pn = global.PartNaming;
assert(pn, 'PartNaming must exist');
const parties = pn.listParties();
console.log('Parties in PartNaming:', parties);
assert(parties.includes('YSACC (Default)'), 'Must include YSACC (Default)');
assert(parties.includes('MNT'), 'Must include MNT');
assert(parties.includes('WATANI'), 'Must include WATANI');
assert(parties.includes('HAYOUNG'), 'Must include HAYOUNG');
assert(parties.includes('ALMUFTAH'), 'Must include ALMUFTAH');

pn.setActiveParty('HAYOUNG');
assert.strictEqual(pn.activeParty(), 'HAYOUNG', 'Active party must be HAYOUNG');

console.log('Testing Steel Accessories build...');
const PanelSvgDiagram = require('./panel_svg_diagram.js');
assert(PanelSvgDiagram, 'PanelSvgDiagram must exist');

console.log('ALL STEEL ACCESSORIES & COMPANY PRESET SYNC TESTS PASSED!');
