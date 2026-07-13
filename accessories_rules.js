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
//   - boltsAndNuts: verified geometry-driven formulas, but within ~3-8%
//     margin of the original workbook's final consolidated total (BoltnNuts
//     sheet) -- not an exact reproduction.
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
    },

    // -----------------------------------------------------------------------
    // Bolts & Nuts -- verified geometry-driven, ~3-8% margin vs original.
    // Variables available to all formulas below: W_C, W_F, L_C, L_F, L1_C,
    // L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O,
    // L_O, RF (1=Internal reinforcing, 2=External), hasPartition (L2_O>0).
    // -----------------------------------------------------------------------
    boltsAndNuts: {
      intermediates: [
        { name: "C21", formula: "(H_O==1||H_O==1.5||H_O==2) ? 1 : (H_O==2.5||H_O==3||H_O==3.5||H_O==4) ? 2 : 0" },
        { name: "AP5", formula: "(8*W_C+4*W_F)*(L_C+L_F-1)" },
        { name: "AP6", formula: "L_O*8*(W_C+W_F-1)" },
        { name: "AP7", formula: "(L1_C+L2_C+L3_C+L4_C+W_C)*8*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*4*2" },
        { name: "AP9", formula: "AP5+AP6+AP7" },
        { name: "AP10", formula: "2*(AP5+AP6+AP7)" },
        { name: "AP12", formula: "(8*W_C+4*W_F)*(L_C+L_F-1)" },
        { name: "AP13", formula: "L_O*8*(W_C+W_F-1)" },
        { name: "AP24", formula: "(RF==2 && H_O==2) ? (W_C+W_F-1+L_C+L_F-1)*2*2 : (RF==1 && H_O>3) ? (W_C+W_F-1+L_C+L_F-1)*2*2 : 0" },
        { name: "AP14", formula: "(L1_C+L2_C+L3_C+L4_C+W_C)*8*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*4*2 - AP24" },
        { name: "AP15", formula: "AP12+AP13+AP14" },
        { name: "AP16", formula: "2*(AP12+AP13+AP14)" },
        { name: "AP18", formula: "H_O*((W_C+W_F-1)+(L_C+L_F-1))*2*8" },
        { name: "AP19", formula: "H_O>2 ? 8*(W_O+L_O)*2*(H_C+H_F-2) : 0" },
        { name: "AP22", formula: "H_O*8*2*4" },
        { name: "AP23", formula: "(RF==2 && H_O==1.5) ? ((W_O-1)+(L_O-1))*2*2 : 0" },
        { name: "AP25", formula: "(H_O==2.5?4:0)+(H_O==3?4:0)+(H_O==3.5?8:0)+(H_O==4?8:0)+(H_O==4.5?12:0)+(H_O==5?12:0)" },
        { name: "AP26", formula: "AP18+AP19+2*AP23+2*AP24+AP22+AP25" },
        { name: "AP27", formula: "2*(AP18+AP19+AP23+AP24+AP22+AP25)" },
        { name: "AP29", formula: "hasPartition ? H_O*8*2*N_PA : 0" },
        { name: "AP30", formula: "hasPartition ? W_O*8*N_PA : 0" },
        { name: "AP31", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*4 : 0)*N_PA : 0" },
        { name: "AP32", formula: "hasPartition ? (W_O*8*(H_O<2?0:(H_C+H_F-1)))*N_PA : 0" },
        { name: "AP33", formula: "hasPartition ? ((W_C+W_F-1)*H_O)*8*N_PA : 0" },
        { name: "AP34", formula: "AP29+AP30" },
        { name: "AP35", formula: "AP29+AP30" },
        { name: "AP36", formula: "AP32+AP33" },
        { name: "AP37", formula: "2*(AP32+AP33)" },
        { name: "AP38", formula: "AP31" },
        { name: "AP39", formula: "2*AP31" },
        { name: "AP41", formula: "((L1_C+L2_C+L3_C+L4_C+W_C)*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*2)*2" },
        { name: "AP42", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*((H_O==2.5?12:0)+(H_O==3?12:0)+(H_O==3.5?16:0)+(H_O==4?16:0)) : 0" },
        { name: "AP43", formula: "AP42+AP41" },
        { name: "AP44", formula: "(AP41+AP42)*2" },
        { name: "AP46", formula: "C21<=0 ? ((W_C+W_F+1)*4 + (H_O>2 ? (W_C+W_F+1)*4 : 0) + 2*(L_C+L_F-1)*(W_C+W_F+1) + ((RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*6 : 0)) * (C21==2?0:1) : 0" },
        { name: "AP47", formula: "AP46==0 ? 0 : (AP46 + (H_O>3 ? 4+(W_C+W_F-1)*2+(L_O-1)*2 : 4+(W_C+W_F-2)+(L_O-2)))" },
      ],
      rows: [
        { id: "AP5", formula: "AP5" }, { id: "AP6", formula: "AP6" }, { id: "AP7", formula: "AP7" },
        { id: "AP9", formula: "AP9" }, { id: "AP10", formula: "AP10" },
        { id: "AP12", formula: "AP12" }, { id: "AP13", formula: "AP13" }, { id: "AP14", formula: "AP14" },
        { id: "AP15", formula: "AP15" }, { id: "AP16", formula: "AP16" },
        { id: "AP18", formula: "AP18" }, { id: "AP19", formula: "AP19" },
        { id: "AP22", formula: "AP22" }, { id: "AP23", formula: "AP23" }, { id: "AP24", formula: "AP24" },
        { id: "AP25", formula: "AP25" }, { id: "AP26", formula: "AP26" }, { id: "AP27", formula: "AP27" },
        { id: "AP29", formula: "AP29" }, { id: "AP30", formula: "AP30" }, { id: "AP31", formula: "AP31" },
        { id: "AP32", formula: "AP32" }, { id: "AP33", formula: "AP33" }, { id: "AP34", formula: "AP34" },
        { id: "AP35", formula: "AP35" }, { id: "AP36", formula: "AP36" }, { id: "AP37", formula: "AP37" },
        { id: "AP38", formula: "AP38" }, { id: "AP39", formula: "AP39" },
        { id: "AP41", formula: "AP41" }, { id: "AP42", formula: "AP42" }, { id: "AP43", formula: "AP43" },
        { id: "AP44", formula: "AP44" }, { id: "AP46", formula: "AP46" }, { id: "AP47", formula: "AP47" },
      ],
      reducer: "sum_floor_max0",
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
