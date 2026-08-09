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

  // ===========================================================================
  // Height-bracket formula helper ("높이별로 편집")
  // ---------------------------------------------------------------------------
  // Many formulas in this app are, underneath the raw ternary-chain syntax,
  // really just "different value per tank height (H_O)". This block detects
  // that pattern and lets the UI show/edit 9 small per-height boxes (one per
  // 1.0/1.5/.../5.0 m step) instead of one long line of ?: syntax, then
  // reconstructs an equivalent raw formula string on save.
  //
  // Safety: a formula is only offered in height-table mode if (a) every
  // condition in it depends *only* on H_O (any other variable in a condition
  // makes the split ambiguous, so we bail), and (b) the rebuilt formula is
  // verified to numerically match the original across a battery of sampled
  // values for every other variable, at all 9 canonical heights. If either
  // check fails, the field silently stays in normal raw-text mode.
  // ===========================================================================
  const HEIGHT_LIST = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  const HEIGHT_VAR = "H_O";

  function joinTok(tokens) { return (tokens || []).join(" "); }

  function isTruthyResult(v) { return v === true || (typeof v === "number" && v !== 0); }

  function stripOuterParens(tokens) {
    while (tokens.length >= 2 && tokens[0] === "(" && tokens[tokens.length - 1] === ")") {
      let depth = 0, wraps = true;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === "(") depth++;
        else if (tokens[i] === ")") {
          depth--;
          if (depth === 0 && i !== tokens.length - 1) { wraps = false; break; }
        }
      }
      if (!wraps) break;
      tokens = tokens.slice(1, -1);
    }
    return tokens;
  }

  function splitTopLevel(tokens, sep) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "(") depth++;
      else if (t === ")") depth--;
      else if (t === sep && depth === 0) {
        parts.push(tokens.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(tokens.slice(start));
    return parts;
  }

  function hasTopLevelBinaryMinus(tokens) {
    const boundary = ["+", "-", "*", "/", "%", "(", "?", ":", "&&", "||", "==", "!=", "<", "<=", ">", ">=", ","];
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "(") depth++;
      else if (t === ")") depth--;
      else if (t === "-" && depth === 0) {
        const prev = tokens[i - 1];
        const isUnary = i === 0 || boundary.indexOf(prev) !== -1;
        if (!isUnary) return true;
      }
    }
    return false;
  }

  function findTopLevelTernary(tokens) {
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "(") depth++;
      else if (tokens[i] === ")") depth--;
      else if (tokens[i] === "?" && depth === 0) return i;
    }
    return -1;
  }

  function findMatchingColon(tokens, fromIdx) {
    let depth = 0, ternaryDepth = 0;
    for (let i = fromIdx; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "(") depth++;
      else if (t === ")") depth--;
      else if (depth === 0 && t === "?") ternaryDepth++;
      else if (depth === 0 && t === ":") {
        if (ternaryDepth === 0) return i;
        ternaryDepth--;
      }
    }
    return -1;
  }

  // Parses "COND ? VALUE : REST" chains (REST may itself be another such chain).
  function parseTernaryOnly(tokensIn) {
    const tokens = stripOuterParens(tokensIn);
    const qIdx = findTopLevelTernary(tokens);
    if (qIdx === -1) return null;
    const condTokens = tokens.slice(0, qIdx);
    const colonIdx = findMatchingColon(tokens, qIdx + 1);
    if (colonIdx === -1) return null;
    const valueTokens = tokens.slice(qIdx + 1, colonIdx);
    const restTokens = tokens.slice(colonIdx + 1);
    const branch = { cond: condTokens, value: valueTokens };
    const restStripped = stripOuterParens(restTokens);
    if (findTopLevelTernary(restStripped) === -1) {
      return { branches: [branch], elseTokens: restTokens };
    }
    const restChain = parseTernaryOnly(restTokens);
    if (!restChain) return null;
    return { branches: [branch].concat(restChain.branches), elseTokens: restChain.elseTokens };
  }

  // Parses an arbitrary "+"-combination of ternary-chains / plain expressions
  // into a small tree: { sum: [...] } | { branches, elseTokens } | { plain }.
  function parseAdditiveHeightNode(tokensIn) {
    const tokens = stripOuterParens(tokensIn);
    if (hasTopLevelBinaryMinus(tokens)) return null;
    const subterms = splitTopLevel(tokens, "+");
    if (subterms.length > 1) {
      const nodes = [];
      for (let i = 0; i < subterms.length; i++) {
        const n = parseAdditiveHeightNode(subterms[i]);
        if (!n) return null;
        nodes.push(n);
      }
      return { sum: nodes };
    }
    const chain = parseTernaryOnly(tokens);
    if (chain) return chain;
    return { plain: tokens };
  }

  // Resolves the tree to the formula text that applies at one specific height.
  // Throws if a condition references a variable other than H_O.
  function resolveAtHeight(node, h) {
    if (node.sum) {
      const pieces = [];
      node.sum.forEach(function (n) {
        const s = resolveAtHeight(n, h);
        if (s !== "0" && s !== "") pieces.push(s);
      });
      return pieces.length ? pieces.join(" + ") : "0";
    }
    if (node.plain) {
      return joinTok(node.plain).trim() || "0";
    }
    for (let i = 0; i < node.branches.length; i++) {
      const br = node.branches[i];
      const v = global.RuleEngine.evaluate(joinTok(br.cond), { H_O: h });
      if (isTruthyResult(v)) return joinTok(br.value).trim() || "0";
    }
    return joinTok(node.elseTokens).trim() || "0";
  }

  function collectOtherVars(formulaStr) {
    const reserved = { true: 1, false: 1, max: 1, min: 1, abs: 1, round: 1, ceil: 1, floor: 1, trunc: 1 };
    const tokens = global.RuleEngine.tokenize(formulaStr);
    const seen = {};
    const vars = [];
    tokens.forEach(function (t) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t) && t !== HEIGHT_VAR && !reserved[t] && !seen[t]) {
        seen[t] = true;
        vars.push(t);
      }
    });
    return vars;
  }

  // Numerically verifies that heightTexts[h], evaluated per-height, matches
  // the original formula for every canonical height, across sampled values
  // of every other variable (baseline all-1, all-0, and one distinct bump
  // per variable). Returns false (=> don't trust the split) on ANY mismatch
  // or evaluation error.
  function verifyReconstruction(formulaStr, heightTexts) {
    const vars = collectOtherVars(formulaStr);
    const scopes = [];
    const base1 = {}; vars.forEach(function (v) { base1[v] = 1; }); scopes.push(base1);
    const base0 = {}; vars.forEach(function (v) { base0[v] = 0; }); scopes.push(base0);
    vars.forEach(function (target) {
      const s = {};
      vars.forEach(function (v) { s[v] = (v === target) ? 4.3 : 1.1; });
      scopes.push(s);
    });
    for (let hi = 0; hi < HEIGHT_LIST.length; hi++) {
      const h = HEIGHT_LIST[hi];
      const rebuilt = heightTexts[h];
      for (let si = 0; si < scopes.length; si++) {
        const scope = Object.assign({ H_O: h }, scopes[si]);
        let a, b;
        try {
          a = Number(global.RuleEngine.evaluate(formulaStr, scope));
          b = Number(global.RuleEngine.evaluate(rebuilt, scope));
        } catch (e) {
          return false;
        }
        if (Number.isNaN(a) || Number.isNaN(b) || Math.abs(a - b) > 1e-9) return false;
      }
    }
    return true;
  }

  // Main entry point: returns { "1": "...", "1.5": "...", ... } keyed by
  // HEIGHT_LIST values, or null if this formula can't be safely split.
  function tryBuildHeightTable(formulaStr) {
    if (!formulaStr || !global.RuleEngine || new RegExp("\\b" + HEIGHT_VAR + "\\b").test(formulaStr) === false) return null;
    try {
      const tokens = global.RuleEngine.tokenize(formulaStr);
      const root = parseAdditiveHeightNode(tokens);
      if (!root) return null;
      const texts = {};
      for (let i = 0; i < HEIGHT_LIST.length; i++) {
        const h = HEIGHT_LIST[i];
        texts[h] = resolveAtHeight(root, h);
      }
      if (!verifyReconstruction(formulaStr, texts)) return null;
      return texts;
    } catch (e) {
      return null;
    }
  }

  // Reverse direction: turns an edited { height: text } map back into one
  // raw formula string, grouping consecutive heights that share the exact
  // same text into a single "(H_O==a||H_O==b) ? (...) : " branch.
  function reconstructFormula(heightTexts) {
    const groups = [];
    HEIGHT_LIST.forEach(function (h, idx) {
      const raw = heightTexts[h] != null ? String(heightTexts[h]) : "0";
      const text = raw.trim() || "0";
      if (text === "0") return;
      const last = groups[groups.length - 1];
      if (last && last.text === text && last.lastIdx === idx - 1) {
        last.heights.push(h);
        last.lastIdx = idx;
      } else {
        groups.push({ text: text, heights: [h], lastIdx: idx });
      }
    });
    if (!groups.length) return "0";
    let expr = "0";
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      const cond = g.heights.length === 1
        ? (HEIGHT_VAR + "==" + g.heights[0])
        : "(" + g.heights.map(function (h) { return HEIGHT_VAR + "==" + h; }).join("||") + ")";
      expr = cond + " ? (" + g.text + ") : " + expr;
    }
    return expr;
  }

  const defaultLocationMap = {
    "layer": "수조 내부/외부 적층 단수",
    "totalLenCourses": "수조 길이 방향 코스 전체",
    "M8": "폭(W) 방향 타이로드 배치 라인",
    "Q8": "길이(L1) 방향 타이로드 배치 라인",
    "rodsW": "폭(W) 방향 타이로드 전체 로드",
    "row35": "타이로드 앵커 브라켓 접합부",
    "total": "외부 타이로드 조립 완제품 세트",
    "AP5": "저판 - 저판 접합 플랜지",
    "AP6": "저판 - 측판 1단 접합 플랜지",
    "AP7": "측판 - 측판 세로 플랜지",
    "AP12": "저판 코너 교차부",
    "AP18": "측판 단수별 높이 방향 접합부"
  };

  const defaultRemarksMap = {
    "layer": "layerFactor(H_0) 높이별 산출식",
    "totalLenCourses": "L1_C+L2_C+L3_C+L4_C 코스 수 합계",
    "M8": "(totalLenCourses-1) * layer",
    "Q8": "layer * (W_C + W_F - 1)",
    "rodsW": "segW * M8 (W_0 치수 분할 로드)",
    "row35": "앵커 브라켓 수량 합계 수식",
    "total": "WTR-12M300Z 완제품 세트 수량",
    "AP5": "원본 BoltnNuts!AP5 시트 수식",
    "AP6": "원본 BoltnNuts!AP6 시트 수식",
    "AP7": "원본 BoltnNuts!AP7 시트 수식",
    "AP12": "원본 BoltnNuts!AP12 시트 수식",
    "AP18": "원본 BoltnNuts!AP18 높이별 수식"
  };

  function attachFieldMetadata(f, id) {
    f.getLocation = function () {
      if (f._location !== undefined) return f._location;
      return defaultLocationMap[id] || "";
    };
    f.setLocation = function (v) {
      f._location = v;
    };
    f.getRemarks = function () {
      if (f._remarks !== undefined) return f._remarks;
      return defaultRemarksMap[id] || "";
    };
    f.setRemarks = function (v) {
      f._remarks = v;
    };
    return f;
  }

  function arrField(arr, labelMap, partNumbersObj) {
    return (arr || []).map(function (item) {
      const id = item.name || item.id;
      const f = {
        id: id,
        label: (labelMap && labelMap[id]) || null,
        get: function () { return item.formula; },
        set: function (v) { item.formula = v; },
        isCustom: !!item.isCustom,
        item: item
      };

      if (item.parts && typeof item.parts === "object") {
        f.getPartOptions = function () {
          const activeTypes = getActiveSkidTypes();
          return activeTypes.map(function (st) {
            return {
              key: st.key,
              label: st.label,
              val: (item.parts && item.parts[st.key]) || ""
            };
          });
        };
        f.getPartNoOption = function (optKey) {
          return (item.parts && item.parts[optKey]) || "";
        };
        f.setPartNoOption = function (optKey, val) {
          if (!item.parts) item.parts = {};
          item.parts[optKey] = val;
          if (typeof describeSkidRow === "function") {
            f.label = describeSkidRow(item);
          }
        };
      } else if (partNumbersObj && (partNumbersObj[id] !== undefined || typeof partNumbersObj === "object")) {
        const spec = partNumbersObj[id];
        if (spec && spec.byHeight && Array.isArray(spec.byHeight)) {
          f.getPartOptions = function () {
            return spec.byHeight.map(function (r, idx) {
              const lbl = r.maxH !== undefined ? "높이 H ≤ " + r.maxH + "m" : "높이 H > 2.5m (그 외)";
              return { key: "byHeight_" + idx, label: lbl, val: r.part || "" };
            });
          };
          f.getPartNoOption = function (optKey) {
            const idx = parseInt(optKey.replace("byHeight_", ""), 10);
            return (spec.byHeight[idx] && spec.byHeight[idx].part) || "";
          };
          f.setPartNoOption = function (optKey, val) {
            const idx = parseInt(optKey.replace("byHeight_", ""), 10);
            if (spec.byHeight[idx]) spec.byHeight[idx].part = val;
            if (typeof describePartSpec === "function") {
              f.label = describePartSpec(spec);
            }
          };
        } else if (typeof spec === "string") {
          f.getPartNo = function () { return spec; };
          f.setPartNo = function (v) { partNumbersObj[id] = v; };
        } else {
          f.getPartNo = function () {
            if (typeof spec === "string") return spec;
            if (spec && spec.materialPrefix) return spec.materialPrefix;
            if (spec && spec.byHeight && spec.byHeight[0]) return spec.byHeight[0].part;
            return "";
          };
          f.setPartNo = function (v) {
            if (typeof spec === "string" || spec === undefined) {
              partNumbersObj[id] = v;
            } else if (spec && spec.materialPrefix) {
              spec.materialPrefix = v;
            } else if (spec && spec.byHeight) {
              spec.byHeight.forEach(function (r) { r.part = v; });
            } else {
              partNumbersObj[id] = v;
            }
          };
        }
      }

      if (typeof f.getPartNo !== "function" && typeof f.getPartOptions !== "function") {
        f.getPartNo = function () {
          return item.partNo || item.part || "";
        };
        f.setPartNo = function (v) {
          item.partNo = v;
          item.part = v;
        };
      }
      return attachFieldMetadata(f, id);
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

  function getActiveSkidTypes() {
    const disabledMap = (overrides && overrides["steelSkid::disabledTabs"]) || {};
    const tabOrder = (overrides && overrides["steelSkid::tabOrder"]) || [];

    // The three standard columns belong to the "std" table, so they carry
    // parentKey "std" for the same reason a custom tab's sub-specs carry theirs:
    // without it they miss the tabOrder lookup below, sort to 999, and land
    // after every custom tab no matter where "std" itself sits in the order.
    const defaults = [
      { key: "angle75", parentKey: "std", label: (overrides && overrides["steelSkid::tabLabel::angle75"]) || "75 Angle (75각)" },
      { key: "channel125", parentKey: "std", label: (overrides && overrides["steelSkid::tabLabel::channel125"]) || "125 Channel (125채널)" },
      { key: "channel150", parentKey: "std", label: (overrides && overrides["steelSkid::tabLabel::channel150"]) || "150 Channel (150채널)" },
      { key: "ibeam", label: (overrides && overrides["steelSkid::tabLabel::ibeam"]) || "I-Beam (I빔)" },
      { key: "sqp", label: (overrides && overrides["steelSkid::tabLabel::sqp"]) || "SQP (사각파이프)" }
    ];

    const customSpecTables = (overrides && overrides["steelSkid::customSpecTables"]) || [];
    if (Array.isArray(customSpecTables)) {
      customSpecTables.forEach(function(cs) {
        if (!cs || !cs.key) return;
        const subSpecs = (overrides && overrides["steelSkid::subSpecs::" + cs.key]) || cs.subSpecs;
        if (cs.isMultiSpec && Array.isArray(subSpecs) && subSpecs.length > 0) {
          subSpecs.forEach(function(subKey) {
            const subLabel = (overrides && overrides["steelSkid::tabLabel::" + subKey]) || subKey;
            if (!defaults.some(function(d) { return d.key === subKey; })) {
              defaults.push({ key: subKey, label: subLabel, parentKey: cs.key });
            }
          });
        } else {
          const tabLabel = (overrides && overrides["steelSkid::tabLabel::" + cs.key]) || cs.label || cs.key;
          if (!defaults.some(function(d) { return d.key === cs.key; })) {
            defaults.push({ key: cs.key, label: tabLabel, parentKey: cs.key });
          }
        }
      });
    }

    const filtered = defaults.filter(function(st) {
      if (disabledMap[st.key]) return false;
      if (st.parentKey && disabledMap[st.parentKey]) return false;
      return true;
    });

    if (Array.isArray(tabOrder) && tabOrder.length > 0) {
      filtered.sort(function(a, b) {
        let idxA = tabOrder.indexOf(a.key);
        let idxB = tabOrder.indexOf(b.key);
        if (idxA === -1 && a.parentKey) idxA = tabOrder.indexOf(a.parentKey);
        if (idxB === -1 && b.parentKey) idxB = tabOrder.indexOf(b.parentKey);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });
    }

    return filtered;
  }

  function describeSkidRow(row) {
    var activeTypes = getActiveSkidTypes();
    var parts = activeTypes.map(function (st) {
      const partVal = row.parts ? row.parts[st.key] : null;
      return partVal ? (st.label + ":" + partVal) : (st.label + ":(해당없음)");
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

  function singleRowLabelMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      map[row.id] = (row.label || row.name || row.id) + (row.partNo ? " [" + row.partNo + "]" : "");
    });
    return map;
  }

  function dictField(dict, labelMap) {
    return Object.keys(dict || {}).map(function (k) {
      const f = {
        id: k,
        label: (labelMap && labelMap[k]) || null,
        get: function () { return dict[k]; },
        set: function (v) { dict[k] = v; },
        isCustom: false // dictate that outputs are not deletable
      };
      return attachFieldMetadata(f, k);
    });
  }

  function applyCustomAndDeletedRows(catId, sourceArray) {
    if (!Array.isArray(sourceArray)) return sourceArray;
    const store = (typeof RuleEditorUI !== "undefined" && typeof RuleEditorUI.getOverrides === "function")
      ? RuleEditorUI.getOverrides()
      : (typeof overrides !== "undefined" ? overrides : {});
    
    // 1. Filter out deleted row IDs
    const deletedKey = catId + "::deletedRows";
    const deleted = store[deletedKey] || [];
    let result = sourceArray;
    if (Array.isArray(deleted) && deleted.length > 0) {
      result = result.filter(function(item) {
        const id = item.name || item.id;
        return deleted.indexOf(id) === -1;
      });
    }

    // 2. Append custom added rows
    const customKey = catId + "::customRows";
    const customs = store[customKey] || [];
    if (Array.isArray(customs)) {
      result = [...result];
      customs.forEach(function(cItem) {
        const cId = cItem.name || cItem.id;
        if (!result.some(function(existing) { return (existing.name || existing.id) === cId; })) {
          result.push(cItem);
        }
      });
    }

    return result;
  }

  function buildCategories() {
    const AR = global.AccessoriesRules;
    const PR = global.PanelRules;
    const PC = global.PanelCatalog;
    if (!AR || !PR || !PC) return [];
    const cats = [];

    cats.push({ id: "reinf_ext", label: "보강재 - External (Reinforcing External)", hidden: true,
      productNote: "각 row는 원본 엑셀(EXT_REINF!M8:M93) 기준 서로 다른 실제 부품(WFB-/WCA-/WFR-/WBR-/WCP-/WCB- 등)에 대응하는 개별 BOM 라인입니다. SA2/SA4로 표시된 항목은 볼트&너트 사양(Bolts & Nuts Specification) 선택에 따라 부품번호가 자동으로 바뀝니다.",
      tables: [
      { label: "중간값 (Intermediates, 최종 부품 아님)", fields: arrField(applyCustomAndDeletedRows("reinf_ext_int", AR.reinforcing.external.intermediates)), allowAdd: true, sourceArray: AR.reinforcing.external.intermediates },
      { label: "항목별 수량식 (Rows, 실제 부품명 표시)", fields: arrField(applyCustomAndDeletedRows("reinf_ext", AR.reinforcing.external.rows), partLabelMap(AR.reinforcing.external.partNumbers), AR.reinforcing.external.partNumbers), allowAdd: true, sourceArray: AR.reinforcing.external.rows, partNumbersObj: AR.reinforcing.external.partNumbers },
    ] });
    cats.push({ id: "reinf_int", label: "보강재 - Internal (Reinforcing Internal)", hidden: true,
      productNote: "각 row는 원본 엑셀(INT_REINF_INT!L8:L55) 기준 서로 다른 실제 부품(WFB-/WCA-/WCP-/WBR- 등)에 대응하는 개별 BOM 라인입니다. SA2/SA4로 표시된 항목은 볼트&너트 사양(Bolts & Nuts Specification) 선택에 따라 부품번호가 자동으로 바뀝니다.",
      tables: [
      { label: "중간값 (Intermediates, 최종 부품 아님)", fields: arrField(applyCustomAndDeletedRows("reinf_int_int", AR.reinforcing.internal.intermediates)), allowAdd: true, sourceArray: AR.reinforcing.internal.intermediates },
      { label: "항목별 수량식 (Rows, 실제 부품명 표시)", fields: arrField(applyCustomAndDeletedRows("reinf_int", AR.reinforcing.internal.rows), partLabelMap(AR.reinforcing.internal.partNumbers), AR.reinforcing.internal.partNumbers), allowAdd: true, sourceArray: AR.reinforcing.internal.rows, partNumbersObj: AR.reinforcing.internal.partNumbers },
    ] });
    const tieRodLabelMap = {
      "layer": "높이별 타이로드 적층 단수 (수식 함수: layerFactor(H_0) → H_0=탱크높이m, 1mH이하:0단 / 2mH이하:1단 / 2.5mH이상:2단)",
      "totalLenCourses": "수조 길이(L1~L4) 방향 전체 코스(열) 수 합계",
      "M8": "폭(W) 방향 타이로드 가로 배치 라인 수 × 단수 = (totalLenCourses-1) * layer",
      "Q8": "길이(L1) 방향 타이로드 세로 배치 라인 수 × 단수 = layer * (W_C + W_F - 1)",
      "U8": "길이(L2) 방향 타이로드 세로 배치 라인 수 × 단수 (L2 수조 분할이 있을 때만 계산)",
      "Y8": "길이(L3) 방향 타이로드 세로 배치 라인 수 × 단수 (L3 수조 분할이 있을 때만 계산)",
      "AC8": "길이(L4) 방향 타이로드 세로 배치 라인 수 × 단수 (L4 수조 분할이 있을 때만 계산)",
      "segW": "폭(W) 방향 1개 라인 당 분할 로드 개수 (수식 함수: segCount(W_0) → W_0=탱크폭m, 2m/3m/잔여 로드 분할 개수)",
      "segL1": "길이(L1) 방향 1개 라인 당 분할 로드 개수 (수식 함수: segCount(L1_0))",
      "segL2": "길이(L2) 방향 1개 라인 당 분할 로드 개수 (수식 함수: segCount(L2_0))",
      "segL3": "길이(L3) 방향 1개 라인 당 분할 로드 개수 (수식 함수: segCount(L3_0))",
      "segL4": "길이(L4) 방향 1개 라인 당 분할 로드 개수 (수식 함수: segCount(L4_0))",
      "rodsW": "폭(W) 방향 타이로드 로드(Rod) 필요 수량 소계 = segW * M8",
      "rodsL1": "길이(L1) 방향 타이로드 로드(Rod) 필요 수량 소계 = segL1 * Q8",
      "rodsL2": "길이(L2) 방향 타이로드 로드(Rod) 필요 수량 소계 = segL2 * U8",
      "rodsL3": "길이(L3) 방향 타이로드 로드(Rod) 필요 수량 소계 = segL3 * Y8",
      "rodsL4": "길이(L4) 방향 타이로드 로드(Rod) 필요 수량 소계 = segL4 * AC8",
      "row35": "부속품 1. 앵커 브라켓 (Tie-Rod Anchor Bracket) 수량",
      "row36": "부속품 2. 앵커 육각 볼트 & 와셔 (Anchor Bolt & Washer) 수량",
      "row37": "부속품 3. 일자 연결 커플러 (Straight Rod Coupler) 수량",
      "row38": "부속품 4. 십자/T자 연결 커플러 (Cross Rod Coupler) 수량",
      "total": "WTR-12M300Z · External Tie-Rod Assembly (HDG) (로드+너트+와셔+커플러+앵커 완제품 세트 총 수량)"
    };

    const layerFactorFields = (AR.tieRod.layerFactorTable || []).map(function (item) {
      const fieldId = item.maxH !== undefined ? "layerFactor_maxH_" + item.maxH : "layerFactor_fallback";
      const fieldLabel = item.maxH !== undefined 
        ? "탱크 높이 H_0 ≤ " + item.maxH + "m 일 때 타이로드 적층 단수 (Layer Factor)"
        : "그 외 탱크 높이 (기본/Fallback) 일 때 타이로드 적층 단수 (Layer Factor)";
      return {
        id: fieldId,
        label: fieldLabel,
        get: function () { return String(item.factor); },
        set: function (v) {
          const num = parseFloat(v);
          item.factor = isNaN(num) ? 0 : num;
        }
      };
    });

    cats.push({ id: "tierod", label: "타이로드 (Tie-Rod)", hidden: true,
      productNote: "<strong>[외부 타이로드(Tie-Rod) 수식 구조 및 layerFactor(H_0) 함수 상세 안내]</strong><br>" +
        "• <strong>변수 H_0</strong>: BASIC_TOOL에서 입력한 <strong>탱크 높이(Height, m 단위)</strong>를 의미합니다. (예: 1.5mH, 2.0mH, 3.0mH, 4.5mH)<br>" +
        "• <strong>함수 layerFactor(H_0)</strong>: 탱크 높이(H_0)를 입력받아 내부 타이로드 가로 적층 단수(층수)를 자동 산출하는 전용 수식 함수입니다.<br>" +
        "  &nbsp;&nbsp;아래 <strong>'높이(H_0)별 타이로드 적층 단수 설정 (layerFactorTable)'</strong> 테이블에서 각 높이 구간별 적층 단수를 자유롭게 직접 수정하실 수 있습니다.<br>" +
        "• <strong>함수 segCount(치수)</strong>: 탱크 폭(W_0) 또는 길이(L1_0~L4_0)를 입력받아 2m/3m/잔여 로드로 나누었을 때의 분할 로드 개수를 반환합니다.<br>" +
        "• <strong>부속품 및 완제품 세트</strong>: 타이로드 앵커 브라켓, 앵커 볼트, 일자/십자 커플러 수량을 합산하여 최종 <strong>WTR-12M300Z 완제품 세트 수량</strong>이 결정됩니다.",
      tables: [
      { label: "높이(H_0)별 타이로드 적층 단수 설정 (layerFactorTable — 직접 수정 가능)", fields: layerFactorFields },
      { label: "중간값 (Intermediates — 타이로드 로드 및 부속품 수량 계산식)", fields: arrField(applyCustomAndDeletedRows("tierod_int", AR.tieRod.intermediates), tieRodLabelMap), allowAdd: true, sourceArray: AR.tieRod.intermediates },
      { label: "최종 BOM 완제품 수량식 (WTR-12M300Z 세트)", fields: arrField(applyCustomAndDeletedRows("tierod", AR.tieRod.rows), tieRodLabelMap), allowAdd: true, sourceArray: AR.tieRod.rows },
    ] });
    if (AR.tieRodInternal) {
      const tieRodIntLabelMap = {};
      (AR.tieRodInternal.catalogLengthsMm || []).forEach(function (len) {
        tieRodIntLabelMap["len" + len] = "로드 " + len + "mm (TR-12M" + String(len).padStart(4, "0") + "SA4/SA2) 필요 개수";
      });
      tieRodIntLabelMap.nut = "M12 육각너트 (M12 NUT) 필요 개수";
      tieRodIntLabelMap.bw = "M12 평와셔 (M12 BW) 필요 개수";
      tieRodIntLabelMap.coupler = "로드 연결 커플러 (TC-12M60) 필요 개수";
      cats.push({ id: "tierodInt", label: "타이로드 - Internal (Tie-Rod Internal)", hidden: true,
        productNote: "원본 엑셀 INT_TIE_ROD 시트 기반 (Internal 보강 방식 전용, External의 WTR-12M300Z 롤업 방식과 달리 실제 로드 길이별 개별 부품으로 산출됩니다). 참고 시나리오(W=3.5/L1=3+L2=3/H=1.5mH)에서 원본 캐시값과 정확히 일치 검증됨: TR-12M2880 x6, TR-12M3380 x4, M12 NUT/BW x40.",
        tables: [
        { label: "로드 길이별 / 너트·와셔·커플러 수량식", fields: arrField(applyCustomAndDeletedRows("tierodInt", AR.tieRodInternal.rows), tieRodIntLabelMap) },
      ] });
    }

    // hidden: true -- this category is intentionally NOT shown in this tab's
    // category dropdown/UI (see renderCategorySelect/gotoCategory below). Bolt
    // formula editing now lives ONLY on the "Bolt Logic & Audit" (Calculation
    // Audit Sheet) tab, to avoid the same AP<n> formulas being editable from
    // two different screens. The category itself (and its fields) is kept
    // here because bolt_logic_audit.js's inline formula editor drives its
    // edits through RuleEditorUI.getFieldInfo/setFieldFormula/resetFieldFormula,
    // which look up fields via this SAME categories array (catId "bolts",
    // table index 0) -- removing the category entirely would break that.
    cats.push({ id: "bolts", label: "볼트 & 너트 (Bolts & Nuts)", hidden: true,
      productNote: "원본 엑셀(BoltnNuts!AN5:AZ75) 기준 약 50개 조립 위치 각각이 서로 다른 실제 볼트/너트/와셔 부품(WBT-/WNT-/WFW-)에 대응하는 개별 BOM 라인입니다. 부품명은 선택한 볼트&너트 사양(옵션 1~6)에 따라 자동으로 바뀝니다. 원본 캐시값과 정확히 일치 검증됨(총합 5270, 18개 부품, 시나리오: W=3.5/L=3+3/H=1.5mH/Internal/옵션2).",
      tables: [
      { label: "항목별 수량식 (Rows, 실제 부품명 표시)", fields: arrField(applyCustomAndDeletedRows("bolts", AR.boltsAndNuts.rows), boltRowLabelMap(AR.boltsAndNuts.rows, AR.boltsAndNuts.libraryNames)), allowAdd: true, sourceArray: AR.boltsAndNuts.rows },
    ] });
    function getARSpecRows(key) {
      return (AR && AR.steelSkidDetailed && typeof AR.steelSkidDetailed.getSpecRows === "function")
        ? AR.steelSkidDetailed.getSpecRows(key)
        : [];
    }

    const stdLabel = (overrides && overrides["steelSkid::tabLabel::std"]) || "75각 / 125채널 / 150채널";
    const skidTables = [
      { specKey: "std", label: stdLabel, isMultiSpec: true, fields: arrField(applyCustomAndDeletedRows("steelSkid_std", AR.steelSkidDetailed.rows), skidRowLabelMap(AR.steelSkidDetailed.rows)), allowAdd: true, sourceArray: AR.steelSkidDetailed.rows },
      { specKey: "ibeam", label: (overrides && overrides["steelSkid::tabLabel::ibeam"]) || "I-Beam (I빔)", isMultiSpec: false, fields: arrField(applyCustomAndDeletedRows("steelSkid_ibeam", AR.steelSkidDetailed.ibeamRows), singleRowLabelMap(AR.steelSkidDetailed.ibeamRows)), allowAdd: true, sourceArray: AR.steelSkidDetailed.ibeamRows },
      { specKey: "sqp", label: (overrides && overrides["steelSkid::tabLabel::sqp"]) || "SQP (사각파이프)", isMultiSpec: false, fields: arrField(applyCustomAndDeletedRows("steelSkid_sqp", AR.steelSkidDetailed.sqpRows), singleRowLabelMap(AR.steelSkidDetailed.sqpRows)), allowAdd: true, sourceArray: AR.steelSkidDetailed.sqpRows }
    ];

    const customSkidSpecs = (overrides && overrides["steelSkid::customSpecTables"]) || [];
    if (Array.isArray(customSkidSpecs)) {
      customSkidSpecs.forEach(function(cs) {
        if (AR && AR.steelSkidDetailed) {
          const savedCustomRows = overrides["steelSkid_" + cs.key + "::customRows"];
          if (Array.isArray(savedCustomRows) && savedCustomRows.length > 0) {
            AR.steelSkidDetailed[cs.key + "Rows"] = savedCustomRows;
          } else if (!AR.steelSkidDetailed[cs.key + "Rows"]) {
            AR.steelSkidDetailed[cs.key + "Rows"] = [];
          }
        }
        const isMulti = cs.isMultiSpec !== undefined ? cs.isMultiSpec : (cs.key === "std" || cs.key.startsWith("std_copy_"));
        const subSpecs = (overrides && overrides["steelSkid::subSpecs::" + cs.key]) || cs.subSpecs || (isMulti ? [cs.key + "_s1", cs.key + "_s2", cs.key + "_s3"] : null);
        const rowsToUse = (AR && AR.steelSkidDetailed) ? AR.steelSkidDetailed[cs.key + "Rows"] : [];

        skidTables.push({
          specKey: cs.key,
          label: (overrides && overrides["steelSkid::tabLabel::" + cs.key]) || cs.label,
          isMultiSpec: isMulti,
          subSpecs: subSpecs,
          fields: arrField(applyCustomAndDeletedRows("steelSkid_" + cs.key, rowsToUse), isMulti ? skidRowLabelMap(rowsToUse) : singleRowLabelMap(rowsToUse)),
          allowAdd: true,
          sourceArray: rowsToUse
        });
      });
    }

    const tabOrder = (overrides && overrides["steelSkid::tabOrder"]) || [];
    if (Array.isArray(tabOrder) && tabOrder.length > 0) {
      skidTables.sort(function(a, b) {
        let idxA = tabOrder.indexOf(a.specKey);
        let idxB = tabOrder.indexOf(b.specKey);
        if (idxA === -1 && a.subSpecs) {
          for (let i = 0; i < a.subSpecs.length; i++) {
            const pos = tabOrder.indexOf(a.subSpecs[i]);
            if (pos !== -1) { idxA = pos; break; }
          }
        }
        if (idxB === -1 && b.subSpecs) {
          for (let i = 0; i < b.subSpecs.length; i++) {
            const pos = tabOrder.indexOf(b.subSpecs[i]);
            if (pos !== -1) { idxB = pos; break; }
          }
        }
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });
    }

    cats.push({ id: "steelSkid", label: "스틸 스키드 (Steel Skid)",
      productNote: "스틸 스키드 규격별(75각/125채널/150채널, I-Beam, SQ 사각파이프 등) 독립된 품명/부품코드/계산수식 전용 탭입니다. 상단 규격 탭을 전환하여 각 스키드 규격에 맞는 품명과 계산수식을 자유롭게 등록하고 관리할 수 있습니다.",
      tables: skidTables
    });
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
    return cats;
  }

  function snapshotDefaults() {
    const snap = {};
    categories.forEach(function (cat) {
      cat.tables.forEach(function (table, tIdx) {
        table.fields.forEach(function (field) {
          const key = fieldKey(cat.id, tIdx, field.id);
          snap[key] = field.get();
          if (typeof field.getPartOptions === "function") {
            field.getPartOptions().forEach(function (opt) {
              snap[key + ":partNo:" + opt.key] = opt.val;
            });
          }
          if (typeof field.getPartNo === "function") {
            snap[key + ":partNo"] = field.getPartNo();
          }
          if (typeof field.getLocation === "function") {
            snap[key + ":loc"] = field.getLocation();
          }
          if (typeof field.getRemarks === "function") {
            snap[key + ":rem"] = field.getRemarks();
          }
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
          const labelKey = key + ":label";
          if (Object.prototype.hasOwnProperty.call(overridesObj, labelKey)) {
            field.label = overridesObj[labelKey];
            if (field.item) field.item.label = overridesObj[labelKey];
          }
          if (Object.prototype.hasOwnProperty.call(overridesObj, key)) {
            field.set(overridesObj[key]);
          }
          if (typeof field.getPartOptions === "function" && typeof field.setPartNoOption === "function") {
            field.getPartOptions().forEach(function (opt) {
              const optKey = key + ":partNo:" + opt.key;
              if (Object.prototype.hasOwnProperty.call(overridesObj, optKey)) {
                field.setPartNoOption(opt.key, overridesObj[optKey]);
                if (field.item && field.item.parts) {
                  field.item.parts[opt.key] = overridesObj[optKey];
                }
              }
            });
          }
          const partKey = key + ":partNo";
          if (typeof field.setPartNo === "function" && Object.prototype.hasOwnProperty.call(overridesObj, partKey)) {
            // Rows carrying a per-spec `parts` map are driven by the
            // ":partNo:<spec>" keys handled just above; this spec-agnostic key
            // holds a single number and would pin all their columns to it.
            // Single-spec rows (I-Beam / SQP / renamed custom tabs) have no
            // parts map, and this key is the ONLY place their edit is stored --
            // gating on `item.partNo` skipped exactly those rows, so every part
            // code edited there reverted to the shipped default on re-render.
            const hasPerSpecParts = !!(field.item && field.item.parts && typeof field.item.parts === "object");
            if (!hasPerSpecParts) {
              field.setPartNo(overridesObj[partKey]);
              if (field.item) field.item.partNo = overridesObj[partKey];
            }
          }
          const locKey = key + ":loc";
          if (typeof field.setLocation === "function" && Object.prototype.hasOwnProperty.call(overridesObj, locKey)) {
            field.setLocation(overridesObj[locKey]);
          }
          const remKey = key + ":rem";
          if (typeof field.setRemarks === "function" && Object.prototype.hasOwnProperty.call(overridesObj, remKey)) {
            field.setRemarks(overridesObj[remKey]);
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

  function flashInputSaved(inputEl, labelStr) {
    if (!inputEl) return;
    inputEl.style.background = "#f0fdf4";
    inputEl.style.borderColor = "#16a34a";
    inputEl.style.boxShadow = "0 0 0 2px rgba(22, 163, 74, 0.2)";
    
    if (typeof setStatus === "function") {
      setStatus("⚡ [" + labelStr + "] 수정 사항이 바로 자동 저장되었습니다. (Firebase DB 실시간 동기화 완료)", false);
    }
    
    setTimeout(function() {
      inputEl.style.background = "#ffffff";
      inputEl.style.borderColor = "#cbd5e1";
      inputEl.style.boxShadow = "none";
    }, 1200);
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
        categories = buildCategories();
        applyOverridesObject(overrides);
        saveLocalOverrides(overrides);
        updateSteelSkidSelectDropdown();
      }
    }).catch(function (err) {
      console.warn("[RuleEditor] Firestore 수식 오버라이드 불러오기 실패, localStorage만 사용:", err);
    });
  }

  // ---- Run immediately at script-parse time (see file header) ----
  overrides = loadLocalOverrides();
  categories = buildCategories();
  defaults = snapshotDefaults();
  applyOverridesObject(overrides);

  // ---- DOM rendering (only matters once init() is called with a live DOM) ----
  function isModified(catId, tIdx, fieldId, value) {
    const key = fieldKey(catId, tIdx, fieldId);
    return defaults[key] !== undefined && defaults[key] !== value;
  }

  function getOrFetchPartsDb(cb) {
    let db = global.partsDb || (global.window && global.window.partsDb) || [];
    if (db && db.length > 0) {
      if (cb) cb(db);
      return db;
    }
    
    try {
      const saved = global.localStorage ? global.localStorage.getItem('custom_parts_db') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (global.window) global.window.partsDb = parsed;
          if (cb) cb(parsed);
          return parsed;
        }
      }
    } catch (e) {}

    if (global.fetch) {
      global.fetch('parts_db.json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (Array.isArray(data) && data.length > 0) {
            if (global.window) global.window.partsDb = data;
            if (cb) cb(data);
          }
        })
        .catch(function (err) {
          console.warn('[RuleEditor] parts_db.json 불러오기 실패:', err);
        });
    }
    return db || [];
  }

  function ensurePartsDatalist() {
    let datalist = document.getElementById("ruleEditorPartsDatalist");
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = "ruleEditorPartsDatalist";
      document.body.appendChild(datalist);
    }
    getOrFetchPartsDb(function (db) {
      if (!db || !db.length) return;
      let html = "";
      db.forEach(function (p) {
        if (!p || !p.partNo) return;
        const label = p.nameKo || p.nameEn || "";
        html += '<option value="' + p.partNo + '">' + p.partNo + (label ? " (" + label + ")" : "") + '</option>';
      });
      datalist.innerHTML = html;
    });
  }

  function updatePartDbBadge(partNo, badgeEl) {
    if (!badgeEl) return;
    badgeEl.style.display = "none";
  }

  let masterSubWindowEl = null;
  let currentPickerTarget = null;

  function makeDraggable(modalEl, headerEl) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    headerEl.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      if (e.target.tagName === "BUTTON" || e.target.tagName === "I" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      modalEl.style.top = Math.max(10, (modalEl.offsetTop - pos2)) + "px";
      modalEl.style.left = Math.max(10, (modalEl.offsetLeft - pos1)) + "px";
      modalEl.style.right = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function createMasterSubWindow() {
    if (masterSubWindowEl) return masterSubWindowEl;

    const win = document.createElement("div");
    win.id = "ruleEditorMasterSubWindow";
    win.style.cssText = "position:fixed;top:100px;right:30px;width:720px;height:540px;min-width:480px;min-height:300px;max-width:95vw;max-height:92vh;background:#ffffff;border:2px solid #0284c7;border-radius:12px;box-shadow:0 12px 35px rgba(0,0,0,0.3);z-index:10000;display:none;flex-direction:column;overflow:hidden;resize:both;font-family:sans-serif;font-size:12px;";

    const header = document.createElement("div");
    header.style.cssText = "background:#0f172a;color:#ffffff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;flex:0 0 auto;";
    header.innerHTML = `
      <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-database" style="color:#38bdf8;"></i> PART_ID_TABLE (마스터 DB) 부품 선택 서브창
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button id="btnSubWinMin" type="button" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;" title="최소화/복원"><i class="fa-solid fa-minus"></i></button>
        <button id="btnSubWinMax" type="button" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:13px;" title="최대화/복원"><i class="fa-regular fa-square"></i></button>
        <button id="btnSubWinClose" type="button" style="background:transparent;border:none;color:#f43f5e;cursor:pointer;font-size:16px;font-weight:bold;" title="닫기">&times;</button>
      </div>
    `;

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;flex:0 0 auto;";
    toolbar.innerHTML = `
      <input type="text" id="subWinSearchInput" placeholder="부품코드, 한글/영문 품명 검색..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;outline:none;" />
      <select id="subWinCategoryFilter" style="padding:6px 8px;font-size:11.5px;border:1px solid #cbd5e1;border-radius:6px;outline:none;background:#fff;">
        <option value="ALL">전체 카테고리</option>
      </select>
      <button id="btnSubWinAddNewPart" type="button" style="padding:6px 12px;font-size:11.5px;font-weight:700;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px;" title="PART_ID_TABLE(마스터 DB)에 신규 부품을 등록합니다.">
        <i class="fa-solid fa-plus-circle"></i> 신규 부품 등록
      </button>
      <span id="subWinPartCount" style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">0개</span>
    `;

    const body = document.createElement("div");
    body.id = "subWinTableBodyContainer";
    body.style.cssText = "flex:1 1 auto;height:100%;min-height:150px;overflow-y:auto;padding:0;";

    const resizeGrip = document.createElement("div");
    resizeGrip.style.cssText = "position:absolute;right:3px;bottom:3px;width:12px;height:12px;pointer-events:none;color:#94a3b8;font-size:10px;display:flex;align-items:center;justify-content:center;";
    resizeGrip.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center" style="transform:rotate(90deg);"></i>';

    win.appendChild(header);
    win.appendChild(toolbar);
    win.appendChild(body);
    win.appendChild(resizeGrip);
    document.body.appendChild(win);

    makeDraggable(win, header);

    let isMinimized = false;
    win.querySelector("#btnSubWinMin").addEventListener("click", function () {
      isMinimized = !isMinimized;
      toolbar.style.display = isMinimized ? "none" : "flex";
      body.style.display = isMinimized ? "none" : "block";
      win.style.height = isMinimized ? "auto" : "";
    });

    let isMaximized = false;
    let preMaxRect = null;
    win.querySelector("#btnSubWinMax").addEventListener("click", function () {
      isMaximized = !isMaximized;
      const maxBtnIcon = win.querySelector("#btnSubWinMax i");
      if (isMaximized) {
        preMaxRect = {
          top: win.style.top,
          left: win.style.left,
          right: win.style.right,
          width: win.style.width,
          height: win.style.height
        };
        win.style.top = "5vh";
        win.style.left = "5vw";
        win.style.width = "90vw";
        win.style.height = "88vh";
        win.style.right = "auto";
        if (maxBtnIcon) maxBtnIcon.className = "fa-regular fa-clone";
      } else {
        if (preMaxRect) {
          win.style.top = preMaxRect.top;
          win.style.left = preMaxRect.left;
          win.style.right = preMaxRect.right;
          win.style.width = preMaxRect.width;
          win.style.height = preMaxRect.height;
        }
        if (maxBtnIcon) maxBtnIcon.className = "fa-regular fa-square";
      }
    });

    win.querySelector("#btnSubWinClose").addEventListener("click", function () {
      win.style.display = "none";
    });

    win.querySelector("#btnSubWinAddNewPart").addEventListener("click", function () {
      if (typeof global.openNewDbPartModal === "function") {
        global.openNewDbPartModal();
      } else if (typeof global.window !== "undefined" && typeof global.window.openNewDbPartModal === "function") {
        global.window.openNewDbPartModal();
      } else {
        const newPartNo = global.prompt("Enter new Part No. (e.g. WFB-0450Z-NEW):");
        if (!newPartNo || !newPartNo.trim()) return;
        const newPartName = global.prompt("Enter new Part Name (e.g. Base Fixing Bracket New):") || "";
        const db = global.partsDb || (global.window && global.window.partsDb) || [];
        
        const newPart = {
          partNo: newPartNo.trim(),
          nameKo: newPartName.trim(),
          nameEn: newPartName.trim(),
          category: "REINFORCING",
          unit: "PCS",
          weight: 0,
          price: 0,
          spec: ""
        };
        db.unshift(newPart);
        if (global.window) global.window.partsDb = db;
        try {
          if (global.localStorage) global.localStorage.setItem("custom_parts_db", JSON.stringify(db));
        } catch(e) {}
        
        renderSubWindowList();
        setStatus("신규 부품 '" + newPartNo + "' 등록 완료.", false);
      }
    });

    const searchIn = win.querySelector("#subWinSearchInput");
    const catSel = win.querySelector("#subWinCategoryFilter");
    searchIn.addEventListener("input", function () { renderSubWindowList(); });
    catSel.addEventListener("change", function () { renderSubWindowList(); });

    masterSubWindowEl = win;
    return win;
  }

  function renderSubWindowList() {
    if (!masterSubWindowEl) return;
    const container = masterSubWindowEl.querySelector("#subWinTableBodyContainer");
    const searchIn = masterSubWindowEl.querySelector("#subWinSearchInput");
    const catSel = masterSubWindowEl.querySelector("#subWinCategoryFilter");
    const countSpan = masterSubWindowEl.querySelector("#subWinPartCount");

    const q = (searchIn.value || "").trim().toLowerCase();
    const selCat = (catSel.value || "ALL").toUpperCase();

    getOrFetchPartsDb(function (db) {
      if (catSel.options.length <= 1) {
        const cats = {};
        db.forEach(function (p) {
          if (p.category) cats[p.category.toUpperCase()] = true;
        });
        Object.keys(cats).sort().forEach(function (c) {
          const opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          catSel.appendChild(opt);
        });
      }

      const filtered = db.filter(function (p) {
        if (!p || !p.partNo) return false;
        if (selCat !== "ALL" && (p.category || "").toUpperCase() !== selCat) return false;
        if (!q) return true;
        const hay = (p.partNo + " " + (p.nameKo || "") + " " + (p.nameEn || "") + " " + (p.spec || "")).toLowerCase();
        return hay.indexOf(q) !== -1;
      });

      countSpan.textContent = filtered.length + "개 부품";

      let html = `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead style="position:sticky;top:0;background:#f1f5f9;border-bottom:1.5px solid #cbd5e1;z-index:2;">
            <tr style="text-align:left;">
              <th style="padding:8px 10px;width:70px;text-align:center;">선택</th>
              <th style="padding:8px 10px;width:140px;">부품코드 (Part No)</th>
              <th style="padding:8px 10px;">한글 품명</th>
              <th style="padding:8px 10px;width:110px;">규격 (Spec)</th>
              <th style="padding:8px 10px;width:60px;text-align:right;">중량(kg)</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (!filtered.length) {
        html += '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">일치하는 마스터 DB 부품이 없습니다.</td></tr>';
      } else {
        filtered.forEach(function (p) {
          const selectedKey = currentPickerTarget && currentPickerTarget.input ? currentPickerTarget.input.value : "";
          const isMatch = selectedKey && selectedKey.toLowerCase() === p.partNo.toLowerCase();
          const rowBg = isMatch ? "#e0f2fe" : "#ffffff";

          html += `
            <tr style="border-bottom:1px solid #f1f5f9;background:${rowBg};" class="subwin-row" data-part-no="${p.partNo}">
              <td style="padding:6px 10px;text-align:center;">
                <button type="button" class="btn-pick-part" data-part-no="${p.partNo}" style="padding:3px 8px;font-size:11px;font-weight:700;background:#0284c7;color:#fff;border:none;border-radius:4px;cursor:pointer;">선택</button>
              </td>
              <td style="padding:6px 10px;font-family:monospace;font-weight:700;color:#0369a1;">${p.partNo}</td>
              <td style="padding:6px 10px;font-weight:600;color:#1e293b;">${p.nameKo || p.nameEn || "-"}</td>
              <td style="padding:6px 10px;color:#64748b;font-size:11px;">${p.spec || "-"}</td>
              <td style="padding:6px 10px;text-align:right;font-family:monospace;">${p.weight != null ? p.weight : "-"}</td>
            </tr>
          `;
        });
      }

      html += '</tbody></table>';
      container.innerHTML = html;

      container.querySelectorAll(".btn-pick-part, .subwin-row").forEach(function (el) {
        el.addEventListener("click", function (e) {
          e.stopPropagation();
          const partNo = el.dataset.partNo || el.getAttribute("data-part-no");
          if (partNo && currentPickerTarget) {
            currentPickerTarget.input.value = partNo;
            if (currentPickerTarget.optionKey && typeof currentPickerTarget.field.setPartNoOption === "function") {
              currentPickerTarget.field.setPartNoOption(currentPickerTarget.optionKey, partNo);
            } else if (typeof currentPickerTarget.field.setPartNo === "function") {
              currentPickerTarget.field.setPartNo(partNo);
            }
            currentPickerTarget.input.style.background = "#fff7d6";
            currentPickerTarget.input.style.borderColor = "#f0c419";
            
            currentPickerTarget.input.dispatchEvent(new Event("input", { bubbles: true }));
            currentPickerTarget.input.dispatchEvent(new Event("change", { bubbles: true }));

            if (typeof currentPickerTarget.syncFn === "function") {
              currentPickerTarget.syncFn();
            }
            
            if (masterSubWindowEl) {
              masterSubWindowEl.style.display = "none";
            }
            
            setStatus("부품코드 '" + partNo + "' (이)가 선택되어 반영되었습니다.", false);
          }
        });
      });
    });
  }

  function openMasterPickerSubWindow(targetInput, targetField, syncFn, optionKey) {
    const win = createMasterSubWindow();
    currentPickerTarget = { input: targetInput, field: targetField, syncFn: syncFn, optionKey: optionKey || null };
    win.style.display = "flex";
    renderSubWindowList();
  }

  function renderCategorySelect() {
    const sel = document.getElementById("ruleEditorCategorySelect");
    if (!sel) return;
    sel.style.display = "none";
    if (sel.parentElement && sel.parentElement.tagName === "LABEL") {
      sel.parentElement.style.display = "none";
    }
    sel.innerHTML = "";
    categories.forEach(function (cat, idx) {
      if (cat.hidden) return;
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = cat.label;
      sel.appendChild(opt);
    });
    if (categories[currentCatIndex] && categories[currentCatIndex].hidden) {
      const firstVisible = categories.findIndex(function (c) { return !c.hidden; });
      currentCatIndex = firstVisible === -1 ? 0 : firstVisible;
    }
    sel.value = String(currentCatIndex);
  }

  function computeLiveResult(formula, catId) {
    if (!formula || typeof RuleEngine === "undefined") return null;
    try {
      const inputL1 = document.getElementById('tankLength1');
      const inputL2 = document.getElementById('tankLength2');
      const inputL3 = document.getElementById('tankLength3');
      const inputL4 = document.getElementById('tankLength4');
      const inputWidth = document.getElementById('tankWidth');
      const inputHeight = document.getElementById('tankHeight');
      const inputPartitions = document.getElementById('tankPartitions');

      const l1 = inputL1 ? (parseFloat(inputL1.value) || 3.5) : 3.5;
      const l2 = inputL2 ? (parseFloat(inputL2.value) || 0) : 0;
      const l3 = inputL3 ? (parseFloat(inputL3.value) || 0) : 0;
      const l4 = inputL4 ? (parseFloat(inputL4.value) || 0) : 0;
      const w = inputWidth ? (parseFloat(inputWidth.value) || 6.0) : 6.0;
      const h = inputHeight ? (parseFloat(inputHeight.value) || 1.5) : 1.5;
      const nPart = inputPartitions ? (parseInt(inputPartitions.value) || 0) : 0;

      const g = (typeof PanelEngine !== "undefined" && PanelEngine.makeGeometry) 
        ? PanelEngine.makeGeometry(w, l1, h, l2, l3, l4)
        : {
            W: { whole: Math.floor(w), half: (w % 1 >= 0.5 ? 1 : 0), value: w },
            L1: { whole: Math.floor(l1), half: (l1 % 1 >= 0.5 ? 1 : 0), value: l1 },
            L2: { whole: Math.floor(l2), half: (l2 % 1 >= 0.5 ? 1 : 0), value: l2 },
            L3: { whole: Math.floor(l3), half: (l3 % 1 >= 0.5 ? 1 : 0), value: l3 },
            L4: { whole: Math.floor(l4), half: (l4 % 1 >= 0.5 ? 1 : 0), value: l4 },
            H: { whole: Math.floor(h), half: (h % 1 >= 0.5 ? 1 : 0), value: h },
            L_C_sum: Math.floor(l1+l2+l3+l4),
            L_F_sum: 0,
            n_partitions: nPart
          };

      const AR = global.AccessoriesRules;

      function layerFactor(H) {
        if (!AR || !AR.tieRod || !AR.tieRod.layerFactorTable) return 0;
        const row = AR.tieRod.layerFactorTable.find(function(r) { return r.maxH === undefined || H <= r.maxH; });
        return row ? Number(row.factor) : 0;
      }
      function segCount(dim) {
        if (!dim || dim <= 0 || !AR || !AR.tieRod || !AR.tieRod.segmentTable) return 0;
        const row = AR.tieRod.segmentTable.find(function(r) { return Math.abs(r[0] - dim) < 1e-6; });
        if (!row) return 0;
        return row[1] + row[2] + 1;
      }

      const l_total = l1 + l2 + l3 + l4;
      const H_RF1 = (AR && AR.boltsAndNuts && AR.boltsAndNuts.holesPerM_Roof1x1 != null) ? Number(AR.boltsAndNuts.holesPerM_Roof1x1) : 8;
      const H_RF05 = (AR && AR.boltsAndNuts && AR.boltsAndNuts.holesPerM_Roof05x1 != null) ? Number(AR.boltsAndNuts.holesPerM_Roof05x1) : 4;

      let fullScope = {
        W_C: g.W.whole, W_F: g.W.half,
        L1_C: g.L1.whole, L1_F: g.L1.half,
        L2_C: g.L2.whole, L2_F: g.L2.half,
        L3_C: g.L3.whole, L3_F: g.L3.half,
        L4_C: g.L4.whole, L4_F: g.L4.half,
        L_C: g.L_C_sum, L_F: g.L_F_sum,
        totLC: g.L_C_sum, totLF: g.L_F_sum,
        totWC: g.W.whole, totWF: g.W.half,
        L_O: l_total, L_O_C: g.L_C_sum, L_O_F: g.L_F_sum,
        H_O: g.H.value, H_C: g.H.whole, H_F: g.H.half,
        W_O: g.W.value, L1_O: g.L1.value, L2_O: g.L2.value, L3_O: g.L3.value, L4_O: g.L4.value,
        N_PA: g.n_partitions,
        Ltotal: l_total, W: w, H: h,
        R1: H_RF1,
        R05: H_RF05,
        R_C: H_RF1,
        R_F: H_RF05,
        R_1: H_RF1,
        R_05: H_RF05,
        holesPerM_Roof1x1: H_RF1,
        holesPerM_Roof05x1: H_RF05,
        H_RF1: H_RF1,
        H_RF05: H_RF05,
        ROOF_1M_HOLES: H_RF1,
        ROOF_05M_HOLES: H_RF05,
        layerFactor: layerFactor, segCount: segCount
      };

      if (AR && catId === "tierod" && AR.tieRod && AR.tieRod.intermediates) {
        fullScope = RuleEngine.withIntermediates(AR.tieRod.intermediates, fullScope);
      } else if (AR && catId === "reinf_ext" && AR.reinforcing && AR.reinforcing.external && AR.reinforcing.external.intermediates) {
        fullScope = RuleEngine.withIntermediates(AR.reinforcing.external.intermediates, fullScope);
      } else if (AR && catId === "reinf_int" && AR.reinforcing && AR.reinforcing.internal && AR.reinforcing.internal.intermediates) {
        fullScope = RuleEngine.withIntermediates(AR.reinforcing.internal.intermediates, fullScope);
      } else if (AR && catId === "bolts" && AR.boltsAndNuts && AR.boltsAndNuts.intermediates) {
        fullScope = RuleEngine.withIntermediates(AR.boltsAndNuts.intermediates, fullScope);
      } else if (AR && catId === "steelSkid" && AR.steelSkidDetailed && AR.steelSkidDetailed.intermediates) {
        fullScope = RuleEngine.withIntermediates(AR.steelSkidDetailed.intermediates, fullScope);
      }

      const res = RuleEngine.evaluate(formula, fullScope);
      if (typeof res === "number") {
        return Number.isInteger(res) ? String(res) : res.toFixed(2);
      }
      if (typeof res === "boolean") {
        return res ? "TRUE" : "FALSE";
      }
      return String(res);
    } catch (e) {
      return null;
    }
  }

  function renderTables(filterText) {
    if (typeof document === "undefined") return;
    const container = document.getElementById("ruleEditorTablesContainer");
    if (!container) return;
    container.innerHTML = "";

    renderCategorySelect();

    const cat = categories[currentCatIndex];
    if (!cat) return;

    const q = (filterText || "").trim().toLowerCase();

    let activeSkidSubTabIdx = global._activeSkidSubTabIdx || 0;
    if (activeSkidSubTabIdx >= cat.tables.length) activeSkidSubTabIdx = 0;

    if (cat.id === "steelSkid" && cat.tables && cat.tables.length > 0) {
      const subtabContainer = document.createElement("div");
      subtabContainer.style.cssText = "display:flex;gap:6px;margin-bottom:16px;border-bottom:2px solid #cbd5e1;padding-bottom:0px;flex-wrap:nowrap;overflow-x:auto;align-items:center;white-space:nowrap;-webkit-overflow-scrolling:touch;";

      const disabledMap = (overrides && overrides["steelSkid::disabledTabs"]) || {};

      cat.tables.forEach(function (t, idx) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.draggable = true;
        const isActive = (idx === activeSkidSubTabIdx);
        const isDisabled = !!disabledMap[t.specKey];

        let bgStyle = isActive ? "#0284c7" : "#ffffff";
        let borderStyle = isActive ? "#0284c7" : "#cbd5e1";
        let colorStyle = isActive ? "#ffffff" : "#475569";
        let opacityStyle = isDisabled ? "0.55" : "1";

        btn.style.cssText = "padding:8px 14px;font-size:12.5px;font-weight:800;border-radius:8px 8px 0 0;border:1.5px solid " + borderStyle + ";border-bottom:none;background:" + bgStyle + ";color:" + colorStyle + ";opacity:" + opacityStyle + ";cursor:grab;display:inline-flex;align-items:center;gap:5px;box-shadow:" + (isActive ? "0 -2px 6px rgba(2,132,199,0.15)" : "none") + ";user-select:none;transition:all 0.15s;";
        btn.title = "마우스로 끌어서 순서를 변경하거나 ON/OFF 스위치를 클릭해 사용 여부를 설정할 수 있습니다.";

        let icon = "fa-layer-group";
        if (t.specKey === "angle75") icon = "fa-ruler-combined";
        if (t.specKey === "channel125") icon = "fa-bars";
        if (t.specKey === "channel150") icon = "fa-bars-staggered";
        if (t.specKey === "ibeam") icon = "fa-kaaba";
        if (t.specKey === "sqp") icon = "fa-vector-square";

        const gripIcon = '<i class="fa-solid fa-grip-vertical" style="opacity:0.5;font-size:11px;margin-right:1px;"></i>';
        btn.innerHTML = gripIcon + '<i class="fa-solid ' + icon + '"></i> ' + t.label;

        // ON/OFF Direct Switch Pill Button
        const togglePill = document.createElement("span");
        if (isDisabled) {
          togglePill.style.cssText = "font-size:9.5px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:2px 6px;border-radius:10px;font-weight:800;cursor:pointer;margin-left:4px;display:inline-flex;align-items:center;gap:2px;";
          togglePill.innerHTML = '<i class="fa-solid fa-circle-xmark" style="font-size:9px;"></i> OFF';
          togglePill.title = "현재 비활성화(OFF) 상태입니다. 클릭하면 사용 중(ON)으로 전환됩니다.";
        } else {
          togglePill.style.cssText = "font-size:9.5px;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;padding:2px 6px;border-radius:10px;font-weight:800;cursor:pointer;margin-left:4px;display:inline-flex;align-items:center;gap:2px;";
          togglePill.innerHTML = '<i class="fa-solid fa-circle-check" style="font-size:9px;"></i> ON';
          togglePill.title = "현재 사용 중(ON) 상태입니다. 클릭하면 비활성화(OFF)로 전환됩니다.";
        }

        togglePill.addEventListener("click", function(e) {
          e.stopPropagation();
          const nextDisabled = !isDisabled;
          disabledMap[t.specKey] = nextDisabled;
          overrides["steelSkid::disabledTabs"] = disabledMap;
          persist(dbRef);
          categories = buildCategories();
          applyOverridesObject(overrides);
          updateSteelSkidSelectDropdown();
          renderTables(filterText);
          setStatus("'" + t.label + "' 탭이 " + (nextDisabled ? "비활성화(OFF)" : "사용(ON)") + "(으)로 변경되었습니다. (BOM Input 반영 완료)", false);
        });
        btn.appendChild(togglePill);

        // Drag and Drop Mouse Reordering Events
        btn.addEventListener("dragstart", function(e) {
          global._draggedSkidTabIdx = idx;
          btn.style.opacity = "0.4";
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(idx));
        });

        btn.addEventListener("dragover", function(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          btn.style.borderColor = "#2563eb";
          btn.style.borderWidth = "2.5px";
        });

        btn.addEventListener("dragleave", function() {
          btn.style.borderColor = borderStyle;
          btn.style.borderWidth = "1.5px";
        });

        btn.addEventListener("drop", function(e) {
          e.preventDefault();
          btn.style.borderColor = borderStyle;
          btn.style.borderWidth = "1.5px";
          const fromIdx = global._draggedSkidTabIdx;
          const toIdx = idx;
          if (fromIdx !== undefined && fromIdx !== toIdx && cat.tables[fromIdx] && cat.tables[toIdx]) {
            const movedTab = cat.tables.splice(fromIdx, 1)[0];
            cat.tables.splice(toIdx, 0, movedTab);
            global._activeSkidSubTabIdx = toIdx;

            const newOrderKeys = cat.tables.map(function(tb) { return tb.specKey; });
            overrides["steelSkid::tabOrder"] = newOrderKeys;
            persist(dbRef);
            categories = buildCategories();
            applyOverridesObject(overrides);
            updateSteelSkidSelectDropdown();
            renderTables(filterText);
            setStatus("탭 순서가 성공적으로 변경되었습니다. (BOM Input 즉시 반영 완료)", false);
          }
        });

        btn.addEventListener("dragend", function() {
          btn.style.opacity = opacityStyle;
        });

        btn.title = "더블 클릭(Double-Click)하면 탭 이름을 변경할 수 있습니다. 마우스로 끌어서 순서를 변경할 수도 있습니다.";

        btn.addEventListener("click", function() {
          switchSkidSubTab(t.specKey, true);
        });

        btn.addEventListener("dblclick", function(e) {
          e.stopPropagation();
          e.preventDefault();
          renameSkidSpecTab(t.specKey, t.label);
        });
        subtabContainer.appendChild(btn);
      });

      const currentSubTable = cat.tables[activeSkidSubTabIdx];
      const activeLabel = currentSubTable ? currentSubTable.label : "현재";

      const btnCopyTab = document.createElement("button");
      btnCopyTab.type = "button";
      btnCopyTab.style.cssText = "padding:6px 12px;font-size:11px;font-weight:800;border-radius:6px;border:1.5px solid #4ade80;background:#f0fdf4;color:#166534;cursor:pointer;display:inline-flex;align-items:center;gap:3px;margin-left:auto;white-space:nowrap;flex-shrink:0;";
      btnCopyTab.innerHTML = '<i class="fa-solid fa-copy"></i> 📋 [' + activeLabel + '] 탭 복사';
      btnCopyTab.title = "현재 선택된 '" + activeLabel + "' 탭의 모든 품명, 부품코드, 계산수식을 복사하여 새로운 스키드 규격 탭을 생성합니다.";
      btnCopyTab.addEventListener("click", function() {
        if (currentSubTable) {
          copySkidSpecTab(currentSubTable.specKey, activeLabel);
        }
      });
      subtabContainer.appendChild(btnCopyTab);

      const btnRenameTab = document.createElement("button");
      btnRenameTab.type = "button";
      btnRenameTab.style.cssText = "padding:6px 12px;font-size:11px;font-weight:800;border-radius:6px;border:1.5px solid #f59e0b;background:#fffbeb;color:#b45309;cursor:pointer;display:inline-flex;align-items:center;gap:3px;margin-left:4px;white-space:nowrap;flex-shrink:0;";
      btnRenameTab.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> ✏️ 탭 이름 변경';
      btnRenameTab.title = "현재 선택된 '" + activeLabel + "' 탭의 명칭을 변경합니다. 변경된 명칭은 BOM Input(Skid Type) 선택창에 즉시 업데이트됩니다.";
      btnRenameTab.addEventListener("click", function() {
        if (currentSubTable) {
          renameSkidSpecTab(currentSubTable.specKey, activeLabel);
        }
      });
      subtabContainer.appendChild(btnRenameTab);

      const btnAddTab = document.createElement("button");
      btnAddTab.type = "button";
      btnAddTab.style.cssText = "padding:6px 12px;font-size:11px;font-weight:800;border-radius:6px;border:1.5px solid #c084fc;background:#faf5ff;color:#7c3aed;cursor:pointer;display:inline-flex;align-items:center;gap:3px;margin-left:4px;white-space:nowrap;flex-shrink:0;";
      btnAddTab.innerHTML = '<i class="fa-solid fa-plus"></i> + 커스텀 규격 탭 추가';
      btnAddTab.addEventListener("click", function() {
        openAddCustomSkidSpecDialog();
      });
      subtabContainer.appendChild(btnAddTab);

      if (currentSubTable && currentSubTable.specKey !== "std" && currentSubTable.specKey !== "ibeam" && currentSubTable.specKey !== "sqp") {
        const btnDelTab = document.createElement("button");
        btnDelTab.type = "button";
        btnDelTab.style.cssText = "padding:6px 12px;font-size:11px;font-weight:800;border-radius:6px;border:1.5px solid #fca5a5;background:#fef2f2;color:#dc2626;cursor:pointer;display:inline-flex;align-items:center;gap:3px;margin-left:4px;white-space:nowrap;flex-shrink:0;";
        btnDelTab.innerHTML = '<i class="fa-solid fa-trash-can"></i> 🗑️ 탭 삭제';
        btnDelTab.title = "현재 커스텀 탭 '" + activeLabel + "'을(를) 삭제합니다.";
        btnDelTab.addEventListener("click", function() {
          deleteCustomSkidSpecTab(currentSubTable.specKey, activeLabel);
        });
        subtabContainer.appendChild(btnDelTab);
      }

      container.appendChild(subtabContainer);

      const noticeBanner = document.createElement("div");
      noticeBanner.style.cssText = "background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);border:1.5px solid #7dd3fc;border-radius:12px;padding:14px 18px;margin-bottom:18px;font-size:12.5px;color:#0369a1;line-height:1.55;box-shadow:0 2px 8px rgba(2,132,199,0.08);";
      noticeBanner.innerHTML = `
        <div style="font-weight:800;font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:8px;color:#0284c7;">
          <span style="background:#0284c7;color:#fff;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;"><i class="fa-solid fa-lightbulb"></i></span>
          <span>내부보강(Internal R/F) vs 외부보강(External R/F) 스틸 스키드 수식 산출 안내</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;padding-left:30px;">
          <div>• <b style="color:#0369a1;">내부보강식 (Internal R/F)</b>: 스키드 메인/조인트/크로스 채널, 앵커 브라켓, 심 플레이트만 산출됩니다 (총 8종류 기본 부품 산출).</div>
          <div>• <b style="color:#0284c7;">외부보강식 (External R/F)</b>: 외부보강 전용 하부 지지 부품인 <b>Support HB Beam (row23~row25: WFF-12540Z/35Z/30Z)</b> 및 <b>I-Beam Connector (row26: WBR-1111Z)</b> 수식이 추가되어 총 10종류 부품이 자동 합산됩니다.</div>
        </div>
      `;
      container.appendChild(noticeBanner);
    }

    cat.tables.forEach(function (table, tIdx) {
      if (cat.id === "steelSkid" && tIdx !== activeSkidSubTabIdx) return;

      let fields = table.fields || [];
      if (q) {
        fields = fields.filter(function (f) {
          const hay = ((f.label || "") + " " + f.id + " " + (f.get() || "") + " " + (typeof f.getPartNo === "function" ? f.getPartNo() : "")).toLowerCase();
          return hay.indexOf(q) !== -1;
        });
      }

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "background:#ffffff;border:1.5px solid var(--border-color,#cbd5e1);border-radius:12px;padding:18px;box-shadow:0 4px 14px rgba(0,0,0,0.04);";

      const title = document.createElement("div");
      title.style.cssText = "margin:0 0 14px 0;font-size:14.5px;font-weight:800;color:#0369a1;background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);border:1px solid #bae6fd;padding:10px 16px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;";
      title.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-layer-group" style="color:#0284c7;font-size:16px;"></i> <span>' + table.label + '</span> <span style="font-size:11.5px;background:#ffffff;color:#0284c7;border:1px solid #7dd3fc;padding:2px 8px;border-radius:12px;font-weight:700;">총 ' + fields.length + '개 항목</span></div>';
      wrapper.appendChild(title);

      const isSkidTable = (cat.id === "steelSkid" && (table.specKey === "std" || (table.specKey && table.specKey.startsWith("std_copy_")) || !!table.isMultiSpec));

      const tbl = document.createElement("table");
      tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:12.5px;";
      if (isSkidTable) {
        const subSpecsList = table.subSpecs || ["angle75", "channel125", "channel150"];
        const stdSkidTypes = subSpecsList.map(function(sKey) {
          const sLabel = (overrides && overrides["steelSkid::tabLabel::" + sKey]) ||
            (sKey === "angle75" ? "75 Angle (75각)" : sKey === "channel125" ? "125 Channel (125채널)" : sKey === "channel150" ? "150 Channel (150채널)" : sKey);
          return { key: sKey, label: sLabel };
        });
        const headerCols = stdSkidTypes.map(function (st) {
          return '<th style="padding:8px 10px;width:180px;color:#0284c7;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">' +
              '<span><i class="fa-solid fa-layer-group"></i> ' + st.label + '</span>' +
              '<button type="button" class="btn-rename-subspec" data-spec-key="' + st.key + '" data-spec-label="' + st.label + '" title="이 규격 표시 명칭 변경 (Skid Type 선택창 반영)" style="border:1px solid #bae6fd;background:#f0f9ff;color:#0284c7;cursor:pointer;font-size:10.5px;padding:2px 5px;border-radius:4px;font-weight:700;display:inline-flex;align-items:center;gap:3px;"><i class="fa-solid fa-pen-to-square"></i> ✏️ 변경</button>' +
            '</div>' +
          '</th>';
        }).join("");
        tbl.innerHTML =
          '<thead><tr style="text-align:left;background:#f8fafc;border-bottom:2px solid var(--border-color,#e2e8f0);color:#334155;font-size:12px;font-weight:700;">' +
          '<th style="padding:8px 10px;width:180px;">품명 / 항목 ID</th>' +
          headerCols +
          '<th style="padding:8px 10px;">계산 수식 (Formula) & 위치/비고</th>' +
          '<th style="padding:8px 10px;width:175px;text-align:center;">관리 (작업)</th>' +
          "</tr></thead>";
      } else {
        tbl.innerHTML =
          '<thead><tr style="text-align:left;background:#f8fafc;border-bottom:2px solid var(--border-color,#e2e8f0);color:#334155;font-size:12px;font-weight:700;">' +
          '<th style="padding:8px 10px;width:210px;">품명 / 항목 ID</th>' +
          '<th style="padding:8px 10px;width:350px;">적용 부품 DB (Part Code)</th>' +
          '<th style="padding:8px 10px;">계산 수식 (Formula) & 위치/비고</th>' +
          '<th style="padding:8px 10px;width:175px;text-align:center;">관리 (작업)</th>' +
          "</tr></thead>";
      }

      if (isSkidTable) {
        tbl.querySelectorAll(".btn-rename-subspec").forEach(function(btn) {
          btn.addEventListener("click", function(e) {
            e.stopPropagation();
            const specKey = btn.dataset.specKey;
            const currentLabel = btn.dataset.specLabel;
            renameSkidSpecTab(specKey, currentLabel);
          });
        });
      }
      const tbody = document.createElement("tbody");

      fields.forEach(function (field, fIdx) {
        if (cat.id === "steelSkid" && fIdx === 0) {
          const commonSectionHeader = document.createElement("tr");
          commonSectionHeader.style.cssText = "background:linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);border-top:2px solid #cbd5e1;border-bottom:1.5px solid #cbd5e1;";
          commonSectionHeader.innerHTML = `
            <td colspan="10" style="padding:10px 14px;color:#334155;font-weight:800;font-size:12.5px;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span><i class="fa-solid fa-list-check" style="font-size:13px;margin-right:6px;color:#2563eb;"></i> 📋 기본 및 내부보강(Internal R/F) 공통 스틸 스키드 수식 (Main, Joint, Cross, Shim Plate, Anchor)</span>
                <span style="font-size:11px;font-weight:700;background:#ffffff;color:#475569;border:1px solid #cbd5e1;padding:3px 9px;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">※ 내부/외부 보강 공통 산출 품목</span>
              </div>
            </td>
          `;
          tbody.appendChild(commonSectionHeader);
        }

        if (cat.id === "steelSkid" && field.id.indexOf("row23") !== -1) {
          const extSectionHeader = document.createElement("tr");
          extSectionHeader.style.cssText = "background:linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);border-top:2px solid #0284c7;border-bottom:2px solid #0284c7;";
          extSectionHeader.innerHTML = `
            <td colspan="10" style="padding:11px 14px;color:#0369a1;font-weight:800;font-size:13px;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span><i class="fa-solid fa-layer-group" style="font-size:14px;margin-right:6px;color:#0284c7;"></i> 🔵 외부보강 (External R/F) 전용 스틸 스키드 부품 수식 (Support HB Beam & Connector)</span>
                <span style="font-size:11px;font-weight:800;background:#ffffff;color:#0284c7;border:1px solid #0284c7;padding:3px 9px;border-radius:12px;box-shadow:0 1px 3px rgba(2,132,199,0.15);">※ 외부보강(External R/F) 선택시에만 BOM 계산에 자동 포함됩니다</span>
              </div>
            </td>
          `;
          tbody.appendChild(extSectionHeader);
        }

        const tr = document.createElement("tr");
        tr.style.cssText = "border-bottom:1px solid #e2e8f0;vertical-align:top;";

        // Column 1: Item Name & ID
        const tdId = document.createElement("td");
        tdId.style.cssText = "padding:10px 8px;vertical-align:top;" + (isSkidTable ? "width:180px;" : "width:210px;");
        
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = field.label || field.id;
        nameInput.className = "item-name-input";
        nameInput.style.cssText = "font-weight:700;font-size:12.5px;color:var(--text-primary,#1e293b);border:1px #cbd5e1 solid;border-radius:5px;background:#ffffff;padding:4px 6px;width:100%;box-sizing:border-box;outline:none;margin-bottom:4px;";
        nameInput.title = "클릭하여 품명/항목명을 자유롭게 직접 수정할 수 있습니다.";
        nameInput.addEventListener("focus", function() {
          nameInput.style.borderColor = "#3b82f6";
          nameInput.style.boxShadow = "0 0 0 2px rgba(59,130,246,0.15)";
        });
        nameInput.addEventListener("blur", function() {
          nameInput.style.borderColor = "#cbd5e1";
          nameInput.style.boxShadow = "none";
        });
        function syncNameLabel() {
          const newLabel = nameInput.value;
          field.label = newLabel;
          if (field.item) field.item.label = newLabel;
          const key = fieldKey(cat.id, tIdx, field.id);
          overrides[key + ":label"] = newLabel;

          const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
          const customKey = subCatId + "::customRows";
          if (Array.isArray(overrides[customKey])) {
            const cItem = overrides[customKey].find(function(it) { return (it.name || it.id) === field.id; });
            if (cItem) cItem.label = newLabel;
          }
          if (Array.isArray(table.sourceArray)) {
            const sItem = table.sourceArray.find(function(it) { return (it.name || it.id) === field.id; });
            if (sItem) sItem.label = newLabel;
          }
        }

        nameInput.addEventListener("input", function() {
          syncNameLabel();
          nameInput.style.background = "#fff7d6";
          nameInput.style.borderColor = "#f0c419";
        });
        nameInput.addEventListener("change", function() {
          syncNameLabel();
          persist(dbRef);
          flashInputSaved(nameInput, "품명: " + nameInput.value);
        });
        nameInput.addEventListener("blur", function() {
          syncNameLabel();
          persist(dbRef);
          flashInputSaved(nameInput, "품명: " + nameInput.value);
        });
        tdId.appendChild(nameInput);

        if (cat.id === "steelSkid") {
          const isExtOnlyOverride = overrides && overrides["steelSkid::extOnly::" + field.id];
          const isExtOnly = (isExtOnlyOverride !== undefined)
            ? !!isExtOnlyOverride
            : (field.isExtOnly || ["row23", "row24", "row25", "row26"].some(function(rKey) { return field.id.indexOf(rKey) !== -1; }));

          const badgeBtn = document.createElement("button");
          badgeBtn.type = "button";
          if (isExtOnly) {
            badgeBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;color:#0369a1;background:#e0f2fe;border:1px solid #7dd3fc;padding:3px 7px;border-radius:5px;margin-top:3px;cursor:pointer;transition:all 0.15s;";
            badgeBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i> 🔵 외부보강 전용 <span style="font-size:9px;opacity:0.8;">(클릭시 전환)</span>';
            badgeBtn.title = "현재 '외부보강식 전용' 항목입니다. 클릭하여 '내부/외부 공통'으로 전환할 수 있습니다.";
          } else {
            badgeBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;color:#475569;background:#f8fafc;border:1px solid #cbd5e1;padding:3px 7px;border-radius:5px;margin-top:3px;cursor:pointer;transition:all 0.15s;";
            badgeBtn.innerHTML = '<i class="fa-solid fa-check"></i> 내부/외부 공통 <span style="font-size:9px;opacity:0.8;">(클릭시 전환)</span>';
            badgeBtn.title = "현재 '내부/외부 공통' 항목입니다. 클릭하여 '외부보강식 전용'으로 전환할 수 있습니다.";
          }

          badgeBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            const nextState = !isExtOnly;
            overrides["steelSkid::extOnly::" + field.id] = nextState;
            field.isExtOnly = nextState;
            persist(dbRef);
            categories = buildCategories();
            renderTables(currentSearchValue());
            setStatus("'" + (field.label || field.id) + "' 항목이 " + (nextState ? "'외부보강식 전용'" : "'내부/외부 공통'") + "(으)로 변경되었습니다.", false);
          });

          tdId.appendChild(badgeBtn);
        }

        const idLine = document.createElement("div");
        idLine.style.cssText = "display:none;";
        idLine.textContent = field.id;
        tdId.appendChild(idLine);
        tr.appendChild(tdId);

        // Column(s) 2+: Part Code / DB Selection
        if (isSkidTable && typeof field.getPartOptions === "function") {
          ensurePartsDatalist();
          const optionsMap = {};
          field.getPartOptions().forEach(function (opt) {
            optionsMap[opt.key] = opt;
          });

          const subSpecsList = table.subSpecs || ["angle75", "channel125", "channel150"];
          const stdSkidTypes = subSpecsList.map(function(sKey) {
            const sLabel = (overrides && overrides["steelSkid::tabLabel::" + sKey]) ||
              (sKey === "angle75" ? "75 Angle (75각)" : sKey === "channel125" ? "125 Channel (125채널)" : sKey === "channel150" ? "150 Channel (150채널)" : sKey);
            return { key: sKey, label: sLabel };
          });
          stdSkidTypes.forEach(function (skidObj) {
            const skidKey = skidObj.key;
            const tdSkid = document.createElement("td");
            tdSkid.style.cssText = "padding:8px 6px;vertical-align:top;width:170px;";
            const opt = optionsMap[skidKey] || { key: skidKey, label: skidObj.label, val: "" };

            const partCard = document.createElement("div");
            partCard.style.cssText = "background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;gap:4px;";

            const partBox = document.createElement("div");
            partBox.style.cssText = "display:flex;align-items:center;gap:4px;";

            const partInput = document.createElement("input");
            partInput.type = "text";
            partInput.setAttribute("list", "ruleEditorPartsDatalist");
            partInput.value = opt.val || "";
            partInput.className = "part-code-input";
            partInput.dataset.catId = cat.id;
            partInput.dataset.tableIdx = String(tIdx);
            partInput.dataset.fieldId = field.id;
            partInput.dataset.optKey = opt.key;
            partInput.style.cssText = "font-family:monospace;font-size:11px;font-weight:600;padding:3px 5px;border:1px solid #93c5fd;border-radius:4px;background:#ffffff;color:#0369a1;outline:none;flex:1;width:100%;box-sizing:border-box;";
            partInput.title = opt.label + " 부품코드를 드롭다운으로 선택하거나 직접 수정하실 수 있습니다.";

            const dbBadge = document.createElement("div");

            function syncDbBadge() {
              updatePartDbBadge(partInput.value, dbBadge);
            }

            function syncPartNoOption() {
              const newVal = partInput.value.trim();
              field.setPartNoOption(opt.key, newVal);
              if (typeof field.setPartNo === "function") field.setPartNo(newVal);

              const key = fieldKey(cat.id, tIdx, field.id);
              overrides[key + ":partNo:" + opt.key] = newVal;
              overrides[key + ":partNo"] = newVal;

              const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
              const customKey = subCatId + "::customRows";
              if (Array.isArray(overrides[customKey])) {
                const cItem = overrides[customKey].find(function(it) { return (it.name || it.id) === field.id; });
                if (cItem) {
                  if (!cItem.parts) cItem.parts = {};
                  cItem.parts[opt.key] = newVal;
                  cItem.partNo = newVal;
                }
              }
              if (Array.isArray(table.sourceArray)) {
                const sItem = table.sourceArray.find(function(it) { return (it.name || it.id) === field.id; });
                if (sItem) {
                  if (!sItem.parts) sItem.parts = {};
                  sItem.parts[opt.key] = newVal;
                  sItem.partNo = newVal;
                }
              }
            }

            partInput.addEventListener("input", function () {
              syncPartNoOption();
              partInput.style.background = "#fff7d6";
              partInput.style.borderColor = "#f0c419";
              syncDbBadge();
            });
            partInput.addEventListener("change", function () {
              syncPartNoOption();
              syncDbBadge();
              persist(dbRef);
              flashInputSaved(partInput, opt.label + " 부품코드");
            });
            partInput.addEventListener("blur", function () {
              syncPartNoOption();
              syncDbBadge();
              persist(dbRef);
              flashInputSaved(partInput, opt.label + " 부품코드");
            });

            const pickBtn = document.createElement("button");
            pickBtn.type = "button";
            pickBtn.style.cssText = "padding:3px 6px;font-size:10.5px;font-weight:700;background:#0284c7;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:2px;";
            pickBtn.innerHTML = '<i class="fa-solid fa-database"></i> DB';
            pickBtn.title = "PART_ID_TABLE(마스터 DB) 모달리스 서브창에서 선택합니다.";
            pickBtn.addEventListener("click", function () {
              openMasterPickerSubWindow(partInput, field, syncDbBadge, opt.key);
            });

            partBox.appendChild(partInput);
            partBox.appendChild(pickBtn);
            partCard.appendChild(partBox);
            partCard.appendChild(dbBadge);

            // Per-SkidType Custom Formula Input Box
            const customFormulaKey = cat.id + "::formula::" + field.id + "::" + skidKey;
            const existingCustomFormula = overrides[customFormulaKey] || "";

            const customFormBox = document.createElement("div");
            customFormBox.style.cssText = "margin-top:2px;";

            const customFormInput = document.createElement("textarea");
            customFormInput.rows = 1;
            customFormInput.placeholder = "📐 " + skidObj.label.split(" ")[0] + " 전용 수식";
            customFormInput.value = existingCustomFormula;
            customFormInput.style.cssText = "resize:both;min-width:180px;width:100%;height:30px;min-height:26px;font-family:monospace;font-size:10px;padding:4px 6px;border:1px solid " + (existingCustomFormula ? "#3b82f6" : "#cbd5e1") + ";border-radius:4px;background:" + (existingCustomFormula ? "#eff6ff" : "#ffffff") + ";color:#1e293b;outline:none;box-sizing:border-box;vertical-align:middle;white-space:pre-wrap;word-break:break-all;overflow:auto;";
            customFormInput.title = skidObj.label + " 규격 전용 계산 수식입니다. 입력 시 기본 수식 대신 이 수식이 계산됩니다.";
            customFormInput.addEventListener("keydown", function(e) {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.blur();
              }
            });

            customFormInput.addEventListener("input", function() {
              const val = customFormInput.value.trim();
              const targetItem = AR.steelSkidDetailed.rows.find(function(r) { return (r.name || r.id) === field.id; });
              if (targetItem) {
                if (!targetItem.formulas) targetItem.formulas = {};
                if (val) {
                  targetItem.formulas[skidKey] = val;
                  customFormInput.style.background = "#eff6ff";
                  customFormInput.style.borderColor = "#3b82f6";
                } else {
                  delete targetItem.formulas[skidKey];
                  customFormInput.style.background = "#ffffff";
                  customFormInput.style.borderColor = "#cbd5e1";
                }
              }
              overrides[customFormulaKey] = val;
            });
            customFormInput.addEventListener("change", function() {
              persist(dbRef);
              flashInputSaved(customFormInput, skidObj.label + " 전용 수식");
            });
            customFormInput.addEventListener("blur", function() {
              persist(dbRef);
              flashInputSaved(customFormInput, skidObj.label + " 전용 수식");
            });

            customFormBox.appendChild(customFormInput);
            partCard.appendChild(customFormBox);

            tdSkid.appendChild(partCard);
            syncDbBadge();
            tr.appendChild(tdSkid);
          });
        } else {
          const tdPart = document.createElement("td");
          tdPart.style.cssText = "padding:10px 8px;vertical-align:top;width:350px;";

          if (typeof field.getPartOptions === "function") {
            ensurePartsDatalist();

            let optsToRender = field.getPartOptions();
            if (cat.id === "steelSkid" && !isSkidTable) {
              const matched = optsToRender.filter(function(o) { return o.key === table.specKey; });
              if (matched.length > 0) {
                optsToRender = matched;
              } else {
                const singleVal = typeof field.getPartNo === "function" ? field.getPartNo() : (field.get() || "");
                optsToRender = [{ key: table.specKey, label: table.label, val: singleVal }];
              }
            }

            // Holds one card per spec option; appended to tdPart once below.
            const partContainer = document.createElement("div");
            partContainer.style.cssText = "display:flex;flex-direction:column;gap:6px;";

            optsToRender.forEach(function (opt) {
              const partCard = document.createElement("div");
              partCard.style.cssText = "background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:4px;";

              const partBox = document.createElement("div");
              partBox.style.cssText = "display:flex;align-items:center;gap:6px;";

              const partTag = document.createElement("span");
              partTag.style.cssText = "font-size:11px;color:#0284c7;font-weight:700;white-space:nowrap;";
              partTag.textContent = (cat.id === "steelSkid" && !isSkidTable) ? "부품코드:" : (opt.label + ":");

              const partInput = document.createElement("input");
              partInput.type = "text";
              partInput.setAttribute("list", "ruleEditorPartsDatalist");
              partInput.value = opt.val;
              partInput.className = "part-code-input";
              partInput.dataset.catId = cat.id;
              partInput.dataset.tableIdx = String(tIdx);
              partInput.dataset.fieldId = field.id;
              partInput.dataset.optKey = opt.key;
              partInput.style.cssText = "font-family:monospace;font-size:11.5px;font-weight:600;padding:3px 6px;border:1px solid #93c5fd;border-radius:4px;background:#ffffff;color:#0369a1;outline:none;flex:1;min-width:80px;";
              partInput.title = opt.label + " 부품코드를 드롭다운으로 선택하거나 직접 수정하실 수 있습니다.";

              const dbBadge = document.createElement("div");

              function syncDbBadge() {
                updatePartDbBadge(partInput.value, dbBadge);
              }

              function syncSinglePartNoOption() {
                const newVal = partInput.value.trim();
                if (typeof field.setPartNoOption === "function") field.setPartNoOption(opt.key, newVal);
                if (typeof field.setPartNo === "function") field.setPartNo(newVal);

                const key = fieldKey(cat.id, tIdx, field.id);
                overrides[key + ":partNo:" + opt.key] = newVal;
                overrides[key + ":partNo"] = newVal;

                const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
                const customKey = subCatId + "::customRows";
                if (Array.isArray(overrides[customKey])) {
                  const cItem = overrides[customKey].find(function(it) { return (it.name || it.id) === field.id; });
                  if (cItem) {
                    if (!cItem.parts) cItem.parts = {};
                    cItem.parts[opt.key] = newVal;
                    cItem.partNo = newVal;
                  }
                }
                if (Array.isArray(table.sourceArray)) {
                  const sItem = table.sourceArray.find(function(it) { return (it.name || it.id) === field.id; });
                  if (sItem) {
                    if (!sItem.parts) sItem.parts = {};
                    sItem.parts[opt.key] = newVal;
                    sItem.partNo = newVal;
                  }
                }
              }

              partInput.addEventListener("input", function () {
                syncSinglePartNoOption();
                partInput.style.background = "#fff7d6";
                partInput.style.borderColor = "#f0c419";
                syncDbBadge();
              });
              partInput.addEventListener("change", function () {
                syncSinglePartNoOption();
                syncDbBadge();
                persist(dbRef);
                flashInputSaved(partInput, opt.label + " 부품코드");
              });
              partInput.addEventListener("blur", function () {
                syncSinglePartNoOption();
                syncDbBadge();
                persist(dbRef);
                flashInputSaved(partInput, opt.label + " 부품코드");
              });

              const pickBtn = document.createElement("button");
              pickBtn.type = "button";
              pickBtn.style.cssText = "padding:3px 8px;font-size:11px;font-weight:700;background:#0284c7;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:3px;";
              pickBtn.innerHTML = '<i class="fa-solid fa-database"></i> DB';
              pickBtn.title = "PART_ID_TABLE(마스터 DB) 모달리스 서브창에서 선택합니다.";
              pickBtn.addEventListener("click", function () {
                openMasterPickerSubWindow(partInput, field, syncDbBadge, opt.key);
              });

              partBox.appendChild(partTag);
              partBox.appendChild(partInput);
              partBox.appendChild(pickBtn);
              partCard.appendChild(partBox);
              partCard.appendChild(dbBadge);
              partContainer.appendChild(partCard);
              syncDbBadge();
            });

            tdPart.appendChild(partContainer);
          } else if (typeof field.getPartNo === "function") {
            ensurePartsDatalist();

            const partCard = document.createElement("div");
            partCard.style.cssText = "background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:4px;";

            const partBox = document.createElement("div");
            partBox.style.cssText = "display:flex;align-items:center;gap:6px;";

            const partTag = document.createElement("span");
            partTag.style.cssText = "font-size:11px;color:#0284c7;font-weight:700;white-space:nowrap;";
            partTag.textContent = "부품코드:";

            const partInput = document.createElement("input");
            partInput.type = "text";
            partInput.setAttribute("list", "ruleEditorPartsDatalist");
            partInput.value = field.getPartNo();
            partInput.className = "part-code-input";
            partInput.dataset.catId = cat.id;
            partInput.dataset.tableIdx = String(tIdx);
            partInput.dataset.fieldId = field.id;
            partInput.style.cssText = "font-family:monospace;font-size:11.5px;font-weight:600;padding:3px 6px;border:1px solid #93c5fd;border-radius:4px;background:#ffffff;color:#0369a1;outline:none;flex:1;min-width:80px;";
            partInput.title = "PART_ID_TABLE(마스터 DB)에서 부품코드를 드롭다운으로 선택하거나 직접 수정하실 수 있습니다.";

            const dbBadge = document.createElement("div");

            function syncDbBadge() {
              updatePartDbBadge(partInput.value, dbBadge);
            }

            // A single-spec row has no `parts` map, so this spec-agnostic key is
            // the only place its part code can be stored. Writing just
            // field.setPartNo() left the edit in memory only: it survived a
            // re-render but reverted to the shipped default on reload.
            function syncSinglePartNo() {
              const newVal = partInput.value.trim();
              field.setPartNo(newVal);

              const key = fieldKey(cat.id, tIdx, field.id);
              overrides[key + ":partNo"] = newVal;

              const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
              const customKey = subCatId + "::customRows";
              if (Array.isArray(overrides[customKey])) {
                const cItem = overrides[customKey].find(function (it) { return (it.name || it.id) === field.id; });
                if (cItem) cItem.partNo = newVal;
              }
              if (Array.isArray(table.sourceArray)) {
                const sItem = table.sourceArray.find(function (it) { return (it.name || it.id) === field.id; });
                if (sItem) sItem.partNo = newVal;
              }
            }

            partInput.addEventListener("input", function () {
              syncSinglePartNo();
              partInput.style.background = "#fff7d6";
              partInput.style.borderColor = "#f0c419";
              syncDbBadge();
            });
            partInput.addEventListener("change", function () {
              syncSinglePartNo();
              syncDbBadge();
              persist(dbRef);
              flashInputSaved(partInput, "부품코드");
            });
            partInput.addEventListener("blur", function () {
              syncSinglePartNo();
              syncDbBadge();
              persist(dbRef);
              flashInputSaved(partInput, "부품코드");
            });

            const pickBtn = document.createElement("button");
            pickBtn.type = "button";
            pickBtn.style.cssText = "padding:3px 8px;font-size:11px;font-weight:700;background:#0284c7;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:3px;";
            pickBtn.innerHTML = '<i class="fa-solid fa-database"></i> DB';
            pickBtn.title = "PART_ID_TABLE(마스터 DB) 모달리스 서브창에서 선택합니다.";
            pickBtn.addEventListener("click", function () {
              openMasterPickerSubWindow(partInput, field, syncDbBadge);
            });

            partBox.appendChild(partTag);
            partBox.appendChild(partInput);
            partBox.appendChild(pickBtn);
            partCard.appendChild(partBox);
            partCard.appendChild(dbBadge);
            tdPart.appendChild(partCard);

            syncDbBadge();
          } else {
            const noPartText = document.createElement("span");
            noPartText.style.cssText = "color:#94a3b8;font-size:11.5px;font-style:italic;padding-top:4px;display:inline-block;";
            noPartText.textContent = "- (수식 전용)";
            tdPart.appendChild(noPartText);
          }
          tr.appendChild(tdPart);
        }

        // Column 3: Formula & Location / Remarks
        const tdInput = document.createElement("td");
        tdInput.style.cssText = "padding:10px 8px;vertical-align:top;";

        const formulaWrapper = document.createElement("div");
        formulaWrapper.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;";

        const input = document.createElement("textarea");
        input.rows = 1;
        input.value = field.get();
        input.dataset.catId = cat.id;
        input.dataset.tableIdx = String(tIdx);
        input.dataset.fieldId = field.id;
        input.style.cssText = "resize:both;min-width:220px;width:100%;height:34px;min-height:28px;box-sizing:border-box;padding:6px 10px;border-radius:6px;border:1px solid #cbd5e1;font-family:monospace;font-size:12px;outline:none;vertical-align:middle;white-space:pre-wrap;word-break:break-all;overflow:auto;";
        input.addEventListener("keydown", function(e) {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.blur();
          }
        });

        const resultBadge = document.createElement("div");
        resultBadge.style.cssText = "background:#ecfdf5;border:1.5px solid #10b981;color:#047857;padding:4px 10px;border-radius:6px;font-family:monospace;font-size:12px;font-weight:bold;white-space:nowrap;flex-shrink:0;";
        
        function updateResultBadge() {
          const liveVal = computeLiveResult(input.value, cat.id);
          if (liveVal !== null) {
            resultBadge.textContent = "= " + liveVal;
            resultBadge.style.background = "#ecfdf5";
            resultBadge.style.borderColor = "#10b981";
            resultBadge.style.color = "#047857";
            resultBadge.title = "현재 탱크 입력 조건 기준 실시간 계산 결과값입니다.";
          } else {
            resultBadge.textContent = "= -";
            resultBadge.style.background = "#f9fafb";
            resultBadge.style.borderColor = "#d1d5db";
            resultBadge.style.color = "#9ca3af";
            resultBadge.title = "현재 수식을 계산할 수 없거나 문법 오류가 있습니다.";
          }
        }

        if (isModified(cat.id, tIdx, field.id, field.get())) {
          input.style.background = "#fff7d6";
          input.style.borderColor = "#f0c419";
        }
        function syncFormulaValue() {
          field.set(input.value);
          const key = fieldKey(cat.id, tIdx, field.id);
          overrides[key] = input.value;
        }

        input.addEventListener("input", function () {
          syncFormulaValue();
          const modified = isModified(cat.id, tIdx, field.id, input.value);
          input.style.background = modified ? "#fff7d6" : "";
          input.style.borderColor = modified ? "#f0c419" : "#cbd5e1";
          updateResultBadge();
        });
        input.addEventListener("change", function () {
          syncFormulaValue();
          persist(dbRef);
          flashInputSaved(input, (field.label || field.id) + " 수식");
        });
        input.addEventListener("blur", function () {
          syncFormulaValue();
          persist(dbRef);
          flashInputSaved(input, (field.label || field.id) + " 수식");
        });

        formulaWrapper.appendChild(input);
        formulaWrapper.appendChild(resultBadge);
        tdInput.appendChild(formulaWrapper);
        updateResultBadge();

        const metaWrapper = document.createElement("div");
        metaWrapper.style.cssText = "margin-top:8px;display:flex;gap:10px;align-items:center;";

        const locBox = document.createElement("div");
        locBox.style.cssText = "flex:1;display:flex;align-items:center;gap:4px;";
        const locTag = document.createElement("span");
        locTag.style.cssText = "font-size:11px;color:#475569;font-weight:700;white-space:nowrap;";
        locTag.innerHTML = '<i class="fa-solid fa-location-dot" style="color:#0284c7;"></i> 위치:';
        
        const locInput = document.createElement("input");
        locInput.type = "text";
        locInput.className = "location-input";
        locInput.value = typeof field.getLocation === "function" ? field.getLocation() : "";
        locInput.dataset.catId = cat.id;
        locInput.dataset.tableIdx = String(tIdx);
        locInput.dataset.fieldId = field.id;
        locInput.placeholder = "설치/적용 위치 (예: 수조 바닥 코너, 측판 플랜지)";
        locInput.style.cssText = "flex:1;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:11px;border:1px solid #cbd5e1;border-radius:4px;outline:none;background:#fafafa;color:#1e293b;";
        locInput.title = "향후 검산을 위한 조립/설치 위치 메모입니다.";

        locInput.addEventListener("input", function () {
          if (typeof field.setLocation === "function") field.setLocation(locInput.value);
          locInput.style.background = "#fff7d6";
          locInput.style.borderColor = "#f0c419";
        });
        locInput.addEventListener("change", function () {
          if (typeof field.setLocation === "function") field.setLocation(locInput.value);
          const key = fieldKey(cat.id, tIdx, field.id);
          overrides[key + ":loc"] = locInput.value;
          persist(dbRef);
          flashInputSaved(locInput, (field.label || field.id) + " 위치");
        });
        locInput.addEventListener("blur", function () {
          if (typeof field.setLocation === "function") field.setLocation(locInput.value);
          const key = fieldKey(cat.id, tIdx, field.id);
          overrides[key + ":loc"] = locInput.value;
          persist(dbRef);
          flashInputSaved(locInput, (field.label || field.id) + " 위치");
        });

        locBox.appendChild(locTag);
        locBox.appendChild(locInput);

        const remBox = document.createElement("div");
        remBox.style.cssText = "flex:1;display:flex;align-items:center;gap:4px;";
        const remTag = document.createElement("span");
        remTag.style.cssText = "font-size:11px;color:#475569;font-weight:700;white-space:nowrap;";
        remTag.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:#059669;"></i> 비고:';
        
        const remInput = document.createElement("input");
        remInput.type = "text";
        remInput.className = "remarks-input";
        remInput.value = typeof field.getRemarks === "function" ? field.getRemarks() : "";
        remInput.dataset.catId = cat.id;
        remInput.dataset.tableIdx = String(tIdx);
        remInput.dataset.fieldId = field.id;
        remInput.placeholder = "검산 메모/참고사항 (예: 원본 엑셀 Ext_Reinf M45)";
        remInput.style.cssText = "flex:1;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:11px;border:1px solid #cbd5e1;border-radius:4px;outline:none;background:#fafafa;color:#1e293b;";
        remInput.title = "향후 검산을 위한 비고/수식 근거 메모입니다.";

        remInput.addEventListener("input", function () {
          if (typeof field.setRemarks === "function") field.setRemarks(remInput.value);
          remInput.style.background = "#fff7d6";
          remInput.style.borderColor = "#f0c419";
        });
        remInput.addEventListener("change", function () {
          if (typeof field.setRemarks === "function") field.setRemarks(remInput.value);
          const key = fieldKey(cat.id, tIdx, field.id);
          overrides[key + ":rem"] = remInput.value;
          persist(dbRef);
          flashInputSaved(remInput, (field.label || field.id) + " 비고");
        });
        remInput.addEventListener("blur", function () {
          if (typeof field.setRemarks === "function") field.setRemarks(remInput.value);
          const key = fieldKey(cat.id, tIdx, field.id);
          overrides[key + ":rem"] = remInput.value;
          persist(dbRef);
          flashInputSaved(remInput, (field.label || field.id) + " 비고");
        });

        remBox.appendChild(remTag);
        remBox.appendChild(remInput);

        metaWrapper.appendChild(locBox);
        metaWrapper.appendChild(remBox);
        tdInput.appendChild(metaWrapper);

        // Height-bracket ("높이별로 편집") toggle
        const heightModel = tryBuildHeightTable(field.get());
        let heightInputs = null;
        let inTableMode = false;

        function fillHeightInputsFrom(texts) {
          HEIGHT_LIST.forEach(function (h) {
            heightInputs[h].value = texts[h] != null ? texts[h] : "0";
          });
        }

        if (heightModel) {
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.style.cssText = "margin-top:6px;font-size:11px;font-weight:600;padding:3px 10px;border-radius:5px;border:1px solid var(--neon-blue,#2563eb);background:#eef6ff;color:var(--neon-blue,#2563eb);cursor:pointer;";
          tdInput.appendChild(toggleBtn);

          const heightPanel = document.createElement("div");
          heightPanel.style.cssText = "margin-top:6px;padding:8px;background:var(--bg-secondary,#f8fafc);border-radius:6px;border:1px dashed var(--border-color,#cbd5e1);";
          const hint = document.createElement("div");
          hint.style.cssText = "font-size:10.5px;color:var(--text-secondary,#64748b);margin-bottom:6px;";
          hint.textContent = "탱크 높이(m)별로 이 항목의 계산식을 따로 입력합니다. 0이면 그 높이에서는 사용되지 않습니다.";
          heightPanel.appendChild(hint);

          const grid = document.createElement("div");
          grid.style.cssText = "display:flex;flex-direction:column;gap:5px;";
          heightInputs = {};
          HEIGHT_LIST.forEach(function (h) {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:8px;";
            const lab = document.createElement("label");
            lab.textContent = h + "m";
            lab.style.cssText = "flex:0 0 34px;font-size:11px;font-weight:600;color:var(--text-secondary,#64748b);text-align:right;";
            const hIn = document.createElement("input");
            hIn.type = "text";
            hIn.style.cssText = "flex:1 1 auto;min-width:0;box-sizing:border-box;font-family:monospace;font-size:11.5px;padding:4px 6px;border:1px solid var(--border-color,#cbd5e1);border-radius:4px;outline:none;";
            hIn.addEventListener("input", function () {
              const texts = {};
              HEIGHT_LIST.forEach(function (hh) { texts[hh] = heightInputs[hh].value; });
              input.value = reconstructFormula(texts);
              input.dispatchEvent(new Event("input"));
            });
            heightInputs[h] = hIn;
            row.appendChild(lab);
            row.appendChild(hIn);
            grid.appendChild(row);
          });
          heightPanel.appendChild(grid);
          fillHeightInputsFrom(heightModel);
          tdInput.appendChild(heightPanel);

          const setMode = function (tableMode) {
            inTableMode = tableMode;
            input.style.display = tableMode ? "none" : "";
            heightPanel.style.display = tableMode ? "block" : "none";
            toggleBtn.textContent = tableMode ? "원문(고급) 수식으로 전환" : "높이별로 편집";
          };
          toggleBtn.addEventListener("click", function () {
            if (!inTableMode) {
              const rebuilt = tryBuildHeightTable(input.value) || heightModel;
              fillHeightInputsFrom(rebuilt);
            }
            setMode(!inTableMode);
          });
          setMode(true);
        }

        // Column 4: Management Actions (Reset / Copy / Delete)
        const tdManage = document.createElement("td");
        tdManage.style.cssText = "padding:10px 4px;vertical-align:top;text-align:center;width:175px;min-width:175px;";

        const actionBox = document.createElement("div");
        actionBox.style.cssText = "display:flex;align-items:center;justify-content:center;gap:4px;padding-top:2px;";

        const btnReset = document.createElement("button");
        btnReset.type = "button";
        btnReset.innerHTML = '<i class="fa-solid fa-rotate-left"></i> 원복';
        btnReset.title = "기본 수식 및 설정으로 원복";
        btnReset.style.cssText = "border:1px solid #cbd5e1;background:#f8fafc;color:#475569;cursor:pointer;font-size:11px;font-weight:700;padding:4px 7px;border-radius:5px;display:inline-flex;align-items:center;gap:3px;";
        btnReset.addEventListener("click", function () {
          const key = fieldKey(cat.id, tIdx, field.id);
          const def = defaults[key];
          if (def !== undefined) {
            input.value = def;
            input.style.background = "";
            input.style.borderColor = "var(--border-color)";
            if (heightInputs) {
              const rebuilt = tryBuildHeightTable(def);
              if (rebuilt) fillHeightInputsFrom(rebuilt);
            }
          }
          if (defaults[key + ":label"] !== undefined) {
            field.label = defaults[key + ":label"];
            nameInput.value = defaults[key + ":label"];
          }
        });

        // Copy button for ANY row item
        const btnCopyRow = document.createElement("button");
        btnCopyRow.type = "button";
        btnCopyRow.innerHTML = '<i class="fa-solid fa-copy"></i> 복사';
        btnCopyRow.title = "이 부품 항목의 수식, 품명 및 규격 부품코드를 동일하게 복사하여 새로운 항목으로 추가합니다.";
        btnCopyRow.style.cssText = "border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;cursor:pointer;font-size:11px;font-weight:700;padding:4px 7px;border-radius:5px;display:inline-flex;align-items:center;gap:3px;";
        btnCopyRow.addEventListener("click", function() {
          try {
            const currentLabel = (typeof nameInput !== "undefined" && nameInput) ? nameInput.value.trim() : (field.label || field.id);
            const currentFormula = (typeof input !== "undefined" && input) ? input.value.trim() : (field.get ? field.get() : "0");
            const currentLoc = (typeof locInput !== "undefined" && locInput) ? locInput.value.trim() : (typeof field.getLoc === "function" ? field.getLoc() : "");
            const currentRem = (typeof remInput !== "undefined" && remInput) ? remInput.value.trim() : (typeof field.getRemarks === "function" ? field.getRemarks() : "");
            const isExtOnlyChecked = (overrides && overrides["steelSkid::extOnly::" + field.id]) !== undefined 
              ? overrides["steelSkid::extOnly::" + field.id]
              : (field.isExtOnly || false);

            const newId = "row_custom_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            const newLabel = currentLabel + " (복사본)";

            let primaryPartNo = "";
            const partsObj = {};

            if (isSkidTable) {
              const subSpecsList = table.subSpecs || ["angle75", "channel125", "channel150"];
              subSpecsList.forEach(function(sKey) {
                let pVal = "";
                const pInput = tr.querySelector('.part-code-input[data-opt-key="' + sKey + '"]');
                if (pInput) {
                  pVal = pInput.value.trim();
                } else if (typeof field.getPartNoOption === "function") {
                  pVal = field.getPartNoOption(sKey) || "";
                } else if (field.parts && field.parts[sKey]) {
                  pVal = field.parts[sKey];
                } else if (field.parts) {
                  pVal = field.parts[sKey] || field.parts.angle75 || field.parts.channel125 || field.parts.channel150 || "";
                } else if (typeof field.getPartNo === "function") {
                  pVal = field.getPartNo() || "";
                }
                partsObj[sKey] = pVal;
                if (pVal && !primaryPartNo) primaryPartNo = pVal;
              });
              if (subSpecsList[0] && partsObj[subSpecsList[0]]) partsObj.angle75 = partsObj[subSpecsList[0]];
              if (subSpecsList[1] && partsObj[subSpecsList[1]]) partsObj.channel125 = partsObj[subSpecsList[1]];
              if (subSpecsList[2] && partsObj[subSpecsList[2]]) partsObj.channel150 = partsObj[subSpecsList[2]];
            } else {
              const pSingleInput = (typeof partNoInput !== "undefined" && partNoInput) ? partNoInput : tr.querySelector('.part-code-input');
              primaryPartNo = pSingleInput ? pSingleInput.value.trim() : (typeof field.getPartNo === "function" ? field.getPartNo() : "");
              if (table.specKey) partsObj[table.specKey] = primaryPartNo;
              partsObj.angle75 = primaryPartNo;
              partsObj.channel125 = primaryPartNo;
              partsObj.channel150 = primaryPartNo;
            }

            const newItem = {
              id: newId,
              name: newId,
              label: newLabel,
              formula: currentFormula || "0",
              isCustom: true,
              isExtOnly: isExtOnlyChecked,
              partNo: primaryPartNo,
              parts: partsObj
            };

            if (isExtOnlyChecked) {
              overrides["steelSkid::extOnly::" + newId] = true;
            }

            if (Array.isArray(table.sourceArray)) {
              const currentIdx = table.sourceArray.findIndex(function(item) { return (item.name || item.id) === field.id; });
              if (currentIdx !== -1) {
                table.sourceArray.splice(currentIdx + 1, 0, newItem);
              } else {
                table.sourceArray.push(newItem);
              }
            } else if (table.sourceDict) {
              table.sourceDict[newId] = currentFormula || "0";
            }

            if (table.partNumbersObj && primaryPartNo) {
              table.partNumbersObj[newId] = primaryPartNo;
            }

            const key = fieldKey(cat.id, tIdx, newId);
            defaults[key] = currentFormula || "0";
            overrides[key] = currentFormula || "0";
            if (newLabel) overrides[key + ":label"] = newLabel;
            if (primaryPartNo) overrides[key + ":partNo"] = primaryPartNo;
            if (currentLoc) overrides[key + ":loc"] = currentLoc;
            if (currentRem) overrides[key + ":rem"] = currentRem;

            // Track custom added row in overrides for persistence across reloads
            const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
            const customKey = subCatId + "::customRows";
            if (!Array.isArray(overrides[customKey])) overrides[customKey] = [];
            overrides[customKey].push(newItem);

            persist(dbRef);
            categories = buildCategories();
            renderTables(currentSearchValue());
            setStatus("부품 항목 '" + newLabel + "' 복사 추가 완료.", false);
          } catch (err) {
            console.error("[RowCopyError]", err);
            global.alert("복제 실패: " + err.message);
          }
        });

        // Delete button for ANY row item
        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i> 삭제';
        btnDel.title = "이 부품 항목 삭제";
        btnDel.style.cssText = "border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;cursor:pointer;font-size:11px;font-weight:700;padding:4px 7px;border-radius:5px;display:inline-flex;align-items:center;gap:3px;";
        btnDel.addEventListener("click", function () {
          const displayTitle = field.label ? (field.label + " [" + field.id + "]") : field.id;
          if (global.confirm("정말로 부품 항목 '" + displayTitle + "'을(를) 삭제하시겠습니까?")) {
            if (Array.isArray(table.sourceArray)) {
              const sIdx = table.sourceArray.findIndex(function(item) { return (item.name || item.id) === field.id; });
              if (sIdx !== -1) {
                table.sourceArray.splice(sIdx, 1);
              }
            } else if (table.sourceDict) {
              delete table.sourceDict[field.id];
            }

            // Track deleted items in overrides so deletion persists across reloads
            const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
            const deletedKey = subCatId + "::deletedRows";
            if (!Array.isArray(overrides[deletedKey])) overrides[deletedKey] = [];
            if (overrides[deletedKey].indexOf(field.id) === -1) {
              overrides[deletedKey].push(field.id);
            }

            const customKey = subCatId + "::customRows";
            if (Array.isArray(overrides[customKey])) {
              overrides[customKey] = overrides[customKey].filter(function(c) { return (c.name || c.id) !== field.id; });
            }

            const key = fieldKey(cat.id, tIdx, field.id);
            delete overrides[key];
            delete overrides[key + ":partNo"];
            delete overrides[key + ":loc"];
            delete overrides[key + ":rem"];
            delete overrides[key + ":label"];
            delete defaults[key];
            
            persist(dbRef);
            categories = buildCategories();
            renderTables(currentSearchValue());
            setStatus("부품 항목 '" + field.id + "' 삭제 완료.", false);
          }
        });

        actionBox.appendChild(btnReset);
        actionBox.appendChild(btnCopyRow);
        actionBox.appendChild(btnDel);
        tdManage.appendChild(actionBox);

        tr.appendChild(tdInput);
        tr.appendChild(tdManage);
        tbody.appendChild(tr);
      });

      tbl.appendChild(tbody);
      wrapper.appendChild(tbl);

      // Append "Add Variable / Part Item" control row for all supported tables
      if (table.allowAdd) {
        const addBar = document.createElement("div");
        addBar.style.cssText = "margin-top: 14px; background: #f0f9ff; border: 1.5px solid #38bdf8; border-radius: 10px; padding: 14px 16px; box-shadow: 0 2px 6px rgba(2,132,199,0.08);";
        
        const subSpecsList = isSkidTable ? (table.subSpecs || ["angle75", "channel125", "channel150"]) : [];
        const stdSkidTypes = isSkidTable ? subSpecsList.map(function(sKey, sIdx) {
          const sLabel = (overrides && overrides["steelSkid::tabLabel::" + sKey]) ||
            (sKey === "angle75" ? "75 Angle (75각)" : sKey === "channel125" ? "125 Channel (125채널)" : sKey === "channel150" ? "150 Channel (150채널)" : sKey);
          return { key: sKey, label: sLabel, idx: sIdx };
        }) : [];

        if (isSkidTable) {
          const skidInputsHtml = stdSkidTypes.map(function(st) {
            return `
              <div>
                <label style="font-size: 11px; font-weight: 700; color: #0284c7; margin-bottom: 3px; display: block;">${st.label} 부품코드</label>
                <input type="text" placeholder="예: 부품코드 입력" class="new-var-skid-${st.idx}" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #93c5fd; border-radius: 6px; outline: none; background: #fff;" />
              </div>
            `;
          }).join("");

          addBar.innerHTML = `
            <div style="font-weight: 800; font-size: 13px; color: #0284c7; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-plus-circle" style="font-size: 15px;"></i> ➕ 신규 스틸스키드 부품 항목 추가
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 10px;">
              <div>
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 3px; display: block;">항목/품명 (Description)</label>
                <input type="text" placeholder="예: 스틸스키드 보강 지지대" class="new-var-label" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; border: 1px solid #93c5fd; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              ${skidInputsHtml}
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;">
              <div style="flex: 2; min-width: 200px;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 3px; display: block;">계산 수식 (Formula)</label>
                <input type="text" placeholder="예: (W_C + L_F + 1) * 2" class="new-var-formula" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #93c5fd; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              <div style="flex: 1; min-width: 130px;">
                <label style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 3px; display: block;">항목 ID (선택)</label>
                <input type="text" placeholder="자동 생성" class="new-var-id" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              ${cat.id === "steelSkid" ? `
              <div style="flex: 1.2; min-width: 170px; display: flex; align-items: center; padding-bottom: 4px;">
                <label style="font-size: 11px; font-weight: 800; color: #0369a1; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: #e0f2fe; border: 1px solid #7dd3fc; padding: 5px 10px; border-radius: 6px; user-select: none;">
                  <input type="checkbox" class="new-var-ext-only" style="width: 15px; height: 15px; cursor: pointer; accent-color: #0284c7;" />
                  <span>🔵 외부보강(Ext. R/F) 전용 설정</span>
                </label>
              </div>
              ` : ''}
              <button type="button" class="btn-add-row" style="padding: 7px 18px; font-size: 12px; font-weight: 800; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(2,132,199,0.25);">
                <i class="fa-solid fa-plus"></i> 신규 항목 추가
              </button>
            </div>
          `;
        } else {
          addBar.innerHTML = `
            <div style="font-weight: 800; font-size: 13px; color: #0284c7; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-plus-circle" style="font-size: 15px;"></i> ➕ 신규 부품 항목 추가
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;">
              <div style="flex: 1.5; min-width: 160px;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 3px; display: block;">항목/품명 (Description)</label>
                <input type="text" placeholder="예: 하부 앵커 브라켓" class="new-var-label" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; border: 1px solid #93c5fd; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              <div style="flex: 1.2; min-width: 140px;">
                <label style="font-size: 11px; font-weight: 700; color: #0284c7; margin-bottom: 3px; display: block;">적용 부품코드 (Part No.)</label>
                <input type="text" placeholder="예: WFB-0450Z" class="new-var-partno" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #93c5fd; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              <div style="flex: 2; min-width: 180px;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 3px; display: block;">계산 수식 (Formula)</label>
                <input type="text" placeholder="예: (W_C + L_C) * 2" class="new-var-formula" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #93c5fd; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              <div style="flex: 1; min-width: 110px;">
                <label style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 3px; display: block;">항목 ID (선택)</label>
                <input type="text" placeholder="자동 생성" class="new-var-id" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; background: #fff;" />
              </div>
              ${cat.id === "steelSkid" ? `
              <div style="flex: 1.2; min-width: 170px; display: flex; align-items: center; padding-bottom: 4px;">
                <label style="font-size: 11px; font-weight: 800; color: #0369a1; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: #e0f2fe; border: 1px solid #7dd3fc; padding: 5px 10px; border-radius: 6px; user-select: none;">
                  <input type="checkbox" class="new-var-ext-only" style="width: 15px; height: 15px; cursor: pointer; accent-color: #0284c7;" />
                  <span>🔵 외부보강(Ext. R/F) 전용 설정</span>
                </label>
              </div>
              ` : ''}
              <button type="button" class="btn-add-row" style="padding: 7px 18px; font-size: 12px; font-weight: 800; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(2,132,199,0.25);">
                <i class="fa-solid fa-plus"></i> 신규 항목 추가
              </button>
            </div>
          `;
        }

        const inputLabel = addBar.querySelector(".new-var-label");
        const inputId = addBar.querySelector(".new-var-id");
        const inputFormula = addBar.querySelector(".new-var-formula");
        const inputExtOnly = addBar.querySelector(".new-var-ext-only");
        const btnAdd = addBar.querySelector(".btn-add-row");

        btnAdd.addEventListener("click", function() {
          let varId = (inputId ? inputId.value : "").trim();
          const labelStr = (inputLabel ? inputLabel.value : "").trim();
          const formulaStr = (inputFormula ? inputFormula.value : "").trim();
          const isExtOnlyChecked = inputExtOnly ? inputExtOnly.checked : false;
          let partNoStr = "";
          const partsObj = {};

          if (isSkidTable) {
            stdSkidTypes.forEach(function(st) {
              const el = addBar.querySelector(".new-var-skid-" + st.idx);
              const val = (el ? el.value : "").trim();
              partsObj[st.key] = val;
              if (val && !partNoStr) partNoStr = val;
            });
            if (stdSkidTypes[0] && partsObj[stdSkidTypes[0].key]) partsObj.angle75 = partsObj[stdSkidTypes[0].key];
            if (stdSkidTypes[1] && partsObj[stdSkidTypes[1].key]) partsObj.channel125 = partsObj[stdSkidTypes[1].key];
            if (stdSkidTypes[2] && partsObj[stdSkidTypes[2].key]) partsObj.channel150 = partsObj[stdSkidTypes[2].key];
          } else {
            const inputPartNo = addBar.querySelector(".new-var-partno");
            partNoStr = (inputPartNo ? inputPartNo.value : "").trim();
            if (table.specKey) partsObj[table.specKey] = partNoStr;
            partsObj.angle75 = partNoStr;
            partsObj.channel125 = partNoStr;
            partsObj.channel150 = partNoStr;
          }

          if (!varId && !labelStr) {
            global.alert("품명 또는 항목 ID를 입력해 주세요.");
            return;
          }
          if (!varId) {
            varId = "row_custom_" + Date.now();
          }
          if (!/^[a-zA-Z0-9_\-]+$/.test(varId)) {
            global.alert("항목 ID는 영문, 숫자, 언더바(_), 하이픈(-)만 사용 가능합니다.");
            return;
          }
          const key = fieldKey(cat.id, tIdx, varId);
          if (defaults[key] !== undefined || table.fields.some(function(f) { return f.id === varId; })) {
            global.alert("이미 존재하는 항목 ID입니다.");
            return;
          }

          const newItem = {
            id: varId,
            name: varId,
            label: labelStr || varId,
            formula: formulaStr || "0",
            isCustom: true,
            isExtOnly: isExtOnlyChecked,
            partNo: partNoStr,
            parts: isSkidTable ? partsObj : { angle75: partNoStr, channel125: partNoStr, channel150: partNoStr }
          };

          if (isExtOnlyChecked) {
            overrides["steelSkid::extOnly::" + varId] = true;
          }

          if (Array.isArray(table.sourceArray)) {
            table.sourceArray.push(newItem);
          } else if (table.sourceDict) {
            table.sourceDict[varId] = formulaStr || "0";
          }

          if (table.partNumbersObj && partNoStr) {
            table.partNumbersObj[varId] = partNoStr;
          }

          defaults[key] = formulaStr || "0";
          overrides[key] = formulaStr || "0";
          if (labelStr) overrides[key + ":label"] = labelStr;
          if (partNoStr) overrides[key + ":partNo"] = partNoStr;

          // Track custom added row in overrides for persistence across reloads
          const subCatId = (cat.id === "steelSkid" && table.specKey) ? ("steelSkid_" + table.specKey) : cat.id;
          const customKey = subCatId + "::customRows";
          if (!Array.isArray(overrides[customKey])) overrides[customKey] = [];
          overrides[customKey].push(newItem);

          const deletedKey = subCatId + "::deletedRows";
          if (Array.isArray(overrides[deletedKey])) {
            overrides[deletedKey] = overrides[deletedKey].filter(function(id) { return id !== varId; });
          }

          persist(dbRef);
          categories = buildCategories();
          renderTables(currentSearchValue());
          setStatus("신규 부품 항목 '" + (labelStr || varId) + "' 추가 완료.", false);
        });
        wrapper.appendChild(addBar);
      }

      container.appendChild(wrapper);
    });

    if (!container.children.length) {
      container.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:20px;text-align:center;">No search results found.</div>';
    }
  }

  function setStatus(msg, isError) {
    const el = document.getElementById("ruleEditorStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "var(--neon-rose)" : "var(--text-secondary)";
  }

  function currentSearchValue() {
    if (typeof document === "undefined") return "";
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
      if (input.classList.contains("part-code-input") || input.classList.contains("location-input") || input.classList.contains("remarks-input")) return;
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

    const partInputs = document.querySelectorAll('#ruleEditorTablesContainer input.part-code-input[data-cat-id="' + cat.id + '"]');
    partInputs.forEach(function (pInput) {
      const tIdx = parseInt(pInput.dataset.tableIdx, 10);
      const fieldId = pInput.dataset.fieldId;
      const table = cat.tables[tIdx];
      const field = table.fields.filter(function (f) { return f.id === fieldId; })[0];
      if (!field || typeof field.getPartNo !== "function") return;
      const newPartVal = pInput.value;
      if (newPartVal !== field.getPartNo()) {
        field.setPartNo(newPartVal);
        overrides[fieldKey(cat.id, tIdx, fieldId) + ":partNo"] = newPartVal;
        changedCount++;
      }
    });

    const locInputs = document.querySelectorAll('#ruleEditorTablesContainer input.location-input[data-cat-id="' + cat.id + '"]');
    locInputs.forEach(function (locIn) {
      const tIdx = parseInt(locIn.dataset.tableIdx, 10);
      const fieldId = locIn.dataset.fieldId;
      const table = cat.tables[tIdx];
      const field = table.fields.filter(function (f) { return f.id === fieldId; })[0];
      if (!field || typeof field.setLocation !== "function") return;
      const newLoc = locIn.value;
      if (newLoc !== field.getLocation()) {
        field.setLocation(newLoc);
        overrides[fieldKey(cat.id, tIdx, fieldId) + ":loc"] = newLoc;
        changedCount++;
      }
    });

    const remInputs = document.querySelectorAll('#ruleEditorTablesContainer input.remarks-input[data-cat-id="' + cat.id + '"]');
    remInputs.forEach(function (remIn) {
      const tIdx = parseInt(remIn.dataset.tableIdx, 10);
      const fieldId = remIn.dataset.fieldId;
      const table = cat.tables[tIdx];
      const field = table.fields.filter(function (f) { return f.id === fieldId; })[0];
      if (!field || typeof field.setRemarks !== "function") return;
      const newRem = remIn.value;
      if (newRem !== field.getRemarks()) {
        field.setRemarks(newRem);
        overrides[fieldKey(cat.id, tIdx, fieldId) + ":rem"] = newRem;
        changedCount++;
      }
    });

    if (syntaxErrors.length) {
      setStatus("Items not saved due to formula error: " + syntaxErrors.join(" / "), true);
    }
    if (changedCount > 0) {
      persist(dbRef);
      setStatus("Saved " + changedCount + " items. Click [Generate Default BOM from Config] to apply changes. (" + new Date().toLocaleTimeString("en-US") + ")", false);
    } else if (!syntaxErrors.length) {
      setStatus("No changes made.", false);
    }
    renderTables(currentSearchValue());
  }

  function resetCurrentCategory() {
    const cat = categories[currentCatIndex];
    if (!cat) return;
    if (!global.confirm('Restore all items in "' + cat.label + '" category to defaults and save?')) return;
    cat.tables.forEach(function (table, tIdx) {
      table.fields.forEach(function (field) {
        const key = fieldKey(cat.id, tIdx, field.id);
        if (defaults[key] !== undefined) {
          field.set(defaults[key]);
          delete overrides[key];
        }
        const partKey = key + ":partNo";
        if (typeof field.setPartNo === "function" && defaults[partKey] !== undefined) {
          field.setPartNo(defaults[partKey]);
          delete overrides[partKey];
        }
        const locKey = key + ":loc";
        if (typeof field.setLocation === "function" && defaults[locKey] !== undefined) {
          field.setLocation(defaults[locKey]);
          delete overrides[locKey];
        }
        const remKey = key + ":rem";
        if (typeof field.setRemarks === "function" && defaults[remKey] !== undefined) {
          field.setRemarks(defaults[remKey]);
          delete overrides[remKey];
        }
      });
    });
    persist(dbRef);
    setStatus('"' + cat.label + '" 카테고리를 기본값으로 초기화했습니다.', false);
    renderTables(currentSearchValue());
  }

  function updateSteelSkidSelectDropdown() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    const selList = document.querySelectorAll("#steelSkidOpt, select.steelSkidOpt, select[name='steelSkidOpt']");
    const activeTypes = getActiveSkidTypes();
    selList.forEach(function(sel) {
      const currentVal = sel.value;
      sel.innerHTML = '<option value="Default">Default (Auto)</option><option value="none">❌ None (스틸 스키드 미사용/출력 안 함)</option>';
      activeTypes.forEach(function(st) {
        const opt = document.createElement("option");
        opt.value = st.key;
        opt.textContent = st.label;
        sel.appendChild(opt);
      });
      if (currentVal) sel.value = currentVal;
    });
  }

  function openSkidTabCustomModal(opts) {
    if (typeof document === "undefined" || !document.body) {
      if (typeof opts.onConfirm === "function") opts.onConfirm(opts.defaultLabel || "New Spec", opts.defaultKey || "new_spec");
      return;
    }
    const existing = document.getElementById("skidTabActionModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "skidTabActionModal";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;";

    const card = document.createElement("div");
    card.style.cssText = "background:#ffffff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:92%;max-width:440px;padding:24px;box-sizing:border-box;border:1px solid #e2e8f0;position:relative;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:18px;border-bottom:1.5px solid #f1f5f9;padding-bottom:14px;";
    header.innerHTML = `
      <div style="width:42px;height:42px;border-radius:12px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 4px rgba(37,99,235,0.1);">
        <i class="fa-solid ${opts.icon || 'fa-layer-group'}"></i>
      </div>
      <div>
        <div style="font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">${opts.title}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">${opts.subtitle || '정보를 입력한 후 확정 버튼을 클릭해 주세요.'}</div>
      </div>
    `;
    card.appendChild(header);

    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;gap:14px;margin-bottom:22px;";

    const labelGroup = document.createElement("div");
    labelGroup.innerHTML = `
      <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:6px;">📌 탭 표시 명칭 (Tab Name)</label>
      <input type="text" id="skidModalTabLabel" value="${opts.defaultLabel || ''}" placeholder="예: 200mm Heavy I-Beam" style="width:100%;box-sizing:border-box;padding:10px 14px;font-size:13.5px;font-weight:600;border:1.5px solid #cbd5e1;border-radius:8px;outline:none;color:#0f172a;background:#fff;" />
    `;
    body.appendChild(labelGroup);

    card.appendChild(body);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.textContent = "취소";
    btnCancel.style.cssText = "padding:9px 18px;font-size:12.5px;font-weight:700;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#475569;cursor:pointer;";
    btnCancel.addEventListener("click", function() { overlay.remove(); });

    const btnConfirm = document.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.innerHTML = `<i class="fa-solid fa-check"></i> ${opts.confirmText || '확인 및 적용'}`;
    btnConfirm.style.cssText = "padding:9px 22px;font-size:12.5px;font-weight:800;border-radius:8px;border:none;background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);color:#ffffff;cursor:pointer;box-shadow:0 4px 6px -1px rgba(2,132,199,0.3);";

    btnConfirm.addEventListener("click", function() {
      const labelVal = document.getElementById("skidModalTabLabel").value.trim();
      if (!labelVal) {
        alert("유효한 탭 명칭을 입력해 주세요.");
        return;
      }
      overlay.remove();
      if (typeof opts.onConfirm === "function") {
        opts.onConfirm(labelVal);
      }
    });

    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const inputEl = document.getElementById("skidModalTabLabel");
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
      inputEl.addEventListener("keydown", function(e) {
        if (e.key === "Enter") btnConfirm.click();
        if (e.key === "Escape") overlay.remove();
      });
    }
  }

  function openSubSpecSelectModal() {
    if (typeof document === "undefined" || !document.body) return;
    const existing = document.getElementById("skidSubSpecSelectModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "skidSubSpecSelectModal";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;";

    const card = document.createElement("div");
    card.style.cssText = "background:#ffffff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:92%;max-width:440px;padding:24px;box-sizing:border-box;border:1px solid #e2e8f0;";

    const stdSkidTypes = [
      { key: "angle75", label: (overrides && overrides["steelSkid::tabLabel::angle75"]) || "75 Angle (75각)" },
      { key: "channel125", label: (overrides && overrides["steelSkid::tabLabel::channel125"]) || "125 Channel (125채널)" },
      { key: "channel150", label: (overrides && overrides["steelSkid::tabLabel::channel150"]) || "150 Channel (150채널)" },
      { key: "std", label: (overrides && overrides["steelSkid::tabLabel::std"]) || "75각 / 125채널 / 150채널 (통합 탭 제목)" }
    ];

    let listHtml = "";
    stdSkidTypes.forEach(function(item) {
      listHtml += `
        <button type="button" class="btn-subspec-choice" data-key="${item.key}" data-label="${item.label}" style="width:100%;text-align:left;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:10px;background:#f8fafc;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;transition:all 0.15s;">
          <span style="font-size:13px;font-weight:700;color:#0f172a;"><i class="fa-solid fa-pen-to-square" style="color:#2563eb;margin-right:8px;"></i> ${item.label}</span>
          <span style="font-size:12px;color:#2563eb;font-weight:800;">이름 변경 ➔</span>
        </button>
      `;
    });

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1.5px solid #f1f5f9;padding-bottom:12px;">
        <div style="font-size:16px;font-weight:800;color:#0f172a;">⚙️ 변경할 규격 선택</div>
        <button type="button" id="btnCloseChoiceModal" style="border:none;background:none;font-size:18px;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:12.5px;color:#64748b;margin-bottom:14px;">이름을 변경하고 싶은 세부 규격 또는 탭 제목을 선택해 주세요:</div>
      <div>${listHtml}</div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById("btnCloseChoiceModal").addEventListener("click", function() { overlay.remove(); });
    card.querySelectorAll(".btn-subspec-choice").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const key = btn.dataset.key;
        const label = btn.dataset.label;
        overlay.remove();
        renameSkidSpecTab(key, label);
      });
    });
  }

  function openSkidTabOrderAndEnableModal() {
    if (typeof document === "undefined" || !document.body) return;
    const existing = document.getElementById("skidTabOrderModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "skidTabOrderModal";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;";

    const card = document.createElement("div");
    card.style.cssText = "background:#ffffff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:92%;max-width:560px;max-height:85vh;padding:24px;box-sizing:border-box;border:1px solid #e2e8f0;display:flex;flex-direction:column;";

    const currentTabOrder = (overrides && overrides["steelSkid::tabOrder"]) || [];
    const disabledMap = (overrides && overrides["steelSkid::disabledTabs"]) || {};

    const skidCat = categories.find(function(c) { return c.id === "steelSkid"; });
    const allTables = skidCat ? skidCat.tables : [];

    let itemList = [];
    allTables.forEach(function(table) {
      if (table.isMultiSpec && table.subSpecs) {
        table.subSpecs.forEach(function(sKey) {
          const sLabel = (overrides && overrides["steelSkid::tabLabel::" + sKey]) || sKey;
          itemList.push({ key: sKey, label: sLabel, isSubSpec: true, parentKey: table.specKey, isDisabled: !!disabledMap[sKey] });
        });
      } else {
        const tLabel = (overrides && overrides["steelSkid::tabLabel::" + table.specKey]) || table.label;
        itemList.push({ key: table.specKey, label: tLabel, isSubSpec: false, parentKey: table.specKey, isDisabled: !!disabledMap[table.specKey] });
      }
    });

    if (Array.isArray(currentTabOrder) && currentTabOrder.length > 0) {
      itemList.sort(function(a, b) {
        let idxA = currentTabOrder.indexOf(a.key);
        let idxB = currentTabOrder.indexOf(b.key);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });
    }

    function renderModalItems() {
      const bodyContainer = card.querySelector("#skidOrderItemsContainer");
      if (!bodyContainer) return;
      bodyContainer.innerHTML = "";

      itemList.forEach(function(item, idx) {
        const itemRow = document.createElement("div");
        itemRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:8px;border:1.5px solid " + (item.isDisabled ? "#cbd5e1" : "#e2e8f0") + ";background:" + (item.isDisabled ? "#f1f5f9" : "#f8fafc") + ";border-radius:10px;opacity:" + (item.isDisabled ? "0.65" : "1") + ";transition:all 0.15s;";

        const leftInfo = document.createElement("div");
        leftInfo.style.cssText = "display:flex;align-items:center;gap:10px;";
        leftInfo.innerHTML = `
          <span style="font-size:12px;font-weight:800;color:#64748b;width:24px;">#${idx + 1}</span>
          <span style="font-size:13px;font-weight:700;color:${item.isDisabled ? '#64748b' : '#0f172a'};">
            ${item.isSubSpec ? '<i class="fa-solid fa-layer-group" style="color:#0284c7;margin-right:6px;"></i>' : '<i class="fa-solid fa-folder-tree" style="color:#2563eb;margin-right:6px;"></i>'}
            ${item.label} ${item.isDisabled ? '<span style="font-size:11px;color:#ef4444;font-weight:800;margin-left:6px;">[비활성]</span>' : ''}
          </span>
        `;

        const rightBtns = document.createElement("div");
        rightBtns.style.cssText = "display:flex;align-items:center;gap:6px;";

        const btnUp = document.createElement("button");
        btnUp.type = "button";
        btnUp.disabled = (idx === 0);
        btnUp.style.cssText = "border:1px solid #cbd5e1;background:#ffffff;color:#334155;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-weight:700;" + (idx === 0 ? "opacity:0.3;cursor:not-allowed;" : "");
        btnUp.innerHTML = '<i class="fa-solid fa-arrow-up"></i> 위로';
        btnUp.addEventListener("click", function() {
          if (idx > 0) {
            const temp = itemList[idx];
            itemList[idx] = itemList[idx - 1];
            itemList[idx - 1] = temp;
            renderModalItems();
          }
        });

        const btnDown = document.createElement("button");
        btnDown.type = "button";
        btnDown.disabled = (idx === itemList.length - 1);
        btnDown.style.cssText = "border:1px solid #cbd5e1;background:#ffffff;color:#334155;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-weight:700;" + (idx === itemList.length - 1 ? "opacity:0.3;cursor:not-allowed;" : "");
        btnDown.innerHTML = '<i class="fa-solid fa-arrow-down"></i> 아래로';
        btnDown.addEventListener("click", function() {
          if (idx < itemList.length - 1) {
            const temp = itemList[idx];
            itemList[idx] = itemList[idx + 1];
            itemList[idx + 1] = temp;
            renderModalItems();
          }
        });

        const btnToggleEnable = document.createElement("button");
        btnToggleEnable.type = "button";
        if (item.isDisabled) {
          btnToggleEnable.style.cssText = "border:1.5px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:800;";
          btnToggleEnable.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 비활성화 중';
        } else {
          btnToggleEnable.style.cssText = "border:1.5px solid #86efac;background:#f0fdf4;color:#16a34a;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:800;";
          btnToggleEnable.innerHTML = '<i class="fa-solid fa-circle-check"></i> 사용 중 (ON)';
        }
        btnToggleEnable.addEventListener("click", function() {
          item.isDisabled = !item.isDisabled;
          renderModalItems();
        });

        rightBtns.appendChild(btnUp);
        rightBtns.appendChild(btnDown);
        rightBtns.appendChild(btnToggleEnable);

        itemRow.appendChild(leftInfo);
        itemRow.appendChild(rightBtns);
        bodyContainer.appendChild(itemRow);
      });
    }

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1.5px solid #f1f5f9;padding-bottom:12px;">
        <div style="font-size:16px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-sliders" style="color:#2563eb;"></i> ⚙️ 탭 순서 & 사용(On/Off) 관리
        </div>
        <button type="button" id="btnCloseOrderModal" style="border:none;background:none;font-size:18px;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:14px;line-height:1.4;">
        스키드 규격의 표시 순서를 위/아래 버튼으로 조정하고, 사용하지 않는 규격은 <b>비활성화</b> 처리할 수 있습니다.<br>
        <span style="color:#2563eb;font-weight:700;">※ 지정한 순서와 사용 설정은 BOM Input (Skid Type) 드롭다운 선택창에 즉시 똑같이 반영됩니다.</span>
      </div>
      <div id="skidOrderItemsContainer" style="overflow-y:auto;max-height:45vh;padding-right:4px;margin-bottom:18px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1.5px solid #f1f5f9;padding-top:14px;">
        <button type="button" id="btnResetTabOrder" style="border:1px solid #cbd5e1;background:#f8fafc;color:#475569;font-weight:700;font-size:12px;padding:8px 14px;border-radius:8px;cursor:pointer;">🔄 순서 초기화</button>
        <div style="display:flex;gap:8px;">
          <button type="button" id="btnCancelTabOrder" style="border:1px solid #e2e8f0;background:#ffffff;color:#64748b;font-weight:700;font-size:12px;padding:8px 16px;border-radius:8px;cursor:pointer;">취소</button>
          <button type="button" id="btnSaveTabOrder" style="border:none;background:#2563eb;color:#ffffff;font-weight:800;font-size:12px;padding:8px 20px;border-radius:8px;cursor:pointer;box-shadow:0 2px 4px rgba(37,99,235,0.2);">💾 저장 및 적용</button>
        </div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    renderModalItems();

    document.getElementById("btnCloseOrderModal").addEventListener("click", function() { overlay.remove(); });
    document.getElementById("btnCancelTabOrder").addEventListener("click", function() { overlay.remove(); });

    document.getElementById("btnResetTabOrder").addEventListener("click", function() {
      if (global.confirm("탭 순서 및 사용 설정을 초기 상태로 리셋하시겠습니까?")) {
        delete overrides["steelSkid::tabOrder"];
        delete overrides["steelSkid::disabledTabs"];
        persist(dbRef);
        categories = buildCategories();
        applyOverridesObject(overrides);
        updateSteelSkidSelectDropdown();
        renderTables(currentSearchValue());
        overlay.remove();
        setStatus("탭 순서 및 사용 설정이 초기화되었습니다.", false);
      }
    });

    document.getElementById("btnSaveTabOrder").addEventListener("click", function() {
      const newOrder = itemList.map(function(it) { return it.key; });
      const newDisabledMap = {};
      itemList.forEach(function(it) {
        if (it.isDisabled) newDisabledMap[it.key] = true;
      });

      overrides["steelSkid::tabOrder"] = newOrder;
      overrides["steelSkid::disabledTabs"] = newDisabledMap;

      persist(dbRef);
      categories = buildCategories();
      applyOverridesObject(overrides);
      updateSteelSkidSelectDropdown();
      renderTables(currentSearchValue());
      overlay.remove();
      setStatus("탭 순서 및 사용 설정이 성공적으로 저장되었습니다. (BOM Input 반영 완료)", false);
    });
  }

  function renameSkidSpecTab(specKey, currentLabel) {
    openSkidTabCustomModal({
      title: "✏️ 규격/탭 명칭 변경하기",
      subtitle: "선택된 규격의 표시 명칭을 변경합니다. BOM Input(Skid Type) 선택창에 즉시 업데이트됩니다.",
      icon: "fa-pen-to-square",
      defaultLabel: currentLabel,
      confirmText: "이름 변경 저장",
      onConfirm: function(cleanLabel) {
        overrides["steelSkid::tabLabel::" + specKey] = cleanLabel;

        if (Array.isArray(overrides["steelSkid::customTypes"])) {
          const item = overrides["steelSkid::customTypes"].find(function(t) { return t.key === specKey; });
          if (item) item.label = cleanLabel;
        }
        if (Array.isArray(overrides["steelSkid::customSpecTables"])) {
          const item = overrides["steelSkid::customSpecTables"].find(function(t) { return t.key === specKey; });
          if (item) item.label = cleanLabel;
        }

        persist(dbRef);
        updateSteelSkidSelectDropdown();

        categories = buildCategories();
        renderTables(currentSearchValue());
        setStatus("규격 명칭이 '" + cleanLabel + "'(으)로 변경되었습니다. BOM Input 선택창(Skid Type)에 즉시 반영되었습니다.", false);
      }
    });
  }

  function copySkidSpecTab(sourceKey, sourceLabel) {
    const AR = global.AccessoriesRules || (typeof window !== "undefined" ? window.AccessoriesRules : null);
    const defaultNewName = sourceLabel + " (복사본)";

    openSkidTabCustomModal({
      title: "📋 스키드 규격 탭 복사하기",
      subtitle: "'" + sourceLabel + "' 탭의 모든 품명, 부품코드, 계산수식을 복사하여 새로운 탭을 만듭니다.",
      icon: "fa-copy",
      defaultLabel: defaultNewName,
      confirmText: "복사 및 탭 생성",
      onConfirm: function(cleanLabel) {
        const cleanKey = sourceKey + "_copy_" + Date.now().toString(36);

        if (!Array.isArray(overrides["steelSkid::customSpecTables"])) {
          overrides["steelSkid::customSpecTables"] = [];
        }

        const skidCatSource = categories ? categories.find(function(c) { return c.id === "steelSkid"; }) : null;
        const sourceTable = skidCatSource && skidCatSource.tables ? skidCatSource.tables.find(function(t) { return t.specKey === sourceKey; }) : null;
        const sourceSubKeys = (sourceTable && sourceTable.subSpecs) ? sourceTable.subSpecs : ["angle75", "channel125", "channel150"];

        const rawSourceRows = (AR && AR.steelSkidDetailed && typeof AR.steelSkidDetailed.getSpecRows === "function")
          ? AR.steelSkidDetailed.getSpecRows(sourceKey)
          : [];
        const sourceRows = applyCustomAndDeletedRows("steelSkid_" + sourceKey, rawSourceRows);

        const sourceIsMulti = (sourceKey === "std" || sourceKey.startsWith("std_copy_"));

        let subSpecs = null;
        if (sourceIsMulti) {
          const s1 = cleanKey + "_s1";
          const s2 = cleanKey + "_s2";
          const s3 = cleanKey + "_s3";
          subSpecs = [s1, s2, s3];

          const origLabel1 = (overrides["steelSkid::tabLabel::" + sourceSubKeys[0]] || "75 Angle (75각)");
          const origLabel2 = (overrides["steelSkid::tabLabel::" + sourceSubKeys[1]] || "125 Channel (125채널)");
          const origLabel3 = (overrides["steelSkid::tabLabel::" + sourceSubKeys[2]] || "150 Channel (150채널)");

          const s1Label = origLabel1.includes("(복사본)") ? origLabel1 : (origLabel1 + " (복사본)");
          const s2Label = origLabel2.includes("(복사본)") ? origLabel2 : (origLabel2 + " (복사본)");
          const s3Label = origLabel3.includes("(복사본)") ? origLabel3 : (origLabel3 + " (복사본)");

          overrides["steelSkid::tabLabel::" + s1] = s1Label;
          overrides["steelSkid::tabLabel::" + s2] = s2Label;
          overrides["steelSkid::tabLabel::" + s3] = s3Label;
          overrides["steelSkid::subSpecs::" + cleanKey] = subSpecs;
        }

        const copiedRows = sourceRows.map(function(item, idx) {
          const origId = item.name || item.id || ("row_" + idx);
          const newId = origId + "_" + cleanKey;
          const copyObj = {
            id: newId,
            label: item.label || item.name || origId,
            formula: item.formula || "",
            loc: item.loc || "",
            rem: item.rem || "",
            isCustom: true
          };

          if (sourceIsMulti && subSpecs) {
            const s1 = subSpecs[0];
            const s2 = subSpecs[1];
            const s3 = subSpecs[2];

            const srcK1 = sourceSubKeys[0] || "angle75";
            const srcK2 = sourceSubKeys[1] || "channel125";
            const srcK3 = sourceSubKeys[2] || "channel150";

            const p1 = (item.parts && (item.parts[srcK1] || item.parts.angle75)) || item.partNo || "";
            const p2 = (item.parts && (item.parts[srcK2] || item.parts.channel125)) || item.partNo || "";
            const p3 = (item.parts && (item.parts[srcK3] || item.parts.channel150)) || item.partNo || "";

            copyObj.parts = {};
            copyObj.parts[s1] = p1;
            copyObj.parts[s2] = p2;
            copyObj.parts[s3] = p3;
          } else {
            if (item.parts) {
              copyObj.parts = JSON.parse(JSON.stringify(item.parts));
              // The copy is a new tab keyed by cleanKey, but `parts` still only
              // answers for the SOURCE key. Both the editor and the BOM engine
              // look the selected spec up by key, so leaving it unset renders an
              // empty part box here and falls through to the angle75 entry when
              // building a BOM. Seed the new key from the source's own value.
              const srcVal = item.parts[sourceKey] || item.partNo || "";
              if (srcVal) copyObj.parts[cleanKey] = srcVal;
            }
            if (item.partNo) {
              copyObj.partNo = item.partNo;
            } else if (!copyObj.parts) {
              copyObj.partNo = item.partNo || (item.parts ? (item.parts[sourceKey] || item.parts.angle75 || "") : "");
            }
          }
          return copyObj;
        });

        if (AR && !AR.steelSkidDetailed) AR.steelSkidDetailed = {};
        if (AR && AR.steelSkidDetailed) AR.steelSkidDetailed[cleanKey + "Rows"] = copiedRows;

        overrides["steelSkid::customSpecTables"].push({ key: cleanKey, label: cleanLabel, isMultiSpec: sourceIsMulti, subSpecs: subSpecs });
        if (!Array.isArray(overrides["steelSkid::customTypes"])) overrides["steelSkid::customTypes"] = [];
        if (!overrides["steelSkid::customTypes"].some(function(t) { return t.key === cleanKey; })) {
          overrides["steelSkid::customTypes"].push({ key: cleanKey, label: cleanLabel });
        }
        overrides["steelSkid_" + cleanKey + "::customRows"] = copiedRows;

        persist(dbRef);
        updateSteelSkidSelectDropdown();

        categories = buildCategories();
        const skidCat = categories.find(function(c) { return c.id === "steelSkid"; });
        if (skidCat && skidCat.tables) {
          const newIdx = skidCat.tables.findIndex(function(t) { return t.specKey === cleanKey; });
          if (newIdx !== -1) {
            global._activeSkidSubTabIdx = newIdx;
          }
        }

        renderTables(currentSearchValue());
        setStatus("'" + sourceLabel + "' 탭을 복사하여 신규 탭 '" + cleanLabel + "' (" + cleanKey + ")을 성공적으로 생성했습니다. (" + copiedRows.length + "개 항목 복사됨)", false);
      }
    });
  }

  function deleteCustomSkidSpecTab(specKey, specLabel) {
    const AR = global.AccessoriesRules || (typeof window !== "undefined" ? window.AccessoriesRules : null);
    if (!global.confirm("정말로 커스텀 탭 '" + specLabel + "' (" + specKey + ")을 삭제하시겠습니까? 관련 부품 및 수식 설정이 모두 삭제됩니다.")) return;

    if (Array.isArray(overrides["steelSkid::customSpecTables"])) {
      overrides["steelSkid::customSpecTables"] = overrides["steelSkid::customSpecTables"].filter(function(t) { return t.key !== specKey; });
    }
    if (Array.isArray(overrides["steelSkid::customTypes"])) {
      overrides["steelSkid::customTypes"] = overrides["steelSkid::customTypes"].filter(function(t) { return t.key !== specKey; });
    }
    delete overrides["steelSkid_" + specKey + "::customRows"];
    delete overrides["steelSkid_" + specKey + "::deletedRows"];
    if (AR && AR.steelSkidDetailed) {
      delete AR.steelSkidDetailed[specKey + "Rows"];
    }

    persist(dbRef);
    updateSteelSkidSelectDropdown();

    categories = buildCategories();
    global._activeSkidSubTabIdx = 0;
    renderTables(currentSearchValue());
    setStatus("커스텀 탭 '" + specLabel + "' 삭제가 완료되었습니다.", false);
  }

  function openAddCustomSkidSpecDialog() {
    openSkidTabCustomModal({
      title: "✨ 신규 스키드 규격 탭 추가",
      subtitle: "새로운 스키드 규격 탭의 표시 명칭을 입력해 주세요.",
      icon: "fa-plus",
      defaultLabel: "",
      confirmText: "신규 탭 생성",
      onConfirm: function(cleanLabel) {
        const cleanKey = "skid_custom_" + Date.now().toString(36);
        
        if (!Array.isArray(overrides["steelSkid::customSpecTables"])) {
          overrides["steelSkid::customSpecTables"] = [];
        }
        overrides["steelSkid::customSpecTables"].push({ key: cleanKey, label: cleanLabel });

        if (!Array.isArray(overrides["steelSkid::customTypes"])) {
          overrides["steelSkid::customTypes"] = [];
        }
        if (!overrides["steelSkid::customTypes"].some(function(t) { return t.key === cleanKey; })) {
          overrides["steelSkid::customTypes"].push({ key: cleanKey, label: cleanLabel });
        }

        persist(dbRef);
        updateSteelSkidSelectDropdown();
        
        categories = buildCategories();
        const skidCat = categories.find(function(c) { return c.id === "steelSkid"; });
        if (skidCat && skidCat.tables) {
          global._activeSkidSubTabIdx = skidCat.tables.length - 1;
        }
        renderTables(currentSearchValue());
        setStatus("신규 스키드 규격 탭 '" + cleanLabel + "' (" + cleanKey + ") 추가 완료.", false);
      }
    });
  }

  function openAddSkidTypeDialog() {
    openAddCustomSkidSpecDialog();
  }

  function wireUpUI() {
    const sel = document.getElementById("ruleEditorCategorySelect");
    const search = document.getElementById("ruleEditorSearchInput");
    const btnSave = document.getElementById("btnRuleEditorSaveCategory");
    const btnReset = document.getElementById("btnRuleEditorResetCategory");
    if (!sel || !btnSave || !btnReset || !search) return; // tab not present on this page

    renderCategorySelect();
    renderTables("");

    const btnOpenMasterSubWin = document.getElementById("btnOpenMasterSubWin");
    if (btnOpenMasterSubWin) {
      btnOpenMasterSubWin.addEventListener("click", function () {
        openMasterPickerSubWindow(null, null, null);
      });
    }

    const btnAddCustomSkidType = document.getElementById("btnAddCustomSkidType");
    if (btnAddCustomSkidType) {
      btnAddCustomSkidType.addEventListener("click", openAddSkidTypeDialog);
    }

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
    categories = buildCategories();
    if (defaults && Object.keys(defaults).length === 0) {
      defaults = snapshotDefaults();
    }
    applyOverridesObject(overrides);
    wireUpUI();
    if (dbRef) {
      syncFromFirestore(dbRef).then(function () {
        renderTables(currentSearchValue());
      });
    }
  }

  function gotoCategory(catId, searchText) {
    categories = buildCategories();
    applyOverridesObject(overrides);
    const idx = categories.findIndex(function (c) { return c.id === catId; });
    if (idx === -1) return false;
    if (categories[idx].hidden) return false;
    currentCatIndex = idx;
    const sel = document.getElementById("ruleEditorCategorySelect");
    if (sel) sel.value = String(idx);
    const search = document.getElementById("ruleEditorSearchInput");
    if (search) search.value = searchText || "";
    setStatus("");
    renderTables(search ? search.value : "");
    return true;
  }

  // ===========================================================================
  // Public single-field API -- lets OTHER tabs (e.g. the Bolt Logic & Audit
  // "Calculation Audit Sheet") edit one formula field directly, through the
  // exact same engine this tab uses: same overrides store (localStorage key
  // + Firestore doc), same "defaults" snapshot for reset, same
  // RuleEngine.tokenize() syntax validation before a change is accepted. This
  // keeps every formula editor in the app -- this tab's own table AND any
  // other tab that embeds a field editor -- reading/writing the SAME source
  // of truth, so an edit made from either place is immediately visible in
  // both (no separate storage key, no drift).
  // ===========================================================================
  function findField(catId, tIdx, fieldId) {
    const cat = categories.filter(function (c) { return c.id === catId; })[0];
    if (!cat) return null;
    const table = cat.tables[tIdx];
    if (!table) return null;
    return table.fields.filter(function (f) { return f.id === fieldId; })[0] || null;
  }

  function getFieldInfo(catId, tIdx, fieldId) {
    const field = findField(catId, tIdx, fieldId);
    if (!field) return null;
    const key = fieldKey(catId, tIdx, fieldId);
    const value = field.get();
    return {
      value: value,
      default: defaults[key],
      isModified: defaults[key] !== undefined && defaults[key] !== value
    };
  }

  function setFieldFormula(catId, tIdx, fieldId, newVal) {
    const field = findField(catId, tIdx, fieldId);
    if (!field) return { ok: false, error: "필드를 찾을 수 없습니다." };
    if (newVal === field.get()) return { ok: true, changed: false };
    try {
      if (global.RuleEngine) global.RuleEngine.tokenize(newVal);
    } catch (e) {
      return { ok: false, error: e.message };
    }
    field.set(newVal);
    overrides[fieldKey(catId, tIdx, fieldId)] = newVal;
    persist(dbRef);
    return { ok: true, changed: true, value: newVal };
  }

  function resetFieldFormula(catId, tIdx, fieldId) {
    const key = fieldKey(catId, tIdx, fieldId);
    const field = findField(catId, tIdx, fieldId);
    if (!field || defaults[key] === undefined) return { ok: false };
    field.set(defaults[key]);
    delete overrides[key];
    persist(dbRef);
    return { ok: true, value: defaults[key] };
  }

  function deleteFieldFormula(catId, tIdx, fieldId) {
    return setFieldFormula(catId, tIdx, fieldId, "0");
  }

  function switchSkidSubTab(specKeyOrIdx, updateUrl) {
    if (updateUrl === undefined) updateUrl = true;
    categories = buildCategories();
    const skidCat = categories.find(function(c) { return c.id === "steelSkid"; });
    if (!skidCat || !skidCat.tables || skidCat.tables.length === 0) return false;

    let targetIdx = -1;
    const targetStr = String(specKeyOrIdx || "").toLowerCase().trim();

    skidCat.tables.forEach(function(t, idx) {
      if (targetIdx !== -1) return;
      if (t.specKey && String(t.specKey).toLowerCase().trim() === targetStr) {
        targetIdx = idx;
      }
    });

    if (targetIdx === -1) {
      skidCat.tables.forEach(function(t, idx) {
        if (targetIdx !== -1) return;
        const cleanL = String(t.label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanT = targetStr.replace(/[^a-z0-9]/g, "");
        if (cleanL === cleanT || (cleanT && cleanL.includes(cleanT))) {
          targetIdx = idx;
        }
      });
    }

    if (targetIdx === -1 && !isNaN(parseInt(targetStr, 10))) {
      const parsed = parseInt(targetStr, 10);
      if (parsed >= 0 && parsed < skidCat.tables.length) {
        targetIdx = parsed;
      }
    }

    if (targetIdx !== -1) {
      global._activeSkidSubTabIdx = targetIdx;
      const targetTable = skidCat.tables[targetIdx];
      if (updateUrl && targetTable && targetTable.specKey) {
        const cleanHash = "steel-skid-logic/" + targetTable.specKey;
        if (typeof window !== "undefined" && window.history && window.history.replaceState) {
          window.history.replaceState(null, "", "#" + cleanHash);
        } else if (typeof window !== "undefined") {
          window.location.hash = cleanHash;
        }
      }
      renderTables(currentSearchValue());
      return true;
    }
    return false;
  }

  function getActiveSkidSpecKey() {
    categories = buildCategories();
    const skidCat = categories.find(function(c) { return c.id === "steelSkid"; });
    if (!skidCat || !skidCat.tables || skidCat.tables.length === 0) return "std";
    const activeIdx = global._activeSkidSubTabIdx || 0;
    const table = skidCat.tables[activeIdx] || skidCat.tables[0];
    return table ? (table.specKey || "std") : "std";
  }

  global.RuleEditorUI = {
    init: init,
    gotoCategory: gotoCategory,
    getFieldInfo: getFieldInfo,
    setFieldFormula: setFieldFormula,
    resetFieldFormula: resetFieldFormula,
    deleteFieldFormula: deleteFieldFormula,
    copySkidSpecTab: copySkidSpecTab,
    renameSkidSpecTab: renameSkidSpecTab,
    deleteCustomSkidSpecTab: deleteCustomSkidSpecTab,
    getActiveSkidTypes: getActiveSkidTypes,
    switchSkidSubTab: switchSkidSubTab,
    getActiveSkidSpecKey: getActiveSkidSpecKey,
    getCategories: function () { return categories; },
    // Per-height decomposition, exposed so the STEEL ACCESSORIES tab can edit
    // the term for ONE height grade without touching the other eight. Same
    // engine the "높이별로 편집" toggle in this file uses -- there is no second
    // implementation. tryBuildHeightTable() returns null when the formula
    // cannot be split safely, in which case callers must fall back to raw
    // whole-formula editing.
    heightList: function () { return HEIGHT_LIST.slice(); },
    tryBuildHeightTable: tryBuildHeightTable,
    reconstructFormula: reconstructFormula
  };
  RuleEditorUI.getOverrides = function () { return overrides; };
  RuleEditorUI.applyCustomAndDeletedRows = applyCustomAndDeletedRows;

  if (typeof window !== "undefined") {
    window.applyCustomAndDeletedRows = applyCustomAndDeletedRows;
    window.getRuleOverrides = function () { return overrides; };
  }
  if (typeof globalThis !== "undefined") {
    globalThis.applyCustomAndDeletedRows = applyCustomAndDeletedRows;
    globalThis.getRuleOverrides = function () { return overrides; };
  }
  if (typeof global !== "undefined") {
    global.applyCustomAndDeletedRows = applyCustomAndDeletedRows;
    global.getRuleOverrides = function () { return overrides; };
  }

})(typeof window !== "undefined" ? window : globalThis);
