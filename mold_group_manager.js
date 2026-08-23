// =============================================================================
// Mold Group Manager (mold_group_manager.js) -- 금형(Mold) 동일 판넬 그룹핑
// =============================================================================
// The same physical panel (same hydraulic press mold) is sometimes given a
// DIFFERENT partNo depending on where it's used -- e.g. HAYOUNG panel
// "GR-0510-D" used as a bottom panel is instead named "GF-0510-D", even
// though it comes off the exact same mold. parts_db.json correctly keeps
// these as fully independent rows (own name/price) -- that's not the bug.
// What's missing is a way for PRESS MOLD PRODUCTION PLANNING to know these
// N different partNo's are physically one mold, so the same mold isn't
// scheduled twice.
//
// This is PURELY a production-planning grouping layer. It is intentionally
// symmetrical to part_naming.js's canonical-key + lookup-table pattern
// (same localStorage-first + Firestore-merge persistence), but the shape is
// different: part_naming.js maps one canonical partNo -> one label per
// PARTY (customer); this module maps N partNo's, all live at once within
// the SAME customer's BOM, into one mold GROUP.
//
// It never touches BOM/costing: lookupPart/resolveUnifiedPartNo/costing.js
// don't import this module, and it doesn't write back into bomItems.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_mold_groups_v1";
  const FIRESTORE_DOC = "moldGroups";

  // { groups: [ { id, label, partNos: ["GR-0510-D", "GF-0510-D", ...] }, ... ] }
  let state = null;
  let dbRef = null;
  const listeners = [];
  let reverse = {}; // partNo (upper, trimmed) -> group

  function emptyState() {
    return { groups: [] };
  }

  function normalise(s) {
    const groups = Array.isArray(s && s.groups) ? s.groups : [];
    return {
      groups: groups
        .filter(g => g && g.id)
        .map(g => ({
          id: String(g.id),
          label: String(g.label || ''),
          partNos: Array.isArray(g.partNos) ? Array.from(new Set(g.partNos.map(p => String(p).trim()).filter(Boolean))) : []
        }))
    };
  }

  function load() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      state = raw ? normalise(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.error("[MoldGroupManager] localStorage 불러오기 실패:", e);
      state = emptyState();
    }
    rebuildIndex();
  }

  function ensure() {
    if (!state) load();
    return state;
  }

  function rebuildIndex() {
    reverse = {};
    state.groups.forEach(g => {
      g.partNos.forEach(pNo => {
        reverse[pNo.trim().toUpperCase()] = g;
      });
    });
  }

  function persist() {
    rebuildIndex();
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[MoldGroupManager] localStorage 저장 실패:", e);
    }
    if (dbRef) {
      dbRef.collection("settings").doc(FIRESTORE_DOC)
        .set({ state: state, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(err => console.warn("[MoldGroupManager] Firestore 저장 실패 (localStorage에는 저장됨):", err));
    }
    listeners.forEach(fn => { try { fn(); } catch (e) { /* listener's problem */ } });
  }

  function newId() {
    return 'mold_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function getGroups() {
    return ensure().groups.slice();
  }

  function getGroupForPartNo(partNo) {
    if (!partNo) return null;
    ensure();
    return reverse[String(partNo).trim().toUpperCase()] || null;
  }

  function addGroup(label) {
    const s = ensure();
    const g = { id: newId(), label: String(label || '').trim(), partNos: [] };
    s.groups.push(g);
    persist();
    return g;
  }

  function deleteGroup(id) {
    const s = ensure();
    const i = s.groups.findIndex(g => g.id === id);
    if (i === -1) return false;
    s.groups.splice(i, 1);
    persist();
    return true;
  }

  function renameGroup(id, label) {
    const s = ensure();
    const g = s.groups.find(g => g.id === id);
    if (!g) return false;
    g.label = String(label || '').trim();
    persist();
    return true;
  }

  function addPartToGroup(id, partNo) {
    const s = ensure();
    const g = s.groups.find(g => g.id === id);
    const pNo = String(partNo || '').trim();
    if (!g || !pNo) return false;
    // A partNo can only belong to one mold group at a time.
    const existing = getGroupForPartNo(pNo);
    if (existing && existing.id !== id) {
      const idx = existing.partNos.findIndex(p => p.toUpperCase() === pNo.toUpperCase());
      if (idx !== -1) existing.partNos.splice(idx, 1);
    }
    if (!g.partNos.some(p => p.toUpperCase() === pNo.toUpperCase())) g.partNos.push(pNo);
    persist();
    return true;
  }

  function removePartFromGroup(id, partNo) {
    const s = ensure();
    const g = s.groups.find(g => g.id === id);
    if (!g) return false;
    const idx = g.partNos.findIndex(p => p.toUpperCase() === String(partNo || '').trim().toUpperCase());
    if (idx === -1) return false;
    g.partNos.splice(idx, 1);
    persist();
    return true;
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function syncFromFirestore(db) {
    dbRef = db || dbRef;
    if (!dbRef) return Promise.resolve();
    return dbRef.collection("settings").doc(FIRESTORE_DOC).get().then(doc => {
      if (!doc.exists) return;
      const remote = (doc.data() || {}).state;
      if (!remote) return;
      const s = ensure();
      const remoteGroups = normalise(remote).groups;
      const byId = {};
      s.groups.forEach(g => { byId[g.id] = g; });
      remoteGroups.forEach(rg => {
        if (!byId[rg.id]) { s.groups.push(rg); byId[rg.id] = rg; }
      });
      state = normalise(s);
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) { /* ignore */ }
      rebuildIndex();
      listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
    }).catch(err => console.warn("[MoldGroupManager] Firestore 불러오기 실패, localStorage만 사용:", err));
  }

  function init(db) {
    load();
    dbRef = db || null;
    return syncFromFirestore(dbRef);
  }

  // ---------------------------------------------------------------------
  // 금형 생산계획 리포트 -- pure read-only derivation from window.bomItems.
  // Never mutates bomItems; never feeds back into BOM/costing.
  // ---------------------------------------------------------------------
  function buildMoldProductionPlan() {
    const sourceBom = Array.isArray(global.bomItems) ? global.bomItems : [];
    const byGroupKey = {};
    const rows = [];
    sourceBom.forEach(item => {
      if (!item || !item.partNo) return;
      const group = getGroupForPartNo(item.partNo);
      const groupKey = group ? group.id : ('single::' + item.partNo);
      const groupLabel = group ? (group.label || group.partNos.join(' / ')) : item.partNo;
      if (!byGroupKey[groupKey]) {
        byGroupKey[groupKey] = { groupKey, groupLabel, isGroup: !!group, members: {}, total: 0 };
        rows.push(byGroupKey[groupKey]);
      }
      const bucket = byGroupKey[groupKey];
      bucket.total += Number(item.qty) || 0;
      if (!bucket.members[item.partNo]) bucket.members[item.partNo] = { partNo: item.partNo, partName: item.partName || '', qty: 0 };
      bucket.members[item.partNo].qty += Number(item.qty) || 0;
    });
    rows.forEach(r => { r.members = Object.values(r.members); });
    rows.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
    return rows;
  }

  // ---------------------------------------------------------------------
  // UI rendering -- self-contained admin screen: group editor on top,
  // read-only mold production plan report below.
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderGroupEditor() {
    const groups = getGroups();
    if (groups.length === 0) {
      return `<div style="text-align:center; padding:24px; color:#94a3b8; font-size:12.5px; font-weight:600;">
        아직 등록된 금형 그룹이 없습니다. "그룹 추가" 버튼으로 시작하세요.
      </div>`;
    }
    return groups.map(g => `
      <div style="background:#ffffff; border:1.5px solid #0284c7; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
          <input type="text" value="${escapeHtml(g.label)}" placeholder="그룹 라벨 (예: 0510-D 계열)"
            onchange="MoldGroupManager.renameGroup('${g.id}', this.value); MoldGroupManager.renderUI();"
            style="flex:1; min-width:0; border:1px solid #7dd3fc; border-radius:4px; padding:4px 8px; font-size:12px; font-weight:700; color:#0f172a;">
          <button type="button" onclick="if(confirm('이 금형 그룹을 삭제할까요?')) { MoldGroupManager.deleteGroup('${g.id}'); MoldGroupManager.renderUI(); }"
            style="border:1px solid #fca5a5; color:#dc2626; background:#fef2f2; border-radius:6px; padding:4px 10px; font-size:11px; font-weight:700; cursor:pointer;">삭제</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          ${g.partNos.map(pNo => `
            <span style="display:inline-flex; align-items:center; gap:4px; background:#eff6ff; border:1px solid #93c5fd; border-radius:14px; padding:3px 4px 3px 10px; font-size:11.5px; font-weight:700; color:#1d4ed8; font-family:monospace;">
              ${escapeHtml(pNo)}
              <span onclick="MoldGroupManager.removePartFromGroup('${g.id}', '${escapeHtml(pNo)}'); MoldGroupManager.renderUI();"
                style="cursor:pointer; color:#94a3b8; font-weight:900; padding:0 4px;" title="제거">×</span>
            </span>
          `).join('')}
        </div>
        <input type="text" placeholder="Part No. 입력 후 Enter (예: GF-0510-D)"
          onkeydown="if(event.key==='Enter' && this.value.trim()){ MoldGroupManager.addPartToGroup('${g.id}', this.value.trim()); this.value=''; MoldGroupManager.renderUI(); }"
          style="width:100%; box-sizing:border-box; border:1px dashed #94a3b8; border-radius:6px; padding:5px 8px; font-size:11.5px; font-family:monospace;">
      </div>
    `).join('');
  }

  function renderProductionPlan() {
    const rows = buildMoldProductionPlan();
    if (rows.length === 0) {
      return `<div style="text-align:center; padding:24px; color:#94a3b8; font-size:12.5px; font-weight:600;">
        현재 활성 BOM이 없습니다. BOM INPUT에서 "Generate BOM"을 먼저 실행하세요.
      </div>`;
    }
    let html = `<table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
          <th style="padding:8px 10px; text-align:left;">금형 그룹 / Part No.</th>
          <th style="padding:8px 10px; text-align:left;">구성 Part No. 내역</th>
          <th style="padding:8px 10px; text-align:right;">합계 Q'TY</th>
        </tr>
      </thead>
      <tbody>`;
    rows.forEach(r => {
      const memberDetail = r.members.map(m => `${escapeHtml(m.partNo)} (${m.qty})`).join(', ');
      html += `<tr style="border-bottom:1px solid #e2e8f0; ${r.isGroup ? 'background:#fdf4ff;' : ''}">
        <td style="padding:8px 10px; font-weight:800; ${r.isGroup ? 'color:#a21caf;' : 'color:#0284c7; font-family:monospace;'}">${escapeHtml(r.groupLabel)}${r.isGroup ? ' <span style="font-size:9.5px; font-weight:700; background:#f5d0fe; color:#a21caf; padding:1px 6px; border-radius:10px;">동일금형</span>' : ''}</td>
        <td style="padding:8px 10px; font-size:11px; color:#64748b;">${memberDetail}</td>
        <td style="padding:8px 10px; text-align:right; font-weight:800;">${r.total}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    return html;
  }

  function renderUI() {
    const groupContainer = document.getElementById('moldGroupEditorContainer');
    const planContainer = document.getElementById('moldProductionPlanContainer');
    if (groupContainer) groupContainer.innerHTML = renderGroupEditor();
    if (planContainer) planContainer.innerHTML = renderProductionPlan();
  }

  function addGroupAndRender() {
    addGroup('새 금형 그룹');
    renderUI();
  }

  global.MoldGroupManager = {
    init,
    getGroups,
    getGroupForPartNo,
    addGroup,
    deleteGroup,
    renameGroup,
    addPartToGroup,
    removePartFromGroup,
    onChange,
    buildMoldProductionPlan,
    renderUI,
    addGroupAndRender
  };
})(typeof window !== 'undefined' ? window : this);
