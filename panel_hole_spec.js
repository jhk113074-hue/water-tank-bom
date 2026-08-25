// =============================================================================
// Panel Hole Spec (panel_hole_spec.js) -- 회사별 판넬 홀(Hole) 스펙 관리
// =============================================================================
// Foundational data layer for a future joint-type-based bolt engine (see the
// project plan's Phase 1 design). Records, per company preset, per exact
// panel code, AND per opening/cutout spec (개공사양), how many bolt holes
// exist:
//   - edges: top/bottom/left/right -- the seam holes used to bolt this panel
//     to whatever panel touches it on that side.
//   - face: nozzle/manhole/drain-style cutout holes on the panel's flat
//     plane, distinct from edge seam holes -- also split top/bottom/left/
//     right (same shape as edges), so the two are handled uniformly.
//
// WHY OPENING CODE MATTERS HERE: the base panel code alone (e.g. HAYOUNG's
// "GW-1010-A") does not identify a physical panel's hole layout, because for
// presets where the code doesn't embed the opening spec (codeEmbedsOpening:
// false -- see opening_code_util.js), the SAME base code is reused across
// matrix cells with different registered opening codes (openingGrades). Two
// panels sharing a base code but cut for different openings can have
// completely different hole counts. For presets where the opening IS
// embedded in the code (YSACC-style, e.g. "SF10SX"), the base/opening split
// already comes from OpeningCodeUtil.splitEmbeddedOpeningCode -- so the same
// (baseCode, openingCode) identity model covers both cases uniformly.
//
// PURE DATA LAYER: nothing in the existing BOM/costing/bolt-formula path
// reads this module. A future joint-counting bolt engine will consult it,
// falling back to today's R1/R05 holes-per-meter constants for any
// (baseCode, openingCode) pair that has no registered spec here (never
// guesses).
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_panel_hole_spec_v2";
  const LEGACY_STORAGE_KEY = "water_tank_panel_hole_spec_v1";
  const FIRESTORE_DOC = "panelHoleSpec";
  // Sentinel for "no opening code" -- deliberately avoids a leading/trailing
  // double-underscore, which Firestore rejects as a field name.
  const NO_OPENING_KEY = "NONE";

  // { byParty: { [presetId]: { panels: { "<baseCode>": { "<openingCode|__none__>": {
  //   edges: {top,bottom,left,right}, face: {count, note}
  // } } } } } }
  let state = null;
  let dbRef = null;
  const listeners = [];
  let selectedPartyId = null;

  function emptyState() {
    return { byParty: {} };
  }

  function getActivePartyId() {
    if (selectedPartyId) return selectedPartyId;
    if (global.selectedCustomerPresetId) return String(global.selectedCustomerPresetId);
    return "default";
  }

  function cleanCode(raw) {
    if (global.MoldGroupManager && typeof global.MoldGroupManager.cleanToPureBaseCode === 'function') {
      return global.MoldGroupManager.cleanToPureBaseCode(raw);
    }
    return String(raw || '').trim();
  }

  function openingKey(openingCode) {
    const c = String(openingCode || '').trim();
    return c ? c.toUpperCase() : NO_OPENING_KEY;
  }

  function toPositiveInt(v) {
    const n = parseInt(v, 10);
    return (!isNaN(n) && n >= 0) ? n : 0;
  }

  function normalisePanelSpec(spec) {
    const e = (spec && spec.edges) || {};
    const f = (spec && spec.face) || {};
    return {
      edges: {
        top: toPositiveInt(e.top),
        bottom: toPositiveInt(e.bottom),
        left: toPositiveInt(e.left),
        right: toPositiveInt(e.right)
      },
      face: {
        top: toPositiveInt(f.top),
        bottom: toPositiveInt(f.bottom),
        left: toPositiveInt(f.left),
        right: toPositiveInt(f.right),
        note: String(f.note || '').trim()
      }
    };
  }

  // Accepts either the new nested {openingKey: spec} shape or (for migrating
  // the old v1 flat shape, where a code mapped directly to one {edges, face}
  // spec) a bare spec object, which becomes the "no opening" entry.
  function normaliseOpeningMap(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const looksLikeBareSpec = ('edges' in raw) || ('face' in raw);
    if (looksLikeBareSpec) {
      return { [NO_OPENING_KEY]: normalisePanelSpec(raw) };
    }
    const out = {};
    Object.keys(raw).forEach(k => {
      out[openingKey(k === NO_OPENING_KEY ? '' : k)] = normalisePanelSpec(raw[k]);
    });
    return out;
  }

  function normalisePartyPanels(partyObj) {
    const rawPanels = (partyObj && partyObj.panels && typeof partyObj.panels === 'object') ? partyObj.panels : {};
    const panels = {};
    Object.keys(rawPanels).forEach(code => {
      const clean = cleanCode(code);
      if (!clean) return;
      panels[clean] = normaliseOpeningMap(rawPanels[code]);
    });
    return { panels };
  }

  function normalise(s) {
    if (!s || typeof s !== 'object') return emptyState();
    const byParty = {};
    if (s.byParty && typeof s.byParty === 'object') {
      Object.keys(s.byParty).forEach(pid => { byParty[pid] = normalisePartyPanels(s.byParty[pid]); });
    }
    return { byParty };
  }

  function load() {
    try {
      let raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw && global.localStorage) raw = global.localStorage.getItem(LEGACY_STORAGE_KEY);
      state = raw ? normalise(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.error("[PanelHoleSpec] localStorage 불러오기 실패:", e);
      state = emptyState();
    }
  }

  function ensure() {
    if (!state) load();
    return state;
  }

  function getPartyState(partyId) {
    const s = ensure();
    const pid = partyId || getActivePartyId();
    if (!s.byParty[pid]) s.byParty[pid] = { panels: {} };
    return s.byParty[pid];
  }

  function persist() {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[PanelHoleSpec] localStorage 저장 실패:", e);
    }
    if (dbRef) {
      dbRef.collection("settings").doc(FIRESTORE_DOC)
        .set({ state: state, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(err => console.warn("[PanelHoleSpec] Firestore 저장 실패 (localStorage에는 저장됨):", err));
    }
    listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
  }

  // -------------------------------------------------------------------------
  // Public API -- every panel identity is (baseCode, openingCode)
  // -------------------------------------------------------------------------

  // Returns { "<openingKey>": spec, ... } for one base code.
  function getOpeningMapForCode(panelCode, partyId) {
    const clean = cleanCode(panelCode).toUpperCase();
    const panels = getPartyState(partyId).panels;
    const key = Object.keys(panels).find(k => k.toUpperCase() === clean);
    return key ? panels[key] : {};
  }

  // Returns the full nested structure: { baseCode: { openingKey: spec } }
  function getPanelSpecs(partyId) {
    return getPartyState(partyId).panels;
  }

  // Returns null if this exact (baseCode, openingCode) has no registered
  // spec -- callers (a future joint-counting bolt engine) must fall back to
  // R1/R05, never guess.
  function getPanelSpec(panelCode, openingCode, partyId) {
    if (!panelCode) return null;
    const map = getOpeningMapForCode(panelCode, partyId);
    return map[openingKey(openingCode)] || null;
  }

  function setPanelSpec(panelCode, openingCode, spec, partyId) {
    const pState = getPartyState(partyId);
    const clean = cleanCode(panelCode);
    if (!clean) return false;
    let key = Object.keys(pState.panels).find(k => k.toUpperCase() === clean.toUpperCase());
    if (!key) { key = clean; pState.panels[key] = {}; }
    pState.panels[key][openingKey(openingCode)] = normalisePanelSpec(spec);
    persist();
    return true;
  }

  function removePanelSpec(panelCode, openingCode, partyId) {
    const pState = getPartyState(partyId);
    const clean = cleanCode(panelCode);
    const key = Object.keys(pState.panels).find(k => k.toUpperCase() === clean.toUpperCase());
    if (!key) return false;
    const oKey = openingKey(openingCode);
    if (!(oKey in pState.panels[key])) return false;
    delete pState.panels[key][oKey];
    if (Object.keys(pState.panels[key]).length === 0) delete pState.panels[key];
    persist();
    return true;
  }

  // Every registered (baseCode, openingCode, spec) triple for a party, flattened for table rendering.
  function listAllSpecs(partyId) {
    const panels = getPanelSpecs(partyId);
    const rows = [];
    Object.keys(panels).forEach(baseCode => {
      Object.keys(panels[baseCode]).forEach(oKey => {
        rows.push({
          baseCode,
          openingCode: oKey === NO_OPENING_KEY ? '' : oKey,
          spec: panels[baseCode][oKey]
        });
      });
    });
    return rows;
  }

  function setActiveParty(partyId) {
    selectedPartyId = partyId;
    renderUI();
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function syncFromFirestore(db) {
    dbRef = db || dbRef;
    if (!dbRef) return Promise.resolve();
    return dbRef.collection("settings").doc(FIRESTORE_DOC).get().then(doc => {
      if (!doc.exists) return;
      const remote = (doc.data() || {}).state;
      if (!remote) return;
      const remoteState = normalise(remote);
      const s = ensure();
      Object.keys(remoteState.byParty).forEach(pid => {
        if (!s.byParty[pid]) {
          s.byParty[pid] = remoteState.byParty[pid];
        } else {
          Object.keys(remoteState.byParty[pid].panels).forEach(code => {
            if (!s.byParty[pid].panels[code]) {
              s.byParty[pid].panels[code] = remoteState.byParty[pid].panels[code];
            } else {
              Object.keys(remoteState.byParty[pid].panels[code]).forEach(oKey => {
                if (!(oKey in s.byParty[pid].panels[code])) {
                  s.byParty[pid].panels[code][oKey] = remoteState.byParty[pid].panels[code][oKey];
                }
              });
            }
          });
        }
      });
      persist();
    }).catch(err => console.warn("[PanelHoleSpec] Firestore 불러오기 실패, localStorage만 사용:", err));
  }

  function init(db) {
    load();
    dbRef = db || null;
    renderUI();
    return syncFromFirestore(dbRef).then(() => { renderUI(); });
  }

  // -------------------------------------------------------------------------
  // Panel + opening variant listing (walks the live matrix, mirroring
  // mold_group_manager.js's getCompanyPanels, but also pulls each cell's
  // opening code via OpeningCodeUtil.getOpeningInfo so every distinct
  // (baseCode, openingCode) combination actually used in this preset's
  // matrix shows up as its own selectable row).
  // -------------------------------------------------------------------------
  function getCompanyPanelVariants(partyId) {
    const pid = partyId || getActivePartyId();
    const variantMap = new Map(); // "BASE::OPENING" -> {baseCode, openingCode}
    const custPresetList = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = custPresetList.find(c => String(c.id) === pid) || null;
    const uName = curCust ? String(curCust.name || '').toUpperCase() : '';
    const isHayoung = uName.includes('HAYOUNG') || pid === 'hayoung_spec';

    [0, 1, 2, 3, 4].forEach(optNum => {
      let matrix = null;
      if (typeof global.getCustomerMatrixStorage === 'function') {
        matrix = global.getCustomerMatrixStorage(pid, optNum);
      }
      if (!Array.isArray(matrix)) return;
      matrix.forEach(row => {
        if (!row || !row.heightGrades) return;
        Object.keys(row.heightGrades).forEach(hGrade => {
          const rawVal = row.heightGrades[hGrade];
          if (!rawVal) return;
          const info = (global.OpeningCodeUtil && typeof global.OpeningCodeUtil.getOpeningInfo === 'function')
            ? global.OpeningCodeUtil.getOpeningInfo(row, hGrade, curCust)
            : { code: rawVal, openingCode: null };
          const baseCode = cleanCode(info.code || rawVal);
          if (!baseCode) return;
          if (isHayoung && !baseCode.startsWith('G') && !baseCode.startsWith('H-')) return;
          const oCode = info.openingCode || '';
          const mapKey = baseCode.toUpperCase() + '::' + oCode.toUpperCase();
          if (!variantMap.has(mapKey)) {
            variantMap.set(mapKey, { baseCode, openingCode: oCode });
          }
        });
      });
    });

    // Mirror mold_group_manager.js's getCompanyPanels() second source: for
    // HAYOUNG-style presets the matrix often still carries legacy YSACC
    // fallback codes (e.g. "MF00TX") rather than the company's own G-/H-
    // prefixed codes, so also pull directly from parts_db.json by prefix.
    // These have no associated matrix row, so they have no opening code.
    if (isHayoung) {
      const partsDb = Array.isArray(global.partsDb) ? global.partsDb : [];
      partsDb.filter(p => p && p.partNo && (p.partNo.startsWith('G') || p.partNo.startsWith('H-')) && (p.category || '').toUpperCase() === 'PANEL')
        .forEach(p => {
          const baseCode = cleanCode(p.partNo);
          if (!baseCode) return;
          const mapKey = baseCode.toUpperCase() + '::';
          if (!variantMap.has(mapKey)) {
            variantMap.set(mapKey, { baseCode, openingCode: '' });
          }
        });
    }

    const variants = Array.from(variantMap.values());
    variants.sort((a, b) => a.baseCode.localeCompare(b.baseCode) || a.openingCode.localeCompare(b.openingCode));
    return variants;
  }

  let selectedBaseCode = null;
  let catalogCategoryFilter = 'ALL';
  let catalogSearchTerm = '';
  let customOpeningRows = []; // additional custom opening codes added in UI for current base code

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getBasePanelList(partyId) {
    const pid = partyId || getActivePartyId();
    const variants = getCompanyPanelVariants(pid);
    const baseMap = new Map(); // baseCode -> Set of openingCodes
    variants.forEach(v => {
      if (!baseMap.has(v.baseCode)) baseMap.set(v.baseCode, new Set());
      if (v.openingCode) baseMap.get(v.baseCode).add(v.openingCode);
    });

    // Also include base codes from registered specs
    const regPanels = getPanelSpecs(pid);
    Object.keys(regPanels).forEach(bCode => {
      if (!baseMap.has(bCode)) baseMap.set(bCode, new Set());
      Object.keys(regPanels[bCode]).forEach(oKey => {
        if (oKey !== NO_OPENING_KEY) baseMap.get(bCode).add(oKey);
      });
    });

    const list = Array.from(baseMap.keys()).map(baseCode => ({
      baseCode,
      knownOpenings: Array.from(baseMap.get(baseCode))
    }));
    list.sort((a, b) => a.baseCode.localeCompare(b.baseCode));
    return list;
  }

  function renderCompanyTabs() {
    const container = document.getElementById('panelHoleSpecCompanyTabsContainer');
    if (!container) return;
    const list = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const activeId = getActivePartyId();
    container.innerHTML = list.map(c => {
      const cid = String(c.id);
      const isActive = cid === activeId;
      return `<button type="button" onclick="PanelHoleSpec.setActiveParty('${cid}')"
        style="height:30px; padding:0 12px; font-size:11.5px; font-weight:700; border-radius:6px; cursor:pointer; margin-right:6px;
        background:${isActive ? '#0284c7' : '#ffffff'}; color:${isActive ? '#ffffff' : '#334155'}; border:${isActive ? 'none' : '1px solid #cbd5e1'};">
        ${escapeHtml(c.name)}
      </button>`;
    }).join('');
  }

  function setCatalogFilter(cat) {
    catalogCategoryFilter = cat;
    renderCompanyPanelCatalog();
  }

  function setCatalogSearch(term) {
    catalogSearchTerm = (term || '').trim().toUpperCase();
    renderCompanyPanelCatalog();
  }

  function renderCompanyPanelCatalog() {
    const container = document.getElementById('panelHoleSpecCatalogContainer');
    if (!container) return;
    const pid = getActivePartyId();
    const baseList = getBasePanelList(pid);

    if (baseList.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">판넬 코드를 찾지 못했습니다.</div>`;
      return;
    }

    if (!selectedBaseCode && baseList.length > 0) {
      selectedBaseCode = baseList[0].baseCode;
    }

    // Filter by category and search
    let filtered = baseList.filter(item => {
      const code = item.baseCode.toUpperCase();
      if (catalogSearchTerm && !code.includes(catalogSearchTerm)) return false;
      if (catalogCategoryFilter === 'ALL') return true;
      if (catalogCategoryFilter === 'BF') return code.startsWith('BF') || code.startsWith('KB');
      if (catalogCategoryFilter === 'SF') return code.startsWith('SF') || code.startsWith('KF');
      if (catalogCategoryFilter === 'PF') return code.startsWith('PF') || code.startsWith('PH') || code.startsWith('KL');
      if (catalogCategoryFilter === 'RF') return code.startsWith('RF') || code.startsWith('KR');
      if (catalogCategoryFilter === 'NF') return code.startsWith('NF') || code.startsWith('NH') || code.startsWith('NQ');
      if (catalogCategoryFilter === 'OTHER') {
        return !code.startsWith('BF') && !code.startsWith('SF') && !code.startsWith('PF') &&
               !code.startsWith('RF') && !code.startsWith('NF') && !code.startsWith('KB') &&
               !code.startsWith('KF') && !code.startsWith('KL') && !code.startsWith('KR');
      }
      return true;
    });

    let catFilterHtml = `
      <div style="margin-bottom:8px;">
        <input type="text" placeholder="🔍 판넬 검색 (예: BF10, SF15)" value="${escapeHtml(catalogSearchTerm)}" oninput="PanelHoleSpec.setCatalogSearch(this.value)"
          style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; font-size:11px; margin-bottom:6px;">
        <div style="display:flex; flex-wrap:wrap; gap:3px;">
          ${['ALL', 'BF', 'SF', 'PF', 'RF', 'NF', 'OTHER'].map(cat => {
            const isAct = catalogCategoryFilter === cat;
            const label = cat === 'ALL' ? '전체' : cat === 'OTHER' ? '기타/G-' : cat;
            return `<button type="button" onclick="PanelHoleSpec.setCatalogFilter('${cat}')"
              style="padding:2px 6px; font-size:10px; font-weight:700; border-radius:4px; cursor:pointer;
              background:${isAct ? '#0284c7' : '#f1f5f9'}; color:${isAct ? '#ffffff' : '#475569'}; border:${isAct ? 'none' : '1px solid #cbd5e1'};">
              ${label}
            </button>`;
          }).join('')}
        </div>
      </div>
    `;

    let listHtml = filtered.map(item => {
      const isSelected = item.baseCode === selectedBaseCode;
      const openingMap = getOpeningMapForCode(item.baseCode, pid);
      const regCount = Object.keys(openingMap).length;
      const regBadge = regCount > 0
        ? `<span style="font-size:9.5px; font-weight:800; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:1px 4px; border-radius:3px;">${regCount}개 등록</span>`
        : `<span style="font-size:9.5px; color:#94a3b8;">미등록</span>`;

      return `<div onclick="PanelHoleSpec.selectBaseCode('${escapeHtml(item.baseCode)}')"
        style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding:6px 8px; border-radius:5px; cursor:pointer; font-size:11px; margin-bottom:3px;
        background:${isSelected ? '#e0f2fe' : '#ffffff'}; border:${isSelected ? '1.5px solid #0284c7' : '1px solid #f1f5f9'};"
        onmouseover="if('${item.baseCode}' !== '${selectedBaseCode}') this.style.background='#f8fafc'"
        onmouseout="if('${item.baseCode}' !== '${selectedBaseCode}') this.style.background='#ffffff'">
        <div>
          <span style="font-family:monospace; font-weight:800; color:${isSelected ? '#0369a1' : '#1e293b'};">${escapeHtml(item.baseCode)}</span>
          <div style="font-size:9.5px; color:#64748b; margin-top:1px;">
            ${item.knownOpenings.length > 0 ? item.knownOpenings.map(o => `<span style="color:#a21caf; font-weight:700;">+${escapeHtml(o)}</span>`).join(' ') : '기본(개공없음)'}
          </div>
        </div>
        <div>${regBadge}</div>
      </div>`;
    }).join('');

    container.innerHTML = catFilterHtml + `<div style="max-height:360px; overflow-y:auto; padding-right:2px;">${listHtml}</div>`;
  }

  function selectBaseCode(baseCode) {
    selectedBaseCode = baseCode;
    customOpeningRows = [];
    renderCompanyPanelCatalog();
    renderForm();
  }

  function getOpeningDescription(oKey) {
    const map = {
      'NONE': '기본 판넬 (개공없음)',
      'HL': '상부 좌측 맨홀 (Top Left)',
      'HR': '상부 우측 맨홀 (Top Right)',
      'HX': '상부 중앙 맨홀 (Top Center)',
      'SL': '측면 좌측 노즐 (Side Left)',
      'SR': '측면 우측 노즐 (Side Right)',
      'SX': '측면 중앙 노즐 (Side Center)',
      'LX': '사다리 개공 (Ladder Access)',
      'LS': '사다리 특수 (Ladder Special)',
      'LR': '사다리 우측 (Ladder Right)',
      'LL': '하부 사다리 좌측 (Lower Ladder Left)',
      'ML': '중간 점검구 좌측 (Mid Left)',
      'MR': '중간 점검구 우측 (Mid Right)',
      'MX': '중간 점검구 중앙 (Mid Center)',
      'BP': '바닥 배수 드레인 (Bottom Drain)',
      'BX': '바닥 드레인 박스 (Drain Box)',
      'BBP': '바닥 보조 배수구 (Sub Drain)',
      'BPS': '바닥 특수 배수구 (Special Drain)',
      'HU15': 'Flat Quarter (HU15)',
      'TX': '통기구 개공 (Roof Vent)'
    };
    return map[oKey] || '개공 사양';
  }

  function getOpeningRowsForBaseCode(baseCode, partyId) {
    const pid = partyId || getActivePartyId();
    const cleanBase = cleanCode(baseCode).toUpperCase().trim();
    const openingSet = new Set(['NONE']);

    // 1. Pull exact opening codes defined in PANEL CONFIG (MATRIX) for this specific panel
    const variants = getCompanyPanelVariants(pid);
    variants.forEach(v => {
      if (cleanCode(v.baseCode).toUpperCase() === cleanBase && v.openingCode) {
        openingSet.add(v.openingCode.toUpperCase());
      }
    });

    // 2. Include registered openings from saved data for this baseCode
    const existingMap = getOpeningMapForCode(cleanBase, pid);
    Object.keys(existingMap).forEach(oKey => {
      openingSet.add(oKey.toUpperCase());
    });

    // 3. Include dynamically added custom opening rows
    customOpeningRows.forEach(c => openingSet.add(c.toUpperCase()));

    // Sort order: NONE first, then standard opening codes in user-specified priority order
    const order = [
      'NONE',
      'HL', 'HR', 'HX',
      'SL', 'SR', 'SX',
      'LX', 'LS', 'LR', 'LL',
      'ML', 'MR', 'MX',
      'BP', 'BX', 'BBP', 'BPS',
      'HU15', 'TX'
    ];

    return Array.from(openingSet).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }

  function addCustomOpeningPrompt() {
    const code = prompt('추가할 개공코드를 입력하세요 (예: HL, HR, HX, SX, SL, SR, LX, LS, LR, BP, BX 등):');
    if (!code || !code.trim()) return;
    const clean = code.trim().toUpperCase();
    if (!customOpeningRows.includes(clean)) {
      customOpeningRows.push(clean);
    }
    renderForm();
  }

  function copyFlangeFromDefaultToAll() {
    const topVal = document.getElementById('row_NONE_edge_top') ? document.getElementById('row_NONE_edge_top').value : '';
    const botVal = document.getElementById('row_NONE_edge_bottom') ? document.getElementById('row_NONE_edge_bottom').value : '';
    const leftVal = document.getElementById('row_NONE_edge_left') ? document.getElementById('row_NONE_edge_left').value : '';
    const rightVal = document.getElementById('row_NONE_edge_right') ? document.getElementById('row_NONE_edge_right').value : '';

    const openingRows = getOpeningRowsForBaseCode(selectedBaseCode, getActivePartyId());
    openingRows.forEach(oKey => {
      if (oKey === 'NONE') return;
      const t = document.getElementById(`row_${oKey}_edge_top`);
      const b = document.getElementById(`row_${oKey}_edge_bottom`);
      const l = document.getElementById(`row_${oKey}_edge_left`);
      const r = document.getElementById(`row_${oKey}_edge_right`);
      if (t) t.value = topVal;
      if (b) b.value = botVal;
      if (l) l.value = leftVal;
      if (r) r.value = rightVal;
    });

    const statusEl = document.getElementById('holeSpecCopyStatusMsg');
    if (statusEl) {
      statusEl.textContent = '✓ 기본 Flange 홀수(상/하/좌/우)를 모든 개공에 복사했습니다!';
      statusEl.style.display = 'inline';
      setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    }
  }

  function renderForm() {
    const container = document.getElementById('panelHoleSpecFormContainer');
    if (!container) return;
    const pid = getActivePartyId();
    const baseCode = selectedBaseCode || 'BF10';
    const openingRows = getOpeningRowsForBaseCode(baseCode, pid);

    let rowsHtml = openingRows.map(oKey => {
      const spec = getPanelSpec(baseCode, oKey === 'NONE' ? '' : oKey, pid) || normalisePanelSpec(null);
      const isDefault = (oKey === 'NONE');
      const label = isDefault ? 'NONE (기본 / 개공없음)' : oKey;
      const tagDesc = getOpeningDescription(oKey);

      return `
        <tr style="border-bottom:1px solid #e2e8f0; background:${isDefault ? '#f8fafc' : '#ffffff'};" data-opening-key="${escapeHtml(oKey)}">
          <td style="padding:6px 8px; vertical-align:middle;">
            <div style="font-family:monospace; font-weight:800; font-size:12px; color:${isDefault ? '#0284c7' : '#a21caf'};">
              ${escapeHtml(label)}
            </div>
            <span style="font-size:9.5px; color:#64748b;">${tagDesc}</span>
          </td>
          <!-- Flange부 (상,하,좌,우) -->
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_top" value="${spec.edges.top || ''}" placeholder="상"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_bottom" value="${spec.edges.bottom || ''}" placeholder="하"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_left" value="${spec.edges.left || ''}" placeholder="좌"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_right" value="${spec.edges.right || ''}" placeholder="우"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>

          <!-- 평면(Face) (상,하,좌,우) -->
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_top" value="${spec.face.top || ''}" placeholder="상"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_bottom" value="${spec.face.bottom || ''}" placeholder="하"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_left" value="${spec.face.left || ''}" placeholder="좌"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_right" value="${spec.face.right || ''}" placeholder="우"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>

          <!-- 비고 -->
          <td style="padding:4px 6px;">
            <input type="text" id="row_${oKey}_face_note" value="${escapeHtml(spec.face.note || '')}" placeholder="예: ${escapeHtml(tagDesc)}"
              style="width:100%; box-sizing:border-box; padding:3px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
          </td>

          <!-- 삭제 -->
          <td style="padding:4px; text-align:center;">
            <button type="button" onclick="PanelHoleSpec.clearRowSpec('${escapeHtml(baseCode)}', '${escapeHtml(oKey)}')" title="이 행 초기화/삭제"
              style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px;"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="background:#ffffff; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; padding-bottom:8px; border-bottom:1.5px solid #e2e8f0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:12px; font-weight:800; color:#334155;">선택된 기본 판넬코드:</label>
            <input type="text" id="holeSpecBaseCodeInput" value="${escapeHtml(baseCode)}" onchange="PanelHoleSpec.selectBaseCode(this.value)"
              style="font-family:monospace; font-weight:900; font-size:13px; color:#0284c7; border:2px solid #0284c7; border-radius:6px; padding:4px 10px; width:140px; background:#f0f9ff;">
            <span style="font-size:11px; color:#64748b;">(BP/BX/SX 등 모든 개공 사양을 아래 표에서 <b>동시에 입력</b>)</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" onclick="PanelHoleSpec.copyFlangeFromDefaultToAll()" class="btn btn-sm"
              style="background:#f0fdf4; color:#15803d; border:1.5px solid #86efac; font-weight:700; font-size:11px; padding:4px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-copy"></i> 📋 기본 Flange값을 모든 개공(BP/BX 등)에 복사
            </button>
            <button type="button" onclick="PanelHoleSpec.addCustomOpeningPrompt()" class="btn btn-sm"
              style="background:#fdf4ff; color:#a21caf; border:1.5px solid #f0abfc; font-weight:700; font-size:11px; padding:4px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-plus"></i> 개공코드 추가
            </button>
            <button type="button" onclick="PanelHoleSpec.saveAllFromForm()" class="btn btn-sm btn-primary"
              style="background:#0284c7; color:#ffffff; font-weight:800; font-size:11.5px; padding:5px 14px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(2,132,199,0.2);">
              <i class="fa-solid fa-floppy-disk"></i> 💾 모든 개공 스펙 일괄 저장
            </button>
          </div>
        </div>

        <div id="holeSpecCopyStatusMsg" style="display:none; font-size:11px; font-weight:800; color:#15803d; background:#dcfce7; border:1px solid #86efac; padding:3px 8px; border-radius:4px; margin-bottom:8px;"></div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:11.5px; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
            <thead>
              <tr style="background:#e2e8f0; border-bottom:1px solid #cbd5e1;">
                <th rowspan="2" style="padding:6px 8px; text-align:left; width:130px; font-weight:800; color:#334155;">개공 구분 (사양)</th>
                <th colspan="4" style="padding:4px 6px; text-align:center; background:#e0f2fe; color:#0369a1; font-weight:800; border-left:1px solid #cbd5e1; border-right:1px solid #cbd5e1;">
                  🔩 Flange부 홀수 (판넬 플랜지 접합)
                </th>
                <th colspan="4" style="padding:4px 6px; text-align:center; background:#fae8ff; color:#86198f; font-weight:800; border-right:1px solid #cbd5e1;">
                  평면(Face) 홀수 (노즐/맨홀/드레인 개공)
                </th>
                <th rowspan="2" style="padding:6px 8px; text-align:left; font-weight:800; color:#334155;">비고 (Note)</th>
                <th rowspan="2" style="padding:6px 4px; text-align:center; width:30px;"></th>
              </tr>
              <tr style="background:#f1f5f9; border-bottom:2px solid #94a3b8;">
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px; border-left:1px solid #cbd5e1;">상</th>
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px;">하</th>
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px;">좌</th>
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px; border-right:1px solid #cbd5e1;">우</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px;">상</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px;">하</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px;">좌</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px; border-right:1px solid #cbd5e1;">우</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function saveAllFromForm() {
    const baseCode = (selectedBaseCode || (document.getElementById('holeSpecBaseCodeInput') ? document.getElementById('holeSpecBaseCodeInput').value : '')).trim();
    if (!baseCode) return;
    const pid = getActivePartyId();
    const openingRows = getOpeningRowsForBaseCode(baseCode, pid);

    let savedCount = 0;
    openingRows.forEach(oKey => {
      const topE = document.getElementById(`row_${oKey}_edge_top`);
      const botE = document.getElementById(`row_${oKey}_edge_bottom`);
      const leftE = document.getElementById(`row_${oKey}_edge_left`);
      const rightE = document.getElementById(`row_${oKey}_edge_right`);

      const topF = document.getElementById(`row_${oKey}_face_top`);
      const botF = document.getElementById(`row_${oKey}_face_bottom`);
      const leftF = document.getElementById(`row_${oKey}_face_left`);
      const rightF = document.getElementById(`row_${oKey}_face_right`);
      const noteF = document.getElementById(`row_${oKey}_face_note`);

      const hasAnyInput = (topE && topE.value !== '') || (botE && botE.value !== '') ||
                          (leftE && leftE.value !== '') || (rightE && rightE.value !== '') ||
                          (topF && topF.value !== '') || (botF && botF.value !== '') ||
                          (leftF && leftF.value !== '') || (rightF && rightF.value !== '') ||
                          (noteF && noteF.value.trim() !== '');

      const oCode = (oKey === 'NONE') ? '' : oKey;

      if (hasAnyInput) {
        const spec = {
          edges: {
            top: topE ? topE.value : 0,
            bottom: botE ? botE.value : 0,
            left: leftE ? leftE.value : 0,
            right: rightE ? rightE.value : 0
          },
          face: {
            top: topF ? topF.value : 0,
            bottom: botF ? botF.value : 0,
            left: leftF ? leftF.value : 0,
            right: rightF ? rightF.value : 0,
            note: noteF ? noteF.value : ''
          }
        };
        setPanelSpec(baseCode, oCode, spec, pid);
        savedCount++;
      } else {
        removePanelSpec(baseCode, oCode, pid);
      }
    });

    renderUI();

    const statusEl = document.getElementById('holeSpecCopyStatusMsg');
    if (statusEl) {
      statusEl.textContent = `✓ [${baseCode}]의 ${savedCount}개 개공 스펙이 성공적으로 저장되었습니다!`;
      statusEl.style.display = 'inline';
      setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    }
  }

  function clearRowSpec(baseCode, oKey) {
    const pid = getActivePartyId();
    const oCode = (oKey === 'NONE') ? '' : oKey;
    removePanelSpec(baseCode, oCode, pid);
    const customIdx = customOpeningRows.indexOf(oKey);
    if (customIdx !== -1) customOpeningRows.splice(customIdx, 1);
    renderUI();
  }

  function loadVariantIntoForm(baseCode, openingCode) {
    selectBaseCode(baseCode);
  }

  function updateCombinedPreview() {
    // Kept for backward compatibility
  }

  function saveFromForm() {
    saveAllFromForm();
  }

  function deleteFromForm() {
    if (!selectedBaseCode) return;
    const pid = getActivePartyId();
    const existingMap = getOpeningMapForCode(selectedBaseCode, pid);
    Object.keys(existingMap).forEach(oKey => {
      removePanelSpec(selectedBaseCode, oKey === 'NONE' ? '' : oKey, pid);
    });
    renderUI();
  }

  function renderRegisteredTable() {
    const container = document.getElementById('panelHoleSpecTableContainer');
    if (!container) return;
    const pid = getActivePartyId();
    const rows = listAllSpecs(pid);

    if (rows.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">아직 등록된 홀 스펙이 없습니다.</div>`;
      return;
    }

    rows.sort((a, b) => a.baseCode.localeCompare(b.baseCode) || a.openingCode.localeCompare(b.openingCode));

    let html = `<table style="width:100%; border-collapse:collapse; font-size:11.5px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th rowspan="2" style="padding:6px 8px; text-align:left; border-bottom:2px solid #334155;">판넬코드</th>
          <th rowspan="2" style="padding:6px 8px; text-align:left; border-bottom:2px solid #334155;">개공코드</th>
          <th colspan="4" style="padding:4px 8px; text-align:center; color:#0284c7; border-bottom:1px solid #cbd5e1;">Flange부</th>
          <th colspan="4" style="padding:4px 8px; text-align:center; color:#a21caf; border-bottom:1px solid #cbd5e1;">평면(Face)</th>
          <th rowspan="2" style="padding:6px 8px; text-align:left; border-bottom:2px solid #334155;">비고</th>
          <th rowspan="2" style="border-bottom:2px solid #334155;"></th>
        </tr>
        <tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
          <th style="padding:4px 6px; text-align:center;">상</th>
          <th style="padding:4px 6px; text-align:center;">하</th>
          <th style="padding:4px 6px; text-align:center;">좌</th>
          <th style="padding:4px 6px; text-align:center;">우</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">상</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">하</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">좌</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">우</th>
        </tr>
      </thead><tbody>`;
    rows.forEach(r => {
      html += `<tr style="border-bottom:1px solid #e2e8f0; cursor:pointer;" onclick="PanelHoleSpec.selectBaseCode('${escapeHtml(r.baseCode)}')">
        <td style="padding:5px 8px; font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(r.baseCode)}</td>
        <td style="padding:5px 8px; font-family:monospace; color:#a21caf; font-weight:700;">${r.openingCode ? escapeHtml(r.openingCode) : '<span style="color:#94a3b8; font-weight:400;">기본(NONE)</span>'}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.top}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.bottom}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.left}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.right}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.top}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.bottom}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.left}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.right}</td>
        <td style="padding:5px 8px; color:#64748b; font-size:10.5px;">${escapeHtml(r.spec.face.note || '')}</td>
        <td style="padding:5px 8px; text-align:right;"><span onclick="event.stopPropagation(); PanelHoleSpec.removePanelSpec('${escapeHtml(r.baseCode)}', '${escapeHtml(r.openingCode)}', '${pid}'); PanelHoleSpec.renderUI();" style="cursor:pointer; color:#dc2626; font-weight:700;">삭제</span></td>
      </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  function renderUI() {
    renderCompanyTabs();
    renderCompanyPanelCatalog();
    renderForm();
    renderRegisteredTable();
  }

  global.PanelHoleSpec = {
    init,
    getActivePartyId,
    setActiveParty,
    getPanelSpecs,
    getPanelSpec,
    setPanelSpec,
    removePanelSpec,
    listAllSpecs,
    getCompanyPanelVariants,
    getBasePanelList,
    onChange,
    renderUI,
    selectBaseCode,
    setCatalogFilter,
    setCatalogSearch,
    addCustomOpeningPrompt,
    copyFlangeFromDefaultToAll,
    saveAllFromForm,
    clearRowSpec,
    loadVariantIntoForm,
    updateCombinedPreview,
    saveFromForm,
    deleteFromForm
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { renderUI(); });
    } else {
      setTimeout(renderUI, 0);
    }
  }
})(typeof window !== 'undefined' ? window : this);
