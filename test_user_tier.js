const fs = require('fs');
const path = require('path');

global.window = global;
global.document = { getElementById: () => null };

const code = fs.readFileSync(path.join(__dirname, 'pallet_packing.js'), 'utf8');
eval(code);

// Test pallet matching user screenshot
const pallet = {
  palletType: '1x2m',
  items: [
    { partNo: 'SL20S', qty: 8 },
    { partNo: 'DN20M', qty: 1 },
    { partNo: 'BF20M', qty: 3 },
    { partNo: 'RF00M', qty: 3 },
    { partNo: 'MF00M', qty: 1 }
  ]
};

console.log('--- Testing Tier Expansion for User Screenshot Configuration ---');
const tiers = window.PalletPacking.expandPalletItemsToTiers(pallet);
tiers.forEach((t, idx) => {
  const subStr = t.subItems.map(s => `${s.partNo} x${s.qty}`).join(' + ');
  console.log(`Tier ${idx + 1}: ${subStr} (totalQty: ${t.totalQty}, isFull: ${t.isFull})`);
});
