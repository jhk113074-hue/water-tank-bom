/**
 * Bolt Logic Setting & Calculation Audit Sheet Module
 * Water Tank BOM System - Bolt Calculation Sheet & Setting Replication
 * 
 * Supports adding, editing, and deleting bolts for each section (ROOF, BOTTOM, SIDE, PARTITION, STEEL SKID, etc.)
 */

(function () {
  const window = typeof globalThis.window !== 'undefined' ? globalThis.window : globalThis;
  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function boltRules() {
    return (typeof AccessoriesRules !== 'undefined' && AccessoriesRules.boltsAndNuts) ? AccessoriesRules.boltsAndNuts : null;
  }

  function buildLibLocationMap(rules) {
    const map = {};
    (rules.rows || []).forEach((row) => {
      if (row.lib) {
        if (!map[row.lib]) map[row.lib] = [];
        const label = row.label;
        if (label && map[row.lib].indexOf(label) === -1) map[row.lib].push(label);
      }
      if (row.libByOption) {
        Object.keys(row.libByOption).forEach((optKey) => {
          const optLib = row.libByOption[optKey];
          if (!map[optLib]) map[optLib] = [];
          const label = row.label + ` (Option ${optKey}: R/F Plastic)`;
          if (label && map[optLib].indexOf(label) === -1) map[optLib].push(label);
        });
      }
    });
    return map;
  }

  function buildDefaultItems() {
    const rules = boltRules();
    if (!rules || !rules.libraryCatalog) return [];
    const locMap = buildLibLocationMap(rules);
    return Object.keys(rules.libraryCatalog)
      .map(Number)
      .sort((a, b) => a - b)
      .map((libId) => {
        const cat = rules.libraryCatalog[libId];
        const locs = locMap[libId] || [];
        return {
          id: libId,
          location: locs.length ? locs.join(' / ') : ('BoltnNuts Lib #' + libId),
          dia: cat.dia,
          length: cat.length,
          washer: cat.washer,
          nut: cat.nut,
          boltName: cat.boltName
        };
      });
  }

  let boltSettings = { items: buildDefaultItems() };
  let customBoltRows = [];
  let deletedRowIds = new Set();
  let boltLocationOverrides = {};

  // Panel Hole Joint Bolt Customizations
  let activeBoltSubView = 'standard'; // 'standard' | 'joint_engine'
  let jointBoltOverrides = {}; // rowId -> { libId, dia, length, boltName, add, customLabel, materialOverrides }
  let customJointBoltRows = []; // array of custom joint bolt rows
  let deletedJointBoltIds = new Set();
  const JOINT_BOLT_SETTINGS_KEY = 'water_tank_joint_bolt_custom_settings_v1';

  // Variables available inside a bolt row's quantity formula
  const BOLT_FORMULA_VAR_HINT =
    "Available variables: W_C, W_F, L_C, L_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O, L_O, RF(1=Internal/2=External), L2_O, R1(Roof 1m=8), R05(Roof 0.5m=4) · Other row IDs (e.g. AP5, AP18) can also be referenced";

  const COMPANY_PRESETS_KEY = 'water_tank_bolt_company_presets_v1';
  let companyBoltPresets = null;
  let activeBoltParty = 'YSACC (Default)';

  function getPartyList() {
    const pn = (typeof PartNaming !== 'undefined') ? PartNaming : null;
    let list = (pn && typeof pn.listParties === 'function') ? pn.listParties() : ['YSACC (Default)', 'MNT', 'WATANI', 'ALMUFTAH'];
    if (list.indexOf('YSACC (Default)') === -1) list.unshift('YSACC (Default)');
    return list.filter(p => p !== '표준' && p !== '표준 (Standard)' && p !== 'YSACC (도면 표기)' && p !== 'YSACC');
  }

  function getActivePartyName() {
    const pn = (typeof PartNaming !== 'undefined') ? PartNaming : null;
    if (activeBoltParty) return activeBoltParty;
    if (pn && typeof pn.activeParty === 'function') {
      const p = pn.activeParty();
      if (p && p !== '표준' && p !== '표준 (Standard)') return p;
    }
    return 'YSACC (Default)';
  }

  function captureCurrentCompanyState() {
    const rules = boltRules();
    const formulaOverrides = {};
    if (rules && Array.isArray(rules.rows)) {
      rules.rows.forEach(r => {
        if (!r._defaultFormula) r._defaultFormula = r.formula;
        if (r.formula && r._defaultFormula && r.formula !== r._defaultFormula) {
          formulaOverrides[r.id] = r.formula;
        }
      });
    }
    return {
      boltSettings: JSON.parse(JSON.stringify(boltSettings)),
      customBoltRows: JSON.parse(JSON.stringify(customBoltRows)),
      deletedRowIds: Array.from(deletedRowIds),
      boltLocationOverrides: JSON.parse(JSON.stringify(boltLocationOverrides)),
      holesPerM_Roof1x1: (rules && rules.holesPerM_Roof1x1) || 8,
      holesPerM_Roof05x1: (rules && rules.holesPerM_Roof05x1) || 4,
      formulaOverrides: formulaOverrides,
      jointBoltOverrides: JSON.parse(JSON.stringify(jointBoltOverrides)),
      customJointBoltRows: JSON.parse(JSON.stringify(customJointBoltRows)),
      deletedJointBoltIds: Array.from(deletedJointBoltIds)
    };
  }

  function applyCompanyState(data) {
    if (!data) {
      boltSettings = { items: buildDefaultItems() };
      customBoltRows = [];
      deletedRowIds = new Set();
      boltLocationOverrides = {};
      jointBoltOverrides = {};
      customJointBoltRows = [];
      deletedJointBoltIds = new Set();
      return;
    }
    if (data.boltSettings && Array.isArray(data.boltSettings.items)) {
      boltSettings = { items: JSON.parse(JSON.stringify(data.boltSettings.items)) };
    } else {
      boltSettings = { items: buildDefaultItems() };
    }
    if (Array.isArray(data.customBoltRows)) {
      customBoltRows = JSON.parse(JSON.stringify(data.customBoltRows));
    } else {
      customBoltRows = [];
    }
    if (Array.isArray(data.deletedRowIds)) {
      deletedRowIds = new Set(data.deletedRowIds);
    } else {
      deletedRowIds = new Set();
    }
    if (data.boltLocationOverrides && typeof data.boltLocationOverrides === 'object') {
      boltLocationOverrides = JSON.parse(JSON.stringify(data.boltLocationOverrides));
    } else {
      boltLocationOverrides = {};
    }
    if (data.jointBoltOverrides && typeof data.jointBoltOverrides === 'object') {
      jointBoltOverrides = JSON.parse(JSON.stringify(data.jointBoltOverrides));
    } else {
      jointBoltOverrides = {};
    }
    if (Array.isArray(data.customJointBoltRows)) {
      customJointBoltRows = JSON.parse(JSON.stringify(data.customJointBoltRows));
    } else {
      customJointBoltRows = [];
    }
    if (Array.isArray(data.deletedJointBoltIds)) {
      deletedJointBoltIds = new Set(data.deletedJointBoltIds);
    } else {
      deletedJointBoltIds = new Set();
    }
    const rules = boltRules();
    if (rules) {
      if (data.holesPerM_Roof1x1 != null) rules.holesPerM_Roof1x1 = data.holesPerM_Roof1x1;
      if (data.holesPerM_Roof05x1 != null) rules.holesPerM_Roof05x1 = data.holesPerM_Roof05x1;

      // Apply per-company formula overrides
      if (Array.isArray(rules.rows)) {
        const overrides = data.formulaOverrides || {};
        rules.rows.forEach(r => {
          if (!r._defaultFormula) r._defaultFormula = r.formula;
          if (overrides[r.id]) {
            r.formula = overrides[r.id];
          } else {
            r.formula = r._defaultFormula;
          }
        });
      }
    }
  }

  function loadSavedBoltSettings() {
    activeBoltParty = getActivePartyName();
    let loadedPresets = null;
    try {
      const raw = localStorage.getItem(COMPANY_PRESETS_KEY);
      if (raw) loadedPresets = JSON.parse(raw);
    } catch (e) {
      console.warn('[BoltLogicAudit] Failed to parse company presets:', e);
    }

    if (loadedPresets && typeof loadedPresets === 'object') {
      companyBoltPresets = loadedPresets;
    } else {
      // Migrate from legacy single-company storage
      companyBoltPresets = {};
      const legacyState = {
        boltSettings: { items: buildDefaultItems() },
        customBoltRows: [],
        deletedRowIds: [],
        boltLocationOverrides: {},
        holesPerM_Roof1x1: 8,
        holesPerM_Roof05x1: 4,
        formulaOverrides: {}
      };

      const saved = localStorage.getItem('water_tank_bolt_logic_settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const savedItems = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
          const byId = {};
          savedItems.forEach((it) => { if (it && it.id !== undefined) byId[it.id] = it; });
          legacyState.boltSettings.items = legacyState.boltSettings.items.map((it) => {
            const ov = byId[it.id];
            if (!ov) return it;
            return Object.assign({}, it, {
              location: (typeof ov.location === 'string' && ov.location.trim() && ov.location.trim() !== '0') ? ov.location.trim() : it.location,
              boltName: (typeof ov.boltName === 'string' && ov.boltName.trim()) ? ov.boltName.trim() : it.boltName,
              dia: (ov.dia != null && ov.dia !== '') ? Number(ov.dia) : it.dia,
              length: (ov.length != null && ov.length !== '') ? Number(ov.length) : it.length,
              washer: (ov.washer != null && ov.washer !== '') ? Number(ov.washer) : it.washer,
              nut: (ov.nut != null && ov.nut !== '') ? Number(ov.nut) : it.nut
            });
          });
        } catch (e) {}
      }

      try {
        const savedLoc = localStorage.getItem('water_tank_bolt_location_overrides');
        if (savedLoc) legacyState.boltLocationOverrides = JSON.parse(savedLoc);
        const savedCustom = localStorage.getItem('water_tank_custom_bolt_rows');
        if (savedCustom) legacyState.customBoltRows = JSON.parse(savedCustom);
        const savedDeleted = localStorage.getItem('water_tank_deleted_bolt_rows');
        if (savedDeleted) legacyState.deletedRowIds = JSON.parse(savedDeleted);
        const saved1x1 = localStorage.getItem('water_tank_holes_roof_1x1');
        if (saved1x1 !== null) legacyState.holesPerM_Roof1x1 = parseInt(saved1x1, 10) || 8;
        const saved05x1 = localStorage.getItem('water_tank_holes_roof_05x1');
        if (saved05x1 !== null) legacyState.holesPerM_Roof05x1 = parseInt(saved05x1, 10) || 4;
      } catch (e) {}

      companyBoltPresets['YSACC (Default)'] = legacyState;
      companyBoltPresets['MNT'] = JSON.parse(JSON.stringify(legacyState));
      companyBoltPresets['WATANI'] = JSON.parse(JSON.stringify(legacyState));
      companyBoltPresets['ALMUFTAH'] = JSON.parse(JSON.stringify(legacyState));
    }

    if (!companyBoltPresets[activeBoltParty]) {
      companyBoltPresets[activeBoltParty] = JSON.parse(JSON.stringify(companyBoltPresets['YSACC (Default)'] || captureCurrentCompanyState()));
    }
    applyCompanyState(companyBoltPresets[activeBoltParty]);
  }

  window.updateHolesPerM1x1 = function(val, inputEl) {
    const num = parseInt(val, 10) || 8;
    const rules = boltRules();
    if (rules) rules.holesPerM_Roof1x1 = num;
    saveBoltSettings(true);

    if (inputEl) {
      inputEl.style.backgroundColor = '#dcfce7';
      inputEl.style.borderColor = '#16a34a';
      setTimeout(() => {
        if (inputEl) {
          inputEl.style.backgroundColor = '#ffffff';
          inputEl.style.borderColor = '#cbd5e1';
        }
      }, 1000);
    }
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.updateHolesPerM05x1 = function(val, inputEl) {
    const num = parseInt(val, 10) || 4;
    const rules = boltRules();
    if (rules) rules.holesPerM_Roof05x1 = num;
    saveBoltSettings(true);

    if (inputEl) {
      inputEl.style.backgroundColor = '#dcfce7';
      inputEl.style.borderColor = '#16a34a';
      setTimeout(() => {
        if (inputEl) {
          inputEl.style.backgroundColor = '#ffffff';
          inputEl.style.borderColor = '#cbd5e1';
        }
      }, 1000);
    }
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  function saveBoltSettings(silent = false) {
    if (!companyBoltPresets) companyBoltPresets = {};
    companyBoltPresets[activeBoltParty] = captureCurrentCompanyState();

    try {
      localStorage.setItem(COMPANY_PRESETS_KEY, JSON.stringify(companyBoltPresets));
      localStorage.setItem('water_tank_bolt_logic_settings', JSON.stringify(boltSettings));
      localStorage.setItem('water_tank_custom_bolt_rows', JSON.stringify(customBoltRows));
      localStorage.setItem('water_tank_deleted_bolt_rows', JSON.stringify(Array.from(deletedRowIds)));
      localStorage.setItem('water_tank_bolt_location_overrides', JSON.stringify(boltLocationOverrides));
    } catch (e) {
      console.warn('[BoltLogicAudit] Failed to save presets to localStorage:', e);
    }

    if (window.db) {
      window.db.collection('settings').doc('boltLogicPresets')
        .set({ presets: companyBoltPresets, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(err => console.warn('[BoltLogicAudit] Firestore sync failed:', err));
    }

    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
    if (!silent) {
      alert(`[${activeBoltParty}] Bolt settings and changes saved successfully.`);
    }
  }

  window.selectBoltCompanyParty = function (partyName, updateUrl = true) {
    if (!partyName) return;
    const parties = getPartyList();
    const cleanTarget = String(partyName).toLowerCase().trim();
    let matched = parties.find(p => p.toLowerCase().trim() === cleanTarget || (cleanTarget === 'ysacc' && p.startsWith('YSACC')));
    if (!matched) matched = partyName.trim();

    if (activeBoltParty && companyBoltPresets) {
      companyBoltPresets[activeBoltParty] = captureCurrentCompanyState();
    }

    activeBoltParty = matched;
    if (typeof PartNaming !== 'undefined' && typeof PartNaming.setActiveParty === 'function') {
      PartNaming.setActiveParty(matched);
    }

    if (!companyBoltPresets[matched]) {
      companyBoltPresets[matched] = JSON.parse(JSON.stringify(companyBoltPresets['YSACC (Default)'] || captureCurrentCompanyState()));
    }
    applyCompanyState(companyBoltPresets[matched]);

    try {
      localStorage.setItem(COMPANY_PRESETS_KEY, JSON.stringify(companyBoltPresets));
    } catch (e) {}

    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
    if (updateUrl && typeof window.updateBoltUrlHash === 'function') {
      window.updateBoltUrlHash(true);
    }
  };

  window.addBoltCompanyPrompt = function () {
    const newName = prompt('Enter new bolt company/client preset name (e.g. HYUNDAI, SAMHO, MNT):');
    if (!newName || !newName.trim()) return;
    const cleanName = newName.trim();
    const parties = getPartyList();
    if (parties.indexOf(cleanName) !== -1) {
      alert('A company with this name already exists.');
      return;
    }
    if (typeof PartNaming !== 'undefined' && typeof PartNaming.addParty === 'function') {
      PartNaming.addParty(cleanName);
    }
    companyBoltPresets[cleanName] = JSON.parse(JSON.stringify(companyBoltPresets['YSACC (Default)'] || captureCurrentCompanyState()));
    window.selectBoltCompanyParty(cleanName, true);
  };

  window.copyBoltCompanyPrompt = function () {
    const cur = activeBoltParty || 'YSACC (Default)';
    const newName = prompt(`Enter new company name to copy [${cur}] bolt spec:`, cur + ' (Copy)');
    if (!newName || !newName.trim()) return;
    const cleanName = newName.trim();
    const parties = getPartyList();
    if (parties.indexOf(cleanName) !== -1) {
      alert('A company with this name already exists.');
      return;
    }
    if (typeof PartNaming !== 'undefined' && typeof PartNaming.addParty === 'function') {
      PartNaming.addParty(cleanName);
    }
    companyBoltPresets[cleanName] = JSON.parse(JSON.stringify(companyBoltPresets[cur] || captureCurrentCompanyState()));
    window.selectBoltCompanyParty(cleanName, true);
  };

  window.renameBoltCompanyPrompt = function () {
    const cur = activeBoltParty || 'YSACC (Default)';
    if (cur === 'YSACC (Default)' || cur === '표준' || cur === '표준 (Standard)') {
      alert('Cannot rename the default YSACC Spec.');
      return;
    }
    const newName = prompt(`Enter new name for [${cur}]:`, cur);
    if (!newName || !newName.trim() || newName.trim() === cur) return;
    const cleanName = newName.trim();
    const parties = getPartyList();
    if (parties.indexOf(cleanName) !== -1) {
      alert('A company with this name already exists.');
      return;
    }
    companyBoltPresets[cleanName] = companyBoltPresets[cur];
    delete companyBoltPresets[cur];
    if (typeof PartNaming !== 'undefined' && typeof PartNaming.renameParty === 'function') {
      PartNaming.renameParty(cur, cleanName);
    }
    window.selectBoltCompanyParty(cleanName, true);
  };

  window.deleteBoltCompanyPrompt = function () {
    const cur = activeBoltParty || 'YSACC (Default)';
    if (cur === 'YSACC (Default)' || cur === '표준' || cur === '표준 (Standard)') {
      alert('Cannot delete the default YSACC Spec.');
      return;
    }
    if (!confirm(`Are you sure you want to delete the bolt spec preset for [${cur}]?`)) return;
    delete companyBoltPresets[cur];
    if (typeof PartNaming !== 'undefined' && typeof PartNaming.removeParty === 'function') {
      PartNaming.removeParty(cur);
    }
    window.selectBoltCompanyParty('YSACC (Default)', true);
  };

  window.updateBoltUrlHash = function (updateUrl) {
    if (updateUrl === false) return;
    if (typeof window === 'undefined') return;
    const cur = activeBoltParty || 'YSACC (Default)';
    let hash = 'bolt-logic';
    if (cur && cur !== 'YSACC (Default)' && cur !== '표준' && cur !== '표준 (Standard)') {
      hash += '/' + encodeURIComponent(cur.toLowerCase().trim());
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + hash);
    } else {
      window.location.hash = hash;
    }
  };

  function buildCompanyTabsBar() {
    const parties = getPartyList();
    const cur = activeBoltParty || 'YSACC (Default)';

    let s = '<div class="bolt-company-tabs-bar" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03); width:100%; box-sizing:border-box;">';
    
    // Left: Company tab list
    s += '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">';
    s += '<span style="font-size:12px; font-weight:800; color:#334155; margin-right:4px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-bolt" style="color:#d97706;"></i> Bolt Company Preset:</span>';
    
    parties.forEach(function (p) {
      const isActive = (p === cur);
      const isDefault = (p === 'YSACC (Default)');
      s += '<div style="display:inline-flex; align-items:center; position:relative;">' +
        '<button type="button" class="bolt-company-tab' + (isActive ? ' active' : '') + '" onclick="window.selectBoltCompanyParty(\'' + escapeAttr(p) + '\')" style="padding:6px 14px; font-size:12px; font-weight:800; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.15s ease; border:' + (isActive ? '2px solid #0284c7; background:#e0f2fe; color:#0369a1;' : '1.5px solid #cbd5e1; background:#ffffff; color:#475569;') + '">' +
          '<span>🔩 ' + escapeAttr(p) + '</span>' +
          (isDefault ? '<span style="font-size:10px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:1px 5px; border-radius:4px;">Default</span>' : '') +
          (isActive ? '<span style="font-size:10px; font-weight:700; background:#0284c7; color:#ffffff; padding:1px 5px; border-radius:4px;">Active</span>' : '') +
        '</button>' +
        '</div>';
    });
    s += '</div>';

    // Right: Action buttons (Add, Copy, Rename, Delete)
    s += '<div style="display:flex; align-items:center; gap:6px;">';
    s += '<button type="button" onclick="window.addBoltCompanyPrompt()" style="background:#0284c7; color:#ffffff; border:none; border-radius:6px; padding:5px 12px; font-size:11.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(2,132,199,0.2);"><i class="fa-solid fa-plus"></i> + Add Preset</button>';
    s += '<button type="button" onclick="window.copyBoltCompanyPrompt()" style="background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-copy"></i> Copy Spec</button>';
    s += '<button type="button" onclick="window.renameBoltCompanyPrompt()" style="background:#f8fafc; color:#334155; border:1.5px solid #cbd5e1; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-pen"></i> Rename</button>';
    s += '<button type="button" onclick="window.deleteBoltCompanyPrompt()" style="background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-trash"></i> Delete</button>';
    s += '</div>';

    s += '</div>';
    return s;
  }

  window.deleteBoltSettingItem = function(rowId) {
    deletedRowIds.add(rowId);
    saveBoltSettings(true);
  };

  function resetBoltSettings() {
    if (confirm('Restore bolt logic settings and custom modifications to initial default values?')) {
      companyBoltPresets[activeBoltParty] = {
        boltSettings: { items: buildDefaultItems() },
        customBoltRows: [],
        deletedRowIds: [],
        boltLocationOverrides: {},
        holesPerM_Roof1x1: 8,
        holesPerM_Roof05x1: 4
      };
      applyCompanyState(companyBoltPresets[activeBoltParty]);
      saveBoltSettings(true);
    }
  }

  function deriveBoltName(item) {
    const prevName = item.boltName || '';
    const prefixMatch = /^([A-Za-z]+-)/.exec(prevName);
    const prefix = prefixMatch ? prefixMatch[1] : 'WBT-';
    if (prefix === 'WNT-' || prefix === 'WFW-') {
      return prefix + 'M' + item.dia;
    }
    const suffixMatch = /^[A-Za-z]+-[0-9]+([A-Za-z]*)$/.exec(prevName);
    const suffix = suffixMatch ? suffixMatch[1] : '';
    const lenPart = item.length ? String(item.length) : '';
    return prefix + item.dia + lenPart + suffix;
  }

  window.updateBoltSettingField = function (idx, field, rawValue, inputEl) {
    const item = boltSettings.items[idx];
    if (!item) return;
    if (field === 'boltName' || field === 'location') {
      item[field] = String(rawValue).trim();
    } else {
      item[field] = parseInt(rawValue, 10) || 0;
      if (field === 'dia' || field === 'length') {
        item.boltName = deriveBoltName(item);
      }
    }

    localStorage.setItem('water_tank_bolt_logic_settings', JSON.stringify(boltSettings));

    // Sync Washer & Nut ratios with boltRecipes (Recipe Manager)
    if (typeof boltRecipes !== 'undefined' && item.boltName) {
      const bName = (item.boltName || '').trim();
      const matchRecipeKey = Object.keys(boltRecipes).find(k => k === bName || k.endsWith(bName) || bName.includes(k) || k.includes(bName));
      if (matchRecipeKey && boltRecipes[matchRecipeKey]) {
        const recipeArr = boltRecipes[matchRecipeKey];
        if (field === 'nut' && recipeArr[1]) recipeArr[1].ratio = item.nut;
        if (field === 'washer' && recipeArr[2]) recipeArr[2].ratio = item.washer;
        localStorage.setItem('custom_bolt_recipes', JSON.stringify(boltRecipes));
        if (typeof renderBoltRecipes === 'function') renderBoltRecipes();
      }
    }

    if (inputEl) {
      inputEl.style.backgroundColor = '#dcfce7';
      inputEl.style.borderColor = '#16a34a';
      setTimeout(() => {
        if (inputEl) {
          inputEl.style.backgroundColor = '';
          inputEl.style.borderColor = '';
        }
      }, 1000);
    }

    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  function currentOverrides() {
    const overrides = {};
    boltSettings.items.forEach((it) => {
      if (it.boltName) overrides[it.id] = it.boltName;
    });
    return overrides;
  }

  function resolvePartyNameFromPresetId(presetId) {
    if (!presetId) return getActivePartyName();
    const cleanId = String(presetId).toLowerCase().trim();
    const map = {
      'default': 'YSACC (Default)',
      'ysacc': 'YSACC (Default)',
      'mnt_spec': 'MNT',
      'mnt': 'MNT',
      'watani_spec': 'WATANI',
      'watani': 'WATANI',
      'hayoung_spec': 'HAYOUNG',
      'hayoung': 'HAYOUNG',
      'almuftah': 'ALMUFTAH'
    };
    if (map[cleanId]) return map[cleanId];
    const parties = getPartyList();
    const found = parties.find(p => p.toLowerCase().includes(cleanId));
    return found || getActivePartyName();
  }

  window.getBoltCatalogOverrides = function (presetId) {
    loadSavedBoltSettings();
    const partyName = resolvePartyNameFromPresetId(presetId);
    const partyData = (companyBoltPresets && companyBoltPresets[partyName]) || null;
    const items = (partyData && partyData.boltSettings && Array.isArray(partyData.boltSettings.items))
      ? partyData.boltSettings.items
      : boltSettings.items;
    const overrides = {};
    items.forEach((it) => {
      if (it.boltName) overrides[it.id] = it.boltName;
    });
    return overrides;
  };

  window.getCustomBoltRows = function (presetId) {
    loadSavedBoltSettings();
    const partyName = resolvePartyNameFromPresetId(presetId);
    const partyData = (companyBoltPresets && companyBoltPresets[partyName]) || null;
    return (partyData && Array.isArray(partyData.customBoltRows)) ? partyData.customBoltRows : customBoltRows;
  };

  window.getDeletedBoltRowIds = function (presetId) {
    loadSavedBoltSettings();
    const partyName = resolvePartyNameFromPresetId(presetId);
    const partyData = (companyBoltPresets && companyBoltPresets[partyName]) || null;
    return (partyData && Array.isArray(partyData.deletedRowIds)) ? new Set(partyData.deletedRowIds) : deletedRowIds;
  };

  function init(db) {
    loadSavedBoltSettings();
    if (db) {
      db.collection('settings').doc('boltLogicPresets').get()
        .then(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data && data.presets && typeof data.presets === 'object') {
              console.log('[BoltLogicAudit] Loaded company bolt presets from Firestore');
              companyBoltPresets = data.presets;
              try {
                localStorage.setItem(COMPANY_PRESETS_KEY, JSON.stringify(companyBoltPresets));
              } catch (e) {}
              const currentParty = getActivePartyName();
              if (companyBoltPresets[currentParty]) {
                applyCompanyState(companyBoltPresets[currentParty]);
              }
              renderBoltAuditView();
            }
          }
        })
        .catch(err => console.warn('[BoltLogicAudit] Firestore load failed:', err));
    }
  }

  window.BoltLogicAudit = {
    init: init,
    selectParty: window.selectBoltCompanyParty,
    getPresets: () => companyBoltPresets,
    saveBoltSettings: saveBoltSettings
  };

  function numFromInput(id, fallback) {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? fallback : v;
  }

  function getTankDimensions() {
    const l1 = numFromInput('tankLength1', 3);
    const l2 = numFromInput('tankLength2', 0);
    const l3 = numFromInput('tankLength3', 0);
    const l4 = numFromInput('tankLength4', 0);
    const width = numFromInput('tankWidth', 3.5);
    const height = numFromInput('tankHeight', 1.5);
    const partitionEl = document.getElementById('numPartition');
    const numPartition = partitionEl ? (parseInt(partitionEl.value, 10) || 0) : 0;
    return {
      l1, l2, l3, l4, length: l1 + l2 + l3 + l4,
      width, height,
      numPartition, partition: numPartition > 0
    };
  }
  window.getTankDimensions = getTankDimensions;

  function getIsIntReinf() {
    const el = document.getElementById('reinfMethod');
    return el ? el.value !== 'External' : true;
  }

  function getMaterialOption() {
    const el = document.getElementById('boltMaterial');
    return el ? (parseInt(el.value, 10) || 2) : 2;
  }

  function getSidePanelOnly() {
    const el = document.getElementById('sidePanelOnly');
    return el ? el.value === '1x1' : false;
  }

  let materialCellOverrides = {};

  function loadSavedMaterialCellOverrides() {
    try {
      const saved = localStorage.getItem('water_tank_bolt_material_cell_overrides');
      if (saved) materialCellOverrides = JSON.parse(saved);
    } catch(e) {
      materialCellOverrides = {};
    }
  }

  function resolvePartNoForOption(row, optValue, overrides, rowId) {
    if (rowId && materialCellOverrides[rowId + '_' + optValue]) {
      return materialCellOverrides[rowId + '_' + optValue];
    }
    if (!row) return '';
    if (row.literal) {
      const ov = overrides && overrides[row.id];
      return (ov && String(ov).trim()) || row.literal;
    }
    const libId = (row.libByOption && row.libByOption[optValue]) || row.lib;
    if (!libId || !row.suffix) return row.item || '';
    const ov = overrides && overrides[libId];
    const rules = boltRules();
    const base = (ov && String(ov).trim()) || (rules && rules.libraryNames[libId]) || '';
    return base + row.suffix[optValue - 1];
  }

  window.updateBoltMaterialOverride = function(rowId, optValue, rawVal, inputEl) {
    const val = String(rawVal || '').trim();
    const key = rowId + '_' + optValue;
    if (val) {
      materialCellOverrides[key] = val;
    } else {
      delete materialCellOverrides[key];
    }
    localStorage.setItem('water_tank_bolt_material_cell_overrides', JSON.stringify(materialCellOverrides));

    if (inputEl) {
      inputEl.style.backgroundColor = '#dcfce7';
      inputEl.style.borderColor = '#16a34a';
      setTimeout(() => {
        if (inputEl) {
          inputEl.style.backgroundColor = '';
          inputEl.style.borderColor = '';
        }
      }, 1000);
    }

    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  // Returns { value, error }. error is null on success; on an invalid
  // formula (unknown variable, syntax error, non-numeric result) value is 0
  // and error holds a human-readable reason, so callers can distinguish a
  // formula that legitimately evaluates to 0 from one that's just broken.
  function evalCustomFormula(formulaStr, g, apValues) {
    const trimmed = String(formulaStr || '').trim();
    if (!trimmed) return { value: 0, error: null };
    if (!isNaN(Number(trimmed))) return { value: Number(trimmed), error: null };

    const W_C = g && g.W ? g.W.whole : 0;
    const W_F = g && g.W ? g.W.half : 0;
    const W_O = g && g.W ? g.W.value : 0;
    const L1_C = g && g.L1 ? g.L1.whole : 0;
    const L1_F = g && g.L1 ? g.L1.half : 0;
    const L1_O = g && g.L1 ? g.L1.value : 0;
    const L2_C = g && g.L2 ? g.L2.whole : 0;
    const L2_F = g && g.L2 ? g.L2.half : 0;
    const L2_O = g && g.L2 ? g.L2.value : 0;
    const L3_C = g && g.L3 ? g.L3.whole : 0;
    const L3_F = g && g.L3 ? g.L3.half : 0;
    const L3_O = g && g.L3 ? g.L3.value : 0;
    const L4_C = g && g.L4 ? g.L4.whole : 0;
    const L4_F = g && g.L4 ? g.L4.half : 0;
    const L4_O = g && g.L4 ? g.L4.value : 0;
    const L_C = g && g.L_C_sum != null ? g.L_C_sum : (L1_C + L2_C + L3_C + L4_C);
    const L_F = g && g.L_F_sum != null ? g.L_F_sum : (L1_F + L2_F + L3_F + L4_F);
    const H_O = g && g.H ? g.H.value : 0;
    const H_C = g && g.H ? g.H.whole : 0;
    const H_F = g && g.H ? g.H.half : 0;
    const N_PA = g && g.n_partitions != null ? g.n_partitions : 0;
    const L_O = L1_O + L2_O + L3_O + L4_O;
    const RF = typeof getIsIntReinf === 'function' && getIsIntReinf() ? 1 : 2;

    const vars = {
      W_C, W_F, W_O,
      L_C, L_F, L_O,
      L1_C, L1_F, L1_O,
      L2_C, L2_F, L2_O,
      L3_C, L3_F, L3_O,
      L4_C, L4_F, L4_O,
      H_O, H_C, H_F,
      N_PA, RF
    };

    const scope = Object.assign({}, vars, apValues);
    try {
      const keys = Object.keys(scope);
      const vals = Object.values(scope);
      const fn = new Function(...keys, 'return (' + trimmed + ');');
      const res = fn(...vals);
      if (typeof res === 'number' && !isNaN(res)) return { value: res, error: null };
      return { value: 0, error: 'Formula result is not a number.' };
    } catch (e) {
      return { value: 0, error: e.message };
    }
  }

  // Compute live per-assembly-location breakdown including custom & deleted rows
  function computeBoltAuditData(dim) {
    const rules = boltRules();
    if (!rules || typeof PanelEngine === 'undefined' || typeof AccessoriesEngine === 'undefined') return [];

    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      console.warn('[BoltLogicAudit] PanelEngine.makeGeometry failed:', e);
      return [];
    }

    const isIntReinf = getIsIntReinf();
    const materialOption = getMaterialOption();
    const overrides = currentOverrides();
    // Panel-side company preset (YSACC/HAYOUNG/...) -- NOT the bolt vendor
    // tab above -- needed so joint_bolt_engine.js can look up registered
    // panel_hole_spec.js data for the panels this preset actually uses.
    const panelPresetId = (window.getActiveCustomerPresetObj && window.getActiveCustomerPresetObj())
      ? window.getActiveCustomerPresetObj().id
      : (window.selectedCustomerPresetId || 'default');
    const { detail } = AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides, getSidePanelOnly(), panelPresetId);

    const computedRowValues = {};

    let rows = detail
      .filter(d => !deletedRowIds.has(d.id))
      .map((d) => {
        const q = Math.round(d.value);
        computedRowValues[d.id] = q;
        return {
          rowId: d.id,
          group: d.section || 'OTHER',
          item: d.partNo || '-',
          loc: boltLocationOverrides[d.id] || d.label || d.id,
          qty: q,
          add: Math.ceil(d.value * 0.05),
          isCustom: false
        };
      });

    // Append custom bolt rows with dynamic formula evaluation
    customBoltRows.forEach(c => {
      if (!deletedRowIds.has(c.rowId)) {
        let calcQty = Number(c.qty) || 0;
        let formulaError = null;
        if (c.formula && typeof c.formula === 'string' && c.formula.trim() !== '') {
          const evalResult = evalCustomFormula(c.formula, g, computedRowValues);
          calcQty = evalResult.value;
          formulaError = evalResult.error;
        }
        const finalQty = Math.round(calcQty);
        computedRowValues[c.rowId] = finalQty;
        rows.push({
          rowId: c.rowId,
          group: c.group || 'OTHER',
          item: c.item || 'WBT-1035',
          loc: c.loc || 'Custom Bolt Item',
          qty: finalQty,
          add: c.add != null ? Number(c.add) : Math.ceil(finalQty * 0.05),
          formula: c.formula || String(finalQty),
          formulaError: formulaError,
          isCustom: true
        });
      }
    });

    return rows;
  }

  window.closeAddCustomBoltModal = function() {
    const modal = document.getElementById('addCustomBoltModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  };

  // Exposed Add Custom Bolt Row Modal Trigger
  window.addCustomBoltRowPrompt = function(groupName) {
    try {
      const modal = document.getElementById('addCustomBoltModal');
      if (!modal) {
        console.error('[addCustomBoltRowPrompt] addCustomBoltModal element not found');
        return;
      }

      const sectionSelect = document.getElementById('addBoltModalSection');
      if (sectionSelect) sectionSelect.value = groupName || 'ROOF';

      const selectEl = document.getElementById('addBoltModalPartSelect');
      if (selectEl) {
        let boltParts = [];
        if (typeof partsDb !== 'undefined' && Array.isArray(partsDb)) {
          boltParts = partsDb
            .filter(p => p && p.partNo && ((p.category || '').toUpperCase().includes('BOLT') || p.partNo.startsWith('WBT-') || p.partNo.startsWith('WNT-') || p.partNo.startsWith('WFW-')))
            .map(p => ({ partNo: p.partNo, name: p.nameKo || p.nameEn || p.partNo }));
        }
        if (!boltParts || boltParts.length === 0) {
          boltParts = [
            { partNo: 'WBT-1035SA4', name: 'M10x35 STS316' },
            { partNo: 'WBT-1035SA2', name: 'M10x35 STS304' },
            { partNo: 'WBT-1035HDG', name: 'M10x35 HDG' },
            { partNo: 'WBT-1045HDG', name: 'M10x45 HDG' },
            { partNo: 'WBT-1045SA4', name: 'M10x45 STS316' },
            { partNo: 'WBT-1240HDG', name: 'M12x40 HDG' },
            { partNo: 'WBT-1440HDG', name: 'M14x40 HDG' },
            { partNo: 'WBT-1640HDG', name: 'M16x40 HDG' },
            { partNo: 'WNT-M10', name: 'M10 Nut' },
            { partNo: 'WFW-M10', name: 'M10 Flat Washer' }
          ];
        }
        const optionsHtml = boltParts.map(p => `<option value="${escapeAttr(p.partNo)}">${escapeAttr(p.partNo)} (${escapeAttr(p.name)})</option>`).join('');
        selectEl.innerHTML = optionsHtml;
        if (boltParts[0] && boltParts[0].partNo) {
          selectEl.value = boltParts[0].partNo;
        }
      }

      const customPartInput = document.getElementById('addBoltModalPartCustom');
      if (customPartInput) customPartInput.value = 'WBT-1035SA4';

      const locInput = document.getElementById('addBoltModalLocation');
      if (locInput) locInput.value = `${groupName || 'ROOF'} Additional Bolt`;

      const formulaInput = document.getElementById('addBoltModalFormula');
      if (formulaInput) formulaInput.value = '10';

      const qtyInput = document.getElementById('addBoltModalQty');
      if (qtyInput) qtyInput.value = 10;

      const addInput = document.getElementById('addBoltModalAdd');
      if (addInput) addInput.value = 1;

      const diaInput = document.getElementById('addBoltModalDia');
      if (diaInput) diaInput.value = 10;

      const lengthInput = document.getElementById('addBoltModalLength');
      if (lengthInput) lengthInput.value = 35;

      const washerInput = document.getElementById('addBoltModalWasher');
      if (washerInput) washerInput.value = 2;

      const nutInput = document.getElementById('addBoltModalNut');
      if (nutInput) nutInput.value = 1;

      modal.classList.add('active');
      modal.style.display = 'flex';
    } catch (err) {
      console.error('[addCustomBoltRowPrompt] Error:', err);
      const modal = document.getElementById('addCustomBoltModal');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
    }
  };

  window.confirmAddCustomBoltModal = function() {
    try {
      const groupName = (document.getElementById('addBoltModalSection')?.value || 'ROOF').trim();
      const customPart = (document.getElementById('addBoltModalPartCustom')?.value || '').trim();
      const selectPart = document.getElementById('addBoltModalPartSelect')?.value || '';
      const item = (customPart || selectPart || 'WBT-1035SA4').toUpperCase();

      const loc = (document.getElementById('addBoltModalLocation')?.value || '').trim() || `${groupName} Additional Bolt`;
      const formula = (document.getElementById('addBoltModalFormula')?.value || '').trim();
      const qty = parseInt(document.getElementById('addBoltModalQty')?.value, 10) || 10;
      const add = parseInt(document.getElementById('addBoltModalAdd')?.value, 10) || 1;

      const dia = parseInt(document.getElementById('addBoltModalDia')?.value, 10) || 10;
      const length = parseInt(document.getElementById('addBoltModalLength')?.value, 10) || 35;
      const washer = parseInt(document.getElementById('addBoltModalWasher')?.value, 10) || 2;
      const nut = parseInt(document.getElementById('addBoltModalNut')?.value, 10) || 1;

      const newId = 'custom_' + groupName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

      // 1. Add to Section Custom Rows
      customBoltRows.push({
        rowId: newId,
        group: groupName,
        item: item,
        loc: loc,
        formula: formula || String(qty),
        qty: qty,
        add: add,
        dia: dia,
        length: length,
        washer: washer,
        nut: nut,
        isCustom: true
      });

      // 2. Add to Bolt Catalog Settings Items
      if (!boltSettings.items) boltSettings.items = [];
      boltSettings.items.push({
        id: newId,
        location: `[${groupName}] ${loc}`,
        section: groupName,
        dia: dia,
        length: length,
        washer: washer,
        nut: nut,
        boltName: item,
        isCustom: true
      });

      closeAddCustomBoltModal();
      saveBoltSettings();
      renderBoltAuditView();
      if (typeof renderAll === 'function') renderAll();
    } catch (err) {
      console.error('[confirmAddCustomBoltModal] Error:', err);
      alert('Error adding bolt item: ' + err.message);
    }
  };

  // Exposed formula-editor handlers -- these drive the SAME engine as the
  // "수식 설정 (Rule Editor)" tab's "볼트 & 너트" category (RuleEditorUI.
  // setFieldFormula/resetFieldFormula in rule_editor.js), so an edit made
  // here is identical in effect and storage to one made there: same
  // localStorage overrides key, same Firestore sync, same "reset to
  // original shipped default" behavior. This lets the bolt logic that used
  // to be editable only on that separate tab be changed directly from this
  // Calculation Audit Sheet instead -- the "산출 수식" column sits right
  // between "Bolt Assemble Location" and "INITIAL" showing exactly how each
  // row's INITIAL qty is derived.
  window.updateBoltFormulaInline = function (rowId, newVal) {
    const trimmed = String(newVal || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/([A-Za-z0-9]+)\s*_\s*([A-Za-z0-9]+)/g, '$1_$2')
      .replace(/\s+/g, ' ')
      .trim();
    if (!trimmed) {
      alert('Please enter a formula.');
      renderBoltAuditView();
      return;
    }
    if (!window.RuleEditorUI || typeof window.RuleEditorUI.setFieldFormula !== 'function') {
      alert('Failed to load formula editor engine. Please refresh the page.');
      renderBoltAuditView();
      return;
    }
    const result = window.RuleEditorUI.setFieldFormula('bolts', 0, rowId, trimmed);
    if (!result.ok) {
      alert('Save failed due to formula error: ' + (result.error || 'Unknown error'));
      renderBoltAuditView();
      return;
    }
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.resetBoltFormula = function (rowId) {
    if (!confirm('Restore the formula for this item to its original default value?')) return;
    if (!window.RuleEditorUI || typeof window.RuleEditorUI.resetFieldFormula !== 'function') return;
    const result = window.RuleEditorUI.resetFieldFormula('bolts', 0, rowId);
    if (result && result.ok) {
      renderBoltAuditView();
      if (typeof renderAll === 'function') renderAll();
    }
  };

  window.clearBoltFormula = function (rowId) {
    if (!confirm('Clear this bolt formula (set to 0)? (Calculated quantity will become 0.)')) return;
    if (String(rowId).startsWith('custom_')) {
      const row = customBoltRows.find(r => r.rowId === rowId);
      if (row) {
        row.formula = '0';
        localStorage.setItem('water_tank_custom_bolt_rows', JSON.stringify(customBoltRows));
      }
    } else {
      if (window.RuleEditorUI && typeof window.RuleEditorUI.setFieldFormula === 'function') {
        window.RuleEditorUI.setFieldFormula('bolts', 0, rowId, '0');
      }
    }
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.updateCustomBoltFormula = function (rowId, newVal) {
    const trimmed = String(newVal).trim();
    if (!trimmed) {
      alert('Please enter a formula.');
      renderBoltAuditView();
      return;
    }
    const row = customBoltRows.find(r => r.rowId === rowId);
    if (!row) {
      renderBoltAuditView();
      return;
    }
    row.formula = trimmed;
    localStorage.setItem('water_tank_custom_bolt_rows', JSON.stringify(customBoltRows));
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.updateBoltLocationOverride = function (rowId, newVal) {
    const val = String(newVal).trim();
    if (val) {
      boltLocationOverrides[rowId] = val;
    } else {
      delete boltLocationOverrides[rowId];
    }
    localStorage.setItem('water_tank_bolt_location_overrides', JSON.stringify(boltLocationOverrides));
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.updateCustomBoltLocation = function (rowId, newVal) {
    const row = customBoltRows.find(r => r.rowId === rowId);
    if (row) {
      row.loc = String(newVal).trim();
      localStorage.setItem('water_tank_custom_bolt_rows', JSON.stringify(customBoltRows));
      renderBoltAuditView();
      if (typeof renderAll === 'function') renderAll();
    }
  };

  // Exposed Copy Row Handler
  window.copyBoltRow = function (rowId) {
    try {
      const rules = boltRules();
      let groupName = 'ROOF';
      let loc = '';
      let formula = '';
      let item = 'WBT-1035';
      let add = 1;
      let dia = 10, length = 35, washer = 2, nut = 1;
      let found = false;

      // 1. Search in customBoltRows
      const customFound = customBoltRows.find(r => r.rowId === rowId);
      if (customFound) {
        found = true;
        groupName = customFound.group || 'ROOF';
        loc = (customFound.loc || customFound.location || '') + ' (Copy)';
        formula = customFound.formula || '0';
        item = customFound.item || customFound.boltName || 'WBT-1035';
        add = (customFound.add != null) ? Number(customFound.add) : 1;
        dia = customFound.dia || 10;
        length = customFound.length || 35;
        washer = customFound.washer || 2;
        nut = customFound.nut || 1;
      } else if (rules && Array.isArray(rules.rows)) {
        // 2. Search in standard rules.rows
        const stdFound = rules.rows.find(r => r.id === rowId);
        if (stdFound) {
          found = true;
          groupName = stdFound.section || 'ROOF';
          loc = (stdFound.label || 'Bolt') + ' (Copy)';
          formula = stdFound.formula || '0';
          item = stdFound.literal || (rules.libraryNames && stdFound.lib && rules.libraryNames[stdFound.lib]) || 'WBT-1035';
          add = (stdFound.add != null) ? Number(stdFound.add) : 1;
          const cat = (rules.libraryCatalog && stdFound.lib && rules.libraryCatalog[stdFound.lib]) || null;
          if (cat) {
            dia = cat.dia || 10;
            length = cat.length || 35;
            washer = cat.washer || 2;
            nut = cat.nut || 1;
          }
        }
      }

      if (!found) {
        alert('Cannot find bolt item to copy.');
        return;
      }

      const newId = 'custom_' + groupName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

      // Add to customBoltRows
      customBoltRows.push({
        rowId: newId,
        group: groupName,
        item: item,
        loc: loc,
        formula: formula,
        qty: 0,
        add: add,
        dia: dia,
        length: length,
        washer: washer,
        nut: nut,
        isCustom: true
      });

      // Add to boltSettings.items
      if (!boltSettings.items) boltSettings.items = [];
      boltSettings.items.push({
        id: newId,
        location: `[${groupName}] ${loc}`,
        section: groupName,
        dia: dia,
        length: length,
        washer: washer,
        nut: nut,
        boltName: item,
        isCustom: true
      });

      saveBoltSettings(true);
      renderBoltAuditView();
      if (typeof renderAll === 'function') renderAll();
    } catch (err) {
      console.error('[copyBoltRow] Error:', err);
      alert('Error copying bolt row: ' + err.message);
    }
  };

  // Exposed Delete Row Handler
  window.deleteBoltRow = function(rowId, isCustom) {
    if (confirm('Delete this bolt calculation item? (It will be excluded from BOM calculations as well.)')) {
      if (isCustom) {
        customBoltRows = customBoltRows.filter(r => r.rowId !== rowId);
      } else {
        deletedRowIds.add(rowId);
      }
      saveBoltSettings(true);
    }
  };

  function buildApLegendMap() {
    const map = {};
    const rules = boltRules();
    if (rules && Array.isArray(rules.rows)) {
      rules.rows.forEach(r => {
        if (r.id) {
          map[r.id] = {
            id: r.id,
            label: r.label || r.id,
            section: r.section || '',
            formula: r.formula || ''
          };
        }
      });
    }
    return map;
  }

  function getFormulaApTooltip(formula) {
    if (!formula || typeof formula !== 'string') return BOLT_FORMULA_VAR_HINT;
    const legend = buildApLegendMap();
    const matches = formula.match(/AP\d+/g);
    if (!matches || matches.length === 0) return BOLT_FORMULA_VAR_HINT;
    const unique = Array.from(new Set(matches));
    const lines = unique.map(apId => {
      const item = legend[apId];
      return item ? `• [${apId}] ${item.label} (${item.section})` : `• [${apId}] Custom Variable`;
    });
    return `[AP Variable Reference Info in Formula]\n` + lines.join('\n') + `\n\n` + BOLT_FORMULA_VAR_HINT;
  }

  window.showApLegendModal = function() {
    let modal = document.getElementById('apLegendModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'apLegendModal';
      modal.style.cssText = 'position:fixed; z-index:99999; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
      document.body.appendChild(modal);
    }

    const legendMap = buildApLegendMap();
    const items = Object.values(legendMap);

    modal.innerHTML = `
      <div style="background:#ffffff; width:100%; max-width:850px; border-radius:14px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:24px; box-sizing:border-box; max-height:85vh; display:flex; flex-direction:column; animation:modalPop 0.2s ease-out;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-book-open" style="color:#0284c7;"></i> AP Variable Reference Table (BoltnNuts Sheet Row ID Legend)
            </h3>
            <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">
              AP variables (e.g. AP57, AP66, AP68) represent row IDs of connection points from the original Excel sheet (BoltnNuts).
            </p>
          </div>
          <button type="button" onclick="closeApLegendModal()" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; font-weight:700; color:#475569; padding:6px 12px; cursor:pointer;">
            <i class="fa-solid fa-xmark"></i> Close
          </button>
        </div>

        <div style="margin-bottom:12px;">
          <input type="text" id="apSearchInput" oninput="filterApLegendTable()" placeholder="🔍 Search AP Variable ID or Location Name (e.g. AP57, Bracket, Partition...)" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; outline:none; box-sizing:border-box;">
        </div>

        <div style="flex:1; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
          <table class="bom-table" style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:left;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; position:sticky; top:0; z-index:5;">
                <th style="padding:8px; border:1px solid #cbd5e1; width:75px;">AP ID</th>
                <th style="padding:8px; border:1px solid #cbd5e1; width:120px;">SECTION</th>
                <th style="padding:8px; border:1px solid #cbd5e1;">Location Name</th>
                <th style="padding:8px; border:1px solid #cbd5e1;">Formula</th>
              </tr>
            </thead>
            <tbody id="apLegendTbody">
              ${items.map(it => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-weight:700; color:#0284c7; background:#f0f9ff;">${it.id}</td>
                  <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:600; color:#475569;">${it.section}</td>
                  <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:600; color:#1e293b;">${it.label}</td>
                  <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-size:10.5px; color:#334155; word-break:break-all;">${escapeAttr(it.formula || '(formula)')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  };

  window.closeApLegendModal = function() {
    const modal = document.getElementById('apLegendModal');
    if (modal) modal.style.display = 'none';
  };

  window.filterApLegendTable = function() {
    const query = (document.getElementById('apSearchInput')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#apLegendTbody tr');
    rows.forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = text.includes(query) ? '' : 'none';
    });
  };

  // --- Panel Hole Spec Verification Modal ---
  window.showPanelHoleAuditModal = function(highlightRowId) {
    let modal = document.getElementById('panelHoleAuditModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'panelHoleAuditModal';
      modal.style.cssText = 'position:fixed; z-index:99999; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box;';
      document.body.appendChild(modal);
    }

    const dim = getTankDimensions();
    const panelPresetId = (window.getActiveCustomerPresetObj && window.getActiveCustomerPresetObj())
      ? window.getActiveCustomerPresetObj().id
      : (window.selectedCustomerPresetId || 'default');
    const panelPresetName = (window.getActiveCustomerPresetObj && window.getActiveCustomerPresetObj())
      ? window.getActiveCustomerPresetObj().name
      : (window.selectedCustomerPresetId || 'Default (YSACC)');

    const jbe = window.JointBoltEngine;
    if (!jbe || typeof jbe.computeJointAuditReport !== 'function') {
      alert('Joint Bolt Engine is not available.');
      return;
    }

    let g;
    if (typeof PanelEngine !== 'undefined' && typeof PanelEngine.makeGeometry === 'function') {
      try {
        g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
      } catch (e) {
        g = null;
      }
    }

    const W_C = g && g.W ? g.W.whole : (dim.width ? Math.floor(dim.width) : 0);
    const W_F = g && g.W ? g.W.half : (dim.width % 1 !== 0 ? 1 : 0);
    const L1_C = g && g.L1 ? g.L1.whole : (dim.l1 ? Math.floor(dim.l1) : 0);
    const L1_F = g && g.L1 ? g.L1.half : (dim.l1 % 1 !== 0 ? 1 : 0);
    const L2_C = g && g.L2 ? g.L2.whole : (dim.l2 ? Math.floor(dim.l2) : 0);
    const L2_F = g && g.L2 ? g.L2.half : (dim.l2 % 1 !== 0 ? 1 : 0);
    const L3_C = g && g.L3 ? g.L3.whole : 0;
    const L3_F = g && g.L3 ? g.L3.half : 0;
    const L4_C = g && g.L4 ? g.L4.whole : 0;
    const L4_F = g && g.L4 ? g.L4.half : 0;
    const L_C = g && g.L_C_sum != null ? g.L_C_sum : (L1_C + L2_C + L3_C + L4_C);
    const L_F = g && g.L_F_sum != null ? g.L_F_sum : (L1_F + L2_F + L3_F + L4_F);

    const report = jbe.computeJointAuditReport({
      hKey: String(dim.height),
      presetId: panelPresetId,
      W_C, W_F, L_C, L_F,
      sumLi_C: L_C, sumLi_F: L_F,
      W_O: dim.width,
      L_O: dim.length,
      R1: (boltRules() && boltRules().holesPerM_Roof1x1) || 8,
      R05: (boltRules() && boltRules().holesPerM_Roof05x1) || 4,
      numCorners: 4,
      n_partitions: dim.numPartition || 0
    });

    if (!report.success) {
      alert(`Panel Hole Verification unavailable: ${report.reason}`);
      return;
    }

    const items = report.items || [];
    const deltaTotal = report.totalJointBolts - report.totalBenchmarkBolts;

    modal.innerHTML = `
      <div style="background:#ffffff; width:100%; max-width:1150px; border-radius:14px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); padding:20px 24px; box-sizing:border-box; max-height:90vh; display:flex; flex-direction:column; animation:modalPop 0.2s ease-out; font-family:'Outfit', sans-serif;">
        
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#ede9fe; color:#6d28d9; padding:4px 10px; border-radius:6px; font-size:13px; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-microscope"></i> VERIFICATION ENGINE
              </span>
              <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">
                Panel Hole Spec vs Formula Bolt Verification
              </h3>
            </div>
            <div style="margin-top:6px; font-size:12px; color:#475569; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span style="font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:4px;">
                <i class="fa-solid fa-ruler-combined"></i> Tank Size: ${dim.length}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M³
              </span>
              <span style="font-weight:700; color:#4338ca; background:#e0e7ff; padding:2px 8px; border-radius:4px;">
                <i class="fa-solid fa-building"></i> Panel Preset: ${escapeAttr(panelPresetName)}
              </span>
              <span style="font-weight:700; color:#059669; background:#ecfdf5; padding:2px 8px; border-radius:4px;">
                <i class="fa-solid fa-layer-group"></i> Partitions: ${dim.numPartition} SET
              </span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" onclick="window.exportPanelHoleAuditReport()" class="btn btn-outline btn-sm" style="border-color:#10b981; color:#059669; font-weight:700; font-size:11.5px; padding:5px 10px; display:flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-file-csv"></i> Export CSV
            </button>
            <button type="button" onclick="window.closePanelHoleAuditModal()" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; font-weight:700; color:#475569; padding:5px 12px; cursor:pointer;">
              <i class="fa-solid fa-xmark"></i> Close
            </button>
          </div>
        </div>

        <!-- 4 KPI Cards -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:14px;">
          <div style="background:#f5f3ff; border:1.5px solid #c4b5fd; border-radius:8px; padding:10px 14px;">
            <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase;">Panel Hole Spec Bolts</div>
            <div style="font-size:22px; font-weight:900; color:#4c1d95; margin-top:2px;">${report.totalJointBolts.toLocaleString()} <span style="font-size:12px; font-weight:600;">PCS</span></div>
            <div style="font-size:10.5px; color:#7c3aed; margin-top:2px;">From registered panel hole counts</div>
          </div>

          <div style="background:#f0f9ff; border:1.5px solid #bae6fd; border-radius:8px; padding:10px 14px;">
            <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Formula Benchmark</div>
            <div style="font-size:22px; font-weight:900; color:#0c4a6e; margin-top:2px;">${report.totalBenchmarkBolts.toLocaleString()} <span style="font-size:12px; font-weight:600;">PCS</span></div>
            <div style="font-size:10.5px; color:#0284c7; margin-top:2px;">Standard holes/m formula basis</div>
          </div>

          <div style="background:${deltaTotal === 0 ? '#f0fdf4' : '#fffbeb'}; border:1.5px solid ${deltaTotal === 0 ? '#86efac' : '#fcd34d'}; border-radius:8px; padding:10px 14px;">
            <div style="font-size:11px; font-weight:700; color:${deltaTotal === 0 ? '#15803d' : '#b45309'}; text-transform:uppercase;">Verification Status</div>
            <div style="font-size:18px; font-weight:900; color:${deltaTotal === 0 ? '#166534' : '#92400e'}; margin-top:4px;">
              ${deltaTotal === 0 ? '✓ 100% Match' : (deltaTotal > 0 ? `+${deltaTotal} Custom Diff` : `${deltaTotal} Custom Diff`)}
            </div>
            <div style="font-size:10.5px; color:${deltaTotal === 0 ? '#16a34a' : '#d97706'}; margin-top:2px;">
              ${deltaTotal === 0 ? 'Exact numerical equality' : 'Custom precision applied'}
            </div>
          </div>

          <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:8px; padding:10px 14px;">
            <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Active Joint Types</div>
            <div style="font-size:22px; font-weight:900; color:#1e293b; margin-top:2px;">${report.totalJointTypes} <span style="font-size:12px; font-weight:600;">Types</span></div>
            <div style="font-size:10.5px; color:#64748b; margin-top:2px;">
              ${report.verifiedCustomCount > 0 ? `${report.verifiedCustomCount} with custom hole specs` : 'All using standard hole specs'}
            </div>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:250px;">
            <input type="text" id="panelHoleSearchInput" oninput="window.filterPanelHoleAuditTable()" placeholder="🔍 Filter by Row ID (AP5), Section (ROOF/SIDE/PARTITION), or Panel Code..." style="width:100%; padding:6px 12px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; outline:none; box-sizing:border-box;">
          </div>
          <div style="display:flex; gap:4px;">
            <button type="button" onclick="window.filterPanelHoleAuditSection('ALL')" class="btn btn-sm btn-panel-hole-filter active" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid #cbd5e1; background:#0f172a; color:#ffffff; cursor:pointer;">All (${items.length})</button>
            <button type="button" onclick="window.filterPanelHoleAuditSection('ROOF')" class="btn btn-sm btn-panel-hole-filter" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">Roof</button>
            <button type="button" onclick="window.filterPanelHoleAuditSection('BOTTOM')" class="btn btn-sm btn-panel-hole-filter" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">Bottom</button>
            <button type="button" onclick="window.filterPanelHoleAuditSection('SIDE')" class="btn btn-sm btn-panel-hole-filter" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">Side</button>
            <button type="button" onclick="window.filterPanelHoleAuditSection('PARTITION')" class="btn btn-sm btn-panel-hole-filter" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">Partition</button>
          </div>
        </div>

        <!-- Verification Table -->
        <div style="flex:1; overflow-y:auto; border:1px solid #cbd5e1; border-radius:8px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.03);">
          <table class="bom-table" style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">
            <thead>
              <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1; position:sticky; top:0; z-index:5;">
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:55px; text-align:center;">Row ID</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:70px; text-align:center;">Section</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:190px;">Joint Location / Description</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:220px;">Resolved Panels & Hole Specs</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1;">Hole Engine Calculation Breakdown</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:65px; text-align:right;">Hole Qty</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:65px; text-align:right;">Formula</th>
                <th style="padding:6px 8px; border:1px solid #cbd5e1; width:85px; text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody id="panelHoleAuditTbody">
              ${items.map(it => {
                const isHighlight = highlightRowId && it.rowId === highlightRowId;
                const isMatch = it.jointBoltQty === it.benchmarkQty;
                return `
                  <tr data-section="${it.section}" data-rowid="${it.rowId}" style="border-bottom:1px solid #e2e8f0; background:${isHighlight ? '#fef08a' : (isMatch ? '#ffffff' : '#fefce8')};">
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-weight:800; color:#0284c7; text-align:center; background:${isHighlight ? '#fde047' : '#f0f9ff'};">
                      ${it.rowId}
                    </td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; font-size:10px; color:#475569;">
                      ${it.section}
                    </td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:700; color:#1e293b;">
                      ${it.label}
                    </td>
                    <td style="padding:4px 8px; border:1px solid #e2e8f0; font-size:10.5px; color:#334155;">
                      ${it.panels && it.panels.length ? it.panels.map(p => `
                        <div style="margin-bottom:2px;">
                          <span style="font-weight:700; color:#0284c7;">${escapeAttr(p.role)}:</span>
                          <span style="font-family:monospace; font-weight:700; color:#0f172a;">${escapeAttr(p.code || '(None)')}</span>
                          ${p.holeCount != null ? `<span style="background:#ede9fe; color:#6d28d9; padding:0 4px; border-radius:3px; font-weight:800; font-size:10px;">${p.holeCount} Holes</span>` : `<span style="color:#64748b; font-size:9.5px;">(Fallback ${p.fallback || 8})</span>`}
                        </div>
                      `).join('') : '<span style="color:#94a3b8;">-</span>'}
                    </td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-size:10.5px; color:#0f172a; word-break:break-all;">
                      ${escapeAttr(it.calcFormula)}
                    </td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:right; font-weight:900; font-size:12px; color:#6d28d9; background:#faf5ff;">
                      ${it.jointBoltQty}
                    </td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:right; font-weight:700; font-size:11.5px; color:#475569;">
                      ${it.benchmarkQty}
                    </td>
                    <td style="padding:6px 4px; border:1px solid #e2e8f0; text-align:center;">
                      ${isMatch ? `
                        <span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:800; white-space:nowrap; display:inline-block;">
                          ✓ Match
                        </span>
                      ` : `
                        <span style="background:#fef3c7; color:#b45309; border:1px solid #fcd34d; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:800; white-space:nowrap; display:inline-block;">
                          ${it.jointBoltQty > it.benchmarkQty ? `+${it.jointBoltQty - it.benchmarkQty}` : `${it.jointBoltQty - it.benchmarkQty}`} Diff
                        </span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Footer Actions -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:10px; border-top:1.5px solid #e2e8f0; flex-wrap:wrap; gap:8px;">
          <div style="font-size:11.5px; color:#64748b;">
            <i class="fa-solid fa-circle-info" style="color:#0284c7; margin-right:4px;"></i>
            Hole count data is managed in <b>Panel Hole Spec</b> per customer company preset.
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" onclick="window.navigateToPanelHoleSpecTab()" style="background:#ede9fe; color:#6d28d9; border:1.5px solid #c4b5fd; font-weight:700; font-size:11.5px; padding:6px 14px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <i class="fa-solid fa-sliders"></i> Go to Panel Hole Spec Manager
            </button>
            <button type="button" onclick="window.closePanelHoleAuditModal()" class="btn btn-primary btn-sm" style="background:#0f172a; color:#ffffff; font-weight:700; font-size:11.5px; padding:6px 18px; border-radius:6px; border:none; cursor:pointer;">
              Close
            </button>
          </div>
        </div>

      </div>
    `;

    window._panelHoleAuditReport = report;
    modal.style.display = 'flex';
  };

  window.closePanelHoleAuditModal = function() {
    const modal = document.getElementById('panelHoleAuditModal');
    if (modal) modal.style.display = 'none';
  };

  window.filterPanelHoleAuditTable = function() {
    const query = (document.getElementById('panelHoleSearchInput')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#panelHoleAuditTbody tr');
    rows.forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = text.includes(query) ? '' : 'none';
    });
  };

  window.filterPanelHoleAuditSection = function(section) {
    const buttons = document.querySelectorAll('.btn-panel-hole-filter');
    buttons.forEach(btn => {
      const isCurrent = (section === 'ALL' && btn.textContent.includes('All')) || btn.textContent.toUpperCase().includes(section);
      btn.style.background = isCurrent ? '#0f172a' : '#ffffff';
      btn.style.color = isCurrent ? '#ffffff' : '#475569';
    });

    const rows = document.querySelectorAll('#panelHoleAuditTbody tr');
    rows.forEach(tr => {
      const sec = tr.getAttribute('data-section');
      if (section === 'ALL' || sec === section) {
        tr.style.display = '';
      } else {
        tr.style.display = 'none';
      }
    });
  };

  window.navigateToPanelHoleSpecTab = function() {
    window.closePanelHoleAuditModal();
    const tabBtn = document.querySelector('button[data-tab="tab-panel-hole-spec"]');
    if (tabBtn) tabBtn.click();
  };

  window.exportPanelHoleAuditReport = function() {
    const report = window._panelHoleAuditReport;
    if (!report || !report.items) {
      alert('No verification data to export.');
      return;
    }
    const dim = getTankDimensions();
    let csv = `Panel Hole vs Formula Bolt Verification Report\n`;
    csv += `Tank Dimensions,${dim.length}m(L) x ${dim.width}m(W) x ${dim.height}m(H)\n`;
    csv += `Total Hole Spec Bolts,${report.totalJointBolts} PCS\n`;
    csv += `Total Benchmark Bolts,${report.totalBenchmarkBolts} PCS\n\n`;
    csv += `Row ID,Section,Location,Panel Codes,Calculation Formula,Hole Qty,Benchmark Qty,Status\n`;

    report.items.forEach(it => {
      const panelsStr = (it.panels || []).map(p => `${p.role}: ${p.code} (${p.holeCount != null ? p.holeCount + ' holes' : 'fallback'})`).join('; ');
      csv += `"${it.rowId}","${it.section}","${it.label}","${panelsStr}","${it.calcFormula}",${it.jointBoltQty},${it.benchmarkQty},"${it.jointBoltQty === it.benchmarkQty ? 'MATCH' : 'DIFF'}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bolt_Verification_Panel_Hole_${dim.length}x${dim.width}x${dim.height}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  function renderBoltAuditView() {
    const container = document.getElementById('boltLogicAuditContainer');
    if (!container) return;

    const rules = boltRules();
    const dim = getTankDimensions();
    const auditRows = computeBoltAuditData(dim);
    const rowsById = {};
    if (rules) rules.rows.forEach((r) => { rowsById[r.id] = r; });
    const overrides = currentOverrides();
    const materialOptions = [
      { value: 1, label: 'EXT:HDG/INT:SS304+R/F:HDG', shortLabel: '① HDG+304' },
      { value: 2, label: 'EXT:HDG/INT:SS316', shortLabel: '② HDG+316' },
      { value: 3, label: 'EXT:SS304/INT:SS316', shortLabel: '③ 304+316' },
      { value: 4, label: 'EXT:SS304/INT:SS316+R/F:Plastic', shortLabel: '④ 304+316(P)' },
      { value: 5, label: 'INT/EXT:SS304', shortLabel: '⑤ All 304' },
      { value: 6, label: 'INT/EXT:SS316', shortLabel: '⑥ All 316' }
    ];

    const activeRadio = document.querySelector('input[name="boltDisplayMode"]:checked');
    const displayMode = activeRadio ? activeRadio.value : 'set';
    const isSetMode = displayMode === 'set';
    const hideNutWasher = isSetMode && !window._showAllAuditRows;

    const filteredAuditRows = hideNutWasher
      ? auditRows.filter(r => {
          const item = (r.item || '').trim().toUpperCase();
          return !item.startsWith('WNT-') && !item.startsWith('WFW-');
        })
      : auditRows;

    // Collect all section names dynamically
    const sections = ['ROOF', 'BOTTOM', 'SIDE', 'PARTITION', 'STEEL SKID', 'PARTITION BRACKET'];
    filteredAuditRows.forEach(r => {
      if (r.group && sections.indexOf(r.group) === -1) {
        sections.push(r.group);
      }
    });

    let html = buildCompanyTabsBar();
    
    // Top Sub-Tabs Navigation (Standard Formula vs Panel Hole Joint Engine)
    html += `
      <div style="display: flex; gap: 8px; margin-bottom: 12px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 4px;">
        <button type="button" onclick="window.switchBoltAuditSubView('standard')" style="flex: 1; padding: 8px 14px; border: none; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s ease; ${activeBoltSubView === 'standard' ? 'background: #0284c7; color: #ffffff; box-shadow: 0 2px 6px rgba(2,132,199,0.3);' : 'background: transparent; color: #475569;'}">
          <i class="fa-solid fa-table-list"></i> 📊 Standard Formula Calculation & Audit
        </button>
        <button type="button" onclick="window.switchBoltAuditSubView('joint_engine')" style="flex: 1; padding: 8px 14px; border: none; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s ease; ${activeBoltSubView === 'joint_engine' ? 'background: #7c3aed; color: #ffffff; box-shadow: 0 2px 6px rgba(124,58,237,0.3);' : 'background: transparent; color: #475569;'}">
          <i class="fa-solid fa-microscope"></i> 🔬 Panel Hole Joint Bolt Engine & Spec
        </button>
      </div>
    `;

    if (activeBoltSubView === 'joint_engine') {
      html += buildJointEngineSubViewHtml(dim, rules, materialOptions);
      container.innerHTML = html;
      return;
    }

    html += `
      <div style="display: flex; gap: 16px; align-items: flex-start; width: 100%;">

        <!-- Left Side: Calculation & Audit Verification Table (75% Width) -->
        <div style="flex: 3; min-width: 0; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            <div>
              <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-calculator" style="color: #0284c7;"></i> Real-Time Bolt Calculation & Audit Sheet
              </h3>
              <span style="font-size: 12px; font-weight: 600; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 3px;">
                Size: ${dim.length}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M³ [1 SET] · ${getIsIntReinf() ? 'Internal' : 'External'} R/F · Partition ${dim.numPartition}
              </span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" onclick="window.showPanelHoleAuditModal()" class="btn btn-outline btn-sm" style="border-color: #7c3aed; color: #7c3aed; background: #faf5ff; display: flex; align-items: center; gap: 4px; font-weight: 700; font-size: 11.5px; padding: 4px 10px;" title="Verify live bolt quantities against panel hole specifications (JointBoltEngine)">
                <i class="fa-solid fa-microscope" style="color: #7c3aed;"></i> Panel Hole Verification
              </button>
              <button type="button" onclick="showApLegendModal()" class="btn btn-outline btn-sm" style="border-color: #0284c7; color: #0284c7; display: flex; align-items: center; gap: 4px; font-weight: 700; font-size: 11.5px; padding: 4px 10px;">
                <i class="fa-solid fa-book"></i> AP Legend
              </button>
              ${deletedRowIds.size > 0 ? `
                <button type="button" onclick="deletedRowIds.clear(); saveBoltSettings();" class="btn btn-outline btn-sm" style="font-size: 11.5px; color: #64748b; padding: 4px 10px;">
                  <i class="fa-solid fa-arrow-rotate-left"></i> Restore (${deletedRowIds.size})
                </button>
              ` : ''}
              <button type="button" onclick="exportBoltAuditToExcel()" class="btn btn-outline btn-sm" style="border-color: #10b981; color: #10b981; display: flex; align-items: center; gap: 4px; font-weight: 700; font-size: 11.5px; padding: 4px 10px;">
                <i class="fa-solid fa-file-excel"></i> Export Excel
              </button>
            </div>
          </div>

          ${isSetMode ? `
            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 5px 12px; margin-bottom: 10px; font-size: 11.5px; color: #166534; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <i class="fa-solid fa-circle-check" style="color: #16a34a; margin-right: 4px;"></i>
                <b>[SET Mode Active]</b> Duplicated nut/washer rows derived by recipe ratio are hidden
              </div>
              <button type="button" onclick="window.toggleShowAllAuditRows()" style="background: #ffffff; border: 1px solid #bbf7d0; color: #15803d; border-radius: 4px; padding: 2px 8px; font-size: 10.5px; font-weight: 700; cursor: pointer;">
                ${window._showAllAuditRows ? 'Show Bolt Formulas Only' : 'Show All Rows (Including Nuts/Washers)'}
              </button>
            </div>
          ` : ''}

          <div class="table-wrapper" style="max-height: 600px; overflow-y: auto; overflow-x: hidden; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.03);">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                  <th style="padding: 6px 2px; border: 1px solid #cbd5e1; width: 54px; background: #f1f5f9; font-size: 11px; font-weight: 700; text-align: center;">PART NO</th>
                  <th style="padding: 6px 4px; border: 1px solid #cbd5e1; width: 105px; background: #f1f5f9; font-size: 11.5px; font-weight: 700;">Location</th>
                  <th style="padding: 6px 4px; border: 1px solid #cbd5e1; width: 125px; background: #f1f5f9; font-size: 11.5px; font-weight: 700;" title="${BOLT_FORMULA_VAR_HINT}">Formula <i class="fa-solid fa-circle-info" style="color:#94a3b8; font-size:10px;"></i></th>
                  <th style="padding: 6px 2px; border: 1px solid #cbd5e1; text-align: right; width: 30px; background: #f1f5f9; font-size: 11px; font-weight: 700;">INIT</th>
                  <th style="padding: 6px 2px; border: 1px solid #cbd5e1; text-align: right; width: 28px; background: #f1f5f9; font-size: 11px; font-weight: 700;">Qty</th>
                  <th style="padding: 6px 2px; border: 1px solid #cbd5e1; text-align: right; width: 28px; background: #f1f5f9; font-size: 11px; font-weight: 700;">Add</th>
                  ${materialOptions.map(m => `<th style="padding: 4px 1px; border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; background: #e2e8f0; width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${m.label}">${m.shortLabel}</th>`).join('')}
                  <th style="padding: 6px 2px; border: 1px solid #cbd5e1; text-align: center; width: 68px; background: #f1f5f9; font-size: 11px; font-weight: 700;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${sections.map(sectionName => {
                  const sectionRows = filteredAuditRows.filter(r => r.group === sectionName);
                  if (sectionRows.length === 0) return '';
                  return `
                    <tr style="background: #e0f2fe; font-weight: 800; color: #0369a1; position: sticky; top: 29px; z-index: 9;">
                      <td colspan="6" style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 12.5px; background: #e0f2fe; letter-spacing: 0.3px;">
                        ■ ${sectionName} SECTION
                      </td>
                      <td colspan="${materialOptions.length + 1}" style="padding: 3px 8px; border: 1px solid #cbd5e1; text-align: right; background: #e0f2fe;">
                        <button type="button" onclick="addCustomBoltRowPrompt('${sectionName}')" style="padding: 3px 10px; font-size: 11px; font-weight: 700; background: #0284c7; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.12);">
                          <i class="fa-solid fa-plus"></i> Add Bolt
                        </button>
                      </td>
                    </tr>
                    ${sectionRows.map((r, i) => {
                      const row = rowsById[r.rowId];
                      const fieldInfo = (!r.isCustom && window.RuleEditorUI && typeof window.RuleEditorUI.getFieldInfo === 'function')
                        ? window.RuleEditorUI.getFieldInfo('bolts', 0, r.rowId) : null;
                      const isFormulaModified = !!(fieldInfo && fieldInfo.isModified);
                      const currentFormula = row ? row.formula : '';
                      const richTooltip = getFormulaApTooltip(currentFormula);
                      const isJointTypeRow = !!(row && row.jointType);
                      return `
                        <tr style="border-bottom: 1px solid #e2e8f0; background: ${r.isCustom ? '#f0fdf4' : (i % 2 === 0 ? '#ffffff' : '#f8fafc')};">
                          <td style="padding: 4px 2px; border: 1px solid #e2e8f0; font-weight: 700; font-family: monospace; color: ${r.isCustom ? '#15803d' : '#1e293b'}; font-size: 10.5px; word-break: break-all; text-align: center;" title="${r.item}">
                            ${r.item} ${r.isCustom ? '<span style="font-size:8.5px; background:#dcfce7; color:#166534; padding:0 2px; border-radius:2px;">C</span>' : ''}
                          </td>
                          <td style="padding: 3px 4px; border: 1px solid #e2e8f0; color: #334155;">
                            ${r.isCustom ? `
                              <input type="text" value="${escapeAttr(r.loc)}" onchange="window.updateCustomBoltLocation('${r.rowId}', this.value)" title="Location: ${escapeAttr(r.loc)} [Custom ID: ${r.rowId}]" style="width: 100%; padding: 2px 4px; font-size: 11px; font-weight: 600; color: #15803d; border: 1px solid #bbf7d0; border-radius: 4px; background: #f0fdf4; outline: none; box-sizing: border-box;">
                            ` : `
                              <div style="display: flex; flex-direction: column; gap: 2px;">
                                <input type="text" value="${escapeAttr(boltLocationOverrides[r.rowId] || r.loc)}" onchange="window.updateBoltLocationOverride('${r.rowId}', this.value)" title="Variable ID: ${r.rowId}" style="width: 100%; padding: 2px 4px; font-size: 11px; font-weight: 600; color: #334155; border: 1px solid ${boltLocationOverrides[r.rowId] ? '#0284c7' : '#cbd5e1'}; border-radius: 4px; background: ${boltLocationOverrides[r.rowId] ? '#f0f9ff' : '#ffffff'}; outline: none; box-sizing: border-box;">
                                ${isJointTypeRow ? `
                                  <div style="display:flex; align-items:center;">
                                    <span onclick="window.showPanelHoleAuditModal('${r.rowId}')" style="cursor:pointer; font-size:9px; font-weight:800; padding:1px 4px; border-radius:3px; background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; display:inline-flex; align-items:center; gap:2px;" title="Calculated with Panel Hole Spec Engine (Click to view verification breakdown)">
                                      <i class="fa-solid fa-microscope" style="font-size:8px;"></i> Hole Spec: ${r.qty}
                                    </span>
                                  </div>
                                ` : ''}
                              </div>
                            `}
                          </td>
                          <td style="padding: 3px 4px; border: 1px solid #e2e8f0;">
                            ${!r.isCustom ? `
                              <div style="display: flex; align-items: center; gap: 2px;">
                                <textarea rows="1" onchange="updateBoltFormulaInline('${r.rowId}', this.value)" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();this.blur();}" title="${escapeAttr(richTooltip)}" style="resize: both; min-width: 90px; width: 100%; height: 26px; min-height: 24px; padding: 2px 4px; font-size: 11px; font-family: monospace; border: 1px solid ${isFormulaModified ? '#f59e0b' : '#cbd5e1'}; border-radius: 4px; background: ${isFormulaModified ? '#fffbeb' : '#ffffff'}; color: #1e293b; box-sizing: border-box; vertical-align: middle; white-space: pre-wrap; word-break: break-all; overflow: auto;">${escapeAttr(currentFormula)}</textarea>
                                ${isFormulaModified ? `<button type="button" onclick="resetBoltFormula('${r.rowId}')" title="Restore default formula" style="background: none; border: none; color: #f59e0b; cursor: pointer; font-size: 11px; padding: 0; flex-shrink: 0;"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
                                <button type="button" onclick="clearBoltFormula('${r.rowId}')" title="Delete formula (set to 0)" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 10px; padding: 0; flex-shrink: 0;"><i class="fa-solid fa-eraser"></i></button>
                              </div>
                            ` : `
                              <div style="display: flex; align-items: center; gap: 2px;">
                                <textarea rows="1" onchange="updateCustomBoltFormula('${r.rowId}', this.value)" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();this.blur();}" title="${escapeAttr(r.formulaError ? ('⚠ Formula Error: ' + r.formulaError) : getFormulaApTooltip(r.formula))}" style="resize: both; min-width: 90px; width: 100%; height: 26px; min-height: 24px; padding: 2px 4px; font-size: 11px; font-family: monospace; border: 1px solid ${r.formulaError ? '#ef4444' : '#cbd5e1'}; border-radius: 4px; background: ${r.formulaError ? '#fef2f2' : '#ffffff'}; color: #1e293b; box-sizing: border-box; vertical-align: middle; white-space: pre-wrap; word-break: break-all; overflow: auto;">${escapeAttr(r.formula || '')}</textarea>
                                <button type="button" onclick="clearBoltFormula('${r.rowId}')" title="Delete formula (set to 0)" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 10px; padding: 0; flex-shrink: 0;"><i class="fa-solid fa-eraser"></i></button>
                              </div>
                            `}
                          </td>
                          <td style="padding: 4px 2px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; font-size: 11.5px;">${r.qty}</td>
                          <td style="padding: 4px 2px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #0284c7; font-size: 11.5px;">${r.qty}</td>
                          <td style="padding: 4px 2px; border: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: 700; font-size: 11.5px;">+${r.add}</td>
                          ${materialOptions.map(m => {
                            const val = row ? resolvePartNoForOption(row, m.value, overrides, r.rowId) : (r.isCustom ? r.item : '');
                            const isCellOverridden = materialCellOverrides[r.rowId + '_' + m.value];
                            return `
                              <td style="padding: 2px 1px; border: 1px solid #e2e8f0; text-align: center;">
                                <input type="text" value="${escapeAttr(val)}" onchange="updateBoltMaterialOverride('${r.rowId}', ${m.value}, this.value, this)" title="${escapeAttr(val)}" style="width: 100%; padding: 2px 1px; font-size: 9.5px; font-family: monospace; font-weight: 700; text-align: center; border: 1px solid ${isCellOverridden ? '#0284c7' : '#cbd5e1'}; border-radius: 3px; background: ${isCellOverridden ? '#f0f9ff' : '#ffffff'}; color: ${isCellOverridden ? '#0284c7' : '#1e293b'}; box-sizing: border-box;">
                              </td>
                            `;
                          }).join('')}
                          <td style="padding: 3px 2px; border: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
                            <button type="button" onclick="window.copyBoltRow('${r.rowId}')" title="Copy this bolt item" style="background: #e0f2fe; border: 1px solid #7dd3fc; color: #0284c7; border-radius: 4px; padding: 2px 5px; font-size: 10.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; margin-right: 2px; white-space: nowrap; transition: all 0.15s ease;" onmouseover="this.style.background='#bae6fd';" onmouseout="this.style.background='#e0f2fe';">
                              <i class="fa-solid fa-copy" style="font-size: 9.5px;"></i> Copy
                            </button>
                            <button type="button" onclick="window.deleteBoltRow('${r.rowId}', ${r.isCustom})" title="Delete" style="background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 4px; padding: 2px 5px; font-size: 10.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; white-space: nowrap; transition: all 0.15s ease;" onmouseover="this.style.background='#fee2e2';" onmouseout="this.style.background='#fef2f2';">
                              <i class="fa-solid fa-trash-can" style="font-size: 9.5px;"></i>
                            </button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right Side: SETTING Control Panel (25% Width) -->
        <div style="flex: 1; min-width: 275px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); box-sizing: border-box;">

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            <h3 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 5px;">
              <i class="fa-solid fa-sliders" style="color: #0284c7;"></i> SETTING (Bolt Catalog)
            </h3>
            <div style="display: flex; gap: 3px;">
              <button type="button" onclick="resetBoltSettings()" class="btn btn-outline btn-sm" style="font-size: 10.5px; padding: 2px 6px;">Reset</button>
              <button type="button" onclick="saveBoltSettings()" class="btn btn-primary btn-sm" style="font-size: 10.5px; padding: 2px 8px; background: #0284c7; border: none; font-weight: 700;">💾 Save</button>
            </div>
          </div>

          <!-- Add Catalog Bolt Trigger Button -->
          <button type="button" onclick="addCustomBoltRowPrompt('ROOF')" class="btn btn-glow btn-sm" style="border: 1.5px solid #0284c7; color: #ffffff; background: #0284c7; font-weight: 700; display: flex; align-items: center; gap: 4px; width: 100%; justify-content: center; padding: 6px 8px; margin-bottom: 10px; font-size: 11.5px; cursor: pointer; border-radius: 6px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.2);">
            <i class="fa-solid fa-plus-circle"></i> + Register Catalog Bolt
          </button>

          <!-- Top Parameters -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 2px;">
                <span>Holes/M (1x1)</span>
                <span style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 0 4px; border-radius: 3px; font-family: monospace; font-size: 10px; font-weight: 800;">R1</span>
              </label>
              <input type="number" value="${(rules && rules.holesPerM_Roof1x1) || 8}" onchange="updateHolesPerM1x1(this.value, this)" title="Nos of Holes/M for Roof (1x1m)" style="width: 100%; height: 28px; padding: 0 4px; font-size: 12px; font-weight: 800; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; box-sizing: border-box; background:#ffffff; color:#0284c7; text-align: center;">
            </div>
            <div>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 2px;">
                <span>Holes/M (0.5x1)</span>
                <span style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 0 4px; border-radius: 3px; font-family: monospace; font-size: 10px; font-weight: 800;">R05</span>
              </label>
              <input type="number" value="${(rules && rules.holesPerM_Roof05x1) || 4}" onchange="updateHolesPerM05x1(this.value, this)" title="Nos of Holes/M for Roof (0.5x1m)" style="width: 100%; height: 28px; padding: 0 4px; font-size: 12px; font-weight: 800; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; box-sizing: border-box; background:#ffffff; color:#0284c7; text-align: center;">
            </div>
          </div>

          <!-- Setting Matrix Table -->
          <div style="overflow-y: auto; max-height: 600px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left; table-layout: fixed;">
              <thead>
                <tr style="background: #f1f5f9; position: sticky; top: 0; border-bottom: 2px solid #cbd5e1; z-index: 2;">
                  <th style="padding: 4px 3px; border-right: 1px solid #cbd5e1; font-size: 10.5px; font-weight: 700;">Location</th>
                  <th style="padding: 4px 1px; border-right: 1px solid #cbd5e1; width: 30px; text-align: center; font-size: 10.5px; font-weight: 700;">DIA</th>
                  <th style="padding: 4px 1px; border-right: 1px solid #cbd5e1; width: 30px; text-align: center; font-size: 10.5px; font-weight: 700;">LEN</th>
                  <th style="padding: 4px 1px; border-right: 1px solid #cbd5e1; width: 66px; text-align: center; font-size: 10.5px; font-weight: 700;">BOLT NAME</th>
                  <th style="padding: 4px 1px; width: 22px; text-align: center; font-size: 10.5px; font-weight: 700;">Del</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  const filteredSettingItems = hideNutWasher
                    ? boltSettings.items.filter(item => {
                        const bName = (item.boltName || '').trim().toUpperCase();
                        const loc = (item.location || '').trim().toLowerCase();
                        return !bName.startsWith('WNT-') && !bName.startsWith('WFW-') && !loc.includes('nuts for') && !loc.includes('washers for') && !loc.includes('washer for');
                      })
                    : boltSettings.items;

                  return filteredSettingItems.map((item, idx) => {
                    const origIdx = boltSettings.items.indexOf(item);
                    return `
                      <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                        <td style="padding: 2px 3px; border-right: 1px solid #e2e8f0;">
                          <textarea rows="2" onchange="window.updateBoltSettingField(${origIdx}, 'location', this.value, this)" title="${escapeAttr(item.location)}" style="width: 100%; padding: 2px 3px; font-size: 10px; font-weight: 600; color: #334155; border: 1px solid #cbd5e1; border-radius: 3px; background: #ffffff; outline: none; box-sizing: border-box; resize: vertical; font-family: inherit;">${escapeAttr(item.location)}</textarea>
                        </td>
                        <td style="padding: 1px; text-align: center; border-right: 1px solid #e2e8f0;">
                          <input type="number" value="${item.dia}" onchange="updateBoltSettingField(${origIdx}, 'dia', this.value, this)" style="width: 28px; padding: 1px 0; font-size: 10.5px; font-weight: 700; text-align: center; border: 1px solid #cbd5e1; border-radius: 3px;">
                        </td>
                        <td style="padding: 1px; text-align: center; border-right: 1px solid #e2e8f0;">
                          <input type="number" value="${item.length}" onchange="updateBoltSettingField(${origIdx}, 'length', this.value, this)" style="width: 28px; padding: 1px 0; font-size: 10.5px; font-weight: 700; text-align: center; border: 1px solid #cbd5e1; border-radius: 3px;">
                        </td>
                        <td style="padding: 1px; text-align: center; border-right: 1px solid #e2e8f0;">
                          <input type="text" value="${item.boltName}" onchange="updateBoltSettingField(${origIdx}, 'boltName', this.value, this)" style="width: 62px; padding: 1px 1px; font-size: 10px; font-family: monospace; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1; border-radius: 3px;">
                        </td>
                        <td style="padding: 1px; text-align: center;">
                          <button type="button" onclick="window.deleteBoltSettingRow(${origIdx})" title="Delete" style="background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 3px; padding: 2px; font-size: 9.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px;" onmouseover="this.style.background='#fee2e2';" onmouseout="this.style.background='#fef2f2';">
                            <i class="fa-solid fa-trash-can" style="font-size: 9.5px;"></i>
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('');
                })()}
              </tbody>
            </table>
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 6px; line-height: 1.3;">
            <i class="fa-solid fa-circle-info"></i> BOLT NAME affects calculations.
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // -------------------------------------------------------------------------
  // Panel Hole Joint Bolt Engine Sub-View Renderer
  // Dedicated interface for configuring bolt specs, sizes, adding/deleting
  // joint bolts, adjusting extra margins, and auditing real-time calculations.
  // -------------------------------------------------------------------------
  function buildJointEngineSubViewHtml(dim, rules, materialOptions) {
    const panelPresetId = (window.getActiveCustomerPresetObj && window.getActiveCustomerPresetObj())
      ? window.getActiveCustomerPresetObj().id
      : (window.selectedCustomerPresetId || 'default');
    const panelPresetName = (window.getActiveCustomerPresetObj && window.getActiveCustomerPresetObj())
      ? window.getActiveCustomerPresetObj().name
      : (window.selectedCustomerPresetId || 'Default (YSACC)');

    const jbe = window.JointBoltEngine;
    let report = { success: false, items: [], totalJointBolts: 0, totalBenchmarkBolts: 0, verifiedCustomCount: 0, totalJointTypes: 0 };
    if (jbe && typeof jbe.computeJointAuditReport === 'function') {
      let g;
      if (typeof PanelEngine !== 'undefined' && typeof PanelEngine.makeGeometry === 'function') {
        try { g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4); } catch (e) { g = null; }
      }
      const W_C = g && g.W ? g.W.whole : (dim.width ? Math.floor(dim.width) : 0);
      const W_F = g && g.W ? g.W.half : (dim.width % 1 !== 0 ? 1 : 0);
      const L1_C = g && g.L1 ? g.L1.whole : (dim.l1 ? Math.floor(dim.l1) : 0);
      const L1_F = g && g.L1 ? g.L1.half : (dim.l1 % 1 !== 0 ? 1 : 0);
      const L2_C = g && g.L2 ? g.L2.whole : (dim.l2 ? Math.floor(dim.l2) : 0);
      const L2_F = g && g.L2 ? g.L2.half : (dim.l2 % 1 !== 0 ? 1 : 0);
      const L3_C = g && g.L3 ? g.L3.whole : 0;
      const L3_F = g && g.L3 ? g.L3.half : 0;
      const L4_C = g && g.L4 ? g.L4.whole : 0;
      const L4_F = g && g.L4 ? g.L4.half : 0;
      const L_C = g && g.L_C_sum != null ? g.L_C_sum : (L1_C + L2_C + L3_C + L4_C);
      const L_F = g && g.L_F_sum != null ? g.L_F_sum : (L1_F + L2_F + L3_F + L4_F);

      report = jbe.computeJointAuditReport({
        hKey: String(dim.height),
        presetId: panelPresetId,
        W_C, W_F, L_C, L_F,
        sumLi_C: L_C, sumLi_F: L_F,
        W_O: dim.width,
        L_O: dim.length,
        R1: (rules && rules.holesPerM_Roof1x1) || 8,
        R05: (rules && rules.holesPerM_Roof05x1) || 4,
        numCorners: 4,
        n_partitions: dim.numPartition || 0
      });
    }

    // Combine standard report items and customJointBoltRows
    const activeItems = (report.items || []).filter(it => !deletedJointBoltIds.has(it.rowId)).map(it => {
      const ov = jointBoltOverrides[it.rowId] || {};
      const addQty = Number(ov.add) || 0;
      const customLabel = ov.customLabel || it.label;
      const boltName = ov.boltName || getDefaultBoltNameForJoint(it.rowId);
      const dia = ov.dia || getDefaultDiaForJoint(it.rowId);
      const length = ov.length || getDefaultLengthForJoint(it.rowId);
      const totalQty = it.jointBoltQty + addQty;
      return {
        ...it,
        isCustomRow: false,
        label: customLabel,
        boltName,
        dia,
        length,
        addQty,
        totalQty
      };
    });

    customJointBoltRows.forEach(cRow => {
      if (deletedJointBoltIds.has(cRow.rowId)) return;
      const ov = jointBoltOverrides[cRow.rowId] || {};
      const addQty = Number(ov.add) || Number(cRow.add) || 0;
      const baseQty = Number(cRow.baseQty) || 0;
      activeItems.push({
        rowId: cRow.rowId,
        section: cRow.section || 'CUSTOM',
        label: ov.customLabel || cRow.label || 'Custom Joint Bolt',
        jointType: 'CUSTOM',
        seams: cRow.seams || 1,
        panels: cRow.panels || [{ role: 'Custom Part', code: cRow.panelCode || '(Custom)', holeCount: cRow.holesPerSeam || 8 }],
        calcFormula: cRow.calcFormula || `${cRow.holesPerSeam || 8} holes × ${cRow.seams || 1} = ${baseQty} PCS`,
        jointBoltQty: baseQty,
        benchmarkQty: baseQty,
        isCustom: true,
        isCustomRow: true,
        status: 'CUSTOM_PRECISION',
        boltName: ov.boltName || cRow.boltName || 'WBT-1045',
        dia: ov.dia || cRow.dia || 10,
        length: ov.length || cRow.length || 45,
        addQty,
        totalQty: baseQty + addQty
      });
    });

    const totalAppliedBolts = activeItems.reduce((s, it) => s + it.totalQty, 0);
    const totalBenchmarkBolts = activeItems.reduce((s, it) => s + (it.benchmarkQty || 0), 0);
    const deltaTotal = totalAppliedBolts - totalBenchmarkBolts;

    const sections = ['ROOF', 'BOTTOM', 'SIDE', 'PARTITION'];
    activeItems.forEach(it => {
      if (it.section && sections.indexOf(it.section) === -1) sections.push(it.section);
    });

    // Available standard bolt options for quick dropdown
    const standardBoltOptions = [
      { libId: '6', dia: 10, length: 35, boltName: 'WBT-1035', label: 'M10 x 35 (WBT-1035)' },
      { libId: '8', dia: 10, length: 45, boltName: 'WBT-1045', label: 'M10 x 45 (WBT-1045)' },
      { libId: '43', dia: 10, length: 60, boltName: 'WBT-1060', label: 'M10 x 60 (WBT-1060)' },
      { libId: '48', dia: 12, length: 40, boltName: 'WBT-1240', label: 'M12 x 40 (WBT-1240)' },
      { libId: '26', dia: 12, length: 50, boltName: 'WBT-1250', label: 'M12 x 50 (WBT-1250)' },
      { libId: '53', dia: 14, length: 40, boltName: 'WBT-1440', label: 'M14 x 40 (WBT-1440)' },
      { libId: '25', dia: 14, length: 60, boltName: 'WBT-1460P', label: 'M14 x 60 (WBT-1460P)' },
      { libId: '58', dia: 16, length: 40, boltName: 'WBT-1640', label: 'M16 x 40 (WBT-1640)' },
      { libId: '59', dia: 16, length: 100, boltName: 'WBT-16100', label: 'M16 x 100 (WBT-16100)' }
    ];

    let subHtml = `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); width: 100%; box-sizing: border-box;">
        
        <!-- Header & KPI Cards -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: #ede9fe; color: #6d28d9; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-microscope"></i> JOINT BOLT SPEC ENGINE
              </span>
              <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a;">
                Panel Hole-Based Joint Bolt Manager & Verification
              </h3>
            </div>
            <div style="margin-top: 4px; font-size: 12px; color: #475569; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px;">
                <i class="fa-solid fa-ruler-combined"></i> Size: ${dim.length}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M³ [${dim.numPartition} Partitions]
              </span>
              <span style="font-weight: 700; color: #4338ca; background: #e0e7ff; padding: 2px 8px; border-radius: 4px;">
                <i class="fa-solid fa-building"></i> Preset: ${escapeAttr(panelPresetName)}
              </span>
            </div>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" onclick="window.addCustomJointBoltRowPrompt('SIDE')" class="btn btn-primary btn-sm" style="background: #7c3aed; color: #ffffff; font-weight: 700; font-size: 11.5px; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(124,58,237,0.25);">
              <i class="fa-solid fa-plus"></i> + Add Custom Joint Bolt
            </button>
            <button type="button" onclick="window.saveJointBoltSettings(true)" class="btn btn-outline btn-sm" style="border-color: #0284c7; color: #0284c7; font-weight: 700; font-size: 11.5px; padding: 5px 10px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-floppy-disk"></i> Save Configuration
            </button>
            <button type="button" onclick="window.showPanelHoleAuditModal()" class="btn btn-outline btn-sm" style="border-color: #7c3aed; color: #7c3aed; background: #faf5ff; font-weight: 700; font-size: 11.5px; padding: 5px 10px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-magnifying-glass-chart"></i> Verification Report
            </button>
            <button type="button" onclick="window.exportJointBoltAuditToExcel()" class="btn btn-outline btn-sm" style="border-color: #10b981; color: #059669; font-weight: 700; font-size: 11.5px; padding: 5px 10px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-file-excel"></i> Export CSV
            </button>
            <button type="button" onclick="window.resetJointBoltSettings()" class="btn btn-outline btn-sm" style="color: #64748b; font-size: 11.5px; padding: 5px 10px;">
              <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
          </div>
        </div>

        <!-- 4 KPI Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px;">
          <div style="background: #f5f3ff; border: 1.5px solid #c4b5fd; border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; font-weight: 700; color: #6d28d9; text-transform: uppercase;">Total Joint Bolts</div>
            <div style="font-size: 22px; font-weight: 900; color: #4c1d95; margin-top: 2px;">${totalAppliedBolts.toLocaleString()} <span style="font-size: 12px; font-weight: 600;">PCS</span></div>
            <div style="font-size: 10.5px; color: #7c3aed; margin-top: 2px;">Live applied panel hole bolt count</div>
          </div>

          <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; font-weight: 700; color: #0369a1; text-transform: uppercase;">Formula Benchmark</div>
            <div style="font-size: 22px; font-weight: 900; color: #0c4a6e; margin-top: 2px;">${totalBenchmarkBolts.toLocaleString()} <span style="font-size: 12px; font-weight: 600;">PCS</span></div>
            <div style="font-size: 10.5px; color: #0284c7; margin-top: 2px;">Standard holes/m formula benchmark</div>
          </div>

          <div style="background: ${deltaTotal === 0 ? '#f0fdf4' : '#fffbeb'}; border: 1.5px solid ${deltaTotal === 0 ? '#86efac' : '#fcd34d'}; border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; font-weight: 700; color: ${deltaTotal === 0 ? '#15803d' : '#b45309'}; text-transform: uppercase;">Verification Status</div>
            <div style="font-size: 18px; font-weight: 900; color: ${deltaTotal === 0 ? '#166534' : '#92400e'}; margin-top: 4px;">
              ${deltaTotal === 0 ? '✓ 100% Match' : (deltaTotal > 0 ? `+${deltaTotal} Diff` : `${deltaTotal} Diff`)}
            </div>
            <div style="font-size: 10.5px; color: ${deltaTotal === 0 ? '#16a34a' : '#d97706'}; margin-top: 2px;">
              ${deltaTotal === 0 ? 'Exact numerical equality' : 'Custom precision/margin active'}
            </div>
          </div>

          <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Active Joint Connections</div>
            <div style="font-size: 22px; font-weight: 900; color: #1e293b; margin-top: 2px;">${activeItems.length} <span style="font-size: 12px; font-weight: 600;">Types</span></div>
            <div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">
              ${customJointBoltRows.length > 0 ? `${customJointBoltRows.length} custom joints added` : 'All 13 standard joint seams'}
            </div>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 250px;">
            <input type="text" id="jointEngineSearchInput" oninput="window.filterJointEngineTable()" placeholder="🔍 Search Joint ID (AP5), Location, Bolt Spec, or Panel Code..." style="width: 100%; padding: 6px 12px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box;">
          </div>
          <div style="display: flex; gap: 4px;">
            <button type="button" onclick="window.filterJointEngineSection('ALL')" class="btn btn-sm btn-je-filter active" style="padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #0f172a; color: #ffffff; cursor: pointer;">All (${activeItems.length})</button>
            <button type="button" onclick="window.filterJointEngineSection('ROOF')" class="btn btn-sm btn-je-filter" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer;">Roof</button>
            <button type="button" onclick="window.filterJointEngineSection('BOTTOM')" class="btn btn-sm btn-je-filter" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer;">Bottom</button>
            <button type="button" onclick="window.filterJointEngineSection('SIDE')" class="btn btn-sm btn-je-filter" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer;">Side</button>
            <button type="button" onclick="window.filterJointEngineSection('PARTITION')" class="btn btn-sm btn-je-filter" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer;">Partition</button>
            ${customJointBoltRows.length > 0 ? `<button type="button" onclick="window.filterJointEngineSection('CUSTOM')" class="btn btn-sm btn-je-filter" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #c4b5fd; background: #faf5ff; color: #7c3aed; cursor: pointer;">Custom (${customJointBoltRows.length})</button>` : ''}
          </div>
        </div>

        <!-- Joint Bolt Specifications Table -->
        <div class="table-wrapper" style="max-height: 650px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.03);">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 6px 6px; border: 1px solid #cbd5e1; width: 60px; text-align: center; background: #f1f5f9;">JOINT ID</th>
                <th style="padding: 6px 6px; border: 1px solid #cbd5e1; width: 170px; background: #f1f5f9;">Assemble Location Name</th>
                <th style="padding: 6px 6px; border: 1px solid #cbd5e1; width: 190px; background: #f1f5f9;">Resolved Panel & Hole Spec</th>
                <th style="padding: 6px 6px; border: 1px solid #cbd5e1; width: 160px; background: #f1f5f9; text-align: center;">Bolt Spec / Part No</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; width: 45px; text-align: center; background: #f1f5f9;">DIA</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; width: 45px; text-align: center; background: #f1f5f9;">LEN</th>
                <th style="padding: 6px 6px; border: 1px solid #cbd5e1; width: 220px; background: #f1f5f9;">Hole Calculation Breakdown</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; width: 45px; background: #f1f5f9;">Base</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; width: 45px; background: #f1f5f9;">+Add</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: right; width: 50px; background: #f5f3ff; color: #6d28d9; font-weight: 800;">Total</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; width: 65px; background: #f1f5f9;">Status</th>
                <th style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; width: 80px; background: #f1f5f9;">Action</th>
              </tr>
            </thead>
            <tbody id="jointEngineTbody">
              ${sections.map(sectionName => {
                const secItems = activeItems.filter(it => it.section === sectionName || (sectionName === 'CUSTOM' && it.isCustomRow));
                if (secItems.length === 0) return '';
                return `
                  <tr style="background: #f5f3ff; font-weight: 800; color: #6d28d9; position: sticky; top: 29px; z-index: 9;">
                    <td colspan="7" style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 12px; letter-spacing: 0.3px;">
                      ■ ${sectionName} JOINT BOLTS
                    </td>
                    <td colspan="5" style="padding: 3px 8px; border: 1px solid #cbd5e1; text-align: right;">
                      <button type="button" onclick="window.addCustomJointBoltRowPrompt('${sectionName}')" style="padding: 3px 8px; font-size: 10.5px; font-weight: 700; background: #7c3aed; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;">
                        <i class="fa-solid fa-plus"></i> Add Bolt to ${sectionName}
                      </button>
                    </td>
                  </tr>
                  ${secItems.map((it, idx) => {
                    const isMatch = it.jointBoltQty === it.benchmarkQty;
                    return `
                      <tr data-section="${it.section}" data-rowid="${it.rowId}" style="border-bottom: 1px solid #e2e8f0; background: ${it.isCustomRow ? '#faf5ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')};">
                        <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #7c3aed; text-align: center; background: ${it.isCustomRow ? '#ede9fe' : '#f5f3ff'};">
                          ${it.rowId}
                        </td>
                        <td style="padding: 3px 6px; border: 1px solid #e2e8f0;">
                          <input type="text" value="${escapeAttr(it.label)}" onchange="window.updateJointBoltSetting('${it.rowId}', 'customLabel', this.value)" style="width: 100%; padding: 2px 4px; font-size: 11px; font-weight: 600; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; box-sizing: border-box;">
                        </td>
                        <td style="padding: 3px 6px; border: 1px solid #e2e8f0; font-size: 10.5px; color: #334155;">
                          ${it.panels && it.panels.length ? it.panels.map(p => `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 1px;">
                              <span style="font-weight: 600; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeAttr(p.role)}:</span>
                              <span style="font-family: monospace; font-weight: 700; color: #0f172a; background: #e0f2fe; padding: 0 3px; border-radius: 2px;">${escapeAttr(p.code || '-')}</span>
                              ${p.holeCount != null ? `<span style="background: #ede9fe; color: #6d28d9; padding: 0 4px; border-radius: 3px; font-weight: 800; font-size: 9.5px;">${p.holeCount}h</span>` : `<span style="color: #94a3b8; font-size: 9px;">(${p.fallback || 8}h)</span>`}
                            </div>
                          `).join('') : '<span style="color: #94a3b8;">-</span>'}
                        </td>
                        <td style="padding: 2px 4px; border: 1px solid #e2e8f0; text-align: center;">
                          <div style="display: flex; align-items: center; gap: 2px;">
                            <select onchange="window.selectJointBoltStandardSpec('${it.rowId}', this.value)" style="width: 100%; padding: 2px 2px; font-size: 10.5px; font-family: monospace; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1; border-radius: 4px; background: #ffffff;">
                              ${standardBoltOptions.map(opt => `
                                <option value="${opt.libId}" ${it.boltName === opt.boltName && Number(it.dia) === opt.dia && Number(it.length) === opt.length ? 'selected' : ''}>
                                  ${opt.label}
                                </option>
                              `).join('')}
                              <option value="custom" ${!standardBoltOptions.some(opt => opt.boltName === it.boltName) ? 'selected' : ''}>Custom: ${it.boltName}</option>
                            </select>
                          </div>
                        </td>
                        <td style="padding: 2px 2px; border: 1px solid #e2e8f0; text-align: center;">
                          <input type="number" value="${it.dia}" onchange="window.updateJointBoltSetting('${it.rowId}', 'dia', Number(this.value))" style="width: 32px; padding: 1px 0; font-size: 10.5px; font-weight: 700; text-align: center; border: 1px solid #cbd5e1; border-radius: 3px;">
                        </td>
                        <td style="padding: 2px 2px; border: 1px solid #e2e8f0; text-align: center;">
                          <input type="number" value="${it.length}" onchange="window.updateJointBoltSetting('${it.rowId}', 'length', Number(this.value))" style="width: 32px; padding: 1px 0; font-size: 10.5px; font-weight: 700; text-align: center; border: 1px solid #cbd5e1; border-radius: 3px;">
                        </td>
                        <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 10.5px; color: #0f172a; word-break: break-all;">
                          ${escapeAttr(it.calcFormula)}
                        </td>
                        <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; font-size: 11px; color: #475569;">
                          ${it.jointBoltQty}
                        </td>
                        <td style="padding: 2px 2px; border: 1px solid #e2e8f0; text-align: right;">
                          <input type="number" value="${it.addQty}" onchange="window.updateJointBoltAdd('${it.rowId}', this.value)" style="width: 36px; padding: 1px 2px; font-size: 10.5px; font-weight: 700; text-align: right; color: #0284c7; border: 1px solid #cbd5e1; border-radius: 3px;">
                        </td>
                        <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 900; font-size: 12px; color: #6d28d9; background: #faf5ff;">
                          ${it.totalQty}
                        </td>
                        <td style="padding: 4px 4px; border: 1px solid #e2e8f0; text-align: center;">
                          ${isMatch ? `
                            <span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 4px; padding: 1px 5px; font-size: 9.5px; font-weight: 800; white-space: nowrap;">
                              ✓ Match
                            </span>
                          ` : `
                            <span style="background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; border-radius: 4px; padding: 1px 5px; font-size: 9.5px; font-weight: 800; white-space: nowrap;">
                              ${it.jointBoltQty > it.benchmarkQty ? `+${it.jointBoltQty - it.benchmarkQty}` : `${it.jointBoltQty - it.benchmarkQty}`}
                            </span>
                          `}
                        </td>
                        <td style="padding: 2px 4px; border: 1px solid #e2e8f0; text-align: center;">
                          <div style="display: flex; align-items: center; justify-content: center; gap: 3px;">
                            <button type="button" onclick="window.copyJointBoltRow('${it.rowId}')" title="Copy / Duplicate this Joint Bolt" style="background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; border-radius: 3px; padding: 2px 4px; font-size: 10px; cursor: pointer;">
                              <i class="fa-solid fa-copy"></i>
                            </button>
                            <button type="button" onclick="window.deleteJointBoltRow('${it.rowId}', ${it.isCustomRow})" title="Delete / Hide this Joint Bolt" style="background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 3px; padding: 2px 4px; font-size: 10px; cursor: pointer;">
                              <i class="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1.5px solid #e2e8f0;">
          <div style="font-size: 11.5px; color: #64748b;">
            <i class="fa-solid fa-circle-check" style="color: #7c3aed; margin-right: 4px;"></i>
            All joint bolt selections and custom additions are automatically saved per customer company preset.
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" onclick="window.navigateToPanelHoleSpecTab()" style="background: #ede9fe; color: #6d28d9; border: 1.5px solid #c4b5fd; font-weight: 700; font-size: 11.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
              <i class="fa-solid fa-sliders"></i> Go to Panel Hole Spec Manager
            </button>
            <button type="button" onclick="window.saveJointBoltSettings(true)" style="background: #7c3aed; color: #ffffff; font-weight: 700; font-size: 11.5px; padding: 5px 16px; border-radius: 6px; border: none; cursor: pointer;">
              <i class="fa-solid fa-check"></i> Save & Apply
            </button>
          </div>
        </div>

      </div>
    `;

    return subHtml;
  }

  function getDefaultBoltNameForJoint(rowId) {
    if (rowId === 'AP19') return 'WBT-1035';
    if (rowId === 'AP7' || rowId === 'AP14') return 'WBT-1045';
    if (rowId === 'AP22') return 'WBT-1045';
    if (rowId === 'AP29' || rowId === 'AP30' || rowId === 'AP32' || rowId === 'AP33') return 'WBT-1045';
    return 'WBT-1045';
  }

  function getDefaultDiaForJoint(rowId) {
    return 10;
  }

  function getDefaultLengthForJoint(rowId) {
    if (rowId === 'AP19') return 35;
    return 45;
  }

  // --- Handlers for Joint Bolt Manager ---
  window.switchBoltAuditSubView = function(viewKey) {
    activeBoltSubView = viewKey;
    renderBoltAuditView();
  };

  window.selectJointBoltStandardSpec = function(rowId, val) {
    if (val === 'custom') {
      const customName = prompt('Enter custom bolt name (e.g. WBT-1250, WBT-1640):', 'WBT-1045');
      if (customName) {
        if (!jointBoltOverrides[rowId]) jointBoltOverrides[rowId] = {};
        jointBoltOverrides[rowId].boltName = customName.trim();
        saveJointBoltSettings();
      }
      return;
    }
    const standardSpecs = {
      '6': { dia: 10, length: 35, boltName: 'WBT-1035' },
      '8': { dia: 10, length: 45, boltName: 'WBT-1045' },
      '43': { dia: 10, length: 60, boltName: 'WBT-1060' },
      '48': { dia: 12, length: 40, boltName: 'WBT-1240' },
      '26': { dia: 12, length: 50, boltName: 'WBT-1250' },
      '53': { dia: 14, length: 40, boltName: 'WBT-1440' },
      '25': { dia: 14, length: 60, boltName: 'WBT-1460P' },
      '58': { dia: 16, length: 40, boltName: 'WBT-1640' },
      '59': { dia: 16, length: 100, boltName: 'WBT-16100' }
    };
    const spec = standardSpecs[val];
    if (spec) {
      if (!jointBoltOverrides[rowId]) jointBoltOverrides[rowId] = {};
      jointBoltOverrides[rowId].dia = spec.dia;
      jointBoltOverrides[rowId].length = spec.length;
      jointBoltOverrides[rowId].boltName = spec.boltName;
      saveJointBoltSettings();
    }
  };

  window.updateJointBoltSetting = function(rowId, field, val) {
    if (!jointBoltOverrides[rowId]) jointBoltOverrides[rowId] = {};
    jointBoltOverrides[rowId][field] = val;
    saveJointBoltSettings();
  };

  window.updateJointBoltAdd = function(rowId, val) {
    if (!jointBoltOverrides[rowId]) jointBoltOverrides[rowId] = {};
    jointBoltOverrides[rowId].add = Number(val) || 0;
    saveJointBoltSettings();
  };

  window.addCustomJointBoltRowPrompt = function(section) {
    const locName = prompt(`Enter Assemble Location Name for new Joint Bolt (${section || 'SIDE'}):`, 'Special Cutout Joint');
    if (!locName || !locName.trim()) return;

    const baseHoles = prompt('Enter Hole Count or Base Quantity (e.g. 16):', '16');
    const baseQty = Number(baseHoles) || 16;

    const newId = 'CJ' + (customJointBoltRows.length + 1).toString().padStart(2, '0');
    customJointBoltRows.push({
      rowId: newId,
      section: section || 'SIDE',
      label: locName.trim(),
      baseQty: baseQty,
      seams: 1,
      holesPerSeam: baseQty,
      panelCode: '(Custom)',
      boltName: 'WBT-1045',
      dia: 10,
      length: 45,
      add: 0,
      calcFormula: `Manual spec: ${baseQty} holes = ${baseQty} PCS`
    });

    saveJointBoltSettings(true);
  };

  window.deleteJointBoltRow = function(rowId, isCustom) {
    if (confirm(`Delete / Hide Joint Bolt "${rowId}"?`)) {
      if (isCustom) {
        customJointBoltRows = customJointBoltRows.filter(r => r.rowId !== rowId);
      } else {
        deletedJointBoltIds.add(rowId);
      }
      saveJointBoltSettings(true);
    }
  };

  window.copyJointBoltRow = function(rowId) {
    const newId = 'CJ' + (customJointBoltRows.length + 1).toString().padStart(2, '0');
    const existing = jointBoltOverrides[rowId] || {};
    customJointBoltRows.push({
      rowId: newId,
      section: 'CUSTOM',
      label: (existing.customLabel || rowId) + ' (Copy)',
      baseQty: 16,
      seams: 1,
      holesPerSeam: 16,
      panelCode: '(Cloned)',
      boltName: existing.boltName || 'WBT-1045',
      dia: existing.dia || 10,
      length: existing.length || 45,
      add: existing.add || 0,
      calcFormula: `Cloned from ${rowId}`
    });
    saveJointBoltSettings(true);
  };

  window.saveJointBoltSettings = function(showAlert) {
    const party = getActivePartyName();
    if (!companyBoltPresets) companyBoltPresets = {};
    if (!companyBoltPresets[party]) companyBoltPresets[party] = {};
    
    companyBoltPresets[party].jointBoltOverrides = JSON.parse(JSON.stringify(jointBoltOverrides));
    companyBoltPresets[party].customJointBoltRows = JSON.parse(JSON.stringify(customJointBoltRows));
    companyBoltPresets[party].deletedJointBoltIds = Array.from(deletedJointBoltIds);

    try {
      localStorage.setItem(COMPANY_PRESETS_KEY, JSON.stringify(companyBoltPresets));
    } catch (e) {
      console.warn('Failed to save joint bolt settings to localStorage:', e);
    }

    if (showAlert) {
      alert(`[Saved] Panel Hole Joint Bolt configuration updated for preset "${party}".`);
    }
    renderBoltAuditView();
  };

  window.resetJointBoltSettings = function() {
    if (confirm('Reset all Joint Bolt specifications and custom additions to defaults for current company preset?')) {
      jointBoltOverrides = {};
      customJointBoltRows = [];
      deletedJointBoltIds = new Set();
      saveJointBoltSettings(true);
    }
  };

  window.filterJointEngineTable = function() {
    const query = (document.getElementById('jointEngineSearchInput')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#jointEngineTbody tr');
    rows.forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = text.includes(query) ? '' : 'none';
    });
  };

  window.filterJointEngineSection = function(section) {
    const buttons = document.querySelectorAll('.btn-je-filter');
    buttons.forEach(btn => {
      const isCurrent = (section === 'ALL' && btn.textContent.includes('All')) || btn.textContent.toUpperCase().includes(section);
      btn.style.background = isCurrent ? '#0f172a' : '#ffffff';
      btn.style.color = isCurrent ? '#ffffff' : '#475569';
    });

    const rows = document.querySelectorAll('#jointEngineTbody tr');
    rows.forEach(tr => {
      const sec = tr.getAttribute('data-section');
      if (section === 'ALL' || sec === section || (section === 'CUSTOM' && sec === 'CUSTOM')) {
        tr.style.display = '';
      } else {
        tr.style.display = 'none';
      }
    });
  };

  window.exportJointBoltAuditToExcel = function() {
    const dim = getTankDimensions();
    const rows = document.querySelectorAll('#jointEngineTbody tr');
    let csv = `Panel Hole Joint Bolt Engine Specification Report\n`;
    csv += `Tank Size,${dim.length}m(L) x ${dim.width}m(W) x ${dim.height}m(H),Partitions,${dim.numPartition}\n\n`;
    csv += `Joint ID,Location Name,Bolt Spec,DIA,LEN,Breakdown,Base Qty,Add Qty,Total Qty,Status\n`;

    rows.forEach(tr => {
      const rowId = tr.getAttribute('data-rowid');
      if (!rowId) return;
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 10) {
        const id = cells[0].textContent.trim();
        const loc = cells[1].querySelector('input') ? cells[1].querySelector('input').value : cells[1].textContent.trim();
        const bolt = cells[3].querySelector('select') ? cells[3].querySelector('select').options[cells[3].querySelector('select').selectedIndex].text : '';
        const dia = cells[4].querySelector('input') ? cells[4].querySelector('input').value : '';
        const len = cells[5].querySelector('input') ? cells[5].querySelector('input').value : '';
        const calc = cells[6].textContent.trim();
        const base = cells[7].textContent.trim();
        const add = cells[8].querySelector('input') ? cells[8].querySelector('input').value : '0';
        const tot = cells[9].textContent.trim();
        const stat = cells[10].textContent.trim();
        csv += `"${id}","${loc}","${bolt}",${dia},${len},"${calc}",${base},${add},${tot},"${stat}"\n`;
      }
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Joint_Bolt_Spec_${dim.length}x${dim.width}x${dim.height}m.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  window.exportBoltAuditToExcel = function () {
    const dim = getTankDimensions();
    const rules = boltRules();
    const rowsById = {};
    if (rules) rules.rows.forEach((r) => { rowsById[r.id] = r; });
    const overrides = window.getBoltCatalogOverrides();
    const materialOptions = (rules && rules.materialOptions) || [];
    const data = computeBoltAuditData(dim);

    let csvContent = `Size: ${dim.length}m(L) x ${dim.width}m(W) x ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M3\n`;
    csvContent += `SECTION,PART NAME,Assemble Location,INITIAL Qty,Applied Qty,Add (+),${materialOptions.map(m => m.label).join(',')}\n`;

    data.forEach(r => {
      const row = rowsById[r.rowId];
      const matCols = materialOptions.map(m => row ? resolvePartNoForOption(row, m.value, overrides) : (r.isCustom ? r.item : '')).map(v => `"${v}"`).join(',');
      csvContent += `"${r.group}","${r.item}","${r.loc}",${r.qty},${r.qty},${r.add},${matCols}\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bolt_Calculation_Audit_${dim.length}x${dim.width}x${dim.height}m.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  window.deleteBoltSettingRow = function(origIdx) {
    if (origIdx >= 0 && origIdx < boltSettings.items.length) {
      const item = boltSettings.items[origIdx];
      if (confirm(`Delete catalog bolt setting for "${item.location || 'Selected Row'}"?`)) {
        boltSettings.items.splice(origIdx, 1);
        saveBoltSettings(true);
      }
    }
  };

  window.renderBoltAuditView = renderBoltAuditView;
  window.saveBoltSettings = saveBoltSettings;
  window.resetBoltSettings = resetBoltSettings;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      loadSavedBoltSettings();
      loadSavedMaterialCellOverrides();
      setTimeout(renderBoltAuditView, 300);

      const tabBtn = document.querySelector('.tab-btn[data-tab="tab-bolt-recipes"]');
      if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(renderBoltAuditView, 0));

      ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight', 'numPartition', 'reinfMethod', 'boltMaterial', 'sidePanelOnly'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', renderBoltAuditView);
          el.addEventListener('change', renderBoltAuditView);
        }
      });
    });
  }
})();
