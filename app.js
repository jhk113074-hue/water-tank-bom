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
  // Bind events immediately so tabs work even if DB loading takes time
  setupEventListeners();

  // Try to load saved matrix, else use default
  const savedMatrix = localStorage.getItem('water_tank_panel_matrix');
  if (savedMatrix) {
    try {
      panelMatrix = JSON.parse(savedMatrix);
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

  // Load Firebase database asynchronously in the background
  try {
    await loadPartsDatabase();
    renderAll();
  } catch (err) {
    console.error("Async DB load failed:", err);
  }
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

  // DB Master search filter binding on the new tab input
  const dbTabSearchInput = document.getElementById('dbTabSearchInput');
  if (dbTabSearchInput) {
    dbTabSearchInput.addEventListener('input', (e) => {
      renderDbList(e.target.value);
    });
  }

  // DB Master Edit / Add Modal Bindings
  const dbModal = document.getElementById('dbEditModal');
  const btnDbTabAdd = document.getElementById('btnDbTabAdd');
  const btnDbModalClose = document.getElementById('dbModalClose');
  const btnDbModalCancel = document.getElementById('btnDbModalCancel');
  const btnDbModalSave = document.getElementById('btnDbModalSave');

  let currentEditPartIndex = -1; // -1 means adding new

  if (btnDbTabAdd) {
    btnDbTabAdd.addEventListener('click', () => {
      currentEditPartIndex = -1;
      document.getElementById('dbModalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> 신규 부품 마스터 등록';
      document.getElementById('dbModalPartNo').value = '';
      document.getElementById('dbModalPartNo').disabled = false;
      document.getElementById('dbModalNameKo').value = '';
      document.getElementById('dbModalNameEn').value = '';
      document.getElementById('dbModalUnit').value = 'PCS';
      document.getElementById('dbModalPrice').value = '0';
      document.getElementById('dbModalWeight').value = '0';
      document.getElementById('dbModalSpec').value = '';
      dbModal.classList.add('active');
    });
  }

  const closeDbModal = () => dbModal.classList.remove('active');
  if (btnDbModalClose) btnDbModalClose.addEventListener('click', closeDbModal);
  if (btnDbModalCancel) btnDbModalCancel.addEventListener('click', closeDbModal);

  btnDbModalSave.addEventListener('click', async () => {
    const partNo = document.getElementById('dbModalPartNo').value.trim();
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
        const newPart = { partNo, nameKo, nameEn, unit, price, weight, spec };
        await newDocRef.set(newPart);
        
        // Push with new ID to local memory array
        newPart.id = newDocRef.id;
        partsDb.unshift(newPart);
      } else {
        // Update in Firestore
        const item = partsDb[currentEditPartIndex];
        const updatedPart = { partNo, nameKo, nameEn, unit, price, weight, spec };
        
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
    document.getElementById('dbModalNameKo').value = item.nameKo || '';
    document.getElementById('dbModalNameEn').value = item.nameEn || '';
    document.getElementById('dbModalUnit').value = item.unit || 'PCS';
    document.getElementById('dbModalPrice').value = item.price || 0;
    document.getElementById('dbModalWeight').value = item.weight || 0;
    document.getElementById('dbModalSpec').value = item.spec || '';
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
  renderPanelConfig();
  renderBOM();
  renderCOST();
  renderWEIGHT();
  calculateWidgets();
}

// Render Master Database List
function renderDbList(filterQuery = '') {
  const tbody = document.getElementById('tbodyPartsMasterDbList');
  if (!tbody) return;
  tbody.innerHTML = '';

  const query = filterQuery.toLowerCase().trim();
  
  partsDb.forEach((item, index) => {
    // Search filter check
    if (query) {
      const match = (item.partNo || '').toLowerCase().includes(query) ||
                    (item.nameKo || '').toLowerCase().includes(query) ||
                    (item.nameEn || '').toLowerCase().includes(query) ||
                    (item.spec || '').toLowerCase().includes(query);
      if (!match) return;
    }

    const tr = document.createElement('tr');
    tr.setAttribute('onclick', `openEditDbModal(${index})`);
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
        <i class="fa-solid fa-trash-can action-icon" onclick="deleteDbItem(${index}, event)" style="color:var(--neon-rose); font-size:14px; padding:6px;"></i>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" align="center" style="color:var(--text-secondary); padding: 25px;">검색 결과가 없습니다.</td></tr>`;
  }
}

// Render Panel Matrix Config Table
function renderPanelConfig() {
  const tbody = document.getElementById('tbodyPanelConfig');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (panelMatrix.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" align="center" style="color:var(--text-secondary)">판넬 구성 매크로 데이터가 없습니다. panel_matrix.json 파일을 확인해 주세요.</td></tr>`;
    return;
  }

  panelMatrix.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.position}</strong></td>
      <td><input type="text" value="${row.item}" onchange="updateMatrix(${index}, 'item', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['1mH'] || ''}" onchange="updateMatrix(${index}, '1mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['1.5mH'] || ''}" onchange="updateMatrix(${index}, '1.5mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['2mH'] || ''}" onchange="updateMatrix(${index}, '2mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['2.5mH'] || ''}" onchange="updateMatrix(${index}, '2.5mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['3mH'] || ''}" onchange="updateMatrix(${index}, '3mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['3.5mH'] || ''}" onchange="updateMatrix(${index}, '3.5mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['4mH'] || ''}" onchange="updateMatrix(${index}, '4mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['4.5mH'] || ''}" onchange="updateMatrix(${index}, '4.5mH', this.value)"></td>
      <td><input type="text" value="${row.heightGrades['5mH'] || ''}" onchange="updateMatrix(${index}, '5mH', this.value)"></td>
    `;
    tbody.appendChild(tr);
  });
}

// Update Panel Matrix Cell
window.updateMatrix = function(index, field, value) {
  if (panelMatrix[index]) {
    if (field === 'item') {
      panelMatrix[index].item = value;
    } else {
      panelMatrix[index].heightGrades[field] = value;
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
    ["ALWATANI GRP TANK BOM GENERATOR REPORT"],
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
