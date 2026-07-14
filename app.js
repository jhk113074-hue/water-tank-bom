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
  try {
    console.log("Fetching parts from Firebase Firestore...");
    const snapshot = await db.collection('parts').get();
    
    if (!snapshot.empty) {
      partsDb = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        partsDb.push({
          id: doc.id, // Keep firestore auto doc ID
          partNo: data.partNo || '',
          nameKo: data.nameKo || '',
          nameEn: data.nameEn || '',
          spec: data.spec || '',
          weight: Number(data.weight) || 0,
          price: Number(data.price) || 0,
          unit: data.unit || 'PCS',
          category: data.category || 'OTHER'
        });
      });
      console.log(`Successfully synced ${partsDb.length} parts from Firestore.`);
      // Backup to localStorage
      localStorage.setItem('custom_parts_db', JSON.stringify(partsDb));
    } else {
      throw new Error("Firestore 'parts' collection is empty");
    }
  } catch (err) {
    console.warn("Firebase fetch failed, falling back to local files:", err);
    const savedParts = localStorage.getItem('custom_parts_db');
    if (savedParts) {
      partsDb = JSON.parse(savedParts);
    } else {
      try {
        const res = await fetch('parts_db.json');
        partsDb = await res.json();
      } catch (e) {
        console.error('Error loading fallback parts_db.json:', e);
      }
    }
  }

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
    // Helper function to deep clone the default panelMatrix template loaded from panel_matrix.json
    const createFreshClone = () => {
      return JSON.parse(JSON.stringify(panelMatrix));
    };

    [1, 2, 3, 4].forEach(opt => {
      const savedOpt = localStorage.getItem(`water_tank_panel_matrix_opt${opt}`);
      if (savedOpt) {
        try {
          optionMatrixStorage[opt] = JSON.parse(savedOpt);
        } catch (e) {
          console.error(`Error parsing matrix for Option ${opt}, fallback to default`, e);
          optionMatrixStorage[opt] = createFreshClone();
        }
      } else {
        optionMatrixStorage[opt] = createFreshClone();
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
    if (currentCacheVer !== '1.6.34') {
      [1, 2, 3, 4].forEach(opt => {
        localStorage.removeItem(`water_tank_panel_matrix_opt${opt}`);
      });
      localStorage.removeItem('water_tank_panel_matrix');
      localStorage.setItem('water_tank_cache_ver', '1.6.34');
      window.location.reload();
      return;
    }

    panelMatrix = optionMatrixStorage[sideMatrixOption];

    // Trigger button states visual styles update
    const activeBtn = document.getElementById(`btnSideMatrixOpt${sideMatrixOption}`);
    if (activeBtn) {
      activeBtn.click();
    }
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
});

// Setup Listeners
function setupEventListeners() {
  // Tabs navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
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

  // Calculate Capacity Nominal
  const inputL1 = document.getElementById('tankLength1');
  const inputL2 = document.getElementById('tankLength2');
  const inputL3 = document.getElementById('tankLength3');
  const inputL4 = document.getElementById('tankLength4');
  const inputWidth = document.getElementById('tankWidth');
  const inputHeight = document.getElementById('tankHeight');
  const inputQty = document.getElementById('tankQty');

  calcCapa = () => {
    const l1 = parseFloat(inputL1.value) || 0;
    const l2 = parseFloat(inputL2.value) || 0;
    const l3 = parseFloat(inputL3.value) || 0;
    const l4 = parseFloat(inputL4.value) || 0;
    const w = parseFloat(inputWidth.value) || 0;
    const h = parseFloat(inputHeight.value) || 0;
    const q = parseInt(inputQty.value) || 1;

    const totalLength = l1 + l2 + l3 + l4;
    const nominal = (typeof AccessoriesEngine !== 'undefined')
      ? AccessoriesEngine.nominalCapaM3(w, totalLength, h)
      : totalLength * w * h; // fallback if engine script failed to load
    const statEl = document.getElementById('statCapa');
    statEl.textContent = `${nominal.toFixed(1)} M³`;
    statEl.title = `1 SET 기준 공칭용량(Nominal CAPA). 전체 ${q} SET 합계: ${(nominal * q).toFixed(1)} M³`;

    const formulaEl = document.getElementById('statSizeFormula');
    if (formulaEl) {
      formulaEl.textContent = `${totalLength}m * ${w}m * ${h}m`;
    }
  };

  [inputL1, inputL2, inputL3, inputL4, inputWidth, inputHeight, inputQty].forEach(input => {
    input.addEventListener('input', calcCapa);
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
      if (confirm('정말로 측벽 판넬 매핑 매트릭스를 전부 초기화하시겠습니까?')) {
        panelMatrix = panelMatrix.map(row => {
          const pos = (row.position || '').toLowerCase();
          const isSideRow = pos.includes('side') || pos.includes('wall') || pos.includes('drain') || row.rowIndex >= 19;
          if (isSideRow) {
            const emptyGrades = {};
            if (row.heightGrades) {
              Object.keys(row.heightGrades).forEach(key => {
                emptyGrades[key] = "";
              });
            }
            return {
              ...row,
              item: "",
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

  btnAdd.addEventListener('click', () => {
    // Clear Modal
    searchInput.value = '';
    suggestionsBox.style.display = 'none';
    document.getElementById('modalPartNo').value = '';
    document.getElementById('modalPartName').value = '';
    document.getElementById('modalQty').value = '1';
    document.getElementById('modalUnit').value = 'PCS';
    document.getElementById('modalPrice').value = '0';
    document.getElementById('modalWeight').value = '0';
    document.getElementById('modalSpec').value = '';
    
    modal.classList.add('active');
  });

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
        const newPart = { partNo, category, nameKo, nameEn, unit, price, weight, spec };
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

        const updatedPart = { partNo, category, nameKo, nameEn, unit, price, weight, spec };
        
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

  window.openEditDbModal = function(index) {
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
    const chkAll = document.getElementById('chkDbSelectAll');

    if (countSpan) countSpan.innerText = checked.length;
    if (btnBulk) {
      if (checked.length > 0) {
        btnBulk.style.display = 'flex';
      } else {
        btnBulk.style.display = 'none';
      }
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

  // Row checkboxes change event listener delegation
  document.getElementById('tbodyPartsMasterDbList').addEventListener('change', (e) => {
    if (e.target.classList.contains('chk-db-row-select')) {
      updateDbBulkDeleteUI();
    }
  });

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

  // Switch Side Matrix Configurations (Option 1 vs Option 2)
  const btnOpt1 = document.getElementById('btnSideMatrixOpt1');
  const btnOpt2 = document.getElementById('btnSideMatrixOpt2');
  const btnOpt3 = document.getElementById('btnSideMatrixOpt3');
  const btnOpt4 = document.getElementById('btnSideMatrixOpt4');
  const optDesc = document.getElementById('sideMatrixActiveOptDesc');

  if (btnOpt1 && btnOpt2 && btnOpt3 && btnOpt4) {
    const setOptionActive = (optNum) => {
      sideMatrixOption = optNum;
      localStorage.setItem('water_tank_active_option', optNum);
      
      // Load corresponding option matrix into panelMatrix
      if (optionMatrixStorage[optNum]) {
        panelMatrix = optionMatrixStorage[optNum];
      }
      
      // Reset all buttons style
      [btnOpt1, btnOpt2, btnOpt3, btnOpt4].forEach((btn, idx) => {
        if (idx + 1 === optNum) {
          btn.style.background = 'var(--neon-blue)';
          btn.style.color = 'white';
          btn.style.fontWeight = 'bold';
        } else {
          btn.style.background = 'transparent';
          btn.style.color = 'var(--text-secondary)';
          btn.style.fontWeight = 'normal';
        }
      });

      if (optNum === 1) {
        if (optDesc) optDesc.textContent = '(현재: Option 1 - Side(Default) 조합 사용 중)';
      } else if (optNum === 2) {
        if (optDesc) optDesc.textContent = '(현재: Option 2 - Side(0.5m, 1m) 조합 사용 중)';
      } else if (optNum === 3) {
        if (optDesc) optDesc.textContent = '(현재: Option 3 - partition(Default) 조합 사용 중)';
      } else if (optNum === 4) {
        if (optDesc) optDesc.textContent = '(현재: Option 4 - partition(0.5m, 1m) 조합 사용 중)';
      }
      renderSidePanelConfig();
    };

    btnOpt1.addEventListener('click', () => setOptionActive(1));
    btnOpt2.addEventListener('click', () => setOptionActive(2));
    btnOpt3.addEventListener('click', () => setOptionActive(3));
    btnOpt4.addEventListener('click', () => setOptionActive(4));
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
  document.getElementById('btnExport').addEventListener('click', exportToExcel);

  // Excel Import Trigger
  document.getElementById('excelFile').addEventListener('change', importFromExcel);

  // Auto-calculate Steel Skid total length from Width/Length (Steel_Skid!B45,
  // verified height- and partition-count-independent -- see accessories_engine.js)
  const btnAutoCalcSkid = document.getElementById('btnAutoCalcSkid');
  if (btnAutoCalcSkid) {
    btnAutoCalcSkid.addEventListener('click', () => {
      const w = parseFloat(inputWidth.value) || 0;
      const totalLength = (parseFloat(inputL1.value) || 0) + (parseFloat(inputL2.value) || 0)
        + (parseFloat(inputL3.value) || 0) + (parseFloat(inputL4.value) || 0);
      try {
        const g = PanelEngine.makeGeometry(w, parseFloat(inputL1.value) || 0, 1, parseFloat(inputL2.value) || 0, parseFloat(inputL3.value) || 0, parseFloat(inputL4.value) || 0);
        const skidLen = AccessoriesEngine.steelSkidTotalLength(w, g.W.whole, g.W.half, totalLength);
        document.getElementById('skidLength').value = skidLen;
      } catch (err) {
        alert(`스키드 길이 계산 오류: ${err.message}`);
      }
    });
  }

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

  // Local Print Trigger Action
  document.getElementById('btnLocalPrint').addEventListener('click', () => {
    window.print();
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

  bomItems = [];

  // 1. PANELS -- verified engine (geometry -> course stacking -> quantity rules -> catalog)
  const lookupPart = (partNo) => partsDb.find(p => p.partNo === partNo) || null;
  let N_PA = partitionsInput; // fallback if the engine throws before we get a real value
  try {
    const engineResult = PanelEngine.computePanelBomItems(
      { W: w, L1: l1, L2: l2, L3: l3, L4: l4, H: h, qty: q },
      lookupPart
    );
    engineResult.items.forEach(item => bomItems.push(item));
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
  // Internal reinforcing never uses tie-rod hardware (INT_TIE_ROD sheet
  // confirmed dead/unreferenced in the original workbook), so the Tie-Rod
  // line only appears for External reinforcing.
  try {
    const gReinf = PanelEngine.makeGeometry(w, l1, h, l2, l3, l4);
    const isSA4 = parseInt(boltSpec, 10) === 2;
    const { parts: reinfParts, unmapped } = AccessoriesEngine.reinforcingParts(gReinf, isIntReinf, isSA4);
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
        bomItems.push({ category: "Reinforcing", partNo: "WTR-12M300Z", partName: (found && (found.nameKo || found.nameEn)) || "External Tie-Rod Assembly (HDG)", qty: tieRodQty, unit: "PCS", spec: (found && found.spec) || "Tie-rod + nut/washer/coupler/anchor set (formula-verified)", price: (found && Number(found.price)) || 6.2, weight: (found && Number(found.weight)) || 1.8 });
      }
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
    const { parts: boltParts } = AccessoriesEngine.boltsAndNutsParts(gBolts, isIntReinf, materialOption);
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

    // Build items HTML list dynamically
    let itemsHtml = '<div style="display:flex; flex-direction:column; gap:8px;">';
    
    items.forEach((item, idx) => {
      const isBolt = idx === 0; // First item is always the main bolt

      // Build selection input/dropdown
      let componentSelectorHtml = "";
      if (isBolt) {
        componentSelectorHtml = `<input type="text" readonly value="${item.partNo}" style="width: 160px; padding: 4px 6px; background:#f1f5f9; border: 1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:11px;">`;
      } else {
        componentSelectorHtml = `
          <select onchange="updatePrelistedRecipePartNo('${boltNo}', ${idx}, this.value)" style="width: 160px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:11px; color:var(--text-primary); outline:none; background:#fff; cursor:pointer;">
            ${subPartOptions.map(opt => `<option value="${opt}" ${item.partNo === opt ? 'selected' : ''}>${opt || '-- 선택안함 --'}</option>`).join('')}
          </select>
        `;
      }

      // Label prefix colors
      let typeLabel = "Bolt";
      let labelColor = "#3b82f6";
      if (idx === 1) { typeLabel = "Nut"; labelColor = "#10b981"; }
      else if (idx === 2) { typeLabel = "Washer"; labelColor = "#f59e0b"; }
      else if (idx > 2) { typeLabel = `자재 ${idx}`; labelColor = "#8b5cf6"; }

      itemsHtml += `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size:11px; font-weight:bold; width: 60px; color:${labelColor};">${typeLabel}:</span>
          ${componentSelectorHtml}
          <input type="text" value="${item.partName || ''}" onchange="updatePrelistedRecipe('${boltNo}', ${idx}, 'partName', this.value)" style="flex:1; padding:4px 6px; border:1px solid var(--border-color); border-radius:4px; font-size:11px;" placeholder="품명 (자동 매핑)">
          <span style="font-size:11px; color:var(--text-secondary); margin-left: 6px;">배율:</span>
          <input type="number" step="any" value="${item.ratio || 0}" ${isBolt ? 'readonly style="width: 50px; padding:4px; border:1px solid var(--border-color); border-radius:4px; text-align:right; font-size:11px; background:#f1f5f9;"' : `onchange="updatePrelistedRecipe('${boltNo}', ${idx}, 'ratio', parseFloat(this.value) || 0)" style="width: 50px; padding:4px; border:1px solid var(--border-color); border-radius:4px; text-align:right; font-size:11px;"`} >
          ${!isBolt ? `<button type="button" class="btn btn-sm btn-outline" onclick="deleteRecipeComponent('${boltNo}', ${idx}); event.stopPropagation();" style="padding: 2px 6px; color:var(--neon-rose); border-color:var(--neon-rose); font-size:10px; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
      `;
    });

    itemsHtml += `
      <div style="margin-top: 4px; display:flex; gap:8px;">
        <button type="button" class="btn btn-sm btn-secondary" onclick="addRecipeComponent('${boltNo}'); event.stopPropagation();" style="padding: 3px 8px; font-size: 11px; cursor:pointer;"><i class="fa-solid fa-plus"></i> 구성 단품 추가 (너트/와셔 등)</button>
      </div>
    </div>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 10px 8px; vertical-align: middle;">
        <strong style="font-family: monospace; font-size:12.5px;">${boltNo}</strong>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">(Bolt Set 품번)</div>
      </td>
      <td style="padding: 10px 8px;">
        ${itemsHtml}
      </td>
      <td align="center" style="vertical-align: middle; padding: 10px 8px;">
        <button class="btn btn-sm btn-outline" onclick="resetPrelistedRecipe('${boltNo}')" style="color:var(--text-secondary); border-color:var(--border-color); font-size:11px; padding: 5px 8px;"><i class="fa-solid fa-rotate-left"></i> 초기화</button>
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

// Render Master Database List
function renderDbList() {
  const tbody = document.getElementById('tbodyPartsMasterDbList');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchInput = document.getElementById('dbTabSearchInput');
  const catFilter = document.getElementById('dbTabCategoryFilter');
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedCat = catFilter ? catFilter.value.trim().toUpperCase() : '';
  
  // 1. Filter items first
  let filtered = partsDb.filter(item => {
    if (selectedCat) {
      const itemCat = (item.category || 'OTHER').toUpperCase().trim();
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
    if (dbSortField === 'price' || dbSortField === 'weight') {
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

    const tr = document.createElement('tr');
    tr.setAttribute('onclick', `openEditDbModal(${origIndex})`);
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td align="center" onclick="event.stopPropagation();">
        <input type="checkbox" class="chk-db-row-select" data-index="${origIndex}" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td><strong>${item.partNo || ''}</strong></td>
      <td><span class="badge category-badge">${item.category || 'OTHER'}</span></td>
      <td>${item.nameKo || ''}</td>
      <td>${item.nameEn || ''}</td>
      <td>${item.unit || 'PCS'}</td>
      <td>${item.price || 0}</td>
      <td>${item.weight || 0}</td>
      <td>${item.spec || ''}</td>
      <td align="center" onclick="event.stopPropagation();" style="display: flex; gap: 8px; justify-content: center; align-items: center;">
        <i class="fa-regular fa-copy action-icon" onclick="copyDbItem(${origIndex}, event)" title="복제하여 추가" style="color: var(--neon-blue); font-size: 14px; padding: 6px; cursor: pointer;"></i>
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteDbItem(${origIndex}, event)" title="삭제" style="color: var(--neon-rose); font-size: 14px; padding: 6px; cursor: pointer;"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" align="center" style="color:var(--text-secondary); padding: 25px;">검색 결과가 없습니다.</td></tr>`;
  }

  // Bind checkbox events
  updateDbBulkDeleteUI();

  // 4. Render sort arrow indicators
  updateSortIconsUI();
}

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
  const fields = ['partNo', 'category', 'nameKo', 'nameEn', 'unit', 'price', 'weight', 'spec'];
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
    return `
      <input type="text" list="dl-panel-opts" value="${currentVal}" 
        onchange="updateMatrix(${matrixIdx}, '${field}', this.value)" 
        placeholder="검색/입력"
        style="width:100%; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px; font-size:10px; background:#fff; cursor:text; font-weight:500; box-sizing:border-box; outline:none; text-align:center;">
    `;
  };

  const idxManhole = panelMatrix.findIndex(r => r.position === 'Manhole');
  const idxRoof = panelMatrix.findIndex(r => r.position === 'Roof');
  const idxBase = panelMatrix.findIndex(r => r.position === 'Base');
  const idxDrain = panelMatrix.findIndex(r => r.position === 'Drain');
  const idxSide15 = panelMatrix.findIndex(r => r.position === 'Side15');
  const idxSide20 = panelMatrix.findIndex(r => r.position === 'Side20');

  const safeIdx = (targetIndex, fallback) => targetIndex !== -1 ? targetIndex : fallback;
  const mIdx = safeIdx(idxManhole, 0);
  const rIdx = safeIdx(idxRoof, 1);
  const bIdx = safeIdx(idxBase, 5);
  const dIdx = safeIdx(idxDrain, 11);
  const s15Idx = safeIdx(idxSide15, 19);
  const s20Idx = safeIdx(idxSide20, 20);

  // Build the layout grid matching the visual diagram:
  let html = `
    <div style="display: grid; grid-template-columns: 140px repeat(9, 1fr); border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fafbfc; position: relative;">
      
      <!-- Y-Axis Labels Column -->
      <div style="display: flex; flex-direction: column; border-right: 2px solid #cbd5e1; background: transparent;">
        <div style="height: 38px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; color:#475569; background: #f1f5f9; box-sizing: border-box;">Tank Height</div>
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff; box-sizing: border-box;">Roof Panel</div>
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff; box-sizing: border-box;">Manhole Panel</div>
        <div style="height: 400px; display: flex; flex-direction: column; font-size: 11px; font-weight: bold; color: #1e293b; border-bottom: 2px solid #cbd5e1; box-sizing: border-box; gap: 0;">
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">5.0mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">4.5mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">4.0mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">3.5mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">3.0mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">2.5mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">2.0mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">1.5mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #cbd5e1; background: #f8fafc; box-sizing: border-box;">1.0mH</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: center; background: #f8fafc; box-sizing: border-box;">0.5mH</div>
        </div>
        <!-- Bottom fixed layout tags -->
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff; box-sizing: border-box;">Bottom Panel</div>
        <div style="height: 42px; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff; box-sizing: border-box;">Drain Panel</div>
      </div>
  `;

  // Draw each height column stack (e.g. 1H, 1.3H, 1.5H, etc.)
  sideHeightGrades.forEach(hGrade => {
    // Parse numeric float value of height
    const hFloat = parseFloat(hGrade);

    // Determine color scheme based on typical height index pattern
    const isOddPattern = hGrade.includes('.3') || hGrade.includes('.5') || hGrade.includes('.8');
    const colBg = isOddPattern ? '#e0f2fe' : '#ffffff'; // Sky blue tint vs white
    const colBorder = '1px solid #cbd5e1';

    // 1. Fetch values
    const roofVal = panelMatrix[rIdx]?.heightGrades[hGrade] || '';
    const manholeVal = panelMatrix[mIdx]?.heightGrades[hGrade] || '';
    const bottomVal = panelMatrix[bIdx]?.heightGrades[hGrade] || '';
    const drainVal = panelMatrix[dIdx]?.heightGrades[hGrade] || '';

    // 2. Build Stack boxes representing Wall Panels ONLY in the vertical stack
    let stackBoxesHtml = '';

    // Height stack logic partitioned into side-by-side Horizontal Flex Box columns:
    // Left side: Wall 1m (2/3 width) - Standardized uniform height blocks (1x1m, 1x1.5m, 1x2m)
    // Right side: Wall 0.5m (1/3 width) - Standardized uniform height blocks (0.5x1m, 0.5x0.5m, 0.5x0.1m)

    // Helper map of configurations for left side (Wall 1m Column) and right side (Wall 0.5m Column)
    // heightGrades configuration mappings:
    // 1.0mH -> Left: [1x1m] / Right: [0.5x1m]
    // 1.5mH -> Left: [1x1.5m] / Right: [0.5x1m, 0.5x0.5m]
    // 2.0mH -> Left: [1x2m] / Right: [0.5x1m, 0.5x1m]
    // 2.5mH -> Left: [1x1m, 1x1.5m] / Right: [0.5x1m, 0.5x1m, 0.5x0.5m]
    // 3.0mH -> Left: [1x1m, 1x2m] / Right: [0.5x1m, 0.5x1m, 0.5x1m]
    // 3.5mH -> Left: [1x1m, 1x1m, 1x1.5m] / Right: [0.5x1m, 0.5x1m, 0.5x1m, 0.5x0.5m]
    // 4.0mH -> Left: [1x1m, 1x1m, 1x2m] / Right: [0.5x1m, 0.5x1m, 0.5x1m, 0.5x0.1m]
    // 4.5mH -> Left: [1x1m, 1x1m, 1x1m, 1x1.5m] / Right: [0.5x1m, 0.5x1m, 0.5x1m, 0.5x1m, 0.5x0.5m]
    // 5.0mH -> Left: [1x1m, 1x1m, 1x1m, 1x2m] / Right: [0.5x1m, 0.5x1m, 0.5x1m, 0.5x0.1m, 0.5x0.1m]

    const configMapOpt1 = {
      '1mH': {
        left: ['1x1m'],
        right: ['0.5mx1m']
      },
      '1.5mH': {
        left: ['1x1.5m'],
        right: ['0.5mx1m', '0.5mx0.5m']
      },
      '2mH': {
        left: ['1x2m'],
        right: ['0.5mx1m', '0.5mx1m']
      },
      '2.5mH': {
        left: ['1x1m', '1x1.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '3mH': {
        left: ['1x1m', '1x2m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m']
      },
      '3.5mH': {
        left: ['1x1m', '1x1m', '1x1.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '4mH': {
        left: ['1x1m', '1x1m', '1x2m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m']
      },
      '4.5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x1.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x2m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m']
      }
    };

    const configMapOpt2 = {
      '1mH': {
        left: ['1x1m'],
        right: ['0.5mx1m']
      },
      '1.5mH': {
        left: ['1x1m', '1x0.5m'],
        right: ['0.5mx1m', '0.5mx0.5m']
      },
      '2mH': {
        left: ['1x1m', '1x1m'],
        right: ['0.5mx1m', '0.5mx1m']
      },
      '2.5mH': {
        left: ['1x1m', '1x1m', '1x0.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '3mH': {
        left: ['1x1m', '1x1m', '1x1m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m']
      },
      '3.5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x0.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '4mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x1m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m']
      },
      '4.5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x1m', '1x0.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x1m', '1x1m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m']
      }
    };

    const currentConf = (sideMatrixOption === 2 || sideMatrixOption === 4) ? configMapOpt2[hGrade] : configMapOpt1[hGrade];

    let leftColHtml = '';
    let totalLeftHeight = 0;
    // We render boxes from bottom to top, but design is column-reverse flex.
    currentConf.left.forEach((lbl) => {
      // Determine physical rendering height: 1x1m is 80px, 1x1.5m is 120px, 1x2m is 160px, 1x0.5m is 40px
      let boxHeight = 80;
      if (lbl === '1x1.5m') {
        boxHeight = 120;
      } else if (lbl === '1x2m') {
        boxHeight = 160;
      } else if (lbl === '1x0.5m') {
        boxHeight = 40;
      }
      totalLeftHeight += boxHeight;

      const cellVal1m = panelMatrix[s20Idx]?.heightGrades[hGrade] || '';
      leftColHtml += `
        <div style="background: #eff6ff; border: 1px solid #3b82f6; border-radius: 0; padding: 2px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; width: 100%; height: ${boxHeight}px;">
          <div style="font-size: 8px; font-weight: bold; color: #1e40af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lbl}</div>
          ${makeSelectElement(s20Idx, hGrade, cellVal1m)}
        </div>
      `;
    });
    // Add spacer placeholder to fill the rest of the 400px column height
    const leftRemaining = 400 - totalLeftHeight;
    if (leftRemaining > 0) {
      leftColHtml += `<div style="height: ${leftRemaining}px; width: 100%;"></div>`;
    }

    let rightColHtml = '';
    let totalRightHeight = 0;
    currentConf.right.forEach((lbl) => {
      const cellVal05 = panelMatrix[s15Idx]?.heightGrades[hGrade] || '';
      // Determine physical rendering height: 0.5mx1m is 80px, 0.5mx0.5m is 40px
      let boxHeight = 80;
      if (lbl === '0.5mx0.5m') {
        boxHeight = 40;
      }
      totalRightHeight += boxHeight;

      let displayLabel = lbl;
      if (lbl === '0.5mx1m') {
        displayLabel = '0.5m<br>x1m';
      } else if (lbl === '0.5mx0.5m') {
        displayLabel = '0.5mx0<br>.5m';
      }
      rightColHtml += `
        <div style="background: #eff6ff; border: 1px solid #3b82f6; border-radius: 0; padding: 2px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; width: 100%; height: ${boxHeight}px; line-height: 1.1;">
          <div style="font-size: 8px; font-weight: bold; color: #1e40af; text-align: center;">${displayLabel}</div>
          ${makeSelectElement(s15Idx, hGrade, cellVal05)}
        </div>
      `;
    });
    // Add spacer placeholder to fill the rest of the 400px column height
    const rightRemaining = 400 - totalRightHeight;
    if (rightRemaining > 0) {
      rightColHtml += `<div style="height: ${rightRemaining}px; width: 100%;"></div>`;
    }

    // Flex container aligning left and right columns side-by-side
    // We add a background linear-gradient to act as horizontal grid reference lines at every 40px (which corresponds to 0.5m intervals).
    // The grid lines are thin dotted borders or light line breaks:
    const gridBackgroundStyle = `
      background-image: 
        linear-gradient(to top, #94a3b8 1px, transparent 1px);
      background-size: 100% 40px;
    `;

    stackBoxesHtml = `
      <div style="display: flex; gap: 0; width: 100%; box-sizing: border-box; justify-content: space-between; align-items: flex-start; height: 400px; ${gridBackgroundStyle}">
        <!-- Wall 1m (2/3 width) -->
        <div style="flex: 2; display: flex; flex-direction: column-reverse; gap: 0; min-width: 0; border-right: 1px solid #cbd5e1; height: 100%;">
          ${leftColHtml}
        </div>
        <!-- Wall 0.5m (1/3 width) -->
        <div style="flex: 1; display: flex; flex-direction: column-reverse; gap: 0; min-width: 0; height: 100%;">
          ${rightColHtml}
        </div>
      </div>
    `;

    html += `
      <!-- Column Stack: ${hGrade} -->
      <div style="display: flex; flex-direction: column; border-right: ${colBorder}; background: ${colBg}; text-align: center;">
        
        <!-- Header Height Tag -->
        <div style="height: 38px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#1e293b; background: #e2e8f0;">
          ${hGrade}
        </div>

        <!-- Roof Panel dropdown -->
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; padding: 0 2px; background: #f0fdf4;">
          ${makeSelectElement(rIdx, hGrade, roofVal)}
        </div>

        <!-- Manhole Panel dropdown -->
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; padding: 0 2px; background: #fef3c7;">
          ${makeSelectElement(mIdx, hGrade, manholeVal)}
        </div>

        <!-- Vertical Stack Area (Wall Panels Only) -->
        <div style="height: 400px; display: flex; flex-direction: column-reverse; padding: 0; justify-content: flex-start; align-items: center; border-bottom: 2px solid #cbd5e1; box-sizing: border-box; overflow: hidden; background: #fff;">
          ${stackBoxesHtml || '<div style="font-size:9px; color:#94a3b8; font-style:italic; padding-top:20px;">No Wall Panel</div>'}
        </div>

        <!-- Bottom Panel dropdown -->
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; padding: 0 2px; background: #fff;">
          ${makeSelectElement(bIdx, hGrade, bottomVal)}
        </div>

        <!-- Drain Panel dropdown -->
        <div style="height: 42px; display:flex; align-items:center; justify-content:center; padding: 0 2px; background: #fff;">
          ${makeSelectElement(dIdx, hGrade, drainVal)}
        </div>

      </div>
    `;
  });

  html += `</div>`;
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
    // Update local storage and cache storage object for the active option
    optionMatrixStorage[sideMatrixOption] = panelMatrix;
    localStorage.setItem(`water_tank_panel_matrix_opt${sideMatrixOption}`, JSON.stringify(panelMatrix));
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

  bomItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
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

  document.getElementById('statCost').textContent = `${cost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} KDN`;
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
  const wb = XLSX.utils.book_new();

  // Create Data/Info sheet
  const projectInfo = [
    ["YSACC GRP TANK BOM GENERATOR REPORT"],
    [],
    ["IPO No.", document.getElementById('ipoNo').value],
    ["Order Date", document.getElementById('orderDate').value],
    ["Project Name", document.getElementById('projectName').value],
    ["Sold to (Client)", document.getElementById('customerName').value],
    ["Client TEL", document.getElementById('clientTel').value],
    ["DELIVERED TO", document.getElementById('deliveredTo').value],
    ["Delivery Date", document.getElementById('deliveryDate').value],
    ["Recipient", document.getElementById('recipient').value],
    ["Installer Mob.", document.getElementById('installerMob').value],
    [],
    ["Tank Dimension Config"],
    ["Length 1 (m)", parseFloat(document.getElementById('tankLength1').value) || 0],
    ["Length 2 (m)", parseFloat(document.getElementById('tankLength2').value) || 0],
    ["Length 3 (m)", parseFloat(document.getElementById('tankLength3').value) || 0],
    ["Length 4 (m)", parseFloat(document.getElementById('tankLength4').value) || 0],
    ["Width (m)", parseFloat(document.getElementById('tankWidth').value) || 0],
    ["Height (m)", parseFloat(document.getElementById('tankHeight').value) || 0],
    ["Quantity (Set)", parseInt(document.getElementById('tankQty').value) || 1],
    ["No. of Partition", parseInt(document.getElementById('numPartition').value) || 0],
    ["Skid Length (m)", parseFloat(document.getElementById('skidLength').value) || 0],
    ["Nominal Capacity (M3)", parseFloat(document.getElementById('statCapa').textContent) || 0]
  ];
  const infoWs = XLSX.utils.aoa_to_sheet(projectInfo);
  XLSX.utils.book_append_sheet(wb, infoWs, "BASIC_TOOL");

  // Create PRINTOUT(BOM)
  const bomData = [
    ["No", "Category", "Part Name", "Part No.", "Q'ty", "Unit", "Specification"]
  ];
  bomItems.forEach((item, index) => {
    bomData.push([
      index + 1,
      item.category,
      item.partName,
      item.partNo,
      item.qty,
      item.unit,
      item.spec
    ]);
  });
  const bomWs = XLSX.utils.aoa_to_sheet(bomData);
  XLSX.utils.book_append_sheet(wb, "PRINTOUT(BOM)", bomWs);

  // Create PRINTOUT(COST)
  const costData = [
    ["No", "Category", "Part Name", "Part No.", "Q'ty", "Unit", "Unit Price", "Total Price"]
  ];
  let sumCost = 0;
  bomItems.forEach((item, index) => {
    const total = item.qty * item.price;
    sumCost += total;
    costData.push([
      index + 1,
      item.category,
      item.partName,
      item.partNo,
      item.qty,
      item.unit,
      item.price,
      total
    ]);
  });
  costData.push([]);
  costData.push([null, null, null, null, null, null, "Total Cost (KDN)", sumCost]);
  const costWs = XLSX.utils.aoa_to_sheet(costData);
  XLSX.utils.book_append_sheet(wb, "PRINTOUT(COST)", costWs);

  // Create PRINTOUT(WT)
  const wtData = [
    ["No", "Category", "Part Name", "Part No.", "Q'ty", "Unit", "Unit Weight (kg)", "Total Weight (kg)"]
  ];
  let sumWt = 0;
  bomItems.forEach((item, index) => {
    const total = item.qty * item.weight;
    sumWt += total;
    wtData.push([
      index + 1,
      item.category,
      item.partName,
      item.partNo,
      item.qty,
      item.unit,
      item.weight,
      total
    ]);
  });
  wtData.push([]);
  wtData.push([null, null, null, null, null, null, "Total Weight (kg)", sumWt]);
  const wtWs = XLSX.utils.aoa_to_sheet(wtData);
  XLSX.utils.book_append_sheet(wb, "PRINTOUT(WT)", wtWs);

  // Save File
  const filename = `${document.getElementById('ipoNo').value || 'BOM'}_WATANI_BOM.xlsx`;
  XLSX.writeFile(wb, filename);
}

// SheetJS Excel Import
function importFromExcel(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Look for a BOM sheet, default to first sheet
      let bomSheet = workbook.Sheets["PRINTOUT(BOM)"] || workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(bomSheet, { header: 1 });
      
      if (rows.length < 2) {
        alert("BOM 데이터 행이 너무 적어 불러올 수 없습니다.");
        return;
      }

      // Parse headers
      const headers = rows[0].map(h => String(h).trim().toLowerCase());
      const catIdx = headers.indexOf("category");
      const nameIdx = headers.indexOf("part name") !== -1 ? headers.indexOf("part name") : headers.indexOf("name");
      const noIdx = headers.indexOf("part no.") !== -1 ? headers.indexOf("part no.") : headers.indexOf("no");
      const qtyIdx = headers.indexOf("q'ty") !== -1 ? headers.indexOf("q'ty") : (headers.indexOf("qty") !== -1 ? headers.indexOf("qty") : headers.indexOf("quantity"));
      const unitIdx = headers.indexOf("unit");
      const specIdx = headers.indexOf("specification") !== -1 ? headers.indexOf("specification") : headers.indexOf("spec");

      if (qtyIdx === -1 || (nameIdx === -1 && noIdx === -1)) {
        alert("올바른 BOM 엑셀 템플릿 양식이 아닙니다. (필수 열: Part Name, Q'ty)");
        return;
      }

      const importedItems = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || !row[nameIdx]) continue;

        const qty = parseFloat(row[qtyIdx]) || 0;
        if (qty <= 0) continue;

        const pNo = noIdx !== -1 && row[noIdx] ? String(row[noIdx]).trim() : '';
        
        // Lookup matching unit price and weight from our partsDb
        let price = 0;
        let weight = 0;
        const match = partsDb.find(p => p.partNo && p.partNo.toLowerCase() === pNo.toLowerCase());
        if (match) {
          price = match.price;
          weight = match.weight;
        }

        importedItems.push({
          category: catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : "Panels",
          partName: row[nameIdx] ? String(row[nameIdx]).trim() : '',
          partNo: pNo,
          qty: qty,
          unit: unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : 'PCS',
          spec: specIdx !== -1 && row[specIdx] ? String(row[specIdx]).trim() : '',
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
    } catch(err) {
      console.error(err);
      alert("엑셀 파일을 파싱하는 도중 에러가 발생했습니다: " + err.message);
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

  document.getElementById('sheetSizeFormula').textContent = `${totalLength}m x ${w}m x ${h}mH = ${nominal.toFixed(1)} [M³] / ${q} [SET]`;
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

  // Helper row builder
  const createRowHtml = (item) => `
    <tr>
      <td style="border: 1px solid #333333; padding: 4px;">${item.partName || ''}</td>
      <td style="border: 1px solid #333333; padding: 4px; font-family: monospace;">${item.partNo || ''}</td>
      <td style="border: 1px solid #333333; padding: 4px; text-align: right; font-weight: bold;">${item.qty || 0}</td>
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
    } else if (cat === 'STEEL SKID') {
      tables.skid.html += createRowHtml(item);
    } else if (cat === 'BOLTS & NUTS') {
      tables.bolts.html += createRowHtml(item);
    } else if (cat === 'REINFORCING') {
      if (name.includes('corner angle') || name.includes('external')) {
        tables.extReinf.html += createRowHtml(item);
      } else {
        tables.intReinf.html += createRowHtml(item);
      }
    } else if (cat === 'TIE ROD' || name.includes('tie-rod') || name.includes('tierod')) {
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
}
