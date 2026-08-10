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

// Global 2-Level Panel Matrix Customer Presets System
window.createFreshClone = function(optNum) {
  const source = (window.defaultFullMatrixTemplate && window.defaultFullMatrixTemplate.length > 0)
    ? window.defaultFullMatrixTemplate
    : panelMatrix;
  const base = (source && Array.isArray(source) && source.length > 0)
    ? JSON.parse(JSON.stringify(source))
    : [];

  if (optNum === 2 && typeof PanelCatalog1x1 !== 'undefined' && typeof buildSide1x1MatrixRows === 'function') {
    return base.filter(r => r.section !== 'side').concat(buildSide1x1MatrixRows());
  }
  if (optNum === 3 && typeof PanelCatalogPartitionAlt !== 'undefined' && typeof buildPartitionAltMatrixRows === 'function') {
    return base.concat(buildPartitionAltMatrixRows());
  }
  return base;
};

window.getMatrixCustomerPresetList = function() {
  const initialList = [
    { id: 'default', name: 'YSACC Spec' },
    { id: 'mnt_spec', name: 'MNT Spec' },
    { id: 'watani_spec', name: 'WATANI Spec' }
  ];
  try {
    const local = localStorage.getItem('water_tank_customer_preset_list');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let updated = false;
        parsed.forEach(c => {
          if (c.id === 'default' && (c.name === '기본 사양 (Default)' || c.name === '기본 사양' || c.name === 'YSACC 사양 (Default)')) {
            c.name = 'YSACC Spec';
            updated = true;
          } else if ((c.id === 'sec_spec' || c.id === 'mnt_spec') && (c.name === '삼성전자/SEC 사양' || c.name === 'MNT' || c.name === 'MNT 사양')) {
            c.name = 'MNT Spec';
            c.id = 'mnt_spec';
            updated = true;
          } else if ((c.id === 'hyundai_spec' || c.id === 'watani_spec') && (c.name === '현대건설/HD 사양' || c.name === 'WATANI' || c.name === 'WATANI 사양')) {
            c.name = 'WATANI Spec';
            c.id = 'watani_spec';
            updated = true;
          }
        });
        if (updated) {
          localStorage.setItem('water_tank_customer_preset_list', JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {}
  localStorage.setItem('water_tank_customer_preset_list', JSON.stringify(initialList));
  return initialList;
};

window.saveMatrixCustomerPresetList = function(list) {
  localStorage.setItem('water_tank_customer_preset_list', JSON.stringify(list));
};

window.selectedCustomerPresetId = localStorage.getItem('water_tank_selected_customer_preset_id') || 'default';
window.selectedSubOptNum = isNaN(localStorage.getItem('water_tank_selected_sub_opt')) ? 1 : Number(localStorage.getItem('water_tank_selected_sub_opt'));

window.activeBOMCustomerPresetId = localStorage.getItem('water_tank_active_customer_preset_id') || 'default';
window.activeBOMSubOptNum = isNaN(localStorage.getItem('water_tank_active_option')) ? 1 : Number(localStorage.getItem('water_tank_active_option'));

window.getCustomerMatrixStorage = function(custId, optNum) {
  const cid = custId || 'default';
  const subOpt = (optNum !== undefined && optNum !== null) ? Number(optNum) : 1;
  const storageKey = (cid === 'default') ? `water_tank_panel_matrix_opt${subOpt}` : `water_tank_panel_matrix_${cid}_opt${subOpt}`;
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  return window.createFreshClone(subOpt === 0 ? 1 : subOpt);
};

window.setCustomerMatrixStorage = function(custId, optNum, matrixData) {
  const cid = custId || 'default';
  const subOpt = (optNum !== undefined && optNum !== null) ? Number(optNum) : 1;
  const storageKey = (cid === 'default') ? `water_tank_panel_matrix_opt${subOpt}` : `water_tank_panel_matrix_${cid}_opt${subOpt}`;
  localStorage.setItem(storageKey, JSON.stringify(matrixData));
};

function syncMatrixOptionUI(optNum) {
  window.renderMatrixPresetTabsUI();
}

window.renderMatrixPresetTabsUI = function() {
  const custWrapper = document.getElementById('panelMatrixCustomerTabsWrapper');
  const subWrapper = document.getElementById('panelMatrixSubOptTabsWrapper');
  if (!custWrapper && !subWrapper) return;

  const customers = window.getMatrixCustomerPresetList();
  const selectedCustId = String(window.selectedCustomerPresetId || 'default');
  const selectedSubOpt = Number(window.selectedSubOptNum !== undefined ? window.selectedSubOptNum : 1);

  const activeCustId = String(window.activeBOMCustomerPresetId || 'default');
  const activeSubOpt = Number(window.activeBOMSubOptNum !== undefined ? window.activeBOMSubOptNum : 1);

  // 1. Render Level 1 Customer Presets Tabs
  if (custWrapper) {
    let custHtml = '';
    customers.forEach(c => {
      const cid = String(c.id);
      const isSelected = cid === selectedCustId;
      const isActiveBOM = cid === activeCustId;
      const bg = isSelected ? 'var(--neon-blue, #0284c7)' : '#ffffff';
      const color = isSelected ? '#ffffff' : '#334155';
      const border = isSelected ? 'none' : '1px solid #cbd5e1';

      custHtml += `
        <button type="button" class="btnMatrixCustTab btn btn-sm" data-id="${cid}" ondblclick="window.renameCustomerPreset('${cid}')" title="Double-click to edit tab name" style="height:34px;padding:0 14px;font-size:12px;font-weight:bold;background:${bg};color:${color};border:${border};border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <i class="fa-solid fa-building"></i>
          <span class="cust-preset-name-text" data-id="${cid}">${c.name}</span>
          ${isActiveBOM ? '<span style="font-size:10px;background:#22c55e;color:#fff;padding:1px 6px;border-radius:10px;margin-left:4px;">Active BOM</span>' : ''}
        </button>
      `;
    });
    custWrapper.innerHTML = custHtml;

    custWrapper.querySelectorAll('.btnMatrixCustTab').forEach(btn => {
      let clickTimer = null;
      btn.addEventListener('click', function(e) {
        const cid = this.getAttribute('data-id');
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          if (typeof window.renameCustomerPreset === 'function') {
            window.renameCustomerPreset(cid);
          }
          return;
        }
        clickTimer = setTimeout(() => {
          clickTimer = null;
          window.selectedCustomerPresetId = cid;
          localStorage.setItem('water_tank_selected_customer_preset_id', cid);
          loadCurrentMatrixData();
          window.renderMatrixPresetTabsUI();
          renderSidePanelConfig();
        }, 250);
      });

      btn.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        e.preventDefault();
        const cid = this.getAttribute('data-id');
        if (typeof window.renameCustomerPreset === 'function') {
          window.renameCustomerPreset(cid);
        }
      });
    });
  }

  // 2. Render Level 2 Sub-Option Tabs
  if (subWrapper) {
    const subOpts = [
      { num: 0, name: 'Roof, Manhole, Bottom, Drain' },
      { num: 1, name: 'Option 1 - Side' },
      { num: 2, name: 'Option 2 - Side (0.5m, 1m)' },
      { num: 3, name: 'Option 3 - Partition (0.5m, 1m)' },
      { num: 4, name: 'Option 4 - Partition' }
    ];

    let subHtml = '';
    subOpts.forEach(s => {
      const isSelected = s.num === selectedSubOpt;
      const isActiveBOM = (selectedCustId === activeCustId) && (s.num === activeSubOpt);
      const bg = isSelected ? '#0284c7' : '#f8fafc';
      const color = isSelected ? '#ffffff' : '#475569';
      const border = isSelected ? 'none' : '1px solid #cbd5e1';

      subHtml += `
        <button type="button" class="btnMatrixSubOptTab btn btn-sm" data-num="${s.num}" style="height:32px;padding:0 12px;font-size:11.5px;font-weight:bold;background:${bg};color:${color};border:${border};border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap;">
          <span>${s.name}</span>
        </button>
      `;
    });
    subWrapper.innerHTML = subHtml;

    subWrapper.querySelectorAll('.btnMatrixSubOptTab').forEach(btn => {
      btn.addEventListener('click', function() {
        const num = Number(this.getAttribute('data-num'));
        window.selectedSubOptNum = num;
        localStorage.setItem('water_tank_selected_sub_opt', num);
        loadCurrentMatrixData();
        window.renderMatrixPresetTabsUI();
        renderSidePanelConfig();
      });
    });
  }

  // Helper to load matrix for selected customer + subOpt
  function loadCurrentMatrixData() {
    const custId = window.selectedCustomerPresetId || 'default';
    const subOpt = window.selectedSubOptNum !== undefined ? window.selectedSubOptNum : 1;
    panelMatrix = window.getCustomerMatrixStorage(custId, subOpt);
    sideMatrixOption = subOpt;
  }

  // Load matrix for current selection if needed
  loadCurrentMatrixData();

  // Update Header Badges
  const activeCustObj = customers.find(c => String(c.id) === activeCustId) || customers[0];
  const subOptNames = { 0: 'Roof, Manhole, Bottom, Drain', 1: 'Option 1 - Side', 2: 'Option 2 - Side (0.5m, 1m)', 3: 'Option 3 - Partition (0.5m, 1m)', 4: 'Option 4 - Partition' };
  const activeSubName = subOptNames[activeSubOpt] || 'Option 1';

  const badge = document.getElementById('panelMatrixBOMBadge');
  if (badge) badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Active BOM Spec: [${activeCustObj ? activeCustObj.name : 'YSACC Spec'}] ${activeSubName}`;

  const optDesc = document.getElementById('sideMatrixActiveOptDesc');
  if (optDesc) optDesc.textContent = `(Currently using [${activeCustObj ? activeCustObj.name : 'YSACC Spec'}] ${activeSubName})`;
};

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

  // 2. Merge user's locally saved custom_parts_db first (as local fallback/cache)
  const savedParts = localStorage.getItem('custom_parts_db');
  if (savedParts) {
    try {
      const localArray = JSON.parse(savedParts);
      localArray.forEach(p => {
        if (p.partNo) {
          const pKey = p.partNo.trim().toUpperCase();
          const existing = partsMap.get(pKey) || {};
          const merged = {
            ...existing,
            ...p,
            category: p.category || existing.category || 'OTHER',
            subCategory: p.subCategory || existing.subCategory || 'General'
          };
          partsMap.set(pKey, merged);
        }
      });
    } catch (e) {}
  }

  // 3. Fetch from Firestore to OVERRIDE baseline/local cache with authoritative cloud data
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
            nameKo: data.nameKo !== undefined ? data.nameKo : (existing.nameKo || ''),
            nameEn: data.nameEn !== undefined ? data.nameEn : (existing.nameEn || ''),
            spec: data.spec !== undefined ? data.spec : (existing.spec || ''),
            weight: data.weight !== undefined ? Number(data.weight) : (existing.weight || 0),
            price: data.price !== undefined ? Number(data.price) : (existing.price || 0),
            unit: data.unit || existing.unit || 'PCS',
            category: data.category || existing.category || 'OTHER',
            subCategory: data.subCategory || existing.subCategory || 'General',
            width: data.width !== undefined ? Number(data.width) : (existing.width || 1000),
            length: data.length !== undefined ? Number(data.length) : (existing.length || 1000),
            ht: data.ht !== undefined ? Number(data.ht) : (existing.ht || 80),
            fh: data.fh !== undefined ? Number(data.fh) : (existing.fh || 40),
            holes: data.holes !== undefined ? Number(data.holes) : (existing.holes || 0)
          });
        }
      });
      console.log(`Synced ${partsMap.size} total parts (merged with authoritative Firestore cloud data).`);
    }
  } catch (err) {
    console.warn("Firestore fetch failed:", err);
  }

  partsDb = Array.from(partsMap.values());
  partsDb.forEach(item => {
    item.category = normalizeCat(item.category) || 'OTHER';
  });
  window.partsDb = partsDb;
  localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));

  if (typeof window.applyCostingToMasterDb === 'function') {
    window.applyCostingToMasterDb(true);
  }

  try {
    const res = await fetch('panel_matrix.json');
    panelMatrix = await res.json();
    window.defaultFullMatrixTemplate = JSON.parse(JSON.stringify(panelMatrix));
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

  // 1c. Wire up the "STEEL ACCESSORIES" tab (steel_accessories.js) -- loads the
  // reinforcing reference drawings (steel_accessories_layout.json) and binds
  // each drawn member to its PART MASTER DB part and its formula row. Must run
  // after partsDb is loaded (part lookups / edit-mode autocomplete) and is
  // given the Firestore handle so drawing edits sync across devices, the same
  // way RuleEditorUI's formula overrides do.
  if (typeof SteelAccessories !== 'undefined') {
    try {
      SteelAccessories.init(db);
    } catch (err) {
      console.error('[SteelAccessories] init failed:', err);
    }
  }

  // 2. Initialize or restore separate matrices for Customer Presets
  const initializeOptionMatrices = () => {
    const savedActiveCust = localStorage.getItem('water_tank_selected_customer_preset_id') || 'default';
    const savedActiveOpt = localStorage.getItem('water_tank_selected_sub_opt') || '1';

    window.selectedCustomerPresetId = savedActiveCust;
    window.selectedSubOptNum = parseInt(savedActiveOpt) || 1;
    sideMatrixOption = window.selectedSubOptNum;

    panelMatrix = window.getCustomerMatrixStorage(window.selectedCustomerPresetId, sideMatrixOption);
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
  let hasRestoredInputs = false;
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
      hasRestoredInputs = true;
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

  // Recalculate capacity & surface area based on loaded inputs
  if (typeof calcCapa === 'function') {
    calcCapa();
  }

  // Always generate BOM from current input configuration so BOM output & summary cards are 100% in sync with inputs
  if (typeof generateDefaultBOMFromConfig === 'function') {
    generateDefaultBOMFromConfig();
  } else {
    renderAll();
  }

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
    el.addEventListener('input', () => {
      saveConfigInputs();
      if (typeof calcCapa === 'function') calcCapa();
      if (typeof generateDefaultBOMFromConfig === 'function') generateDefaultBOMFromConfig();
    });
    el.addEventListener('change', () => {
      saveConfigInputs();
      if (typeof calcCapa === 'function') calcCapa();
      if (typeof generateDefaultBOMFromConfig === 'function') generateDefaultBOMFromConfig();
    });
  });

  if (typeof window.PalletPacking !== 'undefined' && typeof window.PalletPacking.init === 'function') {
    window.PalletPacking.init();
  }
});

// TAB ID <-> Clean URL Hash Mapping
const TAB_URL_HASH_MAP = {
  'tab-basic-tool': 'bom-input',
  'tab-bom': 'bom-output',
  'tab-pallet-packing': 'pallet-packing',
  'tab-system-settings': 'general-settings',
  'tab-parts-db-master': 'part-master-db',
  'tab-side-panel-config': 'panel-config',
  'tab-bolt-recipes': 'bolt-logic',
  'tab-sealing-tape-master': 'sealing-tape',
  'tab-reinf-audit': 'reinforcing-logic',
  'tab-steel-accessories': 'steel-accessories',
  'tab-tierod-internal-audit': 'tierod-internal',
  'tab-rule-editor': 'steel-skid-logic',
  'tab-misc-logic': 'misc-logic',
  'tab-visual-config': 'visual-config',
  'tab-costing': 'costing',
  'tab-project-manager': 'project-manager'
};

// Helper: Synchronize active menu tab and sub-tabs from URL Hash (or query parameter)
window.syncTabFromUrlHash = function() {
  const hash = (window.location.hash || '').replace('#', '').trim().toLowerCase();
  if (!hash) return;

  // Split into main hash and optional subtab (e.g. costing/panels -> main: costing, sub: panels)
  let mainHash = hash;
  let subHash = null;
  let subHash2 = null;
  let subHash3 = null;

  if (hash.includes('/')) {
    const parts = hash.split('/');
    mainHash = parts[0];
    subHash = parts[1] || null;
    subHash2 = parts[2] || null;
    subHash3 = parts[3] || null;
  } else if (hash.includes('-') && (hash.startsWith('costing-') || hash.startsWith('bom-output-'))) {
    const dashIdx = hash.indexOf('-');
    mainHash = hash.substring(0, dashIdx);
    subHash = hash.substring(dashIdx + 1);
  }

  let targetTabId = null;
  // Match clean hash or raw tab ID
  for (const [tabId, cleanHash] of Object.entries(TAB_URL_HASH_MAP)) {
    if (cleanHash === mainHash || tabId.replace('tab-', '') === mainHash || tabId === mainHash) {
      targetTabId = tabId;
      break;
    }
  }

  if (!targetTabId) return;

  const btn = document.querySelector(`.tab-btn[data-tab="${targetTabId}"]`);
  if (!btn) return;

  // Auto-expand accordion if target is inside SYSTEM SETTINGS
  const settingsContainer = document.getElementById('settingsSubMenuContainer');
  const btnToggleSettings = document.getElementById('btnToggleSettingsGroup');
  const settingsChevron = document.getElementById('settingsGroupChevron');
  if (btn.classList.contains('subtab-btn') && settingsContainer) {
    settingsContainer.style.display = 'flex';
    if (btnToggleSettings) btnToggleSettings.classList.add('active');
    if (settingsChevron) settingsChevron.style.transform = 'rotate(180deg)';
  }

  // Activate tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const targetEl = document.getElementById(targetTabId);
  if (targetEl) targetEl.classList.add('active');

  if (targetTabId === 'tab-sealing-tape-master' && typeof SealingTapeEditor !== 'undefined') {
    SealingTapeEditor.renderSealingTapeManagerUI('sealingTapeMasterFullContainer');
  }

  if (targetTabId === 'tab-project-manager' && typeof window.renderProjectManagerList === 'function') {
    window.renderProjectManagerList();
  }

  if (targetTabId === 'tab-side-panel-config') {
    if (typeof window.renderMatrixPresetTabsUI === 'function') window.renderMatrixPresetTabsUI();
    if (typeof renderSidePanelConfig === 'function') renderSidePanelConfig();
  }

  // Handle Costing Sub-Tab switching from URL hash (materials, labour, equipment, panels)
  if (targetTabId === 'tab-costing' && subHash && typeof window.switchCostingSubTab === 'function') {
    window.switchCostingSubTab(subHash, false);
  }

  // Handle BOM Output Sub-Tab switching from URL hash (bom, items, cost, weight)
  if (targetTabId === 'tab-bom' && subHash && typeof window.switchBomSubTab === 'function') {
    const normSub = (subHash === 'items' || subHash === 'bom') ? 'bom' : subHash;
    window.switchBomSubTab(normSub, false);
  }

  // Handle Steel Skid Logic Sub-Tab switching from URL hash (std, ibeam, sqp, etc.)
  if (targetTabId === 'tab-rule-editor' && typeof RuleEditorUI !== 'undefined') {
    RuleEditorUI.gotoCategory('steelSkid');
    if (subHash && typeof RuleEditorUI.switchSkidSubTab === 'function') {
      RuleEditorUI.switchSkidSubTab(subHash, false);
    }
  }



  // Handle Steel Accessories Sub-Tab switching from URL hash (int_side, partition_1, height, etc.)
  if (targetTabId === 'tab-steel-accessories' && typeof SteelAccessories !== 'undefined') {
    if (subHash && typeof SteelAccessories.switchView === 'function') {
      SteelAccessories.switchView(subHash, subHash2, subHash3, false);
    }
  }

  // Handle Steel Reinforcing Logic Sub-Tab switching from URL hash (inside, outside)
  if (targetTabId === 'tab-reinf-audit') {
    const sub = (subHash === 'outside' || subHash === 'out') ? 'outside' : 'inside';
    if (typeof window.setReinfSubTab === 'function') {
      window.setReinfSubTab(sub, false);
    }
  }
};

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

      if (targetTabId === 'tab-sealing-tape-master' && typeof SealingTapeEditor !== 'undefined') {
        SealingTapeEditor.renderSealingTapeManagerUI('sealingTapeMasterFullContainer');
      }

      if (targetTabId === 'tab-pallet-packing' && typeof window.PalletPacking !== 'undefined' && typeof window.PalletPacking.syncPendingFromBOM === 'function') {
        window.PalletPacking.syncPendingFromBOM();
      }

      if (targetTabId === 'tab-side-panel-config') {
        if (typeof window.renderMatrixPresetTabsUI === 'function') window.renderMatrixPresetTabsUI();
        if (typeof renderSidePanelConfig === 'function') renderSidePanelConfig();
      }

      if (targetTabId === 'tab-rule-editor' && typeof RuleEditorUI !== 'undefined') {
        RuleEditorUI.gotoCategory('steelSkid');
        const specKey = typeof RuleEditorUI.getActiveSkidSpecKey === 'function' ? RuleEditorUI.getActiveSkidSpecKey() : 'std';
        const cleanHash = 'steel-skid-logic/' + specKey;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#' + cleanHash);
        } else {
          window.location.hash = cleanHash;
        }
        return;
      }



      if (targetTabId === 'tab-steel-accessories' && typeof SteelAccessories !== 'undefined') {
        if (typeof SteelAccessories.updateUrlHash === 'function') {
          SteelAccessories.updateUrlHash(true);
          return;
        }
      }

      if (targetTabId === 'tab-reinf-audit') {
        const sub = typeof window.getReinfSubTab === 'function' ? window.getReinfSubTab() : 'inside';
        const cleanHash = 'reinforcing-logic/' + sub;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#' + cleanHash);
        } else {
          window.location.hash = cleanHash;
        }
        return;
      }

      if (targetTabId === 'tab-misc-logic') {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const ruleEditorEl = document.getElementById('tab-rule-editor');
        if (ruleEditorEl) ruleEditorEl.classList.add('active');
        if (typeof RuleEditorUI !== 'undefined') {
          RuleEditorUI.gotoCategory('misc');
        }
      }

      // Update URL hash in real time for bookmarking and menu sharing
      const cleanHash = TAB_URL_HASH_MAP[targetTabId] || targetTabId.replace('tab-', '');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + cleanHash);
      } else {
        window.location.hash = cleanHash;
      }
    });
  });

  // Listen for hashchange event (browser back/forward or direct hash change)
  window.addEventListener('hashchange', window.syncTabFromUrlHash);

  // Sync tab on initial page load if hash exists
  if (window.location.hash) {
    setTimeout(window.syncTabFromUrlHash, 200);
  }
  window.addEventListener('load', () => {
    if (window.location.hash) window.syncTabFromUrlHash();
    if (typeof window.renderProjectManagerList === 'function') window.renderProjectManagerList();
  });

  // Settings Sub-Menu Group Header click handler (Toggle Open / Close Accordion)
  const btnToggleSettings = document.getElementById('btnToggleSettingsGroup');
  const settingsContainer = document.getElementById('settingsSubMenuContainer');
  const settingsChevron = document.getElementById('settingsGroupChevron');
  if (btnToggleSettings && settingsContainer) {
    btnToggleSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCurrentlyOpen = window.getComputedStyle(settingsContainer).display !== 'none';
      if (isCurrentlyOpen) {
        // Collapse / Close
        settingsContainer.style.display = 'none';
        btnToggleSettings.classList.remove('active');
        if (settingsChevron) settingsChevron.style.transform = 'rotate(0deg)';
      } else {
        // Expand / Open
        settingsContainer.style.display = 'flex';
        btnToggleSettings.classList.add('active');
        if (settingsChevron) settingsChevron.style.transform = 'rotate(180deg)';

        // Select active subtab or fallback to General Settings tab
        const activeSubTab = settingsContainer.querySelector('.subtab-btn.active');
        if (activeSubTab) {
          activeSubTab.click();
        } else {
          const genSettingsBtn = document.querySelector('.subtab-btn[data-tab="tab-system-settings"]');
          if (genSettingsBtn) genSettingsBtn.click();
        }
      }
    });
  }

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
      statEl.title = `Nominal CAPA per 1 SET. Total ${q} SETs: ${(nominal * q).toFixed(1)} M³`;
    }

    const statSqmEl = document.getElementById('statSqm');
    if (statSqmEl) {
      statSqmEl.textContent = `${sqm.toFixed(3)} m²`;
      statSqmEl.title = `SQM per 1 SET. Total ${q} SETs: ${(sqm * q).toFixed(3)} m²`;
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

    // Update Reinf. Type summary widget
    const reinfEl = document.getElementById('reinfMethod');
    const statReinfEl = document.getElementById('statReinfType');
    if (reinfEl && statReinfEl) {
      const val = reinfEl.value || 'Internal';
      statReinfEl.textContent = val === 'Internal' ? 'Internal R/F' : 'External R/F';
    }

    // Height & Reinforcement based Skid Type Default Config Resolver
    window.getSkidDefaultConfig = function () {
      const initial = {
        internal: {
          "1.0": "angle75", "1.5": "angle75", "2.0": "angle75", "2.5": "angle75", "3.0": "angle75",
          "3.5": "channel125", "4.0": "channel125", "4.5": "channel150", "5.0": "channel150"
        },
        external: {
          "1.0": "channel125", "1.5": "channel125", "2.0": "channel125", "2.5": "channel150", "3.0": "channel150",
          "3.5": "ibeam", "4.0": "ibeam", "4.5": "ibeam", "5.0": "ibeam"
        }
      };

      try {
        const ov = (typeof window !== "undefined" && window.RuleEditorUI && typeof window.RuleEditorUI.getOverrides === "function") ? window.RuleEditorUI.getOverrides() : null;
        if (ov && ov["steelSkid::defaultConfig"]) {
          return ov["steelSkid::defaultConfig"];
        }
        const local = (typeof localStorage !== "undefined") ? localStorage.getItem("steelSkidDefaultConfig") : null;
        if (local) {
          return JSON.parse(local);
        }
      } catch (e) {}

      return initial;
    };

    window.resolveSkidType = function (heightM, userOpt, isExtReinf) {
      if (userOpt === 'none' || userOpt === 'NONE' || userOpt === 'off' || userOpt === 'OFF') {
        return 'none';
      }

      if (userOpt && userOpt !== 'Default' && userOpt !== 'default') {
        if (userOpt === '75 Angle') return 'angle75';
        if (userOpt === '125 Channel') return 'channel125';
        if (userOpt === '150 Channel') return 'channel150';
        if (userOpt === 'I-Beam') return 'ibeam';
        if (userOpt === 'SQP') return 'sqp';
        return userOpt;
      }

      const config = window.getSkidDefaultConfig();
      const reinfMode = (isExtReinf === true || isExtReinf === 'External') ? 'external' : 'internal';
      const hVal = parseFloat(heightM) || 2.0;
      const hKey = hVal.toFixed(1);

      if (config && config[reinfMode] && config[reinfMode][hKey]) {
        return config[reinfMode][hKey];
      }

      if (reinfMode === 'external') {
        if (hVal <= 2.0) return 'channel125';
        if (hVal <= 3.0) return 'channel150';
        return 'ibeam';
      } else {
        if (hVal <= 3.0) return 'angle75';
        if (hVal <= 4.0) return 'channel125';
        return 'channel150';
      }
    };

    // Update Skid Type summary widget
    const skidOptEl = document.getElementById('steelSkidOpt');
    const statSkidEl = document.getElementById('statSkidType');
    if (skidOptEl && statSkidEl) {
      const isExt = (document.getElementById('reinfMethod')?.value === 'External');
      const resolved = window.resolveSkidType(h, userOpt, isExt);
      let label = resolved;
      if (resolved === 'none') label = 'None (미사용)';
      else if (typeof window.RuleEditorUI !== 'undefined' && typeof window.RuleEditorUI.getActiveSkidTypes === 'function') {
        const active = window.RuleEditorUI.getActiveSkidTypes();
        const found = active.find(function(a) { return a.key === resolved; });
        if (found) label = found.label;
      }

      if (userOpt === 'Default' || userOpt === 'default') label += ' (Auto)';
      statSkidEl.textContent = label;
    }

    // Update Insulation Type summary widget
    const insulEl = document.getElementById('insulationType');
    const statInsulEl = document.getElementById('statInsulationType');
    if (insulEl && statInsulEl) {
      const selectedOpt = insulEl.options[insulEl.selectedIndex];
      statInsulEl.textContent = selectedOpt ? selectedOpt.text : insulEl.value;
    }

    // Update Int. Mat. summary widget
    const intItemEl = document.getElementById('internalItem');
    const statIntMatEl = document.getElementById('statIntMat');
    if (intItemEl && statIntMatEl) {
      statIntMatEl.textContent = intItemEl.value || 'SS316';
    }

    // Update Bolt Spec summary widget
    const boltMatEl = document.getElementById('boltMaterial');
    const statBoltSpecEl = document.getElementById('statBoltSpec');
    if (boltMatEl && statBoltSpecEl) {
      const selectedOpt = boltMatEl.options[boltMatEl.selectedIndex];
      statBoltSpecEl.textContent = selectedOpt ? selectedOpt.text : boltMatEl.value;
    }

    // Update Int. Tie-rod summary widget
    const intTieEl = document.getElementById('internalTieRod');
    const statIntTieRodEl = document.getElementById('statIntTieRod');
    if (intTieEl && statIntTieRodEl) {
      statIntTieRodEl.textContent = intTieEl.value || 'SS316';
    }
  };

  ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight', 'tankQty', 'tankPartitions', 'reinfMethod', 'steelSkidOpt', 'insulationType', 'internalItem', 'boltMaterial', 'internalTieRod'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', calcCapa);
      el.addEventListener('change', calcCapa);
    }
  });

  // Action Buttons
  document.getElementById('btnLoadSample').addEventListener('click', () => {
    if (confirm('Discard current edits and populate sample BOM structure?')) {
      bomItems = [...sampleBOM];
      saveAndRender();
    }
  });

  document.getElementById('btnResetBOM').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all inputs and BOM items to defaults?')) {
      localStorage.removeItem('water_tank_config_inputs');
      localStorage.removeItem('water_tank_bom_draft');
      
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setVal('tankLength1', '3.0');
      setVal('tankLength2', '0.0');
      setVal('tankLength3', '0.0');
      setVal('tankLength4', '0.0');
      setVal('tankWidth', '3.5');
      setVal('tankHeight', '1.5');
      setVal('tankQty', '1');
      setVal('productType', 'STANDARD');
      setVal('insulation', 'Non-Insulated');
      setVal('sidePanelOpt', 'DEFAULT');
      setVal('partitionOpt', 'DEFAULT');
      setVal('nozzleSide', '1st Tier');
      setVal('nozzlePart', 'NO');
      setVal('reinfType', 'Internal');
      setVal('skidType', '75 Angle');
      setVal('intMaterial', 'SS316');
      setVal('boltSpec', '2:HDG+316');
      setVal('tieRodSpec', 'SS316');
      setVal('brandSpec', 'STANDARD');
      setVal('outsideTie', 'HDG');
      
      if (typeof calcCapa === 'function') calcCapa();
      generateDefaultBOMFromConfig();
    }
  });

  document.getElementById('btnApplyConfig').addEventListener('click', () => {
    generateDefaultBOMFromConfig();
  });

  const btnResetSideMatrix = document.getElementById('btnResetSideMatrix');
  if (btnResetSideMatrix) {
    btnResetSideMatrix.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the panel configuration matrix?')) {
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
        const custId = window.selectedCustomerPresetId || 'default';
        const storageKey = (custId === 'default') ? `water_tank_panel_matrix_opt${sideMatrixOption}` : `water_tank_panel_matrix_${custId}_opt${sideMatrixOption}`;
        localStorage.setItem(storageKey, JSON.stringify(panelMatrix));
        renderSidePanelConfig();
        alert(`[Option ${sideMatrixOption}] Side matrix for preset [${custId}] has been reset.`);
      }
    });
  }

  // All Options Matrix Excel Export Function
  window.exportMatrixToExcel = function() {
    try {
      if (typeof XLSX === 'undefined') {
        alert('SheetJS (XLSX) library is not loaded.');
        return;
      }

      const wb = XLSX.utils.book_new();

      const optNames = {
        0: "Roof, Manhole, Bottom, Drain",
        1: "Option 1 - Side",
        2: "Option 2 - Side (0.5m, 1m)",
        3: "Option 3 - Partition (0.5m, 1m)",
        4: "Option 4 - Partition"
      };

      const sheetNames = {
        0: "Basic_Setting",
        1: "Option_1_Side_Default",
        2: "Option_2_Side_05m_1m",
        3: "Option_3_Partition_05m_1m",
        4: "Option_4_Partition_Default"
      };

      const flatRows = [];
      const custId = window.selectedCustomerPresetId || 'default';

      [0, 1, 2, 3, 4].forEach(optNum => {
        const storageKey = (custId === 'default') ? `water_tank_panel_matrix_opt${optNum}` : `water_tank_panel_matrix_${custId}_opt${optNum}`;
        const saved = localStorage.getItem(storageKey);
        const matrix = saved ? JSON.parse(saved) : (optionMatrixStorage[optNum] || panelMatrix);
        if (!matrix) return;

        const optTitle = optNames[optNum] || `Option ${optNum}`;
        const sheetRows = [];

        matrix.forEach(row => {
          if (row.heightGrades && Object.keys(row.heightGrades).length > 0) {
            Object.keys(row.heightGrades).forEach(hKey => {
              const partVal = row.heightGrades[hKey] || '';
              flatRows.push({
                "Option Number": optNum,
                "Option Name": optTitle,
                "Section": row.section || '',
                "Matrix Key": row.key || '',
                "Height / Grade": hKey,
                "Part No": partVal
              });
              sheetRows.push({
                "Section": row.section || '',
                "Matrix Key": row.key || '',
                "Height / Grade": hKey,
                "Part No": partVal
              });
            });
          } else {
            const partVal = row.item || '';
            flatRows.push({
              "Option Number": optNum,
              "Option Name": optTitle,
              "Section": row.section || '',
              "Matrix Key": row.key || '',
              "Height / Grade": "ITEM",
              "Part No": partVal
            });
            sheetRows.push({
              "Section": row.section || '',
              "Matrix Key": row.key || '',
              "Height / Grade": "ITEM",
              "Part No": partVal
            });
          }
        });

        const sName = sheetNames[optNum] || `Option_${optNum}`;
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        XLSX.utils.book_append_sheet(wb, ws, sName);
      });

      const masterWs = XLSX.utils.json_to_sheet(flatRows);
      XLSX.utils.book_append_sheet(wb, masterWs, "All_Options_Combined");

      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const customers = window.getMatrixCustomerPresetList();
      const currentCust = customers.find(c => String(c.id) === custId);
      const custNameClean = (currentCust ? currentCust.name : 'Matrix').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');

      const filename = `YSACC_Panel_Matrix_${custNameClean}_${todayStr}.xlsx`;
      XLSX.writeFile(wb, filename);

      alert(`🎉 Matrix options for [${currentCust ? currentCust.name : 'Current Preset'}] exported to Excel file (${filename}).`);
    } catch (err) {
      console.error('Matrix Excel Export Error:', err);
      alert(`Error during Matrix Excel export: ${err.message}`);
    }
  };

  // All Options Matrix Excel Import Function
  window.importMatrixFromExcel = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') {
          alert('SheetJS (XLSX) library is not loaded.');
          return;
        }

        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        let updatedCount = 0;
        const custId = window.selectedCustomerPresetId || 'default';

        if (workbook.SheetNames.includes("All_Options_Combined")) {
          const sheet = workbook.Sheets["All_Options_Combined"];
          const rows = XLSX.utils.sheet_to_json(sheet);
          rows.forEach(r => {
            const optNum = parseInt(r["Option Number"]);
            const key = r["Matrix Key"];
            const hKey = r["Height / Grade"];
            const partNo = (r["Part No"] || '').toString().trim();

            if (!isNaN(optNum)) {
              const storageKey = (custId === 'default') ? `water_tank_panel_matrix_opt${optNum}` : `water_tank_panel_matrix_${custId}_opt${optNum}`;
              const saved = localStorage.getItem(storageKey);
              let matrix = saved ? JSON.parse(saved) : (optionMatrixStorage[optNum] || panelMatrix);

              const targetRow = matrix.find(item => item.key === key);
              if (targetRow) {
                if (hKey === 'ITEM') {
                  targetRow.item = partNo;
                } else {
                  if (!targetRow.heightGrades) targetRow.heightGrades = {};
                  targetRow.heightGrades[hKey] = partNo;
                }
                localStorage.setItem(storageKey, JSON.stringify(matrix));
                if (optNum === sideMatrixOption) panelMatrix = matrix;
                updatedCount++;
              }
            }
          });
        } else {
          const sheetOptionMap = {
            "Basic_Setting": 0,
            "Option_1_Side_Default": 1,
            "Option_2_Side_05m_1m": 2,
            "Option_3_Partition_05m_1m": 3,
            "Option_4_Partition_Default": 4
          };

          workbook.SheetNames.forEach(sheetName => {
            let optNum = sheetOptionMap[sheetName];
            if (optNum === undefined) {
              const match = sheetName.match(/Option[_\s]*(\d)/i);
              if (match) optNum = parseInt(match[1]);
            }

            if (optNum !== undefined) {
              const storageKey = (custId === 'default') ? `water_tank_panel_matrix_opt${optNum}` : `water_tank_panel_matrix_${custId}_opt${optNum}`;
              const saved = localStorage.getItem(storageKey);
              let matrix = saved ? JSON.parse(saved) : (optionMatrixStorage[optNum] || panelMatrix);

              const sheet = workbook.Sheets[sheetName];
              const rows = XLSX.utils.sheet_to_json(sheet);

              rows.forEach(r => {
                const key = r["Matrix Key"];
                const hKey = r["Height / Grade"];
                const partNo = (r["Part No"] || '').toString().trim();

                const targetRow = matrix.find(item => item.key === key);
                if (targetRow) {
                  if (hKey === 'ITEM') {
                    targetRow.item = partNo;
                  } else {
                    if (!targetRow.heightGrades) targetRow.heightGrades = {};
                    targetRow.heightGrades[hKey] = partNo;
                  }
                  updatedCount++;
                }
              });

              localStorage.setItem(storageKey, JSON.stringify(matrix));
              if (optNum === sideMatrixOption) panelMatrix = matrix;
            }
          });
        }

        [0, 1, 2, 3, 4].forEach(opt => {
          if (optionMatrixStorage[opt]) {
            localStorage.setItem(`water_tank_panel_matrix_opt${opt}`, JSON.stringify(optionMatrixStorage[opt]));
          }
        });

        if (optionMatrixStorage[sideMatrixOption]) {
          panelMatrix = optionMatrixStorage[sideMatrixOption];
        }

        if (typeof renderSidePanelConfig === 'function') {
          renderSidePanelConfig();
        }

        if (typeof generateDefaultBOMFromConfig === 'function') {
          generateDefaultBOMFromConfig();
        }

        alert(`🎉 Matrix Excel import successful! Updated ${updatedCount} panel mapping entries.`);
      } catch (err) {
        console.error('Matrix Excel Import Error:', err);
        alert(`Error reading Excel file: ${err.message}`);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

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
      partName: 'New Part',
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
    if (confirm('Are you sure you want to clear the entire BOM list?')) {
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
      alert('Please enter Part Name and Quantity.');
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
  const dbTabSubCategoryFilter = document.getElementById('dbTabSubCategoryFilter');
  if (dbTabSearchInput) {
    dbTabSearchInput.addEventListener('input', () => {
      renderDbList();
    });
  }
  if (dbTabCategoryFilter) {
    dbTabCategoryFilter.addEventListener('change', () => {
      updateCategoryDropdownsUI();
      renderDbList();
    });
  }
  if (dbTabSubCategoryFilter) {
    dbTabSubCategoryFilter.addEventListener('change', () => {
      renderDbList();
    });
  }

  // Initial populate 2-depth sub categories on page load
  if (typeof updateCategoryDropdownsUI === 'function') {
    updateCategoryDropdownsUI();
  }

  const dbModalCategory = document.getElementById('dbModalCategory');
  if (dbModalCategory) {
    dbModalCategory.addEventListener('change', () => {
      updateCategoryDropdownsUI();
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
      document.getElementById('dbModalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> Add New Master Part';
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
    const subCategory = document.getElementById('dbModalSubCategory')?.value || 'General';
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
      alert('Part No. is a required field.');
      return;
    }

    try {
      if (currentEditPartIndex === -1) {
        // Add new to Firestore (auto doc ID)
        if (partsDb.some(p => p.partNo.toLowerCase() === partNo.toLowerCase())) {
          alert('Part No already exists. Please edit the existing part.');
          return;
        }

        const newDocRef = db.collection('parts').doc();
        const newPart = { partNo, category, subCategory, nameKo, nameEn, unit, price, weight, spec, width, length, ht, fh, holes };
        await newDocRef.set(newPart);
        
        // Push with new ID to local memory array
        newPart.id = newDocRef.id;
        partsDb.unshift(newPart);
      } else {
        // Update in Firestore
        const item = partsDb[currentEditPartIndex];
        
        // Check for duplicate partNo excluding current editing item
        if (partsDb.some((p, pIdx) => pIdx !== currentEditPartIndex && p.partNo.toLowerCase() === partNo.toLowerCase())) {
          alert('Part No already registered to another part. Please enter a unique Part No.');
          return;
        }

        const updatedPart = { partNo, category, subCategory, nameKo, nameEn, unit, price, weight, spec, width, length, ht, fh, holes };
        
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
      alert("Failed to save part to Firestore: " + err.message);
    }
  });

  window.openNewDbPartModal = function() {
    currentEditPartIndex = -1;
    const modalTitle = document.getElementById('dbModalTitle');
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-plus-circle"></i> Add New Master Part';
    const pNo = document.getElementById('dbModalPartNo');
    if (pNo) { pNo.value = ''; pNo.disabled = false; }
    const cat = document.getElementById('dbModalCategory');
    if (cat) cat.value = 'PANEL';
    updateCategoryDropdownsUI();
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
    document.getElementById('dbModalTitle').innerHTML = '<i class="fa-solid fa-edit"></i> Edit Master Part Info';
    document.getElementById('dbModalPartNo').value = item.partNo;
    document.getElementById('dbModalPartNo').disabled = false; // Enable modification of partNo
    document.getElementById('dbModalCategory').value = (item.category || 'OTHER').toUpperCase();
    updateCategoryDropdownsUI();
    const subCatEl = document.getElementById('dbModalSubCategory');
    if (subCatEl) subCatEl.value = item.subCategory || getSubCategoryForPart(item);
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
    if (confirm('Are you sure you want to delete this master part? (Formulas using this part may not work properly.)')) {
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
        alert("Failed to delete part from Firestore: " + err.message);
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
      btnBulk.style.display = checked.length > 0 ? 'inline-flex' : 'none';
    }
    if (btnBulkCat) {
      btnBulkCat.style.display = checked.length > 0 ? 'inline-flex' : 'none';
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

  // Shift + Click Range Selection & Row Checkboxes Delegation
  let lastCheckedCheckbox = null;
  const tbodyMaster = document.getElementById('tbodyPartsMasterDbList');
  if (tbodyMaster) {
    tbodyMaster.addEventListener('click', (e) => {
      if (e.target.classList.contains('chk-db-row-select')) {
        const checkboxes = Array.from(tbodyMaster.querySelectorAll('.chk-db-row-select'));
        if (e.shiftKey && lastCheckedCheckbox && lastCheckedCheckbox !== e.target) {
          const start = checkboxes.indexOf(lastCheckedCheckbox);
          const end = checkboxes.indexOf(e.target);
          if (start !== -1 && end !== -1) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            const targetState = e.target.checked;
            for (let i = min; i <= max; i++) {
              checkboxes[i].checked = targetState;
            }
          }
        }
        lastCheckedCheckbox = e.target;
        updateDbBulkDeleteUI();
      }
    });

    tbodyMaster.addEventListener('change', (e) => {
      if (e.target.classList.contains('chk-db-row-select')) {
        updateDbBulkDeleteUI();
      }
    });
  }

  // Helper: Populate Batch Change Modal Category Selects
  window.updateBatchModalCategorySelects = function() {
    const mainSelect = document.getElementById('dbBatchModalSelect');
    const subSelect = document.getElementById('dbBatchModalSubSelect');
    if (!mainSelect || !subSelect) return;

    const tree = getCategoryTree();
    const mainCats = Object.keys(tree);
    const curMain = mainSelect.value || mainCats[0] || 'PANEL';
    const normMain = typeof normalizeCat === 'function' ? normalizeCat(curMain) : curMain;

    mainSelect.innerHTML = mainCats.map(c => `<option value="${c}" ${c === curMain ? 'selected' : ''}>${c}</option>`).join('');

    const set = new Set();
    const treeSubs = typeof getSubCategoriesForMain === 'function' ? getSubCategoriesForMain(normMain) : (tree[normMain] || []);
    (treeSubs || []).forEach(s => { if (s && s.trim()) set.add(s.trim()); });
    if (window.DEFAULT_CATEGORY_TREE && window.DEFAULT_CATEGORY_TREE[normMain]) {
      window.DEFAULT_CATEGORY_TREE[normMain].forEach(s => { if (s && s.trim()) set.add(s.trim()); });
    }
    if (Array.isArray(window.partsDb)) {
      window.partsDb.forEach(item => {
        if (item && typeof normalizeCat === 'function' && normalizeCat(item.category) === normMain) {
          const sub = typeof getSubCategoryForPart === 'function' ? getSubCategoryForPart(item) : item.subCategory;
          if (sub && sub.trim()) set.add(sub.trim());
        }
      });
    }
    const subs = Array.from(set);
    const curSubVal = subSelect.value;
    subSelect.innerHTML = subs.map(s => `<option value="${s}" ${s === curSubVal ? 'selected' : ''}>${s}</option>`).join('');
  };

  const batchMainSelect = document.getElementById('dbBatchModalSelect');
  if (batchMainSelect) {
    batchMainSelect.addEventListener('change', () => {
      updateBatchModalCategorySelects();
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

      updateBatchModalCategorySelects();

      const modal = document.getElementById('dbBatchCategoryModal');
      if (modal) modal.style.display = 'flex';
    });
  }

  // Modal Confirm Button Click Handler (Instant Batch Update 1-Depth & 2-Depth)
  const btnConfirmBatchCat = document.getElementById('btnConfirmDbBatchCategory');
  if (btnConfirmBatchCat) {
    btnConfirmBatchCat.addEventListener('click', async () => {
      const checkedBoxes = document.querySelectorAll('.chk-db-row-select:checked');
      if (checkedBoxes.length === 0) {
        closeDbBatchCategoryModal();
        return;
      }

      const mainSelect = document.getElementById('dbBatchModalSelect');
      const subSelect = document.getElementById('dbBatchModalSubSelect');

      const cleanCat = mainSelect ? mainSelect.value.trim().toUpperCase() : 'OTHER';
      const cleanSubCat = subSelect ? subSelect.value.trim() : 'General';

      const updateIndices = [];
      checkedBoxes.forEach(chk => {
        const idx = parseInt(chk.getAttribute('data-index'), 10);
        if (!isNaN(idx) && partsDb[idx]) {
          updateIndices.push(idx);
        }
      });

      if (updateIndices.length === 0) {
        closeDbBatchCategoryModal();
        return;
      }

      // 1. Instant local memory & LocalStorage update (0.01s!)
      const itemsToSync = [];
      updateIndices.forEach(idx => {
        const item = partsDb[idx];
        item.category = cleanCat;
        item.subCategory = cleanSubCat;
        itemsToSync.push(item);
      });

      window.partsDb = partsDb;
      localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));

      // 2. Instant UI close & re-render (0.01 sec!)
      closeDbBatchCategoryModal();
      renderDbList();
      updateDbBulkDeleteUI();

      // 3. Fast background Firestore batch write
      try {
        const batch = db.batch();
        itemsToSync.forEach(item => {
          if (item.id) {
            const docRef = db.collection('parts').doc(item.id);
            batch.set(docRef, { category: cleanCat, subCategory: cleanSubCat }, { merge: true });
          }
        });
        await batch.commit();
        console.log(`Firestore batch category update completed for ${itemsToSync.length} items.`);
      } catch (batchErr) {
        console.warn("Firestore batch category update background warning:", batchErr);
      }
    });
  }

  // Bulk Delete Button Click Handler (Instant Batch Delete)
  const btnBulkDelete = document.getElementById('btnDbTabBulkDelete');
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', async () => {
      const checkedBoxes = document.querySelectorAll('.chk-db-row-select:checked');
      if (checkedBoxes.length === 0) return;

      if (confirm(`선택한 ${checkedBoxes.length}개의 마스터 DB 자재 항목을 정말 삭제하시겠습니까?\n(Are you sure you want to delete ${checkedBoxes.length} selected master parts?)`)) {
        const deleteIndices = [];
        checkedBoxes.forEach(chk => {
          const idx = parseInt(chk.getAttribute('data-index'), 10);
          if (!isNaN(idx) && partsDb[idx]) {
            deleteIndices.push(idx);
          }
        });

        deleteIndices.sort((a, b) => b - a);

        const itemsToDelete = [];
        deleteIndices.forEach(idx => {
          itemsToDelete.push(partsDb[idx]);
          partsDb.splice(idx, 1);
        });

        // 1. Instant local memory & LocalStorage update
        window.partsDb = partsDb;
        localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));

        // 2. Instant UI re-render (0.01 sec!)
        const chkAll = document.getElementById('chkDbSelectAll');
        if (chkAll) chkAll.checked = false;
        updateDbBulkDeleteUI();
        renderDbList();

        // 3. Fast background Firestore batch delete
        try {
          const batch = db.batch();
          itemsToDelete.forEach(item => {
            if (item.id) {
              const docRef = db.collection('parts').doc(item.id);
              batch.delete(docRef);
            }
          });
          await batch.commit();
          console.log(`Firestore batch delete completed for ${itemsToDelete.length} items.`);
        } catch (batchErr) {
          console.warn("Firestore batch delete background warning:", batchErr);
        }
      }
    });
  }

  // Copy/Duplicate database item
  window.copyDbItem = async function(index, event) {
    event.stopPropagation(); // Avoid triggering openEditDbModal row click
    const sourceItem = partsDb[index];
    if (!sourceItem) return;

    let newPartNo = `${sourceItem.partNo}_copy`;
    let count = 1;
    while (partsDb.some(p => p.partNo === newPartNo)) {
      newPartNo = `${sourceItem.partNo}_copy${count}`;
      count++;
    }

    if (confirm(`Do you want to copy part '${sourceItem.partNo}' as new Part No '${newPartNo}'?`)) {
      try {
        const newItem = {
          partNo: newPartNo,
          category: sourceItem.category || 'OTHER',
          nameKo: sourceItem.nameKo ? `${sourceItem.nameKo} (Copy)` : '',
          nameEn: sourceItem.nameEn ? `${sourceItem.nameEn} (Copy)` : '',
          unit: sourceItem.unit || 'PCS',
          price: sourceItem.price || 0,
          weight: sourceItem.weight || 0,
          spec: sourceItem.spec || ''
        };

        const docRef = await db.collection('parts').add(newItem);
        newItem.id = docRef.id;

        partsDb.push(newItem);
        localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
        
        renderDbList();
        alert(`Part copied successfully (New Part No: ${newPartNo}).`);
      } catch (err) {
        console.error("Failed to copy/save to Firestore:", err);
        alert("Failed to copy part: " + err.message);
      }
    }
  };

  // 1. Action: Save Config Table Event for Selected Customer & Sub-Option
  const btnSaveConfig = document.getElementById('btnSaveConfigTable');
  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', () => {
      const custId = window.selectedCustomerPresetId || 'default';
      const subOpt = window.selectedSubOptNum !== undefined ? window.selectedSubOptNum : 1;
      const storageKey = (custId === 'default') ? `water_tank_panel_matrix_opt${subOpt}` : `water_tank_panel_matrix_${custId}_opt${subOpt}`;

      localStorage.setItem(storageKey, JSON.stringify(panelMatrix));
      alert(`Panel mapping matrix [${custId} - Option ${subOpt}] saved successfully.`);
      renderAll();
    });
  }

  // 2. Action: Use This Customer Preset & Sub-Option for BOM Calculation
  const btnUseMatrix = document.getElementById('btnUseThisMatrixPreset');
  if (btnUseMatrix) {
    btnUseMatrix.addEventListener('click', () => {
      window.activeBOMCustomerPresetId = window.selectedCustomerPresetId || 'default';
      window.activeBOMSubOptNum = window.selectedSubOptNum !== undefined ? window.selectedSubOptNum : 1;

      localStorage.setItem('water_tank_active_customer_preset_id', window.activeBOMCustomerPresetId);
      localStorage.setItem('water_tank_active_option', String(window.activeBOMSubOptNum));
      sideMatrixOption = window.activeBOMSubOptNum;

      const customers = window.getMatrixCustomerPresetList();
      const custObj = customers.find(c => String(c.id) === window.activeBOMCustomerPresetId) || customers[0];

      window.renderMatrixPresetTabsUI();
      renderAll();
      alert(`🎉 Active BOM calculation spec updated to [${custObj ? custObj.name : 'YSACC Spec'}] Option ${window.activeBOMSubOptNum}.`);
    });
  }

  // 3. Action: Add New Customer Preset
  const btnAddMatrix = document.getElementById('btnAddMatrixPreset');
  if (btnAddMatrix) {
    btnAddMatrix.addEventListener('click', () => {
      const name = prompt('Enter new customer spec preset name:', 'New Customer Spec');
      if (!name || !name.trim()) return;

      const customers = window.getMatrixCustomerPresetList();
      const newId = 'cust_' + Date.now();
      const newCust = { id: newId, name: name.trim() };
      customers.push(newCust);
      window.saveMatrixCustomerPresetList(customers);

      // Clone options 0..4 for the new customer preset
      [0, 1, 2, 3, 4].forEach(optNum => {
        const srcKey = (window.selectedCustomerPresetId === 'default') ? `water_tank_panel_matrix_opt${optNum}` : `water_tank_panel_matrix_${window.selectedCustomerPresetId}_opt${optNum}`;
        const saved = localStorage.getItem(srcKey);
        const matrixData = saved ? JSON.parse(saved) : createFreshClone(optNum === 0 ? 1 : optNum);
        localStorage.setItem(`water_tank_panel_matrix_${newId}_opt${optNum}`, JSON.stringify(matrixData));
      });

      window.selectedCustomerPresetId = newId;
      localStorage.setItem('water_tank_selected_customer_preset_id', newId);

      window.renderMatrixPresetTabsUI();
      renderSidePanelConfig();
      alert(`🎉 New spec preset '${name.trim()}' created.`);
    });
  }

  // 3.5 Action: Rename Customer Preset (Inline Editing directly inside TAB button)
  window.renameCustomerPreset = function(cid) {
    const custId = cid || window.selectedCustomerPresetId || 'default';
    const customers = window.getMatrixCustomerPresetList();
    const targetCust = customers.find(c => String(c.id) === String(custId));
    if (!targetCust) return;

    const btn = document.querySelector(`.btnMatrixCustTab[data-id="${custId}"]`);
    if (!btn) return;

    const span = btn.querySelector('.cust-preset-name-text');
    if (!span || btn.querySelector('.inline-tab-rename-input')) return; // Already editing

    const currentName = targetCust.name;

    // Replace label span with inline text input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-tab-rename-input';
    input.value = currentName;
    input.style.cssText = 'height:24px;padding:0 6px;font-size:12px;font-weight:bold;color:#0f172a;background:#ffffff;border:2px solid #0284c7;border-radius:4px;outline:none;width:130px;box-shadow:0 0 0 2px rgba(2,132,199,0.2);';

    let finished = false;
    const saveRename = () => {
      if (finished) return;
      finished = true;
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        targetCust.name = newName;
        window.saveMatrixCustomerPresetList(customers);
      }
      window.renderMatrixPresetTabsUI();
      renderSidePanelConfig();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finished = true;
        window.renderMatrixPresetTabsUI();
      }
    });

    input.addEventListener('blur', () => {
      saveRename();
    });

    input.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    span.replaceWith(input);
    input.focus();
    input.select();
  };

  const btnRenameMatrix = document.getElementById('btnRenameMatrixPreset');
  if (btnRenameMatrix) {
    btnRenameMatrix.addEventListener('click', () => {
      window.renameCustomerPreset(window.selectedCustomerPresetId);
    });
  }

  // 4. Action: Copy Customer Preset
  const btnCopyMatrix = document.getElementById('btnCopyMatrixPreset');
  if (btnCopyMatrix) {
    btnCopyMatrix.addEventListener('click', () => {
      const customers = window.getMatrixCustomerPresetList();
      const currentCust = customers.find(c => String(c.id) === window.selectedCustomerPresetId) || customers[0];

      const newName = prompt('Enter name for copied spec preset:', (currentCust ? currentCust.name : 'Spec') + ' (Copy)');
      if (!newName || !newName.trim()) return;

      const newId = 'cust_' + Date.now();
      const copyCust = { id: newId, name: newName.trim() };
      customers.push(copyCust);
      window.saveMatrixCustomerPresetList(customers);

      [0, 1, 2, 3, 4].forEach(optNum => {
        const srcKey = (window.selectedCustomerPresetId === 'default') ? `water_tank_panel_matrix_opt${optNum}` : `water_tank_panel_matrix_${window.selectedCustomerPresetId}_opt${optNum}`;
        const saved = localStorage.getItem(srcKey);
        const matrixData = saved ? JSON.parse(saved) : createFreshClone(optNum === 0 ? 1 : optNum);
        localStorage.setItem(`water_tank_panel_matrix_${newId}_opt${optNum}`, JSON.stringify(matrixData));
      });

      window.selectedCustomerPresetId = newId;
      localStorage.setItem('water_tank_selected_customer_preset_id', newId);

      window.renderMatrixPresetTabsUI();
      renderSidePanelConfig();
      alert(`🎉 Spec preset '${newName.trim()}' copied successfully.`);
    });
  }

  // 5. Action: Delete Customer Preset
  const btnDeleteMatrix = document.getElementById('btnDeleteMatrixPreset');
  if (btnDeleteMatrix) {
    btnDeleteMatrix.addEventListener('click', () => {
      if (window.selectedCustomerPresetId === 'default') {
        alert('The default YSACC Spec preset cannot be deleted.');
        return;
      }

      const customers = window.getMatrixCustomerPresetList();
      const currentCust = customers.find(c => String(c.id) === window.selectedCustomerPresetId);
      if (!confirm(`Are you sure you want to delete '${currentCust ? currentCust.name : window.selectedCustomerPresetId}' spec preset?`)) return;

      const idx = customers.findIndex(c => String(c.id) === window.selectedCustomerPresetId);
      if (idx !== -1) customers.splice(idx, 1);
      window.saveMatrixCustomerPresetList(customers);

      // Clean up local storage for deleted customer preset
      [0, 1, 2, 3, 4].forEach(optNum => {
        localStorage.removeItem(`water_tank_panel_matrix_${window.selectedCustomerPresetId}_opt${optNum}`);
      });

      if (window.activeBOMCustomerPresetId === window.selectedCustomerPresetId) {
        window.activeBOMCustomerPresetId = 'default';
        localStorage.setItem('water_tank_active_customer_preset_id', 'default');
      }

      window.selectedCustomerPresetId = 'default';
      localStorage.setItem('water_tank_selected_customer_preset_id', 'default');

      window.renderMatrixPresetTabsUI();
      renderSidePanelConfig();
      alert('Spec preset deleted.');
    });
  }

  // Global Auto-Compressing Logo Upload & Reset Handlers (for System Settings tab & header)
  window.handleLogoUploadEvent = function(e) {
    try {
      const input = e ? (e.target || e.srcElement) : (document.getElementById('logoUploadSettings') || document.getElementById('logoUpload'));
      const file = input && input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 400;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
              else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const compressedUrl = canvas.toDataURL('image/png');
            localStorage.setItem('custom_company_logo', compressedUrl);
            updateLogoUI(compressedUrl);
            window.saveLogoToFirestore(compressedUrl);
            alert('회사 로고가 성공적으로 등록되었으며, 클라우드 DB에 동기화되었습니다.');
          } catch (err) {
            const rawUrl = evt.target.result;
            try {
              localStorage.setItem('custom_company_logo', rawUrl);
              updateLogoUI(rawUrl);
              window.saveLogoToFirestore(rawUrl);
              alert('회사 로고가 성공적으로 등록되었으며, 클라우드 DB에 동기화되었습니다.');
            } catch (quotaErr) {
              alert('이미지 파일 용량이 너무 큽니다. 더 작은 이미지를 선택해 주세요.');
            }
          }
        };
        img.onerror = function() {
          alert('유효한 이미지 파일(PNG, JPG 등)을 선택해 주세요.');
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[Logo Upload Event Error]', err);
    }
  };

  window.saveLogoToFirestore = function(logoDataUrl) {
    if (!window.firebase || !firebase.firestore) return;
    try {
      const db = firebase.firestore();
      db.collection('settings').doc('companyLogo').set({
        logoDataUrl: logoDataUrl || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(() => {
        console.log('[Firestore] Company logo cloud sync successful.');
      }).catch(err => {
        console.warn('[Firestore] Logo cloud sync failed:', err);
      });
    } catch (e) {
      console.warn('[Firestore] Logo cloud sync error:', e);
    }
  };

  window.loadLogoFromFirestore = function() {
    if (!window.firebase || !firebase.firestore) return;
    try {
      const db = firebase.firestore();
      db.collection('settings').doc('companyLogo').get().then(doc => {
        if (doc.exists && doc.data() && doc.data().logoDataUrl) {
          const cloudLogo = doc.data().logoDataUrl;
          localStorage.setItem('custom_company_logo', cloudLogo);
          updateLogoUI(cloudLogo);
          console.log('[Firestore] Restored company logo from cloud DB.');
        }
      }).catch(err => {
        console.warn('[Firestore] Logo cloud fetch failed:', err);
      });
    } catch (e) {
      console.warn('[Firestore] Logo cloud fetch error:', e);
    }
  };

  window.resetCompanyLogo = function() {
    if (confirm('등록된 회사 로고를 기본값으로 초기화하시겠습니까?')) {
      localStorage.removeItem('custom_company_logo');
      updateLogoUI(null);
      window.saveLogoToFirestore(null);
      alert('로고가 기본값으로 초기화되었습니다.');
    }
  };

  // Custom Company Name & Abbreviation (IPO Prefix) Settings Handlers
  window.saveCompanyName = function() {
    const nameInput = document.getElementById('companyNameSettingsInput');
    const abbrInput = document.getElementById('companyAbbrSettingsInput');

    const newName = nameInput ? (nameInput.value.trim() || 'YSACC') : 'YSACC';
    let newAbbr = abbrInput ? abbrInput.value.trim().toUpperCase() : '';
    if (!newAbbr) {
      newAbbr = (newName.length <= 8 ? newName : newName.slice(0, 5)).toUpperCase();
    }

    localStorage.setItem('custom_company_name', newName);
    localStorage.setItem('custom_company_abbr', newAbbr);

    updateCompanyNameUI(newName, newAbbr);
    alert(`Company settings updated!\n· Official Company Name: '${newName}'\n· Company Abbreviation (IPO Prefix): '${newAbbr}'`);
  };

  function updateCompanyNameUI(name, abbr) {
    const companyName = name || localStorage.getItem('custom_company_name') || 'YSACC';
    const savedAbbr = localStorage.getItem('custom_company_abbr') || '';
    const companyAbbr = abbr || savedAbbr || (companyName.length <= 8 ? companyName : companyName.slice(0, 5)).toUpperCase();

    const headerCompanyEl = document.getElementById('headerCompanyNameText');
    if (headerCompanyEl) {
      headerCompanyEl.textContent = companyName;
    }
    const nameInput = document.getElementById('companyNameSettingsInput');
    if (nameInput && nameInput.value !== companyName) {
      nameInput.value = companyName;
    }
    const abbrInput = document.getElementById('companyAbbrSettingsInput');
    if (abbrInput && abbrInput.value !== companyAbbr) {
      abbrInput.value = companyAbbr;
    }
    const sidebarFooterEl = document.querySelector('.sidebar-footer p');
    if (sidebarFooterEl) {
      sidebarFooterEl.textContent = `${companyName} Water Tank System`;
    }

    // Auto-update Project ID (IPO) field prefix when company abbreviation changes in General Settings
    const ipoInput = document.getElementById("ipoNo");
    if (ipoInput && typeof generateAutoProjectId === 'function') {
      const activeProjectName = localStorage.getItem("water_tank_active_project_name");
      const currentVal = ipoInput.value.trim();
      if (!activeProjectName || !currentVal || currentVal.includes("-202")) {
        ipoInput.value = generateAutoProjectId();
      }
    }
  }

  const logoUpload = document.getElementById('logoUpload');
  if (logoUpload) {
    logoUpload.addEventListener('change', window.handleLogoUploadEvent);
  }

  const logoUploadSettings = document.getElementById('logoUploadSettings');
  if (logoUploadSettings) {
    logoUploadSettings.addEventListener('change', window.handleLogoUploadEvent);
  }

  // Load custom logo & company name on start if exists
  const savedLogo = localStorage.getItem('custom_company_logo');
  if (savedLogo) {
    updateLogoUI(savedLogo);
  }
  if (window.loadLogoFromFirestore) {
    window.loadLogoFromFirestore();
  }
  updateCompanyNameUI();
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

  // --- Global Currency Management ---
  const CURRENCY_MAP = {
    USD: { symbol: "$", code: "USD", name: "USD ($)" },
    KRW: { symbol: "₩", code: "KRW", name: "KRW (₩)" },
    EUR: { symbol: "€", code: "EUR", name: "EUR (€)" },
    JPY: { symbol: "¥", code: "JPY", name: "JPY (¥)" },
    KWD: { symbol: "KD", code: "KWD", name: "KWD (KD)" },
    AED: { symbol: "AED", code: "AED", name: "AED (AED)" },
    SAR: { symbol: "SAR", code: "SAR", name: "SAR (SAR)" },
    GBP: { symbol: "£", code: "GBP", name: "GBP (£)" },
    CNY: { symbol: "¥", code: "CNY", name: "CNY (¥)" }
  };

  window.getSystemCurrencyCode = function() {
    return localStorage.getItem("water_tank_system_currency") || "USD";
  };

  window.getSystemCurrencySymbol = function() {
    const code = getSystemCurrencyCode();
    return (CURRENCY_MAP[code] && CURRENCY_MAP[code].symbol) || "$";
  };

  window.formatCurrency = function(amount) {
    const num = parseFloat(amount);
    if (isNaN(num)) return "-";
    const symbol = getSystemCurrencySymbol();
    const code = getSystemCurrencyCode();
    if (code === "KRW" || code === "JPY") {
      return `${symbol}${Math.round(num).toLocaleString()}`;
    }
    return `${symbol}${num.toFixed(2)}`;
  };

  window.saveSystemCurrency = function() {
    const select = document.getElementById("systemCurrencySelect");
    if (!select) return;
    const selectedCode = select.value || "USD";
    localStorage.setItem("water_tank_system_currency", selectedCode);
    updateSystemCurrencyUI();
    if (typeof renderAll === "function") renderAll();
    if (typeof renderPartsDbMasterTable === "function") renderPartsDbMasterTable();
    if (typeof renderCostingPanelTable === "function") renderCostingPanelTable();
    alert(`🎉 System currency saved as "${CURRENCY_MAP[selectedCode].name}" (Symbol: ${CURRENCY_MAP[selectedCode].symbol})!`);
  };

  window.updateSystemCurrencyUI = function() {
    const select = document.getElementById("systemCurrencySelect");
    const activeCode = getSystemCurrencyCode();
    if (select) select.value = activeCode;

    const symbol = getSystemCurrencySymbol();

    // 1. Master DB Header Column
    const masterPriceTh = document.getElementById("thMasterPrice");
    if (masterPriceTh) {
      masterPriceTh.innerHTML = `Price (${symbol}) <span id="sort-icon-price"><i class="fa-solid fa-sort"></i></span>`;
    }

    // 2. COSTING Sub-Tab 1 Labels
    const smc = document.getElementById("lblCostMatSmc");
    if (smc) smc.textContent = `SMC Raw Material Price (${symbol}/kg):`;

    const gc = document.getElementById("lblCostMatGc");
    if (gc) gc.textContent = `Glass Cloth Base Price (${symbol}/kg):`;

    const insSkin = document.getElementById("lblCostMatInsSkin");
    if (insSkin) insSkin.textContent = `Insulation Cover Skin (${symbol}/m²):`;

    const insMdi = document.getElementById("lblCostMatInsMdi");
    if (insMdi) insMdi.textContent = `Insulation MDI (${symbol}/kg):`;

    const insPolyol = document.getElementById("lblCostMatInsPolyol");
    if (insPolyol) insPolyol.textContent = `Insulation POLYOL (${symbol}/kg):`;

    // 3. COSTING Sub-Tab 2 Header
    const laborH = document.getElementById("lblCostLaborHeader");
    if (laborH) laborH.innerHTML = `<i class="fa-solid fa-hand-holding-dollar"></i> Labour Cost & Benefits (${symbol}/Year)`;

    // 4. COSTING Sub-Tab 3 Headers
    const eqBuy = document.getElementById("thCostEqBuyPrice");
    if (eqBuy) eqBuy.textContent = `Purchase Price (${symbol})`;

    const eqFixed = document.getElementById("thCostEqFixedMonth");
    if (eqFixed) eqFixed.textContent = `Monthly Fixed (${symbol}/Mo)`;

    const eqVar = document.getElementById("thCostEqVarHour");
    if (eqVar) eqVar.textContent = `Hourly Var. (${symbol}/h)`;

    const eqBoiler = document.getElementById("thCostEqBoilerHour");
    if (eqBoiler) eqBoiler.textContent = `Boiler Cost (${symbol}/h)`;

    const eqRate = document.getElementById("thCostEqHourlyRate");
    if (eqRate) eqRate.textContent = `Hourly Rate (${symbol}/h)`;

    // 5. COSTING Sub-Tab 4 Headers
    const pProc = document.getElementById("thCostPanelProcessing");
    if (pProc) pProc.textContent = `Fabrication (${symbol})`;

    const pSingle = document.getElementById("thCostPanelSingle");
    if (pSingle) pSingle.textContent = `Single Panel Cost (${symbol})`;

    const pIns = document.getElementById("thCostPanelInsulated");
    if (pIns) pIns.textContent = `Insulation Cost (${symbol})`;

    const pTot = document.getElementById("thCostPanelTotal");
    if (pTot) pTot.textContent = `Total Price (${symbol})`;

    // 6. BOM Cost Analysis Headers
    const bomUnitPriceTh = document.getElementById("thCostUnitPrice");
    if (bomUnitPriceTh) bomUnitPriceTh.textContent = `Unit Price (${symbol})`;

    const bomTotalPriceTh = document.getElementById("thCostTotalPrice");
    if (bomTotalPriceTh) bomTotalPriceTh.textContent = `Total Price (${symbol})`;

    if (typeof window.calcCostingSummary === "function") {
      window.calcCostingSummary();
    }
    if (typeof window.renderCOST === "function") {
      window.renderCOST();
    }
  };

  // Calculate once initially
  calcCapa();
  updateSystemCurrencyUI();

  // Universal Draggable Modalless Floating Window Handler
  window.makeModallessDraggable = function(winId, headerId) {
    const win = document.getElementById(winId);
    const header = document.getElementById(headerId);
    if (!win || !header) return;

    if (header.dataset.draggableInitialized === "true") return;
    header.dataset.draggableInitialized = "true";

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    header.style.cursor = "move";
    header.style.userSelect = "none";

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      if (e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      const newTop = win.offsetTop - pos2;
      const newLeft = win.offsetLeft - pos1;

      win.style.top = Math.max(0, newTop) + "px";
      win.style.left = Math.max(0, newLeft) + "px";
      win.style.right = "auto";
      win.style.margin = "0";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  };

  // --- Project database management listeners & SUB window logic ---
  window.openProjectManagerModal = function() {
    const modal = document.getElementById("projectManagerModal");
    if (modal) modal.style.display = "block";
    renderProjectManagerList();
    if (typeof makeModallessDraggable === "function") {
      makeModallessDraggable("projectManagerWindow", "projectManagerHeader");
    }
  };

  window.closeProjectManagerModal = function() {
    const modal = document.getElementById("projectManagerModal");
    if (modal) modal.style.display = "none";
  };

  window.toggleMinimizeProjectManager = function() {
    const win = document.getElementById("projectManagerWindow");
    if (!win) return;
    if (win.style.height === "50px") {
      win.style.height = "calc(92vh - 45px)";
    } else {
      win.style.height = "50px";
    }
  };

  window.getProjectList = function() {
    try {
      const json = localStorage.getItem("water_tank_projects_db");
      return json ? JSON.parse(json) : {};
    } catch (e) {
      console.error("Failed to parse water_tank_projects_db:", e);
      return {};
    }
  };

  window.saveProjectList = function(dbList) {
    try {
      localStorage.setItem("water_tank_projects_db", JSON.stringify(dbList));
    } catch (e) {
      console.error("Failed to save water_tank_projects_db:", e);
    }
  };

  let customDialogResolver = null;

  window.showCustomAppDialog = function(opts) {
    return new Promise((resolve) => {
      customDialogResolver = resolve;
      const modal = document.getElementById("customAppDialogModal");
      const titleText = document.getElementById("customDialogTitleText");
      const icon = document.getElementById("customDialogIcon");
      const body = document.getElementById("customDialogBody");
      const inputGroup = document.getElementById("customDialogInputGroup");
      const input = document.getElementById("customDialogInput");
      const btnConfirm = document.getElementById("btnCustomDialogConfirm");
      const btnCancel = document.getElementById("btnCustomDialogCancel");

      if (!modal) {
        resolve(opts.type === "prompt" ? opts.defaultValue : opts.type === "confirm");
        return;
      }

      if (titleText) titleText.textContent = opts.title || "Notice";
      if (icon) icon.className = opts.icon || "fa-solid fa-circle-info";
      if (body) body.innerHTML = opts.message || "";

      if (opts.type === "prompt") {
        if (inputGroup) inputGroup.style.display = "block";
        if (input) {
          input.value = opts.defaultValue || "";
          setTimeout(() => input.focus(), 50);
        }
      } else {
        if (inputGroup) inputGroup.style.display = "none";
      }

      if (opts.type === "alert") {
        if (btnCancel) btnCancel.style.display = "none";
        if (btnConfirm) btnConfirm.textContent = opts.confirmText || "OK";
      } else {
        if (btnCancel) {
          btnCancel.style.display = "inline-block";
          btnCancel.textContent = opts.cancelText || "Cancel";
        }
        if (btnConfirm) btnConfirm.textContent = opts.confirmText || "Confirm";
      }

      if (btnConfirm) {
        btnConfirm.onclick = () => {
          modal.style.display = "none";
          if (opts.type === "prompt") {
            resolve(input ? input.value : "");
          } else {
            resolve(true);
          }
        };
      }

      if (btnCancel) {
        btnCancel.onclick = () => {
          modal.style.display = "none";
          resolve(opts.type === "prompt" ? null : false);
        };
      }

      modal.style.display = "flex";
    });
  };

  window.closeCustomAppDialog = function(val) {
    const modal = document.getElementById("customAppDialogModal");
    if (modal) modal.style.display = "none";
    if (customDialogResolver) {
      customDialogResolver(val);
      customDialogResolver = null;
    }
  };

  window.generateAutoProjectId = function() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    // Dynamically retrieve company abbreviation / prefix from General Setting
    const storedAbbr = (localStorage.getItem('custom_company_abbr') || '').trim();
    const storedName = (localStorage.getItem('custom_company_name') || 'YSACC').trim();
    const prefixCandidate = storedAbbr || (storedName.length <= 8 ? storedName : storedName.slice(0, 5));
    const companyPrefix = prefixCandidate.toUpperCase() || 'YSACC';
    const datePrefix = `${companyPrefix}-${yyyy}${mm}${dd}`;

    const dbList = getProjectList();
    const keys = Object.keys(dbList);

    let maxSeq = 0;
    keys.forEach(k => {
      const proj = dbList[k];
      const idStr = (proj && proj.ipoNo) ? proj.ipoNo : "";
      if (idStr && (idStr.startsWith(datePrefix) || idStr.startsWith(`${companyPrefix}-${yyyy}`) || idStr.startsWith(`YSACC-${yyyy}`))) {
        const parts = idStr.split("-");
        const seq = parseInt(parts[parts.length - 1]);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${datePrefix}-${nextSeq}`;
  };

  let activeProjectLastSpecSignature = null;
  let isCheckingSpecChange = false;

  window.getCurrentSpecSignature = function() {
    const w = document.getElementById("tankWidth")?.value || "0";
    const l1 = document.getElementById("tankLength1")?.value || "0";
    const l2 = document.getElementById("tankLength2")?.value || "0";
    const l3 = document.getElementById("tankLength3")?.value || "0";
    const l4 = document.getElementById("tankLength4")?.value || "0";
    const h = document.getElementById("tankHeight")?.value || "0";
    const part = document.getElementById("numPartition")?.value || "0";
    const ins = document.getElementById("insulationType")?.value || "NONE";
    return `${w}x${l1}_${l2}_${l3}_${l4}x${h}_P${part}_I${ins}`;
  };

  window.formatTankSizeDisplay = function(item) {
    if (!item) return "-";
    if (typeof item === "string") return item;

    const inp = item.inputs || {};
    const l1 = parseFloat(inp.tankLength1 || item.tankL1 || 0) || 0;
    const l2 = parseFloat(inp.tankLength2 || item.tankL2 || 0) || 0;
    const l3 = parseFloat(inp.tankLength3 || item.tankL3 || 0) || 0;
    const l4 = parseFloat(inp.tankLength4 || item.tankL4 || 0) || 0;
    const w = parseFloat(inp.tankWidth || item.tankW || 0) || 0;
    const h = parseFloat(inp.tankHeight || item.tankH || 0) || 0;

    const validLengths = [l1, l2, l3, l4].filter(val => val > 0);
    const totalLength = validLengths.reduce((sum, v) => sum + v, 0);

    let lengthDesc = `${totalLength}m(L)`;
    if (validLengths.length > 1) {
      lengthDesc = `${totalLength}(${validLengths.join('+')})m(L)`;
    } else if (validLengths.length === 1) {
      lengthDesc = `${totalLength}m(L)`;
    } else {
      lengthDesc = `0m(L)`;
    }

    return `${lengthDesc} * ${w}m(W) * ${h}m(H)`;
  };

  window.saveCurrentProjectQuick = async function() {
    const currentActiveName = localStorage.getItem("water_tank_active_project_name");
    
    if (!currentActiveName) {
      await promptSaveNewProject();
      return;
    }

    const currentSig = getCurrentSpecSignature();
    const dbList = getProjectList();
    const currentProj = dbList[currentActiveName];

    let hasSpecChanged = false;
    if (activeProjectLastSpecSignature && currentSig !== activeProjectLastSpecSignature) {
      hasSpecChanged = true;
    } else if (!currentProj) {
      hasSpecChanged = true;
    }

    const sizeText = document.getElementById("statSizeFormula")?.textContent || formatTankSizeDisplay({
      inputs: {
        tankWidth: document.getElementById("tankWidth")?.value,
        tankLength1: document.getElementById("tankLength1")?.value,
        tankLength2: document.getElementById("tankLength2")?.value,
        tankLength3: document.getElementById("tankLength3")?.value,
        tankLength4: document.getElementById("tankLength4")?.value,
        tankHeight: document.getElementById("tankHeight")?.value
      }
    });

    if (hasSpecChanged) {
      const choice = await showCustomAppDialog({
        title: "Select Save Option",
        icon: "fa-solid fa-folder-plus",
        message: `⚠️ Tank dimensions/specifications [${sizeText}] have been modified!\n\n` +
                 `· [Save as New ID]: Generate a new unique project ID and save.\n` +
                 `· [Overwrite Existing]: Overwrite existing project "${currentActiveName}" (ID: ${currentProj?.ipoNo || "-"}).`,
        confirmText: "Save as New ID",
        cancelText: "Overwrite Existing"
      });

      if (choice) {
        await promptSaveNewProject();
      } else {
        await saveProjectData(currentActiveName, currentProj?.ipoNo, true);
      }
    } else {
      const choice = await showCustomAppDialog({
        title: "Select Save Option",
        icon: "fa-solid fa-floppy-disk",
        message: `Current project "${currentActiveName}" (Current ID: ${currentProj?.ipoNo || "-"}) Spec: [${sizeText}]\n\n` +
                 `· [Save as New ID]: Generate a new unique ID and save as new project.\n` +
                 `· [Overwrite Existing]: Overwrite current project ID (${currentProj?.ipoNo || "-"}).`,
        confirmText: "Save as New ID",
        cancelText: "Overwrite Existing"
      });

      if (choice) {
        await promptSaveNewProject();
      } else {
        await saveProjectData(currentActiveName, currentProj?.ipoNo, true);
      }
    }
  };

  window.promptSaveNewProject = async function() {
    const autoId = generateAutoProjectId();
    const sizeText = document.getElementById("statSizeFormula")?.textContent || formatTankSizeDisplay({
      inputs: {
        tankWidth: document.getElementById("tankWidth")?.value,
        tankLength1: document.getElementById("tankLength1")?.value,
        tankLength2: document.getElementById("tankLength2")?.value,
        tankLength3: document.getElementById("tankLength3")?.value,
        tankLength4: document.getElementById("tankLength4")?.value,
        tankHeight: document.getElementById("tankHeight")?.value
      }
    });

    const defaultName = document.getElementById("projectName")?.value || `Project (${sizeText})`;
    
    const name = await showCustomAppDialog({
      type: "prompt",
      title: "Save New Project",
      icon: "fa-solid fa-folder-plus",
      message: `Enter name for the new project:\nSpec: [${sizeText}]\n(Auto-generated Project ID: ${autoId})`,
      defaultValue: defaultName,
      confirmText: "Save as New ID",
      cancelText: "Cancel"
    });

    if (!name || !name.trim()) return;

    const ipoInput = document.getElementById("ipoNo");
    if (ipoInput) ipoInput.value = autoId;

    await saveProjectData(name.trim(), autoId, false);
  };

  window.saveProjectData = async function(name, forcedIpoNo, isOverwrite) {
    try {
      const dbList = getProjectList();

      let ipoNo = forcedIpoNo;
      if (!isOverwrite || !ipoNo || ipoNo === "WA-2022-01") {
        ipoNo = generateAutoProjectId();
      }

      const ipoInput = document.getElementById("ipoNo");
      if (ipoInput) ipoInput.value = ipoNo;

      // Gather form inputs strictly scoped to #tab-basic-tool
      const inputs = {};
      document.querySelectorAll("#tab-basic-tool input, #tab-basic-tool select, #tab-basic-tool textarea").forEach(el => {
        if (el.id && el.id !== "ipoNo") {
          inputs[el.id] = el.type === "checkbox" ? el.checked : el.value;
        }
      });

      // Gather option matrices
      const matrices = {};
      [1, 2, 3, 4].forEach(opt => {
        const savedOpt = localStorage.getItem(`water_tank_panel_matrix_opt${opt}`);
        if (savedOpt) {
          matrices[opt] = JSON.parse(savedOpt);
        }
      });

      // Gather BOM data
      const bomData = (typeof currentBOM !== "undefined" && currentBOM) ? JSON.parse(JSON.stringify(currentBOM)) : null;

      // Gather Pallet Packing data
      const palletData = (typeof PalletPacking !== "undefined" && PalletPacking.getPalletData) ? PalletPacking.getPalletData() : null;

      // Gather COSTING Module data per project
      const costingData = (typeof window.getCostingData === "function") ? window.getCostingData() : null;

      const getVal = id => document.getElementById(id)?.value || "";

      const customerName = getVal("customerName") || "MEP";
      const orderDate = getVal("orderDate") || new Date().toISOString().slice(0, 10);
      const tankW = getVal("tankWidth") || "2";
      const tankL1 = getVal("tankLength1") || "2";
      const tankL2 = getVal("tankLength2") || "0";
      const tankL3 = getVal("tankLength3") || "0";
      const tankL4 = getVal("tankLength4") || "0";
      const tankH = getVal("tankHeight") || "2";
      const capaText = document.getElementById("statCapa")?.textContent || "-";

      const formattedSize = document.getElementById("statSizeFormula")?.textContent || formatTankSizeDisplay({
        tankW, tankL1, tankL2, tankL3, tankL4, tankH,
        inputs: { tankWidth: tankW, tankLength1: tankL1, tankLength2: tankL2, tankLength3: tankL3, tankLength4: tankL4, tankHeight: tankH }
      });

      inputs["ipoNo"] = ipoNo;

      dbList[name] = {
        name: name,
        ipoNo: ipoNo,
        customerName: customerName,
        orderDate: orderDate,
        tankW: tankW,
        tankL1: tankL1,
        tankL2: tankL2,
        tankL3: tankL3,
        tankL4: tankL4,
        tankH: tankH,
        formattedSize: formattedSize,
        capaText: capaText,
        inputs: inputs,
        matrices: matrices,
        bomItems: typeof bomItems !== "undefined" ? bomItems : null,
        bomData: bomData,
        palletData: palletData,
        costingData: costingData,
        savedAt: new Date().toLocaleString()
      };

      saveProjectList(dbList);
      localStorage.setItem("water_tank_active_project_name", name);
      activeProjectLastSpecSignature = getCurrentSpecSignature();
      updateActiveProjectBadge(name, ipoNo);
      renderProjectManagerList();

      await showCustomAppDialog({
        type: "alert",
        title: "Save Complete",
        icon: "fa-solid fa-circle-check",
        message: `🎉 Project "${name}" (ID: ${ipoNo})\nSpec: [${formattedSize}]\n\nAll dimensions, BOM, packing, and COSTING data saved successfully!`
      });
    } catch (e) {
      console.error("Save project error:", e);
      await showCustomAppDialog({ type: "alert", title: "Error", message: "Error saving project: " + e.message });
    }
  };

  window.loadProjectData = async function(name) {
    try {
      const dbList = getProjectList();
      const proj = dbList[name];
      if (!proj) {
        await showCustomAppDialog({ type: "alert", title: "Error", message: "Project data not found." });
        return;
      }

      const confirmLoad = await showCustomAppDialog({
        type: "confirm",
        title: "Load Project",
        icon: "fa-solid fa-file-import",
        message: `Do you want to load project "${name}" (ID: ${proj.ipoNo || "-"})?\nCurrent dimensions, BOM, packing, and COSTING configurations will be switched.`,
        confirmText: "Load",
        cancelText: "Cancel"
      });

      if (!confirmLoad) return;

      // 1. Restore form inputs strictly scoped to #tab-basic-tool
      if (proj.inputs) {
        Object.keys(proj.inputs).forEach(id => {
          const el = document.getElementById(id);
          if (el && id !== "ipoNo") {
            if (el.type === "checkbox") {
              el.checked = proj.inputs[id];
            } else {
              el.value = proj.inputs[id];
            }
          }
        });
        localStorage.setItem("water_tank_config_inputs", JSON.stringify(proj.inputs));
      }

      // 2. Restore option matrices
      if (proj.matrices) {
        Object.keys(proj.matrices).forEach(optNum => {
          localStorage.setItem(`water_tank_panel_matrix_opt${optNum}`, JSON.stringify(proj.matrices[optNum]));
          if (typeof optionMatrixStorage !== "undefined") {
            optionMatrixStorage[optNum] = proj.matrices[optNum];
          }
        });
        if (typeof optionMatrixStorage !== "undefined" && typeof sideMatrixOption !== "undefined" && optionMatrixStorage[sideMatrixOption]) {
          panelMatrix = optionMatrixStorage[sideMatrixOption];
        }
      }

      // 3. Restore BOM data per project
      if (proj.bomItems && Array.isArray(proj.bomItems) && proj.bomItems.length > 0) {
        bomItems = JSON.parse(JSON.stringify(proj.bomItems));
        localStorage.setItem("water_tank_bom_draft", JSON.stringify(proj.bomItems));
      } else {
        if (typeof generateDefaultBOMFromConfig === "function") generateDefaultBOMFromConfig();
      }

      // 4. Recalculate capacity and re-render UI
      if (typeof calcCapa === "function") calcCapa();
      if (typeof renderAll === "function") renderAll();

      // 5. Restore Pallet Packing data per project
      if (proj.palletData && typeof PalletPacking !== "undefined" && PalletPacking.loadPalletData) {
        PalletPacking.loadPalletData(proj.palletData);
      }

      // 6. Restore COSTING data per project
      if (proj.costingData && typeof window.setCostingData === "function") {
        window.setCostingData(proj.costingData);
      }

      localStorage.setItem("water_tank_active_project_name", name);
      activeProjectLastSpecSignature = getCurrentSpecSignature();
      const ipoInput = document.getElementById("ipoNo");
      if (ipoInput && proj.ipoNo) ipoInput.value = proj.ipoNo;
      updateActiveProjectBadge(name, proj.ipoNo || "-");
      renderProjectManagerList();

      await showCustomAppDialog({
        type: "alert",
        title: "Load Complete",
        icon: "fa-solid fa-circle-check",
        message: `🎉 All dimensions, BOM, packing, and COSTING data for project "${name}" (ID: ${proj.ipoNo || "-"}) loaded successfully!`
      });
    } catch (e) {
      console.error("Load project error:", e);
      await showCustomAppDialog({ type: "alert", title: "Error", message: "Error loading project: " + e.message });
    }
  };

  window.deleteProjectData = async function(name) {
    const confirmDel = await showCustomAppDialog({
      type: "confirm",
      title: "Delete Project",
      icon: "fa-solid fa-trash-can",
      message: `Are you sure you want to permanently delete project "${name}"?\nThis operation cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel"
    });

    if (!confirmDel) return;

    try {
      const dbList = getProjectList();
      delete dbList[name];
      saveProjectList(dbList);
      if (localStorage.getItem("water_tank_active_project_name") === name) {
        localStorage.removeItem("water_tank_active_project_name");
        updateActiveProjectBadge("", "");
      }
      renderProjectManagerList();
      await showCustomAppDialog({
        type: "alert",
        title: "Delete Complete",
        icon: "fa-solid fa-circle-check",
        message: `Project "${name}" has been deleted successfully.`
      });
    } catch (e) {
      console.error("Delete project error:", e);
      await showCustomAppDialog({ type: "alert", title: "Error", message: "Error deleting project: " + e.message });
    }
  };

  window.clearAllProjectsData = async function() {
    const dbList = getProjectList();
    const count = Object.keys(dbList).length;
    if (count === 0) {
      await showCustomAppDialog({ type: "alert", title: "Notice", message: "No saved projects to delete." });
      return;
    }

    const confirmAll = await showCustomAppDialog({
      type: "confirm",
      title: "Delete All Projects",
      icon: "fa-solid fa-triangle-exclamation",
      message: `⚠️ Are you sure you want to delete all ${count} saved projects?\nThis action cannot be restored.`,
      confirmText: "Delete All",
      cancelText: "Cancel"
    });

    if (!confirmAll) return;

    try {
      localStorage.removeItem("water_tank_projects_db");
      localStorage.removeItem("water_tank_active_project_name");
      updateActiveProjectBadge("", "");
      renderProjectManagerList();
      await showCustomAppDialog({
        type: "alert",
        title: "Bulk Delete Complete",
        icon: "fa-solid fa-circle-check",
        message: "🎉 All project data cleared successfully."
      });
    } catch (e) {
      console.error("Clear all projects error:", e);
      await showCustomAppDialog({ type: "alert", title: "Error", message: "Error clearing all projects: " + e.message });
    }
  };

  window.updateActiveProjectBadge = function(name, ipoNo) {
    const badge = document.getElementById("activeProjectBadge");
    if (!badge) return;
    if (name) {
      badge.innerHTML = `<i class="fa-solid fa-bookmark" style="color:#38bdf8;"></i> Active Project: <b>${name}</b> (IPO: ${ipoNo || "-"})`;
      badge.style.background = "rgba(56, 189, 248, 0.25)";
      badge.style.borderColor = "#38bdf8";
    } else {
      badge.innerHTML = `<i class="fa-solid fa-bookmark"></i> Active Project: None`;
      badge.style.background = "rgba(56, 189, 248, 0.15)";
      badge.style.borderColor = "rgba(56, 189, 248, 0.4)";
    }
  };

  function renderProjectTableContainer(tbodyId, countTextId, searchInputId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const countText = document.getElementById(countTextId);
    const query = (document.getElementById(searchInputId)?.value || "").toLowerCase().trim();

    const dbList = getProjectList();
    const keys = Object.keys(dbList);
    if (countText) countText.textContent = keys.length;

    tbody.innerHTML = "";

    if (keys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="padding:35px; color:#94a3b8; font-style:italic;">No saved projects found. Click [Save New Project] to create one.</td></tr>`;
      return;
    }

    const activeName = localStorage.getItem("water_tank_active_project_name");

    keys.forEach(name => {
      const item = dbList[name];
      const ipo = item.ipoNo || "-";
      const customer = item.customerName || "-";
      const orderDate = item.orderDate || (item.inputs && item.inputs.orderDate) || "-";
      const sizeStr = item.formattedSize || (typeof formatTankSizeDisplay === "function" ? formatTankSizeDisplay(item) : `${item.tankW || "2"}m x ${item.tankL1 || "2"}m x ${item.tankH || "2"}m`);
      const capaStr = item.capaText || "-";
      const hasBom = (item.bomData && item.bomData.length > 0) || (item.bomItems && item.bomItems.length > 0);
      const hasPallet = item.palletData && item.palletData.pallets && item.palletData.pallets.length > 0;
      const dateStr = item.savedAt || "-";

      if (query) {
        const match = name.toLowerCase().includes(query) || ipo.toLowerCase().includes(query) || customer.toLowerCase().includes(query) || orderDate.toLowerCase().includes(query);
        if (!match) return;
      }

      const isActive = activeName === name;
      const bgStyle = isActive ? "background: #f0f9ff;" : "";

      tbody.innerHTML += `
        <tr style="${bgStyle} border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px; font-weight:bold; font-family:monospace; color:#0284c7; border-right:1px solid #e2e8f0;">${ipo}</td>
          <td style="padding:10px; font-weight:700; text-align:left; border-right:1px solid #e2e8f0;">
            ${name} ${isActive ? '<span style="font-size:10px; background:#0284c7; color:#fff; padding:2px 6px; border-radius:10px; margin-left:4px;">Active</span>' : ''}
          </td>
          <td style="padding:10px; border-right:1px solid #e2e8f0;">${customer}</td>
          <td style="padding:10px; font-weight:600; color:#475569; border-right:1px solid #e2e8f0;">${orderDate}</td>
          <td style="padding:10px; font-weight:600; border-right:1px solid #e2e8f0;">${sizeStr}</td>
          <td style="padding:10px; font-weight:bold; color:#059669; border-right:1px solid #e2e8f0;">${capaStr}</td>
          <td style="padding:10px; font-size:11px; border-right:1px solid #e2e8f0;">
            ${hasBom ? '<span style="color:#059669; font-weight:bold;"><i class="fa-solid fa-check"></i> BOM</span>' : '<span style="color:#94a3b8;">- BOM</span>'} / 
            ${hasPallet ? '<span style="color:#0284c7; font-weight:bold;"><i class="fa-solid fa-box"></i> Packing</span>' : '<span style="color:#94a3b8;">- Packing</span>'}
          </td>
          <td style="padding:10px; font-size:11px; color:#64748b; border-right:1px solid #e2e8f0;">${dateStr}</td>
          <td style="padding:10px;">
            <div style="display:flex; gap:4px; justify-content:center;">
              <button type="button" onclick="window.loadProjectData('${name.replace(/'/g, "\\'")}')" class="btn btn-sm" style="background:#0284c7; color:#fff; border:none; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;" title="Load Project">
                <i class="fa-solid fa-download"></i> Load
              </button>
              <button type="button" onclick="window.saveProjectData('${name.replace(/'/g, "\\'")}')" class="btn btn-sm" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;" title="Overwrite Save">
                <i class="fa-solid fa-floppy-disk"></i> Save
              </button>
              <button type="button" onclick="window.deleteProjectData('${name.replace(/'/g, "\\'")}')" class="btn btn-sm" style="background:#ef4444; color:#ffffff; border:none; padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Delete Project">
                <i class="fa-solid fa-trash-can"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  window.renderProjectManagerList = function() {
    renderProjectTableContainer("projectManagerTableBody", "projectCountText", "projectSearchInput");
    renderProjectTableContainer("projectManagerTableBodyModal", "projectCountTextModal", "projectSearchInputModal");
  };

  // Immediate initial render of Project Manager lists on script load
  try {
    renderProjectManagerList();
  } catch (e) {
    console.error("Initial renderProjectManagerList error:", e);
  }

  // Restore active project badge on page load
  const storedActiveName = localStorage.getItem("water_tank_active_project_name");
  if (storedActiveName) {
    const dbList = getProjectList();
    if (dbList[storedActiveName]) {
      updateActiveProjectBadge(storedActiveName, dbList[storedActiveName].ipoNo || "-");
    }
  }

  window.printBOMPrintoutSheet = function() {
    document.body.classList.remove("printing-packing-list");
    document.body.classList.add("printing-bom-modal");
    document.body.classList.add("printing-bom-sheet");
    const cleanup = () => {
      document.body.classList.remove("printing-bom-modal");
      document.body.classList.remove("printing-bom-sheet");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    if (typeof updatePrintoutSheet === 'function') {
      updatePrintoutSheet();
    }
    window.print();
    setTimeout(cleanup, 2000);
  };

  // Local Print Trigger Action (Prints official 3-column BOM Printout Sheet in A4 Portrait)
  const btnLocalPrint = document.getElementById('btnLocalPrint');
  if (btnLocalPrint) {
    btnLocalPrint.addEventListener('click', () => {
      window.printBOMPrintoutSheet();
    });
  }

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
      if (confirm("Reset bolt recipe mapping to default definitions from Master DB? (Custom edits will be overwritten.)")) {
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
              partName: boltPart.nameEn || boltPart.nameKo || `Hex Bolt ${boltNo}${suffix}`, 
              ratio: 1 
            },
            { 
              partNo: foundNut.partNo || targetNutNo, 
              partName: foundNut.nameEn || foundNut.nameKo || `Hex Nut ${size}${suffix}`, 
              ratio: 1 
            },
            { 
              partNo: foundWasher.partNo || targetWasherNo, 
              partName: foundWasher.nameEn || foundWasher.nameKo || `Plain Washer ${size}${suffix}`, 
              ratio: 2 
            }
          ];
        });

        boltRecipes = defaultRecipes;
        saveBoltRecipesState();
        alert("Bolt recipe mappings successfully reset from Master DB.");
      }
    });
  }
}

function updateLogoUI(logoDataUrl) {
  // 1. Header Logo (Replace water drop icon with uploaded logo)
  const headerWrapper = document.getElementById('companyLogoWrapper');
  if (headerWrapper) {
    if (logoDataUrl) {
      headerWrapper.innerHTML = `<img src="${logoDataUrl}" alt="Company Logo" class="company-logo-img" style="max-height: 40px; max-width: 120px; object-fit: contain;">`;
    } else {
      headerWrapper.innerHTML = `<i class="fa-solid fa-droplet neon-icon"></i>`;
    }
  }

  // 2. Settings Tab Preview Box
  const settingsPreview = document.getElementById('settingsLogoPreviewWrapper');
  if (settingsPreview) {
    if (logoDataUrl) {
      settingsPreview.innerHTML = `<img src="${logoDataUrl}" alt="Company Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
    } else {
      settingsPreview.innerHTML = `<i class="fa-solid fa-droplet neon-icon" style="font-size: 24px; color: #0284c7;"></i>`;
    }
  }

  // 3. Printout Sheet Logo
  const printoutLogo = document.getElementById('printoutCompanyLogo');
  if (printoutLogo) {
    if (logoDataUrl) {
      printoutLogo.innerHTML = `<img src="${logoDataUrl}" alt="Company Logo" style="max-height: 48px; max-width: 190px; object-fit: contain;">`;
    } else {
      const companyName = localStorage.getItem('custom_company_name') || 'YSACC';
      printoutLogo.innerHTML = `<span style="font-weight: 800; font-size: 16px; color: #0284c7; letter-spacing: 1px;">${companyName}</span>`;
    }
  }
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
window.getPanelInsulationSpec = function(insulationOption, itemCategory, partName) {
  if (!insulationOption || insulationOption === "Non-Insulated") {
    return { isInsulated: false, thickness: null };
  }

  const name = (partName || "").toLowerCase();
  const cat = (itemCategory || "").toLowerCase();

  const isRoof = name.includes("roof") || cat.includes("roof");
  const isSide = name.includes("side") || cat.includes("side") || name.includes("wall") || cat.includes("wall");
  const isPartition = name.includes("partition") || cat.includes("partition");

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
    const target = isRoof || isSide || isPartition;
    return { isInsulated: target, thickness: target ? "25mm" : null };
  }

  if (insulationOption === "Non-insulated(Roof Only)") {
    const target = !isRoof;
    return { isInsulated: target, thickness: target ? "25mm" : null };
  }

  return { isInsulated: false, thickness: null };
};

window.getPanelPriceFromCosting = function(partNo, insulationOption, category, partName) {
  if (!partNo) return null;
  const prefix4 = partNo.trim().substring(0, 4).toUpperCase();

  let rows = null;
  if (typeof window.getCostingData === 'function') {
    try {
      const data = window.getCostingData();
      if (data && Array.isArray(data.panelCostRows)) rows = data.panelCostRows;
    } catch(e) {}
  }
  if (!rows) {
    try {
      rows = JSON.parse(localStorage.getItem("water_tank_costing_panels") || "[]");
    } catch(e) {}
  }

  if (Array.isArray(rows) && rows.length > 0) {
    const foundRow = rows.find(r => r.code && r.code.trim().substring(0, 4).toUpperCase() === prefix4);
    if (foundRow) {
      const spec = window.getPanelInsulationSpec(insulationOption, category, partName);
      let singlePrice = foundRow.finalSinglePrice != null ? foundRow.finalSinglePrice : foundRow.calculatedSinglePrice;
      let ins25Price = foundRow.finalIns25Price != null ? foundRow.finalIns25Price : (foundRow.overrideInsulatedPrice != null ? foundRow.overrideInsulatedPrice : foundRow.calculatedIns25Price);
      let ins40Price = foundRow.finalIns40Price != null ? foundRow.finalIns40Price : foundRow.calculatedIns40Price;

      if (!spec.isInsulated) {
        return Number(singlePrice) || 0;
      }
      if (spec.thickness === "40mm") {
        return Number(ins40Price) || Number(ins25Price) || Number(singlePrice) || 0;
      } else {
        return Number(ins25Price) || Number(singlePrice) || 0;
      }
    }
  }
  return null;
};

window.resolvePanelPrice = function(match, insulationOption, category, partName) {
  const partNo = match ? match.partNo : null;
  const costingPrice = window.getPanelPriceFromCosting(partNo, insulationOption, category, partName);
  if (costingPrice != null && costingPrice > 0) {
    return costingPrice;
  }

  if (!match) return 0;
  const singlePrice = Number(match.price) || 0;
  const spec = window.getPanelInsulationSpec(insulationOption, category, partName);

  if (!spec.isInsulated) {
    return singlePrice;
  }

  if (spec.thickness === "40mm") {
    const p40 = Number(match.priceIns40);
    if (!isNaN(p40) && p40 > 0) return p40;
    const p25 = Number(match.priceIns25) || Number(match.priceInsulated);
    return !isNaN(p25) && p25 > 0 ? p25 : singlePrice;
  } else {
    const p25 = Number(match.priceIns25) || Number(match.priceInsulated);
    return !isNaN(p25) && p25 > 0 ? p25 : singlePrice;
  }
};

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
  const userSkidOpt = skidTypeEl ? skidTypeEl.value : 'Default';
  const skidType = typeof window.resolveSkidType === 'function' ? window.resolveSkidType(h, userSkidOpt) : (userSkidOpt === 'Default' ? (h <= 2.0 ? 'angle75' : (h <= 4.0 ? 'channel125' : 'channel150')) : userSkidOpt);

  const isInsulated = document.getElementById('insulationType').value === 'Insulated';
  const boltSpec = document.getElementById('boltMaterial').value;
  const isIntReinf = document.getElementById('reinfMethod').value === 'Internal';
  const sidePanelOnlyEl = document.getElementById('sidePanelOnly');
  const sidePanelOnly = sidePanelOnlyEl && sidePanelOnlyEl.value === '1x1' ? '1x1' : 'DEFAULT';
  const partitionPanelOnlyEl = document.getElementById('partitionPanelOnly');
  const partitionPanelOnly = partitionPanelOnlyEl && partitionPanelOnlyEl.value === '1x1' ? '1x1' : 'DEFAULT';

  bomItems = [];

  // 1. PANELS -- verified engine (geometry -> course stacking -> quantity rules -> catalog)
  const resolveUnifiedPartNo = (partNo, intMat) => {
    if (!partNo || typeof partNo !== 'string') return partNo;
    const m = partNo.match(/^([A-Z0-9]+)-([A-Z0-9]+?)(?:Z[\/\-])?SA2(?:[\/\-]|SA4|4|[A-Z0-9]+)+$/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      const codeNum = m[2];
      const mat = intMat || (typeof document !== "undefined" && document.getElementById("internalItem") ? document.getElementById("internalItem").value : "SS316");
      if (mat === "HDG" || mat === "Galvanized") {
        const zCode = `${prefix}-${codeNum}Z`;
        const plainCode = `${prefix}-${codeNum}`;
        const db = partsDb || [];
        if (db.some(p => p.partNo === zCode)) return zCode;
        if (db.some(p => p.partNo === plainCode)) return plainCode;
        return zCode;
      }
      const targetSuffix = (mat === "SS316") ? "SA4" : "SA2";
      return `${prefix}-${codeNum}${targetSuffix}`;
    }
    return partNo;
  };

  const lookupPart = (partNo) => {
    if (!partNo) return null;
    const resolved = resolveUnifiedPartNo(partNo);
    return partsDb.find(p => p.partNo === resolved) || partsDb.find(p => p.partNo === partNo) || null;
  };
  
  // Resolver that translates the engine's exact catalog key (e.g.
  // "side.TOP_15.side") to any user override stored in panelMatrix, before
  // doing the partsDb lookup. Matching is by exact key -- no more guessing
  // a "position" from the part-number string.
  const resolvePanelPartNoAndLookup = (catalogPartNo, catalogKey) => {
    const hGrade = `${h}mH`;
    const row = catalogKey ? panelMatrix.find(r => r.key === catalogKey) : null;
    if (row && row.heightGrades && row.heightGrades[hGrade]) {
      const overriddenPartNo = row.heightGrades[hGrade];
      if (overriddenPartNo && overriddenPartNo !== '-- None --') {
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
    const currentInsOption = document.getElementById('insulationType')?.value || 'Non-Insulated';
    engineResult.items.forEach(item => {
      // Translate partNo for items with a matrix override, matched by the
      // engine's own exact catalog key (e.g. "side.TOP_15.side") -- no
      // guessing from the part-number string.
      const hGrade = `${h}mH`;
      const row = item.catalogKey ? panelMatrix.find(r => r.key === item.catalogKey) : null;
      if (row && row.heightGrades && row.heightGrades[hGrade]) {
        const overridden = row.heightGrades[hGrade];
        if (overridden && overridden !== '-- None --') {
          item.partNo = overridden;
          const match = partsDb.find(p => p.partNo === overridden);
          if (match) {
            item.partName = match.nameEn || match.nameKo;
            item.spec = match.spec;
            item.price = window.resolvePanelPrice(match, currentInsOption, item.category, item.partName);
            item.weight = Number(match.weight) || 0;
          }
        }
      } else {
        const match = partsDb.find(p => p.partNo === item.partNo);
        if (match) {
          item.price = window.resolvePanelPrice(match, currentInsOption, item.category, item.partName);
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
      console.warn(`[PanelEngine] "No. of Partition" input (${partitionsInput}) differs from actual calculated partitions (${N_PA}). Panel quantities calculated based on ${N_PA} partitions.`);
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
        partName: (found && (found.nameEn || found.nameKo)) || "Air Vent",
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
        partName: (found && (found.nameEn || found.nameKo)) || "Roof Supporter",
        qty: roofSup.qty * q, unit: "PCS",
        spec: (found && found.spec) || `Roof Supporter (${h}mH)`,
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    }
  } catch (err) {
    // Dimensions that aren't multiples of 0.5m (or an unsupported height)
    // can't be expressed by the 0.5/1.0/1.5/2.0m panel module system --
    // abort rather than silently emitting wrong panel/ETC quantities.
    alert(`Panel/ETC calculation error: ${err.message}`);
    console.error(err);
    return;
  }

  // 2. STEEL SKID -- EXACTLY re-derived from Steel_Skid!AM8:AP53
  try {
    if (skidType !== 'none' && skidType !== 'NONE' && skidType !== 'off' && skidType !== 'OFF') {
      const gSkid = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
      const isExtReinf = document.getElementById('reinfMethod')?.value === 'External';

      const { parts: skidParts } = AccessoriesEngine.steelSkidDetailedParts(gSkid, skidType, isExtReinf);
      skidParts.forEach((sp) => {
        const found = lookupPart(sp.partNo);
        let specStr = (found && found.spec);
        let wgt = (found && Number(found.weight)) || 0;
        let prc = (found && Number(found.price)) || 0;

        if (!specStr && sp.partNo && sp.partNo.startsWith("M-IB-")) {
          const lenMm = parseInt(sp.partNo.replace("M-IB-", ""), 10) || 0;
          specStr = `HDG I-BEAM 100x150x${lenMm}mm`;
          if (!wgt && lenMm > 0) wgt = Math.round((lenMm / 1000) * 14 * 10) / 10;
        }
        if (!specStr) specStr = "Steel Skid frame/bracket";

        bomItems.push({
          category: "Steel Skid", partNo: sp.partNo,
          partName: sp.partName || (found && (found.nameKo || found.nameEn)) || sp.partNo,
          qty: sp.qty * q, unit: "PCS",
          spec: specStr,
          price: prc, weight: wgt,
        });
      });
    }
  } catch (err) {
    console.error('[SteelSkid]', err);
  }

  // 3. REINFORCING + TIE-ROD
  try {
    const gReinf = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const isSA4 = parseInt(boltSpec, 10) === 2;
    const { parts: reinfParts, unmapped } = AccessoriesEngine.reinforcingParts(gReinf, isIntReinf, isSA4, sidePanelOnly === '1x1');
    if (unmapped.length) console.warn('[AccessoriesEngine] Reinforcing unmapped rows:', unmapped);
    reinfParts.forEach((rp) => {
      const found = lookupPart(rp.partNo);
      bomItems.push({
        category: "Reinforcing", partNo: rp.partNo,
        partName: (found && (found.nameEn || found.nameKo)) || rp.partNo,
        qty: rp.qty * q, unit: "PCS",
        spec: (found && found.spec) || (isIntReinf ? "Internal reinforcement (formula-verified)" : "External reinforcement (formula-verified)"),
        price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
      });
    });
    if (!isIntReinf) {
      const tieRodQty = AccessoriesEngine.tieRodQty(gReinf) * q;
      if (tieRodQty > 0) {
        const found = lookupPart("WTR-12M300Z");
        bomItems.push({ category: "Tie Rod", partNo: "WTR-12M300Z", partName: (found && (found.nameEn || found.nameKo)) || "External Tie-Rod Assembly (HDG)", qty: tieRodQty, unit: "PCS", spec: (found && found.spec) || "Tie-rod + nut/washer/coupler/anchor set (formula-verified)", price: (found && Number(found.price)) || 6.2, weight: (found && Number(found.weight)) || 1.8 });
      }
    } else {
      const internalTieRodEl = document.getElementById('internalTieRod');
      const isTieRodSA4 = !internalTieRodEl || internalTieRodEl.value !== 'SS304';
      const { parts: tieRodIntParts, warnings: tieRodIntWarnings } = AccessoriesEngine.tieRodInternalParts(gReinf, isTieRodSA4);
      if (tieRodIntWarnings && tieRodIntWarnings.length) {
        console.warn('[AccessoriesEngine] Internal Tie-Rod validation warning(s):', tieRodIntWarnings);
      }
      tieRodIntParts.forEach((tp) => {
        const found = lookupPart(tp.partNo);
        bomItems.push({
          category: "Tie Rod", partNo: tp.partNo,
          partName: (found && (found.nameEn || found.nameKo)) || tp.partNo,
          qty: tp.qty * q, unit: "PCS",
          spec: (found && found.spec) || "Internal Tie-Rod component (formula-verified)",
          price: (found && Number(found.price)) || 0, weight: (found && Number(found.weight)) || 0,
        });
      });
    }
  } catch (err) {
    console.warn('[AccessoriesEngine] Reinforcing/Tie-Rod error, fallback estimate used:', err);
    if (isIntReinf) {
      const intQty = Math.ceil((l + w) * h * 4) * q;
      bomItems.push({ category: "Reinforcing", partNo: "WFB-0950SA4", partName: "Internal Support Rod (SS316)", qty: intQty, unit: "PCS", spec: "SS316 Internal reinforcement rod (fallback estimate)", price: 8.5, weight: 2.1 });
    } else {
      const extQty = Math.ceil((l + w) * 2 * h) * q;
      bomItems.push({ category: "Reinforcing", partNo: "WCA-1000Z", partName: "External HDG Corner Angle", qty: extQty, unit: "PCS", spec: "External steel bracket corner (fallback estimate)", price: 5.4, weight: 4.8 });
    }
  }

  // 3b. SEALING TAPE (Dynamic SKU Integration for all active SKUs)
  try {
    const skuTotals = (typeof SealingTapeEditor !== 'undefined' && typeof SealingTapeEditor.getCalculatedSKUTotals === 'function')
      ? SealingTapeEditor.getCalculatedSKUTotals(bomItems)
      : null;

    if (skuTotals && Object.keys(skuTotals).length > 0) {
      Object.keys(skuTotals).forEach(skuKey => {
        const sub = skuTotals[skuKey];
        if (!sub || sub.meters <= 0) return;

        const foundPart = lookupPart(skuKey);
        const partName = (foundPart && (foundPart.nameEn || foundPart.nameKo)) || (sub.dbPart && (sub.dbPart.nameEn || sub.dbPart.nameKo)) || skuKey;
        const baseSpec = (foundPart && foundPart.spec) || skuKey;
        const spec = baseSpec;
        const price = (foundPart && Number(foundPart.price)) || 3.06;
        const weight = (foundPart && Number(foundPart.weight)) || 15;

        bomItems.push({
          category: "OTHER",
          partNo: skuKey,
          partName: partName,
          qty: parseFloat(sub.meters.toFixed(1)),
          unit: "MTR",
          spec: spec,
          price: price,
          weight: weight
        });
      });
    } else {
      const sealingTape = PanelEngine.sealingTapeDetail({ W: w, L1: l1, L2: l2, L3: l3, L4: l4, H: h }, { sidePanelOnly, partitionPanelOnly });
      const totalMeters = sealingTape.totalMeters * q;
      if (totalMeters > 0) {
        const rolls = Math.ceil(totalMeters / 30);
        const foundMain = lookupPart("WST-P0050RO");
        bomItems.push({
          category: "OTHER", partNo: "WST-P0050RO",
          partName: (foundMain && (foundMain.nameEn || foundMain.nameKo)) || "RF,BF,SF PVC SEALANT 30M(50mmx3mm)",
          qty: rolls, unit: "Roll",
          spec: (foundMain && foundMain.spec) || `Sealing tape, ${totalMeters}m required (formula-verified, 30M/Roll)`,
          price: (foundMain && Number(foundMain.price)) || 3.06, weight: (foundMain && Number(foundMain.weight)) || 15,
        });

        const cornerMeters = Math.ceil(h * 4 * q);
        const foundCorner = lookupPart("WST-P0120M");
        bomItems.push({
          category: "OTHER", partNo: "WST-P0120M",
          partName: (foundCorner && (foundCorner.nameEn || foundCorner.nameKo)) || "CORNER ANGLE PVC SEALANT 1M(120mmx3.0mm)",
          qty: cornerMeters, unit: (foundCorner && foundCorner.unit) || "PCS",
          spec: (foundCorner && foundCorner.spec) || `Corner angle sealing tape, 120mmx3mm x ${cornerMeters}m`,
          price: (foundCorner && Number(foundCorner.price)) || 0.25, weight: (foundCorner && Number(foundCorner.weight)) || 0.5,
        });
      }
    }
  } catch (err) {
    console.warn('[PanelEngine] Sealing tape error:', err);
  }

  // 4. BOLTS AND NUTS
  try {
    const gBolts = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const materialOption = parseInt(boltSpec, 10) || 2;
    const catalogOverrides = (typeof getBoltCatalogOverrides === 'function') ? getBoltCatalogOverrides() : null;
    const { parts: boltParts } = AccessoriesEngine.boltsAndNutsParts(gBolts, isIntReinf, materialOption, catalogOverrides, sidePanelOnly === '1x1');
    boltParts.forEach((bp) => {
      const found = lookupPart(bp.partNo);
      bomItems.push({
        category: "Bolts & Nuts", partNo: bp.partNo,
        partName: (found && (found.nameEn || found.nameKo)) || bp.partNo,
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
          partName: (found && (found.nameEn || found.nameKo)) || cr.loc || cr.item,
          qty: totalQty,
          unit: "PCS",
          spec: (found && found.spec) || "Custom section-added bolt item",
          price: (found && Number(found.price)) || 0,
          weight: (found && Number(found.weight)) || 0,
        });
      }
    });
  } catch (err) {
    console.warn('[AccessoriesEngine] Bolts & Nuts error, fallback estimate used:', err);
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
  const ladderQty = (N_PA + 1) * q;
  const hMm = Math.round(h * 1000);
  
  const intLadderPartNo = `WLD-${hMm}FI`;
  const extLadderPartNo = `WLD-${hMm}ZO`;
  
  const foundInt = lookupPart(intLadderPartNo);
  const foundExt = lookupPart(extLadderPartNo);
  
  bomItems.push({
    category: "OTHER",
    partNo: intLadderPartNo,
    partName: (foundInt && (foundInt.nameEn || foundInt.nameKo)) || `Internal Ladder (${h}mH)`,
    qty: ladderQty,
    unit: "SET",
    spec: (foundInt && foundInt.spec) || `Internal access ladder ${h}mH`,
    price: (foundInt && Number(foundInt.price)) || 120.0,
    weight: (foundInt && Number(foundInt.weight)) || (h * 3.0)
  });
  
  bomItems.push({
    category: "OTHER",
    partNo: extLadderPartNo,
    partName: (foundExt && (foundExt.nameEn || foundExt.nameKo)) || `External Ladder (${h}mH)`,
    qty: ladderQty,
    unit: "SET",
    spec: (foundExt && foundExt.spec) || `External access ladder ${h}mH`,
    price: (foundExt && Number(foundExt.price)) || 85.0,
    weight: (foundExt && Number(foundExt.weight)) || (h * 4.4)
  });

  // Resolve unified/wildcard parts (e.g. WCP/WBR SA2/SA4/Z) based on Int. Mat. (internalItem)
  const currentIntMat = document.getElementById('internalItem')?.value || 'SS316';
  bomItems.forEach(item => {
    const resolvedCode = resolveUnifiedPartNo(item.partNo, currentIntMat);
    if (resolvedCode !== item.partNo) {
      const match = lookupPart(resolvedCode);
      item.partNo = resolvedCode;
      if (match) {
        item.partName = match.nameEn || match.nameKo;
        item.spec = match.spec;
        item.price = Number(match.price) || item.price || 0;
        item.weight = Number(match.weight) || item.weight || 0;
      }
    }
  });

  // Force Category Filter to Default ("ALL") when a new BOM is generated
  const bomCatFilter = document.getElementById('bomCategoryFilter');
  if (bomCatFilter) {
    bomCatFilter.value = 'ALL';
    if (typeof syncBOMCategoryToURL === 'function') syncBOMCategoryToURL();
  }

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
  if (typeof renderTieRodInternalAuditView === 'function') {
    renderTieRodInternalAuditView();
  }
  if (typeof renderReinforcingAuditView === 'function') {
    renderReinforcingAuditView();
  }
  if (typeof renderSealingTapeEditorView === 'function') {
    renderSealingTapeEditorView();
  }
  if (typeof window.PalletPacking !== 'undefined' && typeof window.PalletPacking.syncPendingFromBOM === 'function') {
    window.PalletPacking.syncPendingFromBOM();
  }
  if (typeof window.enableAllTableResizing === 'function') {
    window.enableAllTableResizing();
  }
}

window.currentBoltRecipeSort = localStorage.getItem('bolt_recipe_sort') || 'size';
window.currentBoltRecipeSearch = '';

window.setBoltRecipeSort = function(sortType) {
  window.currentBoltRecipeSort = sortType;
  localStorage.setItem('bolt_recipe_sort', sortType);
  const select = document.getElementById('selectBoltRecipeSort');
  if (select) select.value = sortType;
  renderBoltRecipes();
};

window.setBoltRecipeSearch = function(query) {
  window.currentBoltRecipeSearch = (query || '').toLowerCase().trim();
  renderBoltRecipes();
};

window.toggleBoltRecipeSort = function() {
  if (window.currentBoltRecipeSort === 'alphabet_asc') {
    window.setBoltRecipeSort('alphabet_desc');
  } else {
    window.setBoltRecipeSort('alphabet_asc');
  }
};

function parseBoltNoInfo(pNo) {
  const clean = (pNo || '').toUpperCase();
  let dia = 999, length = 999, matOrder = 9;
  
  const match = clean.match(/(?:MBT|WBT|VBT)-?(\d{2})(\d{2,3})/);
  if (match) {
    dia = parseInt(match[1], 10);
    length = parseInt(match[2], 10);
  }
  
  if (clean.includes('HDG') || clean.includes('PD') || clean.includes('PZ')) matOrder = 1;
  else if (clean.includes('SA2') || clean.includes('S304') || clean.includes('304')) matOrder = 2;
  else if (clean.includes('SA4') || clean.includes('S316') || clean.includes('316')) matOrder = 3;
  
  return { dia, length, matOrder, pNo: clean };
}

// Render Bolt Recipes Tab UI Table
function renderBoltRecipes() {
  const tbody = document.getElementById('tbodyBoltRecipes');
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectSort = document.getElementById('selectBoltRecipeSort');
  if (selectSort && selectSort.value !== window.currentBoltRecipeSort) {
    selectSort.value = window.currentBoltRecipeSort;
  }

  let standardBoltParts = partsDb
    .filter(p => (p.category || '').toUpperCase().trim() === 'BOLTS & NUTS' && (p.partNo || '').startsWith('WBT-'))
    .map(p => p.partNo);

  if (standardBoltParts.length === 0) {
    standardBoltParts = [
      "WBT-1035SA4", "WBT-1035HDG", "WBT-1045HDG", "WBT-1240HDG", "WBT-14130PPD", 
      "WBT-14130PSA4", "WBT-1045SA4", "WBT-1060HDG", "WBT-1440HDG", "WBT-1640HDG", "WBT-16100HDG"
    ];
  }

  standardBoltParts = Array.from(new Set(standardBoltParts));

  const allSubParts = partsDb
    .filter(p => {
      const pNo = (p.partNo || '').toUpperCase();
      return pNo.startsWith('WNT-') || pNo.startsWith('WFW-') || pNo.startsWith('WSW-') || pNo.startsWith('WRW-') || pNo.startsWith('WNP-') || pNo.startsWith('WBP-');
    })
    .map(p => p.partNo);

  const subPartOptions = [''].concat(Array.from(new Set(allSubParts)));

  let allRecipeKeys = Array.from(new Set([...standardBoltParts, ...Object.keys(boltRecipes)]));

  allRecipeKeys.forEach(boltNo => {
    let suffix = "";
    let mat = "HDG";
    if (boltNo.endsWith("SA4") || boltNo.endsWith("PSA4")) {
      suffix = " (SS316)";
      mat = "SA4";
    } else if (boltNo.endsWith("SA2") || boltNo.endsWith("PSA2")) {
      suffix = " (SS304)";
      mat = "SA2";
    } else if (boltNo.endsWith("HDG") || boltNo.endsWith("PPD") || boltNo.endsWith("PD")) {
      suffix = " (HDG)";
      mat = "HDG";
    }

    let size = "M10";
    if (boltNo.includes("12")) size = "M12";
    else if (boltNo.includes("14")) size = "M14";
    else if (boltNo.includes("16")) size = "M16";

    const targetNutNo = `WNT-${size}${mat}`;
    const targetWasherNo = `WFW-${size}${mat}`;

    const foundNut = partsDb.find(p => p.partNo === targetNutNo) || partsDb.find(p => p.partNo.startsWith(`WNT-${size}`) && p.partNo.includes(mat)) || { partNo: targetNutNo, nameKo: `Hex Nut ${size}${suffix}`, nameEn: `Hex Nut ${size}${suffix}` };
    const foundWasher = partsDb.find(p => p.partNo === targetWasherNo) || partsDb.find(p => p.partNo.startsWith(`WFW-${size}`) && p.partNo.includes(mat)) || { partNo: targetWasherNo, nameKo: `Plain Washer ${size}${suffix}`, nameEn: `Plain Washer ${size}${suffix}` };

    if (!boltRecipes[boltNo]) {
      boltRecipes[boltNo] = [
        { partNo: boltNo, partName: `Hex Bolt ${boltNo}${suffix}`, ratio: 1 },
        { partNo: foundNut.partNo || targetNutNo, partName: foundNut.nameEn || foundNut.nameKo || `Hex Nut ${size}${suffix}`, ratio: 1 },
        { partNo: foundWasher.partNo || targetWasherNo, partName: foundWasher.nameEn || foundWasher.nameKo || `Plain Washer ${size}${suffix}`, ratio: 2 }
      ];
      if (boltNo.includes("14130")) {
        const foundCap = partsDb.find(p => p.partNo === "WNP-M14") || { partNo: "WNP-M14", nameKo: "WNP-M14", nameEn: "WNP-M14" };
        boltRecipes[boltNo].push({
          partNo: foundCap.partNo || "WNP-M14",
          partName: foundCap.nameEn || foundCap.nameKo || "WNP-M14",
          ratio: 1
        });
      }
    } else if (boltRecipes[boltNo].length === 1) {
      // Auto-restore missing default Nut & Washer if recipe array currently has only 1 item
      boltRecipes[boltNo].push({
        partNo: foundNut.partNo || targetNutNo,
        partName: foundNut.nameEn || foundNut.nameKo || `Hex Nut ${size}${suffix}`,
        ratio: (boltNo.includes("14130")) ? 3 : 1
      });
      boltRecipes[boltNo].push({
        partNo: foundWasher.partNo || targetWasherNo,
        partName: foundWasher.nameEn || foundWasher.nameKo || `Plain Washer ${size}${suffix}`,
        ratio: 2
      });
      if (boltNo.includes("14130")) {
        const foundCap = partsDb.find(p => p.partNo === "WNP-M14") || { partNo: "WNP-M14", nameKo: "WNP-M14", nameEn: "WNP-M14" };
        boltRecipes[boltNo].push({
          partNo: foundCap.partNo || "WNP-M14",
          partName: foundCap.nameEn || foundCap.nameKo || "WNP-M14",
          ratio: 1
        });
      }
    }
  });

  if (window.currentBoltRecipeSearch) {
    const q = window.currentBoltRecipeSearch;
    allRecipeKeys = allRecipeKeys.filter(boltNo => {
      const items = boltRecipes[boltNo] || [];
      const matchKey = boltNo.toLowerCase().includes(q);
      const matchItems = items.some(it => (it.partNo || '').toLowerCase().includes(q) || (it.partName || '').toLowerCase().includes(q));
      return matchKey || matchItems;
    });
  }

  const sortMode = window.currentBoltRecipeSort || 'size';
  allRecipeKeys.sort((a, b) => {
    const infoA = parseBoltNoInfo(a);
    const infoB = parseBoltNoInfo(b);

    if (sortMode === 'material') {
      if (infoA.matOrder !== infoB.matOrder) return infoA.matOrder - infoB.matOrder;
      if (infoA.dia !== infoB.dia) return infoA.dia - infoB.dia;
      return infoA.length - infoB.length;
    } else if (sortMode === 'alphabet_asc') {
      return infoA.pNo.localeCompare(infoB.pNo);
    } else if (sortMode === 'alphabet_desc') {
      return infoB.pNo.localeCompare(infoA.pNo);
    } else {
      if (infoA.dia !== infoB.dia) return infoA.dia - infoB.dia;
      if (infoA.length !== infoB.length) return infoA.length - infoB.length;
      if (infoA.matOrder !== infoB.matOrder) return infoA.matOrder - infoB.matOrder;
      return infoA.pNo.localeCompare(infoB.pNo);
    }
  });

  allRecipeKeys.forEach(boltNo => {
    const items = boltRecipes[boltNo];

    let itemsHtml = '<div style="display:flex; flex-direction:row; flex-wrap:nowrap; gap:8px; align-items:center; width:100%; overflow-x:auto; white-space:nowrap; padding:2px 0;">';
    
    items.forEach((item, idx) => {
      const isBolt = idx === 0;

      let componentSelectorHtml = "";
      if (isBolt) {
        componentSelectorHtml = `<input type="text" readonly value="${item.partNo}" style="width: 105px; padding: 4px 6px; background:#f1f5f9; border: 1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:11px;">`;
      } else {
        componentSelectorHtml = `
          <select onchange="updatePrelistedRecipePartNo('${boltNo}', ${idx}, this.value)" style="width: 110px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:11px; color:var(--text-primary); outline:none; background:#fff; cursor:pointer;">
            ${subPartOptions.map(opt => `<option value="${opt}" ${item.partNo === opt ? 'selected' : ''}>${opt || '-- Select None --'}</option>`).join('')}
          </select>
        `;
      }

      let typeLabel = "Bolt";
      let labelColor = "#3b82f6";
      let fieldBg = "rgba(59, 130, 246, 0.05)";
      if (idx === 1) { typeLabel = "Nut"; labelColor = "#10b981"; fieldBg = "rgba(16, 185, 129, 0.05)"; }
      else if (idx === 2) { typeLabel = "Washer"; labelColor = "#f59e0b"; fieldBg = "rgba(245, 158, 11, 0.05)"; }
      else if (idx > 2) { typeLabel = `Comp ${idx}`; labelColor = "#8b5cf6"; fieldBg = "rgba(139, 92, 246, 0.05)"; }

      itemsHtml += `
        <div style="display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); padding: 3px 6px; border-radius: 6px; background: ${fieldBg}; flex-shrink: 0; white-space: nowrap;">
          <span style="font-size:11px; font-weight:bold; color:${labelColor}; margin-right:2px;">${typeLabel}</span>
          ${componentSelectorHtml}
          <span style="font-size:10px; color:var(--text-secondary); margin-left: 2px;">Ratio:</span>
          <input type="number" step="any" value="${item.ratio || 0}" ${isBolt ? 'readonly style="width: 28px; padding:3px; border:1px solid var(--border-color); border-radius:4px; text-align:right; font-size:11px; background:#f1f5f9;"' : `onchange="updatePrelistedRecipe('${boltNo}', ${idx}, 'ratio', parseFloat(this.value) || 0)" style="width: 28px; padding:3px; border:1px solid var(--border-color); border-radius:4px; text-align:right; font-size:11px;"`} >
          ${!isBolt ? `<button type="button" class="btn btn-sm btn-outline" onclick="deleteRecipeComponent('${boltNo}', ${idx}); event.stopPropagation();" style="padding: 2px 4px; color:var(--neon-rose); border-color:var(--neon-rose); font-size:10px; cursor:pointer; height:20px; display:inline-flex; align-items:center; margin-left:2px;"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
      `;
    });

    itemsHtml += `
      <button type="button" class="btn btn-sm btn-secondary" onclick="addRecipeComponent('${boltNo}'); event.stopPropagation();" style="padding: 3px 8px; font-size: 11px; cursor:pointer; height:26px; display:inline-flex; align-items:center; gap:4px; white-space:nowrap; flex-shrink:0;"><i class="fa-solid fa-plus"></i> Add Item</button>
    </div>`;

    const tr = document.createElement('tr');
    tr.style.whiteSpace = 'nowrap';
    tr.innerHTML = `
      <td style="padding: 6px 8px; vertical-align: middle; width: 12%; white-space: nowrap;">
        <strong style="font-family: monospace; font-size:12px; white-space:nowrap;">${boltNo}</strong>
      </td>
      <td style="padding: 6px 8px; vertical-align: middle; width: 74%;">
        ${itemsHtml}
      </td>
      <td align="center" style="vertical-align: middle; padding: 6px 8px; width: 14%; white-space: nowrap;">
        <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-outline" onclick="copyBoltRecipe('${boltNo}')" style="color:#0284c7; border-color:#0284c7; font-size:11px; padding: 3px 6px; white-space:nowrap;"><i class="fa-solid fa-copy"></i> Copy</button>
          <button type="button" class="btn btn-sm btn-outline" onclick="resetPrelistedRecipe('${boltNo}')" style="color:var(--text-secondary); border-color:var(--border-color); font-size:11px; padding: 3px 6px; white-space:nowrap;"><i class="fa-solid fa-rotate-left"></i> Reset</button>
          <button type="button" class="btn btn-sm btn-outline" onclick="deleteBoltRecipe('${boltNo}')" style="color:#e11d48; border-color:#f43f5e; font-size:11px; padding: 3px 6px; white-space:nowrap;"><i class="fa-solid fa-trash-can"></i> Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Prelisted Recipe Mutators (Auto-resolves PartName on PartNo selection)
window.addNewBoltRecipe = async function() {
  const newPartNo = await showCustomAppDialog({
    type: "prompt",
    title: "Add New Bolt Kit Recipe",
    icon: "fa-solid fa-plus",
    message: "Enter Part No for the new Bolt Kit:",
    defaultValue: "WBT-CUSTOM-01"
  });

  if (!newPartNo || !newPartNo.trim()) return;

  const key = newPartNo.trim().toUpperCase();
  if (boltRecipes[key]) {
    await showCustomAppDialog({ type: "alert", title: "Error", message: `Bolt Kit Part No already exists: ${key}` });
    return;
  }

  boltRecipes[key] = [
    { partNo: key, partName: `Hex Bolt ${key}`, ratio: 1 },
    { partNo: "", partName: "Hex Nut", ratio: 1 },
    { partNo: "", partName: "Plain Washer", ratio: 2 }
  ];

  saveBoltRecipesState();
};

window.copyBoltRecipe = async function(boltNo) {
  if (!boltRecipes[boltNo]) return;

  const newPartNo = await showCustomAppDialog({
    type: "prompt",
    title: "Copy Bolt Kit Recipe",
    icon: "fa-solid fa-copy",
    message: `Enter Part No for new Bolt Kit copied from "${boltNo}":`,
    defaultValue: `${boltNo}_COPY`
  });

  if (!newPartNo || !newPartNo.trim()) return;

  const key = newPartNo.trim().toUpperCase();
  if (boltRecipes[key]) {
    await showCustomAppDialog({ type: "alert", title: "Error", message: `Bolt Kit Part No already exists: ${key}` });
    return;
  }

  boltRecipes[key] = JSON.parse(JSON.stringify(boltRecipes[boltNo]));
  boltRecipes[key][0].partNo = key;
  boltRecipes[key][0].partName = `Hex Bolt ${key}`;

  saveBoltRecipesState();
};

window.deleteBoltRecipe = async function(boltNo) {
  const confirmDel = await showCustomAppDialog({
    type: "confirm",
    title: "Delete Bolt Kit Recipe",
    icon: "fa-solid fa-trash-can",
    message: `Are you sure you want to delete the recipe for "${boltNo}"?`,
    confirmText: "Delete",
    cancelText: "Cancel"
  });

  if (!confirmDel) return;

  delete boltRecipes[boltNo];
  saveBoltRecipesState();
};

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
  if (confirm(`Reset bolt recipe "${boltNo}" to default ratio values?`)) {
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

// Modal trigger functions for printout sheet preview (In-Page Modalless Window)
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
    modal.style.display = 'block';
  }
  if (typeof makeModallessDraggable === 'function') {
    makeModallessDraggable('printoutPreviewWindow', 'printoutPreviewHeader');
  }
};

window.closePrintoutSheetPreview = function() {
  const modal = document.getElementById('printoutPreviewModal');
  if (modal) modal.style.display = 'none';
};

// Export active printout requirements sheet to Excel (Exact 3-Column Printout Sheet Layout, 1-Page A4 Fit)
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

    // Header metadata block (Rows 0 to 7)
    const rows = [
      ["BILL OF MATERIAL FOR GRP PANEL TANK", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["Company : " + getTxt('sheetSoldTo', 'MEP'), "", "", "", "", "Project Name : " + getTxt('sheetProjectName', 'A Project'), "", "", "", "", "", "", "", ""],
      [],
      ["▣ Order No : " + getTxt('sheetOrderNo', 'WA-2022-01'), "", "", "", "", "▣ Panel : " + getTxt('sheetPanelInsul', 'Non-Insulated') + " / " + getTxt('sheetPanelComp', ''), "", "", "", "", "", "", "", ""],
      ["▣ Size : " + getTxt('sheetSizeFormula', ''), "", "", "", "", "▣ Bolts and Nuts : " + getTxt('sheetBoltsNuts', ''), "", "", "", "", "", "", "", ""],
      ["▣ Reinforcement : " + getTxt('sheetReinfMethod', ''), "", "", "", "", "▣ External Accessories : " + getTxt('sheetExtAcc', ''), "", "", "", "", "", "", "", ""],
      ["▣ Steel Skid : " + getTxt('sheetSteelSkid', ''), "", "", "", "", "▣ Internal Accessories : " + getTxt('sheetIntAcc', ''), "", "", "", "", "", "", "", ""],
      []
    ];

    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }, // Document Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },  // Company
      { s: { r: 1, c: 5 }, e: { r: 1, c: 13 } }, // Project Name
      { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },  // Order No
      { s: { r: 3, c: 5 }, e: { r: 3, c: 13 } }, // Panel
      { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } },  // Size
      { s: { r: 4, c: 5 }, e: { r: 4, c: 13 } }, // Bolts
      { s: { r: 5, c: 0 }, e: { r: 5, c: 4 } },  // Reinforcement
      { s: { r: 5, c: 5 }, e: { r: 5, c: 13 } }, // Ext Acc
      { s: { r: 6, c: 0 }, e: { r: 6, c: 4 } },  // Steel Skid
      { s: { r: 6, c: 5 }, e: { r: 6, c: 13 } }  // Int Acc
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

    // Column 1 Sections
    const col1Sections = [
      parseSection("Roof/Manhole Panels", "sheetBodyRoof", true, "sheetTotalRoof"),
      parseSection("Bottom/Drain Panels", "sheetBodyBottom", true, "sheetTotalBottom"),
      parseSection("Side Panels", "sheetBodySide", true, "sheetTotalSide"),
      parseSection("Partition Panels", "sheetBodyPartition", true, "sheetTotalPartition", true, "sheetTotalPanelsGlobal"),
      parseSection("Steel Skid", "sheetBodySkid")
    ];

    // Column 2 Sections
    const col2Sections = [
      parseSection("Bolts & Nuts", "sheetBodyBolts"),
      parseSection("External Reinforcing", "sheetBodyExtReinf"),
      parseSection("Internal Reinforcing", "sheetBodyIntReinf")
    ];

    // Column 3 Sections
    const col3Sections = [
      parseSection("Internal Tie-Rod", "sheetBodyTieRod"),
      parseSection("Etc", "sheetBodyEtc"),
      parseSection("Fittings & Sockets", "sheetBodyFittings")
    ];

    // Convert section list to row array for a column
    const formatColumnRows = (sections) => {
      const cRows = [];
      sections.forEach(sec => {
        cRows.push([sec.title, "", "", ""]);
        cRows.push(["Part Name", "Part No.", "Q'ty", ""]);
        sec.items.forEach(it => {
          cRows.push([it.name, it.partNo, it.qty, "☐"]);
        });
        if (sec.showTotal) {
          cRows.push(["TOTAL", "", sec.totalQty, ""]);
        }
        if (sec.showPanelTotal) {
          cRows.push(["PANEL TOTAL", "", sec.panelTotalQty, ""]);
        }
        cRows.push(["", "", "", ""]); // Spacer row
      });
      return cRows;
    };

    const c1Rows = formatColumnRows(col1Sections);
    const c2Rows = formatColumnRows(col2Sections);
    const c3Rows = formatColumnRows(col3Sections);

    const maxRows = Math.max(c1Rows.length, c2Rows.length, c3Rows.length);
    const startRowIdx = rows.length;

    for (let i = 0; i < maxRows; i++) {
      const r1 = c1Rows[i] || ["", "", "", ""];
      const r2 = c2Rows[i] || ["", "", "", ""];
      const r3 = c3Rows[i] || ["", "", "", ""];

      rows.push([
        r1[0], r1[1], r1[2], r1[3],
        "", // Spacer col
        r2[0], r2[1], r2[2], r2[3],
        "", // Spacer col
        r3[0], r3[1], r3[2], r3[3]
      ]);

      const currentRowIdx = startRowIdx + i;
      // Merges for Category Header Titles
      if (r1[0] && !r1[1] && !r1[2] && r1[0] !== "TOTAL" && r1[0] !== "PANEL TOTAL") {
        merges.push({ s: { r: currentRowIdx, c: 0 }, e: { r: currentRowIdx, c: 3 } });
      }
      if (r1[0] === "TOTAL" || r1[0] === "PANEL TOTAL") {
        merges.push({ s: { r: currentRowIdx, c: 0 }, e: { r: currentRowIdx, c: 1 } });
      }

      if (r2[0] && !r2[1] && !r2[2] && r2[0] !== "TOTAL" && r2[0] !== "PANEL TOTAL") {
        merges.push({ s: { r: currentRowIdx, c: 5 }, e: { r: currentRowIdx, c: 8 } });
      }
      if (r2[0] === "TOTAL" || r2[0] === "PANEL TOTAL") {
        merges.push({ s: { r: currentRowIdx, c: 5 }, e: { r: currentRowIdx, c: 6 } });
      }

      if (r3[0] && !r3[1] && !r3[2] && r3[0] !== "TOTAL" && r3[0] !== "PANEL TOTAL") {
        merges.push({ s: { r: currentRowIdx, c: 10 }, e: { r: currentRowIdx, c: 13 } });
      }
      if (r3[0] === "TOTAL" || r3[0] === "PANEL TOTAL") {
        merges.push({ s: { r: currentRowIdx, c: 10 }, e: { r: currentRowIdx, c: 11 } });
      }
    }

    // Add Receipt & Signatures footer block
    rows.push([]);
    const footerStart = rows.length;
    rows.push(["Receipt", "", "", "", "", "Date :", "", "", "", "", "", "", "", ""]);
    rows.push(["As above, We receipt materials", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Customer :", "(Signature)", "", "", "", "(Signature)", "", "", "", "", "", "", "", ""]);
    rows.push([]);
    rows.push(["Prepared by :", "", "", "Checked by :", "", "", "Approved by :", "", "", "Status :", "", "", "YSACC SYSTEM", ""]);

    merges.push({ s: { r: footerStart + 1, c: 0 }, e: { r: footerStart + 1, c: 4 } }); // Receipt
    merges.push({ s: { r: footerStart + 1, c: 5 }, e: { r: footerStart + 1, c: 13 } }); // Date

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 24 }, { wch: 18 }, { wch: 6 }, { wch: 3 }, // Col 1
      { wch: 2 },                                       // Gap
      { wch: 24 }, { wch: 18 }, { wch: 6 }, { wch: 3 }, // Col 2
      { wch: 2 },                                       // Gap
      { wch: 24 }, { wch: 18 }, { wch: 6 }, { wch: 3 }  // Col 3
    ];

    // Configure Excel Page Setup for 1-Page A4 Portrait Fit
    ws['!pageSetup'] = {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToWidth: 1,
      fitToHeight: 1,
      fitToPage: true
    };
    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 };

    XLSX.utils.book_append_sheet(wb, ws, "BOM_Requirement_Sheet");
    const ipo = document.getElementById('ipoNo')?.value || 'BOM';
    XLSX.writeFile(wb, `${ipo}_Requirements_PrintoutSheet.xlsx`);
  } catch (err) {
    console.error("Export Excel error:", err);
    alert("Export printout sheet failed: " + err.message);
  }
};

// Default 2-Depth Category Tree (1-Depth Main Category -> 2-Depth Sub Categories)
window.DEFAULT_CATEGORY_TREE = {
  "PANEL": ["Side", "Bottom", "Drain", "Roof", "Partition", "Manhole", "Corner", "General"],
  "REINFORCING": ["External Tie-Rod", "Internal Tie-Rod", "External Angle", "Internal Angle", "Corner Frame", "Plus Bracket", "Base Frame", "General"],
  "TIE_ROD": ["Roof Supporter", "Internal Rod", "Turnbuckle", "Anchor Bar", "General"],
  "BOLT_NUT": ["Panel Bolt", "Flange Bolt", "Skid Bolt", "Anchor Bolt", "Washer", "Nut", "General"],
  "STEEL_SKID": ["Main Channel", "Sub Channel", "Base Angle", "Shim Plate", "Anchor Bracket", "General"],
  "OTHER": ["General", "Air Vent", "Ladder", "Gasket", "Nozzle", "Level Indicator", "Sealant"]
};

window.getCategoryTree = function() {
  try {
    const stored = localStorage.getItem("custom_category_tree");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        if (parsed.AIR_VENT) {
          const set = new Set(parsed.OTHER || ["General"]);
          (parsed.AIR_VENT || []).forEach(s => set.add(s));
          parsed.OTHER = Array.from(set);
          delete parsed.AIR_VENT;
          localStorage.setItem("custom_category_tree", JSON.stringify(parsed));
        }
        if (Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load custom_category_tree:", e);
  }
  return JSON.parse(JSON.stringify(window.DEFAULT_CATEGORY_TREE));
};

window.saveCategoryTree = function(tree) {
  localStorage.setItem("custom_category_tree", JSON.stringify(tree));
  updateCategoryDropdownsUI();
  renderDbList();
};

window.getSubCategoriesForMain = function(mainCat) {
  const tree = getCategoryTree();
  const cat = normalizeCat(mainCat) || (mainCat ? mainCat.trim().toUpperCase() : '');
  if (cat && tree[cat]) {
    return tree[cat];
  }
  if (mainCat && tree[mainCat]) {
    return tree[mainCat];
  }
  return ["General"];
};

window.getSubCategoryForPart = function(item) {
  if (item && item.subCategory && item.subCategory.trim()) {
    return item.subCategory.trim();
  }
  if (!item) return "General";

  const pNo = (item.partNo || "").toUpperCase();
  const name = (item.nameKo || item.nameEn || item.spec || "").toUpperCase();
  const cat = normalizeCat(item.category);

  if (cat === "PANEL") {
    if (pNo.includes("BF") || pNo.includes("NF") || name.includes("BOTTOM") || name.includes("BASE")) return "Bottom";
    if (pNo.includes("RF") || pNo.includes("MF") || name.includes("ROOF") || name.includes("MANHOLE")) return "Roof";
    if (pNo.includes("DR") || name.includes("DRAIN")) return "Drain";
    if (pNo.includes("PT") || name.includes("PARTITION")) return "Partition";
    if (pNo.includes("CR") || pNo.includes("CN") || name.includes("CORNER")) return "Corner";
    return "Side";
  }

  if (cat === "REINFORCING") {
    if (name.includes("TIE") || name.includes("ROD") || pNo.includes("TR")) return "Internal Tie-Rod";
    if (name.includes("ANGLE")) return "External Angle";
    if (name.includes("BRACKET") || pNo.includes("BRKT")) return "Plus Bracket";
    return "Base Frame";
  }

  if (cat === "BOLT_NUT") {
    if (name.includes("WASHER") || pNo.includes("BW") || pNo.includes("RW")) return "Washer";
    if (name.includes("NUT")) return "Nut";
    if (name.includes("ANCHOR")) return "Anchor Bolt";
    return "Panel Bolt";
  }

  if (cat === "STEEL_SKID") {
    if (name.includes("SHIM")) return "Shim Plate";
    if (name.includes("BRACKET") || name.includes("ANCHOR")) return "Anchor Bracket";
    return "Main Channel";
  }

  if (cat === "OTHER" || cat === "AIR_VENT") {
    if (name.includes("VENT")) return "Air Vent";
    if (name.includes("LADDER")) return "Ladder";
    if (name.includes("NOZZLE")) return "Nozzle";
    if (name.includes("GASKET")) return "Gasket";
    if (name.includes("INDICATOR") || name.includes("LEVEL")) return "Level Indicator";
    if (name.includes("SEALANT") || name.includes("TAPE")) return "Sealant";
    return "General";
  }

  return "General";
};

window.updateCategoryDropdownsUI = function() {
  const tree = getCategoryTree();
  const mainCats = Object.keys(tree);

  // 1. Update Parts DB 1-Depth Filter Dropdown
  const catFilter = document.getElementById("dbTabCategoryFilter");
  if (catFilter && catFilter.children.length <= 1) {
    const curVal = catFilter.value;
    catFilter.innerHTML = `<option value="">All 1-Depth Categories</option>` +
      mainCats.map(c => `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`).join('');
  }

  // 2. Update Parts DB 2-Depth Filter Dropdown
  const subFilter = document.getElementById("dbTabSubCategoryFilter");
  if (subFilter) {
    const rawMain = catFilter ? catFilter.value : "";
    const normSelected = typeof normalizeCat === 'function' ? normalizeCat(rawMain) : (rawMain ? rawMain.trim().toUpperCase() : "");
    const curSubVal = subFilter.value;
    let htmlOptions = `<option value="">All 2-Depth Sub-Categories</option>`;

    if (normSelected) {
      const treeSubs = typeof getSubCategoriesForMain === 'function' ? getSubCategoriesForMain(normSelected) : (tree[normSelected] || []);
      const subs = Array.isArray(treeSubs) ? treeSubs : [];
      htmlOptions += subs.map(s => `<option value="${s}" ${s === curSubVal ? 'selected' : ''}>${s}</option>`).join('');
    } else {
      mainCats.forEach(m => {
        const subs = typeof getSubCategoriesForMain === 'function' ? getSubCategoriesForMain(m) : (tree[m] || []);
        subs.forEach(s => {
          htmlOptions += `<option value="${s}" ${s === curSubVal ? 'selected' : ''}>[${m}] ${s}</option>`;
        });
      });
    }
    subFilter.innerHTML = htmlOptions;
  }

  // 3. Update Part Modal (dbEditModal) Category & Sub-Category
  const modalCat = document.getElementById("dbModalCategory");
  const modalSubCat = document.getElementById("dbModalSubCategory");
  if (modalCat) {
    const curVal = modalCat.value || "PANEL";
    modalCat.innerHTML = mainCats.map(c => `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`).join('');
    
    if (modalSubCat) {
      const activeMain = modalCat.value || "PANEL";
      const subs = tree[activeMain] || ["General"];
      const curSub = modalSubCat.value;
      modalSubCat.innerHTML = subs.map(s => `<option value="${s}" ${s === curSub ? 'selected' : ''}>${s}</option>`).join('');
    }
  }

  // 4. Update BOM Output 1-Depth Category Filter Dropdown (#bomCategoryFilter)
  const bomCatFilter = document.getElementById("bomCategoryFilter");
  if (bomCatFilter) {
    const rawVal = (bomCatFilter.value && bomCatFilter.value.trim()) ? bomCatFilter.value.trim() : "";
    const isAll = !rawVal || rawVal === "ALL" || rawVal === "All Categories";
    const curVal = isAll ? "ALL" : rawVal;
    let bomOptions = `<option value="ALL" ${isAll ? 'selected' : ''}>All Categories</option>`;
    mainCats.forEach(c => {
      bomOptions += `<option value="${c}" ${(!isAll && c === curVal) ? 'selected' : ''}>${c}</option>`;
    });
    bomCatFilter.innerHTML = bomOptions;
    bomCatFilter.value = curVal;
  }
};

window.activeCategoryManagerMain = "PANEL";

window.openCategoryManagerModal = function() {
  const modal = document.getElementById("categoryManagerModal");
  if (!modal) return;
  
  const tree = getCategoryTree();
  const keys = Object.keys(tree);
  if (keys.length > 0 && (!window.activeCategoryManagerMain || !tree[window.activeCategoryManagerMain])) {
    window.activeCategoryManagerMain = keys[0];
  }
  
  modal.style.display = "flex";
  renderMainCatManagerList();
  renderSubCatManagerList();
};

window.closeCategoryManagerModal = function() {
  const modal = document.getElementById("categoryManagerModal");
  if (modal) modal.style.display = "none";
};

window.renderMainCatManagerList = function() {
  const container = document.getElementById("catMgrMainListContainer");
  if (!container) return;

  const tree = getCategoryTree();
  const keys = Object.keys(tree);
  const active = window.activeCategoryManagerMain || keys[0] || "PANEL";

  container.innerHTML = keys.map(k => {
    const isActive = k === active;
    const subCount = (tree[k] || []).length;
    const bgStyle = isActive ? "background:#e0f2fe; border:1.5px solid #0284c7; font-weight:800; color:#0369a1;" : "background:#ffffff; border:1px solid #e2e8f0; font-weight:700; color:#334155;";
    
    return `
      <div class="cat-mgr-main-item" data-main="${k}" onclick="selectMainCategory('${k}')" ondragover="handleMainCatDragOver(event)" ondragleave="handleMainCatDragLeave(event)" ondrop="handleMainCatDrop(event, '${k}')" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:6px; font-size:12.5px; cursor:pointer; user-select:none; transition:all 0.15s; ${bgStyle}" title="Click to view sub-categories. Drag a sub-category chip here to move it.">
        <span><i class="fa-solid fa-folder${isActive ? '-open' : ''}" style="color:${isActive ? '#0284c7' : '#94a3b8'}; font-size:12px; margin-right:6px;"></i> ${k}</span>
        <span style="font-size:10px; background:${isActive ? '#0284c7' : '#cbd5e1'}; color:${isActive ? '#ffffff' : '#475569'}; padding:2px 6px; border-radius:10px; font-weight:800;">${subCount}</span>
      </div>
    `;
  }).join('');
};

window.selectMainCategory = function(mainCat) {
  window.activeCategoryManagerMain = mainCat;
  renderMainCatManagerList();
  renderSubCatManagerList();
};

window.renderSubCatManagerList = function() {
  const activeMainSpan = document.getElementById("catMgrActiveMainName");
  const subContainer = document.getElementById("catMgrSubListContainer");

  if (!subContainer) return;
  const tree = getCategoryTree();
  const keys = Object.keys(tree);
  const activeMain = window.activeCategoryManagerMain || keys[0] || "PANEL";
  window.activeCategoryManagerMain = activeMain;

  if (activeMainSpan) activeMainSpan.textContent = activeMain;
  const subs = tree[activeMain] || [];

  subContainer.innerHTML = subs.map(sub => `
    <div draggable="true" ondragstart="handleSubCatDragStart(event, '${sub}')" ondragend="handleSubCatDragEnd(event)" style="display:inline-flex; align-items:center; gap:6px; background:#ffffff; border:1.5px solid #cbd5e1; padding:6px 14px; border-radius:18px; font-size:12.5px; font-weight:700; color:#334155; box-shadow:0 2px 4px rgba(0,0,0,0.06); cursor:grab; user-select:none; transition:all 0.15s;" title="Drag to move to another 1-Depth category">
      <span><i class="fa-solid fa-grip-vertical" style="color:#94a3b8; font-size:11px; margin-right:2px;"></i> <i class="fa-solid fa-tag" style="color:#8b5cf6; font-size:11px;"></i> ${sub}</span>
      <i class="fa-solid fa-pen-to-square" onclick="event.stopPropagation(); editSubCategory('${sub}')" style="color:#0284c7; cursor:pointer; font-size:11.5px; margin-left:4px;" title="Rename sub-category"></i>
      <i class="fa-solid fa-xmark" onclick="event.stopPropagation(); deleteSubCategory('${sub}')" style="color:#ef4444; cursor:pointer; font-size:12px; margin-left:2px;" title="Delete sub-category"></i>
    </div>
  `).join('');

  if (subs.length === 0) {
    subContainer.innerHTML = `<span style="color:#94a3b8; font-size:12px; padding:12px;">No sub-categories registered under '${activeMain}'. Drag a sub-category tag here or type a new one above.</span>`;
  }
};

// Drag and Drop Handlers
window.handleSubCatDragStart = function(event, sub) {
  const activeMain = window.activeCategoryManagerMain || "PANEL";
  event.dataTransfer.setData("text/plain", JSON.stringify({
    subCategory: sub,
    sourceMain: activeMain
  }));
  event.dataTransfer.effectAllowed = "move";
  if (event.currentTarget) {
    event.currentTarget.style.opacity = "0.4";
  }
};

window.handleSubCatDragEnd = function(event) {
  if (event.currentTarget) {
    event.currentTarget.style.opacity = "1";
  }
};

window.handleMainCatDragOver = function(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const el = event.currentTarget;
  if (el) {
    el.style.background = "#f3e8ff";
    el.style.border = "1.5px dashed #8b5cf6";
    el.style.transform = "scale(1.02)";
  }
};

window.handleMainCatDragLeave = function(event) {
  const el = event.currentTarget;
  if (el) {
    const mainName = el.getAttribute("data-main");
    const isActive = mainName === window.activeCategoryManagerMain;
    el.style.background = isActive ? "#e0f2fe" : "#ffffff";
    el.style.border = isActive ? "1.5px solid #0284c7" : "1px solid #e2e8f0";
    el.style.transform = "none";
  }
};

window.handleMainCatDrop = function(event, targetMain) {
  event.preventDefault();
  handleMainCatDragLeave(event);

  try {
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    const data = JSON.parse(raw);
    const { subCategory, sourceMain } = data;

    if (!subCategory || !sourceMain || sourceMain === targetMain) return;

    const tree = getCategoryTree();
    if (!tree[sourceMain] || !tree[targetMain]) return;

    // 1. Move sub-category in categoryTree
    tree[sourceMain] = tree[sourceMain].filter(s => s !== subCategory);
    if (!tree[targetMain].some(s => s.toLowerCase() === subCategory.toLowerCase())) {
      tree[targetMain].push(subCategory);
    }

    // 2. Update matching parts in partsDb so their category becomes targetMain
    if (Array.isArray(window.partsDb)) {
      window.partsDb.forEach(item => {
        const itemCat = normalizeCat(item.category);
        if ((itemCat === sourceMain || item.category === sourceMain) && getSubCategoryForPart(item) === subCategory) {
          item.category = targetMain;
          item.subCategory = subCategory;
        }
      });
      localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
    }

    // 3. Save tree and refresh UI
    saveCategoryTree(tree);
    window.activeCategoryManagerMain = targetMain;
    openCategoryManagerModal();
  } catch (err) {
    console.error("Drag and drop failed:", err);
  }
};

window.addNewMainCategory = function() {
  const input = document.getElementById("catMgrNewMainInput");
  if (!input || !input.value.trim()) return;

  const newMain = input.value.trim().toUpperCase();
  const tree = getCategoryTree();

  if (tree[newMain]) {
    alert(`Main Category '${newMain}' already exists.`);
    return;
  }

  tree[newMain] = ["General"];
  saveCategoryTree(tree);

  input.value = "";
  window.activeCategoryManagerMain = newMain;
  openCategoryManagerModal();
};

window.editSelectedMainCategory = function() {
  const activeMain = window.activeCategoryManagerMain;
  if (!activeMain) {
    alert("Please select a 1-Depth Main Category to rename.");
    return;
  }

  const oldMain = activeMain;
  const newMain = prompt(`Enter new name for 1-Depth Main Category '${oldMain}':`, oldMain);
  if (!newMain || !newMain.trim() || newMain.trim().toUpperCase() === oldMain) return;

  const cleanNewMain = newMain.trim().toUpperCase();
  const tree = getCategoryTree();

  if (tree[cleanNewMain]) {
    alert(`Main Category '${cleanNewMain}' already exists.`);
    return;
  }

  // Preserve sub-categories under new main name
  tree[cleanNewMain] = tree[oldMain] || ["General"];
  delete tree[oldMain];

  // Update matching parts in partsDb
  if (Array.isArray(window.partsDb)) {
    window.partsDb.forEach(item => {
      if (normalizeCat(item.category) === oldMain || item.category === oldMain) {
        item.category = cleanNewMain;
      }
    });
    localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
  }

  window.activeCategoryManagerMain = cleanNewMain;
  saveCategoryTree(tree);
  openCategoryManagerModal();
};

window.deleteSelectedMainCategory = function() {
  const activeMain = window.activeCategoryManagerMain;
  if (!activeMain) {
    alert("Please select a 1-Depth Main Category to delete.");
    return;
  }

  const tree = getCategoryTree();
  const keys = Object.keys(tree);

  if (keys.length <= 1) {
    alert("At least one Main Category must remain.");
    return;
  }

  if (confirm(`Are you sure you want to delete 1-Depth Main Category '${activeMain}'?\nAll sub-categories under '${activeMain}' will be removed, and existing parts in this category will default to 'OTHER'.`)) {
    delete tree[activeMain];

    // Update matching parts in partsDb
    if (Array.isArray(window.partsDb)) {
      window.partsDb.forEach(item => {
        if (normalizeCat(item.category) === activeMain || item.category === activeMain) {
          item.category = 'OTHER';
          item.subCategory = 'General';
        }
      });
      localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
    }

    const remainingKeys = Object.keys(tree);
    window.activeCategoryManagerMain = remainingKeys[0] || "PANEL";

    saveCategoryTree(tree);
    openCategoryManagerModal();
  }
};

window.addNewSubCategory = function() {
  const input = document.getElementById("catMgrNewSubInput");
  const activeMain = window.activeCategoryManagerMain;
  if (!activeMain || !input || !input.value.trim()) return;

  const newSub = input.value.trim();

  const tree = getCategoryTree();
  if (!tree[activeMain]) tree[activeMain] = [];

  if (tree[activeMain].some(s => s.toLowerCase() === newSub.toLowerCase())) {
    alert(`Sub-category '${newSub}' already exists under '${activeMain}'.`);
    return;
  }

  tree[activeMain].push(newSub);
  saveCategoryTree(tree);

  input.value = "";
  renderSubCatManagerList();
};

window.editSubCategory = function(oldSub) {
  const activeMain = window.activeCategoryManagerMain;
  if (!activeMain) return;

  const newSub = prompt(`Enter new name for Sub Category '${oldSub}' under '${activeMain}':`, oldSub);
  if (!newSub || !newSub.trim() || newSub.trim() === oldSub) return;

  const cleanNewSub = newSub.trim();
  const tree = getCategoryTree();
  if (!tree[activeMain]) tree[activeMain] = [];

  if (tree[activeMain].some(s => s.toLowerCase() === cleanNewSub.toLowerCase())) {
    alert(`Sub category '${cleanNewSub}' already exists under '${activeMain}'.`);
    return;
  }

  const idx = tree[activeMain].indexOf(oldSub);
  if (idx !== -1) {
    tree[activeMain][idx] = cleanNewSub;
  } else {
    tree[activeMain].push(cleanNewSub);
  }

  // Update matching parts in partsDb
  if (Array.isArray(window.partsDb)) {
    window.partsDb.forEach(item => {
      const itemCat = normalizeCat(item.category);
      if ((itemCat === activeMain || item.category === activeMain) && getSubCategoryForPart(item) === oldSub) {
        item.subCategory = cleanNewSub;
      }
    });
    localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
  }

  saveCategoryTree(tree);
  renderSubCatManagerList();
};

window.deleteSubCategory = function(subName) {
  const activeMain = window.activeCategoryManagerMain;
  if (!activeMain) return;

  if (confirm(`Remove sub-category '${subName}' from '${activeMain}'?`)) {
    const tree = getCategoryTree();
    if (tree[activeMain]) {
      tree[activeMain] = tree[activeMain].filter(s => s !== subName);

      // Reset matching parts subCategory to first remaining sub-category
      const remainingSub = (tree[activeMain] && tree[activeMain].length > 0) ? tree[activeMain][0] : "General";
      if (Array.isArray(window.partsDb)) {
        window.partsDb.forEach(item => {
          const itemCat = normalizeCat(item.category);
          if ((itemCat === activeMain || item.category === activeMain) && (item.subCategory === subName || getSubCategoryForPart(item) === subName)) {
            item.subCategory = remainingSub;
          }
        });
        localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
      }

      saveCategoryTree(tree);
      renderSubCatManagerList();
    }
  }
};

function normalizeCat(cat) {
  if (!cat || typeof cat !== 'string') return '';
  let c = cat.trim().toUpperCase();
  if (!c || c === 'ALL' || c === 'ALL CATEGORIES' || c === 'ALL CATEGORIES (ALL)') return '';
  c = c.replace(/&/g, 'AND').replace(/[-\s\/]+/g, '_');
  if (c.includes('BOLT') || c.includes('NUT') || c === 'BOLTS_NUTS' || c === 'BOLT_NUT' || c === 'BOLTS_AND_NUTS' || c === 'BOLTNUT') return 'BOLT_NUT';
  if (c === 'TIE_ROD' || c === 'TIEROD' || c === 'TIE' || c === 'ROD') return 'TIE_ROD';
  if (c === 'STEEL_SKID' || c === 'STEELSKID' || c === 'SKID') return 'STEEL_SKID';
  if (c === 'AIR_VENT' || c === 'AIRVENT' || c === 'ACCESSORIES' || c.includes('ACCESSO') || c.includes('LADDER')) return 'OTHER';
  if (c === 'PANEL' || c === 'PANELS') return 'PANEL';
  if (c === 'REINFORCING' || c.includes('REINF')) return 'REINFORCING';
  if (c === 'OTHER' || c === 'ETC' || c === 'COMMON' || c === 'GENERAL') return 'OTHER';
  return c;
}

window.dbCurrentPage = 1;
window.dbPageSize = 50;
window.dbTotalPages = 1;

window.changeDbPageSize = function(val) {
  if (val === 'all') {
    window.dbPageSize = 999999;
  } else {
    window.dbPageSize = parseInt(val, 10) || 50;
  }
  window.dbCurrentPage = 1;
  renderDbList();
};

window.goToDbPage = function(page) {
  if (page < 1) page = 1;
  if (page > window.dbTotalPages) page = window.dbTotalPages;
  window.dbCurrentPage = page;
  renderDbList();
};

function updatePaginationUI(totalItems, pageItemsCount, startIdx, endIdx) {
  const infoEl = document.getElementById('dbPaginationInfo');
  const numbersContainer = document.getElementById('dbPageNumbersContainer');
  const btnFirst = document.getElementById('btnDbPageFirst');
  const btnPrev = document.getElementById('btnDbPagePrev');
  const btnNext = document.getElementById('btnDbPageNext');
  const btnLast = document.getElementById('btnDbPageLast');

  if (infoEl) {
    if (totalItems === 0) {
      infoEl.textContent = 'No parts found';
    } else if (window.dbPageSize >= 999999) {
      infoEl.textContent = `Showing all ${totalItems} parts`;
    } else {
      infoEl.textContent = `Showing ${startIdx + 1} - ${endIdx} of ${totalItems} parts`;
    }
  }

  if (btnFirst) btnFirst.disabled = window.dbCurrentPage <= 1;
  if (btnPrev) btnPrev.disabled = window.dbCurrentPage <= 1;
  if (btnNext) btnNext.disabled = window.dbCurrentPage >= window.dbTotalPages;
  if (btnLast) btnLast.disabled = window.dbCurrentPage >= window.dbTotalPages;

  if (numbersContainer) {
    numbersContainer.innerHTML = '';
    if (window.dbTotalPages <= 1) return;

    let startPage = Math.max(1, window.dbCurrentPage - 2);
    let endPage = Math.min(window.dbTotalPages, startPage + 4);
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    for (let p = startPage; p <= endPage; p++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-page-num ${p === window.dbCurrentPage ? 'active' : ''}`;
      btn.textContent = p;
      btn.onclick = () => window.goToDbPage(p);
      numbersContainer.appendChild(btn);
    }
  }
}

// Render Master Database List
function renderDbList() {
  if (typeof updateCategoryDropdownsUI === 'function') {
    const subCatFilter = document.getElementById('dbTabSubCategoryFilter');
    if (subCatFilter && subCatFilter.children.length <= 1) {
      updateCategoryDropdownsUI();
    }
  }

  const tbody = document.getElementById('tbodyPartsMasterDbList');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchInput = document.getElementById('dbTabSearchInput');
  const catFilter = document.getElementById('dbTabCategoryFilter');
  const subCatFilter = document.getElementById('dbTabSubCategoryFilter');
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedCat = catFilter ? normalizeCat(catFilter.value) : '';
  const selectedSubCat = subCatFilter ? subCatFilter.value.trim() : '';
  
  // 1. Filter items first
  let filtered = partsDb.filter(item => {
    if (selectedCat) {
      const itemCat = normalizeCat(item.category);
      if (itemCat !== selectedCat) return false;
    }
    if (selectedSubCat) {
      const itemSubCat = getSubCategoryForPart(item);
      if (itemSubCat !== selectedSubCat) return false;
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

    if (dbSortField === 'subCategory') {
      valA = getSubCategoryForPart(a);
      valB = getSubCategoryForPart(b);
    }

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

  const tree = getCategoryTree();
  const mainCats = Object.keys(tree);

  // Calculate pagination slice
  const totalItems = filtered.length;
  if (window.dbPageSize >= 999999) {
    window.dbTotalPages = 1;
  } else {
    window.dbTotalPages = Math.ceil(totalItems / window.dbPageSize) || 1;
  }
  if (window.dbCurrentPage > window.dbTotalPages) window.dbCurrentPage = window.dbTotalPages;
  if (window.dbCurrentPage < 1) window.dbCurrentPage = 1;

  const startIdx = (window.dbCurrentPage - 1) * window.dbPageSize;
  const endIdx = window.dbPageSize >= 999999 ? totalItems : Math.min(startIdx + window.dbPageSize, totalItems);
  const pageItems = filtered.slice(startIdx, endIdx);

  // 3. Render current page list elements
  pageItems.forEach((item, index) => {
    // Find index of item in original partsDb list to enable editing
    const origIndex = partsDb.findIndex(p => p.partNo === item.partNo);

    const itemCat = normalizeCat(item.category) || (item.category || 'OTHER').toUpperCase().trim();
    const itemSubCat = getSubCategoryForPart(item);
    const availableSubCats = getSubCategoriesForMain(itemCat);

    const catOptionsHtml = mainCats.map(c => `<option value="${c}" ${c === itemCat ? 'selected' : ''}>${c}</option>`).join('');
    const subCatOptionsHtml = availableSubCats.map(s => `<option value="${s}" ${s === itemSubCat ? 'selected' : ''}>${s}</option>`).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td align="center" onclick="event.stopPropagation();">
        <input type="checkbox" class="chk-db-row-select" data-index="${origIndex}" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td>
        <input type="text" class="excel-cell" value="${item.partNo || ''}" onchange="updateDbField(${origIndex}, 'partNo', this.value, this)" data-row="${index}" data-col="0" style="font-weight: 700;">
      </td>
      <td align="center" onclick="event.stopPropagation();">
        <select class="excel-cell inline-cat-select" onchange="updateDbField(${origIndex}, 'category', this.value, this)" data-row="${index}" data-col="1" style="padding: 3px 5px; font-size: 11px; font-weight: 700; border: 1.5px solid #0284c7; border-radius: 6px; background: #e0f2fe; color: #0369a1; cursor: pointer; outline: none;">
          ${catOptionsHtml}
        </select>
      </td>
      <td align="center" onclick="event.stopPropagation();">
        <select class="excel-cell inline-subcat-select" onchange="updateDbField(${origIndex}, 'subCategory', this.value, this)" data-row="${index}" data-col="2" style="padding: 3px 5px; font-size: 11px; font-weight: 700; border: 1.5px solid #8b5cf6; border-radius: 6px; background: #f3e8ff; color: #7c3aed; cursor: pointer; outline: none;">
          ${subCatOptionsHtml}
        </select>
      </td>
      <td><input type="text" class="excel-cell" value="${item.nameKo || ''}" onchange="updateDbField(${origIndex}, 'nameKo', this.value, this)" data-row="${index}" data-col="3"></td>
      <td><input type="text" class="excel-cell" value="${item.nameEn || ''}" onchange="updateDbField(${origIndex}, 'nameEn', this.value, this)" data-row="${index}" data-col="4"></td>
      <td><input type="text" class="excel-cell" value="${item.unit || 'PCS'}" onchange="updateDbField(${origIndex}, 'unit', this.value, this)" data-row="${index}" data-col="5"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.price || 0}" onchange="updateDbField(${origIndex}, 'price', this.value, this)" data-row="${index}" data-col="6"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.weight || 0}" onchange="updateDbField(${origIndex}, 'weight', this.value, this)" data-row="${index}" data-col="7"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.width || 1000}" onchange="updateDbField(${origIndex}, 'width', this.value, this)" data-row="${index}" data-col="8"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.length || 1000}" onchange="updateDbField(${origIndex}, 'length', this.value, this)" data-row="${index}" data-col="9"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.ht || 80}" onchange="updateDbField(${origIndex}, 'ht', this.value, this)" data-row="${index}" data-col="10"></td>
      <td><input type="number" step="any" class="excel-cell" value="${item.fh || 40}" onchange="updateDbField(${origIndex}, 'fh', this.value, this)" data-row="${index}" data-col="11"></td>
      <td><input type="number" step="1" class="excel-cell" value="${item.holes !== undefined && item.holes !== null ? item.holes : 0}" onchange="updateDbField(${origIndex}, 'holes', this.value, this)" data-row="${index}" data-col="12" style="text-align: center;"></td>
      <td><input type="text" class="excel-cell" value="${item.spec || ''}" onchange="updateDbField(${origIndex}, 'spec', this.value, this)" data-row="${index}" data-col="13"></td>
      <td align="center" onclick="event.stopPropagation();" style="display: flex; gap: 6px; justify-content: center; align-items: center;">
        <i class="fa-regular fa-copy action-icon" onclick="copyDbItem(${origIndex}, event)" title="Duplicate" style="color: var(--neon-blue); font-size: 14px; padding: 6px; cursor: pointer;"></i>
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteDbItem(${origIndex}, event)" title="Delete" style="color: var(--neon-rose); font-size: 14px; padding: 6px; cursor: pointer;"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="16" align="center" style="color:var(--text-secondary); padding: 25px;">No search results found.</td></tr>`;
  }

  // Bind checkbox events
  if (window.updateDbBulkDeleteUI) {
    window.updateDbBulkDeleteUI();
  }

  // 4. Render sort arrow indicators and pagination UI
  updateSortIconsUI();
  updatePaginationUI(totalItems, pageItems.length, startIdx, endIdx);
}

// Global update method for inline Excel cells
window.updateDbField = function(origIndex, field, value, el) {
  if (partsDb[origIndex]) {
    if (['price', 'weight', 'width', 'length', 'ht', 'fh', 'holes'].includes(field)) {
      partsDb[origIndex][field] = parseFloat(value) || 0;
    } else {
      partsDb[origIndex][field] = value;
    }

    if (field === 'category') {
      const validSubs = getSubCategoriesForMain(value);
      const curSub = partsDb[origIndex].subCategory;
      if (!curSub || !validSubs.includes(curSub)) {
        partsDb[origIndex].subCategory = validSubs[0] || 'General';
      }
      
      // Update sub-category select in the same row without rebuilding full table DOM
      if (el && el.closest) {
        const tr = el.closest('tr');
        if (tr) {
          const subSelect = tr.querySelector('.inline-subcat-select');
          if (subSelect) {
            subSelect.innerHTML = validSubs.map(s => `<option value="${s}" ${s === partsDb[origIndex].subCategory ? 'selected' : ''}>${s}</option>`).join('');
          }
        }
      }
      updateCategoryDropdownsUI();
    }

    localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
    localStorage.setItem('parts_db', JSON.stringify(partsDb));
    window.partsDb = partsDb;

    // Real-time Pallet Dashboard Refresh if Pallet Packing module is active
    if (typeof window.PalletPacking !== 'undefined' && typeof window.PalletPacking.renderPalletsDashboard === 'function') {
      try {
        window.PalletPacking.renderPalletsDashboard();
      } catch (err) {}
    }

    // Visual Feedback (Glow Green)
    if (el) {
      const origBg = el.style.background;
      el.style.transition = 'background 0.3s ease';
      el.style.background = '#dcfce7';
      setTimeout(() => {
        el.style.background = origBg || '';
      }, 1200);
    }

    // Real-time Firestore Sync
    try {
      if (typeof db !== 'undefined' && db && db.collection) {
        const docId = String(partsDb[origIndex].partNo || '').trim().replace(/\//g, '_');
        if (docId) {
          const updateData = {
            partNo: partsDb[origIndex].partNo || '',
            nameKo: partsDb[origIndex].nameKo || '',
            nameEn: partsDb[origIndex].nameEn || '',
            spec: partsDb[origIndex].spec || '',
            weight: Number(partsDb[origIndex].weight) || 0,
            price: Number(partsDb[origIndex].price) || 0,
            width: Number(partsDb[origIndex].width) || 1000,
            length: Number(partsDb[origIndex].length) || 1000,
            ht: Number(partsDb[origIndex].ht) || 80,
            fh: Number(partsDb[origIndex].fh) || 40,
            holes: Number(partsDb[origIndex].holes) || 0,
            unit: partsDb[origIndex].unit || 'PCS',
            category: partsDb[origIndex].category || 'OTHER',
            subCategory: partsDb[origIndex].subCategory || 'General'
          };
          db.collection('parts').doc(docId).set(updateData, { merge: true }).catch(err => console.warn('Firestore doc set warning:', err));
        }
      }
    } catch (e) {}
  }
};

window.addQuickDbRow = function() {
  const newPart = {
    partNo: `NEW-PART-${partsDb.length + 1}`,
    category: 'OTHER',
    nameKo: 'New Part',
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
    .map(p => `<option value="${p.partNo}">${p.partNo} (${p.nameEn || p.nameKo || ''})</option>`)
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
        placeholder="Search/Input"
        style="width:100%; min-width:0; border:1px solid #cbd5e1; border-radius:4px; padding:3px 2px; font-size:9px; background:#fff; cursor:text; font-weight:500; box-sizing:border-box; outline:none; text-align:center;">
    `;
  };

  const rowIdx = (key) => panelMatrix.findIndex(r => r.key === key);

  // Renders one editable box
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

  const partition1x1ByCourse = {};
  panelMatrix.forEach((r) => {
    if (r.section !== 'partition1x1') return;
    if (!partition1x1ByCourse[r.course]) partition1x1ByCourse[r.course] = {};
    if (!partition1x1ByCourse[r.course][r.slot]) partition1x1ByCourse[r.course][r.slot] = { primary: null, variants: [] };
    if (r.isVariant) partition1x1ByCourse[r.course][r.slot].variants.push(r.key);
    else partition1x1ByCourse[r.course][r.slot].primary = r.key;
  });

  const courseLabel = (course, slot) => PanelCatalog.SIDE_ROLE_LABELS[slot] || slot;
  const partitionLabel = (course, slot) => PanelCatalog.PARTITION_ROLE_LABELS[slot] || slot;

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

    const COURSE_ORDER_RANK = {
      "LOWER_SOLO": 1,
      "LOWER": 2,
      "MID_LOWER": 3,
      "MID": 4,
      "MID_TOP": 5,
      "TOP": 6,
      "TOP_15": 7,
      "TOP_20": 8
    };

    const rawCourses = (typeof PanelRules !== 'undefined' && PanelRules.COURSE_TABLE[String(hFloat)]) || [];
    const courses = rawCourses
      .map(c => (PanelCatalog.CATALOG_COURSE_ALIAS[c] || c))
      .filter((c, i, arr) => arr.indexOf(c) === i)
      .sort((a, b) => (COURSE_ORDER_RANK[a] || 99) - (COURSE_ORDER_RANK[b] || 99));

    let wallStackHtml = '';
    if (is1x1SideOption) {
      const slices = side1x1ByHeight[String(hFloat)] || {};
      const sliceKeys = Object.keys(slices).sort((a, b) => parseInt(a.replace('slice', ''), 10) - parseInt(b.replace('slice', ''), 10));
      sliceKeys.forEach(sk => {
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
    courses.forEach(course => {
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
                Partition<br><span style="font-weight:400; font-size:9px; color:#94a3b8;">(bottom→top)${sideMatrixOption === 3 ? '<br><br>Top Course<br>0.5/1M Alt' : ''}</span>
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

    // Update local storage and cache storage object for active customer preset and sub-option
    const custId = window.selectedCustomerPresetId || 'default';
    const storageKey = (custId === 'default') ? `water_tank_panel_matrix_opt${sideMatrixOption}` : `water_tank_panel_matrix_${custId}_opt${sideMatrixOption}`;

    optionMatrixStorage[sideMatrixOption] = panelMatrix;
    localStorage.setItem(storageKey, JSON.stringify(panelMatrix));

    // If Roof/Manhole/Bottom/Drain (roof_bottom section) was updated, sync across ALL options (0..4) within this customer preset
    if (isRoofOrBottom) {
      [0, 1, 2, 3, 4].forEach(opt => {
        if (opt === sideMatrixOption) return;
        const targetKey = (custId === 'default') ? `water_tank_panel_matrix_opt${opt}` : `water_tank_panel_matrix_${custId}_opt${opt}`;
        const saved = localStorage.getItem(targetKey);
        let targetMatrix = saved ? JSON.parse(saved) : (optionMatrixStorage[opt] || null);

        if (targetMatrix) {
          const targetRow = targetMatrix.find(r => r.key === currentKey);
          if (targetRow) {
            if (field === 'item') targetRow.item = value;
            else {
              if (!targetRow.heightGrades) targetRow.heightGrades = {};
              targetRow.heightGrades[field] = value;
            }
            localStorage.setItem(targetKey, JSON.stringify(targetMatrix));
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

  window.getProcessedBOMItems = function() {
    const activeRadio = document.querySelector('input[name="boltDisplayMode"]:checked');
    const mode = activeRadio ? activeRadio.value : 'set';

    if (mode === 'set') {
      const isIndivNutOrWasher = (pNo) => pNo.startsWith("WNT-") || pNo.startsWith("WFW-");
      const processedItems = [];
      bomItems.forEach((item, idx) => {
        item._originalIndex = idx;
        const cat = (item.category || '').toUpperCase().trim();
        const pNo = (item.partNo || '').toUpperCase().trim();
        if (cat === 'BOLTS & NUTS' && isIndivNutOrWasher(pNo)) {
          return;
        }
        processedItems.push(item);
      });
      return processedItems;
    }

    // Mode 'item' (분리): Split Bolt Sets into individual components
    const processedItems = [];
    bomItems.forEach((item, idx) => {
      item._originalIndex = idx;
      const cat = (item.category || '').toUpperCase().trim();
      const pNo = (item.partNo || '').toUpperCase().trim();

      if (cat === 'BOLTS & NUTS') {
        const recipes = (typeof boltRecipes !== "undefined" && boltRecipes[pNo]) ? boltRecipes[pNo] : null;
        if (recipes && Array.isArray(recipes) && recipes.length > 0) {
          recipes.forEach(sub => {
            if (!sub.partNo && !sub.partName) return;
            const subPartNo = sub.partNo || "";
            const found = partsDb.find(p => p.partNo === subPartNo);
            const subPrice = (found && Number(found.price)) || 0;
            const subWeight = (found && Number(found.weight)) || 0;
            const ratio = Number(sub.ratio) || 1;

            processedItems.push({
              _originalIndex: idx,
              _isSubItem: true,
              category: item.category,
              partNo: subPartNo,
              partName: sub.partName || (found && (found.nameKo || found.nameEn)) || subPartNo || "Sub Item",
              qty: Math.round(item.qty * ratio),
              unit: item.unit || "PCS",
              spec: (found && found.spec) || item.spec || "",
              price: subPrice,
              weight: subWeight
            });
          });
        } else {
          // Fallback splitting if no custom recipe defined for pNo
          const isSS316 = pNo.endsWith("SA4");
          const isSS304 = pNo.endsWith("SA2");
          const suffix = isSS316 ? " (SS316)" : (isSS304 ? " (SS304)" : " (HDG)");

          // 1. Hex Bolt
          processedItems.push({
            _originalIndex: idx,
            category: item.category,
            partNo: pNo,
            partName: item.partName || `Hex Bolt ${pNo}${suffix}`,
            qty: item.qty * 1,
            unit: item.unit || "PCS",
            spec: item.spec || "",
            price: item.price || 0,
            weight: item.weight || 0
          });

          // 2. Hex Nut
          const nutPartNo = isSS316 ? "WNT-14SA4" : (isSS304 ? "WNT-14SA2" : "WNT-14HDG");
          const foundNut = partsDb.find(p => p.partNo === nutPartNo);
          processedItems.push({
            _originalIndex: idx,
            _isSubItem: true,
            category: item.category,
            partNo: nutPartNo,
            partName: (foundNut && (foundNut.nameKo || foundNut.nameEn)) || `Hex Nut M14${suffix}`,
            qty: item.qty * 1,
            unit: "PCS",
            spec: (foundNut && foundNut.spec) || "",
            price: (foundNut && Number(foundNut.price)) || 0,
            weight: (foundNut && Number(foundNut.weight)) || 0
          });

          // 3. Plain Washer (2 per set)
          const washerPartNo = isSS316 ? "WFW-14SA4" : (isSS304 ? "WFW-14SA2" : "WFW-14HDG");
          const foundWasher = partsDb.find(p => p.partNo === washerPartNo);
          processedItems.push({
            _originalIndex: idx,
            _isSubItem: true,
            category: item.category,
            partNo: washerPartNo,
            partName: (foundWasher && (foundWasher.nameKo || foundWasher.nameEn)) || `Plain Washer M14${suffix}`,
            qty: item.qty * 2,
            unit: "PCS",
            spec: (foundWasher && foundWasher.spec) || "",
            price: (foundWasher && Number(foundWasher.price)) || 0,
            weight: (foundWasher && Number(foundWasher.weight)) || 0
          });
        }
      } else {
        processedItems.push(item);
      }
    });

    return processedItems;
  };

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

function syncBOMCategoryToURL() {
  if (typeof window === 'undefined' || !window.history || !window.location) return;
  try {
    const url = new URL(window.location.href);
    const filterEl = document.getElementById('bomCategoryFilter');
    const cat = (filterEl && filterEl.value) ? filterEl.value.trim() : 'ALL';
    
    if (cat && cat !== 'ALL' && cat !== 'All Categories') {
      url.searchParams.set('bom_cat', cat);
    } else {
      url.searchParams.delete('bom_cat');
    }
    
    window.history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString() + url.hash);
  } catch (e) {}
}

function loadBOMCategoryFromURL() {
  if (typeof window === 'undefined' || !window.location) return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('bom_cat')) {
      const cat = params.get('bom_cat');
      const filterEl = document.getElementById('bomCategoryFilter');
      if (filterEl) {
        filterEl.value = cat;
        if (typeof renderBOM === 'function') renderBOM();
      }
    }
  } catch (e) {}
}

// Render BOM Table
function renderBOM() {
  const tbody = document.getElementById('tbodyBOM');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const displayItems = getProcessedBOMItems();

  if (displayItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" align="center" style="color:var(--text-secondary)">No items available. Click [Generate Default BOM from Config] or [Add Item].</td></tr>`;
    return;
  }

  // Get active filter value
  const filterEl = document.getElementById('bomCategoryFilter');
  const activeFilter = (filterEl && filterEl.value) ? filterEl.value.trim() : 'ALL';
  const isAllFilter = !activeFilter || activeFilter === 'ALL' || activeFilter === 'All Categories';
  const normFilter = typeof normalizeCat === 'function' ? normalizeCat(activeFilter) : activeFilter;

  syncBOMCategoryToURL();

  const tree = typeof getCategoryTree === 'function' ? getCategoryTree() : {};
  const mainCats = Object.keys(tree).length > 0 ? Object.keys(tree) : ["PANEL", "STEEL_SKID", "REINFORCING", "TIE_ROD", "BOLT_NUT", "ACCESSORIES", "OTHER"];

  let renderedCount = 0;
  displayItems.forEach((item, displayIndex) => {
    // Only apply category filtering if not ALL and activeFilter is non-empty
    if (!isAllFilter) {
      const itemNormCat = typeof normalizeCat === 'function' ? normalizeCat(item.category) : (item.category || '');
      if (itemNormCat !== normFilter && item.category !== activeFilter) {
        return;
      }
    }
    renderedCount++;
    const realIndex = (item._originalIndex !== undefined) ? item._originalIndex : displayIndex;

    let catSelectHtml = `<select onchange="updateItem(${realIndex}, 'category', this.value)">`;
    mainCats.forEach(c => {
      const isSelected = (typeof normalizeCat === 'function' && normalizeCat(item.category) === normalizeCat(c)) || (item.category === c);
      catSelectHtml += `<option value="${c}" ${isSelected ? 'selected' : ''}>${c}</option>`;
    });
    catSelectHtml += `</select>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${renderedCount}</td>
      <td>${catSelectHtml}</td>
      <td><input type="text" value="${escapeAttr(item.partName || '')}" onchange="updateItem(${realIndex}, 'partName', this.value)"></td>
      <td><input type="text" value="${escapeAttr(item.partNo || '')}" onchange="updateItem(${realIndex}, 'partNo', this.value)"></td>
      <td><input type="number" step="any" value="${item.qty}" onchange="updateItem(${realIndex}, 'qty', parseFloat(this.value) || 0)"></td>
      <td><input type="text" value="${escapeAttr(item.unit || '')}" onchange="updateItem(${realIndex}, 'unit', this.value)"></td>
      <td><input type="text" value="${escapeAttr(item.spec || '')}" onchange="updateItem(${realIndex}, 'spec', this.value)"></td>
      <td align="center">
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteItem(${realIndex})" title="Delete item"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (renderedCount === 0) {
    tbody.innerHTML = `<tr><td colspan="8" align="center" style="color:var(--text-secondary)">No items match the selected category ('${activeFilter}').</td></tr>`;
  }
}

// Render COST Table
function renderCOST() {
  const tbody = document.getElementById('tbodyCOST');
  if (!tbody) return;
  tbody.innerHTML = '';

  const displayItems = getProcessedBOMItems();
  let totalSum = 0;
  displayItems.forEach((item, displayIndex) => {
    const total = item.qty * item.price;
    totalSum += total;
    const realIndex = (item._originalIndex !== undefined) ? item._originalIndex : displayIndex;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${displayIndex + 1}</td>
      <td>${escapeAttr(item.category)}</td>
      <td>${escapeAttr(item.partName)}</td>
      <td>${escapeAttr(item.partNo || '-')}</td>
      <td>${item.qty}</td>
      <td>${escapeAttr(item.unit)}</td>
      <td><input type="number" step="any" value="${item.price}" onchange="updateItem(${realIndex}, 'price', parseFloat(this.value) || 0)"></td>
      <td><strong>${total.toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  const code = typeof window.getSystemCurrencyCode === 'function' ? window.getSystemCurrencyCode() : 'USD';
  const symbol = typeof window.getSystemCurrencySymbol === 'function' ? window.getSystemCurrencySymbol() : '$';

  const footEl = document.getElementById('footCostTotal');
  if (footEl) {
    if (typeof window.formatCurrency === 'function') {
      footEl.textContent = `${window.formatCurrency(totalSum)} ${code}`;
    } else {
      footEl.textContent = `${symbol}${totalSum.toFixed(2)} ${code}`;
    }
  }
}

// Render WEIGHT Table
function renderWEIGHT() {
  const tbody = document.getElementById('tbodyWT');
  if (!tbody) return;
  tbody.innerHTML = '';

  const displayItems = getProcessedBOMItems();
  let totalWeightSum = 0;
  displayItems.forEach((item, displayIndex) => {
    const totalW = item.qty * item.weight;
    totalWeightSum += totalW;
    const realIndex = (item._originalIndex !== undefined) ? item._originalIndex : displayIndex;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${displayIndex + 1}</td>
      <td>${escapeAttr(item.category)}</td>
      <td>${escapeAttr(item.partName)}</td>
      <td>${escapeAttr(item.partNo || '-')}</td>
      <td>${item.qty}</td>
      <td>${escapeAttr(item.unit)}</td>
      <td><input type="number" step="any" value="${item.weight}" onchange="updateItem(${realIndex}, 'weight', parseFloat(this.value) || 0)"></td>
      <td><strong>${totalW.toFixed(2)} kg</strong></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('footWeightTotal').textContent = `${totalWeightSum.toFixed(2)} kg`;
}

// Calculate top widgets
function calculateWidgets() {
  const displayItems = getProcessedBOMItems();
  let cost = 0;
  let weight = 0;
  displayItems.forEach(item => {
    cost += item.qty * item.price;
    weight += item.qty * item.weight;
  });

  const code = typeof window.getSystemCurrencyCode === 'function' ? window.getSystemCurrencyCode() : 'USD';
  const costEl = document.getElementById('statCost');
  if (costEl) {
    if (typeof window.formatCurrency === 'function') {
      costEl.textContent = `${window.formatCurrency(cost)} ${code}`;
    } else {
      costEl.textContent = `$${cost.toFixed(2)} ${code}`;
    }
  }
  document.getElementById('statWeight').textContent = `${weight.toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1})} kg`;
}

// Edit actions
window.updateItem = function(index, field, value) {
  if (index >= 0 && index < bomItems.length) {
    bomItems[index][field] = value;
    // Auto-update price/weight/spec if partNo matches master database
    if (field === 'partNo') {
      const trimmed = String(value || '').toLowerCase().trim();
      const match = partsDb.find(p => p.partNo && p.partNo.toLowerCase() === trimmed);
      if (match) {
        bomItems[index].price = Number(match.price) || 0;
        bomItems[index].weight = Number(match.weight) || 0;
        if (match.nameEn || match.nameKo) bomItems[index].partName = match.nameEn || match.nameKo;
        if (match.spec) bomItems[index].spec = match.spec;
        if (match.unit) bomItems[index].unit = match.unit;
      }
    } else if (field === 'partName') {
      const trimmed = String(value || '').toLowerCase().trim();
      const match = partsDb.find(p => (p.nameEn && p.nameEn.toLowerCase() === trimmed) || (p.nameKo && p.nameKo.toLowerCase() === trimmed));
      if (match) {
        if (!bomItems[index].partNo) bomItems[index].partNo = match.partNo;
        if (!bomItems[index].price) bomItems[index].price = Number(match.price) || 0;
        if (!bomItems[index].weight) bomItems[index].weight = Number(match.weight) || 0;
        if (match.spec) bomItems[index].spec = match.spec;
      }
    }
    saveAndRender();
  }
};

window.deleteItem = function(index) {
  if (confirm('Are you sure you want to delete this item?')) {
    if (index >= 0 && index < bomItems.length) {
      bomItems.splice(index, 1);
      saveAndRender();
    }
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
      ["Width", "Length1", "Length2", "Length3", "Length4", "Height", "Q'ty", "Nominal CAPA(M3)", "Actual CAPA(M3)", "SQM(m²)", "No. of Partition", "Skid Length"],
      [
        parseFloat(document.getElementById('tankWidth')?.value) || 0,
        parseFloat(document.getElementById('tankLength1')?.value) || 0,
        parseFloat(document.getElementById('tankLength2')?.value) || 0,
        parseFloat(document.getElementById('tankLength3')?.value) || 0,
        parseFloat(document.getElementById('tankLength4')?.value) || 0,
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
    alert("Error during Excel export: " + err.message);
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
        alert("Could not find a sheet to load in the Excel file.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(bomSheet, { header: 1 });
      if (!rows || rows.length === 0) {
        alert("The sheet contains no data.");
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
        alert("Invalid BOM Excel template format. (Required columns: Part Name, Part No., or Q'ty)");
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
          partName: partNameVal || (match ? (match.nameEn || match.nameKo) : partNoVal),
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
        alert(`Successfully imported ${importedItems.length} BOM items.`);
      } else {
        alert("No valid item data found to import.");
      }
    } catch (err) {
      console.error("importFromExcel Error:", err);
      alert("Error parsing Excel file: " + err.message);
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
      alert("No master DB items to download.");
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
    alert("Error downloading Master DB Excel: " + err.message);
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
        alert("Could not find Master DB sheet in the Excel file.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rows || rows.length === 0) {
        alert("Selected Excel sheet contains no data.");
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
        alert("Invalid Master DB Excel format. (Required columns: Part No., Part Name, or SPEC.)");
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
        alert("No valid item data found in Excel file.");
        return;
      }

      const overwrite = confirm(`Master DB Excel analysis complete (${newParts.length} items total).\n\n[OK]: Overwrite existing Master DB with Excel data.\n[Cancel]: Append/update Excel items while preserving existing Master DB.`);

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

      alert(`Successfully imported ${newParts.length} Master DB items.`);
    } catch (err) {
      console.error("importMasterDbFromExcel Error:", err);
      alert("Error parsing Master DB Excel: " + err.message);
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

  // Sync company logo in printout sheet header
  const savedLogo = localStorage.getItem('custom_company_logo');
  updateLogoUI(savedLogo);

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
  document.getElementById('sheetReinfMethod').textContent = getSelectText('reinfMethod', 'Internal');
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
      if (name.includes('roof') || name.includes('manhole') || pNo.startsWith('RF') || pNo.startsWith('MF') || pNo.startsWith('RM') || pNo.startsWith('MH')) {
        tables.roof.html += createRowHtml(item);
        tables.roof.qty += Number(item.qty) || 0;
      } else if (name.includes('bottom') || name.includes('drain') || name.includes('base') || pNo.startsWith('BF') || pNo.startsWith('BD') || pNo.startsWith('NF')) {
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
    } else if (pNo === 'WST-P0050RO' || name.includes('sealant') || name.includes('sealing tape')) {
      tables.etc.html += createRowHtml(item);
    } else if (cat === 'REINFORCING' || pNo.startsWith('WCP-') || pNo.startsWith('WFB-') || pNo.startsWith('WBR-') || pNo.startsWith('WCA-')) {
      if (name.includes('corner angle') || name.includes('external') || pNo === 'WFB-0950ZP' || pNo === 'WFB-1200Z' || pNo.endsWith('Z') || pNo.endsWith('ZP') || pNo.endsWith('ZL') || pNo.startsWith('WCA-')) {
        tables.extReinf.html += createRowHtml(item);
      } else {
        tables.intReinf.html += createRowHtml(item);
      }
    } else if (cat === 'TIE ROD' || cat === 'TIE_ROD' || pNo.startsWith('TR-') || pNo.startsWith('TC-') || pNo.startsWith('WTR-') || name.includes('tie-rod') || name.includes('tie rod') || name.includes('tierod')) {
      tables.tieRod.html += createRowHtml(item);
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

  // Live-sync active modalless floating window if open
  const modal = document.getElementById('printoutPreviewModal');
  if (modal && modal.style.display !== 'none') {
    const srcFrame = document.querySelector('#tab-printout-sheet .printout-sheet-frame');
    const modalContent = document.getElementById('modalPrintoutContent');
    if (srcFrame && modalContent) {
      modalContent.innerHTML = srcFrame.outerHTML;
    }
  }
}

// Subtab switcher for BOM / COST / WEIGHT tab
window.switchBomSubTab = function(subTabName, updateUrl = true) {
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

  if (updateUrl && typeof window !== "undefined") {
    const cleanHash = `bom-output/${subTabName}`;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + cleanHash);
    } else {
      window.location.hash = cleanHash;
    }
  }
};

// Modal trigger functions for printout sheet preview
window.closePrintoutSheetPreview = function() {
  const modal = document.getElementById('printoutPreviewModal');
  if (modal) {
    modal.style.display = 'none';
  }
};



window.closePrintoutSheetPreview = function() {
  const modal = document.getElementById('printoutPreviewModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

window.toggleMinimizePrintoutPreview = function() {
  const container = document.getElementById('modalPrintoutContentContainer');
  const windowEl = document.getElementById('printoutPreviewWindow');
  const btn = document.getElementById('btnMinimizePrintout');
  if (!container || !windowEl) return;

  if (container.style.display === 'none') {
    container.style.display = 'block';
    windowEl.style.height = 'calc(92vh - 50px)';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-window-minimize"></i>';
  } else {
    container.style.display = 'none';
    windowEl.style.height = 'auto';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-window-restore"></i>';
  }
};

// Draggable Modalless Dialog Header handler
(function initModallessWindowDrag() {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  document.addEventListener('mousedown', (e) => {
    const header = e.target.closest('#printoutPreviewHeader');
    if (!header) return;
    const windowEl = document.getElementById('printoutPreviewWindow');
    if (!windowEl) return;

    isDragging = true;
    const rect = windowEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    header.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const windowEl = document.getElementById('printoutPreviewWindow');
    if (!windowEl) return;

    let left = e.clientX - offsetX;
    let top = e.clientY - offsetY;

    left = Math.max(0, Math.min(left, window.innerWidth - 100));
    top = Math.max(0, Math.min(top, window.innerHeight - 50));

    windowEl.style.left = left + 'px';
    windowEl.style.top = top + 'px';
    windowEl.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      const header = document.getElementById('printoutPreviewHeader');
      if (header) header.style.cursor = 'move';
    }
  });
})();



window.exportPrintoutSheetToPDF = function(btnEl) {
  try {
    const element = document.querySelector('#modalPrintoutContent .printout-sheet-frame') || document.getElementById('modalPrintoutContent');
    if (!element) return;

    const btn = btnEl || (typeof event !== "undefined" && event ? event.target?.closest("button") : null);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Exporting...`;
    }

    const ipo = document.getElementById('ipoNo')?.value || 'BOM';
    const filename = `${ipo}_Requirements_PrintoutSheet.pdf`;

    const resetBtn = () => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Export PDF`;
      }
    };

    if (typeof html2canvas !== 'undefined') {
      html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
        
        if (jsPDFClass) {
          const pdf = new jsPDFClass('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const margin = 4;
          
          const printableWidth = pdfWidth - (margin * 2);
          const printableHeight = pdfHeight - (margin * 2);
          
          let imgWidth = printableWidth;
          let imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          if (imgHeight > printableHeight) {
            imgHeight = printableHeight;
            imgWidth = (canvas.width * imgHeight) / canvas.height;
          }
          
          const xOffset = margin + (printableWidth - imgWidth) / 2;
          const yOffset = margin;
          
          pdf.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight);
          pdf.save(filename);
          resetBtn();
        } else if (typeof html2pdf !== 'undefined') {
          const opt = {
            margin: [2, 2, 2, 2],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };
          html2pdf().set(opt).from(element).save().then(resetBtn).catch(resetBtn);
        } else {
          window.print();
          resetBtn();
        }
      }).catch(err => {
        console.error("html2canvas PDF generation error:", err);
        window.print();
        resetBtn();
      });
    } else {
      window.print();
      resetBtn();
    }
  } catch (err) {
    console.error("PDF Export Error:", err);
    window.print();
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
    resizer.title = 'Drag to resize column width';
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

  // Initialize table column resizers & load BOM Category filter from URL
  window.enableAllTableResizing();
  setTimeout(window.enableAllTableResizing, 500);
  setTimeout(loadBOMCategoryFromURL, 200);
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
  alert(`Pasted ${updatedCount} rows of Excel data.`);
});

// ============================================================================
// Universal System-Wide Dialog & Modal Escape Controller (ESC Key & Backdrop Click)
// ============================================================================
window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    // 1. Custom App Dialog (Alert / Confirm / Prompt)
    const customDialog = document.getElementById('customAppDialogModal');
    if (customDialog && customDialog.style.display !== 'none') {
      if (typeof window.closeCustomAppDialog === 'function') {
        window.closeCustomAppDialog(false);
      } else {
        customDialog.style.display = 'none';
      }
      return;
    }

    // 2. Part Master Picker Modal
    const pickerModal = document.getElementById('partMasterPickerModal');
    if (pickerModal) {
      pickerModal.remove();
      return;
    }

    // 3. Steel Skid Logic Sub Window
    const subWin = document.getElementById('ruleEditorMasterSubWindow');
    if (subWin && subWin.style.display !== 'none') {
      subWin.style.display = 'none';
      return;
    }

    // 4. Any open .modal element
    const openModals = Array.from(document.querySelectorAll('.modal')).filter(m => m.style.display !== 'none');
    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      if (topModal.id === 'categoryManagerModal' && typeof window.closeCategoryManagerModal === 'function') {
        window.closeCategoryManagerModal();
      } else if (topModal.id === 'dbBatchCategoryModal' && typeof window.closeDbBatchCategoryModal === 'function') {
        window.closeDbBatchCategoryModal();
      } else {
        topModal.style.display = 'none';
      }
    }
  }
});

// System-wide Backdrop Overlay Click Handler
document.addEventListener('click', function(e) {
  const modal = e.target;
  if (modal && modal.classList && modal.classList.contains('modal') && modal.style.display !== 'none') {
    if (modal.id === 'categoryManagerModal' && typeof window.closeCategoryManagerModal === 'function') {
      window.closeCategoryManagerModal();
    } else if (modal.id === 'dbBatchCategoryModal' && typeof window.closeDbBatchCategoryModal === 'function') {
      window.closeDbBatchCategoryModal();
    } else if (modal.id === 'customAppDialogModal' && typeof window.closeCustomAppDialog === 'function') {
      window.closeCustomAppDialog(false);
    } else {
      modal.style.display = 'none';
    }
  }
}, true);

// I-Beam Logic Tab Toolbar Button Delegations
document.addEventListener('click', function(e) {
  if (e.target.closest('.btnIBeamSelectDB')) {
    const btnDB = document.getElementById('btnOpenMasterSubWin');
    if (btnDB) btnDB.click();
  } else if (e.target.closest('.btnIBeamReset')) {
    if (typeof RuleEditorUI !== 'undefined' && typeof RuleEditorUI.resetCategory === 'function') {
      RuleEditorUI.resetCategory('steelSkid');
      RuleEditorUI.gotoCategory('steelSkid', '', 'ibeam');
    }
  } else if (e.target.closest('.btnIBeamSave')) {
    if (typeof RuleEditorUI !== 'undefined' && typeof RuleEditorUI.saveCategory === 'function') {
      RuleEditorUI.saveCategory('steelSkid');
    }
  }
});
