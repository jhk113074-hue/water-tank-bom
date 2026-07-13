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

  function arrField(arr, labelMap) {
    return (arr || []).map(function (item) {
      const id = item.name || item.id;
      return {
        id: id,
        label: (labelMap && labelMap[id]) || null,
        get: function () { return item.formula; },
        set: function (v) { item.formula = v; },
      };
    });
  }

  // Turn a reinforcing.*.partNumbers[rowId] spec (see accessories_rules.js)
  // into a human-readable label. These specs are context-dependent (height/
  // material grade), so this is a best-effort static description, not a
  // resolved value for one specific tank.
  function describePartSpec(spec) {
    if (typeof spec === "string") return spec;
    if (!spec) return null;
    if (spec.materialPrefix) {
      return spec.materialPrefix + "SA2 / " + spec.materialPrefix + "SA4 (볼트&너트 사양에 따라 자동 선택)";
    }
    if (spec.byHeight) {
      return spec.byHeight.map(function (r) {
        return r.part + (r.maxH !== undefined ? " (H≤" + r.maxH + "m)" : " (그 외 높이)");
      }).join(" / ");
    }
    if (spec.byHeightMaterialLR) {
      return spec.byHeightMaterialLR.map(function (r) {
        return r.base + "+SA2/4" + (r.lr ? "(L/R)" : "");
      }).join(" / ") + " -- 높이(H)별 자동 선택";
    }
    return null;
  }

  function partLabelMap(partNumbers) {
    const map = {};
    Object.keys(partNumbers || {}).forEach(function (k) {
      map[k] = describePartSpec(partNumbers[k]);
    });
    return map;
  }

  // Describe one accessories_rules.js boltsAndNuts.rows[] entry: either a
  // fixed "literal" part name, or the lib+suffix resolution across all 6
  // material options (see accessories_rules.js boltsAndNuts.libraryNames).
  function describeBoltRow(row, libraryNames) {
    if (row.literal) return row.literal + " (모든 볼트&너트 사양에서 동일)";
    if (!row.suffix) return "(수량 미사용 / 항상 0)";
    var seen = {};
    var parts = [];
    for (var i = 0; i < row.suffix.length; i++) {
      var libId = (row.libByOption && row.libByOption[i + 1]) || row.lib;
      var name = (libraryNames[libId] || "?") + row.suffix[i];
      if (!seen[name]) { seen[name] = true; parts.push(name); }
    }
    return parts.join(" / ") + " (볼트&너트 사양에 따라 자동 선택)";
  }

  function boltRowLabelMap(rows, libraryNames) {
    var map = {};
    (rows || []).forEach(function (row) {
      map[row.id] = describeBoltRow(row, libraryNames);
    });
    return map;
  }

  // Describe one accessories_rules.js steelSkidDetailed.rows[] entry: shows
  // the real part name for each of the 3 skid types (75mm Angle / 125mm
  // Channel / 150mm Channel-Heavy), or notes when a type has no part at all
  // for that row (e.g. the height-bracket rows 23-26 have no Angle part).
  function describeSkidRow(row) {
    var typeLabels = { angle75: "75각", channel125: "125채널", channel150: "150채널" };
    var parts = ["angle75", "channel125", "channel150"].map(function (t) {
      return row.parts[t] ? (typeLabels[t] + ":" + row.parts[t]) : (typeLabels[t] + ":(해당없음)");
    });
    return parts.join(" / ");
  }

  function skidRowLabelMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      map[row.id] = describeSkidRow(row);
    });
    return map;
  }

  function dictField(dict, labelMap) {
    return Object.keys(dict || {}).map(function (k) {
      return {
        id: k,
        label: (labelMap && labelMap[k]) || null,
        get: function () { return dict[k]; },
        set: function (v) { dict[k] = v; },
      };
    });
  }

  function buildCategories() {
    const AR = global.AccessoriesRules;
    const PR = global.PanelRules;
    const PC = global.PanelCatalog;
    if (!AR || !PR || !PC) return [];
    const cats = [];

    cats.push({ id: "reinf_ext", label: "보강재 - External (Reinforcing External)",
      productNote: "각 row는 원본 엑셀(EXT_REINF!M8:M93) 기준 서로 다른 실제 부품(WFB-/WCA-/WFR-/WBR-/WCP-/WCB- 등)에 대응하는 개별 BOM 라인입니다. SA2/SA4로 표시된 항목은 볼트&너트 사양(Bolts & Nuts Specification) 선택에 따라 부품번호가 자동으로 바뀝니다.",
      tables: [
      { label: "중간값 (Intermediates, 최종 부품 아님)", fields: arrField(AR.reinforcing.external.intermediates) },
      { label: "항목별 수량식 (Rows, 실제 부품명 표시)", fields: arrField(AR.reinforcing.external.rows, partLabelMap(AR.reinforcing.external.partNumbers)) },
    ] });
    cats.push({ id: "reinf_int", label: "보강재 - Internal (Reinforcing Internal)",
      productNote: "각 row는 원본 엑셀(INT_REINF_INT!L8:L55) 기준 서로 다른 실제 부품(WFB-/WCA-/WCP-/WBR- 등)에 대응하는 개별 BOM 라인입니다. SA2/SA4로 표시된 항목은 볼트&너트 사양(Bolts & Nuts Specification) 선택에 따라 부품번호가 자동으로 바뀝니다.",
      tables: [
      { label: "중간값 (Intermediates, 최종 부품 아님)", fields: arrField(AR.reinforcing.internal.intermediates) },
      { label: "항목별 수량식 (Rows, 실제 부품명 표시)", fields: arrField(AR.reinforcing.internal.rows, partLabelMap(AR.reinforcing.internal.partNumbers)) },
    ] });
    cats.push({ id: "tierod", label: "타이로드 (Tie-Rod)",
      productNote: "이 카테고리는 하나의 완제품 수량 계산에 사용됩니다 → WTR-12M300Z · External Tie-Rod Assembly (HDG) (로드+너트+와셔+커플러+앵커 세트). External 보강재를 선택했을 때만 BOM에 나타납니다.",
      tables: [
      { label: "중간값 (Intermediates, 최종 부품 아님)", fields: arrField(AR.tieRod.intermediates) },
    ] });
    cats.push({ id: "bolts", label: "볼트 & 너트 (Bolts & Nuts)",
      productNote: "원본 엑셀(BoltnNuts!AN5:AZ75) 기준 약 50개 조립 위치 각각이 서로 다른 실제 볼트/너트/와셔 부품(WBT-/WNT-/WFW-)에 대응하는 개별 BOM 라인입니다. 부품명은 선택한 볼트&너트 사양(옵션 1~6)에 따라 자동으로 바뀝니다. 원본 캐시값과 정확히 일치 검증됨(총합 5270, 18개 부품, 시나리오: W=3.5/L=3+3/H=1.5mH/Internal/옵션2).",
      tables: [
      { label: "항목별 수량식 (Rows, 실제 부품명 표시)", fields: arrField(AR.boltsAndNuts.rows, boltRowLabelMap(AR.boltsAndNuts.rows, AR.boltsAndNuts.libraryNames)) },
    ] });
    cats.push({ id: "steelSkid", label: "스틸 스키드 (Steel Skid)",
      productNote: "원본 엑셀(Steel_Skid!AM8:AP53) 기준 75mm 앵글 / 125mm 채널 / 150mm 채널(중량형) 3종의 실제 부품 체계입니다. 아래 설정 화면의 'Steel Skid Type'에서 고른 종류에 따라 부품명이 자동으로 바뀝니다. 원본 캐시값과 정확히 일치 검증됨(총합 225, 9개 부품, 시나리오: W=3.5/L=3+3/H=1.5mH). 23~26번 행(높이 지지대/커넥터)은 75각 타입에는 해당 부품이 없습니다(원본 시트에도 공란).",
      tables: [
      { label: "항목별 수량식 (Rows, 종류별 실제 부품명 표시)", fields: arrField(AR.steelSkidDetailed.rows, skidRowLabelMap(AR.steelSkidDetailed.rows)) },
    ] });
    cats.push({ id: "misc", label: "용량 / 에어벤트 / 루프서포터 / 스틸스키드(길이계산, 참고용)", tables: [
      { label: "용량 (Capacity) — 부품 아님, 탱크 용량/표면적 계산식", fields: [
        { id: "capacity.nominalFormula", label: "공칭 용량 (Nominal Capacity)", get: function () { return AR.capacity.nominalFormula; }, set: function (v) { AR.capacity.nominalFormula = v; } },
        { id: "capacity.actualFormula", label: "실제 용량 (Actual Capacity)", get: function () { return AR.capacity.actualFormula; }, set: function (v) { AR.capacity.actualFormula = v; } },
        { id: "capacity.surfaceAreaFormula", label: "표면적 (Surface Area)", get: function () { return AR.capacity.surfaceAreaFormula; }, set: function (v) { AR.capacity.surfaceAreaFormula = v; } },
      ] },
      { label: "에어벤트 / 루프서포터 / 스틸스키드", fields: [
        { id: "airVent.perCompartmentFormula", label: "에어벤트 → WAV-0050A / WAV-0100A (용량별 자동 선택, Air Vent)", get: function () { return AR.airVent.perCompartmentFormula; }, set: function (v) { AR.airVent.perCompartmentFormula = v; } },
        { id: "roofSupporter.termFormula", label: "루프 서포터 → WRS-{높이}P (Roof Supporter)", get: function () { return AR.roofSupporter.termFormula; }, set: function (v) { AR.roofSupporter.termFormula = v; } },
        { id: "steelSkid.b42Formula", label: "스틸 스키드 참고 길이식 1/3 ('자동계산' 버튼 전용, 실제 BOM 부품 선택에는 더 이상 사용되지 않음 - 실제 부품은 위 '스틸 스키드' 카테고리 참고)", get: function () { return AR.steelSkid.b42Formula; }, set: function (v) { AR.steelSkid.b42Formula = v; } },
        { id: "steelSkid.b43Formula", label: "스틸 스키드 참고 길이식 2/3 ('자동계산' 버튼 전용, 실제 BOM 부품 선택에는 더 이상 사용되지 않음 - 실제 부품은 위 '스틸 스키드' 카테고리 참고)", get: function () { return AR.steelSkid.b43Formula; }, set: function (v) { AR.steelSkid.b43Formula = v; } },
        { id: "steelSkid.b44Formula", label: "스틸 스키드 참고 길이식 3/3 ('자동계산' 버튼 전용, 실제 BOM 부품 선택에는 더 이상 사용되지 않음 - 실제 부품은 위 '스틸 스키드' 카테고리 참고)", get: function () { return AR.steelSkid.b44Formula; }, set: function (v) { AR.steelSkid.b44Formula = v; } },
      ] },
    ] });
    cats.push({ id: "panel_common", label: "패널 - 공통 (Common)", tables: [
      { label: "공통 중간값 (최종 부품 아님)", fields: arrField(PR.COMMON_INTERMEDIATES) },
    ] });
    const courseDefs = [
      ["roofBottom", "패널 - 지붕/바닥 (Roof & Bottom)", PC.ROOF_BOTTOM_LABELS],
      ["side15Top", "패널 - 측벽 TOP_15", PC.SIDE_ROLE_LABELS],
      ["side20Top", "패널 - 측벽 TOP_20", PC.SIDE_ROLE_LABELS],
      ["midTop", "패널 - 측벽 MID_TOP", PC.SIDE_ROLE_LABELS],
      ["midLower", "패널 - 측벽 MID_LOWER", PC.SIDE_ROLE_LABELS],
      ["lower", "패널 - 측벽 LOWER", PC.SIDE_ROLE_LABELS],
      ["baseFiller", "패널 - 필러 (BASE_FILLER)", PC.SIDE_ROLE_LABELS],
    ];
    courseDefs.forEach(function (def) {
      const key = def[0], label = def[1], labelMap = def[2];
      const grp = PR.RULE_GROUPS[key];
      const tables = [];
      if (grp.intermediates && grp.intermediates.length) {
        tables.push({ label: "중간값 (최종 부품 아님)", fields: arrField(grp.intermediates) });
      }
      tables.push({ label: "수량 결과값 (실제 패널 제품명 표시)", fields: dictField(grp.outputs, labelMap) });
      cats.push({ id: "panel_" + key, label: label, tables: tables });
    });
    cats.push({ id: "panel_partition", label: "패널 - 격벽 템플릿 (Partition Templates)", tables: [
      { label: "TOP_15 (실제 격벽 제품명 표시)", fields: dictField(PR.PARTITION_TEMPLATES.top15, PC.PARTITION_ROLE_LABELS) },
      { label: "TOP_20 (실제 격벽 제품명 표시)", fields: dictField(PR.PARTITION_TEMPLATES.top20, PC.PARTITION_ROLE_LABELS) },
      { label: "기타 (LOWER / MID_LOWER / MID_TOP / LOWER_SOLO) (실제 격벽 제품명 표시)", fields: dictField(PR.PARTITION_TEMPLATES.other, PC.PARTITION_ROLE_LABELS) },
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

    if (cat.productNote) {
      const noteEl = document.createElement("div");
      noteEl.style.cssText = "background:#eef6ff;border:1px solid #bcdcff;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#1a4d80;line-height:1.5;";
      noteEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> ' + cat.productNote;
      container.appendChild(noteEl);
    }

    cat.tables.forEach(function (table, tIdx) {
      const fields = table.fields.filter(function (f) {
        if (!q) return true;
        const hay = (f.id + " " + (f.label || "")).toLowerCase();
        return hay.indexOf(q) !== -1;
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
        '<th style="padding:6px 8px;width:220px;">품명 / ID</th>' +
        '<th style="padding:6px 8px;">수식 (Formula)</th>' +
        '<th style="padding:6px 8px;width:60px;text-align:center;">초기화</th>' +
        "</tr></thead>";
      const tbody = document.createElement("tbody");

      fields.forEach(function (field) {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #f0f0f0";

        const tdId = document.createElement("td");
        tdId.style.cssText = "padding:6px 8px;vertical-align:top;";
        if (field.label) {
          const nameLine = document.createElement("div");
          nameLine.style.cssText = "font-weight:600;color:var(--text-primary,#222);margin-bottom:2px;";
          nameLine.textContent = field.label;
          const idLine = document.createElement("div");
          idLine.style.cssText = "font-family:monospace;font-size:11px;color:var(--text-secondary);";
          idLine.textContent = field.id;
          tdId.appendChild(nameLine);
          tdId.appendChild(idLine);
        } else {
          tdId.style.fontFamily = "monospace";
          tdId.style.color = "var(--text-secondary)";
          tdId.textContent = field.id;
        }

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

  // Public helper for other tabs (e.g. the visual tank-configuration tab) to
  // jump straight into a specific Rule Editor category, optionally
  // pre-filling the search box (e.g. a row ID) so the relevant field is the
  // only one shown. Switches the actual DOM tab too, if a "수식 설정" tab
  // button is present.
  function gotoCategory(catId, searchText) {
    const idx = categories.findIndex(function (c) { return c.id === catId; });
    if (idx === -1) return false;
    currentCatIndex = idx;
    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-rule-editor"]');
    if (tabBtn) tabBtn.click();
    const sel = document.getElementById("ruleEditorCategorySelect");
    if (sel) sel.value = String(idx);
    const search = document.getElementById("ruleEditorSearchInput");
    if (search) search.value = searchText || "";
    setStatus("");
    renderTables(search ? search.value : "");
    return true;
  }

  global.RuleEditorUI = { init: init, gotoCategory: gotoCategory };
})(typeof window !== "undefined" ? window : globalThis);
