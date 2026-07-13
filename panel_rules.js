// =============================================================================
// WATANI GRP Water Tank -- Panel QUANTITY RULE data (editable)
// =============================================================================
// Every coefficient/formula that decides "how many panels of each role" is
// defined here as data (see rule_engine.js for the expression syntax).
// panel_engine.js only computes the base geometry scope and then evaluates
// these rule groups -- edit values here, not panel_engine.js, to change a
// quantity rule.
//
// Variables available to every formula below (built from the tank's plan
// dimensions): W_C, W_F (Width whole-metre / half-metre-flag courses),
// L_C, L_F (sum of L1..L4 whole/half), L1_val..L4_val (raw metre values,
// 0 if that compartment length isn't used), L1_F..L4_F (half-metre flags
// for each length), N_PA (number of partitions), H_O (height in metres),
// H_C, H_F (height whole/half courses), pairs (see below).
//
// "pairs" = number of ADJACENT compartment boundaries where both sides are
// exactly 1.5m (an engineering rule about how corner brackets are shared
// between two 1.5m-long compartments) -- computed as an intermediate below
// from L1_val..L4_val so it, too, is visible/adjustable as a formula.
// =============================================================================
(function (global) {
  "use strict";

  const COMMON_INTERMEDIATES = [
    { name: "pairs", formula: "(L1_val==1.5 && L2_val==1.5 ? 1:0) + (L2_val==1.5 && L3_val==1.5 ? 1:0) + (L3_val==1.5 && L4_val==1.5 ? 1:0)" },
    { name: "any_L_is_15", formula: "L1_val==1.5 || L2_val==1.5 || L3_val==1.5 || L4_val==1.5" },
    { name: "any_L_has_half", formula: "L1_F==1 || L2_F==1 || L3_F==1 || L4_F==1" },
  ];

  // H_O (metres) -> ordered list of structural courses the tank is built
  // from, bottom to top-of-wall grade. This is a finite engineering rule
  // covering the 9 supported height grades (see panel_catalog.js).
  const COURSE_TABLE = {
    "1": ["LOWER_SOLO"],
    "1.5": ["TOP_15"],
    "2": ["TOP_20"],
    "2.5": ["TOP_15", "LOWER"],
    "3": ["TOP_20", "LOWER"],
    "3.5": ["TOP_15", "LOWER", "MID_LOWER"],
    "4": ["TOP_20", "LOWER", "MID_LOWER"],
    "4.5": ["TOP_15", "LOWER", "MID_LOWER", "MID_TOP"],
    "5": ["TOP_20", "LOWER", "MID_LOWER", "MID_TOP"],
  };

  // Which quantity-rule group (see RULE_GROUPS below) builds the side-panel
  // quantities for each course name.
  const COURSE_BUILDER_KEY = {
    TOP_15: "side15Top", TOP_20: "side20Top", LOWER_SOLO: "lower",
    LOWER: "lower", MID_LOWER: "midLower", MID_TOP: "midTop",
  };

  const RULE_GROUPS = {
    // roof + bottom panels (Panel!Y6:Y19, height-dependent grade only)
    roofBottom: {
      intermediates: [
        { name: "manhole", formula: "1+N_PA" },
        { name: "y11", formula: "(W_F==1 && any_L_is_15) ? (L2_F+L3_F+L4_F) : 0" },
        { name: "roof_full", formula: "max(W_C*L_C - manhole - y11, 0)" },
        { name: "roof_half", formula: "W_C*L_F + W_F*L_C" },
        { name: "roof_quarter", formula: "(W_F==1 && any_L_has_half) ? (L1_F+L2_F+L3_F+L4_F) : 0" },
        { name: "y15", formula: "W_F==1 ? W_F*N_PA : 0" },
        { name: "y16", formula: "W_F==0 ? ((L2_val==1.5?W_C:0)+(L3_val==1.5?W_C:0)+(L4_val==1.5?W_C:0)) : 0" },
        { name: "base_par", formula: "(W_C>=1 ? W_C*N_PA : 0) - y15 - y16" },
        { name: "y19", formula: "(L2_val==1?1:0)+(L3_val==1?1:0)+(L4_val==1?1:0)" },
        { name: "drain", formula: "(1+N_PA) - y19" },
        { name: "base_full", formula: "max(W_C*L_C - drain - base_par, 0)" },
        { name: "hbase", formula: "W_C*L_F + W_F*L_C - y15 - y16" },
        { name: "qbase", formula: "((W_F==1 && any_L_has_half) ? W_F*(L_F-1) : 0) - y11" },
      ],
      outputs: {
        manhole: "manhole", roof_full: "roof_full", roof_half: "roof_half", roof_quarter: "roof_quarter",
        base_full: "base_full", base_par: "base_par", hbase: "hbase", hbase_short: "y15", hbase_long: "y16",
        qbase: "qbase", drain: "drain",
      },
    },

    // TOP_15 course (Panel!Y20:Y34)
    side15Top: {
      intermediates: [
        { name: "par", formula: "N_PA-pairs" },
      ],
      outputs: {
        side: "(W_C+L_C)*2 - par - par",
        side_parLT: "par", side_parRT: "par",
        hside: "(W_F+L_F)*2 - pairs - pairs",
        qside: "(W_F+L_F)*2 - pairs - pairs",
        hside_parRT: "pairs", hside_parLT: "pairs",
        qside_parRT: "pairs", qside_parLT: "pairs",
      },
    },

    // TOP_20 course (Panel!Y35:Y49)
    side20Top: {
      intermediates: [],
      outputs: {
        side: "(W_C+L_C)*2 - N_PA - N_PA",
        side_parLT: "N_PA", side_parRT: "N_PA",
        hside_a: "(W_F+L_F)*2 - pairs - pairs",
        hside_b: "(W_F+L_F)*2 - pairs - pairs",
        hside_a_parRT: "pairs", hside_a_parLT: "pairs",
        hside_b_parRT: "pairs", hside_b_parLT: "pairs",
      },
    },

    // MID_TOP filler course (Panel!Y50:Y55)
    midTop: {
      intermediates: [
        { name: "par", formula: "N_PA-pairs" },
      ],
      outputs: {
        side: "(W_C+L_C)*2 - par - par",
        side_parLT: "par", side_parRT: "par",
        hside: "(W_F+L_F)*2 - pairs - pairs",
        hside_parRT: "pairs", hside_parLT: "pairs",
      },
    },

    // MID_LOWER filler course (Panel!Y56:Y61) -- NOTE: unlike MID_TOP,
    // source Y57/Y58 do NOT subtract the "pairs" term (transcribed
    // faithfully from the original workbook -- a documented quirk, not a bug
    // we introduced).
    midLower: {
      intermediates: [],
      outputs: {
        side: "(W_C+L_C)*2 - N_PA - N_PA",
        side_parLT: "N_PA", side_parRT: "N_PA",
        hside: "(W_F+L_F)*2 - pairs - pairs",
        hside_parRT: "pairs", hside_parLT: "pairs",
      },
    },

    // LOWER / LOWER_SOLO course (Panel!Y62:Y70)
    lower: {
      intermediates: [
        { name: "par_lt", formula: "N_PA" },
        { name: "par_rt", formula: "N_PA" },
        { name: "nozzle", formula: "(H_O==1 || H_O>2) ? (N_PA+1) : 0" },
      ],
      outputs: {
        side: "(W_C+L_C)*2 - par_lt - par_rt - nozzle",
        side_parLT: "par_lt", side_parRT: "par_rt",
        side_nozzle: "nozzle",
        hside: "(W_F+L_F)*2 - pairs - pairs",
        hside_parRT: "pairs", hside_parLT: "pairs",
      },
    },

    // Filler used only when no LOWER/LOWER_SOLO course is present (Panel!Y68/Y65)
    baseFiller: {
      intermediates: [
        { name: "nozzle", formula: "(H_O==1 || H_O>2) ? (N_PA+1) : 0" },
      ],
      outputs: {
        hside: "(W_F+L_F)*2 - pairs - pairs",
        nozzle: "nozzle",
      },
    },
  };

  // Partition panel templates: which output keys a partition course produces.
  // "base"/"vert" are common intermediates computed once (base=W_C*N_PA,
  // vert=W_F*N_PA); templates just decide which extra keys to expose.
  const PARTITION_TEMPLATE_BY_COURSE = {
    TOP_15: "top15", TOP_20: "top20",
    LOWER: "other", LOWER_SOLO: "other", MID_LOWER: "other", MID_TOP: "other",
  };
  const PARTITION_TEMPLATES = {
    top15: { partition: "base", partition_2: "base", vert: "vert", vert_2: "W_F*H_F*N_PA" },
    // NOTE: TOP_20's vert_2 is NOT gated by H_F, unlike TOP_15's -- transcribed
    // faithfully from the original workbook.
    top20: { partition: "base", partition_2: "base", vert: "vert", vert_2: "vert" },
    other: { partition: "base", vert: "vert" },
  };

  const PanelRules = {
    COMMON_INTERMEDIATES, COURSE_TABLE, COURSE_BUILDER_KEY, RULE_GROUPS,
    PARTITION_TEMPLATE_BY_COURSE, PARTITION_TEMPLATES,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PanelRules;
  } else {
    global.PanelRules = PanelRules;
  }
})(typeof window !== "undefined" ? window : globalThis);
