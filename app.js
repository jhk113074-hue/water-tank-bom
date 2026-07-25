// Firebase Initialization configuration
const firebaseConfig = {
  apiKey: "AIzaSyBMoqRmm2qb0jz6oOWNKiU2GVwTdIycVMo",
  authDomain: "water-tank-bom.firebaseapp.com",
  projectId: "water-tank-bom",
  storageBucket: "water-tank-bom.firebasestorage.app",
  messagingSenderId: "126393936800",
  appId: "1:126393936800:web:98e2ec4205a571acd212c5",
  measurementId: "G-BQF3TS2TK2"
};

// Initialize Firebase App and Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global App States
let partsDb = [];
let panelMatrix = []; // Actively displayed/edited matrix
let bomItems = [];
let sideMatrixOption = 1; // 1, 2, 3, or 4
let calcCapa = null;

// Builds panel-matrix rows for the "0.5/1M Side Panel only" (1x1M) side-wall
// slices from panel_catalog_1x1.js's data -- one row per (height, slice,
// wide/narrow), matching panel_matrix.json's row schema so the same
// rendering/editing/override plumbing (roleBox, updateMatrix, catalogKey
// lookups in panel_engine.js) works unchanged. Unlike the default catalog's
// "side.*" rows (one row shared across several heights via COURSE_TABLE),
// each 1x1M slice only ever applies at the ONE height it belongs to, so
// every other height's cell in that row is left blank.
function buildSide1x1MatrixRows() {
  const heights = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
  const blankGrades = {};
  heights.forEach(h => { blankGrades[h + 'mH'] = ''; });

  const rows = [];
  Object.keys(PanelCatalog1x1.SIDE_1X1_BY_HEIGHT).forEach(h => {
    const slices = PanelCatalog1x1.SIDE_1X1_BY_HEIGHT[h];
    slices.forEach((slice, i) => {
      const label = h + 'mH · Slice ' + (i + 1) + '/' + slices.length + ' (' + slice.sizeM + 'm)';
      const wideGrades = Object.assign({}, blankGrades);
      wideGrades[h + 'mH'] = slice.wide;
      // heightKey/sliceKey are kept as their own fields (not parsed back out
      // of "slot") because half-metre heights like "1.5" contain a "." too,
      // which would break a naive split(".") on the combined slot string.
      const sliceKey = 'side1x1.' + h + '.slice' + i;
      rows.push({
        key: sliceKey + '.wide', section: 'side1x1', course: null, role: 'wide',
        slot: sliceKey + '.wide', heightKey: h, sliceKey: 'slice' + i,
        isVariant: false, variantTag: null, widthClass: 'wide',
        label: label, heightGrades: wideGrades,
      });
      // parRT/parLT: this slice's replacement part when it sits at a
      // partition boundary -- shown as small variant fields under the
      // wide box, same pattern as the default catalog's side_parRT/LT.
      ['parRT', 'parLT'].forEach(field => {
        const grades = Object.assign({}, blankGrades);
        grades[h + 'mH'] = slice[field] || '';
        rows.push({
          key: sliceKey + '.' + field, section: 'side1x1', course: null, role: field,
          slot: sliceKey + '.wide', heightKey: h, sliceKey: 'slice' + i,
          isVariant: true, variantTag: field === 'parRT' ? 'Par-RT' : 'Par-LT', widthClass: 'wide',
          label: label, heightGrades: grades,
        });
      });
      if (slice.narrow) {
        const narrowGrades = Object.assign({}, blankGrades);
        narrowGrades[h + 'mH'] = slice.narrow;
        rows.push({
          key: sliceKey + '.narrow', section: 'side1x1', course: null, role: 'narrow',
          slot: sliceKey + '.narrow', heightKey: h, sliceKey: 'slice' + i,
          isVariant: false, variantTag: null, widthClass: 'narrow',
          label: label, heightGrades: narrowGrades,
        });
        ['narrowParRT', 'narrowParLT'].forEach(field => {
          const grades = Object.assign({}, blankGrades);
          grades[h + 'mH'] = slice[field] || '';
          rows.push({
            key: sliceKey + '.' + field, section: 'side1x1', course: null, role: field,
            slot: sliceKey + '.narrow', heightKey: h, sliceKey: 'slice' + i,
            isVariant: true, variantTag: field === 'narrowParRT' ? 'Par-RT' : 'Par-LT', widthClass: 'narrow',
            label: label, heightGrades: grades,
          });
        });
      }
    });
  });
  return rows;
}

// Syncs the 4 matrix-option tab buttons' highlight style + the
// "(현재: Option N ...)" description text to match the given option number.
// Reads the DOM directly by ID rather than relying on the button objects a
// click handler might have closed over, so it works both from a real click
// AND from initialization (before any click handler exists to fire).
function syncMatrixOptionUI(optNum) {
  const labels = {
    0: 'Basic setting (Roof/Bottom)',
    1: 'Option 1 - Side(Default)',
    2: 'Option 2 - Side(0.5m, 1m)',
    3: 'Option 3 - partition(0.5m, 1m)',
    4: 'Option 4 - partition(Default)',
  };
  [0, 1, 2, 3, 4].forEach(n => {
    const btn = document.getElementById(`btnSideMatrixOpt${n}`);
    if (!btn) return;
    if (n === optNum) {
      btn.style.background = 'var(--neon-blue)';
      btn.style.color = 'white';
      btn.style.fontWeight = 'bold';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-secondary)';
      btn.style.fontWeight = 'normal';
    }
  });
  const optDesc = document.getElementById('sideMatrixActiveOptDesc');
  if (optDesc && labels[optNum]) optDesc.textContent = `(현재: ${labels[optNum]} 조합 사용 중)`;
}

// Builds panel-matrix rows for the "0.5/1M Partition only" alternate from
// panel_catalog_partition_alt.js's data. Unlike buildSide1x1MatrixRows(),
// this doesn't need a per-height row scheme: the alternate only ever
// touches ONE course per height (TOP_15 for half-metre heights, TOP_20 for
// whole-metre ones), so -- exactly like the default catalog's own
// partition.<course>.* rows -- one row per (course, role) can carry values
// across every height that course applies to.
function buildPartitionAltMatrixRows() {
  const roleLabels = { partition: 'Partition', vert: 'Vert', vert_2: 'Vert-2' };
  const rows = [];
  ['TOP_15', 'TOP_20'].forEach(course => {
    ['partition', 'vert', 'vert_2'].forEach(role => {
      const key = `partition1x1.${course}.${role}`;
      const heightGrades = {};
      sideHeightGrades.forEach(hGrade => {
        const alt = PanelCatalogPartitionAlt.PARTITION_ALT_BY_HEIGHT[String(parseFloat(hGrade))];
        heightGrades[hGrade] = (alt && alt.course === course) ? (alt[role] || '') : '';
      });
      rows.push({
        key, section: 'partition1x1', course, role, slot: key,
        isVariant: false, variantTag: null, widthClass: 'wide',
        label: `${course} · ${roleLabels[role]} (0.5/1M)`,
        heightGrades,
      });
    });
  });
  return rows;
}

// Global Bolt Recipes Master list
let boltRecipes = {
  "WBT-1035SA4": [
    { partNo: "WBT-1035SA4", partName: "Hex Bolt M10x35 (SS316)", ratio: 1 },
    { partNo: "WNT-M10SA4", partName: "Hex Nut M10 (SS316)", ratio: 1 },
    { partNo: "WFW-M10SA4", partName: "Plain Washer M10 (SS316)", ratio: 2 }
  ],
  "WBT-1035HDG": [
    { partNo: "WBT-1035HDG", partName: "Hex Bolt M10x35 (HDG)", ratio: 1 },
    { partNo: "WNT-M10HDG", partName: "Hex Nut M10 (HDG)", ratio: 1 },
    { partNo: "WFW-M10HDG", partName: "Plain Washer M10 (HDG)", ratio: 2 }
  ],
  "WBT-1045HDG": [
    { partNo: "WBT-1045HDG", partName: "Hex Bolt M10x45 (HDG)", ratio: 1 },
    { partNo: "WNT-M10HDG", partName: "Hex Nut M10 (HDG)", ratio: 1 },
    { partNo: "WFW-M10HDG", partName: "Plain Washer M10 (HDG)", ratio: 2 }
  ],
  "WBT-1240HDG": [
    { partNo: "WBT-1240HDG", partName: "Hex Bolt M12x40 (HDG)", ratio: 1 },
    { partNo: "WNT-M12HDG", partName: "Hex Nut M12 (HDG)", ratio: 1 },
    { partNo: "WFW-M12HDG", partName: "Plain Washer M12 (HDG)", ratio: 2 }
  ],
  "WBT-14130PPD": [
    { partNo: "WBT-14130PPD", partName: "Hex Bolt M14x130 (HDG)", ratio: 1 },
    { partNo: "WNT-M14HDG", partName: "Hex Nut M14 (HDG)", ratio: 1 },
    { partNo: "WFW-M14HDG", partName: "Plain Washer M14 (HDG)", ratio: 2 }
  ],
  "WBT-14130PSA4": [
    { partNo: "WBT-14130PSA4", partName: "Hex Bolt M14x130 (SS316)", ratio: 1 },
    { partNo: "WNT-M14SA4", partName: "Hex Nut M14 (SS316)", ratio: 1 },
    { partNo: "WFW-M14SA4", partName: "Plain Washer M14 (SS316)", ratio: 2 }
  ],
  "WBT-1045SA4": [
    { partNo: "WBT-1045SA4", partName: "Hex Bolt M10x45 (SS316)", ratio: 1 },
    { partNo: "WNT-M10SA4", partName: "Hex Nut M10 (SS316)", ratio: 1 },
    { partNo: "WFW-M10SA4", partName: "Plain Washer M10 (SS316)", ratio: 2 }
  ]
};

// Try loading recipes from localStorage
const savedRecipes = localStorage.getItem("water_tank_bolt_recipes");
if (savedRecipes) {
  try {
    boltRecipes = JSON.parse(savedRecipes);
  } catch(e) {
    console.error("Error loading bolt recipes:", e);
  }
}

// Separate storage variables for options 1, 2, 3, and 4
let optionMatrixStorage = {
  1: null,
  2: null,
  3: null,
  4: null
};

// DB Sorting States
let dbSortField = 'partNo'; // Default sort key
let dbSortOrder = 'asc';    // 'asc' or 'desc'

// Fetch Master Database from Firebase Firestore
async function loadPartsDatabase() {
  const partsMap = new Map();

  // 1. Always load baseline parts_db.json first (contains all 628 catalog parts)
  try {
    const res = await fetch('parts_db.json');
    if (res.ok) {
      const jsonParts = await res.json();
      jsonParts.forEach(p => {
        if (p.partNo) {
          partsMap.set(p.partNo.trim().toUpperCase(), p);
        }
      });
    }
  } catch (e) {
    console.warn("Failed to fetch baseline parts_db.json:", e);
  }

  // 2. Try fetching from Firestore to override/add user-customized DB items
  try {
    const snapshot = await db.collection('parts').get();
    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        const data = doc.data();
        const pKey = (data.partNo || '').trim().toUpperCase();
        if (pKey) {
          const existing = partsMap.get(pKey) || {};
          partsMap.set(pKey, {
            ...existing,
            id: doc.id,
            partNo: data.partNo || existing.partNo || '',
            nameKo: data.nameKo || existing.nameKo || '',
            nameEn: data.nameEn || existing.nameEn || '',
            spec: data.spec || existing.spec || '',
            weight: data.weight !== undefined ? Number(data.weight) : (existing.weight || 0),
            price: data.price !== undefined ? Number(data.price) : (existing.price || 0),
            unit: data.unit || existing.unit || 'PCS',
            category: data.category || existing.category || 'OTHER',
            width: data.width !== undefined ? Number(data.width) : (existing.width || 1000),
            length: data.length !== undefined ? Number(data.length) : (existing.length || 1000),
            ht: data.ht !== undefined ? Number(data.ht) : (existing.ht || 80),
            fh: data.fh !== undefined ? Number(data.fh) : (existing.fh || 40),
            holes: data.holes !== undefined ? Number(data.holes) : (existing.holes || 0)
          });
        }
      });
      console.log(`Synced ${partsMap.size} total parts (merged with Firestore).`);
    }
  } catch (err) {
    console.warn("Firestore fetch failed, checking localStorage backup:", err);
    const savedParts = localStorage.getItem('custom_parts_db');
    if (savedParts) {
      try {
        const localArray = JSON.parse(savedParts);
        localArray.forEach(p => {
          if (p.partNo) partsMap.set(p.partNo.trim().toUpperCase(), p);
        });
      } catch (e) {}
    }
  }

  partsDb = Array.from(partsMap.values());
  window.partsDb = partsDb;
  localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));

  try {
    const res = await fetch('panel_matrix.json');
    panelMatrix = await res.json();
    console.log(`Loaded ${panelMatrix.length} panel matrix items.`);
  } catch (e) {
    console.error('Error loading panel_matrix.json:', e);
  }
}

// Initial default calculation parameters & sample BOM
const sampleBOM = [
  // Panels
  { category: "Panels", partNo: "MF00TX", partName: "Manhole", qty: 2, unit: "PCS", spec: "1m x 1m Manhole", price: 0, weight: 9.4 },
  { category: "Panels", partNo: "RF00TX", partName: "Roof", qty: 16, unit: "PCS", spec: "1x1m GRP Roof Panel", price: 0, weight: 8.4 },
  { category: "Panels", partNo: "NH10TX", partName: "Flat Half(1.0MH)", qty: 6, unit: "PCS", spec: "0.5x1m Roof Panel", price: 0, weight: 8.8 },
  { category: "Panels", partNo: "BF10BX", partName: "Bottom(1.0mH)", qty: 14, unit: "PCS", spec: "1x1m GRP Base Panel", price: 0, weight: 14.8 },
  { category: "Panels", partNo: "BF10BP", partName: "Bottom(1.0mH)", qty: 2, unit: "PCS", spec: "1x1m GRP Base Partition Panel", price: 0, weight: 14.8 },
  { category: "Panels", partNo: "NH10BX", partName: "Flat Half(1.0MH)", qty: 5, unit: "PCS", spec: "0.5x1m GRP Base Panel", price: 0, weight: 8.8 },
  { category: "Panels", partNo: "NH10BPS", partName: "Flat Half(1.0MH)", qty: 1, unit: "PCS", spec: "0.5x1m GRP Partition Base", price: 0, weight: 8.8 },
  { category: "Panels", partNo: "NF10BX", partName: "Flat(1.0MH)", qty: 2, unit: "PCS", spec: "1x1m Drain Panel", price: 0, weight: 16 },
  
  // Steel Skid
  { category: "Steel Skid", partNo: "WFF-100U", partName: "100x50mm U Channel", qty: 54.5, unit: "M", spec: "HDG U-Channel Skid Frame", price: 3.83, weight: 0 },
  
  // Reinforcing
  { category: "Reinforcing", partNo: "WCA-1000Z", partName: "HDG Corner Angle(1.0mH)", qty: 4, unit: "PCS", spec: "Corner Reinforcement angle 1.0mH", price: 3.4, weight: 3.305 },
  
  // Bolts & Nuts
  { category: "Bolts & Nuts", partNo: "WBT-1480SA4", partName: "M14 x 80 SS316 Bolt/Nut", qty: 450, unit: "PCS", spec: "Stainless Steel 316 Bolt/Nut set", price: 0.85, weight: 0.12 },
  { category: "Bolts & Nuts", partNo: "WBT-1460RSA4", partName: "M14 x 60 SS316 Bolt/Nut", qty: 280, unit: "PCS", spec: "Stainless Steel 316 Bolt/Nut set", price: 0.72, weight: 0.10 }
];

// Initialize UI
document.addEventListener('DOMContentLoaded', async () => {

  // 0. Wire up the "수식 설정 (Rule Editor)" tab (rule_editor.js) -- applies
  // any saved formula overrides (localStorage immediately at script load,
  // then Firestore async here) and renders its own UI. Safe no-op if
  // rule_editor.js failed to load for some reason.
  if (typeof RuleEditorUI !== 'undefined') {
    try {
      RuleEditorUI.init(db);
    } catch (err) {
      console.error('[RuleEditorUI] init failed:', err);
    }
  }

  // 1. Fetch Firebase database & static assets first (which loads panel_matrix.json defaults)
  try {
    await loadPartsDatabase();
  } catch (err) {
    console.error("Async DB load failed:", err);
  }

  // 1b. Wire up the "그림 설정 (Visual Config)" tab (visual_config.js) --
  // reads the same BASIC_TOOL inputs and calls the same PanelEngine/
  // AccessoriesEngine functions the real BOM generation uses, so it must run
  // after partsDb is loaded (for part name lookups) and after the engine
  // scripts (already guaranteed by script tag order in index.html).
  if (typeof VisualConfigUI !== 'undefined') {
    try {
      VisualConfigUI.init();
    } catch (err) {
      console.error('[VisualConfigUI] init failed:', err);
    }
  }

  // 2. Initialize or restore separate matrices for Options 1, 2, 3, and 4
  const initializeOptionMatrices = () => {
    // Helper function to deep clone the default panelMatrix template loaded
    // from panel_matrix.json. Option 2 ("Side 0.5m,1m") gets its "side.*"
    // rows swapped for the 1x1M-only slice rows (built from
    // panel_catalog_1x1.js) instead of the default combo-course rows, so
    // its board actually shows/edits the alternate configuration.
    const createFreshClone = (optNum) => {
      const base = JSON.parse(JSON.stringify(panelMatrix));
      if (optNum === 2 && typeof PanelCatalog1x1 !== 'undefined') {
        return base.filter(r => r.section !== 'side').concat(buildSide1x1MatrixRows());
      }
      if (optNum === 3 && typeof PanelCatalogPartitionAlt !== 'undefined') {
        return base.concat(buildPartitionAltMatrixRows());
      }
      return base;
    };

    [0, 1, 2, 3, 4].forEach(opt => {
      const savedOpt = localStorage.getItem(`water_tank_panel_matrix_opt${opt}`);
      if (savedOpt) {
        try {
          optionMatrixStorage[opt] = JSON.parse(savedOpt);
        } catch (e) {
          console.error(`Error parsing matrix for Option ${opt}, fallback to default`, e);
          optionMatrixStorage[opt] = createFreshClone(opt === 0 ? 1 : opt);
        }
      } else {
        optionMatrixStorage[opt] = createFreshClone(opt === 0 ? 1 : opt);
      }
    });

    // Handle legacy single cache key migration
    const legacyMatrix = localStorage.getItem('water_tank_panel_matrix');
    if (legacyMatrix) {
      try {
        const parsedLegacy = JSON.parse(legacyMatrix);
        optionMatrixStorage[1] = parsedLegacy;
        localStorage.setItem('water_tank_panel_matrix_opt1', legacyMatrix);
        localStorage.removeItem('water_tank_panel_matrix');
        console.log('Migrated legacy water_tank_panel_matrix cache to Option 1 storage.');
      } catch (e) {
        console.error(e);
      }
    }

    // Bind current active option matrix to panelMatrix
    const savedActiveOpt = localStorage.getItem('water_tank_active_option');
    if (savedActiveOpt) {
      sideMatrixOption = parseInt(savedActiveOpt) || 1;
    } else {
      sideMatrixOption = 1;
    }

    // Perform version cache upgrades sanitation
    const currentCacheVer = localStorage.getItem('water_tank_cache_ver');
    if (currentCacheVer !== '2.0.1') {
      [1, 2, 3, 4].forEach(opt => {
        localStorage.removeItem(`water_tank_panel_matrix_opt${opt}`);
      });
      localStorage.removeItem('water_tank_panel_matrix');
      localStorage.setItem('water_tank_cache_ver', '2.0.1');
      window.location.reload();
      return;
    }

    panelMatrix = optionMatrixStorage[sideMatrixOption];

    // Sync button highlight/description text to the restored option.
    // NOTE: this must NOT be a `.click()` on the button -- at this point in
    // the script, initializeOptionMatrices() has been called but the
    // buttons' own click listeners (further down this file) haven't been
    // attached yet, so `.click()` here is a silent no-op: the buttons stay
    // stuck on their HTML-default "Option 1" styling while panelMatrix (and
    // therefore what actually renders) correctly reflects whatever option
    // was last active -- exactly the "Option 1 button highlighted but
    // Partition board showing" mismatch this caused before.
    syncMatrixOptionUI(sideMatrixOption);
  };

  initializeOptionMatrices();

  // Try to load saved draft, otherwise load sample
  const saved = localStorage.getItem('water_tank_bom_draft');
  if (saved) {
    try {
      bomItems = JSON.parse(saved);
      console.log('Restored draft from localStorage.');
    } catch(e) {
      bomItems = [...sampleBOM];
    }
  } else {
    bomItems = [...sampleBOM];
  }
  
  // Bind Order Date default
  document.getElementById('orderDate').valueAsDate = new Date();

  // Bind event listeners early so global variables like calcCapa are available
  setupEventListeners();

  // Restore all BASIC_TOOL input configurations from localStorage if exists
  const savedConfig = localStorage.getItem('water_tank_config_inputs');
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig);
      Object.keys(config).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (el.type === 'checkbox') {
            el.checked = config[id];
          } else {
            el.value = config[id];
          }
        }
      });
      console.log('Restored form config from localStorage.');
    } catch(e) {
      console.error('Failed to restore config inputs:', e);
    }
  }

  // Load custom logo if exists
  const savedLogo = localStorage.getItem('custom_company_logo');
  if (savedLogo) {
    updateLogoUI(savedLogo);
  }

  // Render initial static data first
  renderAll();

  // Automatically listen to and save all BASIC_TOOL configurations to localStorage
  const saveConfigInputs = () => {
    const config = {};
    const selectors = 'input, select, textarea';
    document.querySelectorAll('#tab-basic-tool ' + selectors).forEach(el => {
      if (el.id) {
        config[el.id] = el.type === 'checkbox' ? el.checked : el.value;
      }
    });
    localStorage.setItem('water_tank_config_inputs', JSON.stringify(config));
  };
  document.querySelectorAll('#tab-basic-tool input, #tab-basic-tool select, #tab-basic-tool textarea').forEach(el => {
    el.addEventListener('input', saveConfigInputs);
    el.addEventListener('change', saveConfigInputs);
  });

  if (typeof window.PalletPacking !== 'undefined' && typeof window.PalletPacking.init === 'function') {
    window.PalletPacking.init();
  }
});

