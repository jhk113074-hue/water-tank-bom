// =============================================================================
// WATANI GRP Water Tank -- Accessories/Capacity Engine (JavaScript, water-tank-bom app)
// =============================================================================
// This file is now a thin INTERPRETER: all coefficients/thresholds/formulas
// live in accessories_rules.js (edit that file, not this one, to change how
// quantities are calculated). This file only:
//   1. Builds the "scope" (named variables) from a PanelEngine geometry object
//   2. Hands the relevant rule set + scope to rule_engine.js to evaluate
//   3. Wraps the numeric result into a BOM-friendly return shape
//
// See accessories_rules.js for verification status / provenance notes. This
// rule-based rewrite was cross-validated against the previous hard-coded
// implementation across 882 (reinforcing/bolts/tie-rod) + 315 (capacity/air
// vent/roof supporter/steel skid) geometry combinations, with zero
// differences.
// =============================================================================
(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./rule_engine.js"), require("./accessories_rules.js"));
  } else {
    const root = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : global);
    const engine = factory(
      root.RuleEngine || (typeof global !== "undefined" ? global.RuleEngine : undefined),
      root.AccessoriesRules || (typeof global !== "undefined" ? global.AccessoriesRules : undefined)
    );
    root.AccessoriesEngine = engine;
    if (typeof window !== "undefined") window.AccessoriesEngine = engine;
    if (typeof globalThis !== "undefined") globalThis.AccessoriesEngine = engine;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (RuleEngine, Rules) {
  "use strict";

  if (!RuleEngine) throw new Error("accessories_engine.js requires rule_engine.js to be loaded first.");
  if (!Rules) throw new Error("accessories_engine.js requires accessories_rules.js to be loaded first.");

  function nominalCapaM3(W, Ltotal, H) {
    return RuleEngine.evaluate(Rules.capacity.nominalFormula, { W, Ltotal, H });
  }

  function actualCapaM3(W, Ltotal, H) {
    return RuleEngine.evaluate(Rules.capacity.actualFormula, { W, Ltotal, H });
  }

  function totalSurfaceAreaSqm(W, Ltotal, H, N_PA) {
    return RuleEngine.evaluate(Rules.capacity.surfaceAreaFormula, { W, Ltotal, H, N_PA });
  }

  function airVent(W_C, Lc_list, nominalCapa) {
    const qty = Lc_list.reduce((sum, Lc) => sum + RuleEngine.evaluate(Rules.airVent.perCompartmentFormula, { W_C, Lc }), 0);
    const row = Rules.airVent.partTable.find(r => r.maxCapa === undefined || nominalCapa < r.maxCapa);
    return { partNo: row.partNo, qty };
  }

  function roofSupporter(g) {
    const W_C = g.W.whole, W_F = g.W.half;
    const term = (Lc, Lf) => RuleEngine.evaluate(Rules.roofSupporter.termFormula, { W_C, W_F, Lc, Lf });
    const t1 = term(g.L1.whole, g.L1.half);
    const t2 = g.L2.value > 0 ? term(g.L2.whole, g.L2.half) : 0;
    const t3 = g.L3.value > 0 ? term(g.L3.whole, g.L3.half) : 0;
    const t4 = g.L4.value > 0 ? term(g.L4.whole, g.L4.half) : 0;
    const qty = Math.ceil(t1 + t2) + t3 + t4;
    const partNo = `${Rules.roofSupporter.partNoPrefix}${g.H.value * 1000}${Rules.roofSupporter.partNoSuffix}`;
    return { partNo, qty };
  }

  function steelSkidTotalLength(W, W_C, W_F, Ltotal, N_PA) {
    const n_pa = typeof N_PA === "number" ? N_PA : 0;
    const scope = { W, W_C, W_F, Ltotal, N_PA: n_pa };
    const b42 = RuleEngine.evaluate(Rules.steelSkid.b42Formula, scope);
    const b43 = RuleEngine.evaluate(Rules.steelSkid.b43Formula, scope);
    const b44 = RuleEngine.evaluate(Rules.steelSkid.b44Formula, scope);
    return b42 + b43 + b44;
  }

  // Real-part breakdown for the Steel Skid frame (see accessories_rules.js
  // steelSkid.mainRailByHeight/heightBracket for provenance). `g` is a
  // PanelEngine geometry object; `totalLengthOverride`, if given (> 0), is
  // used as the skid total length instead of recomputing it -- this lets the
  // app's existing manual/overridable "Skid Length" field keep working while
  // the part-number selection still tracks the real tank height.
  function steelSkidParts(g, totalLengthOverride) {
    const W = g.W.value, W_C = g.W.whole, W_F = g.W.half;
    const H_O = g.H.value;
    const L_O_C = g.L_C_sum, L_O_F = g.L_F_sum;
    const Ltotal = g.L1.value + g.L2.value + g.L3.value + g.L4.value;
    const totalLength = (typeof totalLengthOverride === "number" && totalLengthOverride > 0)
      ? totalLengthOverride
      : steelSkidTotalLength(W, W_C, W_F, Ltotal);

    const rail = Rules.steelSkid.mainRailByHeight.find(r => H_O <= r.maxH);
    const parts = [{ partNo: rail.partNo, label: rail.label, qty: totalLength, unit: "M" }];

    if (H_O >= 2.5) {
      const bracket = Rules.steelSkid.heightBracket.rows.find(r => H_O <= r.maxH);
      const qty = RuleEngine.evaluate(Rules.steelSkid.heightBracket.qtyFormula, { L_O_C, L_O_F, W_C, W_F });
      parts.push({ partNo: bracket.partNo, label: "Skid corner/height bracket (WFF-125xxZ)", qty: Math.round(qty), unit: "PCS" });
    }
    return parts;
  }

  // Real part-number breakdown for the ACTUAL Steel Skid catalog (three
  // parallel families: 75mm Angle / 125mm Channel / 150mm Channel-Heavy --
  // see accessories_rules.js steelSkidDetailed for full provenance and the
  // verified scenario). `skidType` is one of "angle75"/"channel125"/
  // "channel150" (see Rules.steelSkidDetailed.typeOptions); defaults to
  // "angle75" for any unrecognized value.
  function getTableIdxForSkidType(skidType, overridesStore) {
    var skidTables = [
      { specKey: "std", subSpecs: ["angle75", "channel125", "channel150", "std"] },
      { specKey: "ibeam", subSpecs: ["ibeam"] },
      { specKey: "sqp", subSpecs: ["sqp", "sq"] }
    ];

    var customSpecTables = (overridesStore && overridesStore["steelSkid::customSpecTables"]) || [];
    if (Array.isArray(customSpecTables)) {
      customSpecTables.forEach(function(cs) {
        if (!cs || !cs.key) return;
        var isMulti = cs.isMultiSpec !== undefined ? cs.isMultiSpec : (cs.key === "std" || cs.key.startsWith("std_copy_"));
        var subSpecs = (overridesStore && overridesStore["steelSkid::subSpecs::" + cs.key]) || cs.subSpecs || (isMulti ? [cs.key + "_s1", cs.key + "_s2", cs.key + "_s3"] : [cs.key]);
        skidTables.push({
          specKey: cs.key,
          subSpecs: subSpecs
        });
      });
    }

    var tabOrder = (overridesStore && overridesStore["steelSkid::tabOrder"]) || [];
    if (Array.isArray(tabOrder) && tabOrder.length > 0) {
      skidTables.sort(function(a, b) {
        var idxA = tabOrder.indexOf(a.specKey);
        var idxB = tabOrder.indexOf(b.specKey);
        if (idxA === -1 && a.subSpecs) {
          for (var i = 0; i < a.subSpecs.length; i++) {
            var pos = tabOrder.indexOf(a.subSpecs[i]);
            if (pos !== -1) { idxA = pos; break; }
          }
        }
        if (idxB === -1 && b.subSpecs) {
          for (var j = 0; j < b.subSpecs.length; j++) {
            var posB = tabOrder.indexOf(b.subSpecs[j]);
            if (posB !== -1) { idxB = posB; break; }
          }
        }
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });
    }

    for (var k = 0; k < skidTables.length; k++) {
      var tbl = skidTables[k];
      if (tbl.specKey === skidType) return k;
      if (tbl.subSpecs && tbl.subSpecs.indexOf(skidType) !== -1) return k;
    }
    return 0;
  }

  function steelSkidDetailedParts(g, skidType, isExtReinf = false) {
    const type = skidType || "angle75";
    const W_C = g.W.whole, W_F = g.W.half, W_O = g.W.value;
    const L1_C = g.L1.whole, L1_F = g.L1.half, L1_O = g.L1.value;
    const L2_C = g.L2.whole, L2_F = g.L2.half, L2_O = g.L2.value;
    const L3_C = g.L3.whole, L3_F = g.L3.half, L3_O = g.L3.value;
    const L4_C = g.L4.whole, L4_F = g.L4.half, L4_O = g.L4.value;
    const H_O = g.H.value;
    const L_O = g.L1.value + g.L2.value + g.L3.value + g.L4.value;
    const L_O_C = g.L_C_sum, L_O_F = g.L_F_sum;
    let fullScope = {
      W_C, W_F, W_O, L1_C, L1_F, L1_O, L2_C, L2_F, L2_O, L3_C, L3_F, L3_O,
      L4_C, L4_F, L4_O, H_O, L_O, L_O_C, L_O_F,
    };
    if (Rules && Rules.steelSkidDetailed && Rules.steelSkidDetailed.intermediates) {
      fullScope = RuleEngine.withIntermediates(Rules.steelSkidDetailed.intermediates, fullScope);
    }

    const byPart = {};
    const detail = [];

    let parentKey = type;
    if (type.includes("_s1") || type.includes("_s2") || type.includes("_s3")) {
      parentKey = type.replace(/_s[123]$/, "");
    }

    let subCatId = "steelSkid_" + type;
    if (type === "angle75" || type === "channel125" || type === "channel150" || type === "std") {
      subCatId = "steelSkid_std";
    } else if (type === "ibeam") {
      subCatId = "steelSkid_ibeam";
    } else if (type === "sqp" || type === "sq") {
      subCatId = "steelSkid_sqp";
    }

    let baseRows = [];
    if (Rules.steelSkidDetailed && Rules.steelSkidDetailed[type + "Rows"]) {
      baseRows = Rules.steelSkidDetailed[type + "Rows"];
    } else if (Rules.steelSkidDetailed && Rules.steelSkidDetailed[parentKey + "Rows"]) {
      baseRows = Rules.steelSkidDetailed[parentKey + "Rows"];
    } else if (subCatId === "steelSkid_ibeam") {
      baseRows = Rules.steelSkidDetailed.ibeamRows || [];
    } else if (subCatId === "steelSkid_sqp") {
      baseRows = Rules.steelSkidDetailed.sqpRows || [];
    } else {
      baseRows = Rules.steelSkidDetailed.rows || [];
    }

    function getApplyCustomAndDeletedRowsFn() {
      if (typeof applyCustomAndDeletedRows === "function") return applyCustomAndDeletedRows;
      if (typeof globalThis !== "undefined" && typeof globalThis.applyCustomAndDeletedRows === "function") return globalThis.applyCustomAndDeletedRows;
      if (typeof window !== "undefined" && typeof window.applyCustomAndDeletedRows === "function") return window.applyCustomAndDeletedRows;
      if (typeof globalThis !== "undefined" && globalThis.RuleEditorUI && typeof globalThis.RuleEditorUI.applyCustomAndDeletedRows === "function") return globalThis.RuleEditorUI.applyCustomAndDeletedRows;
      return null;
    }

    const applyCustomRowsFn = getApplyCustomAndDeletedRowsFn();
    let targetRows = (typeof applyCustomRowsFn === "function")
      ? applyCustomRowsFn(subCatId, baseRows)
      : baseRows;

    function getActiveOverridesStore() {
      // Always use RuleEditorUI.getOverrides() as the single source of truth
      if (typeof RuleEditorUI !== "undefined" && typeof RuleEditorUI.getOverrides === "function") {
        var store = RuleEditorUI.getOverrides();
        if (store && typeof store === "object") return store;
      }
      if (typeof window !== "undefined" && typeof window.getRuleOverrides === "function") {
        var store2 = window.getRuleOverrides();
        if (store2 && typeof store2 === "object") return store2;
      }
      if (typeof globalThis !== "undefined" && typeof globalThis.getRuleOverrides === "function") {
        var store3 = globalThis.getRuleOverrides();
        if (store3 && typeof store3 === "object") return store3;
      }
      return {};
    }

    var overridesStore = getActiveOverridesStore();
    console.log("[SkidEngine] overridesStore key count:", Object.keys(overridesStore).length, "| targetTableIdx:", getTableIdxForSkidType(type, overridesStore), "| type:", type, "| subCatId:", subCatId);
    var targetTableIdx = getTableIdxForSkidType(type, overridesStore);

    targetRows.forEach((row) => {
      const isExtOnlyOverride = overridesStore && overridesStore["steelSkid::extOnly::" + row.id];
      const isExtOnly = (isExtOnlyOverride !== undefined)
        ? !!isExtOnlyOverride
        : (row.isExtOnly || ["row23", "row24", "row25", "row26"].includes(row.id));

      if (!isExtReinf && isExtOnly) {
        return;
      }

      // 1. Formula override resolution (checks per-skid custom formula first, then main table UI override)
      let formulaToUse = null;
      let _formulaSource = "hardcoded";
      if (overridesStore) {
        const targetFormKey = "steelSkid::" + targetTableIdx + "::" + row.id;
        const specFormKey = "steelSkid::formula::" + row.id + "::" + type;
        const subCatFormKey = subCatId + "::formula::" + row.id + "::" + type;

        if (overridesStore[specFormKey]) {
          formulaToUse = overridesStore[specFormKey];
          _formulaSource = "specFormKey=" + specFormKey;
        } else if (overridesStore[subCatFormKey]) {
          formulaToUse = overridesStore[subCatFormKey];
          _formulaSource = "subCatFormKey=" + subCatFormKey;
        } else if (overridesStore[targetFormKey] !== undefined) {
          formulaToUse = overridesStore[targetFormKey];
          _formulaSource = "targetFormKey=" + targetFormKey;
        } else {
          for (let t = 0; t < 10; t++) {
            const ovKey = "steelSkid::" + t + "::" + row.id;
            if (overridesStore[ovKey] !== undefined) {
              formulaToUse = overridesStore[ovKey];
              _formulaSource = "loopTable t=" + t + " key=" + ovKey;
              break;
            }
          }
        }
      }

      if (!formulaToUse) {
        formulaToUse = (row.formulas && row.formulas[type]) 
          ? row.formulas[type] 
          : (row.formulas && row.formulas[parentKey]) 
            ? row.formulas[parentKey] 
            : row.formula;
        _formulaSource = "fallback(row.formula/row.formulas)";
      }

      if (typeof console !== "undefined") {
        console.log("[SkidEngine]", row.id, "| source:", _formulaSource, "| formula:", (formulaToUse || "").substring(0, 80));
      }

      const raw = Number(RuleEngine.evaluate(formulaToUse, fullScope)) || 0;
      const v = Math.max(0, raw);
      detail.push({ id: row.id, value: v });
      if (!(v > 0)) return;

      // 2. Part number override resolution (check targetTableIdx first, then all tables)
      let partNo = null;
      if (overridesStore) {
        const pOptTarget = "steelSkid::" + targetTableIdx + "::" + row.id + ":partNo:" + type;
        const pKeyTarget = "steelSkid::" + targetTableIdx + "::" + row.id + ":partNo";

        if (overridesStore[pOptTarget]) partNo = overridesStore[pOptTarget];
        else if (overridesStore[pKeyTarget]) partNo = overridesStore[pKeyTarget];
        else {
          for (let t = 0; t < 10; t++) {
            const pOpt = "steelSkid::" + t + "::" + row.id + ":partNo:" + type;
            const pKey = "steelSkid::" + t + "::" + row.id + ":partNo";
            if (overridesStore[pOpt]) { partNo = overridesStore[pOpt]; break; }
            if (overridesStore[pKey]) { partNo = overridesStore[pKey]; break; }
          }
        }
      }

      if (!partNo) {
        if (row.parts) {
          partNo = typeof row.parts === "string" 
            ? row.parts 
            : (row.parts[type] || row.parts[parentKey] || row.parts.angle75 || row.parts.channel125 || row.parts.channel150);
        } else {
          partNo = row.partNo;
        }
      }
      if (!partNo) return;

      // 3. Part name / label override resolution (check targetTableIdx first, then all tables)
      let partName = null;
      if (overridesStore) {
        const lKeyTarget = "steelSkid::" + targetTableIdx + "::" + row.id + ":label";
        if (overridesStore[lKeyTarget] && overridesStore[lKeyTarget] !== row.id) {
          partName = overridesStore[lKeyTarget];
        } else {
          for (let t = 0; t < 10; t++) {
            const lKey = "steelSkid::" + t + "::" + row.id + ":label";
            if (overridesStore[lKey] && overridesStore[lKey] !== row.id) {
              partName = overridesStore[lKey];
              break;
            }
          }
        }
      }
      if (!partName && row.label && row.label !== row.id) {
        partName = row.label;
      }
      if (!partName && row.name && row.name !== row.id) {
        partName = row.name;
      }

      const qty = Math.round(v);
      const itemKey = row.id + "::" + partNo;
      byPart[itemKey] = { partNo, qty, partName, rowId: row.id };
    });

    const parts = Object.values(byPart).filter((p) => p.qty > 0);
    const total = parts.reduce((s, p) => s + p.qty, 0);
    return { parts, total, detail };
  }

  // Real part-number breakdown for Bolts & Nuts (see accessories_rules.js
  // boltsAndNuts for full provenance/verification notes). `materialOption`
  // is the BASIC_TOOL!E21-equivalent numeric value 1-6 (see
  // Rules.boltsAndNuts.materialOptions for the real dropdown text); defaults
  // to 2 ("EXT:HDG+INT:SS316", the app's long-standing default). Rows are
  // evaluated in the array's own order (already sorted so every AP<n>
  // back-reference resolves), each row's numeric result is stashed into the
  // scope under its own id so later rows can reference it exactly like the
  // original workbook's cell-to-cell formulas do.
  //
  // `catalogOverrides` (optional): a { [libId]: boltNameString } map -- see
  // accessories_rules.js boltsAndNuts.libraryCatalog. When a row resolves to
  // lib id N and catalogOverrides[N] is a non-empty string, it replaces
  // libraryNames[N] as the base part name (the material-option suffix is
  // still appended on top, same as always). Literal rows (no `lib`) can be
  // overridden the same way via their own row id. Omitting this parameter
  // (or passing null/undefined) reproduces the exact verified behavior.
  function boltsAndNutsParts(g, isIntReinf, materialOption, catalogOverrides, sidePanelOnly) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const W_O = g.W.value;
    const L_O = g.L1.value + g.L2.value + g.L3.value + g.L4.value;
    const RF = isIntReinf ? 1 : 2;
    const L2_O = g.L2.value;
    const S_1M = sidePanelOnly ? 1 : 0;

    const optValue = Math.max(1, Math.min(6, materialOption || 2));
    const optIdx = optValue - 1;
    const rules = Rules.boltsAndNuts;
    const scope = { W_C, W_F, L_C, L_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O, L_O, RF, L2_O, S_1M };

    const byPart = {};
    const detail = [];
    rules.rows.forEach((row) => {
      const raw = Number(RuleEngine.evaluate(row.formula, scope)) || 0;
      const v = Math.max(0, raw);
      scope[row.id] = v;
      let partNo = null;
      if (row.literal) {
        const override = catalogOverrides && catalogOverrides[row.id];
        partNo = (override && String(override).trim()) || row.literal;
      } else if (row.lib || (row.libByOption && row.libByOption[optValue])) {
        const libId = (row.libByOption && row.libByOption[optValue]) || row.lib;
        const override = catalogOverrides && catalogOverrides[libId];
        const baseName = (override && String(override).trim()) || rules.libraryNames[libId];
        partNo = baseName + row.suffix[optIdx];
      }
      detail.push({ id: row.id, value: v, partNo, label: row.label, section: row.section });
      if (!(v > 0) || !partNo) return;
      byPart[partNo] = (byPart[partNo] || 0) + v;
    });

    const parts = Object.keys(byPart)
      .map((partNo) => ({ partNo, qty: Math.round(byPart[partNo]) }))
      .filter((p) => p.qty > 0);
    const total = parts.reduce((s, p) => s + p.qty, 0);
    return { parts, total, detail };
  }

  function boltsAndNutsQty(g, isIntReinf, materialOption, sidePanelOnly) {
    return boltsAndNutsParts(g, isIntReinf, materialOption, null, sidePanelOnly).total;
  }

  function reinforcingQty(g, isIntReinf, sidePanelOnly) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const L2_O = g.L2.value;
    const S_1M = sidePanelOnly ? 1 : 0;

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, L_C, L_F, H_O, H_C, H_F, N_PA, L2_O, S_1M };
    const rules = isIntReinf ? Rules.reinforcing.internal : Rules.reinforcing.external;
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);
    const { total } = RuleEngine.sumRules(rules.rows, scope, rules.reducer);
    return total;
  }

  // Resolve a partNumbers[] entry (see accessories_rules.js reinforcing.*)
  // into a literal catalog part number string for the given height/material.
  function resolvePartNo(spec, H_O, isSA4) {
    if (typeof spec === "string") return spec;
    if (!spec) return null;
    if (spec.materialPrefix) return spec.materialPrefix + (isSA4 ? "SA4" : "SA2");
    if (spec.byHeight) {
      const row = spec.byHeight.find((r) => r.maxH === undefined || H_O <= r.maxH);
      return row ? row.part : null;
    }
    if (spec.byHeightMaterialLR) {
      const row = spec.byHeightMaterialLR.find((r) => r.H === H_O);
      if (!row) return null;
      return row.base + (isSA4 ? "SA4" : "SA2") + (row.lr ? "(L/R)" : "");
    }
    return null;
  }

  // Real part-number breakdown for Reinforcing (see reinforcingQty above for
  // the already-verified total; this returns the same total split across the
  // real catalog parts each row maps to -- see accessories_rules.js
  // reinforcing.external/internal.partNumbers, verified against
  // EXT_REINF!M8:M93 / INT_REINF_INT!L8:L55). `isSA4` reflects the Bolts &
  // Nuts spec selector (true only for "EXT:HDG+INT:SS316", matching
  // BASIC_TOOL!$E$21==2 -- every other choice uses the SA2 suffix, per the
  // original IFS's fallthrough behavior).
  function reinforcingParts(g, isIntReinf, isSA4, sidePanelOnly) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const L2_O = g.L2.value;
    const S_1M = sidePanelOnly ? 1 : 0;

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, L_C, L_F, H_O, H_C, H_F, N_PA, L2_O, S_1M };
    const rules = isIntReinf ? Rules.reinforcing.internal : Rules.reinforcing.external;
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);
    const { detail } = RuleEngine.sumRules(rules.rows, scope, rules.reducer);

    const byPart = {};
    const unmapped = [];
    detail.forEach(({ id, value }) => {
      if (!(value > 0)) return;
      const spec = rules.partNumbers && rules.partNumbers[id];
      const partNo = spec ? resolvePartNo(spec, H_O, isSA4) : null;
      if (!partNo) { unmapped.push({ id, value }); return; }
      byPart[partNo] = (byPart[partNo] || 0) + value;
    });
    const parts = Object.keys(byPart).map((partNo) => ({ partNo, qty: Math.round(byPart[partNo]) })).filter((p) => p.qty > 0);
    return { parts, unmapped };
  }

  // Per-ROW breakdown for Reinforcing (like reinforcingParts above, but keeps
  // one entry per formula row instead of aggregating by resolved part
  // number) -- used by reinforcing_audit.js's live audit/setting sheet so
  // each row's own formula + quantity can be shown and edited individually,
  // the same way boltsAndNutsParts' `detail` already drives the Bolt Logic
  // Audit Sheet.
  function reinforcingRowDetail(g, isIntReinf, isSA4, sidePanelOnly) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const L2_O = g.L2.value;
    const S_1M = sidePanelOnly ? 1 : 0;

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, L_C, L_F, H_O, H_C, H_F, N_PA, L2_O, S_1M };
    const rules = isIntReinf ? Rules.reinforcing.internal : Rules.reinforcing.external;
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);
    const { detail } = RuleEngine.sumRules(rules.rows, scope, rules.reducer);

    return detail.map(({ id, value }) => {
      const spec = rules.partNumbers && rules.partNumbers[id];
      const partNo = spec ? resolvePartNo(spec, H_O, isSA4) : null;
      const row = (rules.rows || []).find((r) => r.id === id);
      return { id, value: Math.round(value), partNo, formula: row ? row.formula : "" };
    });
  }

  // Per-component breakdown for the External Tie-Rod assembly (rod
  // subtotals rodsW/rodsL1..L4 + accessory subtotals row35-38, plus the
  // final rolled-up total that becomes the WTR-12M300Z BOM line) -- used by
  // reinforcing_audit.js's live audit/setting sheet. Mirrors tieRodQty's own
  // scope-building above (kept as a separate function rather than a shared
  // helper, matching this file's existing per-function style) but stops
  // short of collapsing everything to one number.
  function tieRodComponentDetail(g) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const H_O = g.H.value;
    const W_O = g.W.value;
    const L1_O = g.L1.value, L2_O = g.L2.value, L3_O = g.L3.value, L4_O = g.L4.value;

    const rules = Rules.tieRod;

    function layerFactor(H) {
      const row = rules.layerFactorTable.find(r => r.maxH === undefined || H <= r.maxH);
      return row.factor;
    }
    function segCount(dim) {
      if (!dim || dim <= 0) return 0;
      const row = rules.segmentTable.find(r => Math.abs(r[0] - dim) < 1e-6);
      if (!row) return 0;
      return row[1] + row[2] + 1;
    }

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, W_O, L1_O, L2_O, L3_O, L4_O, layerFactor, segCount };
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);

    const componentIds = ["rodsW", "rodsL1", "rodsL2", "rodsL3", "rodsL4", "row35", "row36", "row37", "row38"];
    const detail = componentIds.map((id) => {
      const item = (rules.intermediates || []).find((r) => r.name === id);
      return { id, value: Math.max(0, Math.round(scope[id] || 0)), formula: item ? item.formula : "" };
    });
    const { total: rawTotal } = RuleEngine.sumRules(rules.rows, scope, "sum");
    const total = Math.max(0, Math.round(rawTotal));
    return { detail, total, formula: rules.rows[0] ? rules.rows[0].formula : "" };
  }

  function tieRodQty(g) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const H_O = g.H.value;
    const W_O = g.W.value;
    const L1_O = g.L1.value, L2_O = g.L2.value, L3_O = g.L3.value, L4_O = g.L4.value;

    const rules = Rules.tieRod;

    function layerFactor(H) {
      const row = rules.layerFactorTable.find(r => r.maxH === undefined || H <= r.maxH);
      return row.factor;
    }
    function segCount(dim) {
      if (!dim || dim <= 0) return 0;
      const row = rules.segmentTable.find(r => Math.abs(r[0] - dim) < 1e-6);
      if (!row) return 0;
      return row[1] + row[2] + 1;
    }

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, W_O, L1_O, L2_O, L3_O, L4_O, layerFactor, segCount };
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);
    const { total } = RuleEngine.sumRules(rules.rows, scope, "sum"); // reducer applied manually below
    return Math.max(0, Math.round(total));
  }

  // Real per-part breakdown for the INTERNAL Tie-Rod system (see
  // accessories_rules.js Rules.tieRodInternal for full provenance -- this is
  // the previously-missing counterpart to the External `tieRod`/tieRodQty
  // above; a genuinely different subsystem with its own layer-factor
  // progression and a length-segmented rod catalog instead of External's
  // fixed 2m/3m/remainder scheme). Returns both the aggregated `parts` (for
  // the real BOM) and the raw per-row `detail` (for reinforcing_audit.js's
  // audit sheet), mirroring reinforcingParts()/reinforcingRowDetail()'s split.
  // `isSA4` selects the STS316(SA4)/STS304(SA2) catalog suffix -- wired to
  // the app's `#internalTieRod` select (see accessories_rules.js's
  // "KNOWN DIVERGENCE" comment on tieRodInternal for why this differs from
  // the source workbook's own, confirmed-dead, material selector).
  // dim (m) -> real catalog piece lengths (mm) this rod direction decomposes
  // into: <=5.0m is always one piece (dim*1000-120mm, an exact catalog
  // length by construction); >5.0m is N pieces of 4000mm plus one shorter
  // remainder piece. Verified against all 98 rows of the source workbook's
  // own static segment table (see the research spec for the full row-by-row
  // check) -- this closed form reproduces it exactly. Module-scope (not
  // nested in tieRodInternalParts) so tierod_internal_audit.js's
  // verification tab can reuse the exact same decomposition the real BOM
  // uses, instead of a parallel re-implementation that could drift.
  function tieRodInternalSegmentsFor(dimM) {
    if (!dimM || dimM <= 0) return { pieces: [], count: 0 };
    let reduced = dimM;
    let n4000 = 0;
    while (reduced > 5.0 + 1e-9) { reduced -= 4.0; n4000++; }
    const remainderMm = Math.round(reduced * 1000) - 120;
    const pieces = [];
    for (let i = 0; i < n4000; i++) pieces.push(4000);
    pieces.push(remainderMm);
    return { pieces, count: pieces.length };
  }
  function tieRodInternalSegCountFor(dim) { return tieRodInternalSegmentsFor(dim).count; }
  function tieRodInternalCountOfLen(dim, lengthMm) {
    const pieces = tieRodInternalSegmentsFor(dim).pieces;
    let n = 0;
    for (let i = 0; i < pieces.length; i++) if (pieces[i] === lengthMm) n++;
    return n;
  }
  function tieRodInternalLayerFactor(H) {
    const row = Rules.tieRodInternal.layerFactorTable.find((r) => r.maxH === undefined || H <= r.maxH);
    return row.factor;
  }

  function tieRodInternalParts(g, isSA4) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const W_O = g.W.value;
    const L1_O = g.L1.value, L2_O = g.L2.value, L3_O = g.L3.value, L4_O = g.L4.value;

    const rules = Rules.tieRodInternal;
    const suffix = isSA4 ? "SA4" : "SA2";

    const layerFactor = tieRodInternalLayerFactor;
    const segCountFor = tieRodInternalSegCountFor;
    const countOfLen = tieRodInternalCountOfLen;

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O, L1_O, L2_O, L3_O, L4_O, layerFactor, segCountFor, countOfLen };
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);
    const { detail: rawDetail } = RuleEngine.sumRules(rules.rows, scope, rules.reducer);

    function partNoFor(id) {
      if (id === "nut") return "M12 NUT(" + suffix + ")";
      if (id === "bw") return "M12 BW(" + suffix + ")";
      if (id === "coupler") return "TC-12M60" + suffix;
      const lenMm = parseInt(id.replace("len", ""), 10);
      return "TR-12M" + String(lenMm).padStart(4, "0") + suffix;
    }

    const byPart = {};
    const detail = rawDetail.map(({ id, value }) => {
      const v = Math.round(value);
      const partNo = partNoFor(id);
      if (v > 0) byPart[partNo] = (byPart[partNo] || 0) + v;
      const row = (rules.rows || []).find((r) => r.id === id);
      return { id, value: v, partNo, formula: row ? row.formula : "" };
    });
    const parts = Object.keys(byPart).map((partNo) => ({ partNo, qty: byPart[partNo] })).filter((p) => p.qty > 0);

    // --- Internal Tie-Rod validation -----------------------------------
    // Independent cross-check, separate from the per-catalog-length rows
    // above: `expectedTotalPieces` derives the total rod PIECE count from
    // segment COUNTS (segCountFor x line count -- same shape as the
    // "coupler" formula minus its "-1"), while `actualTotalPieces` sums the
    // 25 individual per-length ("len####") rows. Both paths should always
    // reconcile for the closed-form catalog (see segmentsFor's "an exact
    // catalog length by construction" note); a mismatch means either a
    // dimension decomposed into a length missing from catalogLengthsMm, or
    // a row/catalog formula was edited via the Rule Editor and broke that
    // guarantee. Nut/BW quantities are cross-checked the same way against
    // their own defining formula, which catches the case where only the
    // nut/bw row (and not the rod rows) was edited.
    const warnings = [];
    const expectedTotalPieces = Math.round(
      segCountFor(W_O) * scope.lineW +
      segCountFor(L1_O) * scope.lineL1 +
      segCountFor(L2_O) * scope.lineL2 +
      segCountFor(L3_O) * scope.lineL3 +
      segCountFor(L4_O) * scope.lineL4
    );
    const actualTotalPieces = detail
      .filter((d) => d.id.indexOf("len") === 0)
      .reduce((sum, d) => sum + d.value, 0);
    if (actualTotalPieces !== expectedTotalPieces) {
      warnings.push(
        `타이로드 피스 수 불일치: 카탈로그 길이별 합계 ${actualTotalPieces}개 ≠ 기대값(세그먼트 개수 기준) ${expectedTotalPieces}개 ` +
        `-- 치수가 TR-12M 카탈로그 규격을 벗어났거나 Rule Editor에서 길이별 수식이 변경되었을 수 있습니다.`
      );
    }
    const expectedNutBw = Math.round(4 * (scope.lineW + scope.lineL1 + scope.lineL2 + scope.lineL3 + scope.lineL4));
    const nutRow = detail.find((d) => d.id === "nut");
    const bwRow = detail.find((d) => d.id === "bw");
    if (nutRow && nutRow.value !== expectedNutBw) {
      warnings.push(`M12 NUT(${suffix}) 수량 불일치: ${nutRow.value}개 ≠ 기대값 ${expectedNutBw}개`);
    }
    if (bwRow && bwRow.value !== expectedNutBw) {
      warnings.push(`M12 BW(${suffix}) 수량 불일치: ${bwRow.value}개 ≠ 기대값 ${expectedNutBw}개`);
    }
    if (detail.some((d) => !isFinite(d.value) || d.value < 0)) {
      warnings.push("타이로드 항목 중 음수 또는 계산 불가(NaN) 수량이 발견되었습니다.");
    }

    return { parts, detail, warnings };
  }

  const AccessoriesEngine = {
    nominalCapaM3, actualCapaM3, totalSurfaceAreaSqm,
    airVent, roofSupporter, steelSkidTotalLength, steelSkidParts, steelSkidDetailedParts, boltsAndNutsQty, boltsAndNutsParts,
    reinforcingQty, reinforcingParts, reinforcingRowDetail, tieRodQty, tieRodComponentDetail, tieRodInternalParts,
    tieRodInternalSegmentsFor, tieRodInternalSegCountFor, tieRodInternalCountOfLen, tieRodInternalLayerFactor,
  };

  return AccessoriesEngine;
});
