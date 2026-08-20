// =============================================================================
// WATANI GRP Water Tank -- Panel BOM Engine (JavaScript port for water-tank-bom app)
// =============================================================================
// This file is now a thin INTERPRETER over panel_rules.js (quantity formulas)
// and panel_catalog.js (vendor part-number data). To change a coefficient,
// height bracket, or catalog part number, edit those two files -- NOT this
// one. This file only:
//   1. GEOMETRY        -- pure arithmetic on plan dimensions (structural
//                          parsing, not a business rule -- stays in code)
//   2. Builds the rule-engine "scope" from that geometry
//   3. Evaluates panel_rules.js's course-table + quantity-rule groups via
//      rule_engine.js
//   4. Resolves the result against panel_catalog.js to produce final BOM
//      line items
//
// Verified 1:1 against the original .xlsm (12/12 scenarios cross-checked in
// LibreOffice), and this rule-based rewrite was cross-validated against the
// previous hard-coded implementation across 630+ combinations of height/
// width/length/partition (every supported height x 7 widths x 10 length
// combos) plus 7 full-pipeline scenarios together with accessories_engine.js,
// with zero differences.
//
// SCOPE: covers Roof/Manhole, Bottom/Drain, Side and Partition panels for
// the DEFAULT product configuration (1.5m/2.0m combo panels). All plan
// dimensions must be exact multiples of 0.5m -- see dimOf().
// =============================================================================
(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./rule_engine.js"), require("./panel_rules.js"), require("./panel_catalog.js"), require("./panel_catalog_1x1.js"), require("./panel_catalog_partition_alt.js"));
  } else {
    const root = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : global);
    const engine = factory(
      root.RuleEngine || (typeof global !== "undefined" ? global.RuleEngine : undefined),
      root.PanelRules || (typeof global !== "undefined" ? global.PanelRules : undefined),
      root.PanelCatalog || (typeof global !== "undefined" ? global.PanelCatalog : undefined),
      root.PanelCatalog1x1 || (typeof global !== "undefined" ? global.PanelCatalog1x1 : undefined),
      root.PanelCatalogPartitionAlt || (typeof global !== "undefined" ? global.PanelCatalogPartitionAlt : undefined)
    );
    root.PanelEngine = engine;
    if (typeof window !== "undefined") window.PanelEngine = engine;
    if (typeof globalThis !== "undefined") globalThis.PanelEngine = engine;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (RuleEngine, Rules, Catalog, Catalog1x1, CatalogPartitionAlt) {
  "use strict";

  if (!RuleEngine) throw new Error("panel_engine.js requires rule_engine.js to be loaded first.");
  if (!Rules) throw new Error("panel_engine.js requires panel_rules.js to be loaded first.");
  if (!Catalog) throw new Error("panel_engine.js requires panel_catalog.js to be loaded first.");

  function dimOf(value) {
    var whole = Math.trunc(value + 1e-9);
    var remainder = Math.round((value - whole) * 1e6) / 1e6;
    if (remainder !== 0 && remainder !== 0.5) {
      throw new Error(value + "m은 0.5m 단위가 아닙니다.");
    }
    return { value: value, whole: whole, half: remainder === 0.5 ? 1 : 0 };
  }

  function makeGeometry(W, L1, H, L2, L3, L4, nPaOverride) {
    L2 = L2 || 0; L3 = L3 || 0; L4 = L4 || 0;
    var nPa = (typeof nPaOverride === "number" && !isNaN(nPaOverride))
      ? nPaOverride
      : (L4 > 0 ? 3 : L3 > 0 ? 2 : L2 > 0 ? 1 : 0);
    return {
      W: dimOf(W), L1: dimOf(L1), L2: dimOf(L2), L3: dimOf(L3), L4: dimOf(L4), H: dimOf(H),
      n_partitions: nPa,
      get L_C_sum() { return this.L1.whole + this.L2.whole + this.L3.whole + this.L4.whole; },
      get L_F_sum() { return this.L1.half + this.L2.half + this.L3.half + this.L4.half; }
    };
  }

  function selectCourses(H_O) {
    var courses = Rules.COURSE_TABLE[String(H_O)];
    if (!courses) throw new Error("Unsupported height: " + H_O + "mH.");
    return courses.slice();
  }

  function evalGroup(group, scope) {
    var extScope = RuleEngine.withIntermediates(group.intermediates, scope);
    var out = {};
    Object.keys(group.outputs).forEach(function (key) {
      out[key] = RuleEngine.evaluate(group.outputs[key], extScope);
    });
    return out;
  }

  function panelBom(W, L1, H, L2, L3, L4) {
    var g = makeGeometry(W, L1, H, L2, L3, L4);
    var courses = selectCourses(g.H.value);

    var baseScope = {
      W_C: g.W.whole, W_F: g.W.half, L_C: g.L_C_sum, L_F: g.L_F_sum,
      N_PA: g.n_partitions, H_O: g.H.value, H_C: g.H.whole, H_F: g.H.half,
      L1_val: g.L1.value, L2_val: g.L2.value, L3_val: g.L3.value, L4_val: g.L4.value,
      L1_F: g.L1.half, L2_F: g.L2.half, L3_F: g.L3.half, L4_F: g.L4.half
    };
    var scope = RuleEngine.withIntermediates(Rules.COMMON_INTERMEDIATES, baseScope);

    var side = {};
    courses.forEach(function (course) {
      var groupKey = Rules.COURSE_BUILDER_KEY[course];
      side[course] = evalGroup(Rules.RULE_GROUPS[groupKey], scope);
    });
    if (!(courses.indexOf("LOWER") !== -1 || courses.indexOf("LOWER_SOLO") !== -1)) {
      side.BASE_FILLER = evalGroup(Rules.RULE_GROUPS.baseFiller, scope);
    }

    var partition = {};
    if (g.n_partitions > 0) {
      var partScope = RuleEngine.withIntermediates(
        [{ name: "base", formula: "W_C*N_PA" }, { name: "vert", formula: "W_F*N_PA" }],
        scope
      );
      courses.forEach(function (course) {
        var templateKey = Rules.PARTITION_TEMPLATE_BY_COURSE[course];
        var template = Rules.PARTITION_TEMPLATES[templateKey];
        var out = {};
        Object.keys(template).forEach(function (key) {
          out[key] = RuleEngine.evaluate(template[key], partScope);
        });
        partition[course] = out;
      });
    }

    return {
      geometry: {
        W_C: g.W.whole, W_F: g.W.half, L_C_sum: g.L_C_sum, L_F_sum: g.L_F_sum,
        H_C: g.H.whole, H_F: g.H.half, N_PA: g.n_partitions, courses: courses
      },
      roof_bottom: evalGroup(Rules.RULE_GROUPS.roofBottom, scope),
      side: side,
      partition: partition,
      scope: scope
    };
  }

  // "0.5/1M Side Panel only" alternate: builds the side wall from a fixed
  // stack of 1m-tall (+ one 0.5m finishing) panels instead of the default
  // course system, reusing the "LOWER" course's own perimeter-quantity
  // formulas (side/hside/side_parRT/side_parLT/hside_parRT/hside_parLT) for
  // every slice -- those formulas already scale correctly with N_PA
  // (partition count), including 0. Returns null (caller falls back to the
  // default catalog) if this height isn't supported at all.
  function computeSide1x1Items(p, scope, qty, lookupPart, warnings) {
    var hKey = String(p.H);
    var slices = Catalog1x1.SIDE_1X1_BY_HEIGHT[hKey];
    if (!slices) {
      warnings.push("1x1M-only side data not available for H=" + p.H + "mH; using default panel configuration.");
      return null;
    }
    var perim = evalGroup(Rules.RULE_GROUPS.lower, scope); // { side, hside, side_parRT, side_parLT, hside_parRT, hside_parLT, side_nozzle }
    var items = [];

    function pushSlice(catalogKey, partNo, roleLabel, sliceLabel, qtyRaw) {
      if (!qtyRaw) return;
      if (!partNo) {
        warnings.push("No " + roleLabel + " part documented for the 1x1M " + sliceLabel + " at H=" + p.H + "mH (source data gap) -- that panel was omitted, please verify manually.");
        return;
      }
      var totalQty = qtyRaw * qty;
      var found = typeof lookupPart === "function" ? lookupPart(partNo, catalogKey) : null;
      items.push({
        category: "Panels",
        catalogKey: catalogKey,
        partNo: partNo,
        partName: (found && (found.nameKo || found.nameEn)) || (roleLabel + " (" + sliceLabel + ")"),
        qty: totalQty,
        unit: (found && found.unit) || "PCS",
        spec: (found && found.spec) || (roleLabel + " - " + sliceLabel),
        price: (found && Number(found.price)) || 0,
        weight: (found && Number(found.weight)) || 0
      });
    }

    slices.forEach(function (slice, idx) {
      var sliceLabel = slice.sizeM + "m slice " + (idx + 1) + "/" + slices.length;
      var keyBase = "side1x1." + hKey + ".slice" + idx;
      pushSlice(keyBase + ".wide", slice.wide, "Side (1x1M)", sliceLabel, perim.side);
      pushSlice(keyBase + ".narrow", slice.narrow, "Side Half (1x1M)", sliceLabel, perim.hside);
      pushSlice(keyBase + ".parRT", slice.parRT, "Side Par-RT (1x1M)", sliceLabel, perim.side_parRT);
      pushSlice(keyBase + ".parLT", slice.parLT, "Side Par-LT (1x1M)", sliceLabel, perim.side_parLT);
      pushSlice(keyBase + ".narrowParRT", slice.narrowParRT, "Side Half Par-RT (1x1M)", sliceLabel, perim.hside_parRT);
      pushSlice(keyBase + ".narrowParLT", slice.narrowParLT, "Side Half Par-LT (1x1M)", sliceLabel, perim.hside_parLT);
    });

    // Nozzle uses the same catalog key as the default LOWER course so it
    // stays overridable via the same panel-matrix row either way.
    var catalog = Catalog.CATALOG_BY_HEIGHT[hKey];
    var nozzlePart = catalog && catalog["side.LOWER.side_nozzle"];
    var nozzleQtyFactor = (opts && opts.nozzlePanelMode === "0.5m_x2") ? 2 : 1;
    var nozzleRoleLabel = "Side (Nozzle" + (nozzleQtyFactor === 2 ? " 0.5m x 2EA" : "") + ")";
    pushSlice("side.LOWER.side_nozzle", nozzlePart, nozzleRoleLabel, "base", perim.side_nozzle * nozzleQtyFactor);

    return items;
  }

  // "0.5/1M Partition only" alternate: only the TOP course of the given
  // height (TOP_15 or TOP_20 -- whichever COURSE_TABLE selects) is affected.
  // Its "partition" role collapses to ONE part covering the full course
  // height (replacing the default's partition + partition_2 pair), while its
  // "vert" role keeps two parts, just with alternate part numbers. Every
  // other course (MID_TOP/MID_LOWER/LOWER) is identical to the default
  // scheme in the source data, so those keep using the exact same
  // partition.<course>.* catalog keys/quantities as computePanelBomItems'
  // default partition loop -- only the top course gets the
  // "partition1x1.<course>.*" keys. Returns null (caller falls back to the
  // default catalog) if this height has no alternate data at all (H=1).
  function computePartitionAltItems(p, scope, courses, qty, lookupPart, warnings) {
    var hKey = String(p.H);
    var alt = CatalogPartitionAlt.PARTITION_ALT_BY_HEIGHT[hKey];
    if (!alt) {
      warnings.push("1x1M-only partition data not available for H=" + p.H + "mH; using default partition configuration.");
      return null;
    }
    var partScope = RuleEngine.withIntermediates(
      [{ name: "base", formula: "W_C*N_PA" }, { name: "vert", formula: "W_F*N_PA" }],
      scope
    );
    var catalog = Catalog.CATALOG_BY_HEIGHT[hKey];
    var items = [];

    function pushItem(catalogKey, partNo, roleLabel, courseLabel, qtyRaw) {
      if (!qtyRaw) return;
      var totalQty = qtyRaw * qty;
      if (!partNo) {
        warnings.push('No catalog part number for "' + catalogKey + '" at H=' + p.H + 'mH.');
        partNo = "TBD-" + catalogKey;
      }
      var found = typeof lookupPart === "function" ? lookupPart(partNo, catalogKey) : null;
      items.push({
        category: "Panels",
        catalogKey: catalogKey,
        partNo: partNo,
        partName: (found && (found.nameKo || found.nameEn)) || (roleLabel + (courseLabel ? " (" + courseLabel + ")" : "")),
        qty: totalQty,
        unit: (found && found.unit) || "PCS",
        spec: (found && found.spec) || (roleLabel + (courseLabel ? " - " + courseLabel : "")),
        price: (found && Number(found.price)) || 0,
        weight: (found && Number(found.weight)) || 0
      });
    }

    courses.forEach(function (course) {
      var catalogCourse = Catalog.CATALOG_COURSE_ALIAS[course] || course;
      var courseLabel = Catalog.COURSE_HEIGHT_LABEL[course] || course;
      if (course === alt.course) {
        var vert2Formula = course === "TOP_15" ? "W_F*H_F*N_PA" : "vert";
        pushItem("partition1x1." + catalogCourse + ".partition", alt.partition, Catalog.PARTITION_ROLE_LABELS.partition || "partition", courseLabel, RuleEngine.evaluate("base", partScope));
        pushItem("partition1x1." + catalogCourse + ".vert", alt.vert, Catalog.PARTITION_ROLE_LABELS.vert || "vert", courseLabel, RuleEngine.evaluate("vert", partScope));
        pushItem("partition1x1." + catalogCourse + ".vert_2", alt.vert_2, Catalog.PARTITION_ROLE_LABELS.vert_2 || "vert_2", courseLabel, RuleEngine.evaluate(vert2Formula, partScope));
      } else {
        var templateKey = Rules.PARTITION_TEMPLATE_BY_COURSE[course];
        var template = Rules.PARTITION_TEMPLATES[templateKey];
        Object.keys(template).forEach(function (role) {
          var qv = RuleEngine.evaluate(template[role], partScope);
          var catalogKey = "partition." + catalogCourse + "." + role;
          var partNo = catalog ? catalog[catalogKey] : undefined;
          pushItem(catalogKey, partNo, Catalog.PARTITION_ROLE_LABELS[role] || role, courseLabel, qv);
        });
      }
    });

    return items;
  }

  function computePanelBomItems(p, lookupPart, opts) {
    var qty = p.qty && p.qty > 0 ? p.qty : 1;
    var bom = panelBom(p.W, p.L1, p.H, p.L2, p.L3, p.L4);
    var hKey = String(p.H);
    var catalog = Catalog.CATALOG_BY_HEIGHT[hKey];
    var warnings = [];
    var items = [];

    function pushItem(catalogKey, role, roleLabel, courseLabel, qtyRaw) {
      if (!qtyRaw) return;
      var totalQty = qtyRaw * qty;
      var partNo = catalog ? catalog[catalogKey] : undefined;
      if (!partNo) {
        warnings.push('No catalog part number for "' + catalogKey + '" at H=' + p.H + 'mH.');
        partNo = "TBD-" + catalogKey;
      }
      var found = typeof lookupPart === "function" ? lookupPart(partNo, catalogKey) : null;
      var partName = (found && (found.nameKo || found.nameEn)) || (roleLabel + (courseLabel ? " (" + courseLabel + ")" : ""));
      var spec = (found && found.spec) || (roleLabel + (courseLabel ? " - " + courseLabel : ""));
      items.push({
        category: "Panels",
        catalogKey: catalogKey,
        partNo: partNo,
        partName: partName,
        qty: totalQty,
        unit: (found && found.unit) || "PCS",
        spec: spec,
        price: (found && Number(found.price)) || 0,
        weight: (found && Number(found.weight)) || 0
      });
    }

    if (!catalog) {
      warnings.push("No catalog data for H=" + p.H + "mH.");
    }

    Object.keys(bom.roof_bottom).forEach(function (role) {
      var qv = bom.roof_bottom[role];
      pushItem("roof_bottom." + role, role, Catalog.ROOF_BOTTOM_LABELS[role] || role, "", qv);
    });

    var side1x1Items = (opts && opts.sidePanelOnly === "1x1" && Catalog1x1)
      ? computeSide1x1Items(p, bom.scope, qty, lookupPart, warnings)
      : null;
    if (side1x1Items) {
      items = items.concat(side1x1Items);
    } else {
      Object.keys(bom.side).forEach(function (course) {
        var catalogCourse = Catalog.CATALOG_COURSE_ALIAS[course] || course;
        var courseLabel = Catalog.COURSE_HEIGHT_LABEL[course] || course;
        var courseData = bom.side[course];
        Object.keys(courseData).forEach(function (role) {
          var qv = courseData[role];
          var roleLabel = Catalog.SIDE_ROLE_LABELS[role] || role;
          if (role === "side_nozzle" && opts && opts.nozzlePanelMode === "0.5m_x2") {
            qv = qv * 2;
            roleLabel = roleLabel + " (0.5m x 2EA)";
          }
          var isMono15 = opts && (opts.half15Mode === "monolithic" || (!opts.half15Mode && opts.halfPanelMode === "monolithic"));
          var isMono20 = opts && (opts.half20Mode === "monolithic" || (!opts.half20Mode && opts.halfPanelMode === "monolithic"));
          if (course === "TOP_15" && isMono15) {
            if (role.startsWith("qside")) return; // Omit secondary quarter split in monolithic mode
            if (role.startsWith("hside")) {
              roleLabel = (Catalog.SIDE_ROLE_LABELS[role] || role) + " (0.5x1.5m)";
            }
          } else if (course === "TOP_20" && isMono20) {
            if (role.startsWith("hside_b") || role.startsWith("qside")) return; // Omit secondary lower half split in monolithic mode
            if (role.startsWith("hside_a") || role.startsWith("hside")) {
              roleLabel = (Catalog.SIDE_ROLE_LABELS[role] || role) + " (0.5x2.0m)";
            }
          }
          pushItem("side." + catalogCourse + "." + role, role, roleLabel, courseLabel, qv);
        });
      });
    }

    var partitionAltItems = (opts && opts.partitionPanelOnly === "1x1" && CatalogPartitionAlt && bom.geometry.N_PA > 0)
      ? computePartitionAltItems(p, bom.scope, bom.geometry.courses, qty, lookupPart, warnings)
      : null;
    if (partitionAltItems) {
      items = items.concat(partitionAltItems);
    } else {
      Object.keys(bom.partition).forEach(function (course) {
        var catalogCourse = Catalog.CATALOG_COURSE_ALIAS[course] || course;
        var courseLabel = Catalog.COURSE_HEIGHT_LABEL[course] || course;
        var courseData = bom.partition[course];
        Object.keys(courseData).forEach(function (role) {
          var qv = courseData[role];
          var roleLabel = Catalog.PARTITION_ROLE_LABELS[role] || role;
          var isMono15Part = opts && (opts.half15Mode === "monolithic" || (!opts.half15Mode && opts.halfPanelMode === "monolithic"));
          var isMono20Part = opts && (opts.half20Mode === "monolithic" || (!opts.half20Mode && opts.halfPanelMode === "monolithic"));
          if (course === "TOP_15" && isMono15Part) {
            if (role === "vert_2") return; // Omit secondary vertical split in monolithic mode
            if (role === "vert") {
              roleLabel = (Catalog.PARTITION_ROLE_LABELS[role] || role) + " (0.5x1.5m)";
            }
          } else if (course === "TOP_20" && isMono20Part) {
            if (role === "vert_2") return; // Omit secondary vertical split in monolithic mode
            if (role === "vert") {
              roleLabel = (Catalog.PARTITION_ROLE_LABELS[role] || role) + " (0.5x2.0m)";
            }
          }
          pushItem("partition." + catalogCourse + "." + role, role, roleLabel, courseLabel, qv);
        });
      });
    }

    return { items: items, geometry: bom.geometry, warnings: warnings };
  }

  // Live per-role breakdown of 3mm PVC sealing tape (see panel_catalog.js
  // SEALING_TAPE_3MM_PVC_BY_ROLE for the verified per-role unit-length data
  // and its provenance). Reuses computePanelBomItems() with qty:1 so it
  // automatically follows whatever DEFAULT/"1x1M only" side-panel branching
  // the real BOM uses for this tank, rather than duplicating that logic.
  // Returns per-1-SET meters; multiply totalMeters by the tank set quantity
  // yourself, same convention as computePanelBomItems' own qty handling.
  function sealingTapeDetail(p, opts) {
    var result;
    try {
      result = computePanelBomItems(
        { W: p.W, L1: p.L1, L2: p.L2, L3: p.L3, L4: p.L4, H: p.H, qty: 1 },
        function () { return null; },
        opts
      );
    } catch (e) {
      return { rows: [], totalMeters: 0 };
    }
    var byRole = {};
    var customOverrides = (typeof window !== 'undefined' && typeof window.getCustomSealingTapeOverrides === 'function') ? window.getCustomSealingTapeOverrides() : {};
    (result.items || []).forEach(function (it) {
      if (!it.catalogKey || !it.qty) return;
      var masterUnit = (typeof SealingTapeEditor !== 'undefined') ? SealingTapeEditor.getPartNoUnitMeter(it.partNo, it.catalogKey) : null;
      var defaultUnit = (masterUnit !== null) ? masterUnit : Catalog.SEALING_TAPE_3MM_PVC_BY_ROLE[it.catalogKey];
      if (defaultUnit == null) {
        // Universal fallback default unit lengths for all height grades (1.0mH to 5.0mH)
        if (it.catalogKey.indexOf('TOP_20') !== -1) defaultUnit = 5.1;
        else if (it.catalogKey.indexOf('side_par') !== -1 || it.catalogKey.indexOf('base_par') !== -1) defaultUnit = 5.1;
        else if (it.catalogKey.indexOf('roof') !== -1) defaultUnit = (it.catalogKey.indexOf('half') !== -1) ? 1.6 : (it.catalogKey.indexOf('quarter') !== -1 ? 0.6 : 2.1);
        else if (it.catalogKey.indexOf('hside') !== -1 || it.catalogKey.indexOf('hbase') !== -1) defaultUnit = 3.1;
        else defaultUnit = 4.1;
      }
      var unit = (customOverrides[it.catalogKey] !== undefined && !isNaN(parseFloat(customOverrides[it.catalogKey]))) 
        ? parseFloat(customOverrides[it.catalogKey]) 
        : defaultUnit;
      if (unit == null) return;
      if (!byRole[it.catalogKey]) byRole[it.catalogKey] = { catalogKey: it.catalogKey, count: 0, unit: unit };
      byRole[it.catalogKey].count += it.qty;
    });
    var rows = Object.keys(byRole).map(function (k) {
      var r = byRole[k];
      return { catalogKey: r.catalogKey, unit: r.unit, count: r.count, subtotal: Math.round(r.unit * r.count * 10) / 10 };
    });
    var totalMeters = Math.round(rows.reduce(function (s, r) { return s + r.subtotal; }, 0) * 10) / 10;
    return { rows: rows, totalMeters: totalMeters };
  }

  var PanelEngine = {
    dimOf: dimOf, makeGeometry: makeGeometry, selectCourses: selectCourses,
    panelBom: panelBom, computePanelBomItems: computePanelBomItems, sealingTapeDetail: sealingTapeDetail,
    CATALOG_BY_HEIGHT: Catalog.CATALOG_BY_HEIGHT
  };

  return PanelEngine;
});
