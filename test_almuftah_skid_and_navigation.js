// test_almuftah_skid_and_navigation.js
const fs = require('fs');
const assert = require('assert');

console.log("=== VERIFYING ALMUFTAH SKID & NAVIGATION ===");

// Mock environment
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; }
};

const domElements = {};
global.window = global;
global.window.addEventListener = () => {};
global.window.location = { hash: '' };
global.firebase = {
  initializeApp: () => ({}),
  firestore: () => ({ collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }), onSnapshot: () => {} }) }) })
};
global.document = {
  getElementById: (id) => {
    if (!domElements[id]) {
      domElements[id] = {
        id,
        value: '',
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        style: {},
        innerHTML: '',
        textContent: '',
        scrollIntoView: () => {}
      };
    }
    return domElements[id];
  },
  querySelector: (sel) => {
    if (sel.includes('tab-bom')) return document.getElementById('tab-bom');
    return document.getElementById(sel.replace(/[^a-zA-Z0-9_-]/g, '_'));
  },
  querySelectorAll: (sel) => {
    if (sel.includes('.tab-btn')) return [document.getElementById('tab-bom-btn'), document.getElementById('tab-basic-btn')];
    if (sel.includes('.tab-content')) return [document.getElementById('tab-bom'), document.getElementById('tab-basic-tool')];
    if (sel.includes('.bom-sub-btn')) return [document.getElementById('subtab-btn-bom'), document.getElementById('subtab-btn-cost')];
    if (sel.includes('.bom-subpanel')) return [document.getElementById('bom-subpanel-bom'), document.getElementById('bom-subpanel-cost')];
    return [];
  },
  addEventListener: () => {}
};

require('./rule_editor.js');
eval(fs.readFileSync('./app.js', 'utf8'));

// 1. Check ALMUFTAH initial default config
console.log("1. Checking ALMUFTAH default skid config...");
const almuftahConfig = RuleEditorUI.getCompanySkidDefaultConfig('ALMUFTAH');
console.log("ALMUFTAH 1.5mH internal skid:", almuftahConfig.internal["1.5"]);
assert.strictEqual(almuftahConfig.internal["1.5"], "sqp", "ALMUFTAH 1.5mH internal skid must default to sqp");
assert.strictEqual(almuftahConfig.internal["2.0"], "sqp", "ALMUFTAH 2.0mH internal skid must default to sqp");

// Check YSACC remains angle75
const ysaccConfig = RuleEditorUI.getCompanySkidDefaultConfig('YSACC (Default)');
assert.strictEqual(ysaccConfig.internal["1.5"], "angle75", "YSACC 1.5mH internal skid must remain angle75");

// 2. Load app.js and check resolveSkidType
const appCode = fs.readFileSync('./app.js', 'utf8');

// Load supporting engines
require('./accessories_rules.js');
require('./rule_engine.js');
require('./panel_rules.js');
require('./panel_catalog.js');
require('./panel_catalog_1x1.js');
require('./panel_catalog_partition_alt.js');
const PanelEngine = require('./panel_engine.js');
const AccessoriesEngine = require('./accessories_engine.js');

// Mock CompanyAuth
global.CompanyAuth = {
  getCurrentCompany: () => ({ id: 'almuftah', partyName: 'ALMUFTAH' })
};

// Check resolveSkidType logic
console.log("2. Checking resolveSkidType for ALMUFTAH...");
const resolvedDefault = window.resolveSkidType(1.5, "Default", false, "ALMUFTAH");
console.log("Resolved 1.5mH Default for ALMUFTAH:", resolvedDefault);
assert.strictEqual(resolvedDefault, "sqp", "ALMUFTAH 1.5mH Default must resolve to sqp");

const resolvedSHS = window.resolveSkidType(1.5, "SHS (50-3MM)", false, "ALMUFTAH");
console.log("Resolved 1.5mH 'SHS (50-3MM)' for ALMUFTAH:", resolvedSHS);
assert.strictEqual(resolvedSHS, "sqp", "SHS (50-3MM) must resolve to sqp");

// 3. Test AccessoriesEngine produces SQP parts with ALMUFTAH
console.log("3. Checking AccessoriesEngine parts for W=8, L=4, H=1.5, Ext=true, sqp...");
const g = PanelEngine.makeGeometry(8, 4, 1.5, 0, 0, 0);
const res = AccessoriesEngine.steelSkidDetailedParts(g, "sqp", true);
console.log(`Generated ${res.parts.length} skid parts:`);
res.parts.forEach(p => console.log(`  - ${p.partNo} (${p.partName}): ${p.qty}`));
assert(res.parts.length > 0, "Must generate skid parts");
assert(!res.parts.some(p => p.partNo.includes('1490ALZ')), "Must NOT contain Angle 75 parts!");

// 4. Test switchToBomOutputTab
console.log("4. Checking switchToBomOutputTab...");
window.switchToBomOutputTab('bom');
assert(document.getElementById('tab-bom').classList.contains('active'), "tab-bom must be active after switchToBomOutputTab");

console.log("=== ALL ALMUFTAH SKID & NAVIGATION TESTS PASSED ===");
