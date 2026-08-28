const PalletPacking = require('./pallet_packing.js');
const fs = require('fs');

// Mock partsDb
global.partsDb = [
  { partNo: 'SL20S', width: 1000, length: 2000, fh: 70, weight: 25 },
  { partNo: 'SL20SL', width: 1000, length: 2000, fh: 70, weight: 25 },
  { partNo: 'SL20SR', width: 1000, length: 2000, fh: 70, weight: 25 },
  { partNo: 'ST20HUB5', width: 1000, length: 1915, fh: 70, weight: 25 },
  { partNo: 'BF20M', width: 1000, length: 1000, fh: 70, weight: 15 },
  { partNo: 'BF20P', width: 1000, length: 1000, fh: 70, weight: 15 },
  { partNo: 'RF00', width: 1000, length: 1000, fh: 60, weight: 12 },
  { partNo: 'MF00M', width: 1000, length: 1000, fh: 60, weight: 12 },
  { partNo: 'DN20M', width: 1000, length: 1000, fh: 70, weight: 15 }
];

const pendingList = [
  { partNo: 'SL20S', totalQty: 6, pendingQty: 6 },
  { partNo: 'SL20SL', totalQty: 1, pendingQty: 1 },
  { partNo: 'SL20SR', totalQty: 1, pendingQty: 1 },
  { partNo: 'ST20HUB5', totalQty: 2, pendingQty: 2 },
  { partNo: 'BF20M', totalQty: 1, pendingQty: 1 },
  { partNo: 'BF20P', totalQty: 2, pendingQty: 2 },
  { partNo: 'RF00', totalQty: 2, pendingQty: 2 },
  { partNo: 'MF00M', totalQty: 2, pendingQty: 2 },
  { partNo: 'DN20M', totalQty: 1, pendingQty: 1 }
];

console.log('Allowed pallet types:', PalletPacking.getProjectAllowedPalletTypes(pendingList));

const Ht = 80, Fh = 70, Ph = 150, limit = 2000;
const resA = PalletPacking.executeScenarioEngine('A', JSON.parse(JSON.stringify(pendingList)), Ht, Fh, Ph, limit);
console.log('=== Scenario A Result ===');
console.log('Pallet Count:', resA.pallets.length);
resA.pallets.forEach((p, idx) => {
  console.log(`Pallet #${idx+1} (${p.palletType}):`, p.items);
});
console.log('Leftover:', resA.pendingList.filter(i => i.pendingQty > 0));

const resC = PalletPacking.executeScenarioEngine('C', JSON.parse(JSON.stringify(pendingList)), Ht, Fh, Ph, limit);
console.log('=== Scenario C Result ===');
console.log('Pallet Count:', resC.pallets.length);
resC.pallets.forEach((p, idx) => {
  console.log(`Pallet #${idx+1} (${p.palletType}):`, p.items);
});
