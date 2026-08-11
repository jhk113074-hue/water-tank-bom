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

  // Real catalog rod lengths (mm) for the Internal Tie-Rod system -- see
  // AccessoriesRules.tieRodInternal below. Hoisted out so both its
  // `catalogLengthsMm` field and its `rows` array can build off the same
  // list without duplicating the 25 literal numbers.
  const TIE_ROD_INTERNAL_CATALOG_LENGTHS_MM = [
    280, 380, 780, 880, 1000, 1280, 1380, 1780, 1880, 2000,
    2280, 2380, 2780, 2880, 3000, 3280, 3380, 3780, 3880, 4000,
    4280, 4380, 4780, 4880, 5000,
  ];

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
    // DEPRECATED for part-number selection (see steelSkidDetailed below,
    // which is now the real BOM source). Kept only because
    // steelSkidTotalLength() (the "자동계산" helper on the manual
    // "Skid Length (m)" field) still calls b42/b43/b44Formula -- that field
    // is informational only now and no longer feeds quantity/part selection.
    // -----------------------------------------------------------------------
    steelSkid: {
      b42Formula: "W*2",
      b43Formula: "(W_C+W_F+1)*Ltotal",
      b44Formula: "W*(Ltotal-1)",
      // NOTE (superseded): this mainRailByHeight/heightBracket pair modeled
      // BASIC_TOOL!C20's "Default/U Channel-100/U Channel-125/Except Steel
      // Skid" dropdown (C21 IFS -> option 1/2/4), which is a simplified
      // "one generic SKU x total meters" system (WFF-100U/125U). Real-world
      // usage turned out to require the sheet's OTHER Steel Skid catalog --
      // three parallel, fully length-segmented part families (75mm Angle /
      // 125mm Channel / 150mm Channel) in Steel_Skid!AM:AP rows 8-36 -- see
      // steelSkidDetailed below, which replaces this for the real BOM.
      mainRailByHeight: [
        { maxH: 2, partNo: "WFF-100U", label: "100x50mm U Channel (Skid Frame, 1.0~2.0mH)" },
        { maxH: Infinity, partNo: "WFF-125U", label: "125x65mm U Channel (Skid Frame, 2.5mH~)" },
      ],
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
    // Steel Skid (REAL system) -- FULLY re-derived from Steel_Skid!AM8:AP53
    // in the original workbook (three parallel part families: 75mm Angle /
    // 125mm Channel / 150mm Channel-Heavy). Verified exactly against the
    // sheet's own cached values for the same saved scenario used elsewhere
    // in this file (W=3.5, L1=3, L2=3, H=1.5mH, N_PA=1): 9 distinct rows
    // fire with qty 10/0/2/12/10/10/5/5/161/10 (row9's WBR-0160Z family is
    // correctly 0 for this scenario) -- see accessories_engine.js
    // steelSkidDetailedParts() for the Node cross-check.
    //
    // IMPORTANT CONTEXT: this AM/AN/AO table is present in the original
    // sheet but its "compacted display" columns (Steel_Skid!N:S) are NOT
    // wired into that workbook's own PRINTOUT(BOM) (which only pulls the
    // separate, simpler steelSkid.mainRailByHeight system above via
    // BASIC_TOOL!C20/C21). Despite that, this IS the catalog actually used
    // in practice (confirmed by the person building this app), so it now
    // drives the real "Steel Skid Type" selector and BOM output here --
    // the simpler U-channel system above is kept only for the legacy
    // steelSkidTotalLength() helper.
    //
    // Variables available to all formulas below: W_C, W_F, W_O, L1_C, L1_F,
    // L1_O, L2_C, L2_F, L2_O, L3_C, L3_F, L3_O, L4_C, L4_F, L4_O, H_O, L_O
    // (=L1_O+L2_O+L3_O+L4_O), L_O_C, L_O_F (total course-count sums, i.e.
    // g.L_C_sum/g.L_F_sum).
    //
    // Rows 23-26 (support beam + I-beam/C-channel connector, only active for
    // H_O>=2.5) have NO "angle75" part -- confirmed against the original
    // sheet's AM column being blank there, i.e. the 75mm-Angle skid type
    // genuinely uses no extra height bracket at any height.
    //
    // 12 of the ~40 real part numbers this table references (the "150mm
    // Channel / HCLZ" main-rail variants, plus a handful of "CMZ"/near-twin
    // sub-channel and connector SKUs) have NO entry anywhere in the original
    // PART_ID_TABLE catalog -- confirmed missing, not just unmapped. These
    // were added to parts_db.json with weight/price=0 (unknown) rather than
    // fabricated, mirroring the naming pattern of their 75mm-Angle/125mm-
    // Channel siblings; see parts_db.json entries tagged "no catalog record
    // - added" for the exact list.
    // -----------------------------------------------------------------------
    steelSkidDetailed: {
      typeOptions: [
        { value: "angle75", label: "75mm Angle (75각)" },
        { value: "channel125", label: "125mm Channel (125채널)" },
        { value: "channel150", label: "150mm Channel (Heavy)" },
        { value: "ibeam", label: "I-Beam (I빔)" },
        { value: "sqp", label: "SQP (사각파이프)" },
      ],
      rows: [
        { id: "row8", formula: "(W_C+W_F+1)*2",
          parts: { angle75: "WBR-7575Z", channel125: "WBR-0120Z", channel150: "WBR-0150Z" } },
        { id: "row9", formula: "(((((W_O%2)==1?2:0)+(W_O==1.5?2:0)+trunc(W_O/2)*2+((W_O%2)==0.5?2:0))/2)-1)*2",
          parts: { angle75: "WBR-0160Z", channel125: "WBR-9016CZ", channel150: "WBR-1016CZ" } },
        { id: "row11", formula: "L_O_F*(W_C+W_F+1) + (W_F==1?2:0)",
          parts: { angle75: "WFF-1490ALZ", channel125: "WFF-1490CLZ", channel150: "WFF-1490HCLZ" } },
        { id: "row12", formula: "((L1_F>0?trunc((L1_O-1.5)/2):trunc(L1_O/2))+(L2_F>0?trunc((L2_O-1.5)/2):trunc(L2_O/2))+(L3_F>0?trunc((L3_O-1.5)/2):trunc(L3_O/2))+(L4_F>0?trunc((L4_O-1.5)/2):trunc(L4_O/2)))*(W_C+W_F+1)",
          parts: { angle75: "WFF-1990ALZ", channel125: "WFF-1990CLZ", channel150: "WFF-1990HCLZ" } },
        { id: "row13", formula: "((L1_F>0?((L1_O-1.5)%2):(L1_O%2))+(L2_F>0?((L2_O-1.5)%2):(L2_O%2))+(L3_F>0?((L3_O-1.5)%2):(L3_O%2))+(L4_F>0?((L4_O-1.5)%2):(L4_O%2)))*(W_C+W_F+1) + (W_O==1?0:(W_F>0?((W_O-1.5)%2)*2:(W_O%2)*2))",
          parts: { angle75: "WFF-0990ALZ", channel125: "WFF-0990CLZ", channel150: "WFF-0990HCLZ" } },
        { id: "row16", formula: "(W_O==1?1:0)*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-0990AMZ", channel125: "WFF-0990AMZ", channel150: "WFF-0990CMZ" } },
        { id: "row17", formula: "(W_O==1.5?1:0)*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-0526AMZ", channel125: "WFF-0521AMZ", channel150: "WFF-0526CMZ" } },
        { id: "row18", formula: "(W_O==1.5?1:(W_O==2?1:(W_O>=2.5?2:0)))*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-0962AMZ", channel125: "WFF-0962AMZ", channel150: "WFF-0957CMZ" } },
        { id: "row19", formula: "(trunc(W_O)==W_O?0:(W_O>=2.5?1:0))*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-0563AMZ", channel125: "WFF-0553AMZ", channel150: "WFF-0553CMZ" } },
        { id: "row20", formula: "(W_O>=3?(trunc(W_O)==W_O?1:0):0)*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-1063AMZ", channel125: "WFF-1053AMZ", channel150: "WFF-1063CMZ" } },
        { id: "row21", formula: "(W_O==2?1:0)*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-1021AMZ", channel125: "WFF-1021AMZ", channel150: "WFF-1026CMZ" } },
        { id: "row22", formula: "(W_O>=3.5?(round(W_O)-3):0)*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)-1)",
          parts: { angle75: "WFF-0994AMZ", channel125: "WFF-0994AMZ", channel150: "WFF-0994CMZ" } },
        { id: "row23", formula: "(H_O>3&&H_O<=4?(L_O_C+L_O_F-1)*2:0)+(H_O>3&&H_O<=4?(W_C+W_F-1)*2:0)",
          parts: { channel125: "WFF-12540Z", channel150: "WFF-12540Z" } },
        { id: "row24", formula: "(H_O==3?(L_O_C+L_O_F-1)*2:0)+(H_O==3?(W_C+W_F-1)*2:0)",
          parts: { channel125: "WFF-12535Z", channel150: "WFF-12535Z" } },
        { id: "row25", formula: "(H_O==2.5?(L_O_C+L_O_F-1)*2:0)+(H_O==2.5?(W_C+W_F-1)*2:0)",
          parts: { channel125: "WFF-12530Z", channel150: "WFF-12530Z" } },
        { id: "row26", formula: "(H_O>2?(L_O_C+L_O_F-1)*2:0)*2+(H_O>2?(W_C+W_F-1)*2:0)*2",
          parts: { channel125: "WBR-1111Z", channel150: "WBR-1111Z" } },
        { id: "row35", formula: "ceil((W_C+W_F+1)*(ceil(L1_O)+ceil(L2_O)+ceil(L3_O)+ceil(L4_O)+1)*4.6)",
          parts: { angle75: "LNR-5.0T", channel125: "LNR-5.0T", channel150: "LNR-5.0T" } },
        { id: "row36", formula: "H_O>3?(4+(W_C+W_F-1)*2+(L_O-1)*2):(4+(W_C+W_F-2)+(L_O-2))",
          parts: { angle75: "WBR-5010Z", channel125: "WBR-5010Z", channel150: "WBR-5010Z" } },
      ],
          matrixData: {
  "mainCols": [
    1100,
    1600,
    2100,
    2600,
    3000,
    3022.5,
    3077.5,
    3100,
    3577.5,
    3600,
    4000,
    4022.5,
    4077.5,
    4100,
    4577.5,
    4600,
    5000,
    5022.5,
    5077.5,
    5100,
    5577.5,
    5600,
    6000,
    6100
  ],
  "sideCols": [
    1860,
    2360,
    2860,
    2957.5,
    3000,
    3360,
    3402.5,
    3457.5,
    3860,
    3957.5,
    4000,
    4360,
    4402.5,
    4457.5,
    4860,
    4957.5,
    5000,
    5360,
    5402.5,
    5457.5,
    5860,
    5957.5,
    6000
  ],
  "mainMatrix": [
    {
      "1100": 1,
      "Length": 1,
      "Total ": 1100
    },
    {
      "1600": 1,
      "Length": 1.5,
      "Total ": 1600
    },
    {
      "2100": 1,
      "Length": 2,
      "Total ": 2100
    },
    {
      "2600": 1,
      "Length": 2.5,
      "Total ": 2600
    },
    {
      "3100": 1,
      "Length": 3,
      "Total ": 3100
    },
    {
      "3600": 1,
      "Length": 3.5,
      "Total ": 3600
    },
    {
      "4100": 1,
      "Length": 4,
      "Total ": 4100
    },
    {
      "4600": 1,
      "Length": 4.5,
      "Total ": 4600
    },
    {
      "5100": 1,
      "Length": 5,
      "Total ": 5100
    },
    {
      "5600": 1,
      "Length": 5.5,
      "Total ": 5600
    },
    {
      "6100": 1,
      "Length": 6,
      "Total ": 6100
    },
    {
      "Length": 6.5,
      "3022.5": 1,
      "3577.5": 1,
      "Total ": 6600
    },
    {
      "Length": 7,
      "3077.5": 1,
      "4022.5": 1,
      "Total ": 7100
    },
    {
      "Length": 7.5,
      "3577.5": 1,
      "4022.5": 1,
      "Total ": 7600
    },
    {
      "Length": 8,
      "4022.5": 1,
      "4077.5": 1,
      "Total ": 8100
    },
    {
      "Length": 8.5,
      "4022.5": 1,
      "4577.5": 1,
      "Total ": 8600
    },
    {
      "Length": 9,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 9100
    },
    {
      "Length": 9.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 9600
    },
    {
      "Length": 10,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 10100
    },
    {
      "Length": 10.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 10600
    },
    {
      "3000": 1,
      "Length": 11,
      "4022.5": 1,
      "4077.5": 1,
      "Total ": 11100
    },
    {
      "3000": 1,
      "Length": 11.5,
      "4022.5": 1,
      "4577.5": 1,
      "Total ": 11600
    },
    {
      "3000": 1,
      "Length": 12,
      "4022.5": 1,
      "5077.5": 1,
      "Total ": 12100
    },
    {
      "4000": 1,
      "Length": 12.5,
      "4022.5": 1,
      "4577.5": 1,
      "Total ": 12600
    },
    {
      "4000": 1,
      "Length": 13,
      "4022.5": 1,
      "5077.5": 1,
      "Total ": 13100
    },
    {
      "4000": 1,
      "Length": 13.5,
      "4022.5": 1,
      "5577.5": 1,
      "Total ": 13600
    },
    {
      "4000": 1,
      "Length": 14,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 14100
    },
    {
      "4000": 1,
      "Length": 14.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 14600
    },
    {
      "5000": 1,
      "Length": 15,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 15100
    },
    {
      "5000": 1,
      "Length": 15.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 15600
    },
    {
      "6000": 1,
      "Length": 16,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 16100
    },
    {
      "6000": 1,
      "Length": 16.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 16600
    },
    {
      "3000": 1,
      "4000": 1,
      "Length": 17,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 17100
    },
    {
      "4000": 2,
      "Length": 17.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 17600
    },
    {
      "4000": 2,
      "Length": 18,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 18100
    },
    {
      "4000": 1,
      "5000": 1,
      "Length": 18.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 18600
    },
    {
      "5000": 2,
      "Length": 19,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 19100
    },
    {
      "5000": 2,
      "Length": 19.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 19600
    },
    {
      "5000": 2,
      "Length": 20,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 20100
    },
    {
      "5000": 2,
      "Length": 20.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 20600
    },
    {
      "5000": 1,
      "6000": 1,
      "Length": 21,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 21100
    },
    {
      "5000": 1,
      "6000": 1,
      "Length": 21.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 21600
    },
    {
      "6000": 2,
      "Length": 22,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 22100
    },
    {
      "6000": 2,
      "Length": 22.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 22600
    },
    {
      "4000": 1,
      "5000": 2,
      "Length": 23,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 23100
    },
    {
      "4000": 1,
      "5000": 2,
      "Length": 23.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 23600
    },
    {
      "5000": 3,
      "Length": 24,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 24100
    },
    {
      "5000": 3,
      "Length": 24.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 24600
    },
    {
      "5000": 2,
      "6000": 1,
      "Length": 25,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 25100
    },
    {
      "5000": 2,
      "6000": 1,
      "Length": 25.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 25600
    },
    {
      "5000": 1,
      "6000": 2,
      "Length": 26,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 26100
    },
    {
      "5000": 1,
      "6000": 2,
      "Length": 26.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 26600
    },
    {
      "6000": 3,
      "Length": 27,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 27100
    },
    {
      "6000": 3,
      "Length": 27.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 27600
    },
    {
      "6000": 3,
      "Length": 28,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 28100
    },
    {
      "6000": 3,
      "Length": 28.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 28600
    },
    {
      "5000": 4,
      "Length": 29,
      "4077.5": 1,
      "5022.5": 1,
      "Total ": 29100
    },
    {
      "5000": 4,
      "Length": 29.5,
      "4577.5": 1,
      "5022.5": 1,
      "Total ": 29600
    },
    {
      "5000": 4,
      "Length": 30,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 30100
    },
    {
      "5000": 4,
      "Length": 30.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 30600
    },
    {
      "5000": 3,
      "6000": 1,
      "Length": 31,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 31100
    },
    {
      "5000": 3,
      "6000": 1,
      "Length": 31.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 31600
    },
    {
      "5000": 2,
      "6000": 2,
      "Length": 32,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 32100
    },
    {
      "5000": 2,
      "6000": 2,
      "Length": 32.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 32600
    },
    {
      "5000": 1,
      "6000": 3,
      "Length": 33,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 33100
    },
    {
      "5000": 1,
      "6000": 3,
      "Length": 33.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 33600
    },
    {
      "6000": 4,
      "Length": 34,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 34100
    },
    {
      "6000": 4,
      "Length": 34.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 34600
    },
    {
      "5000": 5,
      "Length": 35,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 35100
    },
    {
      "5000": 5,
      "Length": 35.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 35600
    },
    {
      "5000": 4,
      "6000": 1,
      "Length": 36,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 36100
    },
    {
      "5000": 4,
      "6000": 1,
      "Length": 36.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 36600
    },
    {
      "5000": 3,
      "6000": 2,
      "Length": 37,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 37100
    },
    {
      "5000": 3,
      "6000": 2,
      "Length": 37.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 37600
    },
    {
      "5000": 2,
      "6000": 3,
      "Length": 38,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 38100
    },
    {
      "5000": 2,
      "6000": 3,
      "Length": 38.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 38600
    },
    {
      "5000": 1,
      "6000": 4,
      "Length": 39,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 39100
    },
    {
      "5000": 1,
      "6000": 4,
      "Length": 39.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 39600
    },
    {
      "6000": 5,
      "Length": 40,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 40100
    },
    {
      "6000": 5,
      "Length": 40.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 40600
    },
    {
      "5000": 5,
      "6000": 1,
      "Length": 41,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 41100
    },
    {
      "5000": 5,
      "6000": 1,
      "Length": 41.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 41600
    },
    {
      "5000": 4,
      "6000": 2,
      "Length": 42,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 42100
    },
    {
      "5000": 4,
      "6000": 2,
      "Length": 42.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 42600
    },
    {
      "5000": 3,
      "6000": 3,
      "Length": 43,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 43100
    },
    {
      "5000": 3,
      "6000": 3,
      "Length": 43.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 43600
    },
    {
      "5000": 2,
      "6000": 4,
      "Length": 44,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 44100
    },
    {
      "5000": 2,
      "6000": 4,
      "Length": 44.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 44600
    },
    {
      "5000": 1,
      "6000": 5,
      "Length": 45,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 45100
    },
    {
      "5000": 1,
      "6000": 5,
      "Length": 45.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 45600
    },
    {
      "6000": 6,
      "Length": 46,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 46100
    },
    {
      "6000": 6,
      "Length": 46.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 46600
    },
    {
      "5000": 5,
      "6000": 2,
      "Length": 47,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 47100
    },
    {
      "5000": 5,
      "6000": 2,
      "Length": 47.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 47600
    },
    {
      "5000": 4,
      "6000": 3,
      "Length": 48,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 48100
    },
    {
      "5000": 4,
      "6000": 3,
      "Length": 48.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 48600
    },
    {
      "5000": 3,
      "6000": 4,
      "Length": 49,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 49100
    },
    {
      "5000": 3,
      "6000": 4,
      "Length": 49.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 49600
    },
    {
      "5000": 2,
      "6000": 5,
      "Length": 50,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 50100
    },
    {
      "5000": 2,
      "6000": 5,
      "Length": 50.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 50600
    },
    {
      "5000": 1,
      "6000": 6,
      "Length": 51,
      "5022.5": 1,
      "5077.5": 1,
      "Total ": 51100
    },
    {
      "5000": 1,
      "6000": 6,
      "Length": 51.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 51600
    },
    {
      "5000": 1,
      "5100": 1,
      "6000": 7,
      "Length": 52,
      "Total ": 52100
    },
    {
      "6000": 7,
      "Length": 52.5,
      "5022.5": 1,
      "5577.5": 1,
      "Total ": 52600
    },
    {
      "5100": 1,
      "6000": 8,
      "Length": 53,
      "Total ": 53100
    },
    {
      "5600": 1,
      "6000": 8,
      "Length": 53.5,
      "Total ": 53600
    },
    {
      "3000": 1,
      "3100": 1,
      "6000": 8,
      "Length": 54,
      "Total ": 54100
    },
    {
      "6000": 8,
      "Length": 54.5,
      "3022.5": 1,
      "3577.5": 1,
      "Total ": 54600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 8,
      "Length": 55,
      "Total ": 55100
    },
    {
      "6000": 8,
      "Length": 55.5,
      "3577.5": 1,
      "4022.5": 1,
      "Total ": 55600
    },
    {
      "2100": 1,
      "6000": 9,
      "Length": 56,
      "Total ": 56100
    },
    {
      "2600": 1,
      "6000": 9,
      "Length": 56.5,
      "Total ": 56600
    },
    {
      "3100": 1,
      "6000": 9,
      "Length": 57,
      "Total ": 57100
    },
    {
      "3600": 1,
      "6000": 9,
      "Length": 57.5,
      "Total ": 57600
    },
    {
      "4100": 1,
      "6000": 9,
      "Length": 58,
      "Total ": 58100
    },
    {
      "4600": 1,
      "6000": 9,
      "Length": 58.5,
      "Total ": 58600
    },
    {
      "5100": 1,
      "6000": 9,
      "Length": 59,
      "Total ": 59100
    },
    {
      "5600": 1,
      "6000": 9,
      "Length": 59.5,
      "Total ": 59600
    },
    {
      "3000": 1,
      "3100": 1,
      "6000": 9,
      "Length": 60,
      "Total ": 60100
    },
    {
      "3000": 1,
      "3600": 1,
      "6000": 9,
      "Length": 60.5,
      "Total ": 60600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 9,
      "Length": 61,
      "Total ": 61100
    },
    {
      "2600": 1,
      "5000": 1,
      "6000": 9,
      "Length": 61.5,
      "Total ": 61600
    },
    {
      "2100": 1,
      "6000": 10,
      "Length": 62,
      "Total ": 62100
    },
    {
      "2600": 1,
      "6000": 10,
      "Length": 62.5,
      "Total ": 62600
    },
    {
      "3100": 1,
      "6000": 10,
      "Length": 63,
      "Total ": 63100
    },
    {
      "3600": 1,
      "6000": 10,
      "Length": 63.5,
      "Total ": 63600
    },
    {
      "4100": 1,
      "6000": 10,
      "Length": 64,
      "Total ": 64100
    },
    {
      "4600": 1,
      "6000": 10,
      "Length": 64.5,
      "Total ": 64600
    },
    {
      "5100": 1,
      "6000": 10,
      "Length": 65,
      "Total ": 65100
    },
    {
      "5600": 1,
      "6000": 10,
      "Length": 65.5,
      "Total ": 65600
    },
    {
      "2100": 1,
      "4000": 1,
      "6000": 10,
      "Length": 66,
      "Total ": 66100
    },
    {
      "1600": 1,
      "5000": 1,
      "6000": 10,
      "Length": 66.5,
      "Total ": 66600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 10,
      "Length": 67,
      "Total ": 67100
    },
    {
      "2600": 1,
      "5000": 1,
      "6000": 10,
      "Length": 67.5,
      "Total ": 67600
    },
    {
      "2100": 1,
      "6000": 11,
      "Length": 68,
      "Total ": 68100
    },
    {
      "2600": 1,
      "6000": 11,
      "Length": 68.5,
      "Total ": 68600
    },
    {
      "3100": 1,
      "6000": 11,
      "Length": 69,
      "Total ": 69100
    },
    {
      "3600": 1,
      "6000": 11,
      "Length": 69.5,
      "Total ": 69600
    },
    {
      "4100": 1,
      "6000": 11,
      "Length": 70,
      "Total ": 70100
    },
    {
      "4600": 1,
      "6000": 11,
      "Length": 70.5,
      "Total ": 70600
    },
    {
      "5100": 1,
      "6000": 11,
      "Length": 71,
      "Total ": 71100
    },
    {
      "5600": 1,
      "6000": 11,
      "Length": 71.5,
      "Total ": 71600
    },
    {
      "2100": 1,
      "4000": 1,
      "6000": 11,
      "Length": 72,
      "Total ": 72100
    },
    {
      "1600": 1,
      "5000": 1,
      "6000": 11,
      "Length": 72.5,
      "Total ": 72600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 11,
      "Length": 73,
      "Total ": 73100
    },
    {
      "2600": 1,
      "5000": 1,
      "6000": 11,
      "Length": 73.5,
      "Total ": 73600
    },
    {
      "3100": 1,
      "5000": 1,
      "6000": 11,
      "Length": 74,
      "Total ": 74100
    },
    {
      "3600": 1,
      "5000": 1,
      "6000": 11,
      "Length": 74.5,
      "Total ": 74600
    },
    {
      "4100": 1,
      "5000": 1,
      "6000": 11,
      "Length": 75,
      "Total ": 75100
    },
    {
      "4600": 1,
      "5000": 1,
      "6000": 11,
      "Length": 75.5,
      "Total ": 75600
    },
    {
      "5000": 1,
      "5100": 1,
      "6000": 11,
      "Length": 76,
      "Total ": 76100
    },
    {
      "5000": 1,
      "5600": 1,
      "6000": 11,
      "Length": 76.5,
      "Total ": 76600
    },
    {
      "5100": 1,
      "6000": 12,
      "Length": 77,
      "Total ": 77100
    },
    {
      "5600": 1,
      "6000": 12,
      "Length": 77.5,
      "Total ": 77600
    },
    {
      "2100": 1,
      "4000": 1,
      "6000": 12,
      "Length": 78,
      "Total ": 78100
    },
    {
      "2600": 1,
      "4000": 1,
      "6000": 12,
      "Length": 78.5,
      "Total ": 78600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 12,
      "Length": 79,
      "Total ": 79100
    },
    {
      "2600": 1,
      "5000": 1,
      "6000": 12,
      "Length": 79.5,
      "Total ": 79600
    },
    {
      "3100": 1,
      "5000": 1,
      "6000": 12,
      "Length": 80,
      "Total ": 80100
    },
    {
      "3600": 1,
      "5000": 1,
      "6000": 12,
      "Length": 80.5,
      "Total ": 80600
    },
    {
      "4100": 1,
      "5000": 1,
      "6000": 12,
      "Length": 81,
      "Total ": 81100
    },
    {
      "4600": 1,
      "5000": 1,
      "6000": 12,
      "Length": 81.5,
      "Total ": 81600
    },
    {
      "5000": 1,
      "5100": 1,
      "6000": 12,
      "Length": 82,
      "Total ": 82100
    },
    {
      "5000": 1,
      "5600": 1,
      "6000": 12,
      "Length": 82.5,
      "Total ": 82600
    },
    {
      "5100": 1,
      "6000": 13,
      "Length": 83,
      "Total ": 83100
    },
    {
      "5600": 1,
      "6000": 13,
      "Length": 83.5,
      "Total ": 83600
    },
    {
      "2100": 1,
      "4000": 1,
      "6000": 13,
      "Length": 84,
      "Total ": 84100
    },
    {
      "1600": 1,
      "5000": 1,
      "6000": 13,
      "Length": 84.5,
      "Total ": 84600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 13,
      "Length": 85,
      "Total ": 85100
    },
    {
      "2600": 1,
      "5000": 1,
      "6000": 13,
      "Length": 85.5,
      "Total ": 85600
    },
    {
      "3100": 1,
      "5000": 1,
      "6000": 13,
      "Length": 86,
      "Total ": 86100
    },
    {
      "3600": 1,
      "5000": 1,
      "6000": 13,
      "Length": 86.5,
      "Total ": 86600
    },
    {
      "4100": 1,
      "5000": 1,
      "6000": 13,
      "Length": 87,
      "Total ": 87100
    },
    {
      "4600": 1,
      "5000": 1,
      "6000": 13,
      "Length": 87.5,
      "Total ": 87600
    },
    {
      "5000": 1,
      "5100": 1,
      "6000": 13,
      "Length": 88,
      "Total ": 88100
    },
    {
      "4600": 1,
      "6000": 14,
      "Length": 88.5,
      "Total ": 88600
    },
    {
      "5100": 1,
      "6000": 14,
      "Length": 89,
      "Total ": 89100
    },
    {
      "5600": 1,
      "6000": 14,
      "Length": 89.5,
      "Total ": 89600
    },
    {
      "2100": 1,
      "4000": 1,
      "6000": 14,
      "Length": 90,
      "Total ": 90100
    },
    {
      "1600": 1,
      "5000": 1,
      "6000": 14,
      "Length": 90.5,
      "Total ": 90600
    },
    {
      "2100": 1,
      "5000": 1,
      "6000": 14,
      "Length": 91,
      "Total ": 91100
    },
    {
      "2600": 1,
      "5000": 1,
      "6000": 14,
      "Length": 91.5,
      "Total ": 91600
    },
    {
      "3100": 1,
      "5000": 1,
      "6000": 14,
      "Length": 92,
      "Total ": 92100
    },
    {
      "3600": 1,
      "5000": 1,
      "6000": 14,
      "Length": 92.5,
      "Total ": 92600
    },
    {
      "4100": 1,
      "5000": 1,
      "6000": 14,
      "Length": 93,
      "Total ": 93100
    },
    {
      "4600": 1,
      "5000": 1,
      "6000": 14,
      "Length": 93.5,
      "Total ": 93600
    },
    {
      "4100": 1,
      "6000": 15,
      "Length": 94,
      "Total ": 94100
    },
    {
      "4600": 1,
      "6000": 15,
      "Length": 94.5,
      "Total ": 94600
    },
    {
      "5100": 1,
      "6000": 15,
      "Length": 95,
      "Total ": 95100
    },
    {
      "5600": 1,
      "6000": 15,
      "Length": 95.5,
      "Total ": 95600
    },
    {
      "2100": 1,
      "4000": 1,
      "6000": 15,
      "Length": 96,
      "Total ": 96100
    }
  ],
  "sideMatrix": [
    {
      "1860": 1,
      "Length": 1,
      "Total ": 1860
    },
    {
      "2360": 1,
      "Length": 1.5,
      "Total ": 2360
    },
    {
      "2860": 1,
      "Length": 2,
      "Total ": 2860
    },
    {
      "3360": 1,
      "Length": 2.5,
      "Total ": 3360
    },
    {
      "3860": 1,
      "Length": 3,
      "Total ": 3860
    },
    {
      "4360": 1,
      "Length": 3.5,
      "Total ": 4360
    },
    {
      "4860": 1,
      "Length": 4,
      "Total ": 4860
    },
    {
      "5360": 1,
      "Length": 4.5,
      "Total ": 5360
    },
    {
      "5860": 1,
      "Length": 5,
      "Total ": 5860
    },
    {
      "Length": 5.5,
      "2957.5": 1,
      "3402.5": 1,
      "Total ": 6360
    },
    {
      "Length": 6,
      "3402.5": 1,
      "3457.5": 1,
      "Total ": 6860
    },
    {
      "Length": 6.5,
      "3402.5": 1,
      "3957.5": 1,
      "Total ": 7360
    },
    {
      "Length": 7,
      "3457.5": 1,
      "4402.5": 1,
      "Total ": 7860
    },
    {
      "Length": 7.5,
      "3957.5": 1,
      "4402.5": 1,
      "Total ": 8360
    },
    {
      "Length": 8,
      "4402.5": 1,
      "4457.5": 1,
      "Total ": 8860
    },
    {
      "Length": 8.5,
      "4402.5": 1,
      "4957.5": 1,
      "Total ": 9360
    },
    {
      "Length": 9,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 9860
    },
    {
      "Length": 9.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 10360
    },
    {
      "Length": 10,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 10860
    },
    {
      "Length": 10.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 11360
    },
    {
      "3000": 1,
      "Length": 11,
      "4402.5": 1,
      "4457.5": 1,
      "Total ": 11860
    },
    {
      "3000": 1,
      "Length": 11.5,
      "4402.5": 1,
      "4957.5": 1,
      "Total ": 12360
    },
    {
      "3000": 1,
      "Length": 12,
      "4402.5": 1,
      "5457.5": 1,
      "Total ": 12860
    },
    {
      "4000": 1,
      "Length": 12.5,
      "4402.5": 1,
      "4957.5": 1,
      "Total ": 13360
    },
    {
      "4000": 1,
      "Length": 13,
      "4402.5": 1,
      "5457.5": 1,
      "Total ": 13860
    },
    {
      "4000": 1,
      "Length": 13.5,
      "4402.5": 1,
      "5957.5": 1,
      "Total ": 14360
    },
    {
      "4000": 1,
      "Length": 14,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 14860
    },
    {
      "4000": 1,
      "Length": 14.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 15360
    },
    {
      "5000": 1,
      "Length": 15,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 15860
    },
    {
      "5000": 1,
      "Length": 15.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 16360
    },
    {
      "6000": 1,
      "Length": 16,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 16860
    },
    {
      "6000": 1,
      "Length": 16.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 17360
    },
    {
      "3000": 1,
      "4000": 1,
      "Length": 17,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 17860
    },
    {
      "4000": 2,
      "Length": 17.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 18360
    },
    {
      "4000": 2,
      "Length": 18,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 18860
    },
    {
      "4000": 1,
      "5000": 1,
      "Length": 18.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 19360
    },
    {
      "5000": 2,
      "Length": 19,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 19860
    },
    {
      "5000": 2,
      "Length": 19.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 20360
    },
    {
      "5000": 2,
      "Length": 20,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 20860
    },
    {
      "5000": 2,
      "Length": 20.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 21360
    },
    {
      "5000": 1,
      "6000": 1,
      "Length": 21,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 21860
    },
    {
      "5000": 1,
      "6000": 1,
      "Length": 21.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 22360
    },
    {
      "6000": 2,
      "Length": 22,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 22860
    },
    {
      "6000": 2,
      "Length": 22.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 23360
    },
    {
      "4000": 1,
      "5000": 2,
      "Length": 23,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 23860
    },
    {
      "4000": 1,
      "5000": 2,
      "Length": 23.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 24360
    },
    {
      "4860": 1,
      "5000": 4,
      "Length": 24,
      "Total ": 24860
    },
    {
      "5000": 3,
      "Length": 24.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 25360
    },
    {
      "5000": 2,
      "6000": 1,
      "Length": 25,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 25860
    },
    {
      "5000": 2,
      "6000": 1,
      "Length": 25.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 26360
    },
    {
      "5000": 1,
      "6000": 2,
      "Length": 26,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 26860
    },
    {
      "5000": 1,
      "6000": 2,
      "Length": 26.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 27360
    },
    {
      "6000": 3,
      "Length": 27,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 27860
    },
    {
      "6000": 3,
      "Length": 27.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 28360
    },
    {
      "6000": 3,
      "Length": 28,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 28860
    },
    {
      "6000": 3,
      "Length": 28.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 29360
    },
    {
      "5000": 4,
      "Length": 29,
      "4457.5": 1,
      "5402.5": 1,
      "Total ": 29860
    },
    {
      "5000": 4,
      "Length": 29.5,
      "4957.5": 1,
      "5402.5": 1,
      "Total ": 30360
    },
    {
      "5000": 4,
      "Length": 30,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 30860
    },
    {
      "5000": 4,
      "Length": 30.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 31360
    },
    {
      "5000": 3,
      "6000": 1,
      "Length": 31,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 31860
    },
    {
      "5000": 3,
      "6000": 1,
      "Length": 31.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 32360
    },
    {
      "5000": 2,
      "6000": 2,
      "Length": 32,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 32860
    },
    {
      "5000": 2,
      "6000": 2,
      "Length": 32.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 33360
    },
    {
      "5000": 1,
      "6000": 3,
      "Length": 33,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 33860
    },
    {
      "5000": 1,
      "6000": 3,
      "Length": 33.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 34360
    },
    {
      "6000": 4,
      "Length": 34,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 34860
    },
    {
      "6000": 4,
      "Length": 34.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 35360
    },
    {
      "5000": 5,
      "Length": 35,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 35860
    },
    {
      "5000": 5,
      "Length": 35.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 36360
    },
    {
      "5000": 4,
      "6000": 1,
      "Length": 36,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 36860
    },
    {
      "5000": 4,
      "6000": 1,
      "Length": 36.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 37360
    },
    {
      "5000": 3,
      "6000": 2,
      "Length": 37,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 37860
    },
    {
      "5000": 3,
      "6000": 2,
      "Length": 37.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 38360
    },
    {
      "5000": 2,
      "6000": 3,
      "Length": 38,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 38860
    },
    {
      "5000": 2,
      "6000": 3,
      "Length": 38.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 39360
    },
    {
      "5000": 1,
      "6000": 4,
      "Length": 39,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 39860
    },
    {
      "5000": 1,
      "6000": 4,
      "Length": 39.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 40360
    },
    {
      "6000": 5,
      "Length": 40,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 40860
    },
    {
      "6000": 5,
      "Length": 40.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 41360
    },
    {
      "5000": 5,
      "6000": 1,
      "Length": 41,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 41860
    },
    {
      "5000": 5,
      "6000": 1,
      "Length": 41.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 42360
    },
    {
      "5000": 4,
      "6000": 2,
      "Length": 42,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 42860
    },
    {
      "5000": 4,
      "6000": 2,
      "Length": 42.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 43360
    },
    {
      "5000": 4,
      "5860": 1,
      "6000": 3,
      "Length": 43,
      "Total ": 43860
    },
    {
      "5000": 3,
      "6000": 3,
      "Length": 43.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 44360
    },
    {
      "5000": 2,
      "6000": 4,
      "Length": 44,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 44860
    },
    {
      "5000": 2,
      "6000": 4,
      "Length": 44.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 45360
    },
    {
      "5000": 1,
      "6000": 5,
      "Length": 45,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 45860
    },
    {
      "5000": 1,
      "6000": 5,
      "Length": 45.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 46360
    },
    {
      "6000": 6,
      "Length": 46,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 46860
    },
    {
      "6000": 6,
      "Length": 46.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 47360
    },
    {
      "5000": 5,
      "6000": 2,
      "Length": 47,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 47860
    },
    {
      "5000": 5,
      "6000": 2,
      "Length": 47.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 48360
    },
    {
      "5000": 4,
      "6000": 3,
      "Length": 48,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 48860
    },
    {
      "5000": 4,
      "6000": 3,
      "Length": 48.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 49360
    },
    {
      "5000": 3,
      "6000": 4,
      "Length": 49,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 49860
    },
    {
      "5000": 3,
      "6000": 4,
      "Length": 49.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 50360
    },
    {
      "5000": 2,
      "6000": 5,
      "Length": 50,
      "5402.5": 1,
      "5457.5": 1,
      "Total ": 50860
    },
    {
      "5000": 2,
      "6000": 5,
      "Length": 50.5,
      "5402.5": 1,
      "5957.5": 1,
      "Total ": 51360
    },
    {
      "5000": 2,
      "5860": 1,
      "6000": 6,
      "Length": 51,
      "Total ": 51860
    },
    {
      "3000": 1,
      "3360": 1,
      "5000": 2,
      "6000": 6,
      "Length": 51.5,
      "Total ": 52360
    },
    {
      "1860": 1,
      "5000": 3,
      "6000": 6,
      "Length": 52,
      "Total ": 52860
    },
    {
      "2360": 1,
      "5000": 3,
      "6000": 6,
      "Length": 52.5,
      "Total ": 53360
    },
    {
      "2860": 1,
      "5000": 3,
      "6000": 6,
      "Length": 53,
      "Total ": 53860
    },
    {
      "3360": 1,
      "5000": 3,
      "6000": 6,
      "Length": 53.5,
      "Total ": 54360
    },
    {
      "3860": 1,
      "5000": 3,
      "6000": 6,
      "Length": 54,
      "Total ": 54860
    },
    {
      "4360": 1,
      "5000": 3,
      "6000": 6,
      "Length": 54.5,
      "Total ": 55360
    },
    {
      "4860": 1,
      "5000": 3,
      "6000": 6,
      "Length": 55,
      "Total ": 55860
    },
    {
      "4360": 1,
      "5000": 2,
      "6000": 7,
      "Length": 55.5,
      "Total ": 56360
    },
    {
      "4860": 1,
      "5000": 2,
      "6000": 7,
      "Length": 56,
      "Total ": 56860
    },
    {
      "5000": 2,
      "5360": 1,
      "6000": 7,
      "Length": 56.5,
      "Total ": 57360
    },
    {
      "4860": 1,
      "5000": 1,
      "6000": 8,
      "Length": 57,
      "Total ": 57860
    },
    {
      "5000": 1,
      "5360": 1,
      "6000": 8,
      "Length": 57.5,
      "Total ": 58360
    },
    {
      "5000": 1,
      "5860": 1,
      "6000": 8,
      "Length": 58,
      "Total ": 58860
    },
    {
      "5360": 1,
      "6000": 9,
      "Length": 58.5,
      "Total ": 59360
    },
    {
      "5860": 1,
      "6000": 9,
      "Length": 59,
      "Total ": 59860
    },
    {
      "2360": 1,
      "4000": 1,
      "6000": 9,
      "Length": 59.5,
      "Total ": 60360
    },
    {
      "2860": 1,
      "4000": 1,
      "6000": 9,
      "Length": 60,
      "Total ": 60860
    },
    {
      "2360": 1,
      "5000": 1,
      "6000": 9,
      "Length": 60.5,
      "Total ": 61360
    },
    {
      "2860": 1,
      "5000": 1,
      "6000": 9,
      "Length": 61,
      "Total ": 61860
    },
    {
      "3360": 1,
      "5000": 1,
      "6000": 9,
      "Length": 61.5,
      "Total ": 62360
    },
    {
      "3860": 1,
      "5000": 1,
      "6000": 9,
      "Length": 62,
      "Total ": 62860
    },
    {
      "4360": 1,
      "5000": 1,
      "6000": 9,
      "Length": 62.5,
      "Total ": 63360
    },
    {
      "4860": 1,
      "5000": 1,
      "6000": 9,
      "Length": 63,
      "Total ": 63860
    },
    {
      "5000": 1,
      "5360": 1,
      "6000": 9,
      "Length": 63.5,
      "Total ": 64360
    },
    {
      "5000": 1,
      "5860": 1,
      "6000": 9,
      "Length": 64,
      "Total ": 64860
    },
    {
      "3000": 1,
      "3360": 1,
      "5000": 1,
      "6000": 9,
      "Length": 64.5,
      "Total ": 65360
    },
    {
      "1860": 1,
      "5000": 2,
      "6000": 9,
      "Length": 65,
      "Total ": 65860
    },
    {
      "2360": 1,
      "5000": 2,
      "6000": 9,
      "Length": 65.5,
      "Total ": 66360
    },
    {
      "2860": 1,
      "5000": 2,
      "6000": 9,
      "Length": 66,
      "Total ": 66860
    },
    {
      "3360": 1,
      "5000": 2,
      "6000": 9,
      "Length": 66.5,
      "Total ": 67360
    },
    {
      "3860": 1,
      "5000": 2,
      "6000": 9,
      "Length": 67,
      "Total ": 67860
    },
    {
      "4360": 1,
      "5000": 2,
      "6000": 9,
      "Length": 67.5,
      "Total ": 68360
    },
    {
      "4860": 1,
      "5000": 2,
      "6000": 9,
      "Length": 68,
      "Total ": 68860
    },
    {
      "5000": 2,
      "5360": 1,
      "6000": 9,
      "Length": 68.5,
      "Total ": 69360
    },
    {
      "5000": 2,
      "5860": 1,
      "6000": 9,
      "Length": 69,
      "Total ": 69860
    },
    {
      "2360": 1,
      "4000": 1,
      "5000": 2,
      "6000": 9,
      "Length": 69.5,
      "Total ": 70360
    },
    {
      "1860": 1,
      "5000": 3,
      "6000": 9,
      "Length": 70,
      "Total ": 70860
    },
    {
      "2360": 1,
      "5000": 3,
      "6000": 9,
      "Length": 70.5,
      "Total ": 71360
    },
    {
      "2860": 1,
      "5000": 3,
      "6000": 9,
      "Length": 71,
      "Total ": 71860
    },
    {
      "3360": 1,
      "5000": 3,
      "6000": 9,
      "Length": 71.5,
      "Total ": 72360
    },
    {
      "3860": 1,
      "5000": 3,
      "6000": 9,
      "Length": 72,
      "Total ": 72860
    },
    {
      "4360": 1,
      "5000": 3,
      "6000": 9,
      "Length": 72.5,
      "Total ": 73360
    },
    {
      "4860": 1,
      "5000": 3,
      "6000": 9,
      "Length": 73,
      "Total ": 73860
    },
    {
      "5000": 3,
      "5360": 1,
      "6000": 9,
      "Length": 73.5,
      "Total ": 74360
    },
    {
      "5000": 3,
      "5860": 1,
      "6000": 9,
      "Length": 74,
      "Total ": 74860
    },
    {
      "2360": 1,
      "4000": 1,
      "5000": 3,
      "6000": 9,
      "Length": 74.5,
      "Total ": 75360
    },
    {
      "1860": 1,
      "5000": 4,
      "6000": 9,
      "Length": 75,
      "Total ": 75860
    },
    {
      "2360": 1,
      "5000": 4,
      "6000": 9,
      "Length": 75.5,
      "Total ": 76360
    },
    {
      "2860": 1,
      "5000": 4,
      "6000": 9,
      "Length": 76,
      "Total ": 76860
    },
    {
      "3360": 1,
      "5000": 4,
      "6000": 9,
      "Length": 76.5,
      "Total ": 77360
    },
    {
      "3860": 1,
      "5000": 4,
      "6000": 9,
      "Length": 77,
      "Total ": 77860
    },
    {
      "4360": 1,
      "5000": 4,
      "6000": 9,
      "Length": 77.5,
      "Total ": 78360
    },
    {
      "4860": 1,
      "5000": 4,
      "6000": 9,
      "Length": 78,
      "Total ": 78860
    },
    {
      "5000": 4,
      "5360": 1,
      "6000": 9,
      "Length": 78.5,
      "Total ": 79360
    },
    {
      "5000": 4,
      "5860": 1,
      "6000": 9,
      "Length": 79,
      "Total ": 79860
    },
    {
      "3000": 1,
      "3360": 1,
      "5000": 4,
      "6000": 9,
      "Length": 79.5,
      "Total ": 80360
    },
    {
      "1860": 1,
      "5000": 5,
      "6000": 9,
      "Length": 80,
      "Total ": 80860
    },
    {
      "2360": 1,
      "5000": 5,
      "6000": 9,
      "Length": 80.5,
      "Total ": 81360
    },
    {
      "2860": 1,
      "5000": 5,
      "6000": 9,
      "Length": 81,
      "Total ": 81860
    },
    {
      "3360": 1,
      "5000": 5,
      "6000": 9,
      "Length": 81.5,
      "Total ": 82360
    },
    {
      "3860": 1,
      "5000": 5,
      "6000": 9,
      "Length": 82,
      "Total ": 82860
    },
    {
      "4360": 1,
      "5000": 5,
      "6000": 9,
      "Length": 82.5,
      "Total ": 83360
    },
    {
      "4860": 1,
      "5000": 5,
      "6000": 9,
      "Length": 83,
      "Total ": 83860
    },
    {
      "5000": 5,
      "5360": 1,
      "6000": 9,
      "Length": 83.5,
      "Total ": 84360
    },
    {
      "5000": 5,
      "5860": 1,
      "6000": 9,
      "Length": 84,
      "Total ": 84860
    },
    {
      "3000": 1,
      "3360": 1,
      "5000": 5,
      "6000": 9,
      "Length": 84.5,
      "Total ": 85360
    },
    {
      "1860": 1,
      "5000": 6,
      "6000": 9,
      "Length": 85,
      "Total ": 85860
    },
    {
      "2360": 1,
      "5000": 6,
      "6000": 9,
      "Length": 85.5,
      "Total ": 86360
    },
    {
      "2860": 1,
      "5000": 6,
      "6000": 9,
      "Length": 86,
      "Total ": 86860
    },
    {
      "3360": 1,
      "5000": 6,
      "6000": 9,
      "Length": 86.5,
      "Total ": 87360
    },
    {
      "3860": 1,
      "5000": 6,
      "6000": 9,
      "Length": 87,
      "Total ": 87860
    },
    {
      "4360": 1,
      "5000": 6,
      "6000": 9,
      "Length": 87.5,
      "Total ": 88360
    },
    {
      "4860": 1,
      "5000": 6,
      "6000": 9,
      "Length": 88,
      "Total ": 88860
    },
    {
      "5000": 6,
      "5360": 1,
      "6000": 9,
      "Length": 88.5,
      "Total ": 89360
    },
    {
      "5000": 6,
      "5860": 1,
      "6000": 9,
      "Length": 89,
      "Total ": 89860
    },
    {
      "3000": 1,
      "3360": 1,
      "5000": 6,
      "6000": 9,
      "Length": 89.5,
      "Total ": 90360
    },
    {
      "1860": 1,
      "5000": 7,
      "6000": 9,
      "Length": 90,
      "Total ": 90860
    },
    {
      "2360": 1,
      "5000": 7,
      "6000": 9,
      "Length": 90.5,
      "Total ": 91360
    },
    {
      "2860": 1,
      "5000": 7,
      "6000": 9,
      "Length": 91,
      "Total ": 91860
    },
    {
      "3360": 1,
      "5000": 7,
      "6000": 9,
      "Length": 91.5,
      "Total ": 92360
    },
    {
      "3860": 1,
      "5000": 7,
      "6000": 9,
      "Length": 92,
      "Total ": 92860
    },
    {
      "4360": 1,
      "5000": 7,
      "6000": 9,
      "Length": 92.5,
      "Total ": 93360
    },
    {
      "4860": 1,
      "5000": 7,
      "6000": 9,
      "Length": 93,
      "Total ": 93860
    },
    {
      "5000": 7,
      "5360": 1,
      "6000": 9,
      "Length": 93.5,
      "Total ": 94360
    },
    {
      "5000": 7,
      "5860": 1,
      "6000": 9,
      "Length": 94,
      "Total ": 94860
    },
    {
      "3000": 1,
      "3360": 1,
      "5000": 7,
      "6000": 9,
      "Length": 94.5,
      "Total ": 95360
    },
    {
      "1860": 1,
      "5000": 8,
      "6000": 9,
      "Length": 95,
      "Total ": 95860
    },
    {
      "2360": 1,
      "5000": 8,
      "6000": 9,
      "Length": 95.5,
      "Total ": 96360
    },
    {
      "2860": 1,
      "5000": 8,
      "6000": 9,
      "Length": 96,
      "Total ": 96860
    }
  ]
},
      ibeamRows: [
        { id: "ibeam_row1", label: "I-Beam 외곽 메인 레일 (First/End Main Rail)", formula: "2", partNo: '"M-IB-" + round(L_O*1000+100)', loc: "수조 외곽 하부 메인 지지 레일 (양쪽 2개 고정)", rem: "동적 레일 길이 수식: M-IB-(L_O*1000+100mm)" },
        { id: "ibeam_row2", label: "I-Beam 중간 메인 레일 (Middle Main Rail)", formula: "W_C+W_F-1", partNo: '"M-IB-" + round(L_O*1000+100)', loc: "수조 중간 하부 지지 레일 (너비 분할 수 - 1)", rem: "동적 레일 길이 수식: M-IB-(L_O*1000+100mm)" },
        { id: "ibeam_row3", label: "측면 수평 채널/앵글 (1M폭 Side Channel/Angle)", formula: "W_C*(totLC+totLF+1)", partNo: '(H_O==2.5||H_O==3)?"SB-L-0890":"SB-CH-0890"', loc: "스틸 스키드 1M폭 측면 테두리 (2.5~3mH: SB-L-0890 앵글 / 그외: SB-CH-0890 채널)", rem: "높이 조건문: H_O 2.5m~3m는 SB-L-0890 앵글, 기타 SB-CH-0890 채널" },
        { id: "ibeam_row3_05", label: "측면 수평 채널/앵글 (0.5M폭 Side Channel/Angle)", formula: "W_F*(totLC+totLF+1)", partNo: '(H_O==2.5||H_O==3)?"SB-L-0390":"SB-CH-0390"', loc: "스틸 스키드 0.5M폭 측면 테두리 (2.5~3mH: SB-L-0390 앵글 / 그외: SB-CH-0390 채널)", rem: "높이 조건문: H_O 2.5m~3m는 SB-L-0390 앵글, 기타 SB-CH-0390 채널" },
        { id: "ibeam_row4", label: "I-Beam 크로스 멤버 (Cross Support Beam)", formula: "(totLC+totLF-1)*2", partNo: 'H_O>=3.5?"S-IB-0420":"S-IB-0365"', loc: "하부 교차 보강빔 (H<3.5m: S-IB-0365, H≥3.5m: S-IB-0420)", rem: "높이 조건문: H_O>=3.5m는 S-IB-0420, H_O<3.5m는 S-IB-0365" },
        { id: "ibeam_row5", label: "I-Beam 고정 브라켓 (Anchor / Corner Bracket)", formula: "W_C*(totLC+totLF+1)*2", partNo: "BRK-SB", loc: "스틸 스키드 코너 및 하부 앵커 브라켓 (BRK-SB)", rem: "1M Side Channel/Angle 수량 × 2 (Excel K102 = K98 * 2)" },
        { id: "ibeam_row23", label: "외부보강 전용 HB Beam (4mH Support HB Beam)", formula: "(H_O>3&&H_O<=4?(L_O_C+L_O_F-1)*2:0)+(H_O>3&&H_O<=4?(W_C+W_F-1)*2:0)", partNo: "WFF-12540Z", loc: "외부보강 전용 4mH H-Beam 지지대", rem: "외부보강(Ext R/F) 4mH 전용 수식", isExtOnly: true },
        { id: "ibeam_row24", label: "외부보강 전용 HB Beam (3.5mH Support HB Beam)", formula: "(H_O==3.5?(L_O_C+L_O_F-1)*2:0)+(H_O==3.5?(W_C+W_F-1)*2:0)", partNo: "WFF-12535Z", loc: "외부보강 전용 3.5mH H-Beam 지지대", rem: "외부보강(Ext R/F) 3.5mH 전용 수식", isExtOnly: true },
        { id: "ibeam_row25", label: "외부보강 전용 HB Beam (3mH Support HB Beam)", formula: "(H_O==3?(L_O_C+L_O_F-1)*2:0)+(H_O==3?(W_C+W_F-1)*2:0)", partNo: "WFF-12530Z", loc: "외부보강 전용 3mH H-Beam 지지대", rem: "외부보강(Ext R/F) 3mH 전용 수식", isExtOnly: true },
        { id: "ibeam_row26", label: "외부보강 전용 I-Beam Connector (Connector)", formula: "(H_O>2?(L_O_C+L_O_F-1)*2:0)*2+(H_O>2?(W_C+W_F-1)*2:0)*2", partNo: "WBR-1111Z", loc: "외부보강 전용 I-Beam 연결 커넥터", rem: "외부보강(Ext R/F) H>2m 전용 수식", isExtOnly: true }
      ],
      sqpRows: [
        { id: "sqp_row1", label: "SQ 사각파이프 메인 프레임 (Main Frame)", formula: "(W_C+W_F+1)*2", partNo: "WSQ-0100Z", loc: "하부 메인 사각파이프 베이스" },
        { id: "sqp_row2", label: "SQ 사각파이프 크로스 서포트 (Cross Support)", formula: "(((((W_O%2)==1?2:0)+(W_O==1.5?2:0)+trunc(W_O/2)*2+((W_O%2)==0.5?2:0))/2)-1)*2", partNo: "WSQ-0080Z", loc: "사각파이프 크로스 보강재" },
        { id: "sqp_row3", label: "SQ 사각파이프 조인트 패드 (Joint Pad)", formula: "((L1_F>0?trunc((L1_O-1.5)/2):trunc(L1_O/2))+(L2_F>0?trunc((L2_O-1.5)/2):trunc(L2_O/2))+(L3_F>0?trunc((L3_O-1.5)/2):trunc(L3_O/2))+(L4_F>0?trunc((L4_O-1.5)/2):trunc(L4_O/2)))*(W_C+W_F+1)", partNo: "WSQ-0060Z", loc: "연결 및 결합 패드" },
        { id: "sqp_row4", label: "SQ 사각파이프 앵커 플랜지 (Anchor Flange)", formula: "H_O>3?(4+(W_C+W_F-1)*2+(L_O-1)*2):(4+(W_C+W_F-2)+(L_O-2))", partNo: "WSQ-0040Z", loc: "베이스 고정 앵커 플랜지" }
      ],
      getSpecRows: function(specKey) {
        if (specKey === "angle75") {
          if (!this.angle75Rows) {
            this.angle75Rows = (this.rows || [])
              .filter(function(r) { return r.parts && r.parts.angle75; })
              .map(function(r) { return { id: r.id, label: r.label || r.id, formula: r.formula, partNo: r.parts.angle75, loc: r.loc || "", rem: r.rem || "" }; });
          }
          return this.angle75Rows;
        }
        if (specKey === "channel125") {
          if (!this.channel125Rows) {
            this.channel125Rows = (this.rows || [])
              .filter(function(r) { return r.parts && r.parts.channel125; })
              .map(function(r) { return { id: r.id, label: r.label || r.id, formula: r.formula, partNo: r.parts.channel125, loc: r.loc || "", rem: r.rem || "" }; });
          }
          return this.channel125Rows;
        }
        if (specKey === "channel150") {
          if (!this.channel150Rows) {
            this.channel150Rows = (this.rows || [])
              .filter(function(r) { return r.parts && r.parts.channel150; })
              .map(function(r) { return { id: r.id, label: r.label || r.id, formula: r.formula, partNo: r.parts.channel150, loc: r.loc || "", rem: r.rem || "" }; });
          }
          return this.channel150Rows;
        }
        if (specKey === "std" || specKey === "default") return this.rows || [];
        if (specKey === "ibeam") return this.ibeamRows || [];
        if (specKey === "sqp" || specKey === "sq") return this.sqpRows || [];
        return this[specKey + "Rows"] || (this.rows || []);
      }
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
    //   - P_1M (row58, BASIC_TOOL!E13 "0.5/1m Partition only") has no exposed
    //     UI control in this app; assumed 1, matching the workbook's own
    //     default (E12="DEFAULT" -> E13=1) and the verified scenario's cached
    //     results.
    //   - S_1M (BASIC_TOOL!D13, "0.5/1M Side Panel only") IS exposed in this
    //     app, as the `#sidePanelOnly` select ("DEFAULT" -> S_1M=0, "1x1M
    //     only" -> S_1M=1 -- confirmed via PRINTOUT(BOM)!F96's own label text
    //     and the Panel sheet's D13-gated role formulas). AP19 (row19) below
    //     threads this through as scope var `S_1M`; see boltsAndNutsParts()'s
    //     `sidePanelOnly` parameter in accessories_engine.js.
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
      // Full BoltnNuts!BC5:BG75 "SETTING" catalog table (size/length/washer &
      // nut count per bolt/name) for every lib id referenced above -- this is
      // the exact source of the app's "볼트 설정 & 검산 (Bolt Logic & Audit)"
      // SETTING panel. Purely descriptive/reference metadata: dia/length/
      // washer/nut are NOT read back into the formulas above (those counts
      // are already baked into each AP<n> formula, exactly as in the original
      // workbook). "boltName" is the one field with real effect -- see
      // accessories_engine.js boltsAndNutsParts()'s "catalogOverrides" param,
      // which lets a user-edited name here override libraryNames[libId] as
      // the base part name (before the per-material-option suffix is
      // appended), so editing it here genuinely changes which real part
      // number the app's BOM/Cost/Weight printouts use.
      libraryCatalog: {
        6: { dia: 10, length: 35, washer: 2, nut: 1, boltName: "WBT-1035" },
        7: { dia: 10, length: 35, washer: 2, nut: 1, boltName: "WBT-1035" },
        8: { dia: 10, length: 45, washer: 2, nut: 1, boltName: "WBT-1045" },
        9: { dia: 10, length: 0, washer: 0, nut: 1, boltName: "WNT-M10" },
        10: { dia: 10, length: 0, washer: 1, nut: 0, boltName: "WFW-M10" },
        12: { dia: 10, length: 45, washer: 2, nut: 1, boltName: "WBT-1045" },
        13: { dia: 10, length: 45, washer: 2, nut: 1, boltName: "WBT-1045" },
        18: { dia: 10, length: 45, washer: 2, nut: 1, boltName: "WBT-1045" },
        19: { dia: 10, length: 35, washer: 2, nut: 1, boltName: "WBT-1035" },
        22: { dia: 10, length: 45, washer: 2, nut: 1, boltName: "WBT-1045" },
        24: { dia: 14, length: 130, washer: 1, nut: 3, boltName: "WBT-14130P" },
        25: { dia: 14, length: 60, washer: 1, nut: 1, boltName: "WBT-1460P" },
        26: { dia: 12, length: 50, washer: 2, nut: 1, boltName: "WBT-1250" },
        27: { dia: 14, length: 0, washer: 1, nut: 0, boltName: "WFW-M14" },
        28: { dia: 14, length: 0, washer: 0, nut: 1, boltName: "WNT-M14" },
        32: { dia: 10, length: 45, washer: 2, nut: 1, boltName: "WBT-1045" },
        33: { dia: 10, length: 58, washer: 1, nut: 1, boltName: "WBT-1058P" },
        35: { dia: 10, length: 0, washer: 0, nut: 1, boltName: "WNT-M10" },
        36: { dia: 10, length: 0, washer: 1, nut: 0, boltName: "WFW-M10" },
        37: { dia: 12, length: 0, washer: 0, nut: 1, boltName: "WNT-M12" },
        38: { dia: 12, length: 0, washer: 1, nut: 0, boltName: "WFW-M12" },
        43: { dia: 10, length: 60, washer: 2, nut: 2, boltName: "WBT-1060" },
        44: { dia: 10, length: 100, washer: 2, nut: 2, boltName: "WBT-10100" },
        46: { dia: 10, length: 35, washer: 2, nut: 1, boltName: "WBT-1035" },
        48: { dia: 12, length: 40, washer: 2, nut: 1, boltName: "WBT-1240" },
        49: { dia: 12, length: 40, washer: 2, nut: 1, boltName: "WBT-1240" },
        53: { dia: 14, length: 40, washer: 1, nut: 1, boltName: "WBT-1440" },
        58: { dia: 16, length: 40, washer: 2, nut: 1, boltName: "WBT-1640" },
        59: { dia: 16, length: 100, washer: 1, nut: 3, boltName: "WBT-16100" },
        60: { dia: 16, length: 0, washer: 1, nut: 0, boltName: "WFW-M16" },
        61: { dia: 16, length: 0, washer: 0, nut: 1, boltName: "WNT-M16" },
      },
      // Nos of Holes/M constants (BoltnNuts!BC3=8, BF3=4).
      // Passed dynamically into rule engine scope as `R1` (or `R_C`=8) and `R05` (or `R_F`=4).
      holesPerM_Roof1x1: 8,
      holesPerM_Roof05x1: 4,
      // Rows ordered so every AP<n> reference resolves to an already-computed
      // value (the original sheet has no such ordering constraint since Excel
      // resolves the dependency graph itself; this list is manually sorted
      // into that same dependency order).
      // "label" (= the original BoltnNuts!AO<n> "Bolt Assemble Location" cell
      // text, verbatim) and "section" (grouped by the sheet's blank-row
      // breaks) are display-only metadata for the audit/setting UI -- they
      // do not affect any formula above.
      rows: [
        { id: "AP5", formula: "(R1*W_C+R05*W_F)*(L_C+L_F-1)", lib: 6, suffix: ["HDG", "SA4", "SA4", "PSA4", "SA2", "SA4"], label: "Roof PNL + Roof PNL (Vertical) - roof panel (8 holes)", section: "ROOF" },
        { id: "AP6", formula: "L_O*R1*(W_C+W_F-1)", lib: 6, suffix: ["HDG", "SA4", "SA4", "PSA4", "SA2", "SA4"], label: "Roof PNL + Roof PNL (Horizontal) - roof panel (8 holes)", section: "ROOF" },
        { id: "AP7", formula: "(L1_C+L2_C+L3_C+L4_C+W_C)*R1*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*R05*2", lib: 7, suffix: ["HDG", "SA4", "SA4", "PSA4", "SA2", "SA4"], libByOption: { 4: 8 }, label: "Roof PNL + Side PNLs (only 8 holes)", section: "ROOF" },
        { id: "AP12", formula: "(8*W_C+4*W_F)*(L_C+L_F-1)", lib: 12, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Bottom PNL + Bottom PNL (Vertical)", section: "BOTTOM" },
        { id: "AP13", formula: "L_O*8*(W_C+W_F-1)", lib: 12, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Bottom PNL + Bottom PNL (Horizontal)", section: "BOTTOM" },
        { id: "AP18", formula: "H_O*((W_C+W_F-1)+(L_C+L_F-1))*2*8", lib: 18, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Side PNL + Side PNL (Vertical)", section: "SIDE" },
        { id: "AP19", formula: "S_1M==1 ? (H_O>1 ? 8*(W_O+L_O)*2*(H_C+H_F-1) : 0) : (H_O>2 ? 8*(W_O+L_O)*2*(H_C+H_F-2) : 0)", lib: 18, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Side PNL + Side PNL (Horizontal)", section: "SIDE" },
        { id: "AP22", formula: "H_O*8*2*4", lib: 19, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Corner Angle Frame + Side PNLs", section: "SIDE" },
        { id: "AP23", formula: "(RF==2 && H_O==1.5) ? ((W_O-1)+(L_O-1))*2*2 : 0", lib: 43, suffix: ["HDG", "HDG", "SA4", "HDG", "SA2", "SA4"], label: "Lower fixture for 1.5mH External Reinforcement", section: "SIDE" },
        { id: "AP24", formula: "(RF==2 && H_O==2) ? (W_C+W_F-1+L_C+L_F-1)*2*2 : (RF==1 && H_O>3) ? (W_C+W_F-1+L_C+L_F-1)*2*2 : 0", lib: 44, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Lower Bracket for Internal & External", section: "SIDE" },
        { id: "AP25", formula: "(H_O==2.5?4:0)+(H_O==3?4:0)+(H_O==3.5?8:0)+(H_O==4?8:0)+(H_O==4.5?12:0)+(H_O==5?12:0)", lib: 46, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Connecting between Corner Frames", section: "SIDE" },
        { id: "AP29", formula: "L2_O>0 ? H_O*8*2*N_PA : 0", lib: 33, suffix: ["PD", "PD", "SA2", "PD", "SA2", "SA4"], label: "Partition PNL + Side PNL", section: "PARTITION" },
        { id: "AP30", formula: "L2_O>0 ? W_O*8*N_PA : 0", lib: 33, suffix: ["PD", "PD", "SA2", "PD", "SA2", "SA4"], label: "Partition PNL + Bottom PNL", section: "PARTITION" },
        { id: "AP31", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*4 : 0)*N_PA : 0", lib: 26, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition Top PNL + Roof PNL (WBR-25251,25252Z)", section: "PARTITION" },
        { id: "AP32", formula: "L2_O>0 ? (W_O*8*(H_O<2?0:(H_C+H_F-1)))*N_PA : 0", lib: 22, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition PNL + Partition PNL (Horizontal)", section: "PARTITION" },
        { id: "AP33", formula: "L2_O>0 ? ((W_C+W_F-1)*H_O)*8*N_PA : 0", lib: 22, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition PNL + Partition PNL (Vertical)", section: "PARTITION" },
        { id: "AP41", formula: "((L1_C+L2_C+L3_C+L4_C+W_C)*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*2)*2", lib: 48, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"], label: "Steel Skid and Side panel Assembly", section: "STEEL SKID" },
        { id: "AP42", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*((H_O==2.5?12:0)+(H_O==3?12:0)+(H_O==3.5?16:0)+(H_O==4?16:0)) : 0", lib: 49, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"], label: "Side I beam + 0950VZ or 0450VZ", section: "STEEL SKID" },
        { id: "AP46", formula: "0", label: "Steel Skid for external (always 0 in this app's supported range)", section: "STEEL SKID" },
        { id: "AP50", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*2 : 0", lib: 59, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"], label: "Steel Skid for external frame + External Stopper", section: "STEEL SKID" },
        { id: "AP51", formula: "(RF==2 && H_O>2) ? ((W_C+W_F-1)+(L_C+L_F-1))*2*4 : 0", lib: 58, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"], label: "Steel Skid for external frame + H beam Support", section: "STEEL SKID" },
        { id: "AP57", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*2 : 0)*N_PA : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition Upper Bracket", section: "PARTITION BRACKET" },
        { id: "AP58", formula: "RF==2 ? (H_O==1?0:(H_C+H_F-2))*(W_C+W_F-1)*4*N_PA : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition Middle Bracket", section: "PARTITION BRACKET" },
        { id: "AP59", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*2 : 0)*N_PA : 0", lib: 24, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition Lower Bracket", section: "PARTITION BRACKET" },
        { id: "AP60", formula: "RF==2 ? (H_O>1 ? (W_C+W_F-1)*2 : 0)*N_PA : 0", lib: 25, suffix: ["PD", "PD", "SA2", "PD", "SA2", "SA4"], label: "WBR-9090 + Bottom Panel", section: "PARTITION BRACKET" },
        { id: "AP66", formula: "RF==1 ? (H_O>1 ? (((W_C+W_F-1)+(L_C+L_F-1-N_PA))*2*2*((H_O==1.5||H_O==2)?1:(H_O==2.5||H_O==3)?3:(H_O==3.5||H_O==4)?5:0)) + (H_O>=2.5?(H_C+H_F-2)*2*N_PA:0) : 0) : 0", lib: 24, suffix: ["PPD", "PSA4", "PSA4", "PSA4", "PSA2", "PSA4"], label: "Tie-Rods Bracket + Cross Plate", section: "PARTITION BRACKET" },
        { id: "AP67", formula: "(RF==1 && N_PA>0) ? (W_C+W_F-1)*((H_O==1.5||H_O==2)?1:(H_O==2.5||H_O==3)?3:(H_O==3.5||H_O==4)?5:0)*2*N_PA : 0", lib: 24, suffix: ["PPD", "PSA4", "PSA4", "PSA4", "PSA2", "PSA4"], label: "Partition Tie-Rods Bracket + Cross Plate", section: "PARTITION BRACKET" },
        { id: "AP68", formula: "RF==1 ? (H_O>=3 ? 16*(H_C+H_F-2) : 0) : 0", lib: 24, suffix: ["PPD", "PSA4", "PSA4", "PSA4", "PSA2", "PSA4"], label: "WBR-9090 + WCP1610Z at Corner", section: "PARTITION BRACKET" },
        { id: "AP69", formula: "(RF==1 && H_O>=2) ? (W_C+W_F-1)*2 : 0", lib: 32, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Partition Upper Bracket + Partition Upper Panel", section: "PARTITION BRACKET" },
        // ---- Tier 2: derived Nut/Washer rows referencing the Tier-1 rows above (with per-bolt nut/washer count constants already substituted in) ----
        { id: "AP9", formula: "AP5+AP6+AP7", lib: 9, suffix: ["HDG", "SA4", "SA4", "PZ", "SA2", "SA4"], label: "Calculation of Nuts for Roof", section: "ROOF" },
        { id: "AP10", formula: "(AP5+AP6+AP7)*2", lib: 10, suffix: ["HDG", "SA4", "SA4", "RB", "SA2", "SA4"], label: "Calculation of Flat Washer for Roof", section: "ROOF" },
        { id: "AP14", formula: "(L1_C+L2_C+L3_C+L4_C+W_C)*8*2 + (L1_F+L2_F+L3_F+L4_F+W_F)*4*2 - AP24", lib: 13, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Bottom PNLs + Side PNLs", section: "BOTTOM" },
        { id: "AP15", formula: "AP12+AP13+AP14", lib: 9, suffix: ["HDG", "HDG", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Nuts for bottom", section: "BOTTOM" },
        { id: "AP16", formula: "(AP12+AP13+AP14)*2", lib: 10, suffix: ["HDG", "HDG", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Flat Washer for bottom", section: "BOTTOM" },
        { id: "AP26", formula: "AP18+AP19+AP23*2+AP24*2+AP22+AP25", lib: 9, suffix: ["HDG", "HDG", "SA4", "HDG", "SA2", "SA4"], label: "Calculation of Nuts for Side PNL", section: "SIDE" },
        { id: "AP27", formula: "(AP18+AP19+AP23+AP24+AP22+AP25)*2", lib: 10, suffix: ["HDG", "HDG", "SA4", "HDG", "SA2", "SA4"], label: "Calculation of Flat Washer for Side PNL", section: "SIDE" },
        { id: "AP34", formula: "AP29+AP30", lib: 9, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Calculation of M10 Nuts for Partition", section: "PARTITION" },
        { id: "AP35", formula: "AP29+AP30", lib: 10, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Calculation of M10 Flat Washer for Partition + Side, Bottom", section: "PARTITION" },
        { id: "AP36", formula: "AP32+AP33", lib: 9, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of M10 Nuts for Partition Panel Assembly", section: "PARTITION" },
        { id: "AP37", formula: "(AP32+AP33)*2", lib: 10, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of M10 Washer for Partition Panel Assembly", section: "PARTITION" },
        { id: "AP38", formula: "AP31", lib: 37, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of M12 Nuts for Partition Panel Assembly", section: "PARTITION" },
        { id: "AP39", formula: "AP31*2", lib: 38, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of M12 Washer for Partition Panel Assembly", section: "PARTITION" },
        { id: "AP43", formula: "AP41+AP42", literal: "WNT-M12HDG", label: "Calculation of Nuts for M12 Bolt", section: "STEEL SKID" },
        { id: "AP44", formula: "(AP41+AP42)*2", literal: "WFW-M12HDG", label: "Calculation of Washers for M12 Bolt", section: "STEEL SKID" },
        { id: "AP47", formula: "0", literal: "WNT-M14HDG", label: "Calculation of Nuts for M14 Bolt (Steel Skid Ext., always 0)", section: "STEEL SKID" },
        { id: "AP48", formula: "0", literal: "WFW-M14HDG", label: "Calculation of Washers for M14 Bolt (Steel Skid Ext., always 0)", section: "STEEL SKID" },
        { id: "AP52", formula: "AP51+AP50*3", lib: 61, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"], label: "Calculation of Nuts for M16 Bolt", section: "STEEL SKID" },
        { id: "AP53", formula: "AP51*2+AP50", lib: 60, suffix: ["HDG", "HDG", "HDG", "HDG", "HDG", "HDG"], label: "Calculation of Washers for M16 Bolt", section: "STEEL SKID" },
        { id: "AP61", formula: "(AP57+AP58+AP59)*3", lib: 28, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Nuts for M14 Bolt (Partition Bracket)", section: "PARTITION BRACKET" },
        { id: "AP62", formula: "AP57+AP58+AP59", lib: 27, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Flat Washers for M14 Bolt (Partition Bracket)", section: "PARTITION BRACKET" },
        { id: "AP63", formula: "AP60", lib: 28, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Calculation of Nuts for M14 Bolt (WBR-9090)", section: "PARTITION BRACKET" },
        { id: "AP64", formula: "AP60", lib: 27, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Calculation of Flat Washers for M14 Bolt (WBR-9090)", section: "PARTITION BRACKET" },
        { id: "AP70", formula: "(AP66+AP68)*3", lib: 28, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Calculation of Nuts for M14 Bolt (Tie-Rod Bracket)", section: "PARTITION BRACKET" },
        { id: "AP71", formula: "AP66+AP68", lib: 27, suffix: ["HDG", "HDG", "SA2", "HDG", "SA2", "SA4"], label: "Calculation of Flat Washers for M14 Bolt (Tie-Rod Bracket)", section: "PARTITION BRACKET" },
        { id: "AP72", formula: "AP67*3", lib: 28, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Nuts for M14 Bolt (Partition Tie-Rod Bracket)", section: "PARTITION BRACKET" },
        { id: "AP73", formula: "AP67", lib: 27, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Flat Washers for M14 Bolt (Partition Tie-Rod Bracket)", section: "PARTITION BRACKET" },
        { id: "AP74", formula: "AP69", lib: 35, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Nuts for Partition Upper Bracket", section: "PARTITION BRACKET" },
        { id: "AP75", formula: "AP69*2", lib: 36, suffix: ["SA2", "SA4", "SA4", "SA4", "SA2", "SA4"], label: "Calculation of Flat Washers for Partition Upper Bracket", section: "PARTITION BRACKET" },
      ],
    },

    // -----------------------------------------------------------------------
    // Reinforcing -- EXACTLY verified (16/16 LibreOffice scenarios).
    // Variables: W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F,
    // L_C, L_F, H_O, H_C, H_F, N_PA, L2_O, S_1M (BASIC_TOOL!D13 / app's
    // `#sidePanelOnly` select, "DEFAULT"->0, "1x1M only"->1 -- see
    // accessories_engine.js reinforcingQty/reinforcingParts' `sidePanelOnly`
    // parameter; gates external rows 10/13 and internal rows 42/43/45).
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
          { id: "row10", formula: "((H_O==2.5||H_O==3) ? (W_C+totLC)*2 : (H_O==3.5||H_O==4) ? (W_C+totLC)*2*2 : (H_O==4.5||H_O==5) ? (W_C+totLC)*2*3 : 0) + ((S_1M==1 && H_O>=2.5) ? (W_C+totLC)*2 : 0)" },
          { id: "row11", formula: "(H_O==3.5||H_O==3) ? perim*6*2 : (H_O==4) ? perim*8*2 : (H_O==2.5) ? perim*4*2 : 0" },
          { id: "row12", formula: "((H_O==4.5||H_O==5) ? (W_C*(totLC+totLF-1)+totLC*(W_C+W_F-1))*2 : 0) + ((H_O==3.5||H_O==2.5) ? perim*2*2 : 0)" },
          { id: "row13", formula: "(H_O>1 ? (W_C+totLC)*2 : 0) + ((H_O==3||H_O==3.5) ? (W_C+totLC)*2 : (H_O==4 ? (W_C+totLC)*2*2 : 0)) + ((S_1M==1 && H_O>=2.5) ? (W_C+totLC)*2 : 0) + ((H_O==2.5?8:0)+(H_O==3?8:0)+(H_O==3.5?16:0)+(H_O==4?16:0)) + (H_O>3 ? W_C*N_PA : 0) + (H_O>3 ? 2*N_PA : 0)" },
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
          { id: "row42", formula: "((H_O>1 ? (W_C+totLC)*2 : 0) + (H_O>3 ? (W_C+totLC)*2 : 0)) + (H_O>3 ? (W_C+totLC)*2 : 0) + (H_O>2.5 ? (S_1M>0 ? perim*2*(H_C+H_F-1) : perim*2*(H_C-2)) : 0) + (H_O>=3 ? 4*2*(H_C-2) : 0) + ((L2_O>0 && H_O>1) ? W_C*N_PA : 0) + ((H_O>1 && L2_O>0) ? 2*(H_C+H_F-2)*N_PA : 0)" },
          { id: "row43", formula: "(H_O>2 ? (W_C+L_C)*2*(H_C+H_F-2) : 0) + (S_1M>0 ? (W_C+L_C)*2 : 0) + (H_O>2 ? (S_1M>0 ? perim*2*(H_C+H_F-1) : perim*2*(H_C+H_F-2)) : 0)" },
          { id: "row45", formula: "(H_O>1 && S_1M==0) ? perim*2 : 0" },
          { id: "row47", formula: "H_O==5 ? perim*2 : 0" },
          { id: "row48", formula: "(H_O==1?4:0)+(H_O==2.5?4:0)+(H_O==3?4:0)" },
          { id: "row49", formula: "(H_O==1.5?4:0)+(H_O==3.5?4:0)+(H_O==2.5?4:0)+(H_O==4.5?12:0)+(H_O==5?8:0)" },
          { id: "row50", formula: "(H_O==2?4:0)+(H_O==3.5?4:0)+(H_O==4?8:0)+(H_O==5?4:0)+(H_O==3?4:0)" },
          { id: "row51", formula: "(L2_O>0) ? ((H_O>=2?4*N_PA:0)+(H_O==1.5?2*N_PA:0)) : 0" },
          { id: "row52", formula: "(H_O>1 ? perim3*2 : 0) + (H_O>=3 ? 8*(H_C+H_F-2) : 0) + ((H_O>=2.5 && L2_O>0) ? (H_C+H_F-2)*2*N_PA : 0)" },
          { id: "row53", formula: "H_O>=2.5 ? perim3*2*(H_C+H_F-2) : 0" },
          { id: "row55", formula: "H_O>3 ? (W_F+W_C-1+totLC+totLF-1)*2 : 0" },

          // ---------------------------------------------------------------
          // Rows below have NO counterpart in the original INT_REINF_INT
          // sheet. They exist because the reinforcing reference drawings
          // (see steel_accessories_layout.json / the STEEL ACCESSORIES tab)
          // show these three parts but the workbook never gave them a
          // quantity formula, so the drawing had nothing to bind to.
          //
          // They ship with formula "0" ON PURPOSE: reinforcingParts() skips
          // any row whose value is not > 0, so until a real quantity rule is
          // entered these rows are completely BOM-neutral and cannot inflate
          // a bill of materials with a number nobody verified. Enter the real
          // formula on the STEEL ACCESSORIES tab (click the part on the
          // drawing) or the STEEL REINFORCING LOGIC tab; the edit saves
          // through the usual RuleEditorUI override store.
          // ---------------------------------------------------------------
          { id: "row_ext_brk_1780", formula: "0" },
          { id: "row_ext_brk_1860", formula: "0" },
          { id: "row_pt_1205", formula: "0" },
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
          // Drawing-only parts (see the three "0" rows above). The drawing
          // labels these WBR-1780Z / WBR-1860Z / 1200SA2-SA4; the catalog
          // names are WCP-1780Z / WBR-1860Z / WFB-1205SA2-SA4.
          row_ext_brk_1780: "WCP-1780Z",
          row_ext_brk_1860: "WBR-1860Z",
          row_pt_1205: { materialPrefix: "WFB-1205" },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Tie-Rod (External) -- EXACTLY verified (8/8 LibreOffice scenarios).
    // Only used when reinforcing method = External. CORRECTION: an earlier
    // version of this comment claimed "Internal reinforcing never uses
    // tie-rods -- INT_TIE_ROD sheet is dead/unreferenced" -- this was
    // backwards. Direct search of every formula in the reference workbook
    // shows INT_TIE_ROD is a real, live, separate subsystem
    // (PRINTOUT(BOM)!U105:W124 references INT_TIE_ROD!A8:C27 unconditionally,
    // gated on BASIC_TOOL!$B$21=1 i.e. Internal), producing real nonzero BOM
    // lines with its own catalog/layer-factor progression -- see
    // `tieRodInternal` below. EXT_TIE_ROD (this object) is the one gated the
    // OTHER way (RF==2, External only); the two systems are mutually
    // exclusive, both real.
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
        { maxH: 1.0, factor: 0 },
        { maxH: 1.5, factor: 1 },
        { maxH: 2.0, factor: 1 },
        { maxH: 2.5, factor: 2 },
        { maxH: 3.0, factor: 2 },
        { maxH: 3.5, factor: 2 },
        { maxH: 4.0, factor: 2 },
        { maxH: 4.5, factor: 2 },
        { maxH: 5.0, factor: 2 },
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

    // -----------------------------------------------------------------------
    // Tie-Rod (Internal) -- reverse-engineered + end-to-end verified against
    // INT_TIE_ROD's own cached values for the reference scenario (Internal,
    // W=3.5/L1=3/L2=3/H=1.5mH: TR-12M2880SA4x6, TR-12M3380SA4x4,
    // M12 NUT(SA4)x40, M12 BW(SA4)x40, coupler x0 -- all 5 reproduced
    // exactly). Only used when reinforcing method = Internal (RF==1); see
    // the corrected comment on `tieRod` above -- this is the real,
    // previously-missing counterpart, NOT dead code.
    //
    // Unlike External's single rolled-up WTR-12M300Z assembly, this system
    // emits its own real per-length rod SKUs (TR-12M####SA4/SA2) plus a
    // shared nut/washer/coupler -- see tieRodInternalParts() in
    // accessories_engine.js.
    //
    // Variables: W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F,
    // H_O, W_O, L1_O, L2_O, L3_O, L4_O, N_PA.
    //
    // KNOWN DIVERGENCE FROM THE SOURCE WORKBOOK (deliberate, not an
    // oversight): the reference Excel's rod/nut/washer/coupler part-number
    // formulas branch on BASIC_TOOL!$E$23/$G$23 -- cells that turn out to be
    // an unrelated text header and a blank cell (a copy/paste bug in the
    // original sheet), so in the *source* workbook this always resolves to
    // the SA4 (STS316) suffix no matter what the sheet's own "Internal
    // Tie-rod" F20/F21 dropdown says. This app already has a live
    // `#internalTieRod` select (SS316/SS304) with no consumer -- rather than
    // faithfully replicating the source's dead selector, `isSA4` here is
    // wired to that real dropdown (SS316->SA4, SS304->SA2), since both
    // catalog variants genuinely exist (PART_ID_TABLE) and a user-facing
    // control that silently does nothing serves nobody.
    tieRodInternal: {
      layerFactorTable: [
        { maxH: 1.0, factor: 0 },
        { maxH: 1.5, factor: 1 },
        { maxH: 2.0, factor: 1 },
        { maxH: 2.5, factor: 2 },
        { maxH: 3.0, factor: 3 },
        { maxH: 3.5, factor: 4 },
        { maxH: 4.0, factor: 5 },
        { maxH: 4.5, factor: 6 },
        { maxH: 5.0, factor: 7 },
        { factor: 7 },
      ],
      // Real catalog rod lengths (mm) -- TR-12M{len}SA4/SA2, PART_ID_TABLE rows 310-370.
      catalogLengthsMm: TIE_ROD_INTERNAL_CATALOG_LENGTHS_MM,
      // NOTE: this expression language (rule_engine.js) has no `.property`
      // access syntax, so the segment decomposition can't be stored as a
      // {pieces,count} object in scope like the JS spec draft used -- kept
      // scalar instead: `segCountFor(dim)` returns just the piece COUNT for
      // the coupler formula, and `countOfLen(dim, lengthMm)` (2-arg) returns
      // how many pieces of that exact length dim's decomposition contains,
      // for the per-catalog-length rows below. Both injected as scope
      // functions by accessories_engine.js's tieRodInternalParts(), same
      // mechanism as External tieRod's layerFactor/segCount.
      intermediates: [
        { name: "layer", formula: "layerFactor(H_O)" },
        { name: "lineW", formula: "layer*((L1_C+L1_F-1)+(L2_O>1?(L2_C+L2_F-1):0)+(L3_O>1?(L3_C+L3_F-1):0)+(L4_O>1?(L4_C+L4_F-1):0))+(H_O>2?(H_F+H_C-2)*N_PA:0)" },
        { name: "lineL1", formula: "layer*(W_C+W_F-1)" },
        { name: "lineL2", formula: "L2_O>0 ? layer*(W_C+W_F-1) : 0" },
        { name: "lineL3", formula: "L3_O>0 ? layer*(W_C+W_F-1) : 0" },
        { name: "lineL4", formula: "L4_O>0 ? layer*(W_C+W_F-1) : 0" },
        { name: "segWCount", formula: "segCountW(W_O)" },
        { name: "segL1Count", formula: "segCountW(L1_O)" },
        { name: "segL2Count", formula: "segCountP(L2_O)" },
        { name: "segL3Count", formula: "segCountP(L3_O)" },
        { name: "segL4Count", formula: "segCountP(L4_O)" },
      ],
      // Built programmatically (25 near-identical rows) rather than hand-
      // transcribed -- one row per real catalog length, plus nut/washer/
      // coupler. Outer wall segments (W, L1) use countOfLenW (-120mm deduction)
      // and partition segments (L2, L3, L4) use countOfLenP (-220mm deduction).
      rows: TIE_ROD_INTERNAL_CATALOG_LENGTHS_MM.map((len) => ({
        id: "len" + len,
        formula: `countOfLenW(W_O,${len})*lineW + countOfLenW(L1_O,${len})*lineL1 + countOfLenP(L2_O,${len})*lineL2 + countOfLenP(L3_O,${len})*lineL3 + countOfLenP(L4_O,${len})*lineL4`,
      })).concat([
        { id: "nut", formula: "4*(lineW+lineL1+lineL2+lineL3+lineL4)" },
        { id: "bw", formula: "4*(lineW+lineL1+lineL2+lineL3+lineL4)" },
        { id: "coupler", formula: "(segWCount>0?segWCount-1:0)*lineW + (segL1Count>0?segL1Count-1:0)*lineL1 + (segL2Count>0?segL2Count-1:0)*lineL2 + (segL3Count>0?segL3Count-1:0)*lineL3 + (segL4Count>0?segL4Count-1:0)*lineL4" },
      ]),
      // partNumbers built dynamically per isSA4 by accessories_engine.js
      // (rod length + suffix, nut/bw/coupler fixed names) -- see
      // tieRodInternalParts()'s resolvePartNo-equivalent.
      reducer: "sum_max0",
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AccessoriesRules;
  } else {
    global.AccessoriesRules = AccessoriesRules;
  }
})(typeof window !== "undefined" ? window : globalThis);
