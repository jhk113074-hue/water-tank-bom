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
let panelMatrix = [];
let bomItems = [];

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
    const rawMatrix = await res.json();
    // Empty default matrix settings so they display select boxes without prefilled values
    panelMatrix = rawMatrix.map(row => {
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
    });
    console.log(`Loaded and emptied ${panelMatrix.length} panel matrix items.`);
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
  // Bind events immediately so tabs work even if DB loading takes time
  setupEventListeners();

  // 1. Fetch Firebase database & static assets first (which loads panel_matrix.json defaults)
  try {
    await loadPartsDatabase();
  } catch (err) {
    console.error("Async DB load failed:", err);
  }

  // 2. ONLY AFTER database loads, restore local storage overrides if present
  const savedMatrix = localStorage.getItem('water_tank_panel_matrix');
  if (savedMatrix) {
    try {
      panelMatrix = JSON.parse(savedMatrix);
      // Clean up legacy decimal keys if they exist in cache
      panelMatrix.forEach(row => {
        if (row.heightGrades) {
          const legacyKeys = ['1.3mH', '1.8mH', '2.3mH', '2.8mH', '3.3mH', '3.8mH', '4.3mH', '4.8mH'];
          legacyKeys.forEach(k => {
            if (k in row.heightGrades) {
              delete row.heightGrades[k];
            }
          });
        }
      });
      // Force rewrite to localStorage to clean the stored string
      localStorage.setItem('water_tank_panel_matrix', JSON.stringify(panelMatrix));
    } catch(e) {
      console.error(e);
    }
  }

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

  // Load custom logo if exists
  const savedLogo = localStorage.getItem('custom_company_logo');
  if (savedLogo) {
    updateLogoUI(savedLogo);
  }

  // Render initial static data first
  renderAll();
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

  const calcCapa = () => {
    const l1 = parseFloat(inputL1.value) || 0;
    const l2 = parseFloat(inputL2.value) || 0;
    const l3 = parseFloat(inputL3.value) || 0;
    const l4 = parseFloat(inputL4.value) || 0;
    const w = parseFloat(inputWidth.value) || 0;
    const h = parseFloat(inputHeight.value) || 0;
    const q = parseInt(inputQty.value) || 1;
    
    // Total Length = Sum of partitions/tanks lengths
    const totalLength = l1 + l2 + l3 + l4;
    const capa = totalLength * w * h * q;
    document.getElementById('statCapa').textContent = `${capa.toFixed(1)} M³`;
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
        localStorage.setItem('water_tank_panel_matrix', JSON.stringify(panelMatrix));
        renderSidePanelConfig();
        alert('측벽 매트릭스가 초기화되었습니다.');
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
        const updatedPart = { partNo, category, nameKo, nameEn, unit, price, weight, spec };
        
        if (item.id) {
          await db.collection('parts').doc(item.id).set(updatedPart, { merge: true });
        } else {
          // If fallback has no ID, query matching partNo
          const querySnap = await db.collection('parts').where('partNo', '==', item.partNo).get();
          if (!querySnap.empty) {
            await querySnap.docs[0].ref.set(updatedPart, { merge: true });
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
    document.getElementById('dbModalPartNo').disabled = true; // Lock part number key on edit
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

  // Save Panel Config Table Event
  document.getElementById('btnSaveConfigTable').addEventListener('click', () => {
    localStorage.setItem('water_tank_panel_matrix', JSON.stringify(panelMatrix));
    alert('판넬 구성 매크로 매트릭스 테이블이 로컬 저장소에 임시 저장되었습니다. (추후 파이어베이스 Firestore 연동 가능)');
    renderAll();
  });

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
}

function updateLogoUI(logoDataUrl) {
  const wrapper = document.getElementById('companyLogoWrapper');
  wrapper.innerHTML = `<img src="${logoDataUrl}" alt="Company Logo" class="company-logo-img">`;
}

// Generate BOM based on dimension configuration (mimicking Excel sheet logic roughly)
function generateDefaultBOMFromConfig() {
  const l1 = parseFloat(document.getElementById('tankLength1').value) || 0;
  const l2 = parseFloat(document.getElementById('tankLength2').value) || 0;
  const l3 = parseFloat(document.getElementById('tankLength3').value) || 0;
  const l4 = parseFloat(document.getElementById('tankLength4').value) || 0;
  const l = l1 + l2 + l3 + l4;
  
  const w = parseFloat(document.getElementById('tankWidth').value) || 1;
  const h = parseFloat(document.getElementById('tankHeight').value) || 1;
  const q = parseInt(document.getElementById('tankQty').value) || 1;
  const partitions = parseInt(document.getElementById('numPartition').value) || 0;
  const skidLen = parseFloat(document.getElementById('skidLength').value) || 0;
  
  const isInsulated = document.getElementById('insulationType').value === 'Insulated';
  const boltSpec = document.getElementById('boltMaterial').value;
  const isIntReinf = document.getElementById('reinfMethod').value === 'Internal';

  bomItems = [];

  // 1. PANELS
  // Roof Panels (Size * quantity)
  const roofQty = Math.ceil(l * w) * q;
  bomItems.push({ category: "Panels", partNo: "RF00TX", partName: "Roof Panel", qty: roofQty, unit: "PCS", spec: `${l}x${w}m Roof area`, price: 12.5, weight: 8.4 });
  
  // Manhole (typically 1 or 2 per tank)
  const manholeQty = (l * w > 10 ? 2 : 1) * q;
  bomItems.push({ category: "Panels", partNo: "MF00TX", partName: "Manhole Panel", qty: manholeQty, unit: "PCS", spec: "1x1m Manhole GRP Panel", price: 25.0, weight: 9.4 });
  
  // Base/Bottom Panels
  const baseQty = Math.ceil(l * w) * q;
  bomItems.push({ category: "Panels", partNo: "BF10BX", partName: "Bottom Panel", qty: baseQty, unit: "PCS", spec: "GRP Base panel 1x1m", price: 18.0, weight: 14.8 });

  // Side Panels (perimeter * height)
  const sideQty = Math.ceil(2 * (l + w) * h) * q;
  bomItems.push({ category: "Panels", partNo: isInsulated ? "SL15SI" : "SL15SX", partName: `Side Panel (${h}mH)`, qty: sideQty, unit: "PCS", spec: `Side panels for perimeter`, price: isInsulated ? 22.0 : 15.0, weight: isInsulated ? 21.0 : 17.5 });

  // Partition Panels (width * height * partitions count)
  if (partitions > 0) {
    const partQty = Math.ceil(w * h * partitions) * q;
    bomItems.push({ category: "Panels", partNo: "PF15MX", partName: "Partition Panel", qty: partQty, unit: "PCS", spec: `Partition panels`, price: 16.5, weight: 18.0 });
  }

  // 2. STEEL SKID
  if (skidLen > 0) {
    const skidPart = partsDb.find(p => p.partNo === "WFF-100U") || { nameKo: "100x50mm U Channel", price: 3.83, weight: 0 };
    bomItems.push({ category: "Steel Skid", partNo: "WFF-100U", partName: skidPart.nameKo || "100x50mm U Channel", qty: skidLen * q, unit: "M", spec: "HDG Skid Channel Frame", price: skidPart.price || 3.83, weight: 0 });
  }

  // 3. REINFORCEMENTS
  if (isIntReinf) {
    // Internal Tie rod / stay items
    const intQty = Math.ceil((l + w) * h * 4) * q;
    bomItems.push({ category: "Reinforcing", partNo: "WFB-0950SA4", partName: "Internal Support Rod (SS316)", qty: intQty, unit: "PCS", spec: "SS316 Internal reinforcement rod", price: 8.5, weight: 2.1 });
  } else {
    // External structure
    const extQty = Math.ceil((l + w) * 2 * h) * q;
    bomItems.push({ category: "Reinforcing", partNo: "WCA-1000Z", partName: "External HDG Corner Angle", qty: extQty, unit: "PCS", spec: "External steel bracket corner", price: 5.4, weight: 4.8 });
  }

  // 4. BOLTS AND NUTS
  // Roughly proportional estimate based on panel counts
  const totalPanels = roofQty + baseQty + sideQty + (partitions * w * h);
  const totalBolts = Math.ceil(totalPanels * 32) * q;
  const bPart = boltSpec.includes("SS316") ? 
    { partNo: "WBT-1480SA4", partName: "M14x80 SS316 Bolt/Nut", price: 0.85, weight: 0.12 } :
    { partNo: "WBT-1480RD", partName: "M14x80 HDG Bolt/Nut", price: 0.45, weight: 0.13 };
    
  bomItems.push({ category: "Bolts & Nuts", partNo: bPart.partNo, partName: bPart.partName, qty: totalBolts, unit: "PCS", spec: `Estimated bolts for GRP flanges`, price: bPart.price, weight: bPart.weight });

  // 5. ACCESSORIES
  // Ladder (Internal: SS316, External: HDG)
  bomItems.push({ category: "Accessories", partNo: "WLD-5000FI", partName: "Internal Ladder (SS316)", qty: q, unit: "SET", spec: "Internal water tank access ladder", price: 120, weight: 15.0 });
  bomItems.push({ category: "Accessories", partNo: "WLD-5000ZO", partName: "External Ladder (HDG)", qty: q, unit: "SET", spec: "External water tank access ladder", price: 85, weight: 22.0 });

  saveAndRender();
}

// Render Functions
function renderAll() {
  renderDbList();
  renderSidePanelConfig();
  renderBOM();
  renderCOST();
  renderWEIGHT();
  calculateWidgets();
}

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
      <td><strong>${item.partNo || ''}</strong></td>
      <td><span class="badge category-badge">${item.category || 'OTHER'}</span></td>
      <td>${item.nameKo || ''}</td>
      <td>${item.nameEn || ''}</td>
      <td>${item.unit || 'PCS'}</td>
      <td>${item.price || 0}</td>
      <td>${item.weight || 0}</td>
      <td>${item.spec || ''}</td>
      <td align="center">
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteDbItem(${origIndex}, event)" style="color:var(--neon-rose); font-size:14px; padding:6px;"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" align="center" style="color:var(--text-secondary); padding: 25px;">검색 결과가 없습니다.</td></tr>`;
  }

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

  // 1. Load panels database for select dropdowns
  const panelOptions = partsDb
    .filter(p => (p.category || '').toUpperCase().trim() === 'PANEL')
    .map(p => `<option value="${p.partNo}">${p.partNo}</option>`)
    .join('');

  // 2. Fetch specific panel matrix row indexes
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

  // Helper to make inline styled dropdown
  const makeSelectElement = (matrixIdx, field, currentVal) => {
    return `
      <select onchange="updateMatrix(${matrixIdx}, '${field}', this.value)" style="width:100%; border:1px solid #cbd5e1; border-radius:4px; padding:2px; font-size:10px; background:#fff; cursor:pointer; font-weight:500;">
        <option value="">- 선택 -</option>
        <option value="${currentVal}" selected>${currentVal}</option>
        ${panelOptions}
      </select>
    `;
  };

  // Build the layout grid matching the visual diagram:
  let html = `
    <div style="display: grid; grid-template-columns: 140px repeat(9, 1fr); border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fafbfc; position: relative;">
      
      <!-- Y-Axis Labels Column -->
      <div style="display: flex; flex-direction: column; border-right: 2px solid #cbd5e1; background: #f1f5f9;">
        <div style="height: 38px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; color:#475569;">Tank Height</div>
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff;">Roof Panel</div>
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff;">Manhole Panel</div>
        <div style="height: 380px; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 10px 0; font-size: 11px; font-weight: bold; color: #475569; border-bottom: 2px solid #cbd5e1; box-sizing: border-box; gap: 0;">
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">5H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">4.5H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">4H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">3.5H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">3H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">2.5H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">2H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">1.5H</div>
          <div style="height: 40px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">1H</div>
        </div>
        <!-- Bottom fixed layout tags -->
        <div style="height: 42px; border-bottom: 1px solid #cbd5e1; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff;">Bottom Panel</div>
        <div style="height: 42px; display:flex; align-items:center; padding-left:10px; font-size:11px; font-weight:bold; color:#475569; background: #fff;">Drain Panel</div>
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

    const configMap = {
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
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '4.5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x1.5m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m']
      },
      '5mH': {
        left: ['1x1m', '1x1m', '1x1m', '1x2m'],
        right: ['0.5mx1m', '0.5mx1m', '0.5mx1m', '0.5mx0.5m', '0.5mx0.5m']
      }
    };

    const currentConf = configMap[hGrade] || { left: [], right: [] };

    let leftColHtml = '';
    let totalLeftHeight = 0;
    // We render boxes from bottom to top, but design is column-reverse flex.
    currentConf.left.forEach((lbl) => {
      // Determine physical rendering height: 1x1m is 80px, 1x1.5m is 120px, 1x2m is 160px
      let boxHeight = 80;
      if (lbl === '1x1.5m') {
        boxHeight = 120;
      } else if (lbl === '1x2m') {
        boxHeight = 160;
      }
      totalLeftHeight += boxHeight;

      const cellVal1m = panelMatrix[s20Idx]?.heightGrades[hGrade] || '';
      leftColHtml += `
        <div style="background: #eff6ff; border: 1.5px solid #3b82f6; border-radius: 4px; padding: 4px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 3px; width: 100%; height: ${boxHeight}px;">
          <div style="font-size: 8px; font-weight: bold; color: #1e40af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lbl}</div>
          ${makeSelectElement(s20Idx, hGrade, cellVal1m)}
        </div>
      `;
    });
    // Add spacer placeholder to fill the rest of the 380px column height
    const leftRemaining = 380 - totalLeftHeight;
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
        <div style="background: #eff6ff; border: 1.5px solid #3b82f6; border-radius: 4px; padding: 2px 4px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; width: 100%; height: ${boxHeight}px; line-height: 1.1;">
          <div style="font-size: 8px; font-weight: bold; color: #1e40af; text-align: center;">${displayLabel}</div>
          ${makeSelectElement(s15Idx, hGrade, cellVal05)}
        </div>
      `;
    });
    // Add spacer placeholder to fill the rest of the 380px column height
    const rightRemaining = 380 - totalRightHeight;
    if (rightRemaining > 0) {
      rightColHtml += `<div style="height: ${rightRemaining}px; width: 100%;"></div>`;
    }

    // Flex container aligning left and right columns side-by-side
    // We add a background linear-gradient to act as horizontal grid reference lines at every 40px (which corresponds to 0.5m intervals).
    // The grid lines are thin dotted borders or light line breaks:
    const gridBackgroundStyle = `
      background-image: 
        linear-gradient(to top, #e2e8f0 1px, transparent 1px);
      background-size: 100% 40px;
    `;

    stackBoxesHtml = `
      <div style="display: flex; gap: 4px; width: 100%; box-sizing: border-box; justify-content: space-between; align-items: flex-start; height: 380px; ${gridBackgroundStyle}">
        <!-- Wall 1m (2/3 width) -->
        <div style="flex: 2; display: flex; flex-direction: column-reverse; gap: 4px; min-width: 0;">
          ${leftColHtml}
        </div>
        <!-- Wall 0.5m (1/3 width) -->
        <div style="flex: 1; display: flex; flex-direction: column-reverse; gap: 4px; min-width: 0;">
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
        <div style="flex: 1; min-height: 350px; display: flex; flex-direction: column-reverse; gap: 5px; padding: 8px 4px; justify-content: flex-start; align-items: center; border-bottom: 2px solid #cbd5e1; box-sizing: border-box;">
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
    // Auto-save changes back to localStorage
    localStorage.setItem('water_tank_panel_matrix', JSON.stringify(panelMatrix));
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
