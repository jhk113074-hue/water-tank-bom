// =============================================================================
// WATANI GRP Water Tank -- Accessories/Capacity RULE DATA (editable)
// =============================================================================
// This file holds every coefficient, threshold, and formula used by
// accessories_engine.js. It is pure data + formula strings (see
// rule_engine.js for the tiny expression language) -- edit values here,
// NOT the .js engine files, to change how quantities are calculated.
//
// Provenance / verification status (do not remove when editing values --
// but note that editing values obviously invalidates the "verified" claim
// for that specific row until re-checked against the original workbook):
//   - reinforcing.external / reinforcing.internal: EXACTLY verified against
//     16 LibreOffice ground-truth scenarios (EXT_REINF / INT_REINF_INT sheets).
//   - tieRod: EXACTLY verified against 8 LibreOffice scenarios (EXT_TIE_ROD).
//   - boltsAndNuts: EXACTLY re-derived per-part from BoltnNuts!AN5:AZ75 and
//     verified against the original workbook's own cached values (see the
//     detailed provenance comment on the boltsAndNuts ruleset below).
//   - capacity / airVent / roofSupporter / steelSkid: exactly verified
//     against LibreOffice (BASIC_TOOL/ETC/Steel_Skid sheets).
//
// Variable names available in each ruleset's formulas are documented next
// to that ruleset below.
// =============================================================================
(function (global) {
  "use strict";

  const AccessoriesRules = {

    // -----------------------------------------------------------------------
    // Capacity / Surface Area -- variables: W, Ltotal, H, N_PA
    // -----------------------------------------------------------------------
    capacity: {
      nominalFormula: "W*Ltotal*H",
      actualFormula: "W*Ltotal*(H-0.2)",
      surfaceAreaFormula: "W*Ltotal*2 + W*H*2 + Ltotal*H*2 + W*H*N_PA",
    },

    // -----------------------------------------------------------------------
    // Air Vent -- perCompartment variables: W_C, Lc
    // partTable: first matching row by ascending "maxCapa" wins; a row with
    // no "maxCapa" is the fallback ("else").
    // -----------------------------------------------------------------------
    airVent: {
      perCompartmentFormula: "ceil(W_C*Lc/30)",
      partTable: [
        { maxCapa: 100, partNo: "WAV-0050A" },
        { partNo: "WAV-0100A" },
      ],
    },

    // -----------------------------------------------------------------------
    // Roof Supporter -- term variables: W_C, W_F, Lc, Lf
    // qty = ceil(term(L1) + term(L2)) + term(L3) + term(L4)
    // (verified: only the first two terms are inside the ROUNDUP/ceil)
    // partNo = partNoPrefix + (H_O*1000) + partNoSuffix
    // -----------------------------------------------------------------------
    roofSupporter: {
      termFormula: "(W_C+W_F-1)*(Lc+Lf-1)/2",
      partNoPrefix: "WRS-",
      partNoSuffix: "P",
    },

    // -----------------------------------------------------------------------
    // Steel Skid total length -- variables: W, W_C, W_F, Ltotal
    // -----------------------------------------------------------------------
    steelSkid: {
      b42Formula: "W*2",
      b43Formula: "(W_C+W_F+1)*Ltotal",
      b44Formula: "W*(Ltotal-1)",
      // Real catalog part for the main skid rail, selected by tank height
      // (H_O). Verified against Steel_Skid!B8/F8/H8/AR9/AS9 and
      // BASIC_TOOL!C20/C21 (the "Steel Skid" dropdown: Default/U Channel-100/
      // U Channel-125/Except Steel Skid -- C41:C44). Under "Default", C21
      // resolves to option 1 (H_O in {1,1.5,2}) or option 2 (H_O in
      // {2.5,3,3.5,4}); both options use ONE part whose quantity is the full
      // B45 total length. NOTE: the original sheet also defines options
      // 3/5/6/7 with a much larger per-part breakdown (corner brackets, rail
      // segments by QUOTIENT/MOD, width-conditioned sub-beams, a 100-row
      // length-combination table) -- but those options are NEVER reachable
      // from the live C20 dropdown (only 4 choices exist), so they are dead
      // legacy formulas and intentionally NOT ported here. For H_O > 4
      // (4.5/5), the "Default" dropdown formula produces no match in the
      // original sheet (an unhandled gap) -- this table extrapolates by
      // reusing the U Channel-125 rail/bracket as the closest real option;
      // treat H_O>4 results as an engineering estimate, not a verified value.
      mainRailByHeight: [
        { maxH: 2, partNo: "WFF-100U", label: "100x50mm U Channel (Skid Frame, 1.0~2.0mH)" },
        { maxH: Infinity, partNo: "WFF-125U", label: "125x65mm U Channel (Skid Frame, 2.5mH~)" },
      ],
      // Extra corner/height bracket -- only used together with the 125U rail
      // (H_O >= 2.5). Verified against Steel_Skid!H9 (part select) +
      // AN23:AP26 (VLOOKUP'd quantity). Variables: L_O_C, L_O_F (total length
      // whole/half-course counts, i.e. g.L_C_sum/g.L_F_sum), W_C, W_F.
      heightBracket: {
        rows: [
          { maxH: 2.5, partNo: "WFF-12530Z" },
          { maxH: 3, partNo: "WFF-12535Z" },
          { maxH: Infinity, partNo: "WFF-12540Z" },
        ],
        qtyFormula: "(L_O_C+L_O_F-1)*2 + (W_C+W_F-1)*2",
      },
    },

    // -----------------------------------------------------------------------
    // Bolts & Nuts -- FULLY re-derived from BoltnNuts!AN:AZ (rows 5-75) in the
    // original workbook, row by row, and verified exactly against the sheet's
    // own cached values for a real saved scenario (W=3.5, L1=3, L2=3, H=1.5mH,
    // N_PA=1, Internal reinforcing, material option 2 "EXT:HDG+INT:SS316"):
    // grand total 5270 across 19 distinct real part numbers -- see
    // accessories_engine.js boltsAndNutsParts() for the Node verification.
    // This REPLACES the older single-lump "~3-8% margin" approximation.
    //
    // Each row below is one BoltnNuts!AP<n> quantity formula. "lib" is the
    // BoltnNuts!BG<n> bolt/washer/nut catalog entry it uses (see libraryNames
    // below); "suffix" is the per-material-option name suffix (index 0..5 =
    // BASIC_TOOL!E21 options 1..6; options 7/8 "Except Bolts/Panel Bolts" are
    // deliberately not modeled -- they mean "no bolts", out of scope for a
    // real BOM). "libByOption" overrides "lib" for specific option indices
    // where the original sheet genuinely swaps to a different (but often
    // same-named) catalog row. "literal" rows always resolve to one fixed
    // part name regardless of material option.
    //
    // Known simplifications (both confirmed inert for the app's real input
    // range, or unreachable given the app's own UI):
    //   - S_1M (row19) and P_1M (row58) are two undocumented legacy flags in
    //     the original sheet with no exposed UI control; both are assumed 0,
    //     matching the ONLY previously-existing implementation's behavior and
    //     the verified scenario's cached results.
    //   - E13 (row32, an "Insulation" selector with no UI in this app) is
    //     assumed 1 (the workbook's saved default).
    //   - AP46/47/48 (a "Steel Skid for external" bolt/nut/washer trio) are
    //     forced to 0: the original formula is gated by BASIC_TOOL!C21 (the
    //     Steel Skid option selector) being 0, which only happens for
    //     "Default" + H=4.5/5mH -- a combination already flagged as an
    //     unhandled gap in the original workbook by accessories_rules.js's
    //     own steelSkid section. For every H this app supports normally,
    //     C21>0, so these three rows are always exactly 0 -- confirmed
    //     against the verified scenario (all cached 0 there too).
    //
    // Variables available to all formulas below: W_C, W_F, L_C, L_F, L1_C,
    // L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O,
    // L_O, RF (1=Internal reinforcing, 2=External), L2_O.
    // -----------------------------------------------------------------------
    boltsAndNuts: {
      // BASIC_TOOL!E20 dropdown options -> E21 numeric value (index 0..5
      // below corresponds to "suffix" array position). Options 7/8 ("Except
      // Bolts"/"Except Panel Bolts") are not included -- see note above.
      materialOptions: [
        { value: 1, label: "EXT:HDG+INT:SS304+Roof:HDG" },
        { value: 2, label: "EXT:HDG+INT:SS316" },
        { value: 3, label: "EXT:SS304+INT:SS316" },
        { value: 4, label: "EXT:SS304+INT:SS316+R/F:Plastic" },
        { value: 5, label: "INT/EXT:SS304" },
        { value: 6, label: "INT/EXT:SS316" },
      ],
      // BoltnNuts!BG<n> catalog entries actually referenced by the rows
      // below (built from BC/BD there: e.g. BC6=10,BD6=35 -> "WBT-1035").
      libraryNames: {
        6: "WBT-1035", 7: "WBT-1035", 8: "WBT-1045", 9: "WNT-M10", 10: "WFW-M10",
        12: "WBT-1045", 13: "WBT-1045", 18: "WBT-1045", 19: "WBT-1035", 22: "WBT-1045",
        24: "WBT-14130P", 25: "WBT-1460P", 26: "WBT-1250", 27: "WFW-M14", 28: "WNT-M14",
        32: "WBT-1045", 33: "WBT-1058P", 35: "WNT-M10", 36: "WFW-M10", 37: "WNT-M12", 38: "WFW-M12",
        43: "WBT-1060", 44: "WBT-10100", 46: "WBT-1035", 48: "WBT-1240", 49: "WBT-1240",
        53: "WBT-1440", 58: "WBT-1640", 59: "WBT-16100", 60: "WFW-M16", 61: "WNT-M16",
      },
      // Rows ordered so every AP<n> reference resolves to an already-computed
      // value (the original sheet has no such ordering constraint since Excel
      // resolves the dependency graph itself; this list is manually sorted
      // into that same dependency order).
      rows: [
        { id: "AP5", formula: "(8*W_C+4*W_F)*(L_C+L_F-1)", lib: 6, suffix: ["HDG", "SA4", "SA4", "PSA4", "SA2", "SA4"] },
        { id: "AP6", formula: "L_O*8*(W_C+W_F-1)", lib: 6, suffix: ["HDG", "SA4", "SA4", "PSA4", "SA2", "SA4"] },
        { id: "AP7", formula: "(L1_C+L2_C+L3_C+L4_C+W_C)*8*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*4*2", lib: 7, suffix: ["HDG", "SA4", "SA4", "PSA4", "SA2", "SA4"], libByOption: { 4: 8 } },
        { id: "AP12", formula: "(8*W_C+4*W_F)*(L_C+L_F-1)", lib: 12, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP13", formula: "L_O*8*(W_C+W_F-1)", lib: 12, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP18", formula: "H_O*((W_C+W_F-1)+(L_C+L_F-1))*2*8", lib: 18, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP19", formula: "H_O>2 ? 8*(W_O+L_O)*2*(H_C+H_F-2) : 0", lib: 18, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP22", formula: "H_O*8*2*4", lib: 19, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP23", formula: "(RF==2 && H_O==1.5) ? ((W_O-1)+(L_O-1))*2*2 : 0", lib: 43, suffix: ["HDG", "HDG", "SA4", "HDG", "SA2", "SA4"] },
        { id: "AP24", formula: "(RF==2 && H_O==2) ? (W_C+W_F-1+L_C+L_F-1)*2*2 : (RF==1 && H_O>3) ? (W_C+W_F-1+L_C+L_F-1)*2*2 : 0", lib: 44, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP25", formula: "(H_O==2.5?4:0)+(H_O==3?4:0)+(H_O==3.5?8:0)+(H_O==4?8:0)+(H_O==4.5?12:0)+(H_O==5?12:0)", lib: 46, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP29", formula: "L2_O>0 ? H_O*8*2*N_PA : 0", lib: 33, suffix: ["PD", "PD", "SA2", "PD", "SA2", "SA4"] },
        { id: "AP30", formula: "L2_O>0 ? W_O*8*N_PA : 0", lib: 33, suffix: ["PD", "PD", "SA2", "PD", "SA2", "SA4"] },
        { id: "AP31", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*4 : 0)*N_PA : 0", lib: 26, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP32", formula: "L2_O>0 ? (W_O*8*(H_O<2?0:(H_C+H_F-1)))*N_PA : 0", lib: 22, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP33", formula: "L2_O>0 ? ((W_C+W_F-1)*H_O)*8*N_PA : 0", lib: 22, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP41", formula: "((L1_C+L2_C+L3_C+L4_C+W_C)*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*2)*2", lib: 48, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"] },
        { id: "AP42", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*((H_O==2.5?12:0)+(H_O==3?12:0)+(H_O==3.5?16:0)+(H_O==4?16:0)) : 0", lib: 49, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"] },
        { id: "AP46", formula: "0" },
        { id: "AP50", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*2 : 0", lib: 59, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"] },
        { id: "AP51", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*4 : 0", lib: 58, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"] },
        { id: "AP57", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*2 : 0)*N_PA : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP58", formula: "RF==2 ? (H_O==1?0:(H_C+H_F-2))*(W_C+W_F-1)*4*N_PA : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP59", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*2 : 0)*N_PA : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP60", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*2 : 0)*N_PA : 0", lib: 25, suffix: ["PD", "PD", "SA2", "PD", "SA2", "SA4"] },
        { id: "AP66", formula: "RF==1 ? (H_O>1 ? (((W_C+W_F-1)+(L_C+L_F-1-N_PA))*2*2*((H_O==1.5||H_O==2)?1:(H_O==2.5||H_O==3)?3:(H_O==3.5||H_O==4)?5:0)) + (H_O>=2.5?(H_C+H_F-2)*2*N_PA:0) : 0) : 0", lib: 24, suffix: ["PD", "PD", "SA2", "SA2", "SA2", "SA4"] },
        { id: "AP67", formula: "RF==1 ? (W_C+W_F-1)*((H_O==1.5||H_O==2)?1:(H_O==2.5||H_O==3)?3:(H_O==3.5||H_O==4)?5:0)*2 : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP68", formula: "RF==1 ? (H_O>=3 ? 16*(H_C+H_F-2) : 0) : 0", lib: 24, suffix: ["PD", "PD", "SA2", "SA2", "SA2", "SA4"] },
        { id: "AP69", formula: "(RF==1 && H_O>=2) ? (W_C+W_F-1)*2 : 0", lib: 32, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        // ---- Tier 2: derived Nut/Washer rows referencing the Tier-1 rows above (with per-bolt nut/washer count constants already substituted in) ----
        { id: "AP9", formula: "AP5+AP6+AP7", lib: 9, suffix: ["HDG", "SA4", "SA4", "PZ", "SA2", "SA4"] },
        { id: "AP10", formula: "(AP5+AP6+AP7)*2", lib: 10, suffix: ["HDG", "SA4", "SA4", "RB", "SA2", "SA4"] },
        { id: "AP14", formula: "(L1_C+L2_C+L3_C+L4_C+W_C)*8*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*4*2 - AP24", lib: 13, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP15", formula: "AP12+AP13+AP14", lib: 9, suffix: ["HDG", "HDG", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP16", formula: "(AP12+AP13+AP14)*2", lib: 10, suffix: ["HDG", "HDG", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP26", formula: "AP18+AP19+AP23*2+AP24*2+AP22+AP25", lib: 9, suffix: ["HDG", "HDG", "SA4", "HDG", "SA2", "SA4"] },
        { id: "AP27", formula: "(AP18+AP19+AP23+AP24+AP22+AP25)*2", lib: 10, suffix: ["HDG", "HDG", "SA4", "HDG", "SA2", "SA4"] },
        { id: "AP34", formula: "AP29+AP30", lib: 9, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP35", formula: "AP29+AP30", lib: 10, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP36", formula: "AP32+AP33", lib: 9, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP37", formula: "(AP32+AP33)*2", lib: 10, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP38", formula: "AP31", lib: 37, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP39", formula: "AP31*2", lib: 38, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP43", formula: "AP41+AP42", literal: "WNT-M12HDG" },
        { id: "AP44", formula: "(AP41+AP42)*2", literal: "WFW-M12HDG" },
        { id: "AP47", formula: "0", literal: "WNT-M14HDG" },
        { id: "AP48", formula: "0", literal: "WFW-M14HDG" },
        { id: "AP52", formula: "AP51+AP50*3", lib: 61, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"] },
        { id: "AP53", formula: "AP51*2+AP50", lib: 60, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"] },
        { id: "AP61", formula: "(AP57+AP58+AP59)*3", lib: 28, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP62", formula: "AP57+AP58+AP59", lib: 27, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP63", formula: "AP60", lib: 28, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP64", formula: "AP60", lib: 27, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP70", formula: "(AP66+AP68)*3", lib: 28, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP71", formula: "AP66+AP68", lib: 27, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"] },
        { id: "AP72", formula: "AP67*3", lib: 28, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP73", formula: "AP67", lib: 27, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP74", formula: "AP69", lib: 35, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
        { id: "AP75", formula: "AP69*2", lib: 36, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"] },
      ],
    },

    // -----------------------------------------------------------------------
    // Reinforcing -- EXACTLY verified (16/16 LibreOffice scenarios).
    // Variables: W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F,
    // L_C, L_F, H_O, H_C, H_F, N_PA, L2_O.
    // -----------------------------------------------------------------------
    reinforcing: {
      external: {
        intermediates: [
          { name: "totLC", formula: "L1_C+L2_C+L3_C+L4_C" },
          { name: "totLF", formula: "L1_F+L2_F+L3_F+L4_F" },
          { name: "perim", formula: "(W_C+W_F-1)+(L_C+L_F-1)" },
        ],
        rows: [
          { id: "row8", formula: "(H_O==1.5||H_O==2) ? (W_F+totLF)*2 : (H_O==2.5||H_O==3) ? (W_F+totLF)*2*2 : (H_O==3.5||H_O==4) ? (W_F+totLF)*2*3 : (H_O==4.5||H_O==5) ? (W_F+totLF)*2*4 : 0" },
          { id: "row9", formula: "(H_O>1 ? (W_F+totLF)*2 : 0) + (H_O>3 ? (W_F+totLF)*2 : 0) + ((H_O==4.5||H_O==5) ? (totLF*(W_C+W_F-1)+W_F*(totLC+totLF-1))*2 : 0) + (H_O>3 ? W_F*N_PA : 0)" },
          { id: "row10", formula: "(H_O==2.5||H_O==3) ? (W_C+totLC)*2 : (H_O==3.5||H_O==4) ? (W_C+totLC)*2*2 : (H_O==4.5||H_O==5) ? (W_C+totLC)*2*3 : 0" },
          { id: "row11", formula: "(H_O==3.5||H_O==3) ? perim*6*2 : (H_O==4) ? perim*8*2 : (H_O==2.5) ? perim*4*2 : 0" },
          { id: "row12", formula: "((H_O==4.5||H_O==5) ? (W_C*(totLC+totLF-1)+totLC*(W_C+W_F-1))*2 : 0) + ((H_O==3.5||H_O==2.5) ? perim*2*2 : 0)" },
          { id: "row13", formula: "(H_O>1 ? (W_C+totLC)*2 : 0) + ((H_O==3||H_O==3.5) ? (W_C+totLC)*2 : (H_O==4 ? (W_C+totLC)*2*2 : 0)) + ((H_O==2.5?8:0)+(H_O==3?8:0)+(H_O==3.5?16:0)+(H_O==4?16:0)) + (H_O>3 ? W_C*N_PA : 0) + (H_O>3 ? 2*N_PA : 0)" },
          { id: "row14", formula: "H_O>1.5 ? 2*N_PA : 0" },
          { id: "row16", formula: "(H_O==1?4:0)+(H_O==2.5?4:0)" },
          { id: "row17", formula: "(H_O==1.5?4:0)+(H_O==2.5?4:0)+(H_O==3?8:0)+(H_O==3.5?4:0)" },
          { id: "row18", formula: "(H_O==2?4:0)+(H_O==4?8:0)+(H_O==3.5?4:0)" },
          { id: "row23", formula: "H_O==1.5 ? perim*2 : 0" },
          { id: "row24", formula: "H_O==2 ? perim*2 : 0" },
          { id: "row25", formula: "H_O==2.5 ? perim*2 : 0" },
          { id: "row26", formula: "H_O==3 ? perim*2 : 0" },
          { id: "row27", formula: "H_O==3.5 ? perim*2 : 0" },
          { id: "row28", formula: "H_O==4 ? perim*2 : 0" },
          { id: "row41", formula: "(H_O==2||H_O==1.5) ? perim*2 : 0" },
          { id: "row45", formula: "(H_O==2||H_O==1.5) ? perim*2 : 0" },
          { id: "row46", formula: "(W_C+W_F-1)*N_PA" },
          { id: "row54", formula: "H_O>2 ? perim*2 : 0" },
          { id: "row56", formula: "H_O>2 ? 4*(H_C+H_F-2) : 0" },
          { id: "row76", formula: "H_O>1.5 ? 2*N_PA : 0" },
          { id: "row77", formula: "H_O>1.5 ? (H_C+H_F-1)*W_C*N_PA : 0" },
          { id: "row78", formula: "(H_O>2.5 ? W_C*(H_C+H_F-2)*N_PA : 0) + (H_O>1.5 ? W_C*N_PA : 0)" },
          { id: "row79", formula: "H_O>1.5 ? (H_C+H_F-1)*W_F*N_PA : 0" },
          { id: "row80", formula: "(H_O>2.5 ? (H_C+H_F-2)*W_F*N_PA : 0) + (H_O>1.5 ? W_F*N_PA : 0)" },
          { id: "row86", formula: "H_O>1 ? (W_C+W_F-1)*2*N_PA : 0" },
          { id: "row87", formula: "H_O>1 ? (W_C+W_F-1)*N_PA : 0" },
          { id: "row88", formula: "L2_O>1 ? (W_C+W_F-1)*(H_C+H_F-1)*N_PA : 0" },
          { id: "row89", formula: "L2_O>1 ? (W_C+W_F-1)*(H_C+H_F-1)*N_PA : 0" },
          { id: "row90", formula: "H_O>1 ? (W_C+W_F-1)*N_PA : 0" },
          { id: "row93", formula: "((H_O==1.5||H_O==2) ? (W_C+W_F-1) : (H_O==2.5||H_O==3||H_O==3.5||H_O==4) ? (W_C+W_F-1)*2 : 0) * N_PA" },
        ],
        reducer: "sum_max0",
        // Real catalog part number per row -- verified against EXT_REINF!M8:M93
        // (each accessories_rules.js row ID is the SAME row number as the
        // Excel sheet, and column M there holds the literal part number).
        // "materialPrefix" rows append "SA4" if the Bolts & Nuts spec ==
        // EXT_REINF!$E$21 option 2 ("EXT:HDG+INT:SS316"), else "SA2" --
        // matches BASIC_TOOL!$E$21 IFS: only option 2 yields 2, so every
        // other choice falls through to the SA2 branch. "byHeight"/
        // "byHeightMaterialLR" resolve a literal part by H_O (see
        // accessories_engine.js resolvePartNo()).
        partNumbers: {
          row8: "WFB-0450Z", row9: "WFB-0450ZP", row10: "WFB-0950Z",
          row11: "WFB-0950VZ", row12: "WFB-0450VZ", row13: "WFB-0950ZP",
          row14: "WFB-0880ZP",
          row16: "WCA-1000Z", row17: "WCA-1500Z", row18: "WCA-2000Z",
          row23: "WFR-1450Z", row24: "WFR-1950Z", row25: "WFR-2600Z",
          row26: "WFR-3100Z", row27: "WFR-3600Z", row28: "WFR-4100Z",
          row41: "WBR-12527Z", row45: "WBR-1750Z",
          row46: { byHeight: [{ maxH: 2.4999, part: "WBR-25251Z" }, { part: "WBR-25252Z" }] },
          row54: "WBR-75120Z", row56: "WCB-7070Z",
          row76: { materialPrefix: "WFB-0880P" }, row77: { materialPrefix: "WFB-0950" },
          row78: { materialPrefix: "WFB-0950P" }, row79: { materialPrefix: "WFB-0450" },
          row80: { materialPrefix: "WFB-0450P" }, row86: { materialPrefix: "WBR-1760" },
          row87: { materialPrefix: "WBR-9090" }, row88: { materialPrefix: "WBR-1716" },
          row89: { materialPrefix: "WCP-1616" }, row90: { materialPrefix: "WCP-1580" },
          row93: {
            byHeightMaterialLR: [
              { H: 1.5, base: "WFR-1295", lr: true }, { H: 2, base: "WFR-1795", lr: false },
              { H: 2.5, base: "WFR-2295", lr: true }, { H: 3, base: "WFR-2795", lr: false },
              { H: 3.5, base: "WFR-3295", lr: true }, { H: 4, base: "WFR-3795", lr: false },
            ],
          },
        },
      },
      internal: {
        intermediates: [
          { name: "totLC", formula: "L1_C+L2_C+L3_C+L4_C" },
          { name: "totLF", formula: "L1_F+L2_F+L3_F+L4_F" },
          { name: "perim", formula: "(W_C+W_F-1)+(L_C+L_F-1)" },
          { name: "perim3", formula: "perim-N_PA" },
        ],
        rows: [
          { id: "row8_W8", formula: "H_O>=2 ? 2*N_PA : 0" },
          { id: "row8_T8", formula: "(L2_O>0 && H_O>=3) ? (W_C+W_F-1)*N_PA : 0" },
          { id: "row9", formula: "(H_O>=3 ? (H_C-2)*W_C*N_PA : 0) + (H_O>1.5 ? (H_C+H_F-1)*W_C*N_PA : 0)" },
          { id: "row10", formula: "(H_O>=3 ? (H_C-2)*(W_C+W_F-1)*N_PA : 0) + (H_O>3 ? W_C*(H_C+H_F-3)*N_PA : 0) + (H_O>=3 ? 2*(H_C-2)*N_PA : 0)" },
          { id: "row11", formula: "(H_O>2 ? H_F*(W_C+W_F-1)*N_PA : 0) + (H_O>1.5 ? (H_C+H_F-1)*W_F*N_PA : 0)" },
          { id: "row12", formula: "H_O>2.5 ? (H_C+H_F-3)*W_F*N_PA : 0" },
          { id: "row13", formula: "(H_O>1 && L2_O>0) ? (W_C+W_F-1) : 0" },
          { id: "row18", formula: "(H_O>1 ? (W_C+W_F-1+L_C+L_F-1-N_PA)*2 : 0) + (H_O>1 ? (W_C+W_F-1)*N_PA : 0) + (H_O>=2.5 ? (H_C+H_F-2)*2*N_PA : 0)" },
          { id: "row19", formula: "(H_O>=2.5 ? (W_C+W_F-1+L_C+L_F-1-N_PA)*2*(H_C-1) : 0) + (H_O>1 ? (W_C+W_F-1)*(H_C+H_F-2)*N_PA : 0)" },
          { id: "row20", formula: "H_O>1 ? (W_C+W_F-1)*N_PA : 0" },
          { id: "row21", formula: "H_O>1 ? (W_C+W_F-1)*(H_C+H_F-2)*N_PA : 0" },
          { id: "row22", formula: "H_O>=3 ? 4*(H_C+H_F-2) : 0" },
          { id: "row25", formula: "H_O>=2 ? (W_C+W_F-1)*N_PA : 0" },
          { id: "row38", formula: "H_O>4 ? (W_F+totLF)*2 : 0" },
          { id: "row39", formula: "((H_O>1 ? (W_F+totLF)*2 : 0) + (H_O>3 ? (W_F+totLF)*2 : 0)) + (H_O>3 ? (W_F+totLF)*2 : 0) + ((L2_O>0 && H_O>1) ? W_F*N_PA : 0) + ((L2_O>0 && H_O>1) ? (H_F*2)*N_PA : 0)" },
          { id: "row40", formula: "H_O>1 ? (W_F+totLF)*2*(H_C+H_F-1) : 0" },
          { id: "row41", formula: "((H_O==4.5||H_O==5) ? (W_C+totLC)*2 : 0) + ((H_O==4||H_O==4.5) ? perim*2 : (H_O==5 ? perim*2*2 : 0))" },
          { id: "row42", formula: "((H_O>1 ? (W_C+totLC)*2 : 0) + (H_O>3 ? (W_C+totLC)*2 : 0)) + (H_O>3 ? (W_C+totLC)*2 : 0) + (H_O>2.5 ? perim*2*(H_C-2) : 0) + (H_O>=3 ? 4*2*(H_C-2) : 0) + ((L2_O>0 && H_O>1) ? W_C*N_PA : 0) + ((H_O>1 && L2_O>0) ? 2*(H_C+H_F-2)*N_PA : 0)" },
          { id: "row43", formula: "(H_O>2 ? (W_C+L_C)*2*(H_C+H_F-2) : 0) + (H_O>2 ? perim*2*(H_C+H_F-2) : 0)" },
          { id: "row45", formula: "H_O>1 ? perim*2 : 0" },
          { id: "row47", formula: "H_O==5 ? perim*2 : 0" },
          { id: "row48", formula: "(H_O==1?4:0)+(H_O==2.5?4:0)+(H_O==3?4:0)" },
          { id: "row49", formula: "(H_O==1.5?4:0)+(H_O==3.5?4:0)+(H_O==2.5?4:0)+(H_O==4.5?12:0)+(H_O==5?8:0)" },
          { id: "row50", formula: "(H_O==2?4:0)+(H_O==3.5?4:0)+(H_O==4?8:0)+(H_O==5?4:0)+(H_O==3?4:0)" },
          { id: "row51", formula: "(L2_O>0) ? ((H_O>=2?4*N_PA:0)+(H_O==1.5?2*N_PA:0)) : 0" },
          { id: "row52", formula: "(H_O>1 ? perim3*2 : 0) + (H_O>=3 ? 8*(H_C+H_F-2) : 0) + ((H_O>=2.5 && L2_O>0) ? (H_C+H_F-2)*2*N_PA : 0)" },
          { id: "row53", formula: "H_O>=2.5 ? perim3*2*(H_C+H_F-2) : 0" },
          { id: "row55", formula: "H_O>3 ? (W_F+W_C-1+totLC+totLF-1)*2 : 0" },
        ],
        reducer: "sum_max0",
        // Real catalog part number per row -- verified against
        // INT_REINF_INT!L8:L55 (row8_W8/row8_T8 are two Excel-cell-position
        // sub-terms of the SAME row 8 part -- combined into one BOM line).
        partNumbers: {
          row8_W8: { materialPrefix: "WFB-0880P" }, row8_T8: { materialPrefix: "WFB-0880P" },
          row9: { materialPrefix: "WFB-0950" }, row10: { materialPrefix: "WFB-0950P" },
          row11: { materialPrefix: "WFB-0450" }, row12: { materialPrefix: "WFB-0450P" },
          row13: { materialPrefix: "WFB-0880" },
          row18: { materialPrefix: "WCP-1760" }, row19: { materialPrefix: "WCP-17160" },
          row20: { materialPrefix: "WCP-1610" }, row21: { materialPrefix: "WCP-1616" },
          row22: { materialPrefix: "WBR-9090" }, row25: { materialPrefix: "WCP-1460" },
          row38: "WFB-0450ZL", row39: "WFB-0450ZP", row40: "WFB-0450Z",
          row41: "WFB-0950ZL", row42: "WFB-0950ZP", row43: "WFB-0950Z",
          row45: "WFB-1200Z", row47: "WFB-1450Z",
          row48: "WCA-1000Z", row49: "WCA-1500Z", row50: "WCA-2000Z",
          row51: "WFB-0880ZP", row52: "WCP-1610Z", row53: "WCP-1616Z",
          row55: "WBR-1740Z",
        },
      },
    },

    // -----------------------------------------------------------------------
    // Tie-Rod -- EXACTLY verified (8/8 LibreOffice scenarios). Only used
    // when reinforcing method = External (Internal never uses tie-rods --
    // INT_TIE_ROD sheet is dead/unreferenced in the original workbook).
    // Variables: W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F,
    // H_O, W_O, L1_O, L2_O, L3_O, L4_O.
    // Built-in functions available only inside this ruleset (registered by
    // accessories_engine.js from the tables below): layerFactor(H_O),
    // segCount(dimMeters).
    // -----------------------------------------------------------------------
    tieRod: {
      // Number of horizontal tie-rod layers by height. First matching row
      // (by ascending "maxH") wins; a row with no "maxH" is the fallback.
      layerFactorTable: [
        { maxH: 1, factor: 0 },
        { maxH: 2, factor: 1 },
        { factor: 2 },
      ],
      // Dimension (m) -> [count of 2000mm segments, count of 3000mm segments].
      // Every row also uses exactly one more "remainder" segment on top of
      // this (verified: every one of these 99 rows has exactly one non-zero
      // remainder-length flag), so segCount(dim) = count2000+count3000+1.
      segmentTable: [
        [1.0,0,0], [1.5,0,0], [2.0,0,0], [2.5,0,0], [3.0,1,0], [3.5,1,0],
        [4.0,0,1], [4.5,0,1], [5.0,0,1], [5.5,0,1], [6.0,1,1], [6.5,1,1],
        [7.0,0,2], [7.5,0,2], [8.0,0,2], [8.5,0,2], [9.0,1,2], [9.5,1,2],
        [10.0,0,3], [10.5,0,3], [11.0,0,3], [11.5,0,3], [12.0,1,3], [12.5,1,3],
        [13.0,1,3], [13.5,0,4], [14.0,0,4], [14.5,0,4], [15.0,1,4], [15.5,1,4],
        [16.0,0,5], [16.5,0,5], [17.0,0,5], [17.5,0,5], [18.0,1,5], [18.5,1,5],
        [19.0,0,6], [19.5,0,6], [20.0,0,6], [20.5,0,6], [21.0,1,6], [21.5,1,6],
        [22.0,0,7], [22.5,0,7], [23.0,0,7], [23.5,0,7], [24.0,1,7], [24.5,1,7],
        [25.0,0,8], [25.5,0,8], [26.0,0,8], [26.5,0,8], [27.0,1,8], [27.5,1,8],
        [28.0,0,9], [28.5,0,9], [29.0,0,9], [29.5,0,9], [30.0,1,9], [30.5,1,9],
        [31.0,0,10], [31.5,0,10], [32.0,0,10], [32.5,0,10], [33.0,1,10], [33.5,1,10],
        [34.0,0,11], [34.5,0,11], [35.0,0,11], [35.5,0,11], [36.0,1,11], [36.5,1,11],
        [37.0,0,12], [37.5,0,12], [38.0,0,12], [38.5,0,12], [39.0,1,12], [39.5,1,12],
        [40.0,0,13], [40.5,0,13], [41.0,0,13], [41.5,0,13], [42.0,1,13], [42.5,1,13],
        [43.0,0,14], [43.5,0,14], [44.0,0,14], [44.5,0,14], [45.0,1,14], [45.5,1,14],
        [46.0,0,15], [46.5,0,15], [47.0,0,15], [47.5,0,15], [48.0,1,15], [48.5,1,15],
        [49.0,0,16], [49.5,0,16], [50.0,0,16],
      ],
      intermediates: [
        { name: "layer", formula: "layerFactor(H_O)" },
        { name: "totalLenCourses", formula: "L1_C+L1_F+L2_C+L2_F+L3_C+L3_F+L4_C+L4_F" },
        { name: "M8", formula: "(totalLenCourses-1)*layer" },
        { name: "Q8", formula: "layer*(W_C+W_F-1)" },
        { name: "U8", formula: "L2_O>0 ? layer*(W_C+W_F-1) : 0" },
        { name: "Y8", formula: "L3_O>0 ? layer*(W_C+W_F-1) : 0" },
        { name: "AC8", formula: "L4_O>0 ? layer*(W_C+W_F-1) : 0" },
        { name: "segW", formula: "segCount(W_O)" },
        { name: "segL1", formula: "segCount(L1_O)" },
        { name: "segL2", formula: "L2_O>0 ? segCount(L2_O) : 0" },
        { name: "segL3", formula: "L3_O>0 ? segCount(L3_O) : 0" },
        { name: "segL4", formula: "L4_O>0 ? segCount(L4_O) : 0" },
        { name: "rodsW", formula: "segW*M8" },
        { name: "rodsL1", formula: "segL1*Q8" },
        { name: "rodsL2", formula: "segL2*U8" },
        { name: "rodsL3", formula: "segL3*Y8" },
        { name: "rodsL4", formula: "segL4*AC8" },
        { name: "row35", formula: "4*M8 + (L2_O>0?3:4)*Q8 + (L3_O>0?2:3)*U8 + (L4_O>0?2:3)*Y8 + (L4_O>0?3:0)*AC8" },
        { name: "row36", formula: "row35*2" },
        { name: "row37", formula: "(segW-1)*M8 + (segL1-(L2_O==0?1:0))*Q8 + (segL2+(L3_O>0?0:1))*U8 + (segL3-(L4_O>0?0:1))*Y8 + (segL4-(AC8>0?1:0))*AC8" },
        { name: "row38", formula: "(U8>0?1:0)*U8 + (Y8>0?1:0)*Y8 + (AC8>0?1:0)*AC8" },
      ],
      rows: [
        { id: "total", formula: "rodsW+rodsL1+rodsL2+rodsL3+rodsL4+row35+row36+row37+row38" },
      ],
      reducer: "sum_round_max0",
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AccessoriesRules;
  } else {
    global.AccessoriesRules = AccessoriesRules;
  }
})(typeof window !== "undefined" ? window : globalThis);
