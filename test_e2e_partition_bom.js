// test_e2e_partition_bom.js
const fs = require('fs');
const assert = require('assert');

// Mock DOM & global
const partsDb = JSON.parse(fs.readFileSync('parts_db.json', 'utf8'));

global.window = global;
global.partsDb = partsDb;
global.localStorage = {
  store: {},
  getItem: function(k) { return this.store[k] || null; },
  setItem: function(k, v) { this.store[k] = String(v); },
  removeItem: function(k) { delete this.store[k]; }
};

// Require core engines
require('./panel_rules.js');
require('./panel_catalog.js');
require('./panel_catalog_1x1.js');
require('./panel_catalog_partition_alt.js');
require('./rule_engine.js');
const PanelEngine = require('./panel_engine.js');
require('./accessories_engine.js');
require('./insulation_naming_map.js');
require('./rule_editor.js');

// Mock getActiveCustomerPresetObj
global.getActiveCustomerPresetObj = () => ({
  id: 'almuftah',
  name: 'ALMUFTAH',
  defaultSuffix: ' INS'
});
InsulationNamingMap.setDefaultSuffix(' INS', 'almuftah');

// Emulate PanelEngine.computePanelBomItems for a partitioned tank: W=2, L1=2, L2=2 (partitioned), H=2
const geom = { W: 2, L1: 2, L2: 2, L3: 0, L4: 0, H: 2, qty: 1 };
const lookupPart = (pNo) => partsDb.find(p => p.partNo === pNo) || { partNo: pNo, nameEn: pNo, price: 100, priceInsulated: 150 };

const engineResult = PanelEngine.computePanelBomItems(
  geom,
  (catalogKey, fallbackRole, roleLabel, courseLabel, scope, geom) => {
    // Basic resolver
    return { partNo: 'MF00TX', nameEn: roleLabel, price: 100, priceInsulated: 150 };
  },
  { sidePanelOnly: 'DEFAULT', partitionPanelOnly: 'DEFAULT' }
);

console.log("Computed panel items count:", engineResult.items.length);
assert(engineResult.geometry.N_PA > 0, "Geometry should have partitions");

// Now simulate the BOM loop in app.js
const currentInsOption = 'Insulated(25mm)';
const bomItems = [];

// From app.js
const getPanelInsulationSpec = (insulationOption, itemCategory, partName, catalogKey, partNo) => {
  const name = (partName || "").toLowerCase();
  const cat = (itemCategory || "").toLowerCase();
  const catKey = (catalogKey || "").toLowerCase();
  const pNo = (partNo || "").toUpperCase();

  const isPartition = name.includes("partition") || name.includes("격벽") ||
                      cat.includes("partition") || cat.includes("격벽") ||
                      catKey.includes("partition") ||
                      pNo.startsWith("PH") || pNo.startsWith("PF") || pNo.endsWith("BP") || pNo.endsWith("BPS") || pNo.includes("BP");

  if (isPartition) {
    return { isInsulated: false, thickness: null };
  }

  if (!insulationOption || insulationOption === "Non-Insulated") {
    return { isInsulated: false, thickness: null };
  }

  const isRoof = name.includes("roof") || cat.includes("roof");
  const isSide = name.includes("side") || cat.includes("side") || name.includes("wall") || cat.includes("wall");

  if (insulationOption === "Insulated(40mm)") {
    return { isInsulated: true, thickness: "40mm" };
  }
  if (insulationOption === "Insulated(25mm)" || insulationOption === "Insulated") {
    return { isInsulated: true, thickness: "25mm" };
  }
  if (insulationOption === "Insulated Roof Only") {
    return { isInsulated: isRoof, thickness: isRoof ? "25mm" : null };
  }
  if (insulationOption === "Insulated(Roof,Side)") {
    const target = isRoof || isSide;
    return { isInsulated: target, thickness: target ? "25mm" : null };
  }
  return { isInsulated: false, thickness: null };
};

engineResult.items.forEach(item => {
  const isPartition = (item.isPartition === true) ||
    (item.catalogKey && item.catalogKey.toLowerCase().includes("partition")) ||
    (item.partName && (item.partName.toLowerCase().includes("partition") || item.partName.includes("격벽"))) ||
    (item.category && (item.category.toLowerCase().includes("partition") || item.category.includes("격벽"))) ||
    (item.baseCode && (item.baseCode.toUpperCase().startsWith("PH") || item.baseCode.toUpperCase().startsWith("PF") || item.baseCode.toUpperCase().includes("BP")));

  const insSpec = (!isPartition && getPanelInsulationSpec)
    ? getPanelInsulationSpec(currentInsOption, item.category, item.partName, item.catalogKey, item.partNo)
    : { isInsulated: false, thickness: null };

  item.isInsulated = insSpec.isInsulated;

  if (insSpec.isInsulated && !isPartition) {
    const insulatedCode = InsulationNamingMap.getInsulatedDisplayCode(item.partNo, insSpec.thickness, 'almuftah', item.partNo);
    if (insulatedCode) item.partNo = insulatedCode;
  }
  bomItems.push(item);
});

const partitionItems = bomItems.filter(i => (i.catalogKey && i.catalogKey.includes('partition')) || (i.partName && i.partName.toLowerCase().includes('partition')));
console.log(`Found ${partitionItems.length} partition items in BOM:`);
partitionItems.forEach(i => {
  console.log(`  - Part: ${i.partNo}, Name: ${i.partName}, Insulated: ${i.isInsulated}`);
  assert.strictEqual(i.isInsulated, false, `Partition item ${i.partNo} must have isInsulated = false`);
  assert(!i.partNo.endsWith(' INS'), `Partition item ${i.partNo} must NEVER end with INS!`);
});

const nonPartitionItems = bomItems.filter(i => (!i.catalogKey || !i.catalogKey.includes('partition')) && (!i.partName || !i.partName.toLowerCase().includes('partition')));
console.log(`Found ${nonPartitionItems.length} non-partition items in BOM:`);
assert(nonPartitionItems.length > 0, "Must have non-partition items");
nonPartitionItems.forEach(i => {
  assert.strictEqual(i.isInsulated, true, `Wall/Roof item ${i.partNo} should have isInsulated = true`);
  assert(i.partNo.endsWith(' INS'), `Wall/Roof item ${i.partNo} should receive INS suffix under ALMUFTAH`);
});

console.log("✓ E2E Partition BOM test completed with 0 errors!");
