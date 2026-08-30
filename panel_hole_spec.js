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

  function isCodeBelongingToParty(code, pid) {
    if (!code) return false;
    const u = cleanCode(code).toUpperCase();
    const p = String(pid || '').toLowerCase();
    const isAlmuftah = p === 'almuftah' || p.includes('almuftah');
    const isHayoung = p.includes('hayoung');
    const isMnt = p.includes('mnt');
    const isDefault = p === 'default' || p.includes('ysacc') || p.includes('watani');

    if (isAlmuftah) {
      return u.startsWith('K') || u.startsWith('LM') || u.startsWith('TM') || u.startsWith('LP');
    }
    if (isHayoung) {
      return u.startsWith('GW-') || u.startsWith('GF-') || u.startsWith('GP-') || u.startsWith('KM-') || u.startsWith('G-') || u.startsWith('H-');
    }
    if (isMnt) {
      return u.endsWith('M') || u.endsWith('S') || u.endsWith('L') || u.endsWith('T') || u.startsWith('DN') || u.startsWith('RH') || u.startsWith('RQ');
    }
    if (isDefault) {
      if (u.endsWith('M') || u.endsWith('S') || u.endsWith('L') || u.endsWith('T') || u.startsWith('DN') || u.startsWith('RH') || u.startsWith('RQ')) return false;
      if (u.startsWith('K') || u.startsWith('LM') || u.startsWith('TM') || u.startsWith('LP')) return false;
      if (u.startsWith('GW-') || u.startsWith('GF-') || u.startsWith('GP-') || u.startsWith('KM-') || u.startsWith('G-') || u.startsWith('H-')) return false;
      return u.startsWith('SF') || u.startsWith('SL') || u.startsWith('ST') || u.startsWith('BF') || u.startsWith('PF') || u.startsWith('PH') || u.startsWith('RF') || u.startsWith('MF') || u.startsWith('DF') || u.startsWith('NH') || u.startsWith('NQ') || u === 'KH25' || u === 'KH45';
    }
    return true;
  }

  function normalisePartyPanels(partyObj, pid) {
    const rawPanels = (partyObj && partyObj.panels && typeof partyObj.panels === 'object') ? partyObj.panels : {};
    const panels = {};
    Object.keys(rawPanels).forEach(code => {
      const clean = cleanCode(code);
      if (!clean) return;
      if (pid && !isCodeBelongingToParty(clean, pid)) return;
      panels[clean] = normaliseOpeningMap(rawPanels[code]);
    });
    return { panels };
  }

  function normalise(s) {
    if (!s || typeof s !== 'object') return emptyState();
    const byParty = {};
    if (s.byParty && typeof s.byParty === 'object') {
      Object.keys(s.byParty).forEach(pid => { byParty[pid] = normalisePartyPanels(s.byParty[pid], pid); });
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

  function getDefaultPartyPanels(partyId) {
    const panels = {};
    const pid = String(partyId || '').toLowerCase();
    const partsDb = Array.isArray(global.partsDb) ? global.partsDb : [];

    const isAlmuftah = pid === 'almuftah' || pid.includes('almuftah');
    const isHayoung = pid.includes('hayoung');
    const isMnt = pid.includes('mnt');
    const isDefault = pid === 'default' || pid.includes('ysacc') || pid.includes('watani');

    let targetPanels = [];

    if (isAlmuftah) {
      targetPanels = partsDb.filter(p => p && p.partNo && (p.partNo.startsWith('K') || p.partNo.startsWith('LM') || p.partNo.startsWith('TM') || p.partNo.startsWith('LP')) && (p.category || '').toUpperCase() === 'PANEL');
    } else if (isHayoung) {
      targetPanels = partsDb.filter(p => p && p.partNo && (p.partNo.startsWith('GW-') || p.partNo.startsWith('GF-') || p.partNo.startsWith('GP-') || p.partNo.startsWith('KM-') || p.partNo.startsWith('G-') || p.partNo.startsWith('H-')) && (p.category || '').toUpperCase() === 'PANEL');
    } else if (isMnt) {
      targetPanels = partsDb.filter(p => p && p.partNo && (p.partNo.endsWith('M') || p.partNo.endsWith('S') || p.partNo.endsWith('L') || p.partNo.endsWith('T') || p.partNo.startsWith('DN') || p.partNo.startsWith('RH') || p.partNo.startsWith('RQ')) && (p.category || '').toUpperCase() === 'PANEL');
    } else if (isDefault) {
      targetPanels = partsDb.filter(p => {
        if (!p || !p.partNo || (p.category || '').toUpperCase() !== 'PANEL') return false;
        const u = p.partNo.toUpperCase();
        if (u.endsWith('M') || u.endsWith('S') || u.startsWith('DN') || u.startsWith('RH') || u.startsWith('RQ')) return false;
        if (u.startsWith('K') || u.startsWith('LM') || u.startsWith('TM') || u.startsWith('LP')) return false;
        if (u.startsWith('GW-') || u.startsWith('GF-') || u.startsWith('GP-') || u.startsWith('KM-') || u.startsWith('G-') || u.startsWith('H-')) return false;
        return u.startsWith('SF') || u.startsWith('SL') || u.startsWith('ST') || u.startsWith('BF') || u.startsWith('PF') || u.startsWith('PH') || u.startsWith('RF') || u.startsWith('MF') || u.startsWith('DF') || u.startsWith('NH') || u.startsWith('NQ') || u === 'KH25' || u === 'KH45';
      });
    }

    targetPanels.forEach(p => {
      const w = p.width || 1000;
      const l = p.length || 1000;
      let topHoles = 8, botHoles = 8, leftHoles = 8, rightHoles = 8;
      if (w === 1000 && l === 1000) { topHoles = 8; botHoles = 8; leftHoles = 8; rightHoles = 8; }
      else if (w === 1000 && l === 1500) { topHoles = 8; botHoles = 8; leftHoles = 12; rightHoles = 12; }
      else if (w === 1000 && l === 2000) { topHoles = 8; botHoles = 8; leftHoles = 16; rightHoles = 16; }
      else if (w === 1000 && l === 500) { topHoles = 8; botHoles = 8; leftHoles = 4; rightHoles = 4; }
      else if (w === 500 && l === 500) { topHoles = 4; botHoles = 4; leftHoles = 4; rightHoles = 4; }

      const openings = ['NONE'];
      const u = p.partNo.toUpperCase();
      if (u.includes('F') || u.includes('W') || u.includes('M') || u.includes('S') || u.includes('B') || u.includes('N') || u.includes('P')) {
        openings.push('SX', 'SL', 'SR', 'LX', 'HX', 'BP', 'BX');
      }

      panels[p.partNo] = {};
      openings.forEach(o => {
        panels[p.partNo][o] = {
          edges: { top: topHoles, bottom: botHoles, left: leftHoles, right: rightHoles },
          face: { top: 0, bottom: 0, left: 0, right: 0, note: '' }
        };
      });
    });

    return panels;
  }

  function getPartyState(partyId) {
    const s = ensure();
    const pid = partyId || getActivePartyId();
    if (!s.byParty[pid]) {
      if ((pid === 'watani' || pid === 'watani_spec') && (s.byParty['watani'] || s.byParty['watani_spec'])) {
        s.byParty[pid] = s.byParty['watani'] || s.byParty['watani_spec'];
      } else if ((pid === 'mnt' || pid === 'mnt_spec') && (s.byParty['mnt'] || s.byParty['mnt_spec'])) {
        s.byParty[pid] = s.byParty['mnt'] || s.byParty['mnt_spec'];
      } else if ((pid === 'default' || pid === 'ysacc') && (s.byParty['default'] || s.byParty['ysacc'])) {
        s.byParty[pid] = s.byParty['default'] || s.byParty['ysacc'];
      } else {
        s.byParty[pid] = { panels: {} };
      }
    }
    if (Object.keys(s.byParty[pid].panels).length === 0) {
      s.byParty[pid].panels = getDefaultPartyPanels(pid);
    }
    return s.byParty[pid];
  }

  function persist() {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[PanelHoleSpec] localStorage 저장 실패:", e);
    }
    if (dbRef) {
      const payload = { updatedAt: new Date().toISOString() };
      Object.keys(state.byParty || {}).forEach(pid => {
        payload['party_' + pid] = JSON.stringify(state.byParty[pid]);
      });
      dbRef.collection("settings").doc(FIRESTORE_DOC)
        .set(payload, { merge: true })
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
    selectedBaseCode = null;
    customOpeningRows = [];
    renderUI();
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function syncFromFirestore(db) {
    dbRef = db || dbRef;
    if (!dbRef) return Promise.resolve();
    return dbRef.collection("settings").doc(FIRESTORE_DOC).get().then(doc => {
      if (!doc.exists) return;
      const data = doc.data() || {};
      const remoteState = { byParty: {} };
      
      Object.keys(data).forEach(k => {
        if (k.startsWith('party_')) {
          const pid = k.replace('party_', '');
          try {
            remoteState.byParty[pid] = JSON.parse(data[k]);
          } catch(e) {}
        }
      });

      if (Object.keys(remoteState.byParty).length === 0) {
        const legacy = data.jsonState ? JSON.parse(data.jsonState) : data.state;
        if (legacy) Object.assign(remoteState, normalise(legacy));
      }

      const cleanRemote = normalise(remoteState);
      const s = ensure();
      Object.keys(cleanRemote.byParty).forEach(pid => {
        if (!s.byParty[pid]) {
          s.byParty[pid] = cleanRemote.byParty[pid];
        } else {
          Object.keys(cleanRemote.byParty[pid].panels).forEach(code => {
            if (!s.byParty[pid].panels[code]) {
              s.byParty[pid].panels[code] = cleanRemote.byParty[pid].panels[code];
            } else {
              Object.keys(cleanRemote.byParty[pid].panels[code]).forEach(oKey => {
                if (!(oKey in s.byParty[pid].panels[code])) {
                  s.byParty[pid].panels[code][oKey] = cleanRemote.byParty[pid].panels[code][oKey];
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
  // Panel + opening variant listing
  // -------------------------------------------------------------------------
  function getCompanyPanelVariants(partyId) {
    const pid = partyId || getActivePartyId();
    const variantMap = new Map(); // "BASE::OPENING" -> {baseCode, openingCode}
    const custPresetList = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = custPresetList.find(c => String(c.id) === pid) || null;

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
          if (!isCodeBelongingToParty(baseCode, pid)) return;
          const oCode = info.openingCode || '';
          const mapKey = baseCode.toUpperCase() + '::' + oCode.toUpperCase();
          if (!variantMap.has(mapKey)) {
            variantMap.set(mapKey, { baseCode, openingCode: oCode });
          }
        });
      });
    });

    // Also pull directly from parts_db.json by company prefix filter
    const partsDb = Array.isArray(global.partsDb) ? global.partsDb : [];
    partsDb.filter(p => p && p.partNo && (p.category || '').toUpperCase() === 'PANEL' && isCodeBelongingToParty(p.partNo, pid))
      .forEach(p => {
        const baseCode = cleanCode(p.partNo);
        if (!baseCode) return;
        const mapKey = baseCode.toUpperCase() + '::';
        if (!variantMap.has(mapKey)) {
          variantMap.set(mapKey, { baseCode, openingCode: '' });
        }
      });

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
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">No panel codes found.</div>`;
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
      if (catalogCategoryFilter === 'SF') return code.startsWith('SF') || code.startsWith('KF') || code.startsWith('KL') || code.startsWith('LM') || code.startsWith('TM');
      if (catalogCategoryFilter === 'PF') return code.startsWith('PF') || code.startsWith('PH') || code.startsWith('LP') || code.startsWith('LPH');
      if (catalogCategoryFilter === 'RF') return code.startsWith('RF') || code.startsWith('KR') || code.startsWith('KT') || code.startsWith('KM');
      if (catalogCategoryFilter === 'NF') return code.startsWith('NF') || code.startsWith('NH') || code.startsWith('NQ');
      if (catalogCategoryFilter === 'OTHER') {
        return !code.startsWith('BF') && !code.startsWith('SF') && !code.startsWith('PF') &&
               !code.startsWith('RF') && !code.startsWith('NF') && !code.startsWith('KB') &&
               !code.startsWith('KF') && !code.startsWith('KL') && !code.startsWith('LM') &&
               !code.startsWith('TM') && !code.startsWith('LP') && !code.startsWith('LPH') &&
               !code.startsWith('KR') && !code.startsWith('KT') && !code.startsWith('KM');
      }
      return true;
    });

    let catFilterHtml = `
      <div style="margin-bottom:8px;">
        <input type="text" placeholder="🔍 Search Panel (e.g. BF10, SF15)" value="${escapeHtml(catalogSearchTerm)}" oninput="PanelHoleSpec.setCatalogSearch(this.value)"
          style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; font-size:11px; margin-bottom:6px;">
        <div style="display:flex; flex-wrap:wrap; gap:3px;">
          ${['ALL', 'BF', 'SF', 'PF', 'RF', 'NF', 'OTHER'].map(cat => {
            const isAct = catalogCategoryFilter === cat;
            const label = cat === 'ALL' ? 'ALL' : cat === 'OTHER' ? 'Other/G-' : cat;
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
        ? `<span style="font-size:9.5px; font-weight:800; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:1px 4px; border-radius:3px;">${regCount} Registered</span>`
        : `<span style="font-size:9.5px; color:#94a3b8;">Not Registered</span>`;

      return `<div onclick="PanelHoleSpec.selectBaseCode('${escapeHtml(item.baseCode)}')"
        style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding:6px 8px; border-radius:5px; cursor:pointer; font-size:11px; margin-bottom:3px;
        background:${isSelected ? '#e0f2fe' : '#ffffff'}; border:${isSelected ? '1.5px solid #0284c7' : '1px solid #f1f5f9'};"
        onmouseover="if('${item.baseCode}' !== '${selectedBaseCode}') this.style.background='#f8fafc'"
        onmouseout="if('${item.baseCode}' !== '${selectedBaseCode}') this.style.background='#ffffff'">
        <div>
          <span style="font-family:monospace; font-weight:800; color:${isSelected ? '#0369a1' : '#1e293b'};">${escapeHtml(item.baseCode)}</span>
          <div style="font-size:9.5px; color:#64748b; margin-top:1px;">
            ${item.knownOpenings.length > 0 ? item.knownOpenings.map(o => `<span style="color:#a21caf; font-weight:700;">+${escapeHtml(o)}</span>`).join(' ') : 'Base (No Opening)'}
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
      'NONE': 'Base Panel (No Opening)',
      'HL': 'Top Left Manhole (Top Left)',
      'HR': 'Top Right Manhole (Top Right)',
      'HX': 'Top Center Manhole (Top Center)',
      'SL': 'Side Left Nozzle (Side Left)',
      'SR': 'Side Right Nozzle (Side Right)',
      'SX': 'Side Center Nozzle (Side Center)',
      'LX': 'Ladder Access (Ladder Access)',
      'LS': 'Ladder Special (Ladder Special)',
      'LR': 'Ladder Right (Ladder Right)',
      'LL': 'Lower Ladder Left (Lower Ladder Left)',
      'ML': 'Mid Left Access (Mid Left)',
      'MR': 'Mid Right Access (Mid Right)',
      'MX': 'Mid Center Access (Mid Center)',
      'BP': 'Bottom Drain (Bottom Drain)',
      'BX': 'Drain Box (Drain Box)',
      'BBP': 'Sub Drain (Sub Drain)',
      'BPS': 'Special Drain (Special Drain)',
      'HU15': 'Flat Quarter (HU15)',
      'TX': 'Roof Vent (Roof Vent)'
    };
    return map[oKey] || 'Opening Spec';
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
    const code = prompt('Enter Opening Code to add (e.g. HL, HR, HX, SX, SL, SR, LX, LS, LR, BP, BX, etc.):');
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
      statusEl.textContent = '✓ Copied default Flange seam hole counts (T/B/L/R) to all opening rows!';
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
      const label = isDefault ? 'NONE (Base / No Opening)' : oKey;
      const tagDesc = getOpeningDescription(oKey);

      return `
        <tr style="border-bottom:1px solid #e2e8f0; background:${isDefault ? '#f8fafc' : '#ffffff'};" data-opening-key="${escapeHtml(oKey)}">
          <td style="padding:6px 8px; vertical-align:middle;">
            <div style="font-family:monospace; font-weight:800; font-size:12px; color:${isDefault ? '#0284c7' : '#a21caf'};">
              ${escapeHtml(label)}
            </div>
            <span style="font-size:9.5px; color:#64748b;">${tagDesc}</span>
          </td>
          <!-- Flange (Top, Bottom, Left, Right) -->
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_top" value="${spec.edges.top || ''}" placeholder="T" title="Top"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_bottom" value="${spec.edges.bottom || ''}" placeholder="B" title="Bottom"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_left" value="${spec.edges.left || ''}" placeholder="L" title="Left"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#f0f9ff;">
            <input type="number" min="0" id="row_${oKey}_edge_right" value="${spec.edges.right || ''}" placeholder="R" title="Right"
              style="width:42px; text-align:center; padding:3px; border:1px solid #7dd3fc; border-radius:4px; font-size:11.5px;">
          </td>

          <!-- Face (Top, Bottom, Left, Right) -->
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_top" value="${spec.face.top || ''}" placeholder="T" title="Top"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_bottom" value="${spec.face.bottom || ''}" placeholder="B" title="Bottom"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_left" value="${spec.face.left || ''}" placeholder="L" title="Left"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>
          <td style="padding:4px; text-align:center; background:#fdf4ff;">
            <input type="number" min="0" id="row_${oKey}_face_right" value="${spec.face.right || ''}" placeholder="R" title="Right"
              style="width:42px; text-align:center; padding:3px; border:1px solid #f0abfc; border-radius:4px; font-size:11.5px;">
          </td>

          <!-- Note -->
          <td style="padding:4px 6px;">
            <input type="text" id="row_${oKey}_face_note" value="${escapeHtml(spec.face.note || '')}" placeholder="e.g. ${escapeHtml(tagDesc)}"
              style="width:100%; box-sizing:border-box; padding:3px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
          </td>

          <!-- Delete -->
          <td style="padding:4px; text-align:center;">
            <button type="button" onclick="PanelHoleSpec.clearRowSpec('${escapeHtml(baseCode)}', '${escapeHtml(oKey)}')" title="Reset / Delete row"
              style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px;"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="background:#ffffff; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; padding-bottom:8px; border-bottom:1.5px solid #e2e8f0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:12px; font-weight:800; color:#334155;">Selected Base Panel Code:</label>
            <input type="text" id="holeSpecBaseCodeInput" value="${escapeHtml(baseCode)}" onchange="PanelHoleSpec.selectBaseCode(this.value)"
              style="font-family:monospace; font-weight:900; font-size:13px; color:#0284c7; border:2px solid #0284c7; border-radius:6px; padding:4px 10px; width:140px; background:#f0f9ff;">
            <span style="font-size:11px; color:#64748b;">(Edit all opening specs BP/BX/SX in the table below simultaneously)</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" onclick="PanelHoleSpec.copyFlangeFromDefaultToAll()" class="btn btn-sm"
              style="background:#f0fdf4; color:#15803d; border:1.5px solid #86efac; font-weight:700; font-size:11px; padding:4px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-copy"></i> 📋 Copy Default Flange Values to All Openings (BP/BX, etc.)
            </button>
            <button type="button" onclick="PanelHoleSpec.addCustomOpeningPrompt()" class="btn btn-sm"
              style="background:#fdf4ff; color:#a21caf; border:1.5px solid #f0abfc; font-weight:700; font-size:11px; padding:4px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-plus"></i> Add Opening Code
            </button>
            <button type="button" onclick="PanelHoleSpec.saveAllFromForm()" class="btn btn-sm btn-primary"
              style="background:#0284c7; color:#ffffff; font-weight:800; font-size:11.5px; padding:5px 14px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(2,132,199,0.2);">
              <i class="fa-solid fa-floppy-disk"></i> 💾 Save All Opening Specs
            </button>
          </div>
        </div>

        <div id="holeSpecCopyStatusMsg" style="display:none; font-size:11px; font-weight:800; color:#15803d; background:#dcfce7; border:1px solid #86efac; padding:3px 8px; border-radius:4px; margin-bottom:8px;"></div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:11.5px; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
            <thead>
              <tr style="background:#e2e8f0; border-bottom:1px solid #cbd5e1;">
                <th rowspan="2" style="padding:6px 8px; text-align:left; width:140px; font-weight:800; color:#334155;">Opening Type (Spec)</th>
                <th colspan="4" style="padding:4px 6px; text-align:center; background:#e0f2fe; color:#0369a1; font-weight:800; border-left:1px solid #cbd5e1; border-right:1px solid #cbd5e1;">
                  🔩 Flange Seam Holes (Panel Flange Joints)
                </th>
                <th colspan="4" style="padding:4px 6px; text-align:center; background:#fae8ff; color:#86198f; font-weight:800; border-right:1px solid #cbd5e1;">
                  Face Holes (Nozzle/Manhole/Drain Cutouts)
                </th>
                <th rowspan="2" style="padding:6px 8px; text-align:left; font-weight:800; color:#334155;">Note</th>
                <th rowspan="2" style="padding:6px 4px; text-align:center; width:30px;"></th>
              </tr>
              <tr style="background:#f1f5f9; border-bottom:2px solid #94a3b8;">
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px; border-left:1px solid #cbd5e1;">Top</th>
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px;">Bottom</th>
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px;">Left</th>
                <th style="padding:3px; text-align:center; background:#e0f2fe; color:#0369a1; font-size:10.5px; border-right:1px solid #cbd5e1;">Right</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px;">Top</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px;">Bottom</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px;">Left</th>
                <th style="padding:3px; text-align:center; background:#fae8ff; color:#86198f; font-size:10.5px; border-right:1px solid #cbd5e1;">Right</th>
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
      statusEl.textContent = `✓ Successfully saved ${savedCount} opening specs for [${baseCode}]!`;
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
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">No panel hole specs registered yet.</div>`;
      return;
    }

    rows.sort((a, b) => a.baseCode.localeCompare(b.baseCode) || a.openingCode.localeCompare(b.openingCode));

    let html = `<table style="width:100%; border-collapse:collapse; font-size:11.5px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th rowspan="2" style="padding:6px 8px; text-align:left; border-bottom:2px solid #334155;">Panel Code</th>
          <th rowspan="2" style="padding:6px 8px; text-align:left; border-bottom:2px solid #334155;">Opening Code</th>
          <th colspan="4" style="padding:4px 8px; text-align:center; color:#0284c7; border-bottom:1px solid #cbd5e1;">Flange Seam</th>
          <th colspan="4" style="padding:4px 8px; text-align:center; color:#a21caf; border-bottom:1px solid #cbd5e1;">Face</th>
          <th rowspan="2" style="padding:6px 8px; text-align:left; border-bottom:2px solid #334155;">Note</th>
          <th rowspan="2" style="border-bottom:2px solid #334155;"></th>
        </tr>
        <tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
          <th style="padding:4px 6px; text-align:center;">Top</th>
          <th style="padding:4px 6px; text-align:center;">Bottom</th>
          <th style="padding:4px 6px; text-align:center;">Left</th>
          <th style="padding:4px 6px; text-align:center;">Right</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">Top</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">Bottom</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">Left</th>
          <th style="padding:4px 6px; text-align:center; color:#a21caf;">Right</th>
        </tr>
      </thead><tbody>`;
    rows.forEach(r => {
      html += `<tr style="border-bottom:1px solid #e2e8f0; cursor:pointer;" onclick="PanelHoleSpec.selectBaseCode('${escapeHtml(r.baseCode)}')">
        <td style="padding:5px 8px; font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(r.baseCode)}</td>
        <td style="padding:5px 8px; font-family:monospace; color:#a21caf; font-weight:700;">${r.openingCode ? escapeHtml(r.openingCode) : '<span style="color:#94a3b8; font-weight:400;">Base (NONE)</span>'}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.top}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.bottom}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.left}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.right}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.top}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.bottom}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.left}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.right}</td>
        <td style="padding:5px 8px; color:#64748b; font-size:10.5px;">${escapeHtml(r.spec.face.note || '')}</td>
        <td style="padding:5px 8px; text-align:right;"><span onclick="event.stopPropagation(); PanelHoleSpec.removePanelSpec('${escapeHtml(r.baseCode)}', '${escapeHtml(r.openingCode)}', '${pid}'); PanelHoleSpec.renderUI();" style="cursor:pointer; color:#dc2626; font-weight:700;">Delete</span></td>
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
