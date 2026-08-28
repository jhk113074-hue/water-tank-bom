const fs = require('fs');
const path = require('path');

global.window = global;
global.document = { getElementById: () => null };

const code = fs.readFileSync(path.join(__dirname, 'pallet_packing.js'), 'utf8');
eval(code);

const partsDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'parts_db.json'), 'utf8'));
window.partsDb = partsDb;

const pNos = ['DN20M', 'SL20S', 'BF20M', 'RF00N', 'RF00M', 'NF20BX', 'ST20SX', 'MFOOTX', 'RFOOTX'];
pNos.forEach(pNo => {
  const dims = window.PalletPacking.getPanelDimensions(pNo);
  console.log(`${pNo}:`, dims);
});
