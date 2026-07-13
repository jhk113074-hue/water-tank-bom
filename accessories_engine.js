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

  function steelSkidTotalLength(W, W_C, W_F, Ltotal) {
    const scope = { W, W_C, W_F, Ltotal };
    const b42 = RuleEngine.evaluate(Rules.steelSkid.b42Formula, scope);
    const b43 = RuleEngine.evaluate(Rules.steelSkid.b43Formula, scope);
    const b44 = RuleEngine.evaluate(Rules.steelSkid.b44Formula, scope);
    return b42 + b43 + b44;
  }

  function boltsAndNutsQty(g, isIntReinf) {
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
    const hasPartition = g.L2.value > 0;

    const baseScope = { W_C, W_F, L_C, L_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O, L_O, RF, hasPartition };
    const rules = Rules.boltsAndNuts;
    const scope = RuleEngine.withIntermediates(rules.intermediates, baseScope);
    const { total } = RuleEngine.sumRules(rules.rows, scope, rules.reducer);
    return total;
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
    airVent, roofSupporter, steelSkidTotalLength, boltsAndNutsQty,
    reinforcingQty, tieRodQty,
  };

  return AccessoriesEngine;
});