// Setup Listeners
function setupEventListeners() {
  // Tabs navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.dataset.tab;
      
      // If clicking PRINTOUT (출력용 시트 미리보기)
      if (targetTabId === 'tab-printout-sheet') {
        openPrintoutSheetPreview();
        return;
      }
      
      // If clicking PRINTOUT (COST 원가)
      if (targetTabId === 'tab-cost') {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const bomTabBtn = document.querySelector('.tab-btn[data-tab="tab-bom"]');
        if (bomTabBtn) bomTabBtn.classList.add('active');
        const bomTabEl = document.getElementById('tab-bom');
        if (bomTabEl) bomTabEl.classList.add('active');
        switchBomSubTab('cost');
        return;
      }

      // If clicking PRINTOUT (WEIGHT 중량)
      if (targetTabId === 'tab-wt') {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const bomTabBtn = document.querySelector('.tab-btn[data-tab="tab-bom"]');
        if (bomTabBtn) bomTabBtn.classList.add('active');
        const bomTabEl = document.getElementById('tab-bom');
        if (bomTabEl) bomTabEl.classList.add('active');
        switchBomSubTab('weight');
        return;
      }

      // Default tab switching
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetEl = document.getElementById(targetTabId);
      if (targetEl) targetEl.classList.add('active');
    });
  });

  // Header Logo click -> Switch to BASIC_TOOL settings tab
  const logoBtn = document.querySelector('.app-header .logo');
  if (logoBtn) {
    logoBtn.addEventListener('click', () => {
      const basicToolTabBtn = document.querySelector('.tab-btn[data-tab="tab-basic-tool"]');
      if (basicToolTabBtn) {
        basicToolTabBtn.click();
      }
    });
  }

  // Calculate Capacity & Surface Area & Skid Length Auto-Calculations
  const inputL1 = document.getElementById('tankLength1');
  const inputL2 = document.getElementById('tankLength2');
  const inputL3 = document.getElementById('tankLength3');
  const inputL4 = document.getElementById('tankLength4');
  const inputWidth = document.getElementById('tankWidth');
  const inputHeight = document.getElementById('tankHeight');
  const inputQty = document.getElementById('tankQty');
  const inputPartition = document.getElementById('numPartition');

  calcCapa = () => {
    const l1 = parseFloat(inputL1?.value) || 0;
    const l2 = parseFloat(inputL2?.value) || 0;
    const l3 = parseFloat(inputL3?.value) || 0;
    const l4 = parseFloat(inputL4?.value) || 0;
    const w = parseFloat(inputWidth?.value) || 0;
    const h = parseFloat(inputHeight?.value) || 0;
    const q = parseInt(inputQty?.value) || 1;

    // Auto-calculate Partition count based on Length2, Length3, Length4
    const n_pa = l4 > 0 ? 3 : l3 > 0 ? 2 : l2 > 0 ? 1 : 0;
    if (inputPartition) {
      inputPartition.value = n_pa;
    }

    const totalLength = l1 + l2 + l3 + l4;
    
    // Nominal Capa
    const nominal = (typeof AccessoriesEngine !== 'undefined')
      ? AccessoriesEngine.nominalCapaM3(w, totalLength, h)
      : totalLength * w * h;

    // Actual Capa
    const actual = (typeof AccessoriesEngine !== 'undefined')
      ? AccessoriesEngine.actualCapaM3(w, totalLength, h)
      : (Math.max(0, totalLength - 0.1) * Math.max(0, w - 0.1) * Math.max(0, h - 0.14));

    // SQM (Surface Area)
    const sqm = (typeof AccessoriesEngine !== 'undefined')
      ? AccessoriesEngine.totalSurfaceAreaSqm(w, totalLength, h, n_pa)
      : (totalLength * w * 2) + ((totalLength + w) * 2 * h) + (n_pa * w * h);

    // Skid Total Length
    let skidLen = 0;
    try {
      if (typeof PanelEngine !== 'undefined' && typeof AccessoriesEngine !== 'undefined') {
        const g = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4, n_pa);
        skidLen = AccessoriesEngine.steelSkidTotalLength(w, g.W.whole, g.W.half, totalLength, n_pa);
      }
    } catch (err) {
      console.warn(`Skid calculation error: ${err.message}`);
    }

    // Update UI Elements
    const nominalEl = document.getElementById('nominalCapa');
    if (nominalEl) nominalEl.value = nominal.toFixed(3);

    const actualEl = document.getElementById('actualCapa');
    if (actualEl) actualEl.value = actual.toFixed(3);

    const sqmEl = document.getElementById('sqmArea');
    if (sqmEl) sqmEl.value = sqm.toFixed(3);

    const skidEl = document.getElementById('skidLength');
    if (skidEl) skidEl.value = skidLen.toFixed(3);

    const statEl = document.getElementById('statCapa');
    if (statEl) {
      statEl.textContent = `${nominal.toFixed(1)} M³`;
      statEl.title = `1 SET 기준 공칭용량(Nominal CAPA). 전체 ${q} SET 합계: ${(nominal * q).toFixed(1)} M³`;
    }

    const formulaEl = document.getElementById('statSizeFormula');
    if (formulaEl) {
      let lengthDesc = `${totalLength}m(L)`;
      const validLengths = [l1, l2, l3, l4].filter(val => val > 0);
      if (validLengths.length > 1) {
        lengthDesc = `${totalLength}(${validLengths.join('+')})m(L)`;
      }
      formulaEl.innerHTML = `${lengthDesc} * ${w}m(W) * ${h}m(H)`;
    }
  };

  [inputL1, inputL2, inputL3, inputL4, inputWidth, inputHeight, inputQty, inputPartition].forEach(input => {
    if (input) {
      input.addEventListener('input', calcCapa);
      input.addEventListener('change', calcCapa);
    }
  });

  // Action Buttons
  document.getElementById('btnLoadSample').addEventListener('click', () => {
    if (confirm('현재 편집 중인 내용을 버리고 샘플 BOM 구조를 채우시겠습니까?')) {
      bomItems = [...sampleBOM];
      saveAndRender();
    }
  });

  document.getElementById('btnResetBOM').addEventListener('click', () => {
    if (confirm('정말로 BOM 전체 목록을 비우시겠습니까?')) {
      bomItems = [];
      saveAndRender();
    }
  });

  document.getElementById('btnApplyConfig').addEventListener('click', () => {
    generateDefaultBOMFromConfig();
  });

  const btnResetSideMatrix = document.getElementById('btnResetSideMatrix');
  if (btnResetSideMatrix) {
    btnResetSideMatrix.addEventListener('click', () => {
      if (confirm('정말로 측벽/격벽 판넬 매핑 매트릭스를 전부 초기화하시겠습니까?')) {
        panelMatrix = panelMatrix.map(row => {
          const isSideRow = row.section === 'side' || row.section === 'side1x1' || row.section === 'partition' || row.section === 'partition1x1';
          if (isSideRow) {
            const emptyGrades = {};
            if (row.heightGrades) {
              Object.keys(row.heightGrades).forEach(key => {
                emptyGrades[key] = "";
              });
            }
            return {
              ...row,
              heightGrades: emptyGrades
            };
          }
          return row;
        });
        optionMatrixStorage[sideMatrixOption] = panelMatrix;
        localStorage.setItem(`water_tank_panel_matrix_opt${sideMatrixOption}`, JSON.stringify(panelMatrix));
        renderSidePanelConfig();
        alert(`[Option ${sideMatrixOption}] 측벽 매트릭스가 초기화되었습니다.`);
      }
    });
  }

  // Add Item Modal Bindings
  const modal = document.getElementById('addItemModal');
  const btnAdd = document.getElementById('btnAddRow');
  const btnClose = document.getElementById('modalClose');
  const btnCancel = document.getElementById('btnModalCancel');
  const btnSave = document.getElementById('btnModalSave');
  const searchInput = document.getElementById('modalSearchPart');
  const suggestionsBox = document.getElementById('searchSuggestions');

  window.openAddItemModal = function() {
    const searchInput = document.getElementById('modalSearchPart');
    const suggestionsBox = document.getElementById('searchSuggestions');
    if (searchInput) searchInput.value = '';
    if (suggestionsBox) suggestionsBox.style.display = 'none';
    
    const pNo = document.getElementById('modalPartNo');
    const pName = document.getElementById('modalPartName');
    const qEl = document.getElementById('modalQty');
    const uEl = document.getElementById('modalUnit');
    const prEl = document.getElementById('modalPrice');
    const wEl = document.getElementById('modalWeight');
    const spEl = document.getElementById('modalSpec');

    if (pNo) pNo.value = '';
    if (pName) pName.value = '';
    if (qEl) qEl.value = '1';
    if (uEl) uEl.value = 'PCS';
    if (prEl) prEl.value = '0';
    if (wEl) wEl.value = '0';
    if (spEl) spEl.value = '';

    if (modal) modal.classList.add('active');
  };

  window.addManualBomRow = function() {
    const newItem = {
      category: 'Panels',
      partName: '신규 부품',
      partNo: '',
      qty: 1,
      unit: 'PCS',
      price: 0,
      weight: 0,
      spec: ''
    };
    bomItems.push(newItem);
    saveAndRender();
  };

  window.resetBOMItemsList = function() {
    if (confirm('정말로 BOM 전체 목록을 비우시겠습니까?')) {
      bomItems = [];
      saveAndRender();
    }
  };

  if (btnAdd) {
    btnAdd.addEventListener('click', window.openAddItemModal);
  }

  const closeModal = () => modal.classList.remove('active');
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  // Search DB Suggestions
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (!val) {
      suggestionsBox.style.display = 'none';
      return;
    }
    
    const matches = partsDb.filter(p => 
      (p.partNo || '').toLowerCase().includes(val) || 
      (p.nameKo || '').toLowerCase().includes(val) ||
      (p.nameEn || '').toLowerCase().includes(val) ||
      (p.spec || '').toLowerCase().includes(val)
    ).slice(0, 10);

    if (matches.length === 0) {
      suggestionsBox.style.display = 'none';
      return;
    }

    suggestionsBox.innerHTML = '';
    matches.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.innerHTML = `
        <span><strong>${item.partNo}</strong> - ${item.nameKo || item.nameEn}</span>
        <span style="color:var(--text-secondary)">${item.spec}</span>
      `;
      div.addEventListener('click', () => {
        // Auto-fill form
        document.getElementById('modalPartNo').value = item.partNo;
        document.getElementById('modalPartName').value = item.nameKo || item.nameEn;
        document.getElementById('modalUnit').value = item.unit || 'PCS';
        document.getElementById('modalPrice').value = item.price || 0;
        document.getElementById('modalWeight').value = item.weight || 0;
        document.getElementById('modalSpec').value = item.spec || '';
        suggestionsBox.style.display = 'none';
        searchInput.value = item.partNo;
      });
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
  });

  btnSave.addEventListener('click', () => {
    const cat = document.getElementById('modalCategory').value;
    const partNo = document.getElementById('modalPartNo').value;
    const name = document.getElementById('modalPartName').value;
    const qty = parseFloat(document.getElementById('modalQty').value) || 0;
    const unit = document.getElementById('modalUnit').value;
    const price = parseFloat(document.getElementById('modalPrice').value) || 0;
    const weight = parseFloat(document.getElementById('modalWeight').value) || 0;
    const spec = document.getElementById('modalSpec').value;

    if (!name || qty <= 0) {
      alert('품명과 수량을 입력해 주세요.');
      return;
    }

    bomItems.push({
      category: cat,
      partNo: partNo,
      partName: name,
      qty: qty,
      unit: unit,
      spec: spec,
      price: price,
      weight: weight
    });

    closeModal();
    saveAndRender();
  });

  // DB Master search filter binding on the new tab input and category selector
  const dbTabSearchInput = document.getElementById('dbTabSearchInput');
  const dbTabCategoryFilter = document.getElementById('dbTabCategoryFilter');
  if (dbTabSearchInput) {
    dbTabSearchInput.addEventListener('input', () => {
      renderDbList();
    });
  }
  if (dbTabCategoryFilter) {
    dbTabCategoryFilter.addEventListener('change', () => {
      renderDbList();
    });
  }

  // DB Master Edit / Add Modal Bindings
  const dbModal = document.getElementById('dbEditModal');
  const btnDbTabAdd = document.getElementById('btnDbTabAdd');
  const btnDbModalClose = document.getElementById('dbModalClose');
  const btnDbModalCancel = document.getElementById('btnDbModalCancel');
  const btnDbModalSave = document.getElementById('btnDbModalSave');

  // Dragging support for Modeless DB edit window
  const dragHeader = document.getElementById('dbEditModalHeader');
  if (dragHeader && dbModal) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    dragHeader.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      // Prevent drag if click is on close button
      if (e.target.id === 'dbModalClose' || e.target.classList.contains('close-btn')) return;
      e.preventDefault();
      // Get the mouse cursor position at startup:
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      // Call a function whenever the cursor moves:
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate the new cursor position:
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // Set the element's new position:
      dbModal.style.top = (dbModal.offsetTop - pos2) + "px";
      dbModal.style.left = (dbModal.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
      // Stop moving when mouse button is released:
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  let currentEditPartIndex = -1; // -1 means adding new

  if (btnDbTabAdd) {
    btnDbTabAdd.addEventListener('click', () => {
      currentEditPartIndex = -1;
      document.getElementById('dbModalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> 신규 부품 마스터 등록';
      document.getElementById('dbModalPartNo').value = '';
      document.getElementById('dbModalPartNo').disabled = false;
      document.getElementById('dbModalCategory').value = 'PANEL';
      document.getElementById('dbModalNameKo').value = '';
      document.getElementById('dbModalNameEn').value = '';
      document.getElementById('dbModalUnit').value = 'PCS';
      document.getElementById('dbModalPrice').value = '0';
      document.getElementById('dbModalWeight').value = '0';
      document.getElementById('dbModalSpec').value = '';
      const holesEl = document.getElementById('dbModalHoles');
      if (holesEl) holesEl.value = '0';
      // Reset position when showing modal
      dbModal.style.top = "15%";
      dbModal.style.left = "35%";
      dbModal.classList.add('active');
    });
  }

  const closeDbModal = () => dbModal.classList.remove('active');
  if (btnDbModalClose) btnDbModalClose.addEventListener('click', closeDbModal);
  if (btnDbModalCancel) btnDbModalCancel.addEventListener('click', closeDbModal);

  btnDbModalSave.addEventListener('click', async () => {
    const partNo = document.getElementById('dbModalPartNo').value.trim();
    const category = document.getElementById('dbModalCategory').value;
    const nameKo = document.getElementById('dbModalNameKo').value.trim();
    const nameEn = document.getElementById('dbModalNameEn').value.trim();
    const unit = document.getElementById('dbModalUnit').value.trim();
    const price = parseFloat(document.getElementById('dbModalPrice').value) || 0;
    const weight = parseFloat(document.getElementById('dbModalWeight').value) || 0;
    const spec = document.getElementById('dbModalSpec').value.trim();
    const width = parseFloat(document.getElementById('dbModalWidth').value) || 1000;
    const length = parseFloat(document.getElementById('dbModalLength').value) || 1000;
    const ht = parseFloat(document.getElementById('dbModalHt').value) || 80;
    const fh = parseFloat(document.getElementById('dbModalFh').value) || 40;
    const holes = parseInt(document.getElementById('dbModalHoles')?.value) || 0;

    if (!partNo) {
      alert('부품 번호(Part No.)는 필수 입력 항목입니다.');
      return;
    }

    try {
      if (currentEditPartIndex === -1) {
        // Add new to Firestore (auto doc ID)
        if (partsDb.some(p => p.partNo.toLowerCase() === partNo.toLowerCase())) {
          alert('이미 존재하는 부품 번호입니다. 기존 부품을 수정해 주세요.');
          return;
        }

        const newDocRef = db.collection('parts').doc();
        const newPart = { partNo, category, nameKo, nameEn, unit, price, weight, spec, width, length, ht, fh, holes };
        await newDocRef.set(newPart);
        
        // Push with new ID to local memory array
        newPart.id = newDocRef.id;
        partsDb.unshift(newPart);
      } else {
        // Update in Firestore
        const item = partsDb[currentEditPartIndex];
        
        // Check for duplicate partNo excluding current editing item
        if (partsDb.some((p, pIdx) => pIdx !== currentEditPartIndex && p.partNo.toLowerCase() === partNo.toLowerCase())) {
          alert('이미 다른 자재에 등록된 부품 번호입니다. 중복되지 않는 부품 번호를 입력해 주세요.');
          return;
        }

        const updatedPart = { partNo, category, nameKo, nameEn, unit, price, weight, spec, width, length, ht, fh, holes };
        
        if (item.id) {
          await db.collection('parts').doc(item.id).set(updatedPart, { merge: true });
        } else {
          // If fallback has no ID, query matching old partNo
          const querySnap = await db.collection('parts').where('partNo', '==', item.partNo).get();
          if (!querySnap.empty) {
            await querySnap.docs[0].ref.set(updatedPart, { merge: true });
            updatedPart.id = querySnap.docs[0].id;
          } else {
            const newDoc = db.collection('parts').doc();
            await newDoc.set(updatedPart);
            updatedPart.id = newDoc.id;
          }
        }
        partsDb[currentEditPartIndex] = { ...item, ...updatedPart };
      }
      closeDbModal();
      localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
      renderDbList();
    } catch (err) {
      console.error("Failed to save to Firestore:", err);
      alert("Firestore에 자재를 저장하는 데 실패했습니다: " + err.message);
    }
  });

  window.openNewDbPartModal = function() {
    currentEditPartIndex = -1;
    const modalTitle = document.getElementById('dbModalTitle');
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-plus-circle"></i> 신규 부품 마스터 등록';
    const pNo = document.getElementById('dbModalPartNo');
    if (pNo) { pNo.value = ''; pNo.disabled = false; }
    const cat = document.getElementById('dbModalCategory');
    if (cat) cat.value = 'REINFORCING';
    const nKo = document.getElementById('dbModalNameKo');
    if (nKo) nKo.value = '';
    const nEn = document.getElementById('dbModalNameEn');
    if (nEn) nEn.value = '';
    const unit = document.getElementById('dbModalUnit');
    if (unit) unit.value = 'PCS';
    const price = document.getElementById('dbModalPrice');
    if (price) price.value = '0';
    const weight = document.getElementById('dbModalWeight');
    if (weight) weight.value = '0';
    const spec = document.getElementById('dbModalSpec');
    if (spec) spec.value = '';
    const dbModal = document.getElementById('dbEditModal');
    if (dbModal) {
      dbModal.style.top = "15%";
      dbModal.style.left = "35%";
      dbModal.classList.add('active');
    }
  };

  window.openEditDbModal = function(index) {
    if (index === -1) {
      window.openNewDbPartModal();
      return;
    }
    currentEditPartIndex = index;
    const item = partsDb[index];
    document.getElementById('dbModalTitle').innerHTML = '<i class="fa-solid fa-edit"></i> 부품 마스터 정보 수정';
    document.getElementById('dbModalPartNo').value = item.partNo;
    document.getElementById('dbModalPartNo').disabled = false; // Enable modification of partNo
    document.getElementById('dbModalCategory').value = (item.category || 'OTHER').toUpperCase();
    document.getElementById('dbModalNameKo').value = item.nameKo || '';
    document.getElementById('dbModalNameEn').value = item.nameEn || '';
    document.getElementById('dbModalUnit').value = item.unit || 'PCS';
    document.getElementById('dbModalPrice').value = item.price || 0;
    document.getElementById('dbModalWeight').value = item.weight || 0;
    document.getElementById('dbModalSpec').value = item.spec || '';
    document.getElementById('dbModalWidth').value = item.width || 1000;
    document.getElementById('dbModalLength').value = item.length || 1000;
    document.getElementById('dbModalHt').value = item.ht || 80;
    document.getElementById('dbModalFh').value = item.fh || 40;
    const holesEl = document.getElementById('dbModalHoles');
    if (holesEl) holesEl.value = item.holes !== undefined ? item.holes : 0;
    // Reset position when showing modaless
    dbModal.style.top = "15%";
    dbModal.style.left = "35%";
    dbModal.classList.add('active');
  };

  window.deleteDbItem = async function(index, event) {
    event.stopPropagation(); // Avoid triggering openEditDbModal row click
    if (confirm('이 부품 마스터 항목을 삭제하시겠습니까? (이 부품을 활용하는 수식이 동작하지 않을 수 있습니다.)')) {
      try {
        const item = partsDb[index];
        if (item.id) {
          await db.collection('parts').doc(item.id).delete();
        } else {
          const querySnap = await db.collection('parts').where('partNo', '==', item.partNo).get();
          if (!querySnap.empty) {
            await querySnap.docs[0].ref.delete();
          }
        }
        partsDb.splice(index, 1);
        localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
        renderDbList();
      } catch (err) {
        console.error("Failed to delete from Firestore:", err);
        alert("Firestore에서 자재를 삭제하는 데 실패했습니다: " + err.message);
      }
    }
  };

  // Helper function to update bulk delete button UI state
  window.updateDbBulkDeleteUI = function() {
    const checkboxes = document.querySelectorAll('.chk-db-row-select');
    const checked = document.querySelectorAll('.chk-db-row-select:checked');
    const btnBulk = document.getElementById('btnDbTabBulkDelete');
    const countSpan = document.getElementById('bulkDeleteCount');
    const btnBulkCat = document.getElementById('btnDbTabBulkCategory');
    const catCountSpan = document.getElementById('bulkCategoryCount');
    const chkAll = document.getElementById('chkDbSelectAll');

    if (countSpan) countSpan.innerText = checked.length;
    if (catCountSpan) catCountSpan.innerText = checked.length;
    
    if (btnBulk) {
      btnBulk.style.display = checked.length > 0 ? 'flex' : 'none';
    }
    if (btnBulkCat) {
      btnBulkCat.style.display = checked.length > 0 ? 'flex' : 'none';
    }

    if (chkAll) {
      if (checkboxes.length > 0 && checked.length === checkboxes.length) {
        chkAll.checked = true;
      } else {
        chkAll.checked = false;
      }
    }
  };

  // Bind Select All checkbox click event
  const chkAll = document.getElementById('chkDbSelectAll');
  if (chkAll) {
    chkAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.chk-db-row-select');
      checkboxes.forEach(chk => {
        chk.checked = e.target.checked;
      });
      updateDbBulkDeleteUI();
    });
  }

  // Row checkboxes change & inline category change event listener delegation
  const tbodyMaster = document.getElementById('tbodyPartsMasterDbList');
  if (tbodyMaster) {
    tbodyMaster.addEventListener('change', async (e) => {
      if (e.target.classList.contains('chk-db-row-select')) {
        updateDbBulkDeleteUI();
      } else if (e.target.classList.contains('inline-cat-select')) {
        e.stopPropagation();
        const sel = e.target;
        const idx = parseInt(sel.getAttribute('data-index'), 10);
        const newCat = sel.value;
        const item = partsDb[idx];
        if (!item) return;

        item.category = newCat;
        sel.style.background = '#dcfce7';
        sel.style.borderColor = '#10b981';
        sel.style.color = '#047857';

        try {
          if (item.id) {
            await db.collection('parts').doc(item.id).set({ category: newCat }, { merge: true });
          } else {
            const querySnap = await db.collection('parts').where('partNo', '==', item.partNo).get();
            if (!querySnap.empty) {
              await querySnap.docs[0].ref.set({ category: newCat }, { merge: true });
            }
          }
        } catch (err) {
          console.warn('Firestore category update failed:', err);
        }

        window.partsDb = partsDb;
        localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
        const catFilterEl = document.getElementById('dbTabCategoryFilter');
        if (catFilterEl && catFilterEl.value) {
          catFilterEl.value = '';
          renderDbList();
        }
      }
    });
  }

  // Close modal helper
  window.closeDbBatchCategoryModal = function() {
    const modal = document.getElementById('dbBatchCategoryModal');
    if (modal) modal.style.display = 'none';
  };

  // Bulk Category Change Button Click Handler (Open Modal)
  const btnBulkCat = document.getElementById('btnDbTabBulkCategory');
  if (btnBulkCat) {
    btnBulkCat.addEventListener('click', () => {
      const checkedBoxes = document.querySelectorAll('.chk-db-row-select:checked');
      if (checkedBoxes.length === 0) return;

      const countSpan = document.getElementById('dbBatchModalItemCount');
      if (countSpan) countSpan.innerText = checkedBoxes.length;

      const modal = document.getElementById('dbBatchCategoryModal');
      if (modal) modal.style.display = 'flex';
    });
  }

  // Modal Confirm Button Click Handler
  const btnConfirmBatchCat = document.getElementById('btnConfirmDbBatchCategory');
  if (btnConfirmBatchCat) {
    btnConfirmBatchCat.addEventListener('click', async () => {
      const checkedBoxes = document.querySelectorAll('.chk-db-row-select:checked');
      if (checkedBoxes.length === 0) {
        closeDbBatchCategoryModal();
        return;
      }

      const selectEl = document.getElementById('dbBatchModalSelect');
      const cleanCat = selectEl ? selectEl.value.trim().toUpperCase() : 'OTHER';

      btnConfirmBatchCat.disabled = true;
      btnConfirmBatchCat.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 적용 중...';

      try {
        const updateIndices = [];
        checkedBoxes.forEach(chk => {
          const idx = parseInt(chk.getAttribute('data-index'), 10);
          if (!isNaN(idx) && partsDb[idx]) {
            updateIndices.push(idx);
          }
        });

        for (let idx of updateIndices) {
          const item = partsDb[idx];
          item.category = cleanCat;
          try {
            if (item.id) {
              await db.collection('parts').doc(item.id).set({ category: cleanCat }, { merge: true });
            } else {
              const querySnap = await db.collection('parts').where('partNo', '==', item.partNo).get();
              if (!querySnap.empty) {
                await querySnap.docs[0].ref.set({ category: cleanCat }, { merge: true });
              }
            }
          } catch (err) {
            console.warn(`Firestore category update failed for partNo: ${item.partNo}`, err);
          }
        }

        window.partsDb = partsDb;
        localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
        
        const catFilterEl = document.getElementById('dbTabCategoryFilter');
        if (catFilterEl) catFilterEl.value = '';

        closeDbBatchCategoryModal();
        renderDbList();
        alert(`선택한 ${updateIndices.length}개 부품의 구분이 '${cleanCat}'(으)로 일괄 변경되었습니다.`);
      } catch (err) {
        console.error('Failed to bulk change category:', err);
        alert('구분 일괄 변경 중 오류가 발생했습니다: ' + err.message);
      } finally {
        btnConfirmBatchCat.disabled = false;
        btnConfirmBatchCat.innerHTML = `<i class="fa-solid fa-check"></i> 일괄 변경 적용`;
        updateDbBulkDeleteUI();
      }
    });
  }

  // Bulk Delete Button Click Handler
  const btnBulkDelete = document.getElementById('btnDbTabBulkDelete');
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', async () => {
      const checkedBoxes = document.querySelectorAll('.chk-db-row-select:checked');
      if (checkedBoxes.length === 0) return;

      if (confirm(`선택한 ${checkedBoxes.length}개의 부품 마스터 항목을 삭제하시겠습니까? (이 부품을 활용하는 수식이 동작하지 않을 수 있습니다.)`)) {
        // Show loading spinner/message if needed
        btnBulkDelete.disabled = true;
        btnBulkDelete.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 삭제 중...';

        try {
          // Collect indices of partsDb to delete
          const deleteIndices = [];
          checkedBoxes.forEach(chk => {
            const idx = parseInt(chk.getAttribute('data-index'), 10);
            deleteIndices.push(idx);
          });

          // Sort in descending order to avoid splice offset issues
          deleteIndices.sort((a, b) => b - a);

          // Delete from Firestore one by one or in batch
          for (let idx of deleteIndices) {
            const item = partsDb[idx];
            try {
              if (item.id) {
                await db.collection('parts').doc(item.id).delete();
              } else {
                const querySnap = await db.collection('parts').where('partNo', '==', item.partNo).get();
                if (!querySnap.empty) {
                  await querySnap.docs[0].ref.delete();
                }
              }
            } catch (err) {
              console.warn(`Firestore delete failed for partNo: ${item.partNo}`, err);
            }
            partsDb.splice(idx, 1);
          }

          localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
          
          // Reset bulk delete UI state
          if (chkAll) chkAll.checked = false;
          updateDbBulkDeleteUI();
          renderDbList();
          alert('선택된 항목들이 성공적으로 삭제되었습니다.');
        } catch (err) {
          console.error("Bulk delete operation encountered error:", err);
          alert("일괄 삭제 처리 중 에러가 발생했습니다: " + err.message);
        }
      }
    });
  }

  // Copy/Duplicate database item
  window.copyDbItem = async function(index, event) {
    event.stopPropagation(); // Avoid triggering openEditDbModal row click
    const sourceItem = partsDb[index];
    if (!sourceItem) return;

    // Create a unique Part No by appending _copy or counting
    let newPartNo = `${sourceItem.partNo}_copy`;
    let count = 1;
    while (partsDb.some(p => p.partNo === newPartNo)) {
      newPartNo = `${sourceItem.partNo}_copy${count}`;
      count++;
    }

    if (confirm(`선택한 부품 '${sourceItem.partNo}'을 새로운 부품번호 '${newPartNo}'(으)로 복사하여 등록하시겠습니까?`)) {
      try {
        const newItem = {
          partNo: newPartNo,
          category: sourceItem.category || 'OTHER',
          nameKo: sourceItem.nameKo ? `${sourceItem.nameKo} (복사)` : '',
          nameEn: sourceItem.nameEn ? `${sourceItem.nameEn} (Copy)` : '',
          unit: sourceItem.unit || 'PCS',
          price: sourceItem.price || 0,
          weight: sourceItem.weight || 0,
          spec: sourceItem.spec || ''
        };

        // Save to Firebase Firestore
        const docRef = await db.collection('parts').add(newItem);
        newItem.id = docRef.id;

        // Push to local memory database
        partsDb.push(newItem);
        localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
        
        renderDbList();
        alert(`부품 복사가 완료되었습니다. (새 부품번호: ${newPartNo})`);
      } catch (err) {
        console.error("Failed to copy/save to Firestore:", err);
        alert("자재 복사 등록에 실패했습니다: " + err.message);
      }
    }
  };

  // Save Panel Config Table Event
  document.getElementById('btnSaveConfigTable').addEventListener('click', () => {
    localStorage.setItem(`water_tank_panel_matrix_opt${sideMatrixOption}`, JSON.stringify(panelMatrix));
    alert(`판넬 구성 매핑 [Option ${sideMatrixOption}] 매트릭스가 성공적으로 개별 저장공간에 저장되었습니다.`);
    renderAll();
  });

  // Switch Side Matrix Configurations (Basic setting vs Options 1..4)
  const btnOpt0 = document.getElementById('btnSideMatrixOpt0');
  const btnOpt1 = document.getElementById('btnSideMatrixOpt1');
  const btnOpt2 = document.getElementById('btnSideMatrixOpt2');
  const btnOpt3 = document.getElementById('btnSideMatrixOpt3');
  const btnOpt4 = document.getElementById('btnSideMatrixOpt4');

  if (btnOpt0 || btnOpt1 || btnOpt2 || btnOpt3 || btnOpt4) {
    const setOptionActive = (optNum) => {
      sideMatrixOption = optNum;
      localStorage.setItem('water_tank_active_option', optNum);

      // Load corresponding option matrix into panelMatrix
      if (optionMatrixStorage[optNum]) {
        panelMatrix = optionMatrixStorage[optNum];
      }

      syncMatrixOptionUI(optNum);
      renderSidePanelConfig();
    };

    if (btnOpt0) btnOpt0.addEventListener('click', () => setOptionActive(0));
    if (btnOpt1) btnOpt1.addEventListener('click', () => setOptionActive(1));
    if (btnOpt2) btnOpt2.addEventListener('click', () => setOptionActive(2));
    if (btnOpt3) btnOpt3.addEventListener('click', () => setOptionActive(3));
    if (btnOpt4) btnOpt4.addEventListener('click', () => setOptionActive(4));
  }

  // Custom Logo Upload Handler
  const logoUpload = document.getElementById('logoUpload');
  logoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        const logoDataUrl = evt.target.result;
        localStorage.setItem('custom_company_logo', logoDataUrl);
        updateLogoUI(logoDataUrl);
      };
      reader.readAsDataURL(file);
    }
  });

  // Load custom logo on start if exists
  const savedLogo = localStorage.getItem('custom_company_logo');
  if (savedLogo) {
    updateLogoUI(savedLogo);
  }
  // Excel Export Download
  const btnExport = document.getElementById('btnExport');
  if (btnExport) {
    btnExport.addEventListener('click', exportToExcel);
  }
  const btnExportBOMExcel = document.getElementById('btnExportBOMExcel');
  if (btnExportBOMExcel) {
    btnExportBOMExcel.addEventListener('click', exportToExcel);
  }
  const btnExportPrintoutExcel = document.getElementById('btnExportPrintoutExcel');
  if (btnExportPrintoutExcel) {
    btnExportPrintoutExcel.addEventListener('click', exportPrintoutSheetToExcel);
  }

  // Excel Import Trigger
  const btnImport = document.getElementById('btnImport');
  const excelFile = document.getElementById('excelFile');
  if (btnImport && excelFile) {
    btnImport.addEventListener('click', (e) => {
      if (e.target !== excelFile) {
        excelFile.click();
      }
    });
    excelFile.addEventListener('change', importFromExcel);
  }

  // Dedicated Master DB Excel Export & Import Listeners
  const btnDbTabExportExcel = document.getElementById('btnDbTabExportExcel');
  if (btnDbTabExportExcel) {
    btnDbTabExportExcel.addEventListener('click', exportMasterDbToExcel);
  }

  const btnDbTabImportExcel = document.getElementById('btnDbTabImportExcel');
  const dbExcelFileInput = document.getElementById('dbExcelFileInput');
  if (btnDbTabImportExcel && dbExcelFileInput) {
    btnDbTabImportExcel.addEventListener('click', (e) => {
      if (e.target !== dbExcelFileInput) {
        dbExcelFileInput.click();
      }
    });
    dbExcelFileInput.addEventListener('change', importMasterDbFromExcel);
  }

  // Auto-calculate Steel Skid total length from Width/Length (Steel_Skid!B45,
  // verified height- and partition-count-independent -- see accessories_engine.js)
  function recalculateSkidLength() {
    if (typeof calcCapa === 'function') calcCapa();
  }

  // Bind input listeners for automatic skid length & capacity recalculation
  [inputL1, inputL2, inputL3, inputL4, inputWidth, inputHeight, inputQty, inputPartition].forEach(input => {
    if (input) input.addEventListener('input', recalculateSkidLength);
  });

  // Calculate once initially
  calcCapa();

  // --- Project database management listeners ---
  const projSelect = document.getElementById('projSelect');

  // Load saved projects list into select dropdown
  const loadProjectList = () => {
    if (!projSelect) return;
    projSelect.innerHTML = '<option value="">-- 프로젝트 선택 --</option>';
    try {
      const savedProjectsJSON = localStorage.getItem('water_tank_projects_db');
      if (savedProjectsJSON) {
        const dbList = JSON.parse(savedProjectsJSON);
        Object.keys(dbList).sort().forEach(projName => {
          const opt = document.createElement('option');
          opt.value = projName;
          opt.textContent = projName;
          projSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.error('Failed to load project database list:', e);
    }
  };

  // Initial load
  loadProjectList();

  // Project Save trigger
  document.getElementById('btnProjSave').addEventListener('click', () => {
    let nameInput = prompt('프로젝트 이름을 입력하세요:', document.getElementById('projectName').value || '');
    if (!nameInput) return;
    nameInput = nameInput.trim();
    if (!nameInput) return;

    try {
      let savedProjectsJSON = localStorage.getItem('water_tank_projects_db');
      const dbList = savedProjectsJSON ? JSON.parse(savedProjectsJSON) : {};

      // Gather current state variables
      const inputs = {};
      const selectors = 'input, select, textarea';
      document.querySelectorAll('#tab-basic-tool ' + selectors).forEach(el => {
        if (el.id) {
          inputs[el.id] = el.type === 'checkbox' ? el.checked : el.value;
        }
      });

      // Save matrix options 1-4
      const matrices = {};
      [1, 2, 3, 4].forEach(opt => {
        const savedOpt = localStorage.getItem(`water_tank_panel_matrix_opt${opt}`);
        if (savedOpt) {
          matrices[opt] = JSON.parse(savedOpt);
        }
      });

      // Store in memory structure
      dbList[nameInput] = {
        inputs: inputs,
        matrices: matrices,
        bomItems: bomItems,
        savedAt: new Date().toISOString()
      };

      localStorage.setItem('water_tank_projects_db', JSON.stringify(dbList));
      alert(`프로젝트 "${nameInput}" 저장이 완료되었습니다.`);
      loadProjectList();
      projSelect.value = nameInput;
    } catch (e) {
      console.error(e);
      alert('프로젝트 저장 도중 오류가 발생했습니다: ' + e.message);
    }
  });

  // Project Select load trigger
  projSelect.addEventListener('change', () => {
    const selectedName = projSelect.value;
    if (!selectedName) return;

    if (!confirm(`프로젝트 "${selectedName}" 구성을 불러오시겠습니까?\n현재 수정 중인 기본 설정 폼 상태는 덮어씌워집니다.`)) {
      projSelect.value = "";
      return;
    }

    try {
      const savedProjectsJSON = localStorage.getItem('water_tank_projects_db');
      if (!savedProjectsJSON) return;
      const dbList = JSON.parse(savedProjectsJSON);
      const projData = dbList[selectedName];
      if (!projData) return;

      // Restore inputs
      if (projData.inputs) {
        Object.keys(projData.inputs).forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            if (el.type === 'checkbox') {
              el.checked = projData.inputs[id];
            } else {
              el.value = projData.inputs[id];
            }
          }
        });
        // Sync active inputs back to localStorage basic draft configs
        localStorage.setItem('water_tank_config_inputs', JSON.stringify(projData.inputs));
      }

      // Restore option matrices
      if (projData.matrices) {
        Object.keys(projData.matrices).forEach(optNum => {
          localStorage.setItem(`water_tank_panel_matrix_opt${optNum}`, JSON.stringify(projData.matrices[optNum]));
          optionMatrixStorage[optNum] = projData.matrices[optNum];
        });
        // Sync active panelMatrix
        if (optionMatrixStorage[sideMatrixOption]) {
          panelMatrix = optionMatrixStorage[sideMatrixOption];
        }
      }

      // Restore bomItems draft
      if (projData.bomItems) {
        bomItems = projData.bomItems;
        localStorage.setItem('water_tank_bom_draft', JSON.stringify(bomItems));
      }

      alert(`프로젝트 "${selectedName}" 불러오기가 완료되었습니다. BOM 자동 생성을 눌러 최종 생성된 자재 목록을 확인하세요.`);
      renderAll();
    } catch (e) {
      console.error(e);
      alert('프로젝트 로드 중 오류가 발생했습니다: ' + e.message);
    }
  });

  // Project Delete trigger
  document.getElementById('btnProjDelete').addEventListener('click', () => {
    const selectedName = projSelect.value;
    if (!selectedName) {
      alert('삭제할 프로젝트를 먼저 드롭다운에서 선택하세요.');
      return;
    }

    if (!confirm(`정말로 프로젝트 "${selectedName}"을(를) 영구 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const savedProjectsJSON = localStorage.getItem('water_tank_projects_db');
      if (savedProjectsJSON) {
        const dbList = JSON.parse(savedProjectsJSON);
        delete dbList[selectedName];
        localStorage.setItem('water_tank_projects_db', JSON.stringify(dbList));
        alert(`프로젝트 "${selectedName}" 삭제를 완료했습니다.`);
        loadProjectList();
      }
    } catch (e) {
      console.error(e);
      alert('프로젝트 삭제 실패: ' + e.message);
    }
  });

  // Local Print Trigger Action (Prints official 2-column Printout Sheet)
  document.getElementById('btnLocalPrint').addEventListener('click', () => {
    if (typeof updatePrintoutSheet === 'function') {
      updatePrintoutSheet();
    }
    window.print();
  });

  // Global beforeprint listener to guarantee official sheet updates before print dialog opens
  window.addEventListener('beforeprint', () => {
    if (typeof updatePrintoutSheet === 'function') {
      updatePrintoutSheet();
    }
  });

  // Bolt Display Mode change trigger
  document.querySelectorAll('input[name="boltDisplayMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      renderAll();
    });
  });

  // Load Default Bolt Recipes Trigger Button
  const btnLoadDefault = document.getElementById('btnLoadDefaultBoltRecipes');
  if (btnLoadDefault) {
    btnLoadDefault.addEventListener('click', () => {
      if (confirm("PART_ID_TABLE(마스터 DB)에서 가져온 기본 볼트/너트/와셔 구성(레시피) 값을 새로 불러오겠습니까? (기존 편집 설정은 덮어쓰여집니다.)")) {
        const defaultRecipes = {};

        // 1. Get all bolts starting with WBT- from partsDb
        let standardBoltParts = partsDb
          .filter(p => (p.category || '').toUpperCase().trim() === 'BOLTS & NUTS' && (p.partNo || '').startsWith('WBT-'))
          .map(p => p.partNo);

        if (standardBoltParts.length === 0) {
          standardBoltParts = [
            "WBT-1035SA4", "WBT-1035HDG", "WBT-1045HDG", "WBT-1240HDG", "WBT-14130PPD", 
            "WBT-14130PSA4", "WBT-1045SA4", "WBT-1060HDG", "WBT-1440HDG", "WBT-1640HDG", "WBT-16100HDG"
          ];
        }

        // Deduplicate list
        standardBoltParts = Array.from(new Set(standardBoltParts));

        standardBoltParts.forEach(boltNo => {
          // Extract material suffix
          let suffix = "";
          let mat = "HDG";
          if (boltNo.endsWith("SA4")) {
            suffix = " (SS316)";
            mat = "SA4";
          } else if (boltNo.endsWith("SA2")) {
            suffix = " (SS304)";
            mat = "SA2";
          } else if (boltNo.endsWith("HDG") || boltNo.endsWith("PD")) {
            suffix = " (HDG)";
            mat = "HDG";
          }

          // Extract size (e.g. M10, M12, M14, M16)
          let size = "M10";
          if (boltNo.includes("12")) size = "M12";
          else if (boltNo.includes("14")) size = "M14";
          else if (boltNo.includes("16")) size = "M16";

          // Find candidate Nut (WNT-*) & Washer (WFW-*) from partsDb
          const boltPart = partsDb.find(p => p.partNo === boltNo) || { partNo: boltNo, nameKo: `Hex Bolt ${boltNo}${suffix}`, nameEn: `Hex Bolt ${boltNo}${suffix}` };
          
          // Let's try exact matches or fallbacks
          const targetNutNo = `WNT-${size}${mat}`;
          const targetWasherNo = `WFW-${size}${mat}`;

          const foundNut = partsDb.find(p => p.partNo === targetNutNo) || partsDb.find(p => p.partNo.startsWith(`WNT-${size}`) && p.partNo.includes(mat)) || { partNo: "", nameKo: `Hex Nut ${size}${suffix}`, nameEn: `Hex Nut ${size}${suffix}` };
          const foundWasher = partsDb.find(p => p.partNo === targetWasherNo) || partsDb.find(p => p.partNo.startsWith(`WFW-${size}`) && p.partNo.includes(mat)) || { partNo: "", nameKo: `Plain Washer ${size}${suffix}`, nameEn: `Plain Washer ${size}${suffix}` };

          defaultRecipes[boltNo] = [
            { 
              partNo: boltNo, 
              partName: boltPart.nameKo || boltPart.nameEn || `Hex Bolt ${boltNo}${suffix}`, 
              ratio: 1 
            },
            { 
              partNo: foundNut.partNo || targetNutNo, 
              partName: foundNut.nameKo || foundNut.nameEn || `Hex Nut ${size}${suffix}`, 
              ratio: 1 
            },
            { 
              partNo: foundWasher.partNo || targetWasherNo, 
              partName: foundWasher.nameKo || foundWasher.nameEn || `Plain Washer ${size}${suffix}`, 
              ratio: 2 
            }
          ];
        });

        boltRecipes = defaultRecipes;
        saveBoltRecipesState();
        alert("PART_ID_TABLE(마스터 DB)에서 표준 규격 매핑 구성을 성공적으로 분석하여 로드했습니다.");
      }
    });
  }
}

function updateLogoUI(logoDataUrl) {
  const wrapper = document.getElementById('companyLogoWrapper');
  wrapper.innerHTML = `<img src="${logoDataUrl}" alt="Company Logo" class="company-logo-img">`;
}

// Generate BOM based on dimension configuration.
//
// PANEL quantities (category "Panels") are computed by panel_engine.js, a
// verified 1:1 port of the original workbook's BASIC_TOOL -> Panel!Y ->
// Panel!Z formula chain (12/12 scenarios cross-checked against the .xlsm
// recalculated in LibreOffice -- see WATANI_BOM_로직분석_보고서.docx).
// It replaces the previous rough Math.ceil(l*w)-style approximation.
//
// Steel Skid total length, Reinforcing quantity, and Tie-Rod quantity ARE now
// backed by EXACT, formula-verified logic (see accessories_engine.js --
// reinforcingQty: 16/16 LibreOffice scenarios matched exactly; tieRodQty:
// 8/8 matched exactly), the same level of fidelity as the Panel engine.
// Bolts & Nuts is now backed by an EXACT per-part re-derivation of
// BoltnNuts!AN5:AZ75 (verified to match the original workbook's cached
// values exactly -- see boltsAndNutsParts comments), the same fidelity
// level as Panels/Steel Skid/Reinforcing/Tie-Rod.
// Accessories (ladder) are NOT yet backed by a verified formula set and
// remain a rough proportional estimate below -- flagged so nobody mistakes
// it for a verified number the way Panels/Steel Skid/Reinforcing/Tie-Rod/
// Bolts&Nuts now are.
function generateDefaultBOMFromConfig() {
  const l1 = parseFloat(document.getElementById('tankLength1').value) || 0;
  const l2 = parseFloat(document.getElementById('tankLength2').value) || 0;
  const l3 = parseFloat(document.getElementById('tankLength3').value) || 0;
  const l4 = parseFloat(document.getElementById('tankLength4').value) || 0;
  const l = l1 + l2 + l3 + l4;

  const w = parseFloat(document.getElementById('tankWidth').value) || 1;
  const h = parseFloat(document.getElementById('tankHeight').value) || 1;
  const q = parseInt(document.getElementById('tankQty').value) || 1;
  const partitionsInput = parseInt(document.getElementById('numPartition').value) || 0;
  const skidLen = parseFloat(document.getElementById('skidLength').value) || 0;
  const skidTypeEl = document.getElementById('steelSkidOpt');
  const skidType = skidTypeEl ? skidTypeEl.value : 'angle75';

  const isInsulated = document.getElementById('insulationType').value === 'Insulated';
  const boltSpec = document.getElementById('boltMaterial').value;
  const isIntReinf = document.getElementById('reinfMethod').value === 'Internal';
  const sidePanelOnlyEl = document.getElementById('sidePanelOnly');
  const sidePanelOnly = sidePanelOnlyEl && sidePanelOnlyEl.value === '1x1' ? '1x1' : 'DEFAULT';
  const partitionPanelOnlyEl = document.getElementById('partitionPanelOnly');
  const partitionPanelOnly = partitionPanelOnlyEl && partitionPanelOnlyEl.value === '1x1' ? '1x1' : 'DEFAULT';

  bomItems = [];

  // 1. PANELS -- verified engine (geometry -> course stacking -> quantity rules -> catalog)
  // Resolve part number dynamically by mapping catalog code to user panel config grid matrix overrides
  const lookupPart = (partNo) => partsDb.find(p => p.partNo === partNo) || null;
  
  // Resolver that translates the engine's exact catalog key (e.g.
  // "side.TOP_15.side") to any user override stored in panelMatrix, before
  // doing the partsDb lookup. Matching is by exact key -- no more guessing
  // a "position" from the part-number string.
  const resolvePanelPartNoAndLookup = (catalogPartNo, catalogKey) => {
    const hGrade = `${h}mH`;
    const row = catalogKey ? panelMatrix.find(r => r.key === catalogKey) : null;
    if (row && row.heightGrades && row.heightGrades[hGrade]) {
      const overriddenPartNo = row.heightGrades[hGrade];
      if (overriddenPartNo && overriddenPartNo !== '-- 선택안함 --') {
        return lookupPart(overriddenPartNo);
      }
    }
    return lookupPart(catalogPartNo);
  };

  let N_PA = partitionsInput; // fallback if the engine throws before we get a real value
  try {
    const engineResult = PanelEngine.computePanelBomItems(
      { W: w, L1: l1, L2: l2, L3: l3, L4: l4, H: h, qty: q },
      resolvePanelPartNoAndLookup,
      { sidePanelOnly: sidePanelOnly, partitionPanelOnly: partitionPanelOnly }
    );
    engineResult.items.forEach(item => {
      // Translate partNo for items with a matrix override, matched by the
      // engine's own exact catalog key (e.g. "side.TOP_15.side") -- no
      // guessing from the part-number string.
      const hGrade = `${h}mH`;
      const row = item.catalogKey ? panelMatrix.find(r => r.key === item.catalogKey) : null;
      if (row && row.heightGrades && row.heightGrades[hGrade]) {
        const overridden = row.heightGrades[hGrade];
        if (overridden && overridden !== '-- 선택안함 --') {
          item.partNo = overridden;
          const match = partsDb.find(p => p.partNo === overridden);
          if (match) {
            item.partName = match.nameKo || match.nameEn;
            item.spec = match.spec;
            item.price = Number(match.price) || 0;
            item.weight = Number(match.weight) || 0;
          }
        }
      }
      bomItems.push(item);
    });
    N_PA = engineResult.geometry.N_PA;
    if (engineResult.warnings.length) {
      console.warn('[PanelEngine]', engineResult.warnings.join(' | '));
    }
    // The number of partitions is DERIVED from which of Length2/3/4 are > 0
    // (this mirrors BASIC_TOOL!K9 in the original workbook) -- it is not a
    // free-standing input. Let the user know if their "No. of Partition"
    // field disagrees with what the geometry implies.
    if (N_PA !== partitionsInput) {
      console.warn(`[PanelEngine] "No. of Partition" 입력값(${partitionsInput})이 Length2/3/4로부터 계산된 실제 격벽수(${N_PA})와 다릅니다. 패널 수량은 격벽수 ${N_PA} 기준으로 계산되었습니다.`);
    }

    // 1b. ETC (Air Vent, Roof Supporter) -- verified via LibreOffice ground
    // truth (BASIC_TOOL/ETC sheets, 3 scenarios) same as Panels above.
    const g = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const nominalCapa = AccessoriesEngine.nominalCapaM3(w, l, h);
    const airVent = AccessoriesEngine.airVent(
      g.W.whole, [g.L1.whole, g.L2.whole, g.L3.whole, g.L4.whole], nominalCapa
    );
    if (airVent.qty > 0) {
      const found = lookupPart(airVent.partNo);
      bomItems.push({
        category: "ETC", partNo: airVent.partNo,
        partName: (found && (found.nameKo || found.nameEn)) || "Air Vent",
        qty: airVent.qty * q, unit: "PCS",
        spec: (found && found.spec) || "Air Vent (capacity-graded)",
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    }
    const roofSup = AccessoriesEngine.roofSupporter(g);
    if (roofSup.qty > 0) {
      const found = lookupPart(roofSup.partNo);
      bomItems.push({
        category: "ETC", partNo: roofSup.partNo,
        partName: (found && (found.nameKo || found.nameEn)) || "Roof Supporter",
        qty: roofSup.qty * q, unit: "PCS",
        spec: (found && found.spec) || `Roof Supporter (${h}mH)`,
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    }
  } catch (err) {
    // Dimensions that aren't multiples of 0.5m (or an unsupported height)
    // can't be expressed by the 0.5/1.0/1.5/2.0m panel module system --
    // abort rather than silently emitting wrong panel/ETC quantities.
    alert(`패널/ETC 수량 계산 오류: ${err.message}`);
    console.error(err);
    return;
  }

  // 2. STEEL SKID -- EXACTLY re-derived from Steel_Skid!AM8:AP53 (three real
  // parallel part families: 75mm Angle / 125mm Channel / 150mm Channel-Heavy,
  // each fully length-segmented) -- see accessories_engine.js
  // steelSkidDetailedParts() / accessories_rules.js steelSkidDetailed for
  // full provenance. Verified to match the original workbook's own cached
  // values EXACTLY (225/225 across 9 distinct parts for the test scenario,
  // for all 3 types) -- this REPLACES the previous single generic-SKU
  // "U Channel-100/125 x total meters" approximation, which turned out not
  // to reflect the real catalog. The "Skid Length (m)" field is now
  // informational only (no longer feeds quantity/part selection); "Steel
  // Skid Type" selects which of the 3 real part families to use.
  try {
    const gSkid = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const { parts: skidParts } = AccessoriesEngine.steelSkidDetailedParts(gSkid, skidType);
    skidParts.forEach((sp) => {
      const found = lookupPart(sp.partNo);
      bomItems.push({
        category: "Steel Skid", partNo: sp.partNo,
        partName: (found && (found.nameKo || found.nameEn)) || sp.partNo,
        qty: sp.qty * q, unit: "PCS",
        spec: (found && found.spec) || "Steel Skid frame/bracket (formula-verified)",
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    });
  } catch (err) {
    console.error('[SteelSkid]', err);
  }

  // 3. REINFORCING + TIE-ROD -- EXACTLY verified against LibreOffice ground
  // truth (EXT_REINF/INT_REINF_INT: 16/16 scenarios; EXT_TIE_ROD: 8/8
  // scenarios). Per-row real catalog part numbers (see accessories_engine.js
  // reinforcingParts / accessories_rules.js reinforcing.*.partNumbers) are
  // verified against EXT_REINF!M8:M93 / INT_REINF_INT!L8:L55 -- every row's
  // formula maps 1:1 to a real WFB-/WCA-/WFR-/WBR-/WCP-/WCB- part, and the
  // per-part quantities sum EXACTLY back to the already-verified total
  // (checked across 6 scenarios incl. partitions/H=4.5/H=5, zero discrepancy).
  // Parts whose number depends on material grade (SA2/SA4 suffix) follow
  // BASIC_TOOL!$E$21's exact behavior: only the "EXT:HDG+INT:SS316" choice
  // yields SA4, every other Bolts & Nuts spec (including "ALL:SS316") falls
  // through to SA2 -- a quirk of the original spreadsheet, not a simplification.
  // Internal reinforcing uses a SEPARATE Tie-Rod subsystem (INT_TIE_ROD in
  // the reference workbook -- reverse-engineered and verified end-to-end
  // against the workbook's own cached values; see accessories_rules.js
  // Rules.tieRodInternal / accessories_engine.js tieRodInternalParts()).
  // Both systems are mutually exclusive (External uses `tieRod`/WTR-12M300Z,
  // Internal uses `tieRodInternal`'s own TR-12M####/M12 NUT&BW/TC-12M60 SKUs).
  try {
    const gReinf = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const isSA4 = parseInt(boltSpec, 10) === 2;
    const { parts: reinfParts, unmapped } = AccessoriesEngine.reinforcingParts(gReinf, isIntReinf, isSA4, sidePanelOnly === '1x1');
    if (unmapped.length) console.warn('[AccessoriesEngine] Reinforcing: 부품번호 매핑 누락 row:', unmapped);
    reinfParts.forEach((rp) => {
      const found = lookupPart(rp.partNo);
      bomItems.push({
        category: "Reinforcing", partNo: rp.partNo,
        partName: (found && (found.nameKo || found.nameEn)) || rp.partNo,
        qty: rp.qty * q, unit: "PCS",
        spec: (found && found.spec) || (isIntReinf ? "Internal reinforcement (formula-verified)" : "External reinforcement (formula-verified)"),
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    });
    if (!isIntReinf) {
      const tieRodQty = AccessoriesEngine.tieRodQty(gReinf) * q;
      if (tieRodQty > 0) {
        const found = lookupPart("WTR-12M300Z");
        bomItems.push({ category: "Tie Rod", partNo: "WTR-12M300Z", partName: (found && (found.nameKo || found.nameEn)) || "External Tie-Rod Assembly (HDG)", qty: tieRodQty, unit: "PCS", spec: (found && found.spec) || "Tie-rod + nut/washer/coupler/anchor set (formula-verified)", price: (found && Number(found.price)) || 6.2, weight: (found && Number(found.weight)) || 1.8 });
      }
    } else {
      const internalTieRodEl = document.getElementById('internalTieRod');
      const isTieRodSA4 = !internalTieRodEl || internalTieRodEl.value !== 'SS304';
      const { parts: tieRodIntParts } = AccessoriesEngine.tieRodInternalParts(gReinf, isTieRodSA4);
      tieRodIntParts.forEach((tp) => {
        const found = lookupPart(tp.partNo);
        bomItems.push({
          category: "Tie Rod", partNo: tp.partNo,
          partName: (found && (found.nameKo || found.nameEn)) || tp.partNo,
          qty: tp.qty * q, unit: "PCS",
          spec: (found && found.spec) || "Internal Tie-Rod component (formula-verified)",
          price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
        });
      });
    }
  } catch (err) {
    console.warn('[AccessoriesEngine] Reinforcing/Tie-Rod 계산 오류, 대체(추정) 로직 사용:', err);
    if (isIntReinf) {
      const intQty = Math.ceil((l + w) * h * 4) * q;
      bomItems.push({ category: "Reinforcing", partNo: "WFB-0950SA4", partName: "Internal Support Rod (SS316)", qty: intQty, unit: "PCS", spec: "SS316 Internal reinforcement rod (fallback estimate)", price: 8.5, weight: 2.1 });
    } else {
      const extQty = Math.ceil((l + w) * 2 * h) * q;
      bomItems.push({ category: "Reinforcing", partNo: "WCA-1000Z", partName: "External HDG Corner Angle", qty: extQty, unit: "PCS", spec: "External steel bracket corner (fallback estimate)", price: 5.4, weight: 4.8 });
    }
  }

  // 3b. SEALING TAPE (3mm PVC) -- per-panel-role unit length x live panel
  // count, verified against the reference workbook's Panel sheet (see
  // panel_catalog.js SEALING_TAPE_3MM_PVC_BY_ROLE + PanelEngine.
  // sealingTapeDetail()). Sold in 30M rolls (WST-P0050RO) -- qty here is
  // rolls, rounded up, since a partial roll still has to be purchased whole.
  try {
    const sealingTape = PanelEngine.sealingTapeDetail({ W: w, L1: l1, L2: l2, L3: l3, L4: l4, H: h }, { sidePanelOnly, partitionPanelOnly });
    const totalMeters = sealingTape.totalMeters * q;
    if (totalMeters > 0) {
      const rolls = Math.ceil(totalMeters / 30);
      const found = lookupPart("WST-P0050RO");
      bomItems.push({
        category: "Reinforcing", partNo: "WST-P0050RO",
        partName: (found && (found.nameKo || found.nameEn)) || "RF,BF,SF PVC SEALANT 30M(50mmx3mm)",
        qty: rolls, unit: "Roll",
        spec: (found && found.spec) || `Sealing tape, ${totalMeters}m required (formula-verified, 30M/Roll)`,
        price: (found && Number(found.price)) || 3.06, weight: (found && Number(found.weight)) || 15,
      });
    }
  } catch (err) {
    console.warn('[PanelEngine] Sealing tape 계산 오류:', err);
  }

  // 4. BOLTS AND NUTS -- EXACTLY re-derived from BoltnNuts!AN5:AZ75 (~50
  // structural bolt/nut/washer assembly positions, each mapped to its real
  // catalog part per material option) -- see accessories_engine.js
  // boltsAndNutsParts() / accessories_rules.js boltsAndNuts for full
  // provenance. Verified to match the original workbook's own cached values
  // EXACTLY (5270/5270 across 18 distinct parts for the test scenario) --
  // this REPLACES the previous single-lump "~3-8% margin" approximation.
  // boltSpec here is the numeric BASIC_TOOL!E21-equivalent option (1-6, see
  // the <select id="boltMaterial"> options / accessories_rules.js
  // boltsAndNuts.materialOptions for the real dropdown text).
  try {
    const gBolts = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const materialOption = parseInt(boltSpec, 10) || 2;
    // Bolt Logic & Audit SETTING panel (bolt_logic_audit.js) lets the user
    // rename a catalog entry's BOLT NAME -- pull those overrides in here so
    // the real BOM actually reflects what was configured there.
    const catalogOverrides = (typeof getBoltCatalogOverrides === 'function') ? getBoltCatalogOverrides() : null;
    const { parts: boltParts } = AccessoriesEngine.boltsAndNutsParts(gBolts, isIntReinf, materialOption, catalogOverrides, sidePanelOnly === '1x1');
    boltParts.forEach((bp) => {
      const found = lookupPart(bp.partNo);
      bomItems.push({
        category: "Bolts & Nuts", partNo: bp.partNo,
        partName: (found && (found.nameKo || found.nameEn)) || bp.partNo,
        qty: bp.qty * q, unit: "PCS",
        spec: (found && found.spec) || "Structural bolt/nut/washer (formula-verified)",
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    });

    // Custom section-added bolt rows
    const customRows = (typeof getCustomBoltRows === 'function') ? getCustomBoltRows() : [];
    customRows.forEach((cr) => {
      const totalQty = (cr.qty + cr.add) * q;
      if (totalQty > 0) {
        const found = lookupPart(cr.item);
        bomItems.push({
          category: "Bolts & Nuts",
          partNo: cr.item,
          partName: (found && (found.nameKo || found.nameEn)) || cr.loc || cr.item,
          qty: totalQty,
          unit: "PCS",
          spec: (found && found.spec) || "Custom section-added bolt item",
          price: (found && Number(found.price)) || 0,
          weight: (found && Number(found.weight)) || 0,
        });
      }
    });
  } catch (err) {
    console.warn('[AccessoriesEngine] Bolts & Nuts 계산 오류, 대체(추정) 로직 사용:', err);
    const totalPanels = bomItems
      .filter(it => it.category === "Panels")
      .reduce((sum, it) => sum + it.qty, 0);
    const totalBolts = Math.ceil(totalPanels * 32) * q;
    const isSS316Fallback = boltSpec === "2" || boltSpec === "6";
    const bPart = isSS316Fallback ?
      { partNo: "WBT-1480SA4", partName: "M14x80 SS316 Bolt/Nut", price: 0.85, weight: 0.12 } :
      { partNo: "WBT-1480RD", partName: "M14x80 HDG Bolt/Nut", price: 0.45, weight: 0.13 };
    bomItems.push({ category: "Bolts & Nuts", partNo: bPart.partNo, partName: bPart.partName, qty: totalBolts, unit: "PCS", spec: `Structural bolt/nut assembly (fallback estimate)`, price: bPart.price, weight: bPart.weight });
  }

  // 5. ACCESSORIES -- dynamic height-dependent Ladder
  // Ladder (Internal: SS316, External: HDG). Qty follows the same "N_PA + 1" pattern.
  const ladderQty = (N_PA + 1) * q;
  const hMm = Math.round(h * 1000);
  
  const intLadderPartNo = `WLD-${hMm}FI`;
  const extLadderPartNo = `WLD-${hMm}ZO`;
  
  const foundInt = lookupPart(intLadderPartNo);
  const foundExt = lookupPart(extLadderPartNo);
  
  bomItems.push({
    category: "Accessories",
    partNo: intLadderPartNo,
    partName: (foundInt && (foundInt.nameKo || foundInt.nameEn)) || `Internal Ladder (${h}mH)`,
    qty: ladderQty,
    unit: "SET",
    spec: (foundInt && foundInt.spec) || `Internal access ladder ${h}mH`,
    price: (foundInt && Number(foundInt.price)) || 120.0,
    weight: (foundInt && Number(foundInt.weight)) || (h * 3.0)
  });
  
  bomItems.push({
    category: "Accessories",
    partNo: extLadderPartNo,
    partName: (foundExt && (foundExt.nameKo || foundExt.nameEn)) || `External Ladder (${h}mH)`,
    qty: ladderQty,
    unit: "SET",
    spec: (foundExt && foundExt.spec) || `External access ladder ${h}mH`,
    price: (foundExt && Number(foundExt.price)) || 85.0,
    weight: (foundExt && Number(foundExt.weight)) || (h * 4.4)
  });

  saveAndRender();
}

function saveBoltRecipesState() {
  localStorage.setItem("water_tank_bolt_recipes", JSON.stringify(boltRecipes));
  if (typeof renderBoltRecipes === 'function') {
    renderBoltRecipes();
  }
  if (typeof updatePrintoutSheet === 'function') {
    updatePrintoutSheet();
  }
}

// Render Functions
function renderAll() {
  renderDbList();
  renderSidePanelConfig();
  renderBOM();
  renderCOST();
  renderWEIGHT();
  calculateWidgets();
  if (typeof calcCapa === 'function') {
    calcCapa();
  }
  if (typeof updatePrintoutSheet === 'function') {
    updatePrintoutSheet();
  }
  if (typeof renderBoltRecipes === 'function') {
    renderBoltRecipes();
  }
  if (typeof renderBoltAuditView === 'function') {
    renderBoltAuditView();
  }
  if (typeof window.PalletPacking !== 'undefined' && typeof window.PalletPacking.syncPendingFromBOM === 'function') {
    window.PalletPacking.syncPendingFromBOM();
  }
  if (typeof window.enableAllTableResizing === 'function') {
    window.enableAllTableResizing();
  }
}

// Render Bolt Recipes Tab UI Table
function renderBoltRecipes() {
  const tbody = document.getElementById('tbodyBoltRecipes');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Standard Bolt parts from database or system specification rules
  let standardBoltParts = partsDb
    .filter(p => (p.category || '').toUpperCase().trim() === 'BOLTS & NUTS' && (p.partNo || '').startsWith('WBT-'))
    .map(p => p.partNo);

  // If database hasn't loaded yet or is empty, fallback to rules catalog ids
  if (standardBoltParts.length === 0) {
    standardBoltParts = [
      "WBT-1035SA4", "WBT-1035HDG", "WBT-1045HDG", "WBT-1240HDG", "WBT-14130PPD", 
      "WBT-14130PSA4", "WBT-1045SA4", "WBT-1060HDG", "WBT-1440HDG", "WBT-1640HDG", "WBT-16100HDG"
    ];
  }

  // Deduplicate list
  standardBoltParts = Array.from(new Set(standardBoltParts));

  // Retrieve options for dropdown from partsDb
  // Filter WNT- (Nuts), WFW- (Plain Washers), WSW- (Spring Washers), WRW- (Rubber Washers/Gaskets) etc.
  const allSubParts = partsDb
    .filter(p => {
      const pNo = (p.partNo || '').toUpperCase();
      return pNo.startsWith('WNT-') || pNo.startsWith('WFW-') || pNo.startsWith('WSW-') || pNo.startsWith('WRW-') || pNo.startsWith('WNP-') || pNo.startsWith('WBP-');
    })
    .map(p => p.partNo);

  const subPartOptions = [''].concat(Array.from(new Set(allSubParts)));

  standardBoltParts.forEach(boltNo => {
    // If recipe doesn't exist for this bolt part, initialize it with basic 3 items
    if (!boltRecipes[boltNo]) {
      let suffix = "";
      if (boltNo.endsWith("SA4")) suffix = " (SS316)";
      else if (boltNo.endsWith("SA2")) suffix = " (SS304)";
      else if (boltNo.endsWith("HDG") || boltNo.endsWith("PD")) suffix = " (HDG)";

      boltRecipes[boltNo] = [
        { partNo: boltNo, partName: `Hex Bolt ${boltNo}${suffix}`, ratio: 1 },
        { partNo: "", partName: `Hex Nut${suffix}`, ratio: 1 },
        { partNo: "", partName: `Plain Washer${suffix}`, ratio: 2 }
      ];
    }

    const items = boltRecipes[boltNo];

    // Build items HTML list dynamically - Horizontal Row Layout instead of Vertical Stacking
    let itemsHtml = '<div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:12px; align-items:center; width:100%;">';
    
    items.forEach((item, idx) => {
      const isBolt = idx === 0; // First item is always the main bolt

      // Build selection input/dropdown
      let componentSelectorHtml = "";
      if (isBolt) {
        componentSelectorHtml = `<input type="text" readonly value="${item.partNo}" style="width: 120px; padding: 4px 6px; background:#f1f5f9; border: 1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:11px;">`;
      } else {
        componentSelectorHtml = `
          <select onchange="updatePrelistedRecipePartNo('${boltNo}', ${idx}, this.value)" style="width: 120px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:11px; color:var(--text-primary); outline:none; background:#fff; cursor:pointer;">
            ${subPartOptions.map(opt => `<option value="${opt}" ${item.partNo === opt ? 'selected' : ''}>${opt || '-- 선택안함 --'}</option>`).join('')}
          </select>
        `;
      }

      // Label prefix colors
      let typeLabel = "Bolt";
      let labelColor = "#3b82f6";
      let fieldBg = "rgba(59, 130, 246, 0.05)";
      if (idx === 1) { typeLabel = "Nut"; labelColor = "#10b981"; fieldBg = "rgba(16, 185, 129, 0.05)"; }
      else if (idx === 2) { typeLabel = "Washer"; labelColor = "#f59e0b"; fieldBg = "rgba(245, 158, 11, 0.05)"; }
      else if (idx > 2) { typeLabel = `자재 ${idx}`; labelColor = "#8b5cf6"; fieldBg = "rgba(139, 92, 246, 0.05)"; }

      itemsHtml += `
        <div style="display: flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 6px; background: ${fieldBg};">
          <span style="font-size:11px; font-weight:bold; color:${labelColor}; margin-right:2px;">${typeLabel}</span>
          ${componentSelectorHtml}
          <span style="font-size:10px; color:var(--text-secondary); margin-left: 4px;">배율:</span>
          <input type="number" step="any" value="${item.ratio || 0}" ${isBolt ? 'readonly style="width: 32px; padding:4px; border:1px solid var(--border-color); border-radius:4px; text-align:right; font-size:11px; background:#f1f5f9;"' : `onchange="updatePrelistedRecipe('${boltNo}', ${idx}, 'ratio', parseFloat(this.value) || 0)" style="width: 32px; padding:4px; border:1px solid var(--border-color); border-radius:4px; text-align:right; font-size:11px;"`} >
          ${!isBolt ? `<button type="button" class="btn btn-sm btn-outline" onclick="deleteRecipeComponent('${boltNo}', ${idx}); event.stopPropagation();" style="padding: 2px 4px; color:var(--neon-rose); border-color:var(--neon-rose); font-size:10px; cursor:pointer; height:22px; display:flex; align-items:center; margin-left:2px;"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
      `;
    });

    itemsHtml += `
      <button type="button" class="btn btn-sm btn-secondary" onclick="addRecipeComponent('${boltNo}'); event.stopPropagation();" style="padding: 4px 8px; font-size: 11px; cursor:pointer; height:30px; display:flex; align-items:center; gap:4px; white-space:nowrap;"><i class="fa-solid fa-plus"></i> 구성 추가</button>
    </div>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 10px 8px; vertical-align: middle; width: 12%;">
        <strong style="font-family: monospace; font-size:12.5px; white-space:nowrap;">${boltNo}</strong>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">(Bolt Set 품번)</div>
      </td>
      <td style="padding: 10px 8px; vertical-align: middle; width: 78%;">
        ${itemsHtml}
      </td>
      <td align="center" style="vertical-align: middle; padding: 10px 8px; width: 10%;">
        <button class="btn btn-sm btn-outline" onclick="resetPrelistedRecipe('${boltNo}')" style="color:var(--text-secondary); border-color:var(--border-color); font-size:11px; padding: 5px 8px; white-space:nowrap;"><i class="fa-solid fa-rotate-left"></i> 초기화</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Prelisted Recipe Mutators (Auto-resolves PartName on PartNo selection)
window.updatePrelistedRecipePartNo = function(boltNo, subIdx, selectedPartNo) {
  if (boltRecipes[boltNo] && boltRecipes[boltNo][subIdx]) {
    boltRecipes[boltNo][subIdx].partNo = selectedPartNo;
    
    // Look up part in partsDb to auto-assign its human-readable name
    const found = partsDb.find(p => p.partNo === selectedPartNo);
    if (found) {
      boltRecipes[boltNo][subIdx].partName = found.nameKo || found.nameEn || selectedPartNo;
    } else {
      boltRecipes[boltNo][subIdx].partName = "";
    }
    saveBoltRecipesState();
  }
};

window.updatePrelistedRecipe = function(boltNo, subIdx, field, val) {
  if (boltRecipes[boltNo] && boltRecipes[boltNo][subIdx]) {
    boltRecipes[boltNo][subIdx][field] = val;
    saveBoltRecipesState();
  }
};

window.resetPrelistedRecipe = function(boltNo) {
  if (confirm(`볼트 세트 "${boltNo}" 레시피를 기본 배율 값으로 초기화하시겠습니까?`)) {
    delete boltRecipes[boltNo];
    saveBoltRecipesState();
  }
};

window.addRecipeComponent = function(boltNo) {
  if (boltRecipes[boltNo]) {
    boltRecipes[boltNo].push({ partNo: "", partName: "", ratio: 1 });
    saveBoltRecipesState();
  }
};

window.deleteRecipeComponent = function(boltNo, idx) {
  if (boltRecipes[boltNo]) {
    boltRecipes[boltNo].splice(idx, 1);
    saveBoltRecipesState();
  }
};

// Sub tab navigation inside the integrated BOM/Cost/Weight tab
window.switchBomSubTab = function(subTab) {
  // Toggle sub-tab buttons
  document.querySelectorAll('.bom-sub-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = Array.from(document.querySelectorAll('.bom-sub-btn')).find(btn => 
    btn.getAttribute('onclick').includes(`'${subTab}'`)
  );
  if (activeBtn) activeBtn.classList.add('active');

  // Toggle sub panels
  document.querySelectorAll('.bom-subpanel').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });
  const activePanel = document.getElementById(`bom-subpanel-${subTab}`);
  if (activePanel) {
    activePanel.style.display = 'flex';
    activePanel.classList.add('active');
  }
};

// Modal handlers for official printable requirements list preview
window.openPrintoutSheetPreview = function() {
  const modal = document.getElementById('printoutPreviewModal');
  if (modal) {
    modal.style.display = 'flex';
    if (typeof updatePrintoutSheet === 'function') {
      updatePrintoutSheet();
    }
  }
};

window.closePrintoutSheetPreview = function() {
  const modal = document.getElementById('printoutPreviewModal');
  if (modal) modal.style.display = 'none';
};

// Export active printout requirements sheet to Excel (Exact 2-Column Printout Sheet Layout)
window.exportPrintoutSheetToExcel = function() {
  try {
    if (typeof updatePrintoutSheet === 'function') {
      updatePrintoutSheet();
    }

    const wb = XLSX.utils.book_new();

    const getTxt = (id, def = '') => {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : def;
    };

    // Header metadata block (Rows 0 to 8)
    const headerRows = [
      ["Panels and Accessories Requirement List", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["Sold to : " + getTxt('sheetSoldTo', 'MEP'), "", "", "", "Project Name : " + getTxt('sheetProjectName', 'A Project'), "", ""],
      ["", "", "", "", "", "", ""],
      ["▣ Order No : " + getTxt('sheetOrderNo', 'WA-2022-01'), "", "", "", "▣ Panel : " + getTxt('sheetPanelInsul', 'Non-Insulated') + " / " + getTxt('sheetPanelComp', ''), "", ""],
      ["▣ Size : " + getTxt('sheetSizeFormula', ''), "", "", "", "▣ Bolts and Nuts : " + getTxt('sheetBoltsNuts', ''), "", ""],
      ["▣ Reinforcement : " + getTxt('sheetReinfMethod', ''), "", "", "", "▣ External Accessories : " + getTxt('sheetExtAcc', ''), "", ""],
      ["▣ Steel Skid : " + getTxt('sheetSteelSkid', ''), "", "", "", "▣ Internal Accessories : " + getTxt('sheetIntAcc', ''), "", ""],
      ["", "", "", "", "", "", ""]
    ];

    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Document Title
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }, // Sold to
      { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } }, // Project Name
      { s: { r: 4, c: 0 }, e: { r: 4, c: 3 } }, // Order No
      { s: { r: 4, c: 4 }, e: { r: 4, c: 6 } }, // Panel
      { s: { r: 5, c: 0 }, e: { r: 5, c: 3 } }, // Size
      { s: { r: 5, c: 4 }, e: { r: 5, c: 6 } }, // Bolts
      { s: { r: 6, c: 0 }, e: { r: 6, c: 3 } }, // Reinforcement
      { s: { r: 6, c: 4 }, e: { r: 6, c: 6 } }, // Ext Acc
      { s: { r: 7, c: 0 }, e: { r: 7, c: 3 } }, // Skid
      { s: { r: 7, c: 4 }, e: { r: 7, c: 6 } }  // Int Acc
    ];

    // Helper to read items from a tbody element
    const parseSection = (title, tbodyId, showTotal = false, totalId = "", showPanelTotal = false, panelTotalId = "") => {
      const items = [];
      const tbody = document.getElementById(tbodyId);
      if (tbody) {
        tbody.querySelectorAll('tr').forEach(tr => {
          const tds = tr.querySelectorAll('td');
          if (tds.length >= 3) {
            const name = tds[0].textContent.trim();
            const partNo = tds[1].textContent.trim();
            const qtyStr = tds[2].textContent.trim();
            if (name && name !== "No Item") {
              items.push({
                name: name,
                partNo: partNo,
                qty: isNaN(parseInt(qtyStr, 10)) ? qtyStr : parseInt(qtyStr, 10)
              });
            }
          }
        });
      }
      if (items.length === 0) {
        items.push({ name: "No Item", partNo: "", qty: "" });
      }

      let totalQty = 0;
      if (showTotal && totalId) {
        const totEl = document.getElementById(totalId);
        if (totEl) totalQty = parseInt(totEl.textContent.trim(), 10) || 0;
      }

      let panelTotalQty = 0;
      if (showPanelTotal && panelTotalId) {
        const pTotEl = document.getElementById(panelTotalId);
        if (pTotEl) panelTotalQty = parseInt(pTotEl.textContent.trim(), 10) || 0;
      }

      return { title, items, showTotal, totalQty, showPanelTotal, panelTotalQty };
    };

    // Left Column Sections
    const leftSections = [
      parseSection("Roof/Manhole Panels", "sheetBodyRoof", true, "sheetTotalRoof"),
      parseSection("Bottom/Drain Panels", "sheetBodyBottom", true, "sheetTotalBottom"),
      parseSection("Side Panels", "sheetBodySide", true, "sheetTotalSide"),
      parseSection("Partition Panels", "sheetBodyPartition", true, "sheetTotalPartition", true, "sheetTotalPanelsGlobal"),
      parseSection("Steel Skid", "sheetBodySkid", false)
    ];

    // Right Column Sections
    const rightSections = [
      parseSection("Bolts & Nuts", "sheetBodyBolts", false),
      parseSection("Internal Reinforcing", "sheetBodyIntReinf", false),
      parseSection("External Reinforcing", "sheetBodyExtReinf", false),
      parseSection("Internal Tie-Rod", "sheetBodyTieRod", false),
      parseSection("Etc", "sheetBodyEtc", false),
      parseSection("Fittings & Sockets", "sheetBodyFittings", false)
    ];

    // Build left rows list and merges
    const leftRows = [];
    const leftMerges = [];

    leftSections.forEach(sec => {
      const startR = leftRows.length;
      leftRows.push([sec.title, "", ""]);
      leftMerges.push({ s: { r: startR, c: 0 }, e: { r: startR, c: 2 } });

      leftRows.push(["Paer name", "Part No,", "Q'ty"]);

      sec.items.forEach(it => {
        leftRows.push([it.name, it.partNo, it.qty]);
      });

      if (sec.showTotal) {
        const tR = leftRows.length;
        leftRows.push(["TOTAL", "", sec.totalQty]);
        leftMerges.push({ s: { r: tR, c: 0 }, e: { r: tR, c: 1 } });
      }

      if (sec.showPanelTotal) {
        const ptR = leftRows.length;
        leftRows.push(["PANEL TOTAL", "", sec.panelTotalQty]);
        leftMerges.push({ s: { r: ptR, c: 0 }, e: { r: ptR, c: 1 } });
      }

      leftRows.push(["", "", ""]);
    });

    // Build right rows list and merges
    const rightRows = [];
    const rightMerges = [];

    rightSections.forEach(sec => {
      const startR = rightRows.length;
      rightRows.push([sec.title, "", ""]);
      rightMerges.push({ s: { r: startR, c: 4 }, e: { r: startR, c: 6 } });

      rightRows.push(["Paer name", "Part No,", "Q'ty"]);

      sec.items.forEach(it => {
        rightRows.push([it.name, it.partNo, it.qty]);
      });

      if (sec.showTotal) {
        const tR = rightRows.length;
        rightRows.push(["TOTAL", "", sec.totalQty]);
        rightMerges.push({ s: { r: tR, c: 4 }, e: { r: tR, c: 5 } });
      }

      rightRows.push(["", "", ""]);
    });

    // Combine left and right into 2-column matrix
    const maxDataRows = Math.max(leftRows.length, rightRows.length);
    const combinedRows = [];

    for (let i = 0; i < maxDataRows; i++) {
      const l = leftRows[i] || ["", "", ""];
      const r = rightRows[i] || ["", "", ""];
      combinedRows.push([l[0], l[1], l[2], "", r[0], r[1], r[2]]);
    }

    const allRows = headerRows.concat(combinedRows);
    const headerRowOffset = headerRows.length;

    leftMerges.forEach(m => {
      merges.push({
        s: { r: m.s.r + headerRowOffset, c: m.s.c },
        e: { r: m.e.r + headerRowOffset, c: m.e.c }
      });
    });
    rightMerges.forEach(m => {
      merges.push({
        s: { r: m.s.r + headerRowOffset, c: m.s.c },
        e: { r: m.e.r + headerRowOffset, c: m.e.c }
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 32 }, // Col A: Left Paer name
      { wch: 18 }, // Col B: Left Part No
      { wch: 8 },  // Col C: Left Q'ty
      { wch: 4 },  // Col D: Spacer
      { wch: 32 }, // Col E: Right Paer name
      { wch: 18 }, // Col F: Right Part No
      { wch: 8 }   // Col G: Right Q'ty
    ];

    XLSX.utils.book_append_sheet(wb, ws, "PrintoutSheet");
    const ipoVal = document.getElementById('ipoNo')?.value || 'BOM';
    XLSX.writeFile(wb, `${ipoVal}_Requirements_Sheet.xlsx`);
  } catch (err) {
    alert("출력용 시트 내보내기 실패: " + err.message);
  }
};

function normalizeCat(cat) {
  if (!cat || typeof cat !== 'string') return '';
  const c = cat.trim().toUpperCase();
  if (!c || c === 'ALL' || c === '전체 구분 (ALL)') return '';
  if (c === 'TIE ROD' || c === 'TIE_ROD') return 'TIE_ROD';
  if (c === 'STEEL SKID' || c === 'STEEL_SKID') return 'STEEL_SKID';
  if (c === 'BOLTS & NUTS' || c === 'BOLT_NUT' || c === 'BOLTS_NUTS') return 'BOLT_NUT';
  if (c === 'ACCESSORIES' || c === 'AIR_VENT' || c === 'AIR VENT') return 'AIR_VENT';
  if (c === 'PANEL') return 'PANEL';
  if (c === 'REINFORCING') return 'REINFORCING';
  if (c === 'OTHER') return 'OTHER';
  return c;
}

// Render Master Database List
function renderDbList() {
  const tbody = document.getElementById('tbodyPartsMasterDbList');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchInput = document.getElementById('dbTabSearchInput');
  const catFilter = document.getElementById('dbTabCategoryFilter');
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedCat = catFilter ? normalizeCat(catFilter.value) : '';
  
  // 1. Filter items first
  let filtered = partsDb.filter(item => {
    if (selectedCat) {
      const itemCat = normalizeCat(item.category);
      if (itemCat !== selectedCat) return false;
    }
    if (query) {
      const match = (item.partNo || '').toLowerCase().includes(query) ||
                    (item.nameKo || '').toLowerCase().includes(query) ||
                    (item.nameEn || '').toLowerCase().includes(query) ||
                    (item.spec || '').toLowerCase().includes(query);
      if (!match) return false;
    }
    return true;
  });

  // 2. Sort items
  filtered.sort((a, b) => {
    let valA = a[dbSortField];
    let valB = b[dbSortField];

    // Safe default conversions
    if (typeof valA === 'string') valA = valA.trim().toLowerCase();
    if (typeof valB === 'string') valB = valB.trim().toLowerCase();

    // Check numbers comparison
    if (dbSortField === 'price' || dbSortField === 'weight' || dbSortField === 'width' || dbSortField === 'length' || dbSortField === 'ht' || dbSortField === 'fh' || dbSortField === 'holes') {
      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return dbSortOrder === 'asc' ? numA - numB : numB - numA;
    }

    if (valA < valB) return dbSortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return dbSortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // 3. Render list elements
  filtered.forEach((item, index) => {
    // Find index of item in original partsDb list to enable editing
    const origIndex = partsDb.findIndex(p => p.partNo === item.partNo);

    const itemCat = (item.category || 'OTHER').toUpperCase().trim();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td align="center" onclick="event.stopPropagation();">
        <input type="checkbox" class="chk-db-row-select" data-index="${origIndex}" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td>
        <input type="text" class="excel-cell" value="${item.partNo || ''}" onchange="updateDbField(${origIndex}, 'partNo', this.value)" data-row="${index}" data-col="0" style="font-weight: 700;">
      </td>
      <td align="center" onclick="event.stopPropagation();">
        <select class="excel-cell inline-cat-select" onchange="updateDbField(${origIndex}, 'category', this.value)" data-row="${index}" data-col="1" style="padding: 3px 5px; font-size: 11px; font-weight: 700; border: 1.5px solid #0284c7; border-radius: 6px; background: #e0f2fe; color: #0369a1; cursor: pointer; outline: none;">
          <option value="REINFORCING" ${itemCat === 'REINFORCING' ? 'selected' : ''}>REINFORCING</option>
          <option value="TIE_ROD" ${itemCat === 'TIE_ROD' || itemCat === 'TIE ROD' ? 'selected' : ''}>TIE_ROD</option>
          <option value="BOLT_NUT" ${itemCat === 'BOLT_NUT' || itemCat === 'BOLTS & NUTS' ? 'selected' : ''}>BOLT_NUT</option>
          <option value="STEEL_SKID" ${itemCat === 'STEEL_SKID' || itemCat === 'STEEL SKID' ? 'selected' : ''}>STEEL_SKID</option>
          <option value="AIR_VENT" ${itemCat === 'AIR_VENT' || itemCat === 'ACCESSORIES' ? 'selected' : ''}>AIR_VENT</option>
          <option value="PANEL" ${itemCat === 'PANEL' ? 'selected' : ''}>PANEL</option>
          <option value="OTHER" ${itemCat === 'OTHER' ? 'selected' : ''}>OTHER</option>
        </select>
      </td>
      <td><input type="text" class="excel-cell" value="${item.nameKo || ''}" onchange="updateDbField(${origIndex}, 'nameKo', this.value)" data-row="${index}" data-col="2"></td>
      <td><input type="text" class="excel-cell" value="${item.nameEn || ''}" onchange="updateDbField(${origIndex}, 'nameEn', this.value)" data-row="${index}" data-col="3"></td>
      <td><input type="text" class="excel-cell" value="${item.unit || 'PCS'}" onchange="updateDbField(${origIndex}, 'unit', this.value)" data-row="${index}" data-col="4"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.price || 0}" onchange="updateDbField(${origIndex}, 'price', this.value)" data-row="${index}" data-col="5"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.weight || 0}" onchange="updateDbField(${origIndex}, 'weight', this.value)" data-row="${index}" data-col="6"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.width || 1000}" onchange="updateDbField(${origIndex}, 'width', this.value)" data-row="${index}" data-col="7"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.length || 1000}" onchange="updateDbField(${origIndex}, 'length', this.value)" data-row="${index}" data-col="8"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.ht || 80}" onchange="updateDbField(${origIndex}, 'ht', this.value)" data-row="${index}" data-col="9"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.fh || 40}" onchange="updateDbField(${origIndex}, 'fh', this.value)" data-row="${index}" data-col="10"></td>
      <td><input type="number" step="1" class="excel-cell" value="${item.holes !== undefined && item.holes !== null ? item.holes : 0}" onchange="updateDbField(${origIndex}, 'holes', this.value)" data-row="${index}" data-col="11" style="text-align: center;"></td>
      <td><input type="text" class="excel-cell" value="${item.spec || ''}" onchange="updateDbField(${origIndex}, 'spec', this.value)" data-row="${index}" data-col="12"></td>
      <td align="center" onclick="event.stopPropagation();" style="display: flex; gap: 6px; justify-content: center; align-items: center;">
        <i class="fa-regular fa-copy action-icon" onclick="copyDbItem(${origIndex}, event)" title="복제하여 추가" style="color: var(--neon-blue); font-size: 14px; padding: 6px; cursor: pointer;"></i>
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteDbItem(${origIndex}, event)" title="삭제" style="color: var(--neon-rose); font-size: 14px; padding: 6px; cursor: pointer;"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" align="center" style="color:var(--text-secondary); padding: 25px;">검색 결과가 없습니다.</td></tr>`;
  }

  // Bind checkbox events
  updateDbBulkDeleteUI();

  // 4. Render sort arrow indicators
  updateSortIconsUI();
}

// Global update method for inline Excel cells
window.updateDbField = function(origIndex, field, value) {
  if (partsDb[origIndex]) {
    if (['price', 'weight', 'width', 'length', 'ht', 'fh', 'holes'].includes(field)) {
      partsDb[origIndex][field] = parseFloat(value) || 0;
    } else {
      partsDb[origIndex][field] = value;
    }
    localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
    window.partsDb = partsDb;
  }
};

window.addQuickDbRow = function() {
  const newPart = {
    partNo: `NEW-PART-${partsDb.length + 1}`,
    category: 'OTHER',
    nameKo: '신규 부품',
    nameEn: 'New Part',
    unit: 'PCS',
    price: 0,
    weight: 0,
    width: 1000,
    length: 1000,
    ht: 80,
    fh: 40,
    holes: 0,
    spec: ''
  };
  partsDb.unshift(newPart);
  localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
  window.partsDb = partsDb;
  renderDbList();
  setTimeout(() => {
    const firstInput = document.querySelector('.excel-cell[data-row="0"][data-col="0"]');
    if (firstInput) {
      firstInput.focus();
      if (typeof firstInput.select === 'function') firstInput.select();
    }
  }, 100);
};

// Global Sort Database trigger
window.sortDb = function(field) {
  if (dbSortField === field) {
    // Toggle direction order
    dbSortOrder = dbSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    dbSortField = field;
    dbSortOrder = 'asc';
  }
  renderDbList();
};

function updateSortIconsUI() {
  const fields = ['partNo', 'category', 'nameKo', 'nameEn', 'unit', 'price', 'weight', 'width', 'length', 'ht', 'fh', 'spec'];
  fields.forEach(f => {
    const iconSpan = document.getElementById(`sort-icon-${f}`);
    if (!iconSpan) return;
    if (dbSortField === f) {
      iconSpan.innerHTML = dbSortOrder === 'asc' 
        ? '<i class="fa-solid fa-arrow-up-short-wide" style="color:var(--neon-blue); margin-left: 5px;"></i>' 
        : '<i class="fa-solid fa-arrow-down-wide-short" style="color:var(--neon-blue); margin-left: 5px;"></i>';
    } else {
      iconSpan.innerHTML = '<i class="fa-solid fa-sort" style="color:#cbd5e1; margin-left: 5px; font-size:11px;"></i>';
    }
  });
}


// Height column definitions representing each column in the chart
const sideHeightGrades = ['1mH', '1.5mH', '2mH', '2.5mH', '3mH', '3.5mH', '4mH', '4.5mH', '5mH'];

function renderSidePanelConfig() {
  const container = document.getElementById('sidePanelConfigChartContainer');
  if (!container) return;
  container.innerHTML = '';

  // Basic setting (Option 0) shows ONLY Roof, Manhole, Bottom, Drain.
  // Options 1/2 show ONLY Wall (Side) panels.
  // Options 3/4 show ONLY Partition panels.
  const isBasicOption = sideMatrixOption === 0;
  const isPartitionOption = sideMatrixOption === 3 || sideMatrixOption === 4;
  const is1x1SideOption = sideMatrixOption === 2;

  // 1. Load panels database for datalist suggestions
  const panelOptions = partsDb
    .filter(p => (p.category || '').toUpperCase().trim() === 'PANEL')
    .map(p => `<option value="${p.partNo}">${p.partNo} (${p.nameKo || p.nameEn || ''})</option>`)
    .join('');

  const dlOpts = document.getElementById('dl-panel-opts');
  if (dlOpts) {
    dlOpts.innerHTML = panelOptions;
  }

  // Helper to make inline styled editable datalist combo box input
  const makeSelectElement = (matrixIdx, field, currentVal) => {
    if (matrixIdx === -1) return '';
    return `
      <input type="text" list="dl-panel-opts" value="${currentVal}"
        onchange="updateMatrix(${matrixIdx}, '${field}', this.value)"
        placeholder="검색/입력"
        style="width:100%; min-width:0; border:1px solid #cbd5e1; border-radius:4px; padding:3px 2px; font-size:9px; background:#fff; cursor:text; font-weight:500; box-sizing:border-box; outline:none; text-align:center;">
    `;
  };

  const rowIdx = (key) => panelMatrix.findIndex(r => r.key === key);

  // Renders one editable box: a primary catalog-key field, plus (if any)
  // its parLT/parRT/"Type 2" variant fields as small extra lines below it.
  // Returns '' (renders nothing) if neither the primary nor any variant has
  // a value at this height -- keeps empty course slots from cluttering the
  // column, matching the original diagram's blank cells above tank height.
  const roleBox = (primaryKey, variantKeys, hGrade, boxLabel, palette) => {
    const pIdx = rowIdx(primaryKey);
    if (pIdx === -1) return '';
    const pVal = panelMatrix[pIdx].heightGrades[hGrade] || '';
    const variants = variantKeys.map(vk => ({ vk, idx: rowIdx(vk) })).filter(v => v.idx !== -1);
    const hasAnyValue = !!pVal || variants.some(v => panelMatrix[v.idx].heightGrades[hGrade]);
    if (!hasAnyValue) return '';
    const variantsHtml = variants.map(v => {
      const row = panelMatrix[v.idx];
      const vVal = row.heightGrades[hGrade] || '';
      const tag = row.variantTag || (PanelCatalog.ROOF_BOTTOM_LABELS[row.role] || row.role);
      return `
        <div style="display:flex; align-items:center; gap:2px; margin-top:2px; min-width:0;" title="${tag}">
          <span style="font-size:7px; color:#64748b; flex:0 0 22px; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${tag}</span>
          ${makeSelectElement(v.idx, hGrade, vVal)}
        </div>`;
    }).join('');
    return `
      <div style="background:${palette.bg}; border:1px solid ${palette.border}; border-radius:4px; padding:3px; box-sizing:border-box; width:100%; min-width:0; margin-bottom:3px;">
        <div style="font-size:7.5px; font-weight:bold; color:${palette.text}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${boxLabel}">${boxLabel}</div>
        ${makeSelectElement(pIdx, hGrade, pVal)}
        ${variantsHtml}
      </div>`;
  };

  const ROOF_PALETTE = { bg: '#f0fdf4', border: '#86efac', text: '#166534' };
  const MANHOLE_PALETTE = { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  const WIDE_PALETTE = { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' };
  const NARROW_PALETTE = { bg: '#f5f3ff', border: '#a78bfa', text: '#5b21b6' };
  const BOTTOM_PALETTE = { bg: '#fff', border: '#cbd5e1', text: '#334155' };
  const PARTITION_PALETTE = { bg: '#fdf2f8', border: '#f0abfc', text: '#86198f' };

  // Group every "side"/"partition" matrix row by (course, wide-vs-narrow,
  // slot) so each course band renders one box per slot with its variants
  // nested inside -- driven entirely by panel_catalog.js/panel_rules.js
  // data, not a hand-picked list of positions.
  const sideByCourse = {};
  const partitionByCourse = {};
  panelMatrix.forEach((r) => {
    if (r.section === 'side') {
      if (!sideByCourse[r.course]) sideByCourse[r.course] = { wide: {}, narrow: {} };
      const bucket = r.widthClass === 'wide' ? 'wide' : 'narrow';
      if (!sideByCourse[r.course][bucket][r.slot]) sideByCourse[r.course][bucket][r.slot] = { primary: null, variants: [] };
      if (r.isVariant) sideByCourse[r.course][bucket][r.slot].variants.push(r.key);
      else sideByCourse[r.course][bucket][r.slot].primary = r.key;
    } else if (r.section === 'partition') {
      if (!partitionByCourse[r.course]) partitionByCourse[r.course] = {};
      if (!partitionByCourse[r.course][r.slot]) partitionByCourse[r.course][r.slot] = { primary: null, variants: [] };
      if (r.isVariant) partitionByCourse[r.course][r.slot].variants.push(r.key);
      else partitionByCourse[r.course][r.slot].primary = r.key;
    }
  });

  // "side1x1" rows (Option 2's alternate slice stack) are grouped by
  // height + slice index instead of by course -- each slice only ever
  // applies at the ONE height it belongs to.
  const side1x1ByHeight = {};
  panelMatrix.forEach((r) => {
    if (r.section !== 'side1x1') return;
    const h = r.heightKey, sliceKey = r.sliceKey;
    const bucket = r.widthClass === 'wide' ? 'wide' : 'narrow';
    if (!side1x1ByHeight[h]) side1x1ByHeight[h] = {};
    if (!side1x1ByHeight[h][sliceKey]) side1x1ByHeight[h][sliceKey] = { wide: { primary: null, variants: [] }, narrow: { primary: null, variants: [] } };
    if (r.isVariant) side1x1ByHeight[h][sliceKey][bucket].variants.push(r.key);
    else side1x1ByHeight[h][sliceKey][bucket].primary = r.key;
  });

  // "partition1x1" rows (Option 3's alternate top-course pair) are grouped
  // by course same as the default partition rows -- there's only ever one
  // slice per course, unlike side1x1.
  const partition1x1ByCourse = {};
  panelMatrix.forEach((r) => {
    if (r.section !== 'partition1x1') return;
    if (!partition1x1ByCourse[r.course]) partition1x1ByCourse[r.course] = {};
    if (!partition1x1ByCourse[r.course][r.slot]) partition1x1ByCourse[r.course][r.slot] = { primary: null, variants: [] };
    if (r.isVariant) partition1x1ByCourse[r.course][r.slot].variants.push(r.key);
    else partition1x1ByCourse[r.course][r.slot].primary = r.key;
  });

  // Course is already shown once as a badge above each band, so the box
  // itself only needs the role name -- keeping it short is what lets all
  // 9 height columns fit on screen without horizontal scrolling.
  const courseLabel = (course, slot) => PanelCatalog.SIDE_ROLE_LABELS[slot] || slot;
  const partitionLabel = (course, slot) => PanelCatalog.PARTITION_ROLE_LABELS[slot] || slot;

  // Build the layout grid: a label column + one column per canonical height.
  const roofHtmlMap = {};
  const manholeHtmlMap = {};
  const bottomHtmlMap = {};
  const drainHtmlMap = {};
  const wallStackHtmlMap = {};
  const partitionHtmlMap = {};

  sideHeightGrades.forEach(hGrade => {
    const hFloat = parseFloat(hGrade);

    roofHtmlMap[hGrade] = roleBox('roof_bottom.roof_full', ['roof_bottom.roof_half', 'roof_bottom.roof_quarter'], hGrade, 'Roof', ROOF_PALETTE)
      || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding:8px 0;">-</div>';
    manholeHtmlMap[hGrade] = roleBox('roof_bottom.manhole', [], hGrade, 'Manhole', MANHOLE_PALETTE)
      || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding:8px 0;">-</div>';
    bottomHtmlMap[hGrade] = roleBox('roof_bottom.base_full', ['roof_bottom.base_par', 'roof_bottom.hbase', 'roof_bottom.hbase_short', 'roof_bottom.hbase_long', 'roof_bottom.qbase'], hGrade, 'Bottom', BOTTOM_PALETTE)
      || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding:8px 0;">-</div>';
    drainHtmlMap[hGrade] = roleBox('roof_bottom.drain', [], hGrade, 'Drain', BOTTOM_PALETTE)
      || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding:8px 0;">-</div>';

    const rawCourses = (typeof PanelRules !== 'undefined' && PanelRules.COURSE_TABLE[String(hFloat)]) || [];
    const courses = rawCourses
      .map(c => (PanelCatalog.CATALOG_COURSE_ALIAS[c] || c))
      .filter((c, i, arr) => arr.indexOf(c) === i)
      .slice()
      .reverse();

    let wallStackHtml = '';
    if (is1x1SideOption) {
      const slices = side1x1ByHeight[String(hFloat)] || {};
      const sliceKeys = Object.keys(slices).sort((a, b) => parseInt(a.replace('slice', ''), 10) - parseInt(b.replace('slice', ''), 10));
      sliceKeys.slice().reverse().forEach(sk => {
        const s = slices[sk];
        const wideBox = s.wide.primary ? roleBox(s.wide.primary, s.wide.variants, hGrade, (panelMatrix[rowIdx(s.wide.primary)] || {}).label || sk, WIDE_PALETTE) : '';
        const narrowBox = s.narrow.primary ? roleBox(s.narrow.primary, s.narrow.variants, hGrade, (panelMatrix[rowIdx(s.narrow.primary)] || {}).label || sk, NARROW_PALETTE) : '';
        if (!wideBox && !narrowBox) return;
        wallStackHtml += `
          <div style="width:100%; border-top:2px dashed #cbd5e1; padding-top:4px; margin-top:4px;">
            <div style="display:flex; gap:4px; align-items:flex-start;">
              <div style="flex:2; min-width:0;">${wideBox}</div>
              <div style="flex:1; min-width:0;">${narrowBox}</div>
            </div>
          </div>`;
      });
    } else {
      courses.forEach(course => {
        const buckets = sideByCourse[course];
        if (!buckets) return;
        const wideBoxes = Object.keys(buckets.wide).map(slot => {
          const s = buckets.wide[slot];
          return s.primary ? roleBox(s.primary, s.variants, hGrade, courseLabel(course, slot), WIDE_PALETTE) : '';
        }).join('');
        const narrowBoxes = Object.keys(buckets.narrow).map(slot => {
          const s = buckets.narrow[slot];
          return s.primary ? roleBox(s.primary, s.variants, hGrade, courseLabel(course, slot), NARROW_PALETTE) : '';
        }).join('');
        if (!wideBoxes && !narrowBoxes) return;
        wallStackHtml += `
          <div style="width:100%; border-top:2px dashed #cbd5e1; padding-top:4px; margin-top:4px;">
            <div style="font-size:9px; font-weight:700; color:#0f172a; background:#e2e8f0; border-radius:3px; padding:1px 5px; display:inline-block; margin-bottom:3px;">${course}</div>
            <div style="display:flex; gap:4px; align-items:flex-start;">
              <div style="flex:2; min-width:0;">${wideBoxes}</div>
              <div style="flex:1; min-width:0;">${narrowBoxes}</div>
            </div>
          </div>`;
      });
    }
    wallStackHtmlMap[hGrade] = wallStackHtml;

    let partitionHtml = '';
    const altForHeight = (typeof PanelCatalogPartitionAlt !== 'undefined') ? PanelCatalogPartitionAlt.PARTITION_ALT_BY_HEIGHT[String(hFloat)] : null;
    courses.slice().reverse().forEach(course => {
      if (sideMatrixOption === 3 && altForHeight && course === altForHeight.course) {
        const altSlots = partition1x1ByCourse[course];
        const altLabels = { partition: 'Partition (0.5/1M)', vert: 'Vert (0.5/1M)', vert_2: 'Vert-2 (0.5/1M)' };
        const altBoxes = altSlots ? Object.keys(altSlots).map(slot => {
          const s = altSlots[slot];
          const roleName = slot.split('.').pop();
          return s.primary ? roleBox(s.primary, s.variants, hGrade, altLabels[roleName] || roleName, PARTITION_PALETTE) : '';
        }).join('') : '';
        if (altBoxes) partitionHtml += altBoxes;
        return;
      }
      const slots = partitionByCourse[course];
      if (!slots) return;
      const boxes = Object.keys(slots).map(slot => {
        const s = slots[slot];
        return s.primary ? roleBox(s.primary, s.variants, hGrade, partitionLabel(course, slot), PARTITION_PALETTE) : '';
      }).join('');
      if (boxes) partitionHtml += boxes;
    });
    partitionHtmlMap[hGrade] = partitionHtml;
  });

  let html = `
    <div style="width: 100%; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px; background: #fafbfc; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
      <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="width: 110px; padding: 10px 4px; font-weight: bold; font-size: 10px; color: #475569; text-align: center; border-right: 2px solid #cbd5e1;">Tank<br>Height</th>
            ${sideHeightGrades.map(hGrade => {
              const isOdd = hGrade.includes('.5');
              return `<th style="padding: 10px 2px; font-weight: 700; font-size: 11px; color: #1e293b; text-align: center; background: ${isOdd ? '#dbeafe' : '#e2e8f0'}; border-right: 1px solid #cbd5e1;">${hGrade}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${isBasicOption ? `
            <!-- Roof Row -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="font-weight: bold; font-size: 11px; color: #475569; text-align: center; background: #ffffff; border-right: 2px solid #cbd5e1; vertical-align: middle; padding: 8px 4px;">Roof</td>
              ${sideHeightGrades.map(hGrade => {
                const isOdd = hGrade.includes('.5');
                return `<td style="padding: 5px 2px; text-align: center; vertical-align: middle; background: ${isOdd ? '#f0f9ff' : '#ffffff'}; border-right: 1px solid #cbd5e1;">${roofHtmlMap[hGrade]}</td>`;
              }).join('')}
            </tr>

            <!-- Manhole Row -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="font-weight: bold; font-size: 11px; color: #475569; text-align: center; background: #ffffff; border-right: 2px solid #cbd5e1; vertical-align: middle; padding: 8px 4px;">Manhole</td>
              ${sideHeightGrades.map(hGrade => {
                const isOdd = hGrade.includes('.5');
                return `<td style="padding: 5px 2px; text-align: center; vertical-align: middle; background: ${isOdd ? '#f0f9ff' : '#ffffff'}; border-right: 1px solid #cbd5e1;">${manholeHtmlMap[hGrade]}</td>`;
              }).join('')}
            </tr>

            <!-- Bottom Row -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="font-weight: bold; font-size: 11px; color: #475569; text-align: center; background: #ffffff; border-right: 2px solid #cbd5e1; vertical-align: middle; padding: 8px 4px;">Bottom</td>
              ${sideHeightGrades.map(hGrade => {
                const isOdd = hGrade.includes('.5');
                return `<td style="padding: 5px 2px; text-align: center; vertical-align: middle; background: ${isOdd ? '#f0f9ff' : '#ffffff'}; border-right: 1px solid #cbd5e1;">${bottomHtmlMap[hGrade]}</td>`;
              }).join('')}
            </tr>

            <!-- Drain Row -->
            <tr>
              <td style="font-weight: bold; font-size: 11px; color: #475569; text-align: center; background: #ffffff; border-right: 2px solid #cbd5e1; vertical-align: middle; padding: 8px 4px;">Drain</td>
              ${sideHeightGrades.map(hGrade => {
                const isOdd = hGrade.includes('.5');
                return `<td style="padding: 5px 2px; text-align: center; vertical-align: middle; background: ${isOdd ? '#f0f9ff' : '#ffffff'}; border-right: 1px solid #cbd5e1;">${drainHtmlMap[hGrade]}</td>`;
              }).join('')}
            </tr>
          ` : isPartitionOption ? `
            <tr>
              <td style="font-weight: bold; font-size: 11px; color: #1e293b; text-align: center; background: #f8fafc; border-right: 2px solid #cbd5e1; vertical-align: middle; padding: 12px 4px;">
                Partition<br><span style="font-weight:400; font-size:9px; color:#94a3b8;">(bottom→top)${sideMatrixOption === 3 ? '<br><br>최상단 코스만<br>0.5/1M 대체구성' : ''}</span>
              </td>
              ${sideHeightGrades.map(hGrade => {
                const isOdd = hGrade.includes('.5');
                return `<td style="padding: 6px 3px; text-align: center; vertical-align: top; background: ${isOdd ? '#f0f9ff' : '#ffffff'}; border-right: 1px solid #cbd5e1;">${partitionHtmlMap[hGrade] || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding-top:20px;">No Partition Panel</div>'}</td>`;
              }).join('')}
            </tr>
          ` : `
            <tr>
              <td style="font-weight: bold; font-size: 11px; color: #1e293b; text-align: center; background: #f8fafc; border-right: 2px solid #cbd5e1; vertical-align: middle; padding: 12px 4px;">
                Wall<br><span style="font-weight:400; font-size:9px; color:#94a3b8;">(bottom→top)</span>
              </td>
              ${sideHeightGrades.map(hGrade => {
                const isOdd = hGrade.includes('.5');
                return `<td style="padding: 6px 3px; text-align: center; vertical-align: top; background: ${isOdd ? '#f0f9ff' : '#ffffff'}; border-right: 1px solid #cbd5e1;">${wallStackHtmlMap[hGrade] || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding-top:20px;">No Wall Panel</div>'}</td>`;
              }).join('')}
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

// Update Panel Matrix Cell
window.updateMatrix = function(index, field, value) {
  if (panelMatrix[index]) {
    if (field === 'item') {
      panelMatrix[index].item = value;
    } else {
      if (!panelMatrix[index].heightGrades) panelMatrix[index].heightGrades = {};
      panelMatrix[index].heightGrades[field] = value;
    }

    const currentKey = panelMatrix[index].key;
    const isRoofOrBottom = panelMatrix[index].section === 'roof_bottom';

    // Update local storage and cache storage object for the active option
    optionMatrixStorage[sideMatrixOption] = panelMatrix;
    localStorage.setItem(`water_tank_panel_matrix_opt${sideMatrixOption}`, JSON.stringify(panelMatrix));

    // If Roof/Manhole/Bottom/Drain (roof_bottom section) was updated, sync across ALL options (0..4)
    if (isRoofOrBottom) {
      [0, 1, 2, 3, 4].forEach(opt => {
        if (opt === sideMatrixOption) return;
        const targetMatrix = optionMatrixStorage[opt];
        if (targetMatrix) {
          const targetRow = targetMatrix.find(r => r.key === currentKey);
          if (targetRow) {
            if (field === 'item') targetRow.item = value;
            else {
              if (!targetRow.heightGrades) targetRow.heightGrades = {};
              targetRow.heightGrades[field] = value;
            }
            localStorage.setItem(`water_tank_panel_matrix_opt${opt}`, JSON.stringify(targetMatrix));
          }
        }
      });
    }
  }
};

function saveAndRender() {
  localStorage.setItem('water_tank_bom_draft', JSON.stringify(bomItems));
  renderAll();
}

// Render BOM Table
function renderBOM() {
  const tbody = document.getElementById('tbodyBOM');
  tbody.innerHTML = '';
  
  if (bomItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" align="center" style="color:var(--text-secondary)">항목이 없습니다. [규격기반 BOM 자동 생성] 버튼을 누르거나 [항목 추가]를 진행해 주세요.</td></tr>`;
    return;
  }

  // Get active filter value
  const filterEl = document.getElementById('bomCategoryFilter');
  const activeFilter = filterEl ? filterEl.value : 'ALL';

  let renderedCount = 0;
  bomItems.forEach((item, index) => {
    // If filter is not ALL, and item category doesn't match, skip rendering
    if (activeFilter !== 'ALL' && item.category !== activeFilter) {
      return;
    }
    renderedCount++;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${renderedCount}</td>
      <td>
        <select onchange="updateItem(${index}, 'category', this.value)">
          <option value="Panels" ${item.category === 'Panels' ? 'selected' : ''}>Panels</option>
          <option value="Steel Skid" ${item.category === 'Steel Skid' ? 'selected' : ''}>Steel Skid</option>
          <option value="Reinforcing" ${item.category === 'Reinforcing' ? 'selected' : ''}>Reinforcing</option>
          <option value="Tie Rod" ${item.category === 'Tie Rod' ? 'selected' : ''}>Tie Rod</option>
          <option value="Bolts & Nuts" ${item.category === 'Bolts & Nuts' ? 'selected' : ''}>Bolts & Nuts</option>
          <option value="Accessories" ${item.category === 'Accessories' ? 'selected' : ''}>Accessories</option>
        </select>
      </td>
      <td><input type="text" value="${item.partName}" onchange="updateItem(${index}, 'partName', this.value)"></td>
      <td><input type="text" value="${item.partNo || ''}" onchange="updateItem(${index}, 'partNo', this.value)"></td>
      <td><input type="number" step="any" value="${item.qty}" onchange="updateItem(${index}, 'qty', parseFloat(this.value) || 0)"></td>
      <td><input type="text" value="${item.unit}" onchange="updateItem(${index}, 'unit', this.value)"></td>
      <td><input type="text" value="${item.spec || ''}" onchange="updateItem(${index}, 'spec', this.value)"></td>
      <td align="center">
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteItem(${index})"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (renderedCount === 0) {
    tbody.innerHTML = `<tr><td colspan="8" align="center" style="color:var(--text-secondary)">선택한 구분 ('${activeFilter}')에 해당하는 품목이 없습니다.</td></tr>`;
  }
}

// Render COST Table
function renderCOST() {
  const tbody = document.getElementById('tbodyCOST');
  tbody.innerHTML = '';

  let totalSum = 0;
  bomItems.forEach((item, index) => {
    const total = item.qty * item.price;
    totalSum += total;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.category}</td>
      <td>${item.partName}</td>
      <td>${item.partNo || '-'}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td><input type="number" step="any" value="${item.price}" onchange="updateItem(${index}, 'price', parseFloat(this.value) || 0)"></td>
      <td><strong>${total.toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('footCostTotal').textContent = `${totalSum.toFixed(2)} KDN`;
}

// Render WEIGHT Table
function renderWEIGHT() {
  const tbody = document.getElementById('tbodyWT');
  tbody.innerHTML = '';

  let totalWeightSum = 0;
  bomItems.forEach((item, index) => {
    const totalW = item.qty * item.weight;
    totalWeightSum += totalW;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.category}</td>
      <td>${item.partName}</td>
      <td>${item.partNo || '-'}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td><input type="number" step="any" value="${item.weight}" onchange="updateItem(${index}, 'weight', parseFloat(this.value) || 0)"></td>
      <td><strong>${totalW.toFixed(2)} kg</strong></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('footWeightTotal').textContent = `${totalWeightSum.toFixed(2)} kg`;
}

// Calculate top widgets
function calculateWidgets() {
  let cost = 0;
  let weight = 0;
  bomItems.forEach(item => {
    cost += item.qty * item.price;
    weight += item.qty * item.weight;
  });

  const costEl = document.getElementById('statCost');
  if (costEl) costEl.textContent = `${cost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} KDN`;
  document.getElementById('statWeight').textContent = `${weight.toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1})} kg`;
}

// Edit actions
window.updateItem = function(index, field, value) {
  if (bomItems[index]) {
    bomItems[index][field] = value;
    // Auto-update price/weight if partNo matches master database
    if (field === 'partNo') {
      const match = partsDb.find(p => p.partNo.toLowerCase() === value.toLowerCase().trim());
      if (match) {
        bomItems[index].price = match.price;
        bomItems[index].weight = match.weight;
        if (!bomItems[index].partName) bomItems[index].partName = match.nameKo || match.nameEn;
        if (!bomItems[index].spec) bomItems[index].spec = match.spec;
      }
    }
    saveAndRender();
  }
};

window.deleteItem = function(index) {
  if (confirm('이 품목을 삭제하시겠습니까?')) {
    bomItems.splice(index, 1);
    saveAndRender();
  }
};

// SheetJS Excel Export
function exportToExcel() {
  try {
    const wb = XLSX.utils.book_new();

    // 1. Create Data/Info sheet (BASIC_TOOL)
    const projectInfo = [
      ["YSACC GRP TANK BOM GENERATOR REPORT"],
      [],
      ["IPO No.", document.getElementById('ipoNo')?.value || ''],
      ["Order Date", document.getElementById('orderDate')?.value || ''],
      ["Project Name", document.getElementById('projectName')?.value || ''],
      ["Sold to (Client)", document.getElementById('customerName')?.value || ''],
      ["Client TEL", document.getElementById('clientTel')?.value || ''],
      ["DELIVERED TO", document.getElementById('deliveredTo')?.value || ''],
      ["Delivery Date", document.getElementById('deliveryDate')?.value || ''],
      ["Recipient", document.getElementById('recipient')?.value || ''],
      ["Installer Mob.", document.getElementById('installerMob')?.value || ''],
      [],
      ["Tank Dimension & Capacity Configuration Table"],
      ["Length1", "Length2", "Length3", "Length4", "Width", "Height", "Q'ty", "Nominal CAPA(M3)", "Actual CAPA(M3)", "SQM(m²)", "No. of Partition", "Skid Length"],
      [
        parseFloat(document.getElementById('tankLength1')?.value) || 0,
        parseFloat(document.getElementById('tankLength2')?.value) || 0,
        parseFloat(document.getElementById('tankLength3')?.value) || 0,
        parseFloat(document.getElementById('tankLength4')?.value) || 0,
        parseFloat(document.getElementById('tankWidth')?.value) || 0,
        parseFloat(document.getElementById('tankHeight')?.value) || 0,
        parseInt(document.getElementById('tankQty')?.value) || 1,
        parseFloat(document.getElementById('nominalCapa')?.value) || 0,
        parseFloat(document.getElementById('actualCapa')?.value) || 0,
        parseFloat(document.getElementById('sqmArea')?.value) || 0,
        parseInt(document.getElementById('numPartition')?.value) || 0,
        parseFloat(document.getElementById('skidLength')?.value) || 0
      ]
    ];
    const infoWs = XLSX.utils.aoa_to_sheet(projectInfo);
    XLSX.utils.book_append_sheet(wb, infoWs, "BASIC_TOOL");

    // 2. Create PRINTOUT(BOM)
    const bomData = [
      ["No", "Category", "Part Name", "Part No.", "Q'ty", "Unit", "Specification"]
    ];
    bomItems.forEach((item, index) => {
      bomData.push([
        index + 1,
        item.category || '',
        item.partName || '',
        item.partNo || '',
        item.qty || 0,
        item.unit || 'PCS',
        item.spec || ''
      ]);
    });
    const bomWs = XLSX.utils.aoa_to_sheet(bomData);
    XLSX.utils.book_append_sheet(wb, bomWs, "PRINTOUT(BOM)");

    // 3. Create PRINTOUT(COST)
    const costData = [
      ["No", "Category", "Part Name", "Part No.", "Q'ty", "Unit", "Unit Price", "Total Price"]
    ];
    let sumCost = 0;
    bomItems.forEach((item, index) => {
      const total = (item.qty || 0) * (item.price || 0);
      sumCost += total;
      costData.push([
        index + 1,
        item.category || '',
        item.partName || '',
        item.partNo || '',
        item.qty || 0,
        item.unit || 'PCS',
        item.price || 0,
        total
      ]);
    });
    costData.push([]);
    costData.push([null, null, null, null, null, null, "Total Cost (KDN)", sumCost]);
    const costWs = XLSX.utils.aoa_to_sheet(costData);
    XLSX.utils.book_append_sheet(wb, costWs, "PRINTOUT(COST)");

    // 4. Create PRINTOUT(WT)
    const wtData = [
      ["No", "Category", "Part Name", "Part No.", "Q'ty", "Unit", "Unit Weight (kg)", "Total Weight (kg)"]
    ];
    let sumWt = 0;
    bomItems.forEach((item, index) => {
      const total = (item.qty || 0) * (item.weight || 0);
      sumWt += total;
      wtData.push([
        index + 1,
        item.category || '',
        item.partName || '',
        item.partNo || '',
        item.qty || 0,
        item.unit || 'PCS',
        item.weight || 0,
        total
      ]);
    });
    wtData.push([]);
    wtData.push([null, null, null, null, null, null, "Total Weight (kg)", sumWt]);
    const wtWs = XLSX.utils.aoa_to_sheet(wtData);
    XLSX.utils.book_append_sheet(wb, wtWs, "PRINTOUT(WT)");

    // 5. Add PART_ID_TABLE Master DB sheet
    if (partsDb && partsDb.length > 0) {
      const masterDbData = [
        ["NO", "Part No.", "Part Name(Korean)", "Buying Price(KDN)", "SPEC.", "Part Name(English)", "Weight", "Category"]
      ];
      partsDb.forEach((p, idx) => {
        masterDbData.push([
          idx + 1,
          p.partNo || '',
          p.nameKo || '',
          p.price || 0,
          p.spec || '',
          p.nameEn || '',
          p.weight || 0,
          p.category || ''
        ]);
      });
      const masterWs = XLSX.utils.aoa_to_sheet(masterDbData);
      XLSX.utils.book_append_sheet(wb, masterWs, "PART_ID_TABLE");
    }

    // Save File
    const filename = `${document.getElementById('ipoNo')?.value || 'BOM'}_WATANI_BOM.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error("Error during exportToExcel:", err);
    alert("엑셀 다운로드 중 오류가 발생했습니다: " + err.message);
  }
}

// SheetJS Excel Import
function importFromExcel(e) {
  const inputEl = e.target;
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // 1. If BASIC_TOOL sheet exists, update project & tank parameters
      if (workbook.Sheets["BASIC_TOOL"]) {
        try {
          const basicRows = XLSX.utils.sheet_to_json(workbook.Sheets["BASIC_TOOL"], { header: 1 });
          basicRows.forEach(r => {
            if (Array.isArray(r) && r.length >= 2 && r[0]) {
              const label = String(r[0]).trim();
              const val = r[1];
              const setVal = (id, v) => {
                const el = document.getElementById(id);
                if (el && v !== undefined && v !== null) el.value = v;
              };
              if (label === "IPO No.") setVal('ipoNo', val);
              if (label === "Order Date") setVal('orderDate', val);
              if (label === "Project Name") setVal('projectName', val);
              if (label === "Sold to (Client)") setVal('customerName', val);
              if (label === "Client TEL") setVal('clientTel', val);
              if (label === "DELIVERED TO") setVal('deliveredTo', val);
              if (label === "Delivery Date") setVal('deliveryDate', val);
              if (label === "Recipient") setVal('recipient', val);
              if (label === "Installer Mob.") setVal('installerMob', val);
              if (label === "Length 1 (m)") setVal('tankLength1', val);
              if (label === "Length 2 (m)") setVal('tankLength2', val);
              if (label === "Length 3 (m)") setVal('tankLength3', val);
              if (label === "Length 4 (m)") setVal('tankLength4', val);
              if (label === "Width (m)") setVal('tankWidth', val);
              if (label === "Height (m)") setVal('tankHeight', val);
              if (label === "Quantity (Set)") setVal('tankQty', val);
              if (label === "No. of Partition") setVal('numPartition', val);
              if (label === "Skid Length (m)") setVal('skidLength', val);
            }
          });
        } catch (eBasic) {
          console.warn("Notice: Error parsing BASIC_TOOL sheet info:", eBasic);
        }
      }

      // 2. Target sheet for BOM items
      let bomSheetName = "PRINTOUT(BOM)";
      if (!workbook.Sheets[bomSheetName]) {
        bomSheetName = workbook.SheetNames.find(name => name.includes("BOM") || name.includes("Panel") || name.includes("PART")) || workbook.SheetNames[0];
      }

      const bomSheet = workbook.Sheets[bomSheetName];
      if (!bomSheet) {
        alert("엑셀 파일에서 불러올 시트를 찾을 수 없습니다.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(bomSheet, { header: 1 });
      if (!rows || rows.length === 0) {
        alert("시트에 데이터가 없습니다.");
        return;
      }

      // Dynamically locate the header row (search rows 0..15)
      let headerRowIdx = -1;
      let catIdx = -1, nameIdx = -1, noIdx = -1, qtyIdx = -1, unitIdx = -1, specIdx = -1, priceIdx = -1, weightIdx = -1;

      for (let r = 0; r < Math.min(15, rows.length); r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        const rowHeaders = row.map(h => h != null ? String(h).trim().toLowerCase() : '');
        
        const tempQty = rowHeaders.findIndex(h => h.includes("q'ty") || h.includes("qty") || h.includes("quantity") || h === "수량");
        const tempName = rowHeaders.findIndex(h => h.includes("part name") || h.includes("partname") || h.includes("품명") || h === "name");
        const tempNo = rowHeaders.findIndex(h => h.includes("part no") || h.includes("part_no") || h.includes("partno") || h.includes("부품번호") || h === "no" || h === "no.");

        if (tempQty !== -1 || tempName !== -1 || tempNo !== -1) {
          headerRowIdx = r;
          qtyIdx = tempQty;
          nameIdx = tempName;
          noIdx = tempNo;
          catIdx = rowHeaders.findIndex(h => h.includes("category") || h.includes("구분") || h.includes("분류"));
          unitIdx = rowHeaders.findIndex(h => h.includes("unit") || h.includes("단위"));
          specIdx = rowHeaders.findIndex(h => h.includes("specification") || h.includes("spec") || h.includes("규격"));
          priceIdx = rowHeaders.findIndex(h => h.includes("price") || h.includes("단가") || h.includes("cost"));
          weightIdx = rowHeaders.findIndex(h => h.includes("weight") || h.includes("중량"));
          break;
        }
      }

      if (headerRowIdx === -1) {
        alert("올바른 BOM 엑셀 템플릿 양식이 아닙니다. (필수 열: Part Name, Part No., 또는 Q'ty/수량)");
        return;
      }

      const importedItems = [];
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const partNameVal = nameIdx !== -1 && row[nameIdx] != null ? String(row[nameIdx]).trim() : '';
        const partNoVal = noIdx !== -1 && row[noIdx] != null ? String(row[noIdx]).trim() : '';
        if (!partNameVal && !partNoVal) continue;

        const qtyVal = qtyIdx !== -1 && row[qtyIdx] != null ? parseFloat(row[qtyIdx]) : 1;
        if (isNaN(qtyVal) || qtyVal <= 0) continue;

        // Lookup matching unit price and weight from partsDb if not in excel
        let price = priceIdx !== -1 && row[priceIdx] != null ? parseFloat(row[priceIdx]) || 0 : 0;
        let weight = weightIdx !== -1 && row[weightIdx] != null ? parseFloat(row[weightIdx]) || 0 : 0;

        const match = partsDb.find(p => p.partNo && p.partNo.toLowerCase() === partNoVal.toLowerCase());
        if (match) {
          if (!price) price = match.price || 0;
          if (!weight) weight = match.weight || 0;
        }

        importedItems.push({
          category: catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : (match ? match.category : "Panels"),
          partName: partNameVal || (match ? (match.nameKo || match.nameEn) : partNoVal),
          partNo: partNoVal,
          qty: qtyVal,
          unit: unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : (match ? match.unit : 'PCS'),
          spec: specIdx !== -1 && row[specIdx] ? String(row[specIdx]).trim() : (match ? match.spec : ''),
          price: price,
          weight: weight
        });
      }

      if (importedItems.length > 0) {
        bomItems = importedItems;
        saveAndRender();
        alert(`성공적으로 ${importedItems.length}개의 BOM 항목을 불러왔습니다.`);
      } else {
        alert("가져올 유효한 품목 데이터가 없습니다.");
      }
    } catch (err) {
      console.error("importFromExcel Error:", err);
      alert("엑셀 파일을 파싱하는 도중 에러가 발생했습니다: " + err.message);
    } finally {
      inputEl.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// Dedicated Master DB Excel Export
function exportMasterDbToExcel() {
  try {
    if (!partsDb || partsDb.length === 0) {
      alert("다운로드할 마스터 DB 항목이 없습니다.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const masterDbData = [
      ["NO", "Part No.", "Part Name(Korean)", "Buying Price(KDN)", "SPEC.", "Part Name(English)", "Weight(kg)", "Category", "Unit", "Width(mm)", "Length(mm)", "Ht(mm)", "Fh(mm)", "NOs of HOLES"]
    ];

    partsDb.forEach((p, idx) => {
      masterDbData.push([
        idx + 1,
        p.partNo || '',
        p.nameKo || '',
        p.price || 0,
        p.spec || '',
        p.nameEn || '',
        p.weight || 0,
        p.category || '',
        p.unit || 'PCS',
        p.width || 1000,
        p.length || 1000,
        p.ht || 80,
        p.fh || 40,
        p.holes !== undefined && p.holes !== null ? p.holes : 0
      ]);
    });

    const masterWs = XLSX.utils.aoa_to_sheet(masterDbData);
    XLSX.utils.book_append_sheet(wb, masterWs, "PART_ID_TABLE");

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `PART_ID_TABLE_MASTER_DB_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error("exportMasterDbToExcel Error:", err);
    alert("마스터 DB 엑셀 다운로드 중 에러가 발생했습니다: " + err.message);
  }
}

// Dedicated Master DB Excel Import
function importMasterDbFromExcel(e) {
  const inputEl = e.target;
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      let targetSheetName = "PART_ID_TABLE";
      if (!workbook.Sheets[targetSheetName]) {
        targetSheetName = workbook.SheetNames.find(name => name.includes("PART") || name.includes("DB") || name.includes("Master")) || workbook.SheetNames[0];
      }

      const ws = workbook.Sheets[targetSheetName];
      if (!ws) {
        alert("엑셀 파일에서 마스터 DB 시트를 찾을 수 없습니다.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rows || rows.length === 0) {
        alert("선택한 엑셀 시트에 데이터가 없습니다.");
        return;
      }

      // Locate header row (rows 0..15)
      let headerRowIdx = -1;
      let pnoIdx = -1, nameKoIdx = -1, priceIdx = -1, specIdx = -1, nameEnIdx = -1, weightIdx = -1, catIdx = -1, unitIdx = -1, wIdx = -1, lIdx = -1, htIdx = -1, fhIdx = -1, holesIdx = -1;

      for (let r = 0; r < Math.min(15, rows.length); r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        const headers = row.map(h => h != null ? String(h).trim().toLowerCase() : '');

        const tempPno = headers.findIndex(h => h.includes("part no") || h.includes("partno") || h.includes("part_no") || h.includes("부품번호") || h.includes("품번"));
        const tempNameKo = headers.findIndex(h => h.includes("part name(korean)") || h.includes("korean") || h.includes("한글") || h.includes("품명(한글)") || h === "nameko");
        const tempNameEn = headers.findIndex(h => h.includes("part name(english)") || h.includes("english") || h.includes("영문") || h.includes("품명(영문)") || h === "nameen");

        if (tempPno !== -1 || tempNameKo !== -1 || tempNameEn !== -1) {
          headerRowIdx = r;
          pnoIdx = tempPno;
          nameKoIdx = tempNameKo;
          nameEnIdx = tempNameEn;
          priceIdx = headers.findIndex(h => h.includes("price") || h.includes("단가"));
          specIdx = headers.findIndex(h => h.includes("spec") || h.includes("규격"));
          weightIdx = headers.findIndex(h => h.includes("weight") || h.includes("중량"));
          catIdx = headers.findIndex(h => h.includes("category") || h.includes("구분") || h.includes("분류"));
          unitIdx = headers.findIndex(h => h.includes("unit") || h.includes("단위"));
          wIdx = headers.findIndex(h => h.includes("width") || h.includes("가로"));
          lIdx = headers.findIndex(h => h.includes("length") || h.includes("세로"));
          htIdx = headers.findIndex(h => h.includes("ht") || h.includes("전체높이"));
          fhIdx = headers.findIndex(h => h.includes("fh") || h.includes("플랜지높이"));
          holesIdx = headers.findIndex(h => h.includes("hole") || h.includes("holes") || h.includes("타공") || h.includes("개공") || h.includes("홀개수") || h.includes("홀수") || h.includes("nos") || h.includes("no.s") || h.includes("n'os"));
          break;
        }
      }

      if (headerRowIdx === -1) {
        alert("올바른 마스터 DB 엑셀 양식이 아닙니다. (필수 열: Part No., Part Name, 또는 SPEC.)");
        return;
      }

      const newParts = [];
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const partNo = pnoIdx !== -1 && row[pnoIdx] != null ? String(row[pnoIdx]).trim() : '';
        const nameKo = nameKoIdx !== -1 && row[nameKoIdx] != null ? String(row[nameKoIdx]).trim() : '';
        const nameEn = nameEnIdx !== -1 && row[nameEnIdx] != null ? String(row[nameEnIdx]).trim() : '';
        const spec = specIdx !== -1 && row[specIdx] != null ? String(row[specIdx]).trim() : '';

        if (!partNo && !nameKo && !spec) continue;

        newParts.push({
          partNo: partNo || `PART-${i}`,
          nameKo: nameKo || nameEn || partNo,
          nameEn: nameEn || nameKo || partNo,
          spec: spec || nameKo || partNo,
          price: priceIdx !== -1 && row[priceIdx] != null ? parseFloat(row[priceIdx]) || 0 : 0,
          weight: weightIdx !== -1 && row[weightIdx] != null ? parseFloat(row[weightIdx]) || 0 : 0,
          category: catIdx !== -1 && row[catIdx] != null ? String(row[catIdx]).trim().toUpperCase() : 'OTHER',
          unit: unitIdx !== -1 && row[unitIdx] != null ? String(row[unitIdx]).trim() : 'PCS',
          width: wIdx !== -1 && row[wIdx] != null ? parseFloat(row[wIdx]) || 1000 : 1000,
          length: lIdx !== -1 && row[lIdx] != null ? parseFloat(row[lIdx]) || 1000 : 1000,
          ht: htIdx !== -1 && row[htIdx] != null ? parseFloat(row[htIdx]) || 80 : 80,
          fh: fhIdx !== -1 && row[fhIdx] != null ? parseFloat(row[fhIdx]) || 40 : 40,
          holes: holesIdx !== -1 && row[holesIdx] != null ? parseInt(row[holesIdx]) || 0 : 0
        });
      }

      if (newParts.length === 0) {
        alert("엑셀 파일에서 읽어올 유효한 품목 데이터가 없습니다.");
        return;
      }

      const overwrite = confirm(`마스터 DB 엑셀 파일 분석 완료 (총 ${newParts.length}개 품목).\n\n[확인]: 기존 마스터 DB 전체를 삭제하고 엑셀 데이터로 덮어씁니다.\n[취소]: 기존 마스터 DB를 유지하면서 엑셀 품목을 추가/업데이트합니다.`);

      if (overwrite) {
        partsDb = newParts;
      } else {
        newParts.forEach(item => {
          const idx = partsDb.findIndex(p => p.partNo && p.partNo.toLowerCase() === item.partNo.toLowerCase());
          if (idx !== -1) {
            partsDb[idx] = { ...partsDb[idx], ...item };
          } else {
            partsDb.push(item);
          }
        });
      }

      localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
      renderDbList();

      // Optionally sync to Firestore if firebase firestore db is active
      if (typeof db !== 'undefined' && db && db.collection) {
        try {
          const snapshot = await db.collection('parts').get();
          const batchSize = 400;
          const docs = snapshot.docs;
          for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
          for (let i = 0; i < partsDb.length; i += batchSize) {
            const batch = db.batch();
            partsDb.slice(i, i + batchSize).forEach(part => {
              const docRef = db.collection('parts').doc();
              batch.set(docRef, { ...part, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
          }
          console.log("Synced imported Master DB to Firestore successfully.");
        } catch (eFs) {
          console.warn("Firestore sync during excel import warning:", eFs);
        }
      }

      alert(`성공적으로 ${newParts.length}개의 마스터 DB 품목을 반영했습니다.`);
    } catch (err) {
      console.error("importMasterDbFromExcel Error:", err);
      alert("마스터 DB 엑셀 파싱 중 오류가 발생했습니다: " + err.message);
    } finally {
      inputEl.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// Render official printable dual-column requirements sheet
function updatePrintoutSheet() {
  // 1. Text elements update
  const getVal = (id, def = '') => {
    const el = document.getElementById(id);
    return el ? el.value : def;
  };
  const getSelectText = (id, def = '') => {
    const el = document.getElementById(id);
    return el ? el.options[el.selectedIndex]?.text : def;
  };

  document.getElementById('sheetSoldTo').textContent = getVal('customerName', 'MEP');
  document.getElementById('sheetProjectName').textContent = getVal('projectName', 'A Project');
  document.getElementById('sheetOrderNo').textContent = getVal('ipoNo', 'WA-2022-01');

  // Compute total volume/set math
  const l1 = parseFloat(getVal('tankLength1')) || 0;
  const l2 = parseFloat(getVal('tankLength2')) || 0;
  const l3 = parseFloat(getVal('tankLength3')) || 0;
  const l4 = parseFloat(getVal('tankLength4')) || 0;
  const w = parseFloat(getVal('tankWidth')) || 0;
  const h = parseFloat(getVal('tankHeight')) || 0;
  const q = parseInt(getVal('tankQty')) || 1;
  const totalLength = l1 + l2 + l3 + l4;

  const nominal = (typeof AccessoriesEngine !== 'undefined')
    ? AccessoriesEngine.nominalCapaM3(w, totalLength, h)
    : totalLength * w * h;

  // Format length description dynamically to show compartment segments if partitioned (e.g. 6(3+3)mL)
  let lengthDesc = `${totalLength}mL`;
  const validLengths = [l1, l2, l3, l4].filter(val => val > 0);
  if (validLengths.length > 1) {
    lengthDesc = `${totalLength}(${validLengths.join('+')})mL`;
  }

  document.getElementById('sheetSizeFormula').textContent = `${lengthDesc} * ${w}mW * ${h}mH = ${nominal.toFixed(1)} [M³] / ${q} [SET]`;
  document.getElementById('sheetReinfMethod').textContent = `${getSelectText('reinfMethod', 'Internal')} / ${getSelectText('reinfMethodBrand', 'ALWATANI')}`;
  document.getElementById('sheetSteelSkid').textContent = getSelectText('steelSkidOpt', 'Default');
  document.getElementById('sheetPanelInsul').textContent = getSelectText('insulationType', 'Non-Insulated');
  document.getElementById('sheetPanelComp').textContent = `use side panel (${getSelectText('sidePanelOnly', 'DEFAULT')}), partition (${getSelectText('partitionPanelOnly', 'DEFAULT')})`;
  
  // Lookups for specifications info
  const boltText = getSelectText('boltMaterial', 'EXT:HDG+INT:SS316');
  document.getElementById('sheetBoltsNuts').textContent = boltText;
  
  // External and Internal accessories spec displays
  const extAccText = getVal('outsideTieRod', 'HDG');
  const intAccText = getVal('internalItem', 'SS316');
  document.getElementById('sheetExtAcc').textContent = extAccText;
  document.getElementById('sheetIntAcc').textContent = intAccText;

window.cleanPartName = function(partName, partNo) {
  if (!partName) return '';
  let str = String(partName).trim();
  if (partNo) {
    const trimmedNo = String(partNo).trim();
    if (trimmedNo) {
      const escNo = trimmedNo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      str = str.replace(new RegExp('\\s*\\(\\s*' + escNo + '\\s*\\)', 'gi'), '');
    }
  }
  // Strip trailing (CODE) if CODE matches 4+ letter/number part code (excluding spec terms)
  str = str.replace(/\s*\([A-Z0-9_\-]{4,}\)\s*$/i, (match) => {
    const inside = match.replace(/[\(\)]/g, '').trim().toUpperCase();
    if (['HDG', 'SS304', 'SS316', 'STS304', 'STS316', '1.0MH', '2.0MH', '0.5MH', '3.0MH', '4.0MH'].includes(inside)) {
      return match;
    }
    return '';
  });
  return str.trim();
};

  // Helper row builder
  const createRowHtml = (item) => `
    <tr>
      <td style="border: 1px solid #333333; padding: 4px;">${cleanPartName(item.partName, item.partNo)}</td>
      <td style="border: 1px solid #333333; padding: 4px; font-family: monospace;">${item.partNo || ''}</td>
      <td style="border: 1px solid #333333; padding: 4px; text-align: right; font-weight: bold;">${item.qty || 0}</td>
      <td style="border: 1px solid #333333; padding: 4px; text-align: center;"><input type="checkbox" style="cursor: pointer; width: 13px; height: 13px;"></td>
    </tr>
  `;

  // 2. Clear targets
  const tables = {
    roof: { body: document.getElementById('sheetBodyRoof'), totalEl: document.getElementById('sheetTotalRoof'), qty: 0, html: '' },
    bottom: { body: document.getElementById('sheetBodyBottom'), totalEl: document.getElementById('sheetTotalBottom'), qty: 0, html: '' },
    side: { body: document.getElementById('sheetBodySide'), totalEl: document.getElementById('sheetTotalSide'), qty: 0, html: '' },
    partition: { body: document.getElementById('sheetBodyPartition'), totalEl: document.getElementById('sheetTotalPartition'), qty: 0, html: '' },
    skid: { body: document.getElementById('sheetBodySkid'), qty: 0, html: '' },
    bolts: { body: document.getElementById('sheetBodyBolts'), qty: 0, html: '' },
    intReinf: { body: document.getElementById('sheetBodyIntReinf'), qty: 0, html: '' },
    extReinf: { body: document.getElementById('sheetBodyExtReinf'), qty: 0, html: '' },
    tieRod: { body: document.getElementById('sheetBodyTieRod'), qty: 0, html: '' },
    etc: { body: document.getElementById('sheetBodyEtc'), qty: 0, html: '' },
    fittings: { body: document.getElementById('sheetBodyFittings'), qty: 0, html: '' }
  };

  // 3. Classify list rows (with Bolt Display Mode split options)
  let panelTotalSum = 0;

  const getBoltMode = () => {
    const activeRadio = document.querySelector('input[name="boltDisplayMode"]:checked');
    return activeRadio ? activeRadio.value : 'set';
  };

  const isItemized = getBoltMode() === 'item';

  const processedItems = [];
  bomItems.forEach(item => {
    const cat = (item.category || '').toUpperCase().trim();
    const pNo = (item.partNo || '').toUpperCase().trim();
    
    // Check if the part is an individual nut (starts with WNT) or washer (starts with WFW)
    const isIndivNutOrWasher = pNo.startsWith("WNT-") || pNo.startsWith("WFW-");

    if (cat === 'BOLTS & NUTS') {
      if (isItemized) {
        if (boltRecipes[pNo]) {
          // Split Bolt Set into individual pieces
          boltRecipes[pNo].forEach(sub => {
            processedItems.push({
              category: item.category,
              partNo: sub.partNo,
              partName: sub.partName,
              qty: item.qty * sub.ratio,
              unit: "PCS"
            });
          });
        } else {
          // Keep individual nuts/washers that are calculated separately (or other fallback items)
          processedItems.push(item);
        }
      } else {
        // Mode 'set': We only want to display Bolt Sets.
        // We HIDE individual nuts and washers that are already counted within those sets.
        if (!isIndivNutOrWasher) {
          processedItems.push(item);
        }
      }
    } else {
      processedItems.push(item);
    }
  });

  // Group and sum up identical items (same partNo and partName)
  const consolidatedItems = [];
  const itemMap = {};

  processedItems.forEach(item => {
    const key = `${(item.partNo || '').toUpperCase().trim()}::${(item.partName || '').trim()}`;
    if (itemMap[key]) {
      itemMap[key].qty += Number(item.qty) || 0;
    } else {
      itemMap[key] = {
        category: item.category,
        partNo: item.partNo,
        partName: item.partName,
        qty: Number(item.qty) || 0,
        unit: item.unit || 'PCS',
        spec: item.spec || ''
      };
      consolidatedItems.push(itemMap[key]);
    }
  });

  consolidatedItems.forEach(item => {
    const cat = (item.category || '').toUpperCase().trim();
    const name = (item.partName || '').toLowerCase().trim();
    const pNo = (item.partNo || '').toUpperCase().trim();

    if (cat === 'PANELS') {
      panelTotalSum += Number(item.qty) || 0;
      if (name.includes('roof') || name.includes('manhole')) {
        tables.roof.html += createRowHtml(item);
        tables.roof.qty += Number(item.qty) || 0;
      } else if (name.includes('bottom') || name.includes('drain')) {
        tables.bottom.html += createRowHtml(item);
        tables.bottom.qty += Number(item.qty) || 0;
      } else if (name.includes('partition') || pNo.startsWith('PF') || pNo.startsWith('PH')) {
        tables.partition.html += createRowHtml(item);
        tables.partition.qty += Number(item.qty) || 0;
      } else {
        // default walls/sides
        tables.side.html += createRowHtml(item);
        tables.side.qty += Number(item.qty) || 0;
      }
    } else if (cat === 'STEEL SKID' || cat === 'STEEL_SKID') {
      tables.skid.html += createRowHtml(item);
    } else if (cat === 'BOLTS & NUTS' || cat === 'BOLT_NUT') {
      tables.bolts.html += createRowHtml(item);
    } else if (cat === 'TIE ROD' || cat === 'TIE_ROD' || pNo.startsWith('TR-') || pNo.startsWith('TC-') || pNo.startsWith('WTR-') || name.includes('tie-rod') || name.includes('tie rod') || name.includes('tierod')) {
      tables.tieRod.html += createRowHtml(item);
    } else if (cat === 'REINFORCING') {
      if (name.includes('corner angle') || name.includes('external')) {
        tables.extReinf.html += createRowHtml(item);
      } else {
        tables.intReinf.html += createRowHtml(item);
      }
    } else if (cat === 'FITTINGS' || name.includes('fitting') || name.includes('socket')) {
      tables.fittings.html += createRowHtml(item);
    } else {
      // Accessories and other ETC parts
      tables.etc.html += createRowHtml(item);
    }
  });

  // 4. Inject
  Object.keys(tables).forEach(key => {
    const t = tables[key];
    if (t.body) {
      t.body.innerHTML = t.html || `<tr><td colspan="3" style="border: 1px solid #333333; padding: 4px; text-align: center; color: #999999; font-style: italic;">No Item</td></tr>`;
    }
    if (t.totalEl) {
      t.totalEl.textContent = t.qty;
    }
  });

  const panelsGlobalEl = document.getElementById('sheetTotalPanelsGlobal');
  if (panelsGlobalEl) {
    panelsGlobalEl.textContent = panelTotalSum;
  }
}

// Subtab switcher for BOM / COST / WEIGHT tab
window.switchBomSubTab = function(subTabName) {
  // Toggle active class on sub-tab buttons
  document.querySelectorAll('.bom-sub-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = 'transparent';
    btn.style.color = '#64748b';
    btn.style.boxShadow = 'none';
  });
  const activeBtn = document.getElementById(`subtab-btn-${subTabName}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.background = '#ffffff';
    activeBtn.style.color = '#0284c7';
    activeBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  }

  // Toggle visible class on panel sections
  document.querySelectorAll('.bom-subpanel').forEach(panel => {
    panel.style.display = 'none';
  });
  const activePanel = document.getElementById(`bom-subpanel-${subTabName}`);
  if (activePanel) {
    activePanel.style.display = 'flex';
  }

  // Trigger render functions to ensure updated calculations
  if (subTabName === 'cost' && typeof renderCOST === 'function') renderCOST();
  if (subTabName === 'weight' && typeof renderWEIGHT === 'function') renderWEIGHT();
};

// Modal trigger functions for printout sheet preview
window.openPrintoutSheetPreview = function() {
  if (typeof updatePrintoutSheet === 'function') {
    updatePrintoutSheet();
  }
  const modal = document.getElementById('printoutPreviewModal');
  const srcFrame = document.querySelector('#tab-printout-sheet .printout-sheet-frame');
  const modalContent = document.getElementById('modalPrintoutContent');

  if (srcFrame && modalContent) {
    modalContent.innerHTML = srcFrame.outerHTML;
  }
  if (modal) {
    modal.style.display = 'flex';
  }
};

window.closePrintoutSheetPreview = function() {
  const modal = document.getElementById('printoutPreviewModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

// Export active printout requirements sheet to Excel
window.exportPrintoutSheetToExcel = function() {
  try {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Panels and Accessories Requirement List"],
      [],
      ["Sold to", document.getElementById('sheetSoldTo')?.textContent || ''],
      ["Project Name", document.getElementById('sheetProjectName')?.textContent || ''],
      ["Order No", document.getElementById('sheetOrderNo')?.textContent || ''],
      ["Size", document.getElementById('sheetSizeFormula')?.textContent || ''],
      ["Reinforcement", document.getElementById('sheetReinfMethod')?.textContent || ''],
      ["Steel Skid", document.getElementById('sheetSteelSkid')?.textContent || ''],
      ["Panel", document.getElementById('sheetPanelInsul')?.textContent || ''],
      ["Bolts and Nuts", document.getElementById('sheetBoltsNuts')?.textContent || ''],
      ["External Accessories", document.getElementById('sheetExtAcc')?.textContent || ''],
      ["Internal Accessories", document.getElementById('sheetIntAcc')?.textContent || ''],
      [],
      ["Category", "Part Name", "Part No.", "Q'ty", ""]
    ];

    const grabRows = (catName, tbodyId) => {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 3) {
          rows.push([
            catName,
            tds[0].textContent.trim(),
            tds[1].textContent.trim(),
            parseInt(tds[2].textContent.trim(), 10) || 0,
            "☐"
          ]);
        }
      });
    };

    grabRows("Roof/Manhole Panels", "sheetBodyRoof");
    grabRows("Bottom/Drain Panels", "sheetBodyBottom");
    grabRows("Side/Wall Panels", "sheetBodySide");
    grabRows("Partition Panels", "sheetBodyPartition");
    grabRows("Steel Skid", "sheetBodySkid");
    grabRows("Reinforcing Metal Parts (Int)", "sheetBodyIntReinf");
    grabRows("Reinforcing Metal Parts (Ext)", "sheetBodyExtReinf");
    grabRows("Tie Rod", "sheetBodyTieRod");
    grabRows("Fittings", "sheetBodyFittings");
    grabRows("Accessories & Others", "sheetBodyEtc");
    grabRows("Bolts and Nuts", "sheetBodyBolts");

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "PrintoutSheet");
    XLSX.writeFile(wb, `${document.getElementById('ipoNo')?.value || 'BOM'}_Requirements_Sheet.xlsx`);
  } catch (err) {
    alert("출력용 시트 내보내기 실패: " + err.message);
  }
};

// --- Interactive Table Column Resizer (칸폭 드래그 조절 기능) ---
window.makeTableColumnsResizable = function(table) {
  if (!table) return;
  const headers = table.querySelectorAll('thead th');
  headers.forEach((th) => {
    // Avoid duplicate resizer handles
    if (th.querySelector('.resizer')) return;

    th.style.position = 'relative';
    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    resizer.title = '드래그하여 칸폭 조절';
    th.appendChild(resizer);

    let startX, startWidth;

    const onMouseMove = (e) => {
      if (startX === undefined) return;
      const diffX = e.clientX - startX;
      const newWidth = Math.max(30, startWidth + diffX);
      th.style.width = `${newWidth}px`;
      th.style.minWidth = `${newWidth}px`;
      th.style.maxWidth = `${newWidth}px`;
    };

    const onMouseUp = () => {
      resizer.classList.remove('resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      startX = undefined;
    };

    resizer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startX = e.clientX;
      startWidth = th.offsetWidth;
      resizer.classList.add('resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
};

window.enableAllTableResizing = function() {
  document.querySelectorAll('.bom-table').forEach(table => {
    window.makeTableColumnsResizable(table);
  });
};

// Hook up Excel exporter button inside tab-bom toolbar & enable column resizers
document.addEventListener('DOMContentLoaded', () => {
  const btnExportBOM = document.getElementById('btnExportBOMExcel');
  if (btnExportBOM) {
    btnExportBOM.addEventListener('click', () => {
      if (typeof exportToExcel === 'function') {
        exportToExcel();
      }
    });
  }

  // Initialize table column resizers
  window.enableAllTableResizing();
  setTimeout(window.enableAllTableResizing, 500);
});

// --- Excel Keyboard Navigation & Paste Handler ---
document.addEventListener('keydown', (e) => {
  const input = e.target;
  if (!input || !input.classList.contains('excel-cell')) return;

  const row = parseInt(input.getAttribute('data-row'), 10);
  const col = parseInt(input.getAttribute('data-col'), 10);
  if (isNaN(row) || isNaN(col)) return;

  let targetRow = row;
  let targetCol = col;

  if (e.key === 'Enter') {
    e.preventDefault();
    targetRow = e.shiftKey ? row - 1 : row + 1;
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    targetRow = row + 1;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    targetRow = row - 1;
  }

  if (targetRow !== row || targetCol !== col) {
    const nextInput = document.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="${targetCol}"]`);
    if (nextInput) {
      nextInput.focus();
      if (typeof nextInput.select === 'function') nextInput.select();
    }
  }
});

// Excel Ctrl+V Paste Handler for Master DB table
document.addEventListener('paste', (e) => {
  const activeInput = document.activeElement;
  if (!activeInput || !activeInput.classList.contains('excel-cell')) return;

  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) return;

  const pastedText = clipboardData.getData('Text');
  if (!pastedText || (!pastedText.includes('\t') && !pastedText.includes('\n'))) return;

  e.preventDefault();

  const startRow = parseInt(activeInput.getAttribute('data-row'), 10) || 0;
  const startCol = parseInt(activeInput.getAttribute('data-col'), 10) || 0;

  const fieldsOrder = ['partNo', 'category', 'nameKo', 'nameEn', 'unit', 'price', 'weight', 'width', 'length', 'ht', 'fh', 'holes', 'spec'];

  const rows = pastedText.split(/\r\n|\n|\r/);
  let updatedCount = 0;

  rows.forEach((rowText, rIdx) => {
    if (!rowText && rIdx === rows.length - 1) return;
    const cols = rowText.split('\t');
    const curRowIdx = startRow + rIdx;

    while (partsDb.length <= curRowIdx) {
      partsDb.push({
        partNo: `PART-${partsDb.length + 1}`,
        category: 'OTHER',
        nameKo: '',
        nameEn: '',
        unit: 'PCS',
        price: 0,
        weight: 0,
        width: 1000,
        length: 1000,
        ht: 80,
        fh: 40,
        holes: 0,
        spec: ''
      });
    }

    cols.forEach((val, cIdx) => {
      const fieldIdx = startCol + cIdx;
      if (fieldIdx < fieldsOrder.length) {
        const fieldName = fieldsOrder[fieldIdx];
        let cleanVal = val.trim();
        if (['price', 'weight', 'width', 'length', 'ht', 'fh', 'holes'].includes(fieldName)) {
          partsDb[curRowIdx][fieldName] = parseFloat(cleanVal) || 0;
        } else if (fieldName === 'category') {
          partsDb[curRowIdx][fieldName] = cleanVal.toUpperCase();
        } else {
          partsDb[curRowIdx][fieldName] = cleanVal;
        }
      }
    });
    updatedCount++;
  });

  localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
  window.partsDb = partsDb;
  renderDbList();
  alert(`엑셀 데이터 ${updatedCount}행을 붙여넣었습니다.`);
});

