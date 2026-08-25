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
  const NO_OPENING_KEY = "__none__"; // spec that applies when no opening code is registered

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

  // -------------------------------------------------------------------------
  // UI Rendering
  // -------------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  function renderCompanyPanelCatalog() {
    const container = document.getElementById('panelHoleSpecCatalogContainer');
    if (!container) return;
    const pid = getActivePartyId();
    const variants = getCompanyPanelVariants(pid);

    if (variants.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">이 프리셋의 PANEL CONFIG(Matrix)에서 판넬 코드를 찾지 못했습니다.</div>`;
      return;
    }

    container.innerHTML = variants.map(v => {
      const hasSpec = !!getPanelSpec(v.baseCode, v.openingCode, pid);
      const combinedLabel = v.openingCode
        ? `${escapeHtml(v.baseCode)}<span style="color:#a21caf; font-weight:900;"> + </span><span style="color:#a21caf;">${escapeHtml(v.openingCode)}</span>`
        : `${escapeHtml(v.baseCode)}<span style="color:#94a3b8; font-weight:400;"> (개공없음)</span>`;
      return `<div onclick="PanelHoleSpec.loadVariantIntoForm('${escapeHtml(v.baseCode)}', '${escapeHtml(v.openingCode)}')"
        style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px; margin-bottom:2px;
        background:${hasSpec ? '#f0fdf4' : '#ffffff'};" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='${hasSpec ? '#f0fdf4' : '#ffffff'}'">
        <span style="font-family:monospace; font-weight:700;">${combinedLabel}</span>
        ${hasSpec ? '<i class="fa-solid fa-check" style="color:#16a34a; font-size:10px;"></i>' : ''}
      </div>`;
    }).join('');
  }

  function loadVariantIntoForm(baseCode, openingCode) {
    const codeEl = document.getElementById('holeSpecPanelCode');
    const openingEl = document.getElementById('holeSpecOpeningCode');
    if (codeEl) codeEl.value = baseCode;
    if (openingEl) openingEl.value = openingCode || '';
    const spec = getPanelSpec(baseCode, openingCode, getActivePartyId()) || normalisePanelSpec(null);
    ['top', 'bottom', 'left', 'right'].forEach(edge => {
      const el = document.getElementById('holeSpecEdge_' + edge);
      if (el) el.value = spec.edges[edge] || '';
    });
    ['top', 'bottom', 'left', 'right'].forEach(edge => {
      const el = document.getElementById('holeSpecFace_' + edge);
      if (el) el.value = spec.face[edge] || '';
    });
    const faceNoteEl = document.getElementById('holeSpecFaceNote');
    if (faceNoteEl) faceNoteEl.value = spec.face.note || '';
    updateCombinedPreview();
  }

  function updateCombinedPreview() {
    const previewEl = document.getElementById('holeSpecCombinedPreviewText');
    if (!previewEl) return;
    const codeEl = document.getElementById('holeSpecPanelCode');
    const openingEl = document.getElementById('holeSpecOpeningCode');
    const code = codeEl ? codeEl.value.trim() : '';
    const opening = openingEl ? openingEl.value.trim() : '';
    if (!code) { previewEl.textContent = '-'; return; }
    previewEl.textContent = opening ? `${code} + ${opening}` : `${code} (개공없음)`;
  }

  function renderForm() {
    const container = document.getElementById('panelHoleSpecFormContainer');
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
        <div style="flex:1;">
          <label style="font-size:10.5px; font-weight:700; color:#64748b;">판넬 코드</label>
          <input type="text" id="holeSpecPanelCode" placeholder="좌측 목록에서 클릭하거나 직접 입력" oninput="PanelHoleSpec.updateCombinedPreview()" style="width:100%; box-sizing:border-box; border:1px solid #7dd3fc; border-radius:4px; padding:6px 8px; font-size:12px; font-family:monospace;">
        </div>
        <div style="width:160px;">
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">개공코드 <span style="font-weight:400; color:#94a3b8;">(없으면 비워둠)</span></label>
          <input type="text" id="holeSpecOpeningCode" placeholder="예: SX" oninput="PanelHoleSpec.updateCombinedPreview()" style="width:100%; box-sizing:border-box; border:1px dashed #d946ef; border-radius:4px; padding:6px 8px; font-size:12px; font-family:monospace;">
        </div>
      </div>
      <div id="holeSpecCombinedPreview" style="font-size:11px; font-weight:800; color:#a21caf; background:#fdf4ff; border:1px dashed #d946ef; border-radius:4px; padding:5px 8px; margin-bottom:6px;">
        저장 키(판넬이름+개공사양): <span id="holeSpecCombinedPreviewText">-</span>
      </div>
      <div style="font-size:10.5px; color:#94a3b8; margin-bottom:10px;">
        판넬 코드와 개공코드가 합쳐져 하나의 홀 스펙 키가 됩니다 — 같은 판넬 코드라도 개공코드가 다르면(또는 개공이 없으면) 완전히 별개의 홀 스펙으로 등록됩니다.
      </div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:10px;">
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#64748b;">상(Top) 홀수</label>
          <input type="number" min="0" id="holeSpecEdge_top" style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#64748b;">하(Bottom) 홀수</label>
          <input type="number" min="0" id="holeSpecEdge_bottom" style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#64748b;">좌(Left) 홀수</label>
          <input type="number" min="0" id="holeSpecEdge_left" style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#64748b;">우(Right) 홀수</label>
          <input type="number" min="0" id="holeSpecEdge_right" style="width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
      </div>
      <div style="font-size:10.5px; font-weight:700; color:#a21caf; margin-bottom:4px;">평면(Face) 홀수 <span style="font-weight:400; color:#94a3b8;">(노즐/맨홀/드레인 등 개공부 볼트홀 -- 상/하/좌/우 동일하게 구분)</span></div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:10px;">
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">상(Top)</label>
          <input type="number" min="0" id="holeSpecFace_top" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">하(Bottom)</label>
          <input type="number" min="0" id="holeSpecFace_bottom" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">좌(Left)</label>
          <input type="number" min="0" id="holeSpecFace_left" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div>
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">우(Right)</label>
          <input type="number" min="0" id="holeSpecFace_right" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:10.5px; font-weight:700; color:#a21caf;">비고</label>
        <input type="text" id="holeSpecFaceNote" placeholder="예: DN100 노즐 플랜지" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" onclick="PanelHoleSpec.saveFromForm()" class="btn btn-sm btn-secondary" style="cursor:pointer;"><i class="fa-solid fa-floppy-disk"></i> 저장</button>
        <button type="button" onclick="PanelHoleSpec.deleteFromForm()" class="btn btn-sm btn-outline" style="border-color:#dc2626; color:#dc2626; cursor:pointer;"><i class="fa-solid fa-trash"></i> 삭제</button>
      </div>
    `;
  }

  function saveFromForm() {
    const codeEl = document.getElementById('holeSpecPanelCode');
    if (!codeEl || !codeEl.value.trim()) return;
    const openingEl = document.getElementById('holeSpecOpeningCode');
    const spec = {
      edges: {
        top: document.getElementById('holeSpecEdge_top').value,
        bottom: document.getElementById('holeSpecEdge_bottom').value,
        left: document.getElementById('holeSpecEdge_left').value,
        right: document.getElementById('holeSpecEdge_right').value
      },
      face: {
        top: document.getElementById('holeSpecFace_top').value,
        bottom: document.getElementById('holeSpecFace_bottom').value,
        left: document.getElementById('holeSpecFace_left').value,
        right: document.getElementById('holeSpecFace_right').value,
        note: document.getElementById('holeSpecFaceNote').value
      }
    };
    const savedCode = codeEl.value.trim();
    const savedOpening = openingEl ? openingEl.value.trim() : '';
    setPanelSpec(savedCode, savedOpening, spec, getActivePartyId());
    renderUI();
    loadVariantIntoForm(savedCode, savedOpening);
  }

  function deleteFromForm() {
    const codeEl = document.getElementById('holeSpecPanelCode');
    if (!codeEl || !codeEl.value.trim()) return;
    const openingEl = document.getElementById('holeSpecOpeningCode');
    removePanelSpec(codeEl.value.trim(), openingEl ? openingEl.value.trim() : '', getActivePartyId());
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
          <th colspan="4" style="padding:4px 8px; text-align:center; color:#0284c7; border-bottom:1px solid #cbd5e1;">접합(Edges)</th>
          <th colspan="4" style="padding:4px 8px; text-align:center; color:#a21caf; border-bottom:1px solid #cbd5e1;">평면(Face)</th>
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
      html += `<tr style="border-bottom:1px solid #e2e8f0; cursor:pointer;" onclick="PanelHoleSpec.loadVariantIntoForm('${escapeHtml(r.baseCode)}', '${escapeHtml(r.openingCode)}')">
        <td style="padding:5px 8px; font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(r.baseCode)}</td>
        <td style="padding:5px 8px; font-family:monospace; color:#a21caf;">${r.openingCode ? escapeHtml(r.openingCode) : '<span style="color:#94a3b8;">-</span>'}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.top}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.bottom}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.left}</td>
        <td style="padding:5px 8px; text-align:center;">${r.spec.edges.right}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.top}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.bottom}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.left}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${r.spec.face.right}</td>
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
    updateCombinedPreview();
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
    onChange,
    renderUI,
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
