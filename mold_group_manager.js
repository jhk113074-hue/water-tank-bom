// =============================================================================
// Mold Group Manager (mold_group_manager.js) -- 회사별 금형(Mold) 판넬 그룹핑 & 생산계획
// =============================================================================
// The same physical panel (same hydraulic press mold) is often given a
// DIFFERENT partNo depending on where it's used in each company's spec:
// e.g. HAYOUNG panel "GR-0510-D" (Roof) vs "GF-0510-D" (Bottom), both coming
// off the exact same 500x1000 mold.
//
// All panel lists and mold groups are strictly organized by pure base panel
// codes (개공/Hole drilling spec 접미사가 제거된 순수 판넬코드: e.g. RF00, BF10, SF10,
// GF-0510-D, GW-1010-D 등).
//
// PURE PRODUCTION PLANNING LAYER:
// Never mutates BOM items or parts_db.json, and never alters pricing/costing.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_mold_groups_v2";
  const LEGACY_STORAGE_KEY = "water_tank_mold_groups_v1";
  const FIRESTORE_DOC = "moldGroups";

  // State shape:
  // {
  //   byParty: {
  //     "default": { groups: [ { id, label, partNos: [...] }, ... ] },
  //     "hayoung_spec": { groups: [ ... ] },
  //     ...
  //   }
  // }
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

  // Helper: Cleans any panel code to its pure base panel code without opening suffixes
  function cleanToPureBaseCode(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim();
    if (!s || s === '-' || s === 'Empty') return '';

    // If it's a hyphenated code like HAYOUNG (e.g. GF-0510-C, GW-1010-A), keep as-is
    if (s.includes('-')) return s;

    // Check standard prefix: 2-4 letters + 2-4 digits + opening suffix
    // e.g. RF00TX -> RF00, SF10SX -> SF10, KF100BX -> KF100, KB200BP -> KB200, KB200BBP -> KB200, KL100HX -> KL100, ST20HUB15 -> ST20
    const matchPrefix = s.match(/^([A-Za-z]{2,4}\d{2,4})([A-Za-z0-9]+)$/);
    if (matchPrefix) {
      const baseCandidate = matchPrefix[1];
      const suffix = matchPrefix[2].toUpperCase();
      const knownSuffixes = [
        'TX', 'BX', 'SX', 'BP', 'HX', 'LX', 'MX', 'SL', 'SR', 'LL', 'LR',
        'BPL', 'BPS', 'BBP', 'HU15', 'SU15', 'HU85', 'HUB15', 'SUB15', 'XX'
      ];
      if (knownSuffixes.includes(suffix) || suffix.length === 2 || suffix.length === 3) {
        return baseCandidate;
      }
    }

    if (global.OpeningCodeUtil && typeof global.OpeningCodeUtil.splitEmbeddedOpeningCode === 'function') {
      const split = global.OpeningCodeUtil.splitEmbeddedOpeningCode(s);
      if (split && split.code && split.openingCode) return split.code;
    }

    return s;
  }

  function normaliseGroup(g) {
    if (!g || !g.id) return null;
    return {
      id: String(g.id),
      label: String(g.label || '').trim(),
      partNos: Array.isArray(g.partNos)
        ? Array.from(new Set(g.partNos.map(p => cleanToPureBaseCode(p)).filter(Boolean)))
        : []
    };
  }

  function normalisePartyGroups(partyObj) {
    const rawGroups = Array.isArray(partyObj && partyObj.groups) ? partyObj.groups : [];
    return {
      groups: rawGroups.map(normaliseGroup).filter(Boolean)
    };
  }

  function normalise(s) {
    if (!s || typeof s !== 'object') return emptyState();
    const byParty = {};

    // 1. Handle byParty mapping
    if (s.byParty && typeof s.byParty === 'object') {
      Object.keys(s.byParty).forEach(pId => {
        byParty[pId] = normalisePartyGroups(s.byParty[pId]);
      });
    }

    // 2. Backward compatibility: if root `groups` exists, migrate to "default"
    if (Array.isArray(s.groups) && s.groups.length > 0) {
      if (!byParty["default"] || byParty["default"].groups.length === 0) {
        byParty["default"] = normalisePartyGroups({ groups: s.groups });
      }
    }

    return { byParty };
  }

  function load() {
    try {
      let raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw && global.localStorage) {
        raw = global.localStorage.getItem(LEGACY_STORAGE_KEY);
      }
      state = raw ? normalise(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.error("[MoldGroupManager] localStorage 불러오기 실패:", e);
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
    if (!s.byParty[pid]) {
      s.byParty[pid] = { groups: [] };
    }
    return s.byParty[pid];
  }

  function persist() {
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
    listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
  }

  function newId() {
    return 'mold_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // -------------------------------------------------------------------------
  // Public Group Management API (Company Specific)
  // -------------------------------------------------------------------------

  function getGroups(partyId) {
    const pState = getPartyState(partyId);
    return pState.groups.slice();
  }

  function getGroupForPartNo(partNo, partyId) {
    if (!partNo) return null;
    const baseClean = cleanToPureBaseCode(partNo).toUpperCase();
    const rawClean = String(partNo).trim().toUpperCase();
    const groups = getGroups(partyId);
    for (const g of groups) {
      if (g.partNos.some(p => {
        const pUpper = p.toUpperCase();
        return pUpper === baseClean || pUpper === rawClean;
      })) {
        return g;
      }
    }
    return null;
  }

  function addGroup(label, initialParts, partyId) {
    const pState = getPartyState(partyId);
    const parts = Array.isArray(initialParts)
      ? initialParts.map(p => cleanToPureBaseCode(p)).filter(Boolean)
      : [];
    const g = { id: newId(), label: String(label || '').trim(), partNos: [] };
    pState.groups.push(g);
    if (parts.length > 0) {
      parts.forEach(p => addPartToGroup(g.id, p, partyId));
    } else {
      persist();
    }
    return g;
  }

  function deleteGroup(id, partyId) {
    const pState = getPartyState(partyId);
    const i = pState.groups.findIndex(g => g.id === id);
    if (i === -1) return false;
    pState.groups.splice(i, 1);
    persist();
    return true;
  }

  function renameGroup(id, label, partyId) {
    const pState = getPartyState(partyId);
    const g = pState.groups.find(g => g.id === id);
    if (!g) return false;
    g.label = String(label || '').trim();
    persist();
    return true;
  }

  function addPartToGroup(id, partNo, partyId) {
    const pState = getPartyState(partyId);
    const g = pState.groups.find(g => g.id === id);
    const pNo = cleanToPureBaseCode(partNo);
    if (!g || !pNo) return false;

    // A partNo can belong to only one mold group within the same company preset
    const existing = getGroupForPartNo(pNo, partyId);
    if (existing && existing.id !== id) {
      const idx = existing.partNos.findIndex(p => p.toUpperCase() === pNo.toUpperCase());
      if (idx !== -1) existing.partNos.splice(idx, 1);
    }
    if (!g.partNos.some(p => p.toUpperCase() === pNo.toUpperCase())) {
      g.partNos.push(pNo);
    }
    persist();
    return true;
  }

  function removePartFromGroup(id, partNo, partyId) {
    const pState = getPartyState(partyId);
    const g = pState.groups.find(g => g.id === id);
    if (!g) return false;
    const cleanTarget = cleanToPureBaseCode(partNo).toUpperCase();
    const idx = g.partNos.findIndex(p => p.toUpperCase() === cleanTarget);
    if (idx === -1) return false;
    g.partNos.splice(idx, 1);
    persist();
    return true;
  }

  function setActiveParty(partyId) {
    selectedPartyId = partyId;
    renderUI();
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

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
          s.byParty[pid].groups.forEach(g => { byId[g.id] = g; });
          remoteState.byParty[pid].groups.forEach(rg => {
            if (!byId[rg.id]) {
              s.byParty[pid].groups.push(rg);
              byId[rg.id] = rg;
            }
          });
        }
      });

      persist();
    }).catch(err => console.warn("[MoldGroupManager] Firestore 불러오기 실패, localStorage만 사용:", err));
  }

  function init(db) {
    load();
    dbRef = db || null;
    renderUI();
    return syncFromFirestore(dbRef).then(() => {
      renderUI();
    });
  }

  // -------------------------------------------------------------------------
  // Company Panel Extractor
  // Extracts all pure base panel part numbers for a specific customer preset.
  // -------------------------------------------------------------------------
  function getCompanyPanels(partyId) {
    const pid = partyId || getActivePartyId();
    const panelMap = new Map(); // basePartNo (upper) -> { partNo, nameKo, nameEn, spec, category }
    const partsDb = Array.isArray(global.partsDb) ? global.partsDb : [];

    const custPresetList = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = custPresetList.find(c => String(c.id) === pid);
    const uName = curCust ? String(curCust.name || '').toUpperCase() : '';
    const isDefault = pid === 'default' || uName.includes('YSACC');
    const isHayoung = uName.includes('HAYOUNG') || pid === 'hayoung_spec';

    // 1. Collect all panels referenced in this company's panel matrices (Options 0..4)
    [0, 1, 2, 3, 4].forEach(optNum => {
      let matrix = null;
      if (typeof global.getCustomerMatrixStorage === 'function') {
        matrix = global.getCustomerMatrixStorage(pid, optNum);
      }
      if (Array.isArray(matrix)) {
        matrix.forEach(row => {
          if (!row || !row.heightGrades) return;
          Object.keys(row.heightGrades).forEach(hGrade => {
            const rawVal = row.heightGrades[hGrade];
            const baseCode = cleanToPureBaseCode(rawVal);
            if (!baseCode) return;

            // For Hayoung preset, ignore YSACC fallback panels if Hayoung panels exist
            if (isHayoung && !baseCode.startsWith('G') && !baseCode.startsWith('H-')) {
              return;
            }

            const upper = baseCode.toUpperCase();
            if (!panelMap.has(upper)) {
              const dbMatch = partsDb.find(p => p && p.partNo && cleanToPureBaseCode(p.partNo).toUpperCase() === upper) ||
                              partsDb.find(p => p && p.partNo && p.partNo.toUpperCase() === upper);
              panelMap.set(upper, {
                partNo: baseCode,
                nameKo: dbMatch ? (dbMatch.nameKo || dbMatch.nameEn || '') : '',
                nameEn: dbMatch ? (dbMatch.nameEn || dbMatch.nameKo || '') : '',
                spec: dbMatch ? (dbMatch.spec || '') : '',
                category: dbMatch ? (dbMatch.category || 'PANEL') : 'PANEL'
              });
            }
          });
        });
      }
    });

    // 2. Also search partsDb for panels matching this customer's prefix
    if (isHayoung) {
      partsDb.filter(p => p && p.partNo && (p.partNo.startsWith('G') || p.partNo.startsWith('H-')) && (p.category || '').toUpperCase() === 'PANEL')
        .forEach(p => {
          const baseCode = cleanToPureBaseCode(p.partNo);
          const upper = baseCode.toUpperCase();
          if (!panelMap.has(upper)) {
            panelMap.set(upper, {
              partNo: baseCode,
              nameKo: p.nameKo || p.nameEn || '',
              nameEn: p.nameEn || p.nameKo || '',
              spec: p.spec || '',
              category: p.category || 'PANEL'
            });
          }
        });
    }

    let panels = Array.from(panelMap.values());

    // If company is NOT default YSACC and has custom company-specific panels (e.g. Starting with G, K, M, W, etc.),
    // filter OUT unconfigured default YSACC fallback panels!
    if (!isDefault) {
      const ysaccPrefixes = ['SF', 'SL', 'ST', 'PF', 'PH', 'NF', 'NH', 'NQ', 'BF', 'RF', 'MF', 'DF', 'HF', 'KH'];
      const isYsaccCode = u => ysaccPrefixes.some(pre => u.startsWith(pre));

      const hasCustomPanels = panels.some(p => {
        const u = p.partNo.toUpperCase();
        return isHayoung ? (u.startsWith('G') || u.startsWith('H-')) : !isYsaccCode(u);
      });
      if (hasCustomPanels) {
        panels = panels.filter(p => {
          const u = p.partNo.toUpperCase();
          if (isHayoung) {
            return u.startsWith('G') || u.startsWith('H-');
          }
          return !isYsaccCode(u);
        });
      }
    }

    panels.sort((a, b) => a.partNo.localeCompare(b.partNo));
    return panels;
  }

  // -------------------------------------------------------------------------
  // Mold Production Plan (금형 생산계획) -- Pure Read-Only Derivation
  // -------------------------------------------------------------------------
  function buildMoldProductionPlan(partyId) {
    const pid = partyId || (global.activeBOMCustomerPresetId || getActivePartyId());
    const sourceBom = Array.isArray(global.bomItems) ? global.bomItems : [];
    const byGroupKey = {};
    const rows = [];

    // Filter to panel items only
    const panelItems = sourceBom.filter(item => {
      if (!item || !item.partNo) return false;
      const cat = String(item.category || '').toUpperCase().trim();
      const pNo = String(item.partNo).toUpperCase();
      return cat === 'PANEL' || cat === 'PANELS' || pNo.startsWith('RF') || pNo.startsWith('MF') ||
             pNo.startsWith('BF') || pNo.startsWith('NF') || pNo.startsWith('SF') || pNo.startsWith('SL') ||
             pNo.startsWith('ST') || pNo.startsWith('PF') || pNo.startsWith('PH') || pNo.startsWith('G');
    });

    panelItems.forEach(item => {
      // Prefer the pre-insulation-relabel base code (set by insulation_naming_map.js's
      // display-code substitution) so mold identity never depends on insulation status --
      // the same physical mold produces both the insulated and non-insulated panel.
      const basePartNo = cleanToPureBaseCode(item.baseCode || item.partNo);
      const group = getGroupForPartNo(basePartNo, pid) || getGroupForPartNo(item.partNo, pid);
      const groupKey = group ? group.id : ('single::' + basePartNo);
      const groupLabel = group ? (group.label || group.partNos.join(' / ')) : basePartNo;

      if (!byGroupKey[groupKey]) {
        byGroupKey[groupKey] = { groupKey, groupLabel, isGroup: !!group, members: {}, total: 0 };
        rows.push(byGroupKey[groupKey]);
      }
      const bucket = byGroupKey[groupKey];
      bucket.total += Number(item.qty) || 0;
      if (!bucket.members[basePartNo]) {
        bucket.members[basePartNo] = { partNo: basePartNo, partName: item.partName || '', qty: 0 };
      }
      bucket.members[basePartNo].qty += Number(item.qty) || 0;
    });

    rows.forEach(r => { r.members = Object.values(r.members); });
    rows.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
    return rows;
  }

  // -------------------------------------------------------------------------
  // UI Rendering
  // -------------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderCompanyPresetTabs() {
    const customers = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [
      { id: 'default', name: 'YSACC Spec' }
    ];
    const activePid = getActivePartyId();
    const activeBOMId = String(global.activeBOMCustomerPresetId || 'default');

    let html = `<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">`;
    customers.forEach(c => {
      const cid = String(c.id);
      const isSelected = cid === activePid;
      const isActiveBOM = cid === activeBOMId;
      const bg = isSelected ? 'var(--neon-blue, #0284c7)' : '#ffffff';
      const color = isSelected ? '#ffffff' : '#334155';
      const border = isSelected ? 'none' : '1px solid #cbd5e1';

      html += `
        <button type="button" class="btn btn-sm" onclick="MoldGroupManager.setActiveParty('${cid}')" style="height:32px; padding:0 12px; font-size:11.5px; font-weight:bold; background:${bg}; color:${color}; border:${border}; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:5px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <i class="fa-solid fa-building"></i>
          <span>${escapeHtml(c.name)}</span>
          ${isActiveBOM ? '<span style="font-size:9.5px; background:#22c55e; color:#fff; padding:1px 5px; border-radius:8px; margin-left:3px;">Active BOM</span>' : ''}
        </button>
      `;
    });
    html += `</div>`;
    return html;
  }

  function renderCompanyPanelCatalog(partyId) {
    const panels = getCompanyPanels(partyId);
    const groups = getGroups(partyId);

    if (panels.length === 0) {
      return `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:12px;">
        No panels registered in this company's PANEL CONFIG.
      </div>`;
    }

    let html = `
      <div style="max-height: 480px; overflow-y: auto; padding-right: 4px;">
        <div style="display:flex; flex-direction:column; gap:6px;">
    `;

    panels.forEach(p => {
      const assignedGroup = getGroupForPartNo(p.partNo, partyId);
      const isAssigned = !!assignedGroup;

      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid ${isAssigned ? '#e2e8f0' : '#bae6fd'}; border-left:3px solid ${isAssigned ? '#a21caf' : '#0284c7'}; border-radius:6px; padding:6px 10px; gap:8px;">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-family:monospace; font-weight:800; font-size:12px; color:#0284c7;">${escapeHtml(p.partNo)}</span>
              ${p.nameEn || p.nameKo ? `<span style="font-size:11px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">(${escapeHtml(p.nameEn || p.nameKo)})</span>` : ''}
            </div>
            ${p.spec ? `<div style="font-size:10px; color:#94a3b8;">${escapeHtml(p.spec)}</div>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            ${isAssigned ? `
              <span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; background:#fdf4ff; color:#a21caf; border:1px dashed #d946ef; padding:2px 8px; border-radius:10px;" title="Assigned to Mold Group">
                <i class="fa-solid fa-layer-group"></i> ${escapeHtml(assignedGroup.label || 'Group')}
                <span onclick="MoldGroupManager.removePartFromGroup('${assignedGroup.id}', '${escapeHtml(p.partNo)}', '${partyId}'); MoldGroupManager.renderUI();" style="cursor:pointer; font-weight:900; margin-left:2px; color:#c026d3;" title="Unassign">×</span>
              </span>
            ` : `
              <select onchange="if(this.value){ if(this.value==='__NEW__'){ MoldGroupManager.createGroupWithPanel('${escapeHtml(p.partNo)}', '${partyId}'); } else { MoldGroupManager.addPartToGroup(this.value, '${escapeHtml(p.partNo)}', '${partyId}'); MoldGroupManager.renderUI(); } }"
                style="font-size:10.5px; font-weight:700; border:1px solid #7dd3fc; border-radius:4px; padding:2px 6px; background:#f0f9ff; color:#0369a1; cursor:pointer; outline:none;">
                <option value="">+ Assign Mold Group ▼</option>
                ${groups.map(g => `<option value="${g.id}">${escapeHtml(g.label || 'Group ' + g.id)}</option>`).join('')}
                <option value="__NEW__">+ Create New Mold Group...</option>
              </select>
            `}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
    return html;
  }

  function renderGroupEditor(partyId) {
    const groups = getGroups(partyId);
    const companyPanels = getCompanyPanels(partyId);
    const unassignedPanels = companyPanels.filter(p => !getGroupForPartNo(p.partNo, partyId));

    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-size:11.5px; color:#64748b;">Group panels that share the same hydraulic press molds.</span>
        <button type="button" onclick="MoldGroupManager.addGroupAndRender('${partyId}')" class="btn btn-sm btn-primary" style="cursor:pointer; font-size:11.5px; padding:3px 10px;">
          <i class="fa-solid fa-plus"></i> Add New Mold Group
        </button>
      </div>
    `;

    if (groups.length === 0) {
      html += `
        <div style="text-align:center; padding:30px; background:#ffffff; border:1px dashed #cbd5e1; border-radius:8px; color:#94a3b8; font-size:12.5px; font-weight:600;">
          <i class="fa-solid fa-layer-group" style="font-size:24px; color:#94a3b8; margin-bottom:8px; display:block;"></i>
          No mold groups registered yet.<br>
          <span style="font-size:11px; font-weight:400; color:#64748b;">Click "+ Assign Mold Group" on the left panel list or use "Add New Mold Group" above.</span>
        </div>
      `;
      return html;
    }

    html += `<div style="display:flex; flex-direction:column; gap:10px; max-height:480px; overflow-y:auto; padding-right:4px;">`;

    groups.forEach((g, gIdx) => {
      html += `
        <div style="background:#ffffff; border:1.5px solid #0284c7; border-radius:8px; padding:10px 12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <span style="font-size:11px; font-weight:800; color:#0284c7; background:#e0f2fe; padding:2px 6px; border-radius:4px;">Group ${gIdx + 1}</span>
            <input type="text" value="${escapeHtml(g.label)}" placeholder="Mold Group Name (e.g. 500x1000 Standard Mold, GR/GF-0510 Series)"
              onchange="MoldGroupManager.renameGroup('${g.id}', this.value, '${partyId}'); MoldGroupManager.renderUI();"
              style="flex:1; min-width:0; border:1px solid #7dd3fc; border-radius:4px; padding:4px 8px; font-size:12px; font-weight:700; color:#0f172a;">
            <button type="button" onclick="if(confirm('Delete mold group [${escapeHtml(g.label)}]?')) { MoldGroupManager.deleteGroup('${g.id}', '${partyId}'); MoldGroupManager.renderUI(); }"
              style="border:1px solid #fca5a5; color:#dc2626; background:#fef2f2; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer;" title="Delete Group">Delete</button>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px; min-height:26px; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px; margin-bottom:8px;">
            ${g.partNos.length === 0 ? `<span style="font-size:11px; color:#94a3b8;">No panels assigned. Select a panel below to add.</span>` : ''}
            ${g.partNos.map(pNo => `
              <span style="display:inline-flex; align-items:center; gap:4px; background:#eff6ff; border:1px solid #93c5fd; border-radius:14px; padding:2px 4px 2px 10px; font-size:11.5px; font-weight:700; color:#1d4ed8; font-family:monospace;">
                ${escapeHtml(pNo)}
                <span onclick="MoldGroupManager.removePartFromGroup('${g.id}', '${escapeHtml(pNo)}', '${partyId}'); MoldGroupManager.renderUI();"
                  style="cursor:pointer; color:#94a3b8; font-weight:900; padding:0 3px;" title="Remove">×</span>
              </span>
            `).join('')}
          </div>

          <div style="display:flex; gap:6px; align-items:center;">
            <select onchange="if(this.value){ MoldGroupManager.addPartToGroup('${g.id}', this.value, '${partyId}'); this.value=''; MoldGroupManager.renderUI(); }"
              style="flex:1; border:1px dashed #94a3b8; border-radius:4px; padding:4px 8px; font-size:11.5px; font-family:monospace; background:#ffffff; color:#334155; cursor:pointer;">
              <option value="">+ Select panel code to add to group ▼</option>
              ${unassignedPanels.map(p => `<option value="${escapeHtml(p.partNo)}">${escapeHtml(p.partNo)} ${p.nameEn || p.nameKo ? '(' + escapeHtml(p.nameEn || p.nameKo) + ')' : ''}</option>`).join('')}
            </select>
            <input type="text" placeholder="Type panel code and press Enter (e.g. GF-0510-D, SF10)"
              onkeydown="if(event.key==='Enter' && this.value.trim()){ MoldGroupManager.addPartToGroup('${g.id}', this.value.trim(), '${partyId}'); this.value=''; MoldGroupManager.renderUI(); }"
              style="flex:1; box-sizing:border-box; border:1px dashed #94a3b8; border-radius:4px; padding:4px 8px; font-size:11.5px; font-family:monospace;">
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  function renderProductionPlan() {
    const activePid = getActivePartyId();
    const rows = buildMoldProductionPlan(activePid);

    if (rows.length === 0) {
      return `<div style="text-align:center; padding:24px; color:#94a3b8; font-size:12.5px; font-weight:600;">
        No panel items in the active BOM. Run "Generate BOM" in BOM INPUT first.
      </div>`;
    }

    let totalMoldQty = 0;
    rows.forEach(r => totalMoldQty += r.total);

    let html = `
      <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:700; color:#334155;">
          Total Mold Press Production Qty (Active BOM): <span style="font-size:14px; font-weight:800; color:#0284c7;">${totalMoldQty}</span> EA
        </span>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
            <th style="padding:8px 10px; text-align:left;">Mold Group / Part No.</th>
            <th style="padding:8px 10px; text-align:left;">Member Part Nos</th>
            <th style="padding:8px 10px; text-align:right;">Total Q'TY</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      const memberDetail = r.members.map(m => `${escapeHtml(m.partNo)} (${m.qty})`).join(', ');
      html += `
        <tr style="border-bottom:1px solid #e2e8f0; ${r.isGroup ? 'background:#fdf4ff;' : ''}">
          <td style="padding:8px 10px; font-weight:800; ${r.isGroup ? 'color:#a21caf;' : 'color:#0284c7; font-family:monospace;'}">
            ${escapeHtml(r.groupLabel)}
            ${r.isGroup ? ' <span style="font-size:9.5px; font-weight:700; background:#f5d0fe; color:#a21caf; padding:1px 6px; border-radius:10px;">Shared Mold</span>' : ''}
          </td>
          <td style="padding:8px 10px; font-size:11px; color:#64748b;">${memberDetail}</td>
          <td style="padding:8px 10px; text-align:right; font-weight:800; font-size:13px; color:#0f172a;">${r.total}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  function renderUI() {
    const partyId = getActivePartyId();
    const customers = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = customers.find(c => String(c.id) === partyId);
    const partyName = curCust ? curCust.name : 'YSACC Spec';

    // 1. Company Preset Tabs Container
    const tabsContainer = document.getElementById('moldGroupCompanyTabsContainer');
    if (tabsContainer) {
      tabsContainer.innerHTML = renderCompanyPresetTabs();
    }

    // 2. Company Panel Catalog Container
    const catalogContainer = document.getElementById('moldCompanyPanelCatalogContainer');
    if (catalogContainer) {
      catalogContainer.innerHTML = renderCompanyPanelCatalog(partyId);
    }

    const catalogTitle = document.getElementById('moldCompanyCatalogTitle');
    if (catalogTitle) {
      catalogTitle.innerHTML = `<i class="fa-solid fa-list-check"></i> [${escapeHtml(partyName)}] Panel Codes`;
    }

    // 3. Group Editor Container
    const groupContainer = document.getElementById('moldGroupEditorContainer');
    if (groupContainer) {
      groupContainer.innerHTML = renderGroupEditor(partyId);
    }

    const groupTitle = document.getElementById('moldGroupEditorTitle');
    if (groupTitle) {
      groupTitle.innerHTML = `<i class="fa-solid fa-layer-group"></i> [${escapeHtml(partyName)}] Mold Groups`;
    }

    // 4. Production Plan Container
    const planContainer = document.getElementById('moldProductionPlanContainer');
    if (planContainer) {
      planContainer.innerHTML = renderProductionPlan();
    }
  }

  function addGroupAndRender(partyId) {
    const pid = partyId || getActivePartyId();
    addGroup('New Mold Group', [], pid);
    renderUI();
  }

  function createGroupWithPanel(partNo, partyId) {
    const pid = partyId || getActivePartyId();
    const pNo = cleanToPureBaseCode(partNo);
    const g = addGroup(`${pNo} Mold Group`, [pNo], pid);
    renderUI();
    return g;
  }

  global.MoldGroupManager = {
    init,
    cleanToPureBaseCode,
    getActivePartyId,
    setActiveParty,
    getGroups,
    getGroupForPartNo,
    getCompanyPanels,
    addGroup,
    deleteGroup,
    renameGroup,
    addPartToGroup,
    removePartFromGroup,
    onChange,
    buildMoldProductionPlan,
    renderUI,
    addGroupAndRender,
    createGroupWithPanel
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { renderUI(); });
    } else {
      setTimeout(renderUI, 0);
    }
  }
})(typeof window !== 'undefined' ? window : this);
