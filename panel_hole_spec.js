// =============================================================================
// Panel Hole Spec (panel_hole_spec.js) -- 회사별 판넬 홀(Hole) 스펙 관리
// =============================================================================
// Foundational data layer for a future joint-type-based bolt engine (see the
// project plan's Phase 1 design). Records, per company preset and per exact
// panel code, how many bolt holes exist:
//   - edges: top/bottom/left/right -- the seam holes used to bolt this panel
//     to whatever panel touches it on that side. Because the panel catalog
//     already gives position-dependent variants their own distinct code
//     (e.g. a partition-adjacent side panel is "side_parLT"/"side_parRT",
//     not plain "side" -- see panel_catalog.js/panel_rules.js), registering
//     hole counts per EXACT panel code automatically captures "this edge has
//     extra holes because it also bolts to a partition/roof/bottom" without
//     needing a separate joint-type dimension here.
//   - face: nozzle/manhole/drain-style cutout holes on the panel's flat
//     plane, distinct from edge seam holes (tracked for future nozzle/
//     manhole flange bolt work -- NOT consumed by any bolt engine yet).
//
// PURE DATA LAYER: nothing in the existing BOM/costing/bolt-formula path
// reads this module. A future joint-counting bolt engine will consult it,
// falling back to today's R1/R05 holes-per-meter constants for any panel
// code that has no registered spec here (never guesses).
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_panel_hole_spec_v1";
  const FIRESTORE_DOC = "panelHoleSpec";

  // { byParty: { [presetId]: { panels: { "<panelCode>": {
  //   edges: {top,bottom,left,right}, face: {count, note}
  // } } } } }
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
        count: toPositiveInt(f.count),
        note: String(f.note || '').trim()
      }
    };
  }

  function normalisePartyPanels(partyObj) {
    const rawPanels = (partyObj && partyObj.panels && typeof partyObj.panels === 'object') ? partyObj.panels : {};
    const panels = {};
    Object.keys(rawPanels).forEach(code => {
      const clean = cleanCode(code);
      if (!clean) return;
      panels[clean] = normalisePanelSpec(rawPanels[code]);
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
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
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
  // Public API
  // -------------------------------------------------------------------------

  function getPanelSpecs(partyId) {
    return getPartyState(partyId).panels;
  }

  // Returns null if this exact panel code has no registered spec -- callers
  // (a future joint-counting bolt engine) must fall back to R1/R05, never
  // guess.
  function getPanelSpec(panelCode, partyId) {
    if (!panelCode) return null;
    const clean = cleanCode(panelCode).toUpperCase();
    const panels = getPanelSpecs(partyId);
    const key = Object.keys(panels).find(k => k.toUpperCase() === clean);
    return key ? panels[key] : null;
  }

  function setPanelSpec(panelCode, spec, partyId) {
    const pState = getPartyState(partyId);
    const clean = cleanCode(panelCode);
    if (!clean) return false;
    pState.panels[clean] = normalisePanelSpec(spec);
    persist();
    return true;
  }

  function removePanelSpec(panelCode, partyId) {
    const pState = getPartyState(partyId);
    const clean = cleanCode(panelCode);
    const key = Object.keys(pState.panels).find(k => k.toUpperCase() === clean.toUpperCase());
    if (!key) return false;
    delete pState.panels[key];
    persist();
    return true;
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
    const panels = (global.MoldGroupManager && typeof global.MoldGroupManager.getCompanyPanels === 'function')
      ? global.MoldGroupManager.getCompanyPanels(pid) : [];
    const registered = getPanelSpecs(pid);

    if (panels.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">이 프리셋의 PANEL CONFIG(Matrix)에서 판넬 코드를 찾지 못했습니다.</div>`;
      return;
    }

    container.innerHTML = panels.map(p => {
      const hasSpec = Object.keys(registered).some(k => k.toUpperCase() === p.partNo.toUpperCase());
      return `<div onclick="PanelHoleSpec.loadCodeIntoForm('${escapeHtml(p.partNo)}')"
        style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px; margin-bottom:2px;
        background:${hasSpec ? '#f0fdf4' : '#ffffff'};" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='${hasSpec ? '#f0fdf4' : '#ffffff'}'">
        <span style="font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(p.partNo)}</span>
        ${hasSpec ? '<i class="fa-solid fa-check" style="color:#16a34a; font-size:10px;"></i>' : ''}
      </div>`;
    }).join('');
  }

  function loadCodeIntoForm(code) {
    const input = document.getElementById('holeSpecPanelCode');
    if (input) input.value = code;
    const spec = getPanelSpec(code, getActivePartyId()) || normalisePanelSpec(null);
    ['top', 'bottom', 'left', 'right'].forEach(edge => {
      const el = document.getElementById('holeSpecEdge_' + edge);
      if (el) el.value = spec.edges[edge] || '';
    });
    const faceCountEl = document.getElementById('holeSpecFaceCount');
    const faceNoteEl = document.getElementById('holeSpecFaceNote');
    if (faceCountEl) faceCountEl.value = spec.face.count || '';
    if (faceNoteEl) faceNoteEl.value = spec.face.note || '';
  }

  function renderForm() {
    const container = document.getElementById('panelHoleSpecFormContainer');
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
        <input type="text" id="holeSpecPanelCode" placeholder="판넬 코드 (좌측 목록에서 클릭하거나 직접 입력)" style="flex:1; border:1px solid #7dd3fc; border-radius:4px; padding:6px 8px; font-size:12px; font-family:monospace;">
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
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <div style="width:160px;">
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">평면(Face) 홀수 <span style="font-weight:400; color:#94a3b8;">(노즐/맨홀/드레인 등)</span></label>
          <input type="number" min="0" id="holeSpecFaceCount" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
        <div style="flex:1;">
          <label style="font-size:10.5px; font-weight:700; color:#a21caf;">비고</label>
          <input type="text" id="holeSpecFaceNote" placeholder="예: DN100 노즐 플랜지" style="width:100%; box-sizing:border-box; border:1px solid #f0abfc; border-radius:4px; padding:5px 8px; font-size:12px;">
        </div>
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
    const spec = {
      edges: {
        top: document.getElementById('holeSpecEdge_top').value,
        bottom: document.getElementById('holeSpecEdge_bottom').value,
        left: document.getElementById('holeSpecEdge_left').value,
        right: document.getElementById('holeSpecEdge_right').value
      },
      face: {
        count: document.getElementById('holeSpecFaceCount').value,
        note: document.getElementById('holeSpecFaceNote').value
      }
    };
    setPanelSpec(codeEl.value.trim(), spec, getActivePartyId());
    renderUI();
  }

  function deleteFromForm() {
    const codeEl = document.getElementById('holeSpecPanelCode');
    if (!codeEl || !codeEl.value.trim()) return;
    removePanelSpec(codeEl.value.trim(), getActivePartyId());
    renderUI();
  }

  function renderRegisteredTable() {
    const container = document.getElementById('panelHoleSpecTableContainer');
    if (!container) return;
    const pid = getActivePartyId();
    const panels = getPanelSpecs(pid);
    const codes = Object.keys(panels);

    if (codes.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:11.5px;">아직 등록된 홀 스펙이 없습니다.</div>`;
      return;
    }

    let html = `<table style="width:100%; border-collapse:collapse; font-size:11.5px;">
      <thead><tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
        <th style="padding:6px 8px; text-align:left;">판넬코드</th>
        <th style="padding:6px 8px; text-align:center;">상</th>
        <th style="padding:6px 8px; text-align:center;">하</th>
        <th style="padding:6px 8px; text-align:center;">좌</th>
        <th style="padding:6px 8px; text-align:center;">우</th>
        <th style="padding:6px 8px; text-align:center;">평면</th>
        <th style="padding:6px 8px;"></th>
      </tr></thead><tbody>`;
    codes.sort().forEach(code => {
      const s = panels[code];
      html += `<tr style="border-bottom:1px solid #e2e8f0; cursor:pointer;" onclick="PanelHoleSpec.loadCodeIntoForm('${escapeHtml(code)}')">
        <td style="padding:5px 8px; font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(code)}</td>
        <td style="padding:5px 8px; text-align:center;">${s.edges.top}</td>
        <td style="padding:5px 8px; text-align:center;">${s.edges.bottom}</td>
        <td style="padding:5px 8px; text-align:center;">${s.edges.left}</td>
        <td style="padding:5px 8px; text-align:center;">${s.edges.right}</td>
        <td style="padding:5px 8px; text-align:center; color:#a21caf;">${s.face.count}</td>
        <td style="padding:5px 8px; text-align:right;"><span onclick="event.stopPropagation(); PanelHoleSpec.removePanelSpec('${escapeHtml(code)}', '${pid}'); PanelHoleSpec.renderUI();" style="cursor:pointer; color:#dc2626; font-weight:700;">삭제</span></td>
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
    onChange,
    renderUI,
    loadCodeIntoForm,
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
