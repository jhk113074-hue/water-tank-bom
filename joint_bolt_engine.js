// =============================================================================
// Joint Bolt Engine (joint_bolt_engine.js)
// =============================================================================
// Replaces the R1/R05 (holes-per-meter) APPROXIMATION baked into
// accessories_rules.js's 9 core seam-bolt rows (AP5/6/7/12/13/14/18/19/22)
// with the REAL registered hole count from panel_hole_spec.js, wherever one
// has been registered for the panel code actually sitting at that position.
// Per the user's explicit rule: "홀수와 조립볼트의 수는 동일합니다" (hole count
// == bolt count) -- no separate multiplier is applied to a registered value.
//
// SAFETY / REGRESSION GUARANTEE: every row here is decomposed as
// (seam/joint COUNT) x (holes PER seam). The seam-count math is copied
// verbatim from the existing verified formulas (same variables, same
// arithmetic) -- only the "holes per seam" term is swapped from a constant
// (R1/R05, or 8/4 for bottom) to a real per-panel-edge lookup, WHEN one is
// registered. When nothing is registered for a given panel position, this
// engine falls back to the exact same constant the old formula used, so the
// total is numerically identical to today's formula (see
// test_joint_counting_regression.js).
//
// This engine ONLY concerns itself with STRAIGHT (rectangular) tanks today.
// L-shape/U-shape wing geometry is a separate, not-yet-built layer (see the
// project plan's Phase 2) -- accessories_engine.js falls back to the
// existing formula for any row/scenario this engine can't confidently
// resolve, exactly as it always has.
// =============================================================================
(function (global) {
  "use strict";

  // H (metres, as the string key used throughout the catalog) -> ordered
  // list of structural courses, top-of-wall to bottom -- copied from
  // panel_rules.js's COURSE_TABLE (kept in sync manually; this engine reads
  // it, never writes it).
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
  // Metres of wall height each course band spans -- sum of these always
  // equals H_O for every row above (verified: e.g. "3.5" -> 1.5+1+1=3.5).
  const COURSE_HEIGHT_METERS = { TOP_15: 1.5, TOP_20: 2, LOWER: 1, LOWER_SOLO: 1, MID_LOWER: 1, MID_TOP: 1 };
  const COURSE_ALIAS = { LOWER_SOLO: "LOWER", BASE_FILLER: "LOWER" };

  function coursesForHeight(hKey) {
    return COURSE_TABLE[hKey] || [];
  }

  function aliasCourse(course) {
    return COURSE_ALIAS[course] || course;
  }

  // Resolves the exact panel code (and its opening code) actually sitting at
  // a catalogKey/height for the active preset -- mirrors app.js's
  // findActiveMatrixRow/resolvePanelPartNoAndLookup search order, read-only.
  function resolvePanelAt(catalogKey, hKey, presetId) {
    const hGrade = hKey + "mH";
    let searchOrder = [0, 1, 2, 3, 4];
    if (catalogKey.indexOf("side.") === 0) searchOrder = [1, 2, 0, 3, 4];
    else if (catalogKey.indexOf("partition.") === 0 || catalogKey.indexOf("partition1x1.") === 0) searchOrder = [3, 4, 0, 1, 2];

    let row = null;
    if (typeof global.getCustomerMatrixStorage === "function") {
      for (let i = 0; i < searchOrder.length; i++) {
        const matrix = global.getCustomerMatrixStorage(presetId, searchOrder[i]);
        if (!Array.isArray(matrix)) continue;
        const found = matrix.find(r => r && r.key === catalogKey);
        if (found && found.heightGrades && found.heightGrades[hGrade] && found.heightGrades[hGrade] !== "-- None --") {
          row = found;
          break;
        }
      }
    }

    let code = row ? row.heightGrades[hGrade] : null;
    if (!code && global.PanelCatalog && global.PanelCatalog.CATALOG_BY_HEIGHT && global.PanelCatalog.CATALOG_BY_HEIGHT[hKey]) {
      code = global.PanelCatalog.CATALOG_BY_HEIGHT[hKey][catalogKey] || null;
    }
    if (!code && global.PanelCatalogPartitionAlt && global.PanelCatalogPartitionAlt.CATALOG_BY_HEIGHT && global.PanelCatalogPartitionAlt.CATALOG_BY_HEIGHT[hKey]) {
      code = global.PanelCatalogPartitionAlt.CATALOG_BY_HEIGHT[hKey][catalogKey] || null;
    }
    if (!code) return { code: null, openingCode: null };

    if (global.OpeningCodeUtil) {
      const custPresetList = (typeof global.getMatrixCustomerPresetList === "function") ? global.getMatrixCustomerPresetList() : [];
      const activeCustObj = custPresetList.find(c => String(c.id) === String(presetId)) || null;
      if (row) {
        const info = global.OpeningCodeUtil.getOpeningInfo(row, hGrade, activeCustObj);
        return { code: info.code, openingCode: info.openingCode };
      }
      const split = global.OpeningCodeUtil.splitEmbeddedOpeningCode(code);
      return { code: split.code, openingCode: split.openingCode };
    }
    return { code, openingCode: null };
  }

  // Registered hole count for the panel actually at catalogKey/height, or
  // null if nothing is registered (caller must fall back, never guess).
  // `section` selects which half of the spec to read:
  //   "edges" (default) -- Flange부: the panel's own left/right flange bolt
  //     holes, used for panel-to-panel seams (side-to-side, corner frame).
  //   "face" -- 평면(Face)부: per the user's correction, a SIDE panel's
  //     connection to the roof/bottom is NOT through its flange edges but
  //     through the panel's face-section top/bottom value (e.g. ST20SX's
  //     face.top, not edges.top) -- roof+side (AP7) and bottom+side (AP14)
  //     read this section instead.
  function getHoleCount(catalogKey, hKey, presetId, edge, section) {
    if (!global.PanelHoleSpec) return null;
    const resolved = resolvePanelAt(catalogKey, hKey, presetId);
    if (!resolved.code) return null;
    const spec = global.PanelHoleSpec.getPanelSpec(resolved.code, resolved.openingCode, presetId);
    if (!spec) return null;
    const bucket = (section === "face") ? spec.face : spec.edges;
    return bucket ? bucket[edge] : null;
  }

  // -------------------------------------------------------------------------
  // Main entry point. Returns { AP5, AP6, AP7, AP12, AP13, AP14perimeterOnly,
  // AP18, AP19, AP22, warnings } -- every value is a plain number (AP14's
  // "-AP24" subtraction is NOT applied here; the caller still evaluates
  // AP24 as a formula and subtracts it, per the plan's hybrid design, since
  // AP24 is conditional hardware unrelated to panel-to-panel adjacency).
  // Returns null for a field the engine can't compute for this geometry
  // (e.g. an unsupported height), so the caller falls back to the old
  // formula for that row specifically.
  // -------------------------------------------------------------------------
  function computeJointCounts(ctx) {
    // ctx: { hKey, presetId, sidePanelOnly, W_C, W_F, L_C, L_F, sumLi_C,
    //        sumLi_F, W_O, L_O, R1, R05, numCorners }
    const warnings = [];
    const courses = coursesForHeight(ctx.hKey);
    if (courses.length === 0) return null; // unsupported height -- caller falls back entirely

    const R1 = ctx.R1, R05 = ctx.R05;
    // AP12/13/14/18/19/22 (bottom + side joints) hardcode 8/4 holes-per-meter
    // in their ORIGINAL formulas -- they do NOT use the "Nos of Holes/M for
    // Roof" R1/R05 setting (that setting only ever fed AP5/6/7, the roof
    // joints). Using ctx.R1/R05 as their fallback here would incorrectly
    // make bottom/side bolt counts move whenever someone tunes the roof
    // setting, even for panel positions that have no registered hole spec
    // at all. Keep these fixed, matching the formulas being replaced.
    const BR1 = 8, BR05 = 4;
    const out = { warnings };

    // --- AP5: Roof+Roof (Vertical) ---------------------------------------
    {
      const holeFull = getHoleCount("roof_bottom.roof_full", ctx.hKey, ctx.presetId, "left");
      const holeHalf = getHoleCount("roof_bottom.roof_half", ctx.hKey, ctx.presetId, "left");
      const perSeam = (holeFull != null ? holeFull : R1) * ctx.W_C + (holeHalf != null ? holeHalf : R05) * ctx.W_F;
      out.AP5 = perSeam * Math.max(0, ctx.L_C + ctx.L_F - 1);
    }
    // --- AP6: Roof+Roof (Horizontal) --------------------------------------
    {
      const holeFull = getHoleCount("roof_bottom.roof_full", ctx.hKey, ctx.presetId, "top");
      const holeHalf = getHoleCount("roof_bottom.roof_half", ctx.hKey, ctx.presetId, "top");
      const perSeam = (holeFull != null ? holeFull : R1) * ctx.L_C + (holeHalf != null ? holeHalf : R05) * ctx.L_F;
      out.AP6 = perSeam * Math.max(0, ctx.W_C + ctx.W_F - 1);
    }
    // --- AP12: Bottom+Bottom (Vertical) -----------------------------------
    {
      const holeFull = getHoleCount("roof_bottom.base_full", ctx.hKey, ctx.presetId, "left");
      const perSeam = (holeFull != null ? holeFull : BR1) * ctx.W_C + BR05 * ctx.W_F;
      out.AP12 = perSeam * Math.max(0, ctx.L_C + ctx.L_F - 1);
    }
    // --- AP13: Bottom+Bottom (Horizontal) ---------------------------------
    {
      const holeFull = getHoleCount("roof_bottom.base_full", ctx.hKey, ctx.presetId, "top");
      const perSeam = (holeFull != null ? holeFull : BR1) * ctx.L_C + BR05 * ctx.L_F;
      out.AP13 = perSeam * Math.max(0, ctx.W_C + ctx.W_F - 1);
    }

    // --- AP7: Roof+Side (perimeter) ---------------------------------------
    // Per the user's correction: a side panel's connection to the roof is
    // NOT through its flange edges (those are for side-to-side seams) but
    // through its 평면(Face) section's "top" value (e.g. ST20SX's face.top).
    // Whole-course term substituted with the real hole count of the
    // TOP-most side course when registered; the half-course term keeps the
    // R05 fallback (no reliable "half" catalogKey identified for a side
    // course yet) -- a documented simplification, not a guess.
    {
      const topCourse = aliasCourse(courses[0]);
      const holeTop = getHoleCount("side." + topCourse + ".side", ctx.hKey, ctx.presetId, "top", "face");
      const perimWhole = 2 * (ctx.sumLi_C + ctx.W_C);
      const perimHalf = 2 * (ctx.sumLi_F + ctx.W_F);
      out.AP7 = (holeTop != null ? holeTop : R1) * perimWhole + R05 * perimHalf;
    }
    // --- AP14: Bottom+Side (perimeter) ------------------------------------
    // Same principle as AP7: the side panel's connection to the bottom
    // plate reads its 평면(Face) section's "bottom" value, not its flange
    // edges (per user confirmation, symmetric with the AP7 correction).
    {
      const bottomCourse = aliasCourse(courses[courses.length - 1]);
      const holeBottom = getHoleCount("side." + bottomCourse + ".side", ctx.hKey, ctx.presetId, "bottom", "face");
      const perimWhole = 2 * (ctx.sumLi_C + ctx.W_C);
      const perimHalf = 2 * (ctx.sumLi_F + ctx.W_F);
      out.AP14perimeterOnly = (holeBottom != null ? holeBottom : BR1) * perimWhole + BR05 * perimHalf;
    }

    // --- AP18: Side+Side (Vertical) + AP22: Corner Angle Frame ------------
    // Decomposed per course band (each course = one physical panel row with
    // its own catalog code), so a registered spec for e.g. only the LOWER
    // course still improves that course's contribution while others keep
    // falling back -- summing every course's contribution reproduces the
    // old H_O-wide constant-density formula exactly when nothing is
    // registered (proven: sum of COURSE_HEIGHT_METERS across courses == H_O).
    {
      const seamsPerCourse = 2 * ((ctx.W_C + ctx.W_F - 1) + (ctx.L_C + ctx.L_F - 1));
      const cornersPerCourse = (ctx.numCorners || 4) * 2;
      let ap18 = 0, ap22 = 0;
      const seenHoles = {};
      courses.forEach(course => {
        const c = aliasCourse(course);
        const holeLeft = getHoleCount("side." + c + ".side", ctx.hKey, ctx.presetId, "left");
        const holeRight = getHoleCount("side." + c + ".side", ctx.hKey, ctx.presetId, "right");
        if (holeLeft != null && holeRight != null && holeLeft !== holeRight) {
          warnings.push(`side.${c}.side: left(${holeLeft}) != right(${holeRight}) 홀수 불일치 -- 두 값이 같아야 정상입니다.`);
        }
        const holeVal = holeLeft != null ? holeLeft : (holeRight != null ? holeRight : null);
        const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
        const perSideSeam = holeVal != null ? holeVal : fallback;
        ap18 += perSideSeam * seamsPerCourse;
        ap22 += perSideSeam * cornersPerCourse;
        seenHoles[course] = holeVal;
      });
      out.AP18 = ap18;
      out.AP22 = ap22;
    }

    // --- AP19: Side+Side (Horizontal, course-boundary seams) -------------
    // Seam count follows the ACTUAL course composition (courses.length-1)
    // instead of the old S_1M-conditional formula branch -- generalizes
    // automatically to whatever panel composition is really in use.
    {
      const perimeterM = 2 * (ctx.W_O + ctx.L_O);
      let ap19 = 0;
      for (let i = 0; i < courses.length - 1; i++) {
        const above = aliasCourse(courses[i]);
        const below = aliasCourse(courses[i + 1]);
        const holeAbove = getHoleCount("side." + above + ".side", ctx.hKey, ctx.presetId, "bottom");
        const holeBelow = getHoleCount("side." + below + ".side", ctx.hKey, ctx.presetId, "top");
        if (holeAbove != null && holeBelow != null && holeAbove !== holeBelow) {
          warnings.push(`side.${above}.side(bottom)=${holeAbove} vs side.${below}.side(top)=${holeBelow} 홀수 불일치 -- 두 값이 같아야 정상입니다.`);
        }
        const holeVal = holeAbove != null ? holeAbove : (holeBelow != null ? holeBelow : null);
        ap19 += (holeVal != null ? holeVal : BR1) * perimeterM;
      }
      out.AP19 = ap19;
    }

    // --- AP29: Partition+Side (connection between partition and side panels) ---
    // Reads face-section left/right opening hole specs on the side panels where partition meets the side walls
    {
      const nParti = Number(ctx.n_partitions) || 0;
      if (nParti > 0) {
        let holesPerWall = 0;
        courses.forEach(course => {
          const c = aliasCourse(course);
          const resolved = resolvePanelAt("side." + c + ".side", ctx.hKey, ctx.presetId);
          let holeLeft = null, holeRight = null;
          if (resolved.code && global.PanelHoleSpec) {
            // Check specific opening specs SL (left face) and SR (right face)
            const specSL = global.PanelHoleSpec.getPanelSpec(resolved.code, "SL", ctx.presetId);
            const specSR = global.PanelHoleSpec.getPanelSpec(resolved.code, "SR", ctx.presetId);
            const specSX = global.PanelHoleSpec.getPanelSpec(resolved.code, "SX", ctx.presetId);
            const specBase = global.PanelHoleSpec.getPanelSpec(resolved.code, resolved.openingCode || "", ctx.presetId);

            holeLeft = (specSL && specSL.face && specSL.face.left != null) ? specSL.face.left :
                       ((specSX && specSX.face && specSX.face.left != null) ? specSX.face.left :
                       ((specBase && specBase.face && specBase.face.left != null) ? specBase.face.left : null));

            holeRight = (specSR && specSR.face && specSR.face.right != null) ? specSR.face.right :
                        ((specSX && specSX.face && specSX.face.right != null) ? specSX.face.right :
                        ((specBase && specBase.face && specBase.face.right != null) ? specBase.face.right : null));
          }
          const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
          const leftVal = (holeLeft != null) ? holeLeft : fallback;
          const rightVal = (holeRight != null) ? holeRight : fallback;
          holesPerWall += (leftVal + rightVal);
        });
        out.AP29 = holesPerWall * nParti;
      } else {
        out.AP29 = 0;
      }
    }

    // --- AP30: Partition+Bottom (connection between partition and bottom panels) ---
    {
      const nParti = Number(ctx.n_partitions) || 0;
      if (nParti > 0) {
        const resolved = resolvePanelAt("roof_bottom.base_full", ctx.hKey, ctx.presetId);
        let holeVal = null;
        if (resolved.code && global.PanelHoleSpec) {
          const specBP = global.PanelHoleSpec.getPanelSpec(resolved.code, "BP", ctx.presetId);
          const specBX = global.PanelHoleSpec.getPanelSpec(resolved.code, "BX", ctx.presetId);
          const specBase = global.PanelHoleSpec.getPanelSpec(resolved.code, resolved.openingCode || "", ctx.presetId);
          holeVal = (specBP && specBP.face && specBP.face.top != null) ? specBP.face.top :
                    ((specBX && specBX.face && specBX.face.top != null) ? specBX.face.top :
                    ((specBase && specBase.face && specBase.face.top != null) ? specBase.face.top : null));
        }
        const perSeam = ((holeVal != null) ? holeVal : BR1) * ctx.W_C + BR05 * ctx.W_F;
        out.AP30 = perSeam * nParti;
      } else {
        out.AP30 = 0;
      }
    }

    // --- AP32: Partition+Partition (Horizontal, course-boundary seams) ---
    {
      const nParti = Number(ctx.n_partitions) || 0;
      if (nParti > 0 && courses.length > 1) {
        let ap32 = 0;
        for (let i = 0; i < courses.length - 1; i++) {
          const above = aliasCourse(courses[i]);
          const below = aliasCourse(courses[i + 1]);
          const holeAbove = getHoleCount("partition." + above + ".partition", ctx.hKey, ctx.presetId, "bottom") ||
                            getHoleCount("partition1x1." + above + ".partition", ctx.hKey, ctx.presetId, "bottom");
          const holeBelow = getHoleCount("partition." + below + ".partition", ctx.hKey, ctx.presetId, "top") ||
                            getHoleCount("partition1x1." + below + ".partition", ctx.hKey, ctx.presetId, "top");
          const holeVal = (holeAbove != null) ? holeAbove : ((holeBelow != null) ? holeBelow : BR1);
          ap32 += (holeVal * ctx.W_C + (holeVal / 2) * ctx.W_F) * nParti;
        }
        out.AP32 = ap32;
      } else {
        out.AP32 = 0;
      }
    }

    // --- AP33: Partition+Partition (Vertical seams between partition panels) ---
    {
      const nParti = Number(ctx.n_partitions) || 0;
      if (nParti > 0) {
        let holesPerSeam = 0;
        courses.forEach(course => {
          const c = aliasCourse(course);
          let holeLeft = getHoleCount("partition." + c + ".partition", ctx.hKey, ctx.presetId, "left") ||
                         getHoleCount("partition1x1." + c + ".partition", ctx.hKey, ctx.presetId, "left");
          let holeRight = getHoleCount("partition." + c + ".partition", ctx.hKey, ctx.presetId, "right") ||
                          getHoleCount("partition1x1." + c + ".partition", ctx.hKey, ctx.presetId, "right");
          const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
          const holeVal = (holeLeft != null) ? holeLeft : ((holeRight != null) ? holeRight : fallback);
          holesPerSeam += holeVal;
        });
        out.AP33 = holesPerSeam * Math.max(0, ctx.W_C + ctx.W_F - 1) * nParti;
      } else {
        out.AP33 = 0;
      }
    }

    return out;
  }

  // -------------------------------------------------------------------------
  // Comprehensive Joint Audit Report Generator
  // Returns detailed breakdown of each joint's calculation: resolved panel
  // codes, registered hole counts, step-by-step formula evaluation, and
  // comparison with the standard formula benchmark.
  // -------------------------------------------------------------------------
  function computeJointAuditReport(ctx) {
    const warnings = [];
    const courses = coursesForHeight(ctx.hKey);
    if (courses.length === 0) {
      return { success: false, reason: "Unsupported height: " + ctx.hKey, items: [], warnings };
    }

    const R1 = ctx.R1 || 8, R05 = ctx.R05 || 4;
    const BR1 = 8, BR05 = 4;
    const items = [];

    function inspectPanel(catalogKey, section, edge) {
      const resolved = resolvePanelAt(catalogKey, ctx.hKey, ctx.presetId);
      if (!resolved || !resolved.code) {
        return { code: '(Unassigned)', openingCode: '', holeCount: null, source: 'unassigned' };
      }
      if (!global.PanelHoleSpec) {
        return { code: resolved.code, openingCode: resolved.openingCode || '', holeCount: null, source: 'no_spec_db' };
      }
      const spec = global.PanelHoleSpec.getPanelSpec(resolved.code, resolved.openingCode, ctx.presetId);
      if (!spec) {
        return { code: resolved.code, openingCode: resolved.openingCode || '', holeCount: null, source: 'fallback_default' };
      }
      const bucket = (section === 'face') ? spec.face : spec.edges;
      const count = (bucket && bucket[edge] != null) ? bucket[edge] : null;
      return {
        code: resolved.code,
        openingCode: resolved.openingCode || '',
        holeCount: count,
        source: count != null ? 'registered_spec' : 'fallback_default',
        spec
      };
    }

    // 1. AP5 - Roof+Roof (Vertical)
    {
      const pFull = inspectPanel("roof_bottom.roof_full", "edges", "left");
      const pHalf = inspectPanel("roof_bottom.roof_half", "edges", "left");
      const hFull = pFull.holeCount != null ? pFull.holeCount : R1;
      const hHalf = pHalf.holeCount != null ? pHalf.holeCount : R05;
      const seams = Math.max(0, ctx.L_C + ctx.L_F - 1);
      const holesPerSeam = hFull * ctx.W_C + hHalf * ctx.W_F;
      const jointQty = holesPerSeam * seams;
      const benchmarkQty = (R1 * ctx.W_C + R05 * ctx.W_F) * seams;
      const isCustom = pFull.holeCount != null || pHalf.holeCount != null;

      items.push({
        rowId: 'AP5',
        section: 'ROOF',
        label: 'Roof PNL + Roof PNL (Vertical)',
        jointType: 'AP5',
        seams,
        panels: [
          { role: '1.0m Roof (Left Flange)', code: pFull.code, opening: pFull.openingCode, holeCount: pFull.holeCount, fallback: R1 },
          ...(ctx.W_F > 0 ? [{ role: '0.5m Roof (Left Flange)', code: pHalf.code, opening: pHalf.openingCode, holeCount: pHalf.holeCount, fallback: R05 }] : [])
        ],
        calcFormula: `(${hFull} holes × ${ctx.W_C}m${ctx.W_F > 0 ? ` + ${hHalf} holes × ${ctx.W_F}m` : ''}) × ${seams} seams = ${jointQty} PCS`,
        jointBoltQty: jointQty,
        benchmarkFormula: `(R1*W_C + R05*W_F)*(L_C + L_F - 1)`,
        benchmarkQty,
        isCustom,
        status: isCustom ? (jointQty === benchmarkQty ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 2. AP6 - Roof+Roof (Horizontal)
    {
      const pFull = inspectPanel("roof_bottom.roof_full", "edges", "top");
      const pHalf = inspectPanel("roof_bottom.roof_half", "edges", "top");
      const hFull = pFull.holeCount != null ? pFull.holeCount : R1;
      const hHalf = pHalf.holeCount != null ? pHalf.holeCount : R05;
      const seams = Math.max(0, ctx.W_C + ctx.W_F - 1);
      const holesPerSeam = hFull * ctx.L_C + hHalf * ctx.L_F;
      const jointQty = holesPerSeam * seams;
      const benchmarkQty = (R1 * ctx.L_C + R05 * ctx.L_F) * seams;
      const isCustom = pFull.holeCount != null || pHalf.holeCount != null;

      items.push({
        rowId: 'AP6',
        section: 'ROOF',
        label: 'Roof PNL + Roof PNL (Horizontal)',
        jointType: 'AP6',
        seams,
        panels: [
          { role: '1.0m Roof (Top Flange)', code: pFull.code, opening: pFull.openingCode, holeCount: pFull.holeCount, fallback: R1 },
          ...(ctx.L_F > 0 ? [{ role: '0.5m Roof (Top Flange)', code: pHalf.code, opening: pHalf.openingCode, holeCount: pHalf.holeCount, fallback: R05 }] : [])
        ],
        calcFormula: `(${hFull} holes × ${ctx.L_C}m${ctx.L_F > 0 ? ` + ${hHalf} holes × ${ctx.L_F}m` : ''}) × ${seams} seams = ${jointQty} PCS`,
        jointBoltQty: jointQty,
        benchmarkFormula: `L_O*R1*(W_C + W_F - 1)`,
        benchmarkQty,
        isCustom,
        status: isCustom ? (jointQty === benchmarkQty ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 3. AP7 - Roof+Side (Perimeter)
    {
      const topCourse = aliasCourse(courses[0]);
      const pTop = inspectPanel("side." + topCourse + ".side", "face", "top");
      const hTop = pTop.holeCount != null ? pTop.holeCount : R1;
      const perimWhole = 2 * (ctx.sumLi_C + ctx.W_C);
      const perimHalf = 2 * (ctx.sumLi_F + ctx.W_F);
      const jointQty = hTop * perimWhole + R05 * perimHalf;
      const benchmarkQty = perimWhole * R1 + perimHalf * R05;
      const isCustom = pTop.holeCount != null;

      items.push({
        rowId: 'AP7',
        section: 'ROOF',
        label: 'Roof PNL + Side PNLs (Perimeter)',
        jointType: 'AP7',
        seams: 1,
        panels: [
          { role: `Top Side Course (${topCourse} Top Face)`, code: pTop.code, opening: pTop.openingCode, holeCount: pTop.holeCount, fallback: R1 }
        ],
        calcFormula: `${hTop} holes × ${perimWhole}m (1m courses) + ${R05} holes × ${perimHalf}m (0.5m courses) = ${jointQty} PCS`,
        jointBoltQty: jointQty,
        benchmarkFormula: `(PerimWhole*R1) + (PerimHalf*R05)`,
        benchmarkQty,
        isCustom,
        status: isCustom ? (jointQty === benchmarkQty ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 4. AP12 - Bottom+Bottom (Vertical)
    {
      const pFull = inspectPanel("roof_bottom.base_full", "edges", "left");
      const hFull = pFull.holeCount != null ? pFull.holeCount : BR1;
      const seams = Math.max(0, ctx.L_C + ctx.L_F - 1);
      const holesPerSeam = hFull * ctx.W_C + BR05 * ctx.W_F;
      const jointQty = holesPerSeam * seams;
      const benchmarkQty = (BR1 * ctx.W_C + BR05 * ctx.W_F) * seams;
      const isCustom = pFull.holeCount != null;

      items.push({
        rowId: 'AP12',
        section: 'BOTTOM',
        label: 'Bottom PNL + Bottom PNL (Vertical)',
        jointType: 'AP12',
        seams,
        panels: [
          { role: '1.0m Bottom (Left Flange)', code: pFull.code, opening: pFull.openingCode, holeCount: pFull.holeCount, fallback: BR1 }
        ],
        calcFormula: `(${hFull} holes × ${ctx.W_C}m + ${BR05} holes × ${ctx.W_F}m) × ${seams} seams = ${jointQty} PCS`,
        jointBoltQty: jointQty,
        benchmarkFormula: `(8*W_C + 4*W_F)*(L_C + L_F - 1)`,
        benchmarkQty,
        isCustom,
        status: isCustom ? (jointQty === benchmarkQty ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 5. AP13 - Bottom+Bottom (Horizontal)
    {
      const pFull = inspectPanel("roof_bottom.base_full", "edges", "top");
      const hFull = pFull.holeCount != null ? pFull.holeCount : BR1;
      const seams = Math.max(0, ctx.W_C + ctx.W_F - 1);
      const holesPerSeam = hFull * ctx.L_C + BR05 * ctx.L_F;
      const jointQty = holesPerSeam * seams;
      const benchmarkQty = (BR1 * ctx.L_C + BR05 * ctx.L_F) * seams;
      const isCustom = pFull.holeCount != null;

      items.push({
        rowId: 'AP13',
        section: 'BOTTOM',
        label: 'Bottom PNL + Bottom PNL (Horizontal)',
        jointType: 'AP13',
        seams,
        panels: [
          { role: '1.0m Bottom (Top Flange)', code: pFull.code, opening: pFull.openingCode, holeCount: pFull.holeCount, fallback: BR1 }
        ],
        calcFormula: `(${hFull} holes × ${ctx.L_C}m + ${BR05} holes × ${ctx.L_F}m) × ${seams} seams = ${jointQty} PCS`,
        jointBoltQty: jointQty,
        benchmarkFormula: `L_O*8*(W_C + W_F - 1)`,
        benchmarkQty,
        isCustom,
        status: isCustom ? (jointQty === benchmarkQty ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 6. AP14 - Bottom+Side (Perimeter)
    {
      const bottomCourse = aliasCourse(courses[courses.length - 1]);
      const pBottom = inspectPanel("side." + bottomCourse + ".side", "face", "bottom");
      const hBottom = pBottom.holeCount != null ? pBottom.holeCount : BR1;
      const perimWhole = 2 * (ctx.sumLi_C + ctx.W_C);
      const perimHalf = 2 * (ctx.sumLi_F + ctx.W_F);
      const jointQty = hBottom * perimWhole + BR05 * perimHalf;
      const benchmarkQty = perimWhole * BR1 + perimHalf * BR05;
      const isCustom = pBottom.holeCount != null;

      items.push({
        rowId: 'AP14',
        section: 'BOTTOM',
        label: 'Bottom PNLs + Side PNLs (Perimeter)',
        jointType: 'AP14perimeterOnly',
        seams: 1,
        panels: [
          { role: `Bottom Side Course (${bottomCourse} Bottom Face)`, code: pBottom.code, opening: pBottom.openingCode, holeCount: pBottom.holeCount, fallback: BR1 }
        ],
        calcFormula: `${hBottom} holes × ${perimWhole}m (1m) + ${BR05} holes × ${perimHalf}m (0.5m) = ${jointQty} PCS (before AP24)`,
        jointBoltQty: jointQty,
        benchmarkFormula: `(PerimWhole*8) + (PerimHalf*4) - AP24`,
        benchmarkQty,
        isCustom,
        status: isCustom ? (jointQty === benchmarkQty ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 7. AP18 - Side+Side (Vertical)
    {
      const seamsPerCourse = 2 * ((ctx.W_C + ctx.W_F - 1) + (ctx.L_C + ctx.L_F - 1));
      let ap18Total = 0;
      let ap18BenchTotal = 0;
      const sidePanels = [];
      let isCustom = false;

      courses.forEach(course => {
        const c = aliasCourse(course);
        const pLeft = inspectPanel("side." + c + ".side", "edges", "left");
        const pRight = inspectPanel("side." + c + ".side", "edges", "right");
        const hVal = pLeft.holeCount != null ? pLeft.holeCount : (pRight.holeCount != null ? pRight.holeCount : null);
        const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
        const perSide = hVal != null ? hVal : fallback;
        if (hVal != null) isCustom = true;
        ap18Total += perSide * seamsPerCourse;
        ap18BenchTotal += fallback * seamsPerCourse;
        sidePanels.push({
          role: `Course ${course} (${COURSE_HEIGHT_METERS[course]}m)`,
          code: pLeft.code,
          opening: pLeft.openingCode,
          holeCount: hVal,
          fallback
        });
      });

      items.push({
        rowId: 'AP18',
        section: 'SIDE',
        label: 'Side PNL + Side PNL (Vertical)',
        jointType: 'AP18',
        seams: seamsPerCourse,
        panels: sidePanels,
        calcFormula: `Sum across courses: ${sidePanels.map(p => `(${p.holeCount != null ? p.holeCount : p.fallback} × ${seamsPerCourse})`).join(' + ')} = ${ap18Total} PCS`,
        jointBoltQty: ap18Total,
        benchmarkFormula: `H_O*((W_C+W_F-1)+(L_C+L_F-1))*2*8`,
        benchmarkQty: ap18BenchTotal,
        isCustom,
        status: isCustom ? (ap18Total === ap18BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 8. AP19 - Side+Side (Horizontal course boundaries)
    {
      const perimeterM = 2 * (ctx.W_O + ctx.L_O);
      let ap19Total = 0;
      let ap19BenchTotal = 0;
      const boundaryPanels = [];
      let isCustom = false;

      for (let i = 0; i < courses.length - 1; i++) {
        const above = aliasCourse(courses[i]);
        const below = aliasCourse(courses[i + 1]);
        const pAbove = inspectPanel("side." + above + ".side", "edges", "bottom");
        const pBelow = inspectPanel("side." + below + ".side", "edges", "top");
        const hVal = pAbove.holeCount != null ? pAbove.holeCount : (pBelow.holeCount != null ? pBelow.holeCount : null);
        const fallback = BR1;
        const perSeam = hVal != null ? hVal : fallback;
        if (hVal != null) isCustom = true;
        ap19Total += perSeam * perimeterM;
        ap19BenchTotal += fallback * perimeterM;
        boundaryPanels.push({
          role: `Boundary ${above} ↔ ${below}`,
          code: `${pAbove.code} / ${pBelow.code}`,
          opening: pAbove.openingCode,
          holeCount: hVal,
          fallback
        });
      }

      items.push({
        rowId: 'AP19',
        section: 'SIDE',
        label: 'Side PNL + Side PNL (Horizontal Seams)',
        jointType: 'AP19',
        seams: Math.max(0, courses.length - 1),
        panels: boundaryPanels,
        calcFormula: courses.length > 1
          ? `Perimeter ${perimeterM}m × ${courses.length - 1} course boundary seams × 8 holes = ${ap19Total} PCS`
          : `Single course (H=${ctx.hKey}m) -> 0 horizontal seams`,
        jointBoltQty: ap19Total,
        benchmarkFormula: `Course Boundary Seams × Perimeter × 8`,
        benchmarkQty: ap19BenchTotal,
        isCustom,
        status: isCustom ? (ap19Total === ap19BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 9. AP22 - Corner Angle Frame + Side Panels
    {
      const cornersPerCourse = (ctx.numCorners || 4) * 2;
      let ap22Total = 0;
      let ap22BenchTotal = 0;
      const cornerPanels = [];
      let isCustom = false;

      courses.forEach(course => {
        const c = aliasCourse(course);
        const pLeft = inspectPanel("side." + c + ".side", "edges", "left");
        const pRight = inspectPanel("side." + c + ".side", "edges", "right");
        const hVal = pLeft.holeCount != null ? pLeft.holeCount : (pRight.holeCount != null ? pRight.holeCount : null);
        const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
        const perSide = hVal != null ? hVal : fallback;
        if (hVal != null) isCustom = true;
        ap22Total += perSide * cornersPerCourse;
        ap22BenchTotal += fallback * cornersPerCourse;
        cornerPanels.push({
          role: `Corner Course ${course}`,
          code: pLeft.code,
          opening: pLeft.openingCode,
          holeCount: hVal,
          fallback
        });
      });

      items.push({
        rowId: 'AP22',
        section: 'SIDE',
        label: 'Corner Angle Frame + Side PNLs',
        jointType: 'AP22',
        seams: ctx.numCorners || 4,
        panels: cornerPanels,
        calcFormula: `Sum across corner courses: ${cornerPanels.map(p => `(${p.holeCount != null ? p.holeCount : p.fallback} × ${cornersPerCourse})`).join(' + ')} = ${ap22Total} PCS`,
        jointBoltQty: ap22Total,
        benchmarkFormula: `H_O * 8 * 2 * 4`,
        benchmarkQty: ap22BenchTotal,
        isCustom,
        status: isCustom ? (ap22Total === ap22BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 10. AP29 - Partition PNL + Side PNL
    {
      const nParti = Number(ctx.n_partitions) || 0;
      let ap29Total = 0;
      let ap29BenchTotal = 0;
      const partiSidePanels = [];
      let isCustom = false;

      if (nParti > 0) {
        let holesPerWall = 0;
        let benchHolesPerWall = 0;
        courses.forEach(course => {
          const c = aliasCourse(course);
          const pResolved = resolvePanelAt("side." + c + ".side", ctx.hKey, ctx.presetId);
          let holeLeft = null, holeRight = null;
          if (pResolved.code && global.PanelHoleSpec) {
            const specSL = global.PanelHoleSpec.getPanelSpec(pResolved.code, "SL", ctx.presetId);
            const specSR = global.PanelHoleSpec.getPanelSpec(pResolved.code, "SR", ctx.presetId);
            const specSX = global.PanelHoleSpec.getPanelSpec(pResolved.code, "SX", ctx.presetId);
            const specBase = global.PanelHoleSpec.getPanelSpec(pResolved.code, pResolved.openingCode || "", ctx.presetId);

            holeLeft = (specSL && specSL.face && specSL.face.left != null) ? specSL.face.left :
                       ((specSX && specSX.face && specSX.face.left != null) ? specSX.face.left :
                       ((specBase && specBase.face && specBase.face.left != null) ? specBase.face.left : null));

            holeRight = (specSR && specSR.face && specSR.face.right != null) ? specSR.face.right :
                        ((specSX && specSX.face && specSX.face.right != null) ? specSX.face.right :
                        ((specBase && specBase.face && specBase.face.right != null) ? specBase.face.right : null));
          }
          const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
          const lVal = holeLeft != null ? holeLeft : fallback;
          const rVal = holeRight != null ? holeRight : fallback;
          if (holeLeft != null || holeRight != null) isCustom = true;
          holesPerWall += (lVal + rVal);
          benchHolesPerWall += (fallback * 2);
          partiSidePanels.push({
            role: `Course ${course} Side Face Holes`,
            code: pResolved.code,
            opening: pResolved.openingCode,
            holeCount: (holeLeft != null ? `L:${holeLeft}` : `L:${fallback}`) + ' ' + (holeRight != null ? `R:${holeRight}` : `R:${fallback}`),
            fallback: fallback * 2
          });
        });
        ap29Total = holesPerWall * nParti;
        ap29BenchTotal = benchHolesPerWall * nParti;
      }

      items.push({
        rowId: 'AP29',
        section: 'PARTITION',
        label: 'Partition PNL + Side PNL (Internal Seams)',
        jointType: 'AP29',
        seams: nParti * 2,
        panels: partiSidePanels,
        calcFormula: nParti > 0 ? `(${ap29Total / nParti} holes/partition) × ${nParti} partitions = ${ap29Total} PCS` : `0 Partitions -> 0 PCS`,
        jointBoltQty: ap29Total,
        benchmarkFormula: `H_O * 8 * 2 * N_PA`,
        benchmarkQty: ap29BenchTotal,
        isCustom,
        status: isCustom ? (ap29Total === ap29BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 11. AP30 - Partition PNL + Bottom PNL
    {
      const nParti = Number(ctx.n_partitions) || 0;
      let ap30Total = 0;
      let ap30BenchTotal = 0;
      const partiBottomPanels = [];
      let isCustom = false;

      if (nParti > 0) {
        const resolved = resolvePanelAt("roof_bottom.base_full", ctx.hKey, ctx.presetId);
        let holeVal = null;
        if (resolved.code && global.PanelHoleSpec) {
          const specBP = global.PanelHoleSpec.getPanelSpec(resolved.code, "BP", ctx.presetId);
          const specBX = global.PanelHoleSpec.getPanelSpec(resolved.code, "BX", ctx.presetId);
          const specBase = global.PanelHoleSpec.getPanelSpec(resolved.code, resolved.openingCode || "", ctx.presetId);
          holeVal = (specBP && specBP.face && specBP.face.top != null) ? specBP.face.top :
                    ((specBX && specBX.face && specBX.face.top != null) ? specBX.face.top :
                    ((specBase && specBase.face && specBase.face.top != null) ? specBase.face.top : null));
        }
        if (holeVal != null) isCustom = true;
        const perSeam = ((holeVal != null) ? holeVal : BR1) * ctx.W_C + BR05 * ctx.W_F;
        ap30Total = perSeam * nParti;
        ap30BenchTotal = (BR1 * ctx.W_C + BR05 * ctx.W_F) * nParti;
        partiBottomPanels.push({
          role: 'Bottom Plate Partition Face (BP/BX)',
          code: resolved.code,
          opening: resolved.openingCode,
          holeCount: holeVal,
          fallback: BR1
        });
      }

      items.push({
        rowId: 'AP30',
        section: 'PARTITION',
        label: 'Partition PNL + Bottom PNL (Internal Seams)',
        jointType: 'AP30',
        seams: nParti,
        panels: partiBottomPanels,
        calcFormula: nParti > 0 ? `(${ap30Total / nParti} holes/seam) × ${nParti} partitions = ${ap30Total} PCS` : `0 Partitions -> 0 PCS`,
        jointBoltQty: ap30Total,
        benchmarkFormula: `W_O * 8 * N_PA`,
        benchmarkQty: ap30BenchTotal,
        isCustom,
        status: isCustom ? (ap30Total === ap30BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 12. AP32 - Partition PNL + Partition PNL (Horizontal)
    {
      const nParti = Number(ctx.n_partitions) || 0;
      let ap32Total = 0;
      let ap32BenchTotal = 0;
      const partiHSeamPanels = [];
      let isCustom = false;

      if (nParti > 0 && courses.length > 1) {
        for (let i = 0; i < courses.length - 1; i++) {
          const above = aliasCourse(courses[i]);
          const below = aliasCourse(courses[i + 1]);
          const holeAbove = getHoleCount("partition." + above + ".partition", ctx.hKey, ctx.presetId, "bottom") ||
                            getHoleCount("partition1x1." + above + ".partition", ctx.hKey, ctx.presetId, "bottom");
          const holeBelow = getHoleCount("partition." + below + ".partition", ctx.hKey, ctx.presetId, "top") ||
                            getHoleCount("partition1x1." + below + ".partition", ctx.hKey, ctx.presetId, "top");
          const hVal = (holeAbove != null) ? holeAbove : ((holeBelow != null) ? holeBelow : null);
          if (hVal != null) isCustom = true;
          const val = hVal != null ? hVal : BR1;
          ap32Total += (val * ctx.W_C + (val / 2) * ctx.W_F) * nParti;
          ap32BenchTotal += (BR1 * ctx.W_C + BR05 * ctx.W_F) * nParti;
          partiHSeamPanels.push({
            role: `Partition Boundary ${above} ↔ ${below}`,
            code: `${above} / ${below}`,
            holeCount: hVal,
            fallback: BR1
          });
        }
      }

      items.push({
        rowId: 'AP32',
        section: 'PARTITION',
        label: 'Partition PNL + Partition PNL (Horizontal)',
        jointType: 'AP32',
        seams: nParti > 0 ? (courses.length - 1) * nParti : 0,
        panels: partiHSeamPanels,
        calcFormula: nParti > 0 && courses.length > 1 ? `(${ctx.W_C}m × 8 + ${ctx.W_F}m × 4) × ${courses.length - 1} seams × ${nParti} = ${ap32Total} PCS` : `0 PCS`,
        jointBoltQty: ap32Total,
        benchmarkFormula: `W_O * 8 * (H_Courses - 1) * N_PA`,
        benchmarkQty: ap32BenchTotal,
        isCustom,
        status: isCustom ? (ap32Total === ap32BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    // 13. AP33 - Partition PNL + Partition PNL (Vertical)
    {
      const nParti = Number(ctx.n_partitions) || 0;
      let ap33Total = 0;
      let ap33BenchTotal = 0;
      const partiVSeamPanels = [];
      let isCustom = false;

      if (nParti > 0) {
        let holesPerSeam = 0;
        let benchHolesPerSeam = 0;
        courses.forEach(course => {
          const c = aliasCourse(course);
          const holeLeft = getHoleCount("partition." + c + ".partition", ctx.hKey, ctx.presetId, "left") ||
                           getHoleCount("partition1x1." + c + ".partition", ctx.hKey, ctx.presetId, "left");
          const holeRight = getHoleCount("partition." + c + ".partition", ctx.hKey, ctx.presetId, "right") ||
                            getHoleCount("partition1x1." + c + ".partition", ctx.hKey, ctx.presetId, "right");
          const hVal = (holeLeft != null) ? holeLeft : ((holeRight != null) ? holeRight : null);
          if (hVal != null) isCustom = true;
          const fallback = BR1 * (COURSE_HEIGHT_METERS[course] || 1);
          const val = hVal != null ? hVal : fallback;
          holesPerSeam += val;
          benchHolesPerSeam += fallback;
          partiVSeamPanels.push({
            role: `Partition Vertical Course ${course}`,
            code: c,
            holeCount: hVal,
            fallback
          });
        });
        const vSeams = Math.max(0, ctx.W_C + ctx.W_F - 1);
        ap33Total = holesPerSeam * vSeams * nParti;
        ap33BenchTotal = benchHolesPerSeam * vSeams * nParti;
      }

      items.push({
        rowId: 'AP33',
        section: 'PARTITION',
        label: 'Partition PNL + Partition PNL (Vertical)',
        jointType: 'AP33',
        seams: nParti > 0 ? Math.max(0, ctx.W_C + ctx.W_F - 1) * nParti : 0,
        panels: partiVSeamPanels,
        calcFormula: nParti > 0 ? `(${ap33Total / Math.max(1, (ctx.W_C + ctx.W_F - 1) * nParti)} holes/seam) × ${Math.max(0, ctx.W_C + ctx.W_F - 1)} seams × ${nParti} = ${ap33Total} PCS` : `0 PCS`,
        jointBoltQty: ap33Total,
        benchmarkFormula: `(W_C + W_F - 1) * H_O * 8 * N_PA`,
        benchmarkQty: ap33BenchTotal,
        isCustom,
        status: isCustom ? (ap33Total === ap33BenchTotal ? 'MATCH_VERIFIED' : 'CUSTOM_PRECISION') : 'DEFAULT_FALLBACK'
      });
    }

    const totalJointBolts = items.reduce((s, it) => s + it.jointBoltQty, 0);
    const totalBenchmarkBolts = items.reduce((s, it) => s + it.benchmarkQty, 0);
    const verifiedCustomCount = items.filter(it => it.isCustom).length;

    return {
      success: true,
      totalJointBolts,
      totalBenchmarkBolts,
      verifiedCustomCount,
      totalJointTypes: items.length,
      items,
      warnings
    };
  }

  global.JointBoltEngine = {
    computeJointCounts,
    computeJointAuditReport,
    coursesForHeight,
    aliasCourse,
    COURSE_HEIGHT_METERS
  };
})(typeof window !== "undefined" ? window : this);
