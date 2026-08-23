// =============================================================================
// Insulation Naming Map (insulation_naming_map.js) -- 회사별 보온판넬 코드 관리
// =============================================================================
// A panel comes off the press as a non-insulated panel. Bonding polyurethane
// foam + a cover panel onto it turns it into an insulated panel -- same base
// panel, an added process. Some companies give the insulated version a
// completely different partNo: e.g. HAYOUNG's non-insulated GW-/GF-/GR-
// prefixes become SW-/SF-/SR- once insulated (thickness isn't distinguished
// in the code). YSACC has no such convention defined yet.
//
// PURE DISPLAY-CODE SUBSTITUTION LAYER:
// Pricing keeps coming from the SAME base-code parts_db row exactly as
// before (match.priceInsulated / costing panelCostRows via
// window.resolvePanelPrice / getPanelPriceFromCosting in app.js) -- this
// module is never consulted for price. It only tells BOM generation which
// partNo STRING to display once insulation is active, for companies that
// have registered a rule. No rule registered (e.g. YSACC today) => the
// original base code is used unchanged, exactly like before this module
// existed.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_insulation_naming_v1";
  const FIRESTORE_DOC = "insulationNaming";

  // { byParty: { [presetId]: { rules: [ { id, baseCode, thickness, insulatedCode } ] } } }
  // thickness: null (applies whenever insulated, regardless of thickness) | "25mm" | "40mm"
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

  function cleanBaseCode(raw) {
    if (global.MoldGroupManager && typeof global.MoldGroupManager.cleanToPureBaseCode === 'function') {
      return global.MoldGroupManager.cleanToPureBaseCode(raw);
    }
    return String(raw || '').trim();
  }

  function normaliseRule(r) {
    if (!r || !r.baseCode || !r.insulatedCode) return null;
    return {
      id: String(r.id || newId()),
      baseCode: cleanBaseCode(r.baseCode),
      thickness: (r.thickness === '25mm' || r.thickness === '40mm') ? r.thickness : null,
      insulatedCode: String(r.insulatedCode).trim()
    };
  }

  function normalisePartyRules(partyObj) {
    const rawRules = Array.isArray(partyObj && partyObj.rules) ? partyObj.rules : [];
    return { rules: rawRules.map(normaliseRule).filter(Boolean) };
  }

  function normalise(s) {
    if (!s || typeof s !== 'object') return emptyState();
    const byParty = {};
    if (s.byParty && typeof s.byParty === 'object') {
      Object.keys(s.byParty).forEach(pid => { byParty[pid] = normalisePartyRules(s.byParty[pid]); });
    }
    return { byParty };
  }

  function load() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      state = raw ? normalise(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.error("[InsulationNamingMap] localStorage 불러오기 실패:", e);
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
    if (!s.byParty[pid]) s.byParty[pid] = { rules: [] };
    return s.byParty[pid];
  }

  function persist() {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[InsulationNamingMap] localStorage 저장 실패:", e);
    }
    if (dbRef) {
      dbRef.collection("settings").doc(FIRESTORE_DOC)
        .set({ state: state, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(err => console.warn("[InsulationNamingMap] Firestore 저장 실패 (localStorage에는 저장됨):", err));
    }
    listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
  }

  function newId() {
    return 'ins_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function getRules(partyId) {
    return getPartyState(partyId).rules.slice();
  }

  // Never guesses. Exact thickness match first, then the thickness-agnostic
  // (null) rule, then null (=> caller must keep using the original code).
  function getInsulatedDisplayCode(baseCode, thickness, partyId) {
    if (!baseCode) return null;
    const clean = cleanBaseCode(baseCode).toUpperCase();
    const rules = getRules(partyId);
    let fallback = null;
    for (const r of rules) {
      if (r.baseCode.toUpperCase() !== clean) continue;
      if (thickness && r.thickness === thickness) return r.insulatedCode;
      if (!r.thickness) fallback = r.insulatedCode;
    }
    return fallback;
  }

  function addRule(baseCode, insulatedCode, thickness, partyId) {
    const pState = getPartyState(partyId);
    const rule = normaliseRule({ baseCode, insulatedCode, thickness });
    if (!rule) return null;
    // Replace an existing rule for the same (baseCode, thickness) rather than duplicating.
    const idx = pState.rules.findIndex(r => r.baseCode.toUpperCase() === rule.baseCode.toUpperCase() && r.thickness === rule.thickness);
    if (idx !== -1) pState.rules.splice(idx, 1, rule);
    else pState.rules.push(rule);
    persist();
    return rule;
  }

  function removeRule(id, partyId) {
    const pState = getPartyState(partyId);
    const idx = pState.rules.findIndex(r => r.id === id);
    if (idx === -1) return false;
    pState.rules.splice(idx, 1);
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
          const byId = {};
          s.byParty[pid].rules.forEach(r => { byId[r.id] = r; });
          remoteState.byParty[pid].rules.forEach(rr => {
            if (!byId[rr.id]) { s.byParty[pid].rules.push(rr); byId[rr.id] = rr; }
          });
        }
      });
      persist();
    }).catch(err => console.warn("[InsulationNamingMap] Firestore 불러오기 실패, localStorage만 사용:", err));
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
    const container = document.getElementById('insulationNamingCompanyTabsContainer');
    if (!container) return;
    const list = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const activeId = getActivePartyId();
    container.innerHTML = list.map(c => {
      const cid = String(c.id);
      const isActive = cid === activeId;
      return `<button type="button" onclick="InsulationNamingMap.setActiveParty('${cid}')"
        style="height:30px; padding:0 12px; font-size:11.5px; font-weight:700; border-radius:6px; cursor:pointer; margin-right:6px;
        background:${isActive ? '#0284c7' : '#ffffff'}; color:${isActive ? '#ffffff' : '#334155'}; border:${isActive ? 'none' : '1px solid #cbd5e1'};">
        ${escapeHtml(c.name)}
      </button>`;
    }).join('');
  }

  function thicknessLabel(t) {
    return t === '25mm' ? '25mm' : (t === '40mm' ? '40mm' : '두께무관(공통)');
  }

  function renderRuleTable() {
    const container = document.getElementById('insulationNamingRuleTableContainer');
    if (!container) return;
    const pid = getActivePartyId();
    const rules = getRules(pid);

    let html = `
      <div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
        <input type="text" id="insNewBaseCode" placeholder="베이스 코드 (예: GW-1010-A)" style="flex:1; min-width:140px; border:1px solid #7dd3fc; border-radius:4px; padding:5px 8px; font-size:11.5px; font-family:monospace;">
        <select id="insNewThickness" style="border:1px solid #cbd5e1; border-radius:4px; padding:5px 8px; font-size:11.5px;">
          <option value="">두께무관(공통)</option>
          <option value="25mm">25mm</option>
          <option value="40mm">40mm</option>
        </select>
        <input type="text" id="insNewInsulatedCode" placeholder="보온 코드 (예: SW-1010-A)" style="flex:1; min-width:140px; border:1px solid #7dd3fc; border-radius:4px; padding:5px 8px; font-size:11.5px; font-family:monospace;">
        <button type="button" onclick="InsulationNamingMap.addRuleFromForm()" class="btn btn-sm btn-secondary" style="cursor:pointer;"><i class="fa-solid fa-plus"></i> 규칙 추가</button>
      </div>
    `;

    if (rules.length === 0) {
      html += `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:12px; font-weight:600;">
        이 프리셋에는 아직 등록된 보온판넬 코드 규칙이 없습니다. 규칙이 없으면 보온 옵션을 선택해도 BOM의 판넬 코드는 오늘과 동일하게 유지됩니다.
      </div>`;
    } else {
      html += `<table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
            <th style="padding:6px 8px; text-align:left;">베이스 코드</th>
            <th style="padding:6px 8px; text-align:left;">두께</th>
            <th style="padding:6px 8px; text-align:left;">보온 코드</th>
            <th style="padding:6px 8px;"></th>
          </tr>
        </thead>
        <tbody>`;
      rules.forEach(r => {
        html += `<tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 8px; font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(r.baseCode)}</td>
          <td style="padding:6px 8px; color:#64748b;">${thicknessLabel(r.thickness)}</td>
          <td style="padding:6px 8px; font-family:monospace; font-weight:700; color:#a21caf;">${escapeHtml(r.insulatedCode)}</td>
          <td style="padding:6px 8px; text-align:right;">
            <span onclick="InsulationNamingMap.removeRule('${r.id}')" style="cursor:pointer; color:#dc2626; font-size:11px; font-weight:700;" title="삭제">삭제</span>
          </td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }
    container.innerHTML = html;
  }

  function renderBulkPrefixTool() {
    const container = document.getElementById('insulationNamingBulkToolContainer');
    if (!container) return;
    container.innerHTML = `
      <div style="font-size:11px; color:#64748b; margin-bottom:6px;">
        규칙적인 prefix 치환(예: GW→SW, GF→SF, GR→SR)이 많을 때 미리보기를 만든 뒤 검토하고 저장하세요. 자동으로 저장되지 않습니다.
      </div>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <input type="text" id="insBulkPairs" placeholder="GW:SW, GF:SF, GR:SR" style="flex:1; border:1px dashed #94a3b8; border-radius:4px; padding:5px 8px; font-size:11.5px; font-family:monospace;">
        <button type="button" onclick="InsulationNamingMap.previewBulkPrefix()" class="btn btn-sm btn-outline" style="cursor:pointer;">미리보기 생성</button>
      </div>
      <div id="insulationNamingBulkPreviewContainer"></div>
    `;
  }

  function previewBulkPrefix() {
    const input = document.getElementById('insBulkPairs');
    const previewContainer = document.getElementById('insulationNamingBulkPreviewContainer');
    if (!input || !previewContainer) return;
    const pid = getActivePartyId();

    const pairs = input.value.split(',').map(s => s.trim()).filter(Boolean).map(pair => {
      const [from, to] = pair.split(':').map(s => (s || '').trim());
      return (from && to) ? { from, to } : null;
    }).filter(Boolean);

    if (pairs.length === 0) {
      previewContainer.innerHTML = `<div style="color:#94a3b8; font-size:11.5px; padding:8px;">유효한 prefix 쌍이 없습니다. "GW:SW, GF:SF" 형식으로 입력하세요.</div>`;
      return;
    }

    const companyPanels = (global.MoldGroupManager && typeof global.MoldGroupManager.getCompanyPanels === 'function')
      ? global.MoldGroupManager.getCompanyPanels(pid) : [];

    const candidates = [];
    companyPanels.forEach(p => {
      const code = p.partNo;
      for (const pair of pairs) {
        if (code.toUpperCase().startsWith(pair.from.toUpperCase())) {
          candidates.push({ baseCode: code, insulatedCode: pair.to + code.slice(pair.from.length) });
          break;
        }
      }
    });

    if (candidates.length === 0) {
      previewContainer.innerHTML = `<div style="color:#94a3b8; font-size:11.5px; padding:8px;">이 프리셋의 판넬 목록(PANEL CONFIG Matrix 기준)에서 해당 prefix로 시작하는 코드를 찾지 못했습니다.</div>`;
      return;
    }

    window.__insBulkCandidates = candidates;
    let html = `<table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-top:6px;">
      <thead><tr style="background:#f8fafc;"><th style="padding:4px 6px; text-align:left;">베이스</th><th style="padding:4px 6px; text-align:left;">→ 보온 코드(예상)</th></tr></thead>
      <tbody>`;
    candidates.forEach(c => {
      html += `<tr><td style="padding:4px 6px; font-family:monospace;">${escapeHtml(c.baseCode)}</td><td style="padding:4px 6px; font-family:monospace; color:#a21caf;">${escapeHtml(c.insulatedCode)}</td></tr>`;
    });
    html += `</tbody></table>
      <button type="button" onclick="InsulationNamingMap.commitBulkPrefix()" class="btn btn-sm btn-secondary" style="margin-top:8px; cursor:pointer;"><i class="fa-solid fa-check"></i> 이 ${candidates.length}개 규칙 저장</button>`;
    previewContainer.innerHTML = html;
  }

  function commitBulkPrefix() {
    const candidates = window.__insBulkCandidates || [];
    const pid = getActivePartyId();
    candidates.forEach(c => addRule(c.baseCode, c.insulatedCode, null, pid));
    window.__insBulkCandidates = null;
    renderUI();
  }

  function addRuleFromForm() {
    const baseEl = document.getElementById('insNewBaseCode');
    const thickEl = document.getElementById('insNewThickness');
    const insEl = document.getElementById('insNewInsulatedCode');
    if (!baseEl || !insEl) return;
    const baseCode = baseEl.value.trim();
    const insulatedCode = insEl.value.trim();
    const thickness = thickEl ? (thickEl.value || null) : null;
    if (!baseCode || !insulatedCode) return;
    addRule(baseCode, insulatedCode, thickness, getActivePartyId());
    renderUI();
  }

  function renderUI() {
    renderCompanyTabs();
    renderRuleTable();
    renderBulkPrefixTool();
  }

  global.InsulationNamingMap = {
    init,
    getActivePartyId,
    setActiveParty,
    getRules,
    getInsulatedDisplayCode,
    addRule,
    removeRule,
    onChange,
    renderUI,
    addRuleFromForm,
    previewBulkPrefix,
    commitBulkPrefix
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { renderUI(); });
    } else {
      setTimeout(renderUI, 0);
    }
  }
})(typeof window !== 'undefined' ? window : this);
