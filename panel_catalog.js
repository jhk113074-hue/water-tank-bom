// =============================================================================
// WATANI GRP Water Tank -- Panel CATALOG data (editable, vendor-specific)
// =============================================================================
// Pure data: which physical part number WATANI uses for each panel role at
// each supported tank height. To add/change a vendor's part numbers, or add
// a new height grade, edit this file only -- panel_engine.js just looks
// values up from here, it contains no vendor-specific logic itself.
//
// Key shape: "<section>.<role>" for roof/bottom (height-dependent grade
// only, not geometry-dependent) and "<section>.<course>.<role>" for
// side/partition (also depends on which structural course -- TOP_15,
// TOP_20, LOWER, MID_LOWER, MID_TOP -- the panel belongs to).
// =============================================================================
(function (global) {
  "use strict";

  const CATALOG_BY_HEIGHT =
{
  "1": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF10BX",
    "roof_bottom.base_par": "BF10BP",
    "roof_bottom.hbase": "NH10BX",
    "roof_bottom.hbase_short": "NH10BPS",
    "roof_bottom.hbase_long": "NH10BPL",
    "roof_bottom.qbase": "NQ10BX",
    "roof_bottom.drain": "NF10BX",
    "side.LOWER.side": "SF10SX",
    "side.LOWER.side_parLT": "SF10SL",
    "side.LOWER.side_parRT": "SF10SR",
    "side.LOWER.side_nozzle": "NF10SX",
    "side.LOWER.hside": "NH10SX",
    "side.LOWER.hside_parRT": "NH10SR",
    "side.LOWER.hside_parLT": "NH10SL",
    "partition.LOWER.partition": "PF10HU15",
    "partition.LOWER.vert": "PH10SU15"
  },
  "1.5": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF20BX",
    "roof_bottom.base_par": "BF20BP",
    "roof_bottom.hbase": "NH20BX",
    "roof_bottom.hbase_short": "NH20BPS",
    "roof_bottom.hbase_long": "NH20BPL",
    "roof_bottom.qbase": "NQ20BX",
    "roof_bottom.drain": "NF15BX",
    "side.TOP_15.side": "SL15SX",
    "side.TOP_15.side_parLT": "SL15SL",
    "side.TOP_15.side_parRT": "SL15SR",
    "side.TOP_15.hside": "NH15LX",
    "side.TOP_15.hside_parRT": "NH20LR",
    "side.TOP_15.hside_parLT": "NH20LL",
    "side.TOP_15.qside": "NQ10HX",
    "side.TOP_15.qside_parRT": "NQ10HR",
    "side.TOP_15.qside_parLT": "NQ10HL",
    "side.LOWER.hside": "NH15LX",
    "side.LOWER.hside_parRT": "NH20LL",
    "side.LOWER.hside_parLT": "NH20LR",
    "partition.TOP_15.partition": "PF15MX",
    "partition.TOP_15.partition_2": "PH15HU15",
    "partition.TOP_15.vert": "PH15MX",
    "partition.TOP_15.vert_2": "NQ10HU15"
  },
  "2": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF20BX",
    "roof_bottom.base_par": "BF20BP",
    "roof_bottom.hbase": "NH20BX",
    "roof_bottom.hbase_short": "NH20BPS",
    "roof_bottom.hbase_long": "NH20BPL",
    "roof_bottom.qbase": "NQ20BX",
    "roof_bottom.drain": "NF20BX",
    "side.TOP_20.side": "ST20SX",
    "side.TOP_20.side_parLT": "ST20SL",
    "side.TOP_20.side_parRT": "ST20SR",
    "side.TOP_20.hside_a": "NH10HX",
    "side.TOP_20.hside_a_parRT": "NH10HR",
    "side.TOP_20.hside_a_parLT": "NH10HL",
    "side.TOP_20.hside_b": "NH20LX",
    "side.TOP_20.hside_b_parRT": "NH20LR",
    "side.TOP_20.hside_b_parLT": "NH20LL",
    "side.LOWER.hside": "NH20LX",
    "side.LOWER.hside_parRT": "NH20LL",
    "side.LOWER.hside_parLT": "NH20LR",
    "partition.TOP_20.partition": "PF20HX",
    "partition.TOP_20.partition_2": "PF20LX",
    "partition.TOP_20.vert": "PH10HX",
    "partition.TOP_20.vert_2": "PH20MX"
  },
  "2.5": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF30BX",
    "roof_bottom.base_par": "BF30BP",
    "roof_bottom.hbase": "NH25BX",
    "roof_bottom.hbase_short": "NH30BPS",
    "roof_bottom.hbase_long": "NH25BPL",
    "roof_bottom.qbase": "NQ25BX",
    "roof_bottom.drain": "NF30BX",
    "side.TOP_15.side": "SL15HX",
    "side.TOP_15.side_parLT": "SL15HL",
    "side.TOP_15.side_parRT": "SL15HR",
    "side.TOP_15.hside": "NH15MX",
    "side.TOP_15.hside_parRT": "NH15MR",
    "side.TOP_15.hside_parLT": "NH15ML",
    "side.TOP_15.qside": "NQ10HX",
    "side.TOP_15.qside_parRT": "NQ10HR",
    "side.TOP_15.qside_parLT": "NQ10HL",
    "side.LOWER.side": "SF30LX",
    "side.LOWER.side_parLT": "SF30LL",
    "side.LOWER.side_parRT": "SF20LR",
    "side.LOWER.side_nozzle": "NF30LX",
    "side.LOWER.hside": "NH25LX",
    "side.LOWER.hside_parRT": "NH25LL",
    "side.LOWER.hside_parLT": "NH25LR",
    "partition.TOP_15.partition": "PF10HX",
    "partition.TOP_15.partition_2": "NH15MX",
    "partition.TOP_15.vert": "PH10HX",
    "partition.TOP_15.vert_2": "NQ15MX",
    "partition.LOWER.partition": "PF25MX",
    "partition.LOWER.vert": "PH25MX"
  },
  "3": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF30BX",
    "roof_bottom.base_par": "BF30BP",
    "roof_bottom.hbase": "NH30BX",
    "roof_bottom.hbase_short": "NH30BPS",
    "roof_bottom.hbase_long": "NH30BPL",
    "roof_bottom.qbase": "NQ30BX",
    "roof_bottom.drain": "NF30BX",
    "side.TOP_20.side": "ST20HX",
    "side.TOP_20.side_parLT": "ST20HL",
    "side.TOP_20.side_parRT": "ST20HR",
    "side.TOP_20.hside_a": "NH10HX",
    "side.TOP_20.hside_a_parRT": "NH10HR",
    "side.TOP_20.hside_a_parLT": "NH10HL",
    "side.TOP_20.hside_b": "NH20MX",
    "side.TOP_20.hside_b_parRT": "NH20MR",
    "side.TOP_20.hside_b_parLT": "NH20ML",
    "side.LOWER.side": "SF30LX",
    "side.LOWER.side_parLT": "SF30LL",
    "side.LOWER.side_parRT": "SF30LR",
    "side.LOWER.side_nozzle": "NF30LX",
    "side.LOWER.hside": "NH30LX",
    "side.LOWER.hside_parRT": "NH30LL",
    "side.LOWER.hside_parLT": "NH30LR",
    "partition.TOP_20.partition": "PF10HX",
    "partition.TOP_20.partition_2": "NF20MX",
    "partition.TOP_20.vert": "PH10HX",
    "partition.TOP_20.vert_2": "NH20MX",
    "partition.LOWER.partition": "PF30MX",
    "partition.LOWER.vert": "PH30MX"
  },
  "3.5": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF40BX",
    "roof_bottom.base_par": "BF40BP",
    "roof_bottom.hbase": "NH35BX",
    "roof_bottom.hbase_short": "NH35BPS",
    "roof_bottom.hbase_long": "NH35BPL",
    "roof_bottom.qbase": "NQ35BX",
    "roof_bottom.drain": "NF40BX",
    "side.TOP_15.side": "SL15HX",
    "side.TOP_15.side_parLT": "SL15HL",
    "side.TOP_15.side_parRT": "SL15HR",
    "side.TOP_15.hside": "NH15MX",
    "side.TOP_15.hside_parRT": "NH15MR",
    "side.TOP_15.hside_parLT": "NH15ML",
    "side.TOP_15.qside": "NQ10HX",
    "side.TOP_15.qside_parRT": "NQ10HR",
    "side.TOP_15.qside_parLT": "NQ10HL",
    "side.MID_LOWER.side": "SF30MX",
    "side.MID_LOWER.side_parLT": "SF30ML",
    "side.MID_LOWER.side_parRT": "SF30MR",
    "side.MID_LOWER.hside": "NH25MX",
    "side.LOWER.side": "SF40LX",
    "side.LOWER.side_parLT": "SF40LL",
    "side.LOWER.side_parRT": "SF40LR",
    "side.LOWER.side_nozzle": "NF40LX",
    "side.LOWER.hside": "NH35LX",
    "side.LOWER.hside_parRT": "NH35LL",
    "side.LOWER.hside_parLT": "NH35LR",
    "partition.TOP_15.partition": "PF10HX",
    "partition.TOP_15.partition_2": "NH15MX",
    "partition.TOP_15.vert": "PH10HX",
    "partition.TOP_15.vert_2": "NQ15MX",
    "partition.MID_LOWER.partition": "NF25MX",
    "partition.MID_LOWER.vert": "NH25MX",
    "partition.LOWER.partition": "PF35MX",
    "partition.LOWER.vert": "PH35MX"
  },
  "4": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF40BX",
    "roof_bottom.base_par": "BF40BP",
    "roof_bottom.hbase": "NH40BX",
    "roof_bottom.hbase_short": "NH40BPS",
    "roof_bottom.hbase_long": "NH40BPL",
    "roof_bottom.qbase": "NQ40BX",
    "roof_bottom.drain": "NF40BX",
    "side.TOP_20.side": "ST20HX",
    "side.TOP_20.side_parLT": "ST20HL",
    "side.TOP_20.side_parRT": "ST20HR",
    "side.TOP_20.hside_a": "NH10HX",
    "side.TOP_20.hside_a_parRT": "NH10HR",
    "side.TOP_20.hside_a_parLT": "NH10HL",
    "side.TOP_20.hside_b": "NH20MX",
    "side.TOP_20.hside_b_parRT": "NH20MR",
    "side.TOP_20.hside_b_parLT": "NH20ML",
    "side.MID_LOWER.side": "SF30MX",
    "side.MID_LOWER.side_parLT": "SF30ML",
    "side.MID_LOWER.side_parRT": "SF30MR",
    "side.MID_LOWER.hside": "NH30MX",
    "side.LOWER.side": "SF40LX",
    "side.LOWER.side_parLT": "SF40LL",
    "side.LOWER.side_parRT": "SF40LR",
    "side.LOWER.side_nozzle": "NF40LX",
    "side.LOWER.hside": "NH40LX",
    "side.LOWER.hside_parRT": "NH40LL",
    "side.LOWER.hside_parLT": "NH40LR",
    "partition.TOP_20.partition": "PF10HX",
    "partition.TOP_20.partition_2": "NF20MX",
    "partition.TOP_20.vert": "PH10HX",
    "partition.TOP_20.vert_2": "NH20MX",
    "partition.MID_LOWER.partition": "NF30MX",
    "partition.MID_LOWER.vert": "NH30MX",
    "partition.LOWER.partition": "PF40MX",
    "partition.LOWER.vert": "PH40MX"
  },
  "4.5": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF45BX",
    "roof_bottom.base_par": "BF45BP",
    "roof_bottom.hbase": "NH45BX",
    "roof_bottom.hbase_short": "NH45BPS",
    "roof_bottom.hbase_long": "NH45BPL",
    "roof_bottom.qbase": "NQ45BX",
    "roof_bottom.drain": "NF45BX",
    "side.TOP_15.side": "SL15HX",
    "side.TOP_15.side_parLT": "SL15HL",
    "side.TOP_15.side_parRT": "SL15HR",
    "side.TOP_15.hside": "NH15MX",
    "side.TOP_15.hside_parRT": "NH15MR",
    "side.TOP_15.hside_parLT": "NH15ML",
    "side.TOP_15.qside": "NQ10HX",
    "side.TOP_15.qside_parRT": "NQ10HR",
    "side.TOP_15.qside_parLT": "NQ10HL",
    "side.MID_TOP.side": "SF30MX",
    "side.MID_TOP.side_parLT": "SF30MR",
    "side.MID_TOP.side_parRT": "SF30ML",
    "side.MID_TOP.hside": "NH25MX",
    "side.MID_LOWER.side": "SF40MX",
    "side.MID_LOWER.side_parLT": "SF40ML",
    "side.MID_LOWER.side_parRT": "SF40MR",
    "side.MID_LOWER.hside": "NH35MX",
    "side.LOWER.side": "SF50LX",
    "side.LOWER.side_parLT": "SF50LL",
    "side.LOWER.side_parRT": "SF50LR",
    "side.LOWER.side_nozzle": "NF50LX",
    "side.LOWER.hside": "KH45LX",
    "side.LOWER.hside_parRT": "NH45LL",
    "side.LOWER.hside_parLT": "NH45LR",
    "partition.TOP_15.partition": "PF10HX",
    "partition.TOP_15.partition_2": "NH15MX",
    "partition.TOP_15.vert": "PH10HX",
    "partition.TOP_15.vert_2": "NQ15MX",
    "partition.MID_TOP.partition": "NF25MX",
    "partition.MID_TOP.vert": "NH25MX",
    "partition.MID_LOWER.partition": "NF35MX",
    "partition.MID_LOWER.vert": "NH35MX",
    "partition.LOWER.partition": "PF45MX",
    "partition.LOWER.vert": "PH45MX"
  },
  "5": {
    "roof_bottom.manhole": "MF00TX",
    "roof_bottom.roof_full": "RF00TX",
    "roof_bottom.roof_half": "NH10TX",
    "roof_bottom.roof_quarter": "NQ10TX",
    "roof_bottom.base_full": "BF50BX",
    "roof_bottom.base_par": "BF50BP",
    "roof_bottom.hbase": "NH50BX",
    "roof_bottom.hbase_short": "NH50BPS",
    "roof_bottom.hbase_long": "NH50BPL",
    "roof_bottom.qbase": "NQ50BX",
    "roof_bottom.drain": "NF50BX",
    "side.TOP_20.side": "ST20HX",
    "side.TOP_20.side_parLT": "ST20HL",
    "side.TOP_20.side_parRT": "ST20HR",
    "side.TOP_20.hside_a": "NH10HX",
    "side.TOP_20.hside_a_parRT": "NH10HR",
    "side.TOP_20.hside_a_parLT": "NH10HL",
    "side.TOP_20.hside_b": "NH20MX",
    "side.TOP_20.hside_b_parRT": "NH20MR",
    "side.TOP_20.hside_b_parLT": "NH20ML",
    "side.MID_TOP.side": "SF30MX",
    "side.MID_TOP.side_parLT": "SF30MR",
    "side.MID_TOP.side_parRT": "SF30ML",
    "side.MID_TOP.hside": "NH30MX",
    "side.MID_LOWER.side": "SF40MX",
    "side.MID_LOWER.side_parLT": "SF40ML",
    "side.MID_LOWER.side_parRT": "SF40MR",
    "side.MID_LOWER.hside": "NH40MX",
    "side.LOWER.side": "SF50LX",
    "side.LOWER.side_parLT": "SF50LL",
    "side.LOWER.side_parRT": "SF50LR",
    "side.LOWER.side_nozzle": "N50LX",
    "side.LOWER.hside": "NH50LX",
    "side.LOWER.hside_parRT": "NH50LL",
    "side.LOWER.hside_parLT": "NH50LR",
    "partition.TOP_20.partition": "PF10HX",
    "partition.TOP_20.partition_2": "NF20MX",
    "partition.TOP_20.vert": "PH10HX",
    "partition.TOP_20.vert_2": "NH20MX",
    "partition.MID_TOP.partition": "NF30MX",
    "partition.MID_TOP.vert": "NH30MX",
    "partition.MID_LOWER.partition": "NF40MX",
    "partition.MID_LOWER.vert": "NH40MX",
    "partition.LOWER.partition": "PF50MX",
    "partition.LOWER.vert": "PH50MX"
  }
};

  // Human-readable role labels (name / spec hint), independent of vendor.
  const ROOF_BOTTOM_LABELS = {
    manhole: "Manhole", roof_full: "Roof", roof_half: "Roof Half", roof_quarter: "Roof Quarter",
    base_full: "Bottom", base_par: "Bottom (Partition)", hbase: "Bottom Half",
    hbase_short: "Bottom Half (Short)", hbase_long: "Bottom Half (Long)",
    qbase: "Bottom Quarter", drain: "Drain",
  };
  const SIDE_ROLE_LABELS = {
    side: "Side", side_parLT: "Side (Par-LT)", side_parRT: "Side (Par-RT)",
    hside: "Side Half", hside_parLT: "Side Half (Par-LT)", hside_parRT: "Side Half (Par-RT)",
    qside: "Side Quarter", qside_parLT: "Side Quarter (Par-LT)", qside_parRT: "Side Quarter (Par-RT)",
    hside_a: "Side Half A", hside_a_parLT: "Side Half A (Par-LT)", hside_a_parRT: "Side Half A (Par-RT)",
    hside_b: "Side Half B", hside_b_parLT: "Side Half B (Par-LT)", hside_b_parRT: "Side Half B (Par-RT)",
    side_nozzle: "Side (Nozzle)", nozzle: "Nozzle",
  };
  const PARTITION_ROLE_LABELS = {
    partition: "Partition", partition_2: "Partition (Type 2)",
    vert: "Partition Vertical", vert_2: "Partition Vertical (Type 2)",
  };
  const COURSE_HEIGHT_LABEL = {
    TOP_15: "1.5mH", TOP_20: "2.0mH", LOWER: "1.0mH", LOWER_SOLO: "1.0mH",
    MID_LOWER: "1.0mH", MID_TOP: "1.0mH", BASE_FILLER: "1.0mH",
  };
  // Sealing tape (3mm PVC) unit length per panel role, in meters -- how much
  // tape one panel of that role needs around its joints. Unlike
  // CATALOG_BY_HEIGHT this does NOT vary by tank height (it's a fixed
  // property of the role itself, verified against the reference workbook's
  // Panel sheet columns AB "Sealing_Tape(Corner)"/AD "Sealing_Tape(3mm_PVC)",
  // rows 6-95). Total tape needed = this value x how many panels of that
  // role are in the live BOM, summed across all roles -- see
  // reinforcing_audit.js's sealing-tape section for that aggregation. Every
  // one of the 90 source rows had a 0/blank "Sealing_Tape(Corner)" value (no
  // exceptions), so only the 3mm PVC figure is modeled here.
  const SEALING_TAPE_3MM_PVC_BY_ROLE = {
    "roof_bottom.manhole": 2.1, "roof_bottom.roof_full": 2.1, "roof_bottom.roof_half": 1.6,
    "roof_bottom.roof_quarter": 0.6, "roof_bottom.base_full": 4.1, "roof_bottom.base_par": 5.1,
    "roof_bottom.hbase": 4.1, "roof_bottom.hbase_short": 4.1, "roof_bottom.hbase_long": 4.1,
    "roof_bottom.qbase": 4.1, "roof_bottom.drain": 4.1,

    "side.TOP_15.side": 4.1, "side.TOP_15.side_parLT": 6.1, "side.TOP_15.side_parRT": 6.1,
    "side.TOP_15.hside": 3.1, "side.TOP_15.hside_parRT": 3.1, "side.TOP_15.hside_parLT": 3.1,
    "side.TOP_15.qside": 1.1, "side.TOP_15.qside_parRT": 1.6, "side.TOP_15.qside_parLT": 1.6,

    "side.TOP_20.side": 5.1, "side.TOP_20.side_parLT": 6.1, "side.TOP_20.side_parRT": 6.1,
    "side.TOP_20.hside_a": 3.1, "side.TOP_20.hside_a_parRT": 4.1, "side.TOP_20.hside_a_parLT": 4.1,
    "side.TOP_20.hside_b": 3.1, "side.TOP_20.hside_b_parRT": 4.1, "side.TOP_20.hside_b_parLT": 4.1,

    "side.MID_TOP.side": 4.1, "side.MID_TOP.side_parLT": 5.1, "side.MID_TOP.side_parRT": 5.1,
    "side.MID_TOP.hside": 3.1,
    "side.MID_LOWER.side": 4.1, "side.MID_LOWER.side_parLT": 5.1, "side.MID_LOWER.side_parRT": 5.1,
    "side.MID_LOWER.hside": 3.1,

    "side.LOWER.side": 4.1, "side.LOWER.side_parLT": 5.1, "side.LOWER.side_parRT": 5.1,
    "side.LOWER.side_nozzle": 4.1, "side.LOWER.hside": 3.1,
    "side.LOWER.hside_parRT": 4.1, "side.LOWER.hside_parLT": 4.1,

    "partition.TOP_15.partition": 3.1, "partition.TOP_15.partition_2": 4.1,
    "partition.TOP_15.vert": 4.1, "partition.TOP_15.vert_2": 4.1,
    "partition.TOP_20.partition": 3.1, "partition.TOP_20.partition_2": 4.1,
    "partition.TOP_20.vert": 3.1, "partition.TOP_20.vert_2": 4.1,
    "partition.MID_TOP.partition": 4.1, "partition.MID_TOP.vert": 4.1,
    "partition.MID_LOWER.partition": 4.1, "partition.MID_LOWER.vert": 4.1,
    "partition.LOWER.partition": 4.1, "partition.LOWER.vert": 4.1,
  };

  // BASE_FILLER and LOWER_SOLO quantities are catalogued under the same key
  // as "LOWER" (they represent the same structural row/part in the source
  // sheet -- confirmed by COURSE_HEIGHT_LABEL already treating LOWER_SOLO
  // and LOWER as the same "1.0mH" grade, and by the H=1mH catalog block
  // above only defining "side.LOWER.*"/"partition.LOWER.*" keys, never
  // "side.LOWER_SOLO.*". Found missing during Visual Config verification --
  // without this alias, a solo 1.0mH tank's side/partition panels silently
  // fell back to a "TBD-side.LOWER_SOLO.*" placeholder part number.).
  const CATALOG_COURSE_ALIAS = { BASE_FILLER: "LOWER", LOWER_SOLO: "LOWER" };

  function sealingTapeMetersDetail(g, sidePanelOnly) {
    if (!g || typeof PanelEngine === "undefined" || typeof PanelEngine.evalPanels !== "function") {
      return { rows: [], totalMeters: 0 };
    }
    const evalRes = PanelEngine.evalPanels(g);
    const counts = {};
    if (evalRes) {
      Object.keys(evalRes).forEach(function (k) {
        counts[k] = evalRes[k];
      });
    }

    const rows = [];
    let totalMeters = 0;

    Object.keys(SEALING_TAPE_3MM_PVC_BY_ROLE).forEach(function (roleKey) {
      const unit = SEALING_TAPE_3MM_PVC_BY_ROLE[roleKey];
      const count = counts[roleKey] || 0;
      if (count > 0) {
        const subtotal = Math.round(unit * count * 10) / 10;
        rows.push({
          catalogKey: roleKey,
          unit: unit,
          count: count,
          subtotal: subtotal
        });
        totalMeters += subtotal;
      }
    });

    return {
      rows: rows,
      totalMeters: Math.round(totalMeters * 10) / 10
    };
  }

  const PanelCatalog = {
    CATALOG_BY_HEIGHT, ROOF_BOTTOM_LABELS, SIDE_ROLE_LABELS, PARTITION_ROLE_LABELS,
    COURSE_HEIGHT_LABEL, CATALOG_COURSE_ALIAS, SEALING_TAPE_3MM_PVC_BY_ROLE,
    sealingTapeMetersDetail,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PanelCatalog;
  } else {
    global.PanelCatalog = PanelCatalog;
  }
})(typeof window !== "undefined" ? window : globalThis);
