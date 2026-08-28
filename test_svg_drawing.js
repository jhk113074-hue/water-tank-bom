const fs = require('fs');
const path = require('path');

global.window = global;
global.document = { getElementById: () => null };

// Load pallet_packing.js and visual_layer_stacking.js
const packCode = fs.readFileSync(path.join(__dirname, 'pallet_packing.js'), 'utf8');
eval(packCode);

const partsDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'parts_db.json'), 'utf8'));
window.partsDb = partsDb;

const stackCode = fs.readFileSync(path.join(__dirname, 'visual_layer_stacking.js'), 'utf8');
eval(stackCode);

const pallet = {
  id: 1,
  palletType: '1x2m',
  items: [
    { partNo: 'SL20S', qty: 8 },
    { partNo: 'DN20M', qty: 1 },
    { partNo: 'BF20M', qty: 3 },
    { partNo: 'RF00M', qty: 3 },
    { partNo: 'MF00M', qty: 1 }
  ]
};

const svg = window.VisualLayerStacking.renderPalletLayerDiagramContainer(pallet, { Ht: 80, Fh: 70, Ph: 150, limit: 2000 });
console.log('Generated SVG length:', svg.length);
fs.writeFileSync(path.join(__dirname, 'test_output.svg'), svg);
console.log('Saved test_output.svg');
