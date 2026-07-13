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
    module.exports = factory(require("./rule_engine.js"), require("./panel_rules.js"), require("./panel_catalog.js"));
  } else {
    global.PanelEngine = factory(global.RuleEngine, global.PanelRules, global.PanelCatalog);
  }
})(typeof window !== "undefined" ? window : globalThis, function (RuleEngine, Rules, Catalog) {
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

  function makeGeometry(W, L1, H, L2, L3, L4) {
    L2 = L2 || 0; L3 = L3 || 0; L4 = L4 || 0;
    var nPa = L4 > 0 ? 3 : L3 > 0 ? 2 : L2 > 0 ? 1 : 0;
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
      partition: partition
    };
  }

  function computePanelBomItems(p, lookupPart) {
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
      var found = typeof lookupPart === "function" ? lookupPart(partNo) : null;
      var partName = (found && (found.nameKo || found.nameEn)) || (roleLabel + (courseLabel ? " (" + courseLabel + ")" : ""));
      var spec = (found && found.spec) || (roleLabel + (courseLabel ? " - " + courseLabel : ""));
      items.push({
        category: "Panels",
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

    Object.keys(bom.side).forEach(function (course) {
      var catalogCourse = Catalog.CATALOG_COURSE_ALIAS[course] || course;
      var courseLabel = Catalog.COURSE_HEIGHT_LABEL[course] || course;
      var courseData = bom.side[course];
      Object.keys(courseData).forEach(function (role) {
        var qv = courseData[role];
        pushItem("side." + catalogCourse + "." + role, role, Catalog.SIDE_ROLE_LABELS[role] || role, courseLabel, qv);
      });
    });

    Object.keys(bom.partition).forEach(function (course) {
      var catalogCourse = Catalog.CATALOG_COURSE_ALIAS[course] || course;
      var courseLabel = Catalog.COURSE_HEIGHT_LABEL[course] || course;
      var courseData = bom.partition[course];
      Object.keys(courseData).forEach(function (role) {
        var qv = courseData[role];
        pushItem("partition." + catalogCourse + "." + role, role, Catalog.PARTITION_ROLE_LABELS[role] || role, courseLabel, qv);
      });
    });

    return { items: items, geometry: bom.geometry, warnings: warnings };
  }

  var PanelEngine = {
    dimOf: dimOf, makeGeometry: makeGeometry, selectCourses: selectCourses,
    panelBom: panelBom, computePanelBomItems: computePanelBomItems,
    CATALOG_BY_HEIGHT: Catalog.CATALOG_BY_HEIGHT
  };

  return PanelEngine;
});
