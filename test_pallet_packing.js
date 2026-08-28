const fs = require('fs');
const path = require('path');

// Mock browser globals for node testing
global.window = global;
global.document = {
  getElementById: (id) => {
    if (id === 'packHt') return { value: '80' };
    if (id === 'packFh') return { value: '70' };
    if (id === 'packPh') return { value: '150' };
    if (id === 'packLimit') return { value: '2000' };
    if (id === 'packScenarioSelect') return { value: 'AUTO' };
    if (id === 'tankLength1') return { value: '2' };
    if (id === 'tankWidth') return { value: '2' };
    if (id === 'tankHeight') return { value: '2' };
    return null;
  }
};

// Require pallet_packing.js
const code = fs.readFileSync(path.join(__dirname, 'pallet_packing.js'), 'utf8');
eval(code);

// Mock BOM panel items for 2m x 2m x 2m tank
const testBomItems = [
  { partNo: 'DN20M', category: 'Panel', qty: 1, partName: 'Bottom Nozzle Panel 1x2m' },
  { partNo: 'SL20S', category: 'Panel', qty: 8, partName: 'Side Panel 1x2m' },
  { partNo: 'BF20M', category: 'Panel', qty: 3, partName: 'Bottom Panel 1x1m' },
  { partNo: 'RF00N', category: 'Panel', qty: 3, partName: 'Roof Panel 1x1m' },
  { partNo: 'RF00M', category: 'Panel', qty: 1, partName: 'Roof Manhole Panel 1x1m' }
];

window.bomItems = testBomItems;

console.log('Running Auto Packing for 2m x 2m x 2m tank...');
if (window.PalletPacking && window.PalletPacking.runAutoPack) {
  window.PalletPacking.runAutoPack();
}

const pallets = window.PalletPacking.getPallets();
console.log(`\nResult: ${pallets.length} Pallet(s) generated!`);
pallets.forEach((p, idx) => {
  console.log(`\n--- Pallet #${idx + 1} (${p.palletType}) ---`);
  console.log(`Items count: ${p.items.length}`);
  p.items.forEach(it => console.log(`  - ${it.partNo}: ${it.qty} pcs`));
});
