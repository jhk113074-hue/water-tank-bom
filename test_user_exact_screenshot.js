const fs = require('fs');
const path = require('path');

global.window = global;
global.document = { getElementById: () => null };

const code = fs.readFileSync(path.join(__dirname, 'pallet_packing.js'), 'utf8');
eval(code);

const partsDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'parts_db.json'), 'utf8'));
window.partsDb = partsDb;

// Overwrite partsDb to match user screenshot dimensions
const dn = partsDb.find(p => p.partNo === 'DN20M');
if (dn) { dn.w = 1000; dn.l = 1000; }
const bf = partsDb.find(p => p.partNo === 'BF20M');
if (bf) { bf.w = 1000; bf.l = 1000; }

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

console.log('--- Testing Pallet Tier Grouping for User Screenshot ---');
const tiers = window.PalletPacking.expandPalletItemsToTiers(pallet);
const grouped = window.PalletPacking.groupConsecutiveTiers(tiers);
grouped.forEach((g) => {
  const tierStr = g.startTier === g.endTier ? `${g.startTier}단` : `${g.startTier}~${g.endTier}단`;
  const subStr = g.accumulatedSubItems.map(s => `${s.partNo} x${s.qty}`).join(' + ');
  console.log(`[${tierStr}] ${subStr} (total: ${g.totalTierPcs} pcs, isTopmost: ${g.isTopmost})`);
});
