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

const code = fs.readFileSync(path.join(__dirname, 'pallet_packing.js'), 'utf8');
eval(code);

const pallet = {
  palletType: '1x2m',
  items: [
    { partNo: 'DN20M', qty: 1 },
    { partNo: 'SL20S', qty: 8 },
    { partNo: 'BF20M', qty: 3 },
    { partNo: 'RF00N', qty: 3 },
    { partNo: 'RF00M', qty: 1 }
  ]
};

console.log('--- Current Tiers in expandPalletItemsToTiers ---');
const tiers = window.PalletPacking.expandPalletItemsToTiers(pallet);
tiers.forEach((t, idx) => {
  const subStr = t.subItems.map(s => `${s.partNo} x${s.qty}`).join(' + ');
  console.log(`Tier ${idx + 1}: ${subStr} (totalQty: ${t.totalQty}, isFull: ${t.isFull})`);
});
