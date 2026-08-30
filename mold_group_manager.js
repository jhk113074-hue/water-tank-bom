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

  function isCodeBelongingToParty(code, pid) {
    if (!code) return false;
    const u = cleanToPureBaseCode(code).toUpperCase();
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

  function normaliseGroup(g, pid) {
    if (!g || !g.id) return null;
    let parts = Array.isArray(g.partNos)
      ? Array.from(new Set(g.partNos.map(p => cleanToPureBaseCode(p)).filter(Boolean)))
      : [];
    if (pid) {
      parts = parts.filter(p => isCodeBelongingToParty(p, pid));
    }
    return {
      id: String(g.id),
      label: String(g.label || '').trim(),
      partNos: parts
    };
  }

  function normalisePartyGroups(partyObj, pid) {
    const rawGroups = Array.isArray(partyObj && partyObj.groups) ? partyObj.groups : [];
    return {
      groups: rawGroups.map(g => normaliseGroup(g, pid)).filter(g => g && g.partNos.length > 0)
    };
  }

  function normalise(s) {
    if (!s || typeof s !== 'object') return emptyState();
    const byParty = {};

    // 1. Handle byParty mapping
    if (s.byParty && typeof s.byParty === 'object') {
      Object.keys(s.byParty).forEach(pId => {
        byParty[pId] = normalisePartyGroups(s.byParty[pId], pId);
      });
    }

    // 2. Backward compatibility: if root `groups` exists, migrate to "default"
    if (Array.isArray(s.groups) && s.groups.length > 0) {
      if (!byParty["default"] || byParty["default"].groups.length === 0) {
        byParty["default"] = normalisePartyGroups({ groups: s.groups }, "default");
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

  function getDefaultPartyGroups(partyId) {
    const pid = String(partyId || '').toLowerCase();
    if (pid === 'almuftah' || pid.includes('almuftah')) {
      return [
        { id: 'mold_almuftah_base_1x1', label: 'ALMUFTAH Base 1x1M', partNos: ['KB100', 'KB200', 'KB300', 'KB400', 'KB500'] },
        { id: 'mold_almuftah_base_half', label: 'ALMUFTAH Base Half 1x0.5M', partNos: ['KH100', 'KH200', 'KH300', 'KH400', 'KH500'] },
        { id: 'mold_almuftah_base_quarter', label: 'ALMUFTAH Base Quarter 0.5x0.5M', partNos: ['KQ100', 'KQ200', 'KQ300', 'KQ400', 'KQ500'] },
        { id: 'mold_almuftah_side_1x1', label: 'ALMUFTAH Side 1x1M', partNos: ['KL100', 'KF100', 'KL200', 'KL300', 'KF300', 'KL400', 'KF400', 'KL500', 'KF500'] },
        { id: 'mold_almuftah_side_1x15', label: 'ALMUFTAH Side 1x1.5M', partNos: ['KL150', 'LM150'] },
        { id: 'mold_almuftah_side_1x20', label: 'ALMUFTAH Side 1x2.0M', partNos: ['TM200'] },
        { id: 'mold_almuftah_side_half', label: 'ALMUFTAH Side Half 1x0.5M', partNos: ['KH10C', 'KH150', 'KH25C', 'KH35C', 'KH40C', 'KH45C', 'KH50C'] },
        { id: 'mold_almuftah_side_quarter', label: 'ALMUFTAH Side Quarter 0.5x0.5M', partNos: ['KQ10C'] },
        { id: 'mold_almuftah_roof', label: 'ALMUFTAH Roof 1x1M', partNos: ['KM000', 'KT000'] },
        { id: 'mold_almuftah_partition_1x1', label: 'ALMUFTAH Partition 1x1M', partNos: ['LP100', 'LP200', 'LP300', 'LP400', 'LP500'] },
        { id: 'mold_almuftah_partition_half', label: 'ALMUFTAH Partition Half 1x0.5M', partNos: ['LPH000', 'LPH100', 'LPH150', 'LPH200', 'LPH250', 'LPH350', 'LPH400', 'LPH500'] }
      ];
    }
    if (pid.includes('hayoung')) {
      return [
        { id: 'mold_hayoung_floor_1x1', label: 'HAYOUNG Floor 1x1M', partNos: ['GF-1010-A', 'GF-1010-B', 'GF-1010-C', 'GF-1010-D', 'GF-1010-SA'] },
        { id: 'mold_hayoung_floor_half', label: 'HAYOUNG Floor Half 1x0.5M', partNos: ['GF-0510-B', 'GF-0510-C', 'GF-0510-D'] },
        { id: 'mold_hayoung_floor_quarter', label: 'HAYOUNG Floor Quarter 0.5x0.5M', partNos: ['GF-0505-D'] },
        { id: 'mold_hayoung_wall_1x1', label: 'HAYOUNG Wall 1x1M', partNos: ['GW-1010-A', 'GW-1010-B', 'GW-1010-C', 'GW-1010-D', 'GW-1010-IA', 'GW-1010-IIA'] },
        { id: 'mold_hayoung_wall_1x15', label: 'HAYOUNG Wall 1x1.5M', partNos: ['GW-1015-D'] },
        { id: 'mold_hayoung_wall_1x20', label: 'HAYOUNG Wall 1x2.0M', partNos: ['GW-1020-D'] },
        { id: 'mold_hayoung_wall_half', label: 'HAYOUNG Wall Half 1x0.5M', partNos: ['GW-0510-C', 'GW-0510-D', 'GW-0510-IA'] },
        { id: 'mold_hayoung_wall_quarter', label: 'HAYOUNG Wall Quarter 0.5x0.5M', partNos: ['GW-0505-D', 'GW-0505-IA'] },
        { id: 'mold_hayoung_roof_1x1', label: 'HAYOUNG Roof 1x1M', partNos: ['KM-1010-LA', 'KM-1010-LB', 'KM-1010-LB-ECO', 'KM-1010-LC', 'KM-1010-LD', 'KM-1010-LIA', 'KM-1010-LIIA', 'KM-1010-LSA', 'KM-1010-UD', 'KM-1010-UD-ECO'] },
        { id: 'mold_hayoung_roof_half', label: 'HAYOUNG Roof Half 1x0.5M', partNos: ['KM-0510-LA', 'KM-0510-LB', 'KM-0510-LB-ECO', 'KM-0510-LC', 'KM-0510-LD', 'KM-0510-LIA', 'KM-0510-LIIA', 'KM-0510-LSA', 'KM-0510-UD', 'KM-0510-UD-ECO'] },
        { id: 'mold_hayoung_partition_1x1', label: 'HAYOUNG Partition 1x1M', partNos: ['GP-1010-D-ECO'] },
        { id: 'mold_hayoung_partition_half', label: 'HAYOUNG Partition Half 1x0.5M', partNos: ['GP-0510-A', 'GP-0510-B', 'GP-0510-C', 'GP-0510-D', 'GP-0510-D-ECO', 'GP-0510-SA'] },
        { id: 'mold_hayoung_partition_quarter', label: 'HAYOUNG Partition Quarter 0.5x0.5M', partNos: ['GP-0505-D'] }
      ];
    }
    if (pid.includes('mnt')) {
      return [
        { id: 'mold_mnt_base_1x1', label: 'MNT Base 1x1M', partNos: ['BF10M', 'BF20M', 'BF30M', 'BF40M', 'BF45M', 'BF50M', 'DN10M', 'DN20M', 'DN30M', 'DN40M', 'DN50M'] },
        { id: 'mold_mnt_base_half', label: 'MNT Base Half 1x0.5M', partNos: ['BH10M', 'BH20M', 'BH30M', 'BH40M', 'BH50M'] },
        { id: 'mold_mnt_base_quarter', label: 'MNT Base Quarter 0.5x0.5M', partNos: ['BQ10M', 'BQ20M', 'BQ30M', 'BQ40M', 'BQ50M'] },
        { id: 'mold_mnt_side_1x1', label: 'MNT Side 1x1M', partNos: ['SF10S', 'SF20S', 'SF25M', 'SF30S', 'SF35M', 'SF40S', 'SF45L', 'SF50S'] },
        { id: 'mold_mnt_side_1x15', label: 'MNT Side 1x1.5M', partNos: ['SL15S'] },
        { id: 'mold_mnt_side_1x20', label: 'MNT Side 1x2.0M', partNos: ['SL20S'] },
        { id: 'mold_mnt_side_half', label: 'MNT Side Half 1x0.5M', partNos: ['SH10S', 'SH20L', 'SH25M', 'SH30M', 'SH35M', 'SH40M', 'SH45L', 'SH50L'] },
        { id: 'mold_mnt_side_quarter', label: 'MNT Side Quarter 0.5x0.5M', partNos: ['SQ10T'] },
        { id: 'mold_mnt_roof', label: 'MNT Roof 1x1M', partNos: ['MF00M', 'RH10', 'RQ10'] },
        { id: 'mold_mnt_partition_1x1', label: 'MNT Partition 1x1M', partNos: ['PF10M', 'PF20M', 'PF30M', 'PF40M', 'PF50M'] },
        { id: 'mold_mnt_partition_half', label: 'MNT Partition Half 1x0.5M', partNos: ['PH10M', 'PH20M', 'PH30M', 'PH40M', 'PH50M'] }
      ];
    }
    // Default YSACC & WATANI
    return [
      { id: 'mold_default_base_1x1', label: 'YSACC Base 1x1M', partNos: ['BF10', 'BF15', 'BF20', 'BF25', 'BF30', 'BF35', 'BF40', 'BF45', 'BF50', 'DF10', 'DF20', 'DF30', 'DF40', 'DF50'] },
      { id: 'mold_default_base_half', label: 'YSACC Base Half 1x0.5M', partNos: ['NH10', 'NH15', 'NH20', 'NH25', 'NH30', 'NH35', 'NH40', 'NH45', 'NH50'] },
      { id: 'mold_default_base_quarter', label: 'YSACC Base Quarter 0.5x0.5M', partNos: ['NQ10', 'NQ15'] },
      { id: 'mold_default_side_1x1', label: 'YSACC Side 1x1M', partNos: ['SF10', 'SF15', 'SF20', 'SF25', 'SF30', 'SF35', 'SF40', 'SF45', 'SF50', 'NF10', 'NF15', 'NF20', 'NF25', 'NF30', 'NF35', 'NF40', 'NF45', 'NF50'] },
      { id: 'mold_default_side_1x15', label: 'YSACC Side 1x1.5M', partNos: ['SL15'] },
      { id: 'mold_default_side_1x20', label: 'YSACC Side 1x2.0M', partNos: ['ST20'] },
      { id: 'mold_default_side_half', label: 'YSACC Side Half 1x0.5M', partNos: ['KH25', 'KH45'] },
      { id: 'mold_default_roof', label: 'YSACC Roof 1x1M', partNos: ['RF00', 'MF00'] },
      { id: 'mold_default_partition_1x1', label: 'YSACC Partition 1x1M', partNos: ['PF10', 'PF15', 'PF20', 'PF25', 'PF30', 'PF35', 'PF40', 'PF45', 'PF50'] },
      { id: 'mold_default_partition_half', label: 'YSACC Partition Half 1x0.5M', partNos: ['PH10', 'PH15', 'PH20', 'PH25', 'PH30', 'PH35', 'PH40', 'PH45', 'PH50'] }
    ];
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
        s.byParty[pid] = { groups: [] };
      }
    }
    if (s.byParty[pid].groups.length === 0) {
      s.byParty[pid].groups = getDefaultPartyGroups(pid);
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
        .set({ jsonState: JSON.stringify(state), updatedAt: new Date().toISOString() }, { merge: false })
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
      const data = doc.data() || {};
      const remote = data.jsonState ? JSON.parse(data.jsonState) : data.state;
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
    const isDefault = pid === 'default' || uName.includes('YSACC') || pid === 'watani' || uName.includes('WATANI');
    const isHayoung = uName.includes('HAYOUNG') || pid === 'hayoung_spec';
    const isAlmuftah = pid === 'almuftah' || uName.includes('ALMUFTAH');
    const isMnt = pid === 'mnt_spec' || pid === 'mnt' || uName.includes('MNT');

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

            if (isHayoung && !baseCode.startsWith('G') && !baseCode.startsWith('H-') && !baseCode.startsWith('KM-')) {
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
      partsDb.filter(p => p && p.partNo && (p.partNo.startsWith('GW-') || p.partNo.startsWith('GF-') || p.partNo.startsWith('GP-') || p.partNo.startsWith('KM-') || p.partNo.startsWith('G') || p.partNo.startsWith('H-')) && (p.category || '').toUpperCase() === 'PANEL')
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

    if (isAlmuftah) {
      partsDb.filter(p => p && p.partNo && (p.partNo.startsWith('K') || p.partNo.startsWith('LM') || p.partNo.startsWith('TM') || p.partNo.startsWith('LP')) && (p.category || '').toUpperCase() === 'PANEL')
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

    if (isMnt) {
      partsDb.filter(p => p && p.partNo && (p.partNo.endsWith('M') || p.partNo.endsWith('S') || p.partNo.startsWith('DN') || p.partNo.startsWith('RH') || p.partNo.startsWith('RQ')) && (p.category || '').toUpperCase() === 'PANEL')
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

    if (isDefault) {
      partsDb.filter(p => {
        if (!p || !p.partNo || (p.category || '').toUpperCase() !== 'PANEL') return false;
        const u = p.partNo.toUpperCase();
        if (u.endsWith('M') || u.endsWith('S') || u.startsWith('DN') || u.startsWith('RH') || u.startsWith('RQ')) return false;
        if (u.startsWith('K') || u.startsWith('LM') || u.startsWith('TM') || u.startsWith('LP')) return false;
        if (u.startsWith('GW-') || u.startsWith('GF-') || u.startsWith('GP-') || u.startsWith('KM-') || u.startsWith('G-') || u.startsWith('H-')) return false;
        return u.startsWith('SF') || u.startsWith('SL') || u.startsWith('ST') || u.startsWith('BF') || u.startsWith('PF') || u.startsWith('PH') || u.startsWith('RF') || u.startsWith('MF') || u.startsWith('DF') || u.startsWith('NH') || u.startsWith('NQ') || u === 'KH25' || u === 'KH45';
      }).forEach(p => {
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

    if (!isDefault) {
      const ysaccPrefixes = ['SF', 'SL', 'ST', 'PF', 'PH', 'NF', 'NH', 'NQ', 'BF', 'RF', 'MF', 'DF', 'HF'];
      const isYsaccCode = u => ysaccPrefixes.some(pre => u.startsWith(pre));

      const hasCustomPanels = panels.some(p => {
        const u = p.partNo.toUpperCase();
        if (isHayoung) return u.startsWith('G') || u.startsWith('H-') || u.startsWith('KM-');
        if (isAlmuftah) return u.startsWith('K') || u.startsWith('LM') || u.startsWith('TM') || u.startsWith('LP');
        if (isMnt) return u.endsWith('M') || u.endsWith('S') || u.startsWith('DN') || u.startsWith('RH') || u.startsWith('RQ');
        return !isYsaccCode(u);
      });
      if (hasCustomPanels) {
        panels = panels.filter(p => {
          const u = p.partNo.toUpperCase();
          if (isHayoung) return u.startsWith('G') || u.startsWith('H-') || u.startsWith('KM-');
          if (isAlmuftah) return u.startsWith('K') || u.startsWith('LM') || u.startsWith('TM') || u.startsWith('LP');
          if (isMnt) return u.endsWith('M') || u.endsWith('S') || u.startsWith('DN') || u.startsWith('RH') || u.startsWith('RQ');
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
