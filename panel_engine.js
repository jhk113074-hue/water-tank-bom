// =============================================================================
// WATANI GRP Water Tank -- Panel BOM Engine (JavaScript port for water-tank-bom app)
// =============================================================================
// Ported 1:1 from panel_engine.py, the reverse-engineered & validated reference
// implementation (12/12 scenarios verified against the original .xlsm
// recalculated in LibreOffice -- see project report
// "WATANI_BOM_로직분석_보고서.docx" for the full derivation).
//
// This file separates FOUR concerns that were tangled together in the Excel
// formula chain (BASIC_TOOL -> Panel!Y -> Panel!Z HLOOKUP -> PRINTOUT macro):
//   1. GEOMETRY       -- pure arithmetic on plan dimensions (vendor independent)
//   2. COURSE STACKING -- which structural courses a tank of height H is built
//                         from (an engineering rule, not vendor data)
//   3. QUANTITY RULES  -- "how many panels of each role" (Panel!Y formulas,
//                         transcribed 1:1, original cell noted in comments)
//   4. CATALOG         -- WATANI's part-number root per role per height
//                         (CATALOG_BY_HEIGHT below). A second vendor supplies
//                         a different table in the same shape; nothing above
//                         changes.
//
// SCOPE: covers Roof/Manhole, Bottom/Drain, Side and Partition panels for the
// DEFAULT product configuration (1.5m/2.0m combo panels). All plan dimensions
// must be exact multiples of 0.5m -- see dimOf().
// =============================================================================

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // 1. GEOMETRY
  // ---------------------------------------------------------------------

  function dimOf(value) {
    const whole = Math.trunc(value + 1e-9);
    const remainder = Math.round((value - whole) * 1e6) / 1e6;
    if (remainder !== 0 && remainder !== 0.5) {
      throw new Error(
        `${value}m은 0.5m 단위가 아닙니다. 패널 모듈(0.5/1.0/1.5/2.0m)로 표현할 수 없는 치수입니다.`
      );
    }
    return { value: value, whole: whole, half: remainder === 0.5 ? 1 : 0 };
  }

  function makeGeometry(W, L1, H, L2, L3, L4) {
    L2 = L2 || 0; L3 = L3 || 0; L4 = L4 || 0;
    const nPa = L4 > 0 ? 3 : L3 > 0 ? 2 : L2 > 0 ? 1 : 0;
    return {
      W: dimOf(W), L1: dimOf(L1), L2: dimOf(L2), L3: dimOf(L3), L4: dimOf(L4), H: dimOf(H),
      n_partitions: nPa,
      get L_C_sum() { return this.L1.whole + this.L2.whole + this.L3.whole + this.L4.whole; },
      get L_F_sum() { return this.L1.half + this.L2.half + this.L3.half + this.L4.half; },
      get any_L_is_15() {
        return [this.L1, this.L2, this.L3, this.L4].some(l => l.value === 1.5);
      },
      get any_L_has_half() {
        return !!(this.L1.half || this.L2.half || this.L3.half || this.L4.half);
      },
    };
  }

  function adjacent15mPairs(g) {
    const Ls = [g.L1.value, g.L2.value, g.L3.value, g.L4.value];
    let n = 0;
    for (let i = 0; i < Ls.length - 1; i++) {
      if (Ls[i] === 1.5 && Ls[i + 1] === 1.5) n++;
    }
    return n;
  }

  // ---------------------------------------------------------------------
  // 2. COURSE STACKING RULE
  // ---------------------------------------------------------------------
  const COURSE_HEIGHTS = { TOP_15: 1.5, TOP_20: 2.0 };

  function selectCourses(H_O) {
    if (H_O === 1) return ["LOWER_SOLO"];
    const top = (H_O === 1.5 || H_O === 2.5 || H_O === 3.5 || H_O === 4.5) ? "TOP_15" : "TOP_20";
    const remaining = Math.round((H_O - COURSE_HEIGHTS[top]) * 1e6) / 1e6;
    const fillers = Math.round(remaining);
    const courses = [top];
    if (fillers >= 1) courses.push("LOWER");
    if (fillers >= 2) courses.push("MID_LOWER");
    if (fillers >= 3) courses.push("MID_TOP");
    return courses;
  }

  // ---------------------------------------------------------------------
  // 3. QUANTITY RULES  (Panel!Y6:Y95, transcribed 1:1 -- source cell in comments)
  // ---------------------------------------------------------------------

  function roofAndBottom(g) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const N_PA = g.n_partitions;

    const manhole = 1 + N_PA; // Y6
    const y11 = (W_F === 1 && g.any_L_is_15) ? (g.L2.half + g.L3.half + g.L4.half) : 0; // Y11
    const roof_full = Math.max(W_C * L_C - manhole - y11, 0); // Y7
    const roof_half = W_C * L_F + W_F * L_C; // Y8
    const roof_quarter = (W_F === 1 && g.any_L_has_half) ? (g.L1.half + g.L2.half + g.L3.half + g.L4.half) : 0; // Y9

    const y15 = W_F === 1 ? W_F * N_PA : 0; // Y15 HBase_Short
    let y16 = 0; // Y16 HBase_Long
    [g.L2, g.L3, g.L4].forEach(L => { if (W_F === 0 && L.value === 1.5) y16 += W_C; });
    const base_par = (W_C >= 1 ? W_C * N_PA : 0) - y15 - y16; // Y13
    let y19 = 0;
    [g.L2, g.L3, g.L4].forEach(L => { if (L.value === 1) y19 += 1; });
    const drain = (1 + N_PA) - y19; // Y18
    const base_full = Math.max(W_C * L_C - drain - base_par, 0); // Y12
    const hbase = W_C * L_F + W_F * L_C - y15 - y16; // Y14
    const qbase = ((W_F === 1 && g.any_L_has_half) ? W_F * (L_F - 1) : 0) - y11; // Y17

    return {
      manhole, roof_full, roof_half, roof_quarter, base_full, base_par,
      hbase, hbase_short: y15, hbase_long: y16, qbase, drain,
    };
  }

  function side15Top(g) {
    const W_C = g.W.whole, W_F = g.W.half, L_C = g.L_C_sum, L_F = g.L_F_sum;
    const N_PA = g.n_partitions, pairs = adjacent15mPairs(g);
    const par = N_PA - pairs; // Y21 = Y22
    const side = (W_C + L_C) * 2 - par - par; // Y20
    const hside = (W_F + L_F) * 2 - pairs - pairs; // Y29
    const qside = (W_F + L_F) * 2 - pairs - pairs; // Y32
    const out = { side, side_parLT: par, side_parRT: par, hside, qside };
    if (pairs) {
      out.hside_parRT = pairs; out.hside_parLT = pairs; // Y30/Y31
      out.qside_parRT = pairs; out.qside_parLT = pairs; // Y33/Y34
    }
    return out;
  }

  function side20Top(g) {
    const W_C = g.W.whole, W_F = g.W.half, L_C = g.L_C_sum, L_F = g.L_F_sum;
    const N_PA = g.n_partitions, pairs = adjacent15mPairs(g);
    const side = (W_C + L_C) * 2 - N_PA - N_PA; // Y35 (Y36=Y37=N_PA)
    const hside_a = (W_F + L_F) * 2 - pairs - pairs; // Y44
    const hside_b = (W_F + L_F) * 2 - pairs - pairs; // Y47
    const out = { side, side_parLT: N_PA, side_parRT: N_PA, hside_a, hside_b };
    if (pairs) {
      out.hside_a_parRT = pairs; out.hside_a_parLT = pairs; // Y45/Y46
      out.hside_b_parRT = pairs; out.hside_b_parLT = pairs; // Y48/Y49
    }
    return out;
  }

  function midTopCourse(g) {
    const W_C = g.W.whole, W_F = g.W.half, L_C = g.L_C_sum, L_F = g.L_F_sum;
    const N_PA = g.n_partitions, pairs = adjacent15mPairs(g);
    const par = N_PA - pairs; // Y51=Y52
    const side = (W_C + L_C) * 2 - par - par; // Y50
    const hside = (W_F + L_F) * 2 - pairs - pairs; // Y53
    const out = { side, side_parLT: par, side_parRT: par, hside };
    if (pairs) { out.hside_parRT = pairs; out.hside_parLT = pairs; } // Y54/Y55
    return out;
  }

  function midLowerCourse(g) {
    // NOTE: unlike MID_TOP, source Y57/Y58 do NOT subtract the pairs term
    // (transcribed faithfully -- documented smell, see report section 7).
    const W_C = g.W.whole, W_F = g.W.half, L_C = g.L_C_sum, L_F = g.L_F_sum;
    const N_PA = g.n_partitions, pairs = adjacent15mPairs(g);
    const side = (W_C + L_C) * 2 - N_PA - N_PA; // Y56 (Y57=Y58=N_PA, no pairs term)
    const hside = (W_F + L_F) * 2 - pairs - pairs; // Y59
    const out = { side, side_parLT: N_PA, side_parRT: N_PA, hside };
    if (pairs) { out.hside_parRT = pairs; out.hside_parLT = pairs; } // Y60/Y61
    return out;
  }

  function lowerCourse(g) {
    const W_C = g.W.whole, W_F = g.W.half, L_C = g.L_C_sum, L_F = g.L_F_sum;
    const N_PA = g.n_partitions, pairs = adjacent15mPairs(g);
    const y66 = 0, y67 = 0; // D18/legacy rows, not exposed by default config
    const par_lt = N_PA - y66; // Y63
    const par_rt = N_PA - y67; // Y64
    const nozzle = (g.H.value === 1 || g.H.value > 2) ? (1 * (N_PA + 1) - y66 - y67) : 0; // Y65
    const side = (W_C + L_C) * 2 - par_lt - par_rt - nozzle - y66; // Y62
    const hside = (W_F + L_F) * 2 - pairs - pairs; // Y68
    const out = { side, side_parLT: par_lt, side_parRT: par_rt, hside };
    if (nozzle) out.side_nozzle = nozzle;
    if (pairs) { out.hside_parRT = pairs; out.hside_parLT = pairs; } // Y69/Y70
    return out;
  }

  const COURSE_BUILDERS = {
    TOP_15: side15Top, TOP_20: side20Top, LOWER_SOLO: lowerCourse,
    LOWER: lowerCourse, MID_LOWER: midLowerCourse, MID_TOP: midTopCourse,
  };

  function baseFiller(g) {
    const W_F = g.W.half, L_F = g.L_F_sum;
    const pairs = adjacent15mPairs(g);
    const hside = (W_F + L_F) * 2 - pairs - pairs; // Y68
    const out = { hside };
    const nozzle = (g.H.value === 1 || g.H.value > 2) ? (1 * (g.n_partitions + 1)) : 0; // Y65
    if (nozzle) out.nozzle = nozzle;
    return out;
  }

  function partitionPanels(g, courses) {
    if (g.n_partitions === 0) return {};
    const W_F = g.W.half, H_F = g.H.half, N_PA = g.n_partitions;
    const W_C = g.W.whole;
    const out = {};
    courses.forEach(course => {
      const base = W_C * N_PA;
      const vert = W_F * N_PA;
      if (course === "TOP_15") {
        out[course] = {
          partition: base, partition_2: base, // Y75/Y76
          vert, // Y77
          vert_2: W_F * H_F * N_PA, // Y78 = W_F*OR(H_F)*N_PA
        };
      } else if (course === "TOP_20") {
        out[course] = {
          partition: base, partition_2: base, // Y85/Y86
          vert, // Y87
          vert_2: vert, // Y88 -- NOT gated by H_F, unlike TOP_15's Y78
        };
      } else {
        out[course] = { partition: base, vert }; // Y90/91, 92/93, 94/95
      }
    });
    return out;
  }

  function panelBom(W, L1, H, L2, L3, L4) {
    const g = makeGeometry(W, L1, H, L2, L3, L4);
    const courses = selectCourses(g.H.value);
    const side = {};
    courses.forEach(course => { side[course] = COURSE_BUILDERS[course](g); });
    if (!(courses.includes("LOWER") || courses.includes("LOWER_SOLO"))) {
      side.BASE_FILLER = baseFiller(g);
    }
    return {
      geometry: {
        W_C: g.W.whole, W_F: g.W.half, L_C_sum: g.L_C_sum, L_F_sum: g.L_F_sum,
        H_C: g.H.whole, H_F: g.H.half, N_PA: g.n_partitions, courses,
      },
      roof_bottom: roofAndBottom(g),
      side,
      partition: partitionPanels(g, courses),
    };
  }

  // ---------------------------------------------------------------------
  // 4. CATALOG (WATANI vendor data) -- derived directly from the original
  // workbook recalculated for all 9 supported height grades (1.0..5.0m in
  // 0.5m steps). Key shape: "<section>.<role>" for roof/bottom (height-
  // dependent structural grade only, not geometry-dependent) and
  // "<section>.<course>.<role>" for side/partition. A second vendor
  // supplies the same shape with their own part numbers; nothing in
  // sections 1-3 above changes.
  // ---------------------------------------------------------------------
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
}  ;

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
  // BASE_FILLER quantities are catalogued under the same key as "LOWER"
  // (they represent the same structural row/part in the source sheet --
  // see panel_engine.py's _base_filler() docstring).
  const CATALOG_COURSE_ALIAS = { BASE_FILLER: "LOWER" };

  /**
   * Compute the full, catalog-resolved panel BOM line list for one tank.
   * @param {object} p { W, L1, H, L2, L3, L4, qty }
   * @param {function} [lookupPart] optional (partNo) => {nameKo,nameEn,spec,price,weight,unit}
   *        from the app's live partsDb, used to fill in price/weight/spec.
   * @returns {{items: Array, geometry: object, warnings: string[]}}
   */
  function computePanelBomItems(p, lookupPart) {
    const qty = p.qty && p.qty > 0 ? p.qty : 1;
    const bom = panelBom(p.W, p.L1, p.H, p.L2, p.L3, p.L4);
    const hKey = String(p.H);
    const catalog = CATALOG_BY_HEIGHT[hKey];
    const warnings = [];
    const items = [];

    function pushItem(catalogKey, role, roleLabel, courseLabel, qtyRaw) {
      if (!qtyRaw) return; // skip zero-quantity rows, exactly like the source sheet's compaction
      const totalQty = qtyRaw * qty;
      let partNo = catalog ? catalog[catalogKey] : undefined;
      if (!partNo) {
        warnings.push(`No catalog part number for "${catalogKey}" at H=${p.H}mH -- check panel_matrix / catalog data.`);
        partNo = `TBD-${catalogKey}`;
      }
      const found = typeof lookupPart === "function" ? lookupPart(partNo) : null;
      const partName = (found && (found.nameKo || found.nameEn)) || `${roleLabel}${courseLabel ? " (" + courseLabel + ")" : ""}`;
      const spec = (found && found.spec) || `${roleLabel}${courseLabel ? " - " + courseLabel : ""}`;
      items.push({
        category: "Panels",
        partNo: partNo,
        partName: partName,
        qty: totalQty,
        unit: (found && found.unit) || "PCS",
        spec: spec,
        price: (found && Number(found.price)) || 0,
        weight: (found && Number(found.weight)) || 0,
      });
    }

    if (!catalog) {
      warnings.push(`No catalog data for H=${p.H}mH. Supported heights: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.`);
    }

    // roof_bottom (height-dependent grade only, not course-dependent)
    Object.keys(bom.roof_bottom).forEach(role => {
      const qv = bom.roof_bottom[role];
      pushItem(`roof_bottom.${role}`, role, ROOF_BOTTOM_LABELS[role] || role, "", qv);
    });

    // side (per course)
    Object.keys(bom.side).forEach(course => {
      const catalogCourse = CATALOG_COURSE_ALIAS[course] || course;
      const courseLabel = COURSE_HEIGHT_LABEL[course] || course;
      const courseData = bom.side[course];
      Object.keys(courseData).forEach(role => {
        const qv = courseData[role];
        pushItem(`side.${catalogCourse}.${role}`, role, SIDE_ROLE_LABELS[role] || role, courseLabel, qv);
      });
    });

    // partition (per course)
    Object.keys(bom.partition).forEach(course => {
      const catalogCourse = CATALOG_COURSE_ALIAS[course] || course;
      const courseLabel = COURSE_HEIGHT_LABEL[course] || course;
      const courseData = bom.partition[course];
      Object.keys(courseData).forEach(role => {
        const qv = courseData[role];
        pushItem(`partition.${catalogCourse}.${role}`, role, PARTITION_ROLE_LABELS[role] || role, courseLabel, qv);
      });
    });

    return { items, geometry: bom.geometry, warnings };
  }

  const PanelEngine = {
    dimOf, makeGeometry, selectCourses, panelBom, computePanelBomItems,
    CATALOG_BY_HEIGHT,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PanelEngine;
  } else {
    global.PanelEngine = PanelEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
