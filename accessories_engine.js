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
    global.AccessoriesEngine = factory(global.RuleEngine, global.AccessoriesRules);
  }
})(typeof window !== "undefined" ? window : globalThis, function (RuleEngine, Rules) {
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
  function steelSkidDetailedParts(g, skidType) {
    const type = (skidType === "channel125" || skidType === "channel150") ? skidType : "angle75";
    const W_C = g.W.whole, W_F = g.W.half, W_O = g.W.value;
    const L1_C = g.L1.whole, L1_F = g.L1.half, L1_O = g.L1.value;
    const L2_C = g.L2.whole, L2_F = g.L2.half, L2_O = g.L2.value;
    const L3_C = g.L3.whole, L3_F = g.L3.half, L3_O = g.L3.value;
    const L4_C = g.L4.whole, L4_F = g.L4.half, L4_O = g.L4.value;
    const H_O = g.H.value;
    const L_O = g.L1.value + g.L2.value + g.L3.value + g.L4.value;
    const L_O_C = g.L_C_sum, L_O_F = g.L_F_sum;
    const scope = {
      W_C, W_F, W_O, L1_C, L1_F, L1_O, L2_C, L2_F, L2_O, L3_C, L3_F, L3_O,
      L4_C, L4_F, L4_O, H_O, L_O, L_O_C, L_O_F,
    };

    const byPart = {};
    const detail = [];
    Rules.steelSkidDetailed.rows.forEach((row) => {
      const raw = Number(RuleEngine.evaluate(row.formula, scope)) || 0;
      const v = Math.max(0, raw);
      detail.push({ id: row.id, value: v });
      if (!(v > 0)) return;
      const partNo = row.parts[type];
      if (!partNo) return; // e.g. angle75 has no height-bracket rows (23-26)
      byPart[partNo] = (byPart[partNo] || 0) + v;
    });

    const parts = Object.keys(byPart)
      .map((partNo) => ({ partNo, qty: Math.round(byPart[partNo]) }))
      .filter((p) => p.qty > 0);
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
  function boltsAndNutsParts(g, isIntReinf, materialOption, catalogOverrides) {
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

    const optValue = Math.max(1, Math.min(6, materialOption || 2));
    const optIdx = optValue - 1;
    const rules = Rules.boltsAndNuts;
    const scope = { W_C, W_F, L_C, L_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O, L_O, RF, L2_O };

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

  function boltsAndNutsQty(g, isIntReinf, materialOption) {
    return boltsAndNutsParts(g, isIntReinf, materialOption).total;
  }

  function reinforcingQty(g, isIntReinf) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const L2_O = g.L2.value;

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, L_C, L_F, H_O, H_C, H_F, N_PA, L2_O };
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
  function reinforcingParts(g, isIntReinf, isSA4) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const H_O = g.H.value, H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;
    const L2_O = g.L2.value;

    const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, L_C, L_F, H_O, H_C, H_F, N_PA, L2_O };
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

  const AccessoriesEngine = {
    nominalCapaM3, actualCapaM3, totalSurfaceAreaSqm,
    airVent, roofSupporter, steelSkidTotalLength, steelSkidParts, steelSkidDetailedParts, boltsAndNutsQty, boltsAndNutsParts,
    reinforcingQty, reinforcingParts, tieRodQty,
  };

  return AccessoriesEngine;
});
