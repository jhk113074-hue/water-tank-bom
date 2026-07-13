// =============================================================================
// WATANI GRP Water Tank -- Rule Editor UI ("수식 설정" tab)
// =============================================================================
// Lets a non-developer browse and edit every formula in accessories_rules.js
// / panel_rules.js directly from the web app, without opening a text editor.
//
// How it works:
//   1. At script-parse time (i.e. as soon as this file loads, BEFORE
//      DOMContentLoaded), it builds a flat list of every editable formula
//      field from the live window.AccessoriesRules / window.PanelRules
//      objects, snapshots their ORIGINAL shipped values (for "reset to
//      default"), then immediately applies any previously-saved overrides
//      from localStorage. This guarantees saved edits are active before any
//      BOM calculation can run, with no async/Firestore race condition.
//   2. RuleEditorUI.init(db) (called from app.js's DOMContentLoaded, after
//      Firebase is ready) wires up the tab's UI and additionally syncs
//      overrides from Firestore (so edits made on one device/browser show
//      up on others), same pattern as the parts master DB.
//   3. Because this file mutates the SAME objects that panel_engine.js /
//      accessories_engine.js already captured a reference to (not clones),
//      edits take effect immediately -- no reload needed, just re-run
//      "BOM 자동 생성".
//
// Scope: exposes the FORMULA/coefficient fields (accessories_rules.js +
// panel_rules.js). Vendor part-number data (panel_catalog.js) and the two
// large lookup tables in accessories_rules.js (tie-rod's layerFactorTable /
// segmentTable) are still text-file-only -- they're either large tables or
// not really "formulas" in the sense this editor targets.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_rule_overrides_v1";

  let categories = [];
  let defaults = {};   // fieldKey -> original shipped formula string
  let overrides = {};  // fieldKey -> currently-applied override formula string
  let dbRef = null;
  let currentCatIndex = 0;

  function fieldKey(catId, tableIdx, fieldId) {
    return catId + "::" + tableIdx + "::" + fieldId;
  }

  function arrField(arr) {
    return (arr || []).map(function (item) {
      return {
        id: item.name || item.id,
        get: function () { return item.formula; },
        set: function (v) { item.formula = v; },
      };
    });
  }

  function dictField(dict) {
    return Object.keys(dict || {}).map(function (k) {
      return {
        id: k,
        get: function () { return dict[k]; },
        set: function (v) { dict[k] = v; },
      };
    });
  }

  function buildCategories() {
    const AR = global.AccessoriesRules;
    const PR = global.PanelRules;
    if (!AR || !PR) return [];
    const cats = [];

    cats.push({ id: "reinf_ext", label: "보강재 - External (Reinforcing External)", tables: [
      { label: "중간값 (Intermediates)", fields: arrField(AR.reinforcing.external.intermediates) },
      { label: "항목별 수량식 (Rows)", fields: arrField(AR.reinforcing.external.rows) },
    ] });
    cats.push({ id: "reinf_int", label: "보강재 - Internal (Reinforcing Internal)", tables: [
      { label: "중간값 (Intermediates)", fields: arrField(AR.reinforcing.internal.intermediates) },
      { label: "항목별 수량식 (Rows)", fields: arrField(AR.reinforcing.internal.rows) },
    ] });
    cats.push({ id: "tierod", label: "타이로드 (Tie-Rod)", tables: [
      { label: "중간값 (Intermediates)", fields: arrField(AR.tieRod.intermediates) },
    ] });
    cats.push({ id: "bolts", label: "볼트 & 너트 (Bolts & Nuts)", tables: [
      { label: "중간값 (Intermediates)", fields: arrField(AR.boltsAndNuts.intermediates) },
    ] });
    cats.push({ id: "misc", label: "용량 / 에어벤트 / 루프서포터 / 스틸스키드", tables: [
      { label: "용량 (Capacity)", fields: [
        { id: "capacity.nominalFormula", get: function () { return AR.capacity.nominalFormula; }, set: function (v) { AR.capacity.nominalFormula = v; } },
        { id: "capacity.actualFormula", get: function () { return AR.capacity.actualFormula; }, set: function (v) { AR.capacity.actualFormula = v; } },
        { id: "capacity.surfaceAreaFormula", get: function () { return AR.capacity.surfaceAreaFormula; }, set: function (v) { AR.capacity.surfaceAreaFormula = v; } },
      ] },
      { label: "에어벤트 / 루프서포터 / 스틸스키드", fields: [
        { id: "airVent.perCompartmentFormula", get: function () { return AR.airVent.perCompartmentFormula; }, set: function (v) { AR.airVent.perCompartmentFormula = v; } },
        { id: "roofSupporter.termFormula", get: function () { return AR.roofSupporter.termFormula; }, set: function (v) { AR.roofSupporter.termFormula = v; } },
        { id: "steelSkid.b42Formula", get: function () { return AR.steelSkid.b42Formula; }, set: function (v) { AR.steelSkid.b42Formula = v; } },
        { id: "steelSkid.b43Formula", get: function () { return AR.steelSkid.b43Formula; }, set: function (v) { AR.steelSkid.b43Formula = v; } },
        { id: "steelSkid.b44Formula", get: function () { return AR.steelSkid.b44Formula; }, set: function (v) { AR.steelSkid.b44Formula = v; } },
      ] },
    ] });
    cats.push({ id: "panel_common", label: "패널 - 공통 (Common)", tables: [
      { label: "공통 중간값", fields: arrField(PR.COMMON_INTERMEDIATES) },
    ] });
    const courseDefs = [
      ["roofBottom", "패널 - 지붕/바닥 (Roof & Bottom)"],
      ["side15Top", "패널 - 측벽 TOP_15"],
      ["side20Top", "패널 - 측벽 TOP_20"],
      ["midTop", "패널 - 측벽 MID_TOP"],
      ["midLower", "패널 - 측벽 MID_LOWER"],
      ["lower", "패널 - 측벽 LOWER"],
      ["baseFiller", "패널 - 필러 (BASE_FILLER)"],
    ];
    courseDefs.forEach(function (pair) {
      const key = pair[0], label = pair[1];
      const grp = PR.RULE_GROUPS[key];
      const tables = [];
      if (grp.intermediates && grp.intermediates.length) {
        tables.push({ label: "중간값", fields: arrField(grp.intermediates) });
      }
      tables.push({ label: "수량 결과값", fields: dictField(grp.outputs) });
      cats.push({ id: "panel_" + key, label: label, tables: tables });
    });
    cats.push({ id: "panel_partition", label: "패널 - 격벽 템플릿 (Partition Templates)", tables: [
      { label: "TOP_15", fields: dictField(PR.PARTITION_TEMPLATES.top15) },
      { label: "TOP_20", fields: dictField(PR.PARTITION_TEMPLATES.top20) },
      { label: "기타 (LOWER / MID_LOWER / MID_TOP / LOWER_SOLO)", fields: dictField(PR.PARTITION_TEMPLATES.other) },
    ] });
    return cats;
  }

  function snapshotDefaults() {
    const snap = {};
    categories.forEach(function (cat) {
      cat.tables.forEach(function (table, tIdx) {
        table.fields.forEach(function (field) {
          snap[fieldKey(cat.id, tIdx, field.id)] = field.get();
        });
      });
    });
    return snap;
  }

  function applyOverridesObject(overridesObj) {
    if (!overridesObj) return;
    categories.forEach(function (cat) {
      cat.tables.forEach(function (table, tIdx) {
        table.fields.forEach(function (field) {
          const key = fieldKey(cat.id, tIdx, field.id);
          if (Object.prototype.hasOwnProperty.call(overridesObj, key)) {
            field.set(overridesObj[key]);
          }
        });
      });
    });
  }

  function loadLocalOverrides() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("[RuleEditor] localStorage 불러오기 실패:", e);
      return {};
    }
  }

  function saveLocalOverrides(obj) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.error("[RuleEditor] localStorage 저장 실패:", e);
    }
  }

  function persist(db) {
    saveLocalOverrides(overrides);
    if (db) {
      db.collection("settings").doc("ruleOverrides")
        .set({ overrides: overrides, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(function (err) {
          console.warn("[RuleEditor] Firestore에 수식 오버라이드 저장 실패 (localStorage에는 저장됨):", err);
        });
    }
  }

  function syncFromFirestore(db) {
    if (!db) return Promise.resolve();
    return db.collection("settings").doc("ruleOverrides").get().then(function (doc) {
      if (doc.exists) {
        const remote = (doc.data() || {}).overrides || {};
        overrides = Object.assign({}, overrides, remote);
        applyOverridesObject(overrides);
        saveLocalOverrides(overrides);
      }
    }).catch(function (err) {
      console.warn("[RuleEditor] Firestore 수식 오버라이드 불러오기 실패, localStorage만 사용:", err);
    });
  }

  // ---- Run immediately at script-parse time (see file header) ----
  categories = buildCategories();
  defaults = snapshotDefaults();
  overrides = loadLocalOverrides();
  applyOverridesObject(overrides);

  // ---- DOM rendering (only matters once init() is called with a live DOM) ----
  function isModified(catId, tIdx, fieldId, value) {
    const key = fieldKey(catId, tIdx, fieldId);
    return defaults[key] !== undefined && defaults[key] !== value;
  }

  function renderCategorySelect() {
    const sel = document.getElementById("ruleEditorCategorySelect");
    if (!sel) return;
    sel.innerHTML = "";
    categories.forEach(function (cat, idx) {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = cat.label;
      sel.appendChild(opt);
    });
    sel.value = String(currentCatIndex);
  }

  function renderTables(filterText) {
    const container = document.getElementById("ruleEditorTablesContainer");
    if (!container) return;
    container.innerHTML = "";
    const cat = categories[currentCatIndex];
    if (!cat) return;
    const q = (filterText || "").trim().toLowerCase();

    cat.tables.forEach(function (table, tIdx) {
      const fields = table.fields.filter(function (f) {
        return !q || f.id.toLowerCase().indexOf(q) !== -1;
      });
      if (!fields.length) return;

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "background:#fff;border:1.5px solid var(--border-color);border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);";

      const title = document.createElement("div");
      title.style.cssText = "font-size:13px;font-weight:700;color:var(--neon-blue);margin-bottom:8px;";
      title.textContent = table.label + " (" + fields.length + "개)";
      wrapper.appendChild(title);

      const tbl = document.createElement("table");
      tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:12.5px;";
      tbl.innerHTML =
        '<thead><tr style="text-align:left;border-bottom:1.5px solid var(--border-color);">' +
        '<th style="padding:6px 8px;width:160px;">ID</th>' +
        '<th style="padding:6px 8px;">수식 (Formula)</th>' +
        '<th style="padding:6px 8px;width:60px;text-align:center;">초기화</th>' +
        "</tr></thead>";
      const tbody = document.createElement("tbody");

      fields.forEach(function (field) {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #f0f0f0";

        const tdId = document.createElement("td");
        tdId.style.cssText = "padding:6px 8px;font-family:monospace;color:var(--text-secondary);vertical-align:top;";
        tdId.textContent = field.id;

        const tdInput = document.createElement("td");
        tdInput.style.padding = "6px 8px";
        const input = document.createElement("input");
        input.type = "text";
        input.value = field.get();
        input.dataset.catId = cat.id;
        input.dataset.tableIdx = String(tIdx);
        input.dataset.fieldId = field.id;
        input.style.cssText = "width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid var(--border-color);font-family:monospace;font-size:12px;outline:none;";
        if (isModified(cat.id, tIdx, field.id, field.get())) {
          input.style.background = "#fff7d6";
          input.style.borderColor = "#f0c419";
        }
        input.addEventListener("input", function () {
          const modified = isModified(cat.id, tIdx, field.id, input.value);
          input.style.background = modified ? "#fff7d6" : "";
          input.style.borderColor = modified ? "#f0c419" : "var(--border-color)";
        });
        tdInput.appendChild(input);

        const tdReset = document.createElement("td");
        tdReset.style.cssText = "padding:6px 8px;text-align:center;";
        const btnReset = document.createElement("button");
        btnReset.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
        btnReset.title = "기본값으로";
        btnReset.style.cssText = "border:none;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px;";
        btnReset.addEventListener("click", function () {
          const key = fieldKey(cat.id, tIdx, field.id);
          const def = defaults[key];
          if (def !== undefined) {
            input.value = def;
            input.style.background = "";
            input.style.borderColor = "var(--border-color)";
          }
        });
        tdReset.appendChild(btnReset);

        tr.appendChild(tdId);
        tr.appendChild(tdInput);
        tr.appendChild(tdReset);
        tbody.appendChild(tr);
      });

      tbl.appendChild(tbody);
      wrapper.appendChild(tbl);
      container.appendChild(wrapper);
    });

    if (!container.children.length) {
      container.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:20px;text-align:center;">검색 결과가 없습니다.</div>';
    }
  }

  function setStatus(msg, isError) {
    const el = document.getElementById("ruleEditorStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "var(--neon-rose)" : "var(--text-secondary)";
  }

  function currentSearchValue() {
    const el = document.getElementById("ruleEditorSearchInput");
    return el ? el.value : "";
  }

  function saveCurrentCategory() {
    const cat = categories[currentCatIndex];
    if (!cat) return;
    const inputs = document.querySelectorAll('#ruleEditorTablesContainer input[data-cat-id="' + cat.id + '"]');
    let changedCount = 0;
    const syntaxErrors = [];
    inputs.forEach(function (input) {
      const tIdx = parseInt(input.dataset.tableIdx, 10);
      const fieldId = input.dataset.fieldId;
      const table = cat.tables[tIdx];
      const field = table.fields.filter(function (f) { return f.id === fieldId; })[0];
      if (!field) return;
      const newVal = input.value;
      if (newVal === field.get()) return;
      try {
        if (global.RuleEngine) global.RuleEngine.tokenize(newVal);
      } catch (e) {
        syntaxErrors.push(fieldId + ": " + e.message);
        return;
      }
      field.set(newVal);
      overrides[fieldKey(cat.id, tIdx, fieldId)] = newVal;
      changedCount++;
    });

    if (syntaxErrors.length) {
      setStatus("수식 오류로 저장되지 않은 항목: " + syntaxErrors.join(" / "), true);
    }
    if (changedCount > 0) {
      persist(dbRef);
      setStatus(changedCount + "개 항목 저장 완료. 상단 'BOM 자동 생성' 버튼을 다시 눌러야 반영됩니다. (" + new Date().toLocaleTimeString("ko-KR") + ")", false);
    } else if (!syntaxErrors.length) {
      setStatus("변경된 항목이 없습니다.", false);
    }
    renderTables(currentSearchValue());
  }

  function resetCurrentCategory() {
    const cat = categories[currentCatIndex];
    if (!cat) return;
    if (!global.confirm('"' + cat.label + '" 카테고리를 전부 기본값으로 되돌리고 저장하시겠습니까?')) return;
    cat.tables.forEach(function (table, tIdx) {
      table.fields.forEach(function (field) {
        const key = fieldKey(cat.id, tIdx, field.id);
        if (defaults[key] !== undefined) {
          field.set(defaults[key]);
          delete overrides[key];
        }
      });
    });
    persist(dbRef);
    setStatus('"' + cat.label + '" 카테고리를 기본값으로 초기화했습니다.', false);
    renderTables(currentSearchValue());
  }

  function wireUpUI() {
    const sel = document.getElementById("ruleEditorCategorySelect");
    const search = document.getElementById("ruleEditorSearchInput");
    const btnSave = document.getElementById("btnRuleEditorSaveCategory");
    const btnReset = document.getElementById("btnRuleEditorResetCategory");
    if (!sel || !btnSave || !btnReset || !search) return; // tab not present on this page

    renderCategorySelect();
    renderTables("");

    sel.addEventListener("change", function () {
      currentCatIndex = parseInt(sel.value, 10) || 0;
      setStatus("");
      renderTables(search.value);
    });
    search.addEventListener("input", function () {
      renderTables(search.value);
    });
    btnSave.addEventListener("click", saveCurrentCategory);
    btnReset.addEventListener("click", resetCurrentCategory);
  }

  function init(db) {
    dbRef = db || null;
    if (!categories.length) {
      categories = buildCategories();
      defaults = snapshotDefaults();
      applyOverridesObject(overrides);
    }
    wireUpUI();
    if (dbRef) {
      syncFromFirestore(dbRef).then(function () {
        renderTables(currentSearchValue());
      });
    }
  }

  global.RuleEditorUI = { init: init };
})(typeof window !== "undefined" ? window : globalThis);
