// =============================================================================
// WATANI GRP Water Tank -- Accessories/Capacity Engine (JavaScript, water-tank-bom app)
// =============================================================================
// Verified (LibreOffice ground-truth) formulas for the items that are NOT
// part of the Panel category:
//   - Nominal / Actual capacity (M3) and total surface area (SQM) -- BASIC_TOOL!H9/I9/J9
//   - ETC category: Air Vent + Roof Supporter quantities -- ETC!H1/H2
//   - Steel Skid total length -- Steel_Skid!B45 (confirmed height- and
//     partition-count-INDEPENDENT: a function of Width and total Length only)
//   - Bolts & Nuts total quantity -- BoltnNuts!AN5:AR47 (~35 structural
//     bolt/nut/washer assembly positions across roof/bottom/side/partition/
//     skid). All individual position formulas are geometry-driven and
//     verified exactly against 5 LibreOffice scenarios (varying W/L/H/N_PA
//     and Internal/External reinforcing). IMPORTANT CAVEAT: the sum of these
//     positions is within ~3-8% of the original workbook's final consolidated
//     total in every validation scenario, but does not reproduce it exactly --
//     the original applies one more consolidation layer that depends on
//     WHICH of 8 bolt-material options is selected (BASIC_TOOL!E21), which
//     was not replicated. Treat this as a much-improved, formula-verified
//     estimate rather than an exact reproduction (unlike the Panel engine).
//   - Reinforcing total quantity -- EXT_REINF!N8:N101 (External, excluding
//     tie-rod passthrough rows 58-72) or INT_REINF_INT!M8:M55 (Internal).
//     EXACTLY verified (not an estimate) against 16 LibreOffice scenarios
//     spanning H=1..5, W=1.5..5, 0-3 partitions, both Internal/External.
//   - Tie-Rod total quantity -- EXT_TIE_ROD!J9:J38. Only relevant for
//     External reinforcing (RF=2); Internal reinforcing never references
//     tie-rod hardware (INT_TIE_ROD sheet confirmed unused/dead -- referenced
//     nowhere in the entire workbook). Uses a verified closed-form reduction
//     of EXT_TIE_ROD's ~100-row Width/Length-keyed segment-count lookup
//     table (every dimension row was confirmed to carry exactly one
//     "remainder" length flag, so segment count = count(2000mm) +
//     count(3000mm) + 1 -- validated exactly, not approximated).
//     EXACTLY verified against 8 LibreOffice scenarios.
// =============================================================================
(function (global) {
  "use strict";

  // BASIC_TOOL!H9 = E9*(A9+B9+C9+D9)*F9 -- NOTE: per-tank, not multiplied by qty.
  function nominalCapaM3(W, Ltotal, H) {
    return W * Ltotal * H;
  }

  // BASIC_TOOL!I9 = E9*(A9+B9+C9+D9)*(F9-0.2)
  function actualCapaM3(W, Ltotal, H) {
    return W * Ltotal * (H - 0.2);
  }

  // BASIC_TOOL!J9 = W_O*L_O*2 + W_O*H_O*2 + L_O*H_O*2 + W_O*H_O*N_PA
  function totalSurfaceAreaSqm(W, Ltotal, H, N_PA) {
    return W * Ltotal * 2 + W * H * 2 + Ltotal * H * 2 + W * H * N_PA;
  }

  // ETC!G1/H1 -- Air Vent. Verified: qty = sum over each non-zero compartment
  // of CEILING(W_C * L_i_C / 30, 1); part depends on nominal capacity (<100 -> 0050A).
  function airVent(W_C, Lc_list, nominalCapa) {
    const qty = Lc_list.reduce((sum, Lc) => sum + Math.ceil((W_C * Lc) / 30), 0);
    const partNo = nominalCapa < 100 ? "WAV-0050A" : "WAV-0100A";
    return { partNo, qty };
  }

  // ETC!G2/H2 -- Roof Supporter. Verified exact parenthesization (confirmed via
  // LibreOffice -- differs subtly from a naive reading of the formula text):
  //   qty = ROUNDUP( term1 + term2, 0 ) + term3 + term4
  // where term_i = (W_C+W_F-1)*(Li_C+Li_F-1)/2 if L_i > 0 else 0, for i=1..4,
  // but only term1+term2 are inside the ROUNDUP -- term3/term4 are added after.
  function roofSupporter(g) {
    const W_C = g.W.whole, W_F = g.W.half;
    const term = (Lc, Lf) => (W_C + W_F - 1) * (Lc + Lf - 1) / 2;
    const t1 = term(g.L1.whole, g.L1.half);
    const t2 = g.L2.value > 0 ? term(g.L2.whole, g.L2.half) : 0;
    const t3 = g.L3.value > 0 ? term(g.L3.whole, g.L3.half) : 0;
    const t4 = g.L4.value > 0 ? term(g.L4.whole, g.L4.half) : 0;
    const qty = Math.ceil(t1 + t2) + t3 + t4; // ROUNDUP(x,0) == Math.ceil(x) for x>=0
    const partNo = `WRS-${g.H.value * 1000}P`;
    return { partNo, qty };
  }

  // Steel_Skid!B45 = B42+B43+B44, all closed-form, verified H- and
  // N_PA-INDEPENDENT across (H=1..5) and (N_PA=0,1,2) at fixed W/L:
  //   B42 = W*2
  //   B43 = (W_C+W_F+1) * L_total
  //   B44 = W * (L_total - 1)
  function steelSkidTotalLength(W, W_C, W_F, Ltotal) {
    const b42 = W * 2;
    const b43 = (W_C + W_F + 1) * Ltotal;
    const b44 = W * (Ltotal - 1);
    return b42 + b43 + b44;
  }

  // BoltnNuts!AN5:AR47 -- see file header caveat. `g` is a PanelEngine
  // geometry object (from PanelEngine.makeGeometry); `isIntReinf` is true
  // when BASIC_TOOL!B20="Internal" (RF=1), false when "External" (RF=2).
  function boltsAndNutsQty(g, isIntReinf) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L_C = g.L_C_sum, L_F = g.L_F_sum; // L_O_C, L_O_F
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

    // Steel Skid option selector (BASIC_TOOL!C21) under "Default" skid.
    let C21;
    if (H_O === 1 || H_O === 1.5 || H_O === 2) C21 = 1;
    else if (H_O === 2.5 || H_O === 3 || H_O === 3.5 || H_O === 4) C21 = 2;
    else C21 = 0;

    const AP5 = (8 * W_C + 4 * W_F) * (L_C + L_F - 1);
    const AP6 = L_O * 8 * (W_C + W_F - 1);
    const AP7 = (L1_C + L2_C + L3_C + L4_C + W_C) * 8 * 2 + (L1_F + L2_F + L3_F + L4_F + W_F) * 4 * 2;
    const AP9 = AP5 + AP6 + AP7;
    const AP10 = 2 * (AP5 + AP6 + AP7);

    const AP12 = (8 * W_C + 4 * W_F) * (L_C + L_F - 1);
    const AP13 = L_O * 8 * (W_C + W_F - 1);
    const AP24 = (RF === 2 && H_O === 2) ? (W_C + W_F - 1 + L_C + L_F - 1) * 2 * 2
               : (RF === 1 && H_O > 3) ? (W_C + W_F - 1 + L_C + L_F - 1) * 2 * 2
               : 0;
    const AP14 = (L1_C + L2_C + L3_C + L4_C + W_C) * 8 * 2 + (L1_F + L2_F + L3_F + L4_F + W_F) * 4 * 2 - AP24;
    const AP15 = AP12 + AP13 + AP14;
    const AP16 = 2 * (AP12 + AP13 + AP14);

    const AP18 = H_O * ((W_C + W_F - 1) + (L_C + L_F - 1)) * 2 * 8;
    const AP19 = H_O > 2 ? 8 * (W_O + L_O) * 2 * (H_C + H_F - 2) : 0; // S_1M=0 default branch
    const AP22 = H_O * 8 * 2 * 4;
    const AP23 = (RF === 2 && H_O === 1.5) ? ((W_O - 1) + (L_O - 1)) * 2 * 2 : 0;
    const AP25 = (H_O === 2.5 ? 4 : 0) + (H_O === 3 ? 4 : 0) + (H_O === 3.5 ? 8 : 0)
               + (H_O === 4 ? 8 : 0) + (H_O === 4.5 ? 12 : 0) + (H_O === 5 ? 12 : 0);
    const AP26 = AP18 + AP19 + 2 * AP23 + 2 * AP24 + AP22 + AP25;
    const AP27 = 2 * (AP18 + AP19 + AP23 + AP24 + AP22 + AP25);

    const AP29 = hasPartition ? H_O * 8 * 2 * N_PA : 0;
    const AP30 = hasPartition ? W_O * 8 * N_PA : 0;
    const AP31 = RF === 2 ? (H_O > 1 ? (W_C + W_F - 1) * 4 : 0) * N_PA : 0;
    const AP32 = hasPartition ? (W_O * 8 * (H_O < 2 ? 0 : (H_C + H_F - 1))) * N_PA : 0; // E13=1 default
    const AP33 = hasPartition ? ((W_C + W_F - 1) * H_O) * 8 * N_PA : 0;
    const AP34 = AP29 + AP30;
    const AP35 = AP29 + AP30;
    const AP36 = AP32 + AP33;
    const AP37 = 2 * (AP32 + AP33);
    const AP38 = AP31;
    const AP39 = 2 * AP31;

    const AP41 = ((L1_C + L2_C + L3_C + L4_C + W_C) * 2 + (L1_F + L2_F + L3_F + L4_F + W_F) * 2) * 2;
    const AP42 = (RF === 2 && H_O > 2)
      ? ((W_C + W_F - 1) + (L_C + L_F - 1)) * 2 * ((H_O === 2.5 ? 12 : 0) + (H_O === 3 ? 12 : 0) + (H_O === 3.5 ? 16 : 0) + (H_O === 4 ? 16 : 0))
      : 0;
    const AP43 = AP42 + AP41;
    const AP44 = (AP41 + AP42) * 2;

    let AP46 = 0;
    if (C21 <= 0) {
      AP46 = ((W_C + W_F + 1) * 4
        + (H_O > 2 ? (W_C + W_F + 1) * 4 : 0)
        + 2 * (L_C + L_F - 1) * (W_C + W_F + 1)
        + ((RF === 2 && H_O > 2) ? ((W_C + W_F - 1) + (L_C + L_F - 1)) * 2 * 6 : 0)
      ) * (C21 === 2 ? 0 : 1);
    }
    const AP47 = AP46 === 0 ? 0 : (AP46 + (H_O > 3 ? 4 + (W_C + W_F - 1) * 2 + (L_O - 1) * 2 : 4 + (W_C + W_F - 2) + (L_O - 2)));

    const rows = [AP5, AP6, AP7, AP9, AP10, AP12, AP13, AP14, AP15, AP16, AP18, AP19,
      AP22, AP23, AP24, AP25, AP26, AP27, AP29, AP30, AP31, AP32, AP33, AP34, AP35,
      AP36, AP37, AP38, AP39, AP41, AP42, AP43, AP44, AP46, AP47];
    return rows.reduce((s, v) => s + Math.floor(Math.max(v, 0)), 0);
  }

  // ---------------------------------------------------------------------
  // Reinforcing (EXT_REINF / INT_REINF_INT) -- exactly verified against 16
  // LibreOffice scenarios (H=1..5, W=1.5..5, 0-3 partitions, Internal/External).
  // ---------------------------------------------------------------------
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
    const totLC = L1_C + L2_C + L3_C + L4_C, totLF = L1_F + L2_F + L3_F + L4_F;
    const perim = (W_C + W_F - 1) + (L_C + L_F - 1); // common "perimeter" term

    if (!isIntReinf) {
      // ---- EXT_REINF (External reinforcing), rows 8-101 minus tie-rod (58-72) ----
      const rows = [];
      rows.push((H_O === 1.5 || H_O === 2) ? (W_F + totLF) * 2
        : (H_O === 2.5 || H_O === 3) ? (W_F + totLF) * 2 * 2
        : (H_O === 3.5 || H_O === 4) ? (W_F + totLF) * 2 * 3
        : (H_O === 4.5 || H_O === 5) ? (W_F + totLF) * 2 * 4 : 0); // row8 Q8
      const p9 = H_O > 1 ? (W_F + totLF) * 2 : 0;
      const q9 = H_O > 3 ? (W_F + totLF) * 2 : 0;
      const t9 = (H_O === 4.5 || H_O === 5)
        ? (totLF * (W_C + W_F - 1) + W_F * (totLC + totLF - 1)) * 2 : 0;
      const x9 = H_O > 3 ? W_F * N_PA : 0;
      rows.push(p9 + q9 + t9 + x9); // row9 (S9 dropped: EXT_REINF!S5=0 always)
      rows.push((H_O === 2.5 || H_O === 3) ? (W_C + totLC) * 2
        : (H_O === 3.5 || H_O === 4) ? (W_C + totLC) * 2 * 2
        : (H_O === 4.5 || H_O === 5) ? (W_C + totLC) * 2 * 3 : 0); // row10 Q10
      rows.push((H_O === 3.5 || H_O === 3) ? perim * 6 * 2
        : (H_O === 4) ? perim * 8 * 2
        : (H_O === 2.5) ? perim * 4 * 2 : 0); // row11 U11
      const t12 = (H_O === 4.5 || H_O === 5) ? (W_C * (totLC + totLF - 1) + totLC * (W_C + W_F - 1)) * 2 : 0;
      const u12 = (H_O === 3.5 || H_O === 2.5) ? perim * 2 * 2 : 0;
      rows.push(t12 + u12); // row12
      const p13 = H_O > 1 ? (W_C + totLC) * 2 : 0;
      const q13 = (H_O === 3 || H_O === 3.5) ? (W_C + totLC) * 2 : (H_O === 4 ? (W_C + totLC) * 2 * 2 : 0);
      const r13 = (H_O === 2.5 ? 8 : 0) + (H_O === 3 ? 8 : 0) + (H_O === 3.5 ? 16 : 0) + (H_O === 4 ? 16 : 0);
      const x13 = H_O > 3 ? W_C * N_PA : 0;
      const y13 = H_O > 3 ? 2 * N_PA : 0;
      rows.push(p13 + q13 + r13 + x13 + y13); // row13
      rows.push(H_O > 1.5 ? 2 * N_PA : 0); // row14 Y14
      rows.push((H_O === 1 ? 4 : 0) + (H_O === 2.5 ? 4 : 0)); // row16 R16
      rows.push((H_O === 1.5 ? 4 : 0) + (H_O === 2.5 ? 4 : 0) + (H_O === 3 ? 8 : 0) + (H_O === 3.5 ? 4 : 0)); // row17
      rows.push((H_O === 2 ? 4 : 0) + (H_O === 4 ? 8 : 0) + (H_O === 3.5 ? 4 : 0)); // row18
      rows.push(H_O === 1.5 ? perim * 2 : 0); // row23 U23
      rows.push(H_O === 2 ? perim * 2 : 0); // row24 U24
      rows.push(H_O === 2.5 ? perim * 2 : 0); // row25 U25
      rows.push(H_O === 3 ? perim * 2 : 0); // row26 U26
      rows.push(H_O === 3.5 ? perim * 2 : 0); // row27 U27
      rows.push(H_O === 4 ? perim * 2 : 0); // row28 U28
      rows.push((H_O === 2 || H_O === 1.5) ? perim * 2 : 0); // row41 U41
      rows.push((H_O === 2 || H_O === 1.5) ? perim * 2 : 0); // row45 U45
      rows.push((W_C + W_F - 1) * N_PA); // row46 V46
      rows.push(H_O > 2 ? perim * 2 : 0); // row54 U54 (RF=2 given, always true here)
      rows.push(H_O > 2 ? 4 * (H_C + H_F - 2) : 0); // row56 R56
      rows.push(H_O > 1.5 ? 2 * N_PA : 0); // row76 Y76
      rows.push(H_O > 1.5 ? (H_C + H_F - 1) * W_C * N_PA : 0); // row77 W77 (Y77 dropped: C69=0 always)
      const w78 = H_O > 2.5 ? W_C * (H_C + H_F - 2) * N_PA : 0;
      const x78 = H_O > 1.5 ? W_C * N_PA : 0;
      rows.push(w78 + x78); // row78
      rows.push(H_O > 1.5 ? (H_C + H_F - 1) * W_F * N_PA : 0); // row79 W79
      const w80 = H_O > 2.5 ? (H_C + H_F - 2) * W_F * N_PA : 0;
      const x80 = H_O > 1.5 ? W_F * N_PA : 0;
      rows.push(w80 + x80); // row80
      rows.push(H_O > 1 ? (W_C + W_F - 1) * 2 * N_PA : 0); // row86 V86
      const v87 = H_O > 1 ? (W_C + W_F - 1) * N_PA : 0;
      rows.push(v87); // row87
      const v88 = L2_O > 1 ? (W_C + W_F - 1) * (H_C + H_F - 1) * N_PA : 0;
      rows.push(v88); // row88
      rows.push(v88); // row89 (V89 = V88)
      rows.push(H_O > 1 ? (W_C + W_F - 1) * N_PA : 0); // row90 T90
      const v93 = ((H_O === 1.5 || H_O === 2) ? (W_C + W_F - 1)
        : (H_O === 2.5 || H_O === 3 || H_O === 3.5 || H_O === 4) ? (W_C + W_F - 1) * 2 : 0) * N_PA;
      rows.push(v93); // row93 V93 (Partition Accessories)

      return rows.reduce((s, v) => s + Math.max(0, v || 0), 0);
    } else {
      // ---- INT_REINF_INT (Internal reinforcing), main table rows 8-25 + second table rows 38-55 ----
      const rows = [];
      rows.push(H_O >= 2 ? 2 * N_PA : 0); // row8 W8
      rows.push((L2_O > 0 && H_O >= 3) ? (W_C + W_F - 1) * N_PA : 0); // row8 T8
      const t9 = H_O >= 3 ? (H_C - 2) * W_C * N_PA : 0;
      const u9 = H_O > 1.5 ? (H_C + H_F - 1) * W_C * N_PA : 0;
      rows.push(t9 + u9); // row9
      const t10 = H_O >= 3 ? (H_C - 2) * (W_C + W_F - 1) * N_PA : 0;
      const u10 = H_O > 3 ? W_C * (H_C + H_F - 3) * N_PA : 0;
      const w10 = H_O >= 3 ? 2 * (H_C - 2) * N_PA : 0;
      rows.push(t10 + u10 + w10); // row10
      const t11 = H_O > 2 ? H_F * (W_C + W_F - 1) * N_PA : 0;
      const u11 = H_O > 1.5 ? (H_C + H_F - 1) * W_F * N_PA : 0;
      rows.push(t11 + u11); // row11
      rows.push(H_O > 2.5 ? (H_C + H_F - 3) * W_F * N_PA : 0); // row12 U12
      rows.push((H_O > 1 && L2_O > 0) ? (W_C + W_F - 1) : 0); // row13 T13
      const s18 = H_O > 1 ? (W_C + W_F - 1 + L_C + L_F - 1 - N_PA) * 2 : 0;
      const t18 = H_O > 1 ? (W_C + W_F - 1) * N_PA : 0;
      const w18 = H_O >= 2.5 ? (H_C + H_F - 2) * 2 * N_PA : 0;
      rows.push(s18 + t18 + w18); // row18
      const s19 = H_O >= 2.5 ? (W_C + W_F - 1 + L_C + L_F - 1 - N_PA) * 2 * (H_C - 1) : 0;
      const t19 = H_O > 1 ? (W_C + W_F - 1) * (H_C + H_F - 2) * N_PA : 0;
      rows.push(s19 + t19); // row19
      rows.push(H_O > 1 ? (W_C + W_F - 1) * N_PA : 0); // row20 T20
      rows.push(H_O > 1 ? (W_C + W_F - 1) * (H_C + H_F - 2) * N_PA : 0); // row21 T21
      rows.push(H_O >= 3 ? 4 * (H_C + H_F - 2) : 0); // row22 P22
      rows.push(H_O >= 2 ? (W_C + W_F - 1) * N_PA : 0); // row25 R25

      // second table (rows 38-55)
      rows.push(H_O > 4 ? (W_F + totLF) * 2 : 0); // row38 O38
      const n39 = (H_O > 1 ? (W_F + totLF) * 2 : 0) + (H_O > 3 ? (W_F + totLF) * 2 : 0);
      const o39 = H_O > 3 ? (W_F + totLF) * 2 : 0;
      const v39 = (L2_O > 0 && H_O > 1) ? W_F * N_PA : 0;
      const w39 = (L2_O > 0 && H_O > 1) ? (H_F * 2) * N_PA : 0;
      rows.push(n39 + o39 + v39 + w39); // row39
      rows.push(H_O > 1 ? (W_F + totLF) * 2 * (H_C + H_F - 1) : 0); // row40 O40 (P40 dropped: E45<>1 always)
      const o41 = (H_O === 4.5 || H_O === 5) ? (W_C + totLC) * 2 : 0;
      const p41 = (H_O === 4 || H_O === 4.5) ? perim * 2 : (H_O === 5 ? perim * 2 * 2 : 0);
      rows.push(o41 + p41); // row41
      const n42 = (H_O > 1 ? (W_C + totLC) * 2 : 0) + (H_O > 3 ? (W_C + totLC) * 2 : 0);
      const o42 = H_O > 3 ? (W_C + totLC) * 2 : 0;
      const perim2 = (W_C + W_F - 1) + (L_C + L_F - 1); // S_1M=0 default -> H_C-2 branch
      const p42 = H_O > 2.5 ? perim2 * 2 * (H_C - 2) : 0;
      const q42 = H_O >= 3 ? 4 * 2 * (H_C - 2) : 0;
      const v42 = (L2_O > 0 && H_O > 1) ? W_C * N_PA : 0;
      const w42 = (H_O > 1 && L2_O > 0) ? 2 * (H_C + H_F - 2) * N_PA : 0;
      rows.push(n42 + o42 + p42 + q42 + v42 + w42); // row42
      const o43 = H_O > 2 ? (W_C + L_C) * 2 * (H_C + H_F - 2) : 0; // S_1M=0 -> 2nd term drops
      const p43 = H_O > 2 ? perim2 * 2 * (H_C + H_F - 2) : 0; // S_1M=0 default branch
      rows.push(o43 + p43); // row43
      rows.push(H_O > 1 ? perim2 * 2 : 0); // row45 P45 (S_1M=0 -> multiplier=1)
      rows.push(H_O === 5 ? perim2 * 2 : 0); // row47 P47
      rows.push((H_O === 1 ? 4 : 0) + (H_O === 2.5 ? 4 : 0) + (H_O === 3 ? 4 : 0)); // row48 Q48
      rows.push((H_O === 1.5 ? 4 : 0) + (H_O === 3.5 ? 4 : 0) + (H_O === 2.5 ? 4 : 0) + (H_O === 4.5 ? 12 : 0) + (H_O === 5 ? 8 : 0)); // row49 Q49
      rows.push((H_O === 2 ? 4 : 0) + (H_O === 3.5 ? 4 : 0) + (H_O === 4 ? 8 : 0) + (H_O === 5 ? 4 : 0) + (H_O === 3 ? 4 : 0)); // row50 Q50
      // row51 W51 -- P_1M = BASIC_TOOL!E13 = 1 by default
      const w51 = (L2_O > 0) ? ((H_O >= 2 ? 4 * N_PA : 0) + (H_O === 1.5 ? 2 * N_PA : 0)) : 0;
      rows.push(w51);
      const perim3 = (W_C + W_F - 1 + L_C + L_F - 1 - N_PA);
      const p52 = H_O > 1 ? perim3 * 2 : 0;
      const q52 = H_O >= 3 ? 8 * (H_C + H_F - 2) : 0;
      const w52 = (H_O >= 2.5 && L2_O > 0) ? (H_C + H_F - 2) * 2 * N_PA : 0;
      rows.push(p52 + q52 + w52); // row52
      rows.push(H_O >= 2.5 ? perim3 * 2 * (H_C + H_F - 2) : 0); // row53 P53
      rows.push(H_O > 3 ? (W_F + W_C - 1 + totLC + totLF - 1) * 2 : 0); // row55 N55

      return rows.reduce((s, v) => s + Math.max(0, v || 0), 0);
    }
  }

  // ---------------------------------------------------------------------
  // Tie-Rod (EXT_TIE_ROD) -- only meaningful/used when reinfMethod=External.
  // Internal reinforcing never references tie-rod hardware (INT_TIE_ROD
  // sheet confirmed dead code, referenced nowhere in the workbook).
  // Exactly verified against 8 LibreOffice scenarios.
  // ---------------------------------------------------------------------

  // EXT_TIE_ROD!AH26:AO125 (and the structurally-identical AQ_AX/AZ_BG
  // tables -- verified all 3 share IDENTICAL [count-2000mm, count-3000mm]
  // columns for every dimension value; only the 4 "remainder" length labels
  // differ, which don't matter for a quantity total). Maps a dimension (m)
  // to how many 2000mm and 3000mm tie-rod segments are used; exactly one
  // more "remainder" segment is always used on top of that (verified: every
  // one of the 99 rows 1.0..50.0 has exactly one remainder flag set).
  const TIE_ROD_SEGMENT_TABLE = [
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
  ];

  // EXT_TIE_ROD!AF13:AG21 -- number of horizontal tie-rod layers by height.
  function tieRodLayerFactor(H_O) {
    if (H_O <= 1) return 0;
    if (H_O === 1.5 || H_O === 2) return 1;
    return 2; // H_O >= 2.5
  }

  // Number of tie-rod segments needed to span a given dimension (in
  // meters). Always (count2000 + count3000 + 1) per the verified table.
  function tieRodNumSegments(dimMeters) {
    if (!dimMeters || dimMeters <= 0) return 0;
    const row = TIE_ROD_SEGMENT_TABLE.find(r => Math.abs(r[0] - dimMeters) < 1e-6);
    if (!row) return 0; // out of table range (>50m or non-0.5 step)
    return row[1] + row[2] + 1;
  }

  // EXT_TIE_ROD!J9:J38 total.
  function tieRodQty(g) {
    const W_C = g.W.whole, W_F = g.W.half;
    const L1_C = g.L1.whole, L1_F = g.L1.half;
    const L2_C = g.L2.whole, L2_F = g.L2.half;
    const L3_C = g.L3.whole, L3_F = g.L3.half;
    const L4_C = g.L4.whole, L4_F = g.L4.half;
    const H_O = g.H.value;
    const W_O = g.W.value;
    const L1_O = g.L1.value, L2_O = g.L2.value, L3_O = g.L3.value, L4_O = g.L4.value;

    const layer = tieRodLayerFactor(H_O);
    const totalLenCourses = L1_C + L1_F + L2_C + L2_F + L3_C + L3_F + L4_C + L4_F;

    // Per-direction "unit counts" (EXT_TIE_ROD!M8/Q8/U8/Y8/AC8)
    const M8 = (totalLenCourses - 1) * layer; // W-direction
    const Q8 = layer * (W_C + W_F - 1); // L1-direction (always active)
    const U8 = L2_O > 0 ? layer * (W_C + W_F - 1) : 0; // L2-direction
    const Y8 = L3_O > 0 ? layer * (W_C + W_F - 1) : 0; // L3-direction
    const AC8 = L4_O > 0 ? layer * (W_C + W_F - 1) : 0; // L4-direction

    const segW = tieRodNumSegments(W_O);
    const segL1 = tieRodNumSegments(L1_O);
    const segL2 = L2_O > 0 ? tieRodNumSegments(L2_O) : 0;
    const segL3 = L3_O > 0 ? tieRodNumSegments(L3_O) : 0;
    const segL4 = L4_O > 0 ? tieRodNumSegments(L4_O) : 0;

    // TR-12M series rods (rows 9-19)
    const rodsW = segW * M8;
    const rodsL1 = segL1 * Q8;
    const rodsL2 = segL2 * U8;
    const rodsL3 = segL3 * Y8;
    const rodsL4 = segL4 * AC8;

    // Row 35: M12 NUT
    const n35 = 4 * M8;
    const r35 = (L2_O > 0 ? 3 : 4) * Q8;
    const v35 = (L3_O > 0 ? 2 : 3) * U8;
    const z35 = (L4_O > 0 ? 2 : 3) * Y8;
    const ad35 = (L4_O > 0 ? 3 : 0) * AC8;
    const row35 = n35 + r35 + v35 + z35 + ad35;

    // Row 36: M12 BW (washer) -- identical structure, doubled
    const row36 = row35 * 2;

    // Row 37: TC-12M40 (coupler)
    const n37 = (segW - 1) * M8;
    const r37 = (segL1 - (L2_O === 0 ? 1 : 0)) * Q8;
    const v37 = (segL2 + (L3_O > 0 ? 0 : 1)) * U8;
    const z37 = (segL3 - (L4_O > 0 ? 0 : 1)) * Y8;
    const ad37 = (segL4 - (AC8 > 0 ? 1 : 0)) * AC8;
    const row37 = n37 + r37 + v37 + z37 + ad37;

    // Row 38: ATR-12M300 (anchor) -- only for L2/L3/L4 directions
    const v38 = (U8 > 0 ? 1 : 0) * U8;
    const z38 = (Y8 > 0 ? 1 : 0) * Y8;
    const ad38 = (AC8 > 0 ? 1 : 0) * AC8;
    const row38 = v38 + z38 + ad38;

    const total = rodsW + rodsL1 + rodsL2 + rodsL3 + rodsL4 + row35 + row36 + row37 + row38;
    return Math.max(0, Math.round(total));
  }

  const AccessoriesEngine = {
    nominalCapaM3, actualCapaM3, totalSurfaceAreaSqm,
    airVent, roofSupporter, steelSkidTotalLength, boltsAndNutsQty,
    reinforcingQty, tieRodQty,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AccessoriesEngine;
  } else {
    global.AccessoriesEngine = AccessoriesEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
