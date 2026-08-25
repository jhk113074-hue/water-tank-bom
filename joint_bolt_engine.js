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
    else if (catalogKey.indexOf("partition.") === 0) searchOrder = [3, 4, 0, 1, 2];

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

  // Registered edge hole count for the panel actually at catalogKey/height,
  // or null if nothing is registered (caller must fall back, never guess).
  function getHoleCount(catalogKey, hKey, presetId, edge) {
    if (!global.PanelHoleSpec) return null;
    const resolved = resolvePanelAt(catalogKey, hKey, presetId);
    if (!resolved.code) return null;
    const spec = global.PanelHoleSpec.getPanelSpec(resolved.code, resolved.openingCode, presetId);
    return spec ? spec.edges[edge] : null;
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
      const perSeam = (holeFull != null ? holeFull : R1) * ctx.W_C + R05 * ctx.W_F;
      out.AP12 = perSeam * Math.max(0, ctx.L_C + ctx.L_F - 1);
    }
    // --- AP13: Bottom+Bottom (Horizontal) ---------------------------------
    {
      const holeFull = getHoleCount("roof_bottom.base_full", ctx.hKey, ctx.presetId, "top");
      const perSeam = (holeFull != null ? holeFull : R1) * ctx.L_C + R05 * ctx.L_F;
      out.AP13 = perSeam * Math.max(0, ctx.W_C + ctx.W_F - 1);
    }

    // --- AP7: Roof+Side (perimeter) ---------------------------------------
    // Whole-course term substituted with the real hole count of the
    // TOP-most side course when registered; the half-course term keeps the
    // R05 fallback (no reliable "half" catalogKey identified for a side
    // course yet) -- a documented simplification, not a guess.
    {
      const topCourse = aliasCourse(courses[0]);
      const holeTop = getHoleCount("side." + topCourse + ".side", ctx.hKey, ctx.presetId, "top");
      const perimWhole = 2 * (ctx.sumLi_C + ctx.W_C);
      const perimHalf = 2 * (ctx.sumLi_F + ctx.W_F);
      out.AP7 = (holeTop != null ? holeTop : R1) * perimWhole + R05 * perimHalf;
    }
    // --- AP14: Bottom+Side (perimeter) ------------------------------------
    {
      const bottomCourse = aliasCourse(courses[courses.length - 1]);
      const holeBottom = getHoleCount("side." + bottomCourse + ".side", ctx.hKey, ctx.presetId, "bottom");
      const perimWhole = 2 * (ctx.sumLi_C + ctx.W_C);
      const perimHalf = 2 * (ctx.sumLi_F + ctx.W_F);
      out.AP14perimeterOnly = (holeBottom != null ? holeBottom : R1) * perimWhole + R05 * perimHalf;
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
        const fallback = R1 * (COURSE_HEIGHT_METERS[course] || 1);
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
        ap19 += (holeVal != null ? holeVal : R1) * perimeterM;
      }
      out.AP19 = ap19;
    }

    return out;
  }

  global.JointBoltEngine = { computeJointCounts, coursesForHeight, aliasCourse, COURSE_HEIGHT_METERS };
})(typeof window !== "undefined" ? window : this);
