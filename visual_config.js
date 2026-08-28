// =============================================================================
// WATANI GRP Water Tank -- Visual Tank Configuration Tab ("그림 설정")
// =============================================================================
// Renders a clickable front-elevation SVG of the CURRENT tank configuration
// (read live from the BASIC_TOOL inputs, same fields generateDefaultBOMFromConfig()
// in app.js uses) and, on click, shows the REAL catalog parts + quantities for
// that zone -- computed fresh via the same verified engines the BOM itself
// uses (PanelEngine / AccessoriesEngine), not a separate approximation.
//
// This is a NAVIGATION + VISUALIZATION layer on top of the existing rule
// system, not a new quantity model: every number shown here is produced by
// calling the exact same functions app.js calls for the real BOM. Clicking a
// zone's "수식 보러가기" button jumps into the Rule Editor tab
// (RuleEditorUI.gotoCategory) pre-filtered to the relevant formulas, so a
// user can go picture -> real part -> editable formula in two clicks.
//
// Placement in the tank isn't a free user choice (it's 100% derived from
// W/L/H/N_PA), so there is no drag-to-reposition here -- clicking a zone is
// the "adjust" action, taking you to the formula that controls it.
// =============================================================================
(function (global) {
  "use strict";

  // Bottom-to-top visual stacking order for course bands (COURSE_TABLE's own
  // array order is build order, not spatial order -- see file header of
  // panel_rules.js). This ordering is illustrative only; it has no effect on
  // any calculated quantity.
  const COURSE_VISUAL_ORDER = ["LOWER_SOLO", "LOWER", "MID_LOWER", "MID_TOP", "TOP_15", "TOP_20"];

  function readGeometryInputs() {
    const num = (id, dflt) => {
      const el = document.getElementById(id);
      const v = el ? parseFloat(el.value) : NaN;
      return isNaN(v) ? dflt : v;
    };
    const val = (id, dflt) => {
      const el = document.getElementById(id);
      return el ? el.value : dflt;
    };
    return {
      w: num("tankWidth", 2),
      l1: num("tankLength1", 3),
      l2: num("tankLength2", 0),
      l3: num("tankLength3", 0),
      l4: num("tankLength4", 0),
      h: num("tankHeight", 2),
      q: parseInt(document.getElementById("tankQty") ? document.getElementById("tankQty").value : 1, 10) || 1,
      isIntReinf: val("reinfMethod", "External") === "Internal",
      boltSpec: val("boltMaterial", "2"),
      skidLen: num("skidLength", 0),
      skidType: typeof window.resolveSkidType === "function" ? window.resolveSkidType(num("tankHeight", 2), val("steelSkidOpt", "Default")) : val("steelSkidOpt", "angle75"),
      sidePanelOnly: val("sidePanelOnly", "DEFAULT") === "1x1",
    };
  }

  function lookupPartSafe(partNo) {
    // NOTE: app.js declares `partsDb` with top-level `let`, which does NOT
    // attach to `window`/`global` (unlike the RuleEngine/PanelEngine/etc.
    // objects, which explicitly assign `global.X = ...`). Classic <script>
    // tags in the same document DO share one top-level lexical scope though,
    // so a bare reference to `partsDb` here resolves correctly as long as
    // this code only runs after app.js has executed (true for all call sites
    // in this file -- they only run from click handlers or from init(),
    // which itself only runs after DOMContentLoaded).
    try {
      if (typeof partsDb !== "undefined" && Array.isArray(partsDb)) {
        return partsDb.find((p) => p.partNo === partNo) || null;
      }
    } catch (e) { /* partsDb not yet defined -- fall through */ }
    return null;
  }

  function partDisplay(partNo) {
    const found = lookupPartSafe(partNo);
    return (found && (found.nameKo || found.nameEn)) || partNo;
  }

  // ---- Compute real per-zone BOM breakdowns using the SAME engines app.js uses ----
  function computeZones(cfg) {
    const zones = {};
    if (typeof PanelEngine === "undefined" || typeof AccessoriesEngine === "undefined") return zones;

    let g, bom, catalog;
    try {
      g = PanelEngine.makeGeometry(cfg.w, cfg.l1, cfg.h, cfg.l2, cfg.l3, cfg.l4);
      bom = PanelEngine.panelBom(cfg.w, cfg.l1, cfg.h, cfg.l2, cfg.l3, cfg.l4);
      catalog = (PanelEngine.CATALOG_BY_HEIGHT || {})[String(cfg.h)] || {};
    } catch (err) {
      zones.error = err.message;
      return zones;
    }

    function rows(dict, prefix, labels) {
      return Object.keys(dict || {})
        .map((role) => {
          const qty = dict[role];
          if (!(qty > 0)) return null;
          const partNo = catalog[prefix + role] || null;
          return {
            partNo: partNo || "(카탈로그 없음)",
            partName: partNo ? partDisplay(partNo) : (labels && labels[role]) || role,
            qty: Math.round(qty * cfg.q * 100) / 100,
          };
        })
        .filter(Boolean);
    }

    // Roof & Bottom
    zones.roofBottom = {
      title: "지붕 / 바닥 (Roof & Bottom)",
      ruleCat: "panel_roofBottom",
      parts: rows(bom.roof_bottom, "roof_bottom.", global.PanelCatalog && global.PanelCatalog.ROOF_BOTTOM_LABELS),
    };

    // Side courses, in visual (bottom-to-top) order
    const courseKeyToRuleCat = {
      TOP_15: "panel_side15Top", TOP_20: "panel_side20Top", MID_TOP: "panel_midTop",
      MID_LOWER: "panel_midLower", LOWER: "panel_lower", LOWER_SOLO: "panel_lower",
      BASE_FILLER: "panel_baseFiller",
    };
    zones.courses = [];
    const presentCourses = Object.keys(bom.side || {});
    COURSE_VISUAL_ORDER.filter((c) => presentCourses.indexOf(c) !== -1).forEach((course) => {
      const catalogCourse = (global.PanelCatalog && global.PanelCatalog.CATALOG_COURSE_ALIAS[course]) || course;
      const heightLabel = (global.PanelCatalog && global.PanelCatalog.COURSE_HEIGHT_LABEL[course]) || "";
      zones.courses.push({
        key: course,
        title: "측벽 " + course + (heightLabel ? " (" + heightLabel + ")" : ""),
        ruleCat: courseKeyToRuleCat[course] || null,
        parts: rows(bom.side[course], "side." + catalogCourse + ".", global.PanelCatalog && global.PanelCatalog.SIDE_ROLE_LABELS),
      });
    });
    // BASE_FILLER isn't in bom.side's course loop the same way -- surfaced via panelBom() only when no LOWER/LOWER_SOLO course
    if (bom.side && bom.side.BASE_FILLER) {
      zones.courses.push({
        key: "BASE_FILLER", title: "패널 - 필러 (BASE_FILLER)", ruleCat: "panel_baseFiller",
        parts: rows(bom.side.BASE_FILLER, "side.LOWER.", global.PanelCatalog && global.PanelCatalog.SIDE_ROLE_LABELS),
      });
    }

    // Partition
    if (g.n_partitions > 0) {
      const partRows = [];
      Object.keys(bom.partition || {}).forEach((course) => {
        const catalogCourse = (global.PanelCatalog && global.PanelCatalog.CATALOG_COURSE_ALIAS[course]) || course;
        partRows.push.apply(partRows, rows(bom.partition[course], "partition." + catalogCourse + ".", global.PanelCatalog && global.PanelCatalog.PARTITION_ROLE_LABELS));
      });
      zones.partition = { title: "격벽 (Partition x" + g.n_partitions + ")", ruleCat: "panel_partition", parts: partRows };
    }

    // Steel Skid (real parts -- 75mm Angle / 125mm Channel / 150mm Channel-Heavy)
    if (cfg.skidType !== "none") {
      try {
        const { parts: skidParts } = AccessoriesEngine.steelSkidDetailedParts(g, cfg.skidType);
        zones.skid = {
          title: "스틸 스키드 (Steel Skid Frame)", ruleCat: "steelSkid",
          parts: skidParts.map((sp) => ({ partNo: sp.partNo, partName: partDisplay(sp.partNo), qty: sp.qty * cfg.q })),
        };
      } catch (err) {
        zones.skid = { title: "스틸 스키드 (Steel Skid Frame)", ruleCat: "steelSkid", parts: [], error: err.message };
      }
    }

    // Reinforcing (corner posts) + Tie-Rod
    try {
      const isSA4 = parseInt(cfg.boltSpec, 10) === 2;
      const { parts: reinfParts } = AccessoriesEngine.reinforcingParts(g, cfg.isIntReinf, isSA4, cfg.sidePanelOnly);
      const corner = reinfParts.map((rp) => ({ partNo: rp.partNo, partName: partDisplay(rp.partNo), qty: rp.qty * cfg.q }));
      if (!cfg.isIntReinf) {
        const tq = AccessoriesEngine.tieRodQty(g) * cfg.q;
        if (tq > 0) corner.push({ partNo: "WTR-12M300Z", partName: partDisplay("WTR-12M300Z"), qty: tq });
      } else {
        const internalTieRodEl = (typeof document !== "undefined") ? document.getElementById('internalTieRod') : null;
        const isTieRodSA4 = !internalTieRodEl || internalTieRodEl.value !== 'SS304';
        const { parts: tieRodIntParts } = AccessoriesEngine.tieRodInternalParts(g, isTieRodSA4);
        tieRodIntParts.forEach((tp) => corner.push({ partNo: tp.partNo, partName: partDisplay(tp.partNo), qty: tp.qty * cfg.q }));
      }
      zones.corner = {
        title: "외부/내부 보강재 (Reinforcing" + (cfg.isIntReinf ? " - Internal + Tie-Rod" : " - External + Tie-Rod") + ")",
        ruleCat: cfg.isIntReinf ? "reinf_int" : "reinf_ext",
        parts: corner,
      };
    } catch (err) {
      zones.corner = { title: "보강재 (Reinforcing)", ruleCat: cfg.isIntReinf ? "reinf_int" : "reinf_ext", parts: [], error: err.message };
    }

    // Bolts & Nuts -- real per-part breakdown (see AccessoriesEngine.boltsAndNutsParts)
    // NOTE: bolt formulas are edited on the "Bolt Logic & Audit" tab only
    // (boltAudit: true below), not the Rule Editor's "bolts" category (which
    // is intentionally hidden there to avoid duplicate editors) -- see
    // renderInfoPanel()'s click handler further down.
    try {
      const materialOption = parseInt(cfg.boltSpec, 10) || 2;
      const { parts: boltParts } = AccessoriesEngine.boltsAndNutsParts(g, cfg.isIntReinf, materialOption, null, cfg.sidePanelOnly);
      zones.bolts = {
        title: "볼트 & 너트 (Bolts & Nuts)", boltAudit: true,
        parts: boltParts.map((bp) => ({ partNo: bp.partNo, partName: partDisplay(bp.partNo), qty: bp.qty * cfg.q })),
      };
    } catch (err) {
      zones.bolts = { title: "볼트 & 너트 (Bolts & Nuts)", boltAudit: true, parts: [], error: err.message };
    }

    zones.geometry = g;
    return zones;
  }

  // ---- SVG rendering ----
  function buildSvg(cfg, zones) {
    const W = 640, H = 460;
    const bodyW = 300, bodyX = (W - bodyW) / 2;
    const roofH = 34, skidH = 26;
    const nBands = Math.max(1, (zones.courses || []).length);
    const bodyH = H - roofH - skidH - 40;
    const bandH = bodyH / nBands;
    const bodyTop = 20 + roofH;

    let svg = "";
    svg += '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;font-family:inherit;">';

    // Roof (trapezoid-ish cap)
    svg += zoneRect(bodyX - 14, 20, bodyW + 28, roofH, "#8fc1e3", "roofBottom", (zones.roofBottom && zones.roofBottom.title) || "지붕/바닥");

    // Side courses, top of stack = last in COURSE_VISUAL_ORDER present -> so reverse for rendering top-down
    const bandsTopDown = (zones.courses || []).slice().reverse();
    bandsTopDown.forEach((band, i) => {
      const y = bodyTop + i * bandH;
      const color = i % 2 === 0 ? "#cfe8d8" : "#bfe0cf";
      svg += zoneRect(bodyX, y, bodyW, bandH, color, "course:" + band.key, band.title);
    });

    // Corner reinforcement posts (left/right strips over the full body height)
    const cornerColor = "#f6c26b";
    svg += zoneRect(bodyX - 10, bodyTop, 10, bodyH, cornerColor, "corner", (zones.corner && zones.corner.title) || "보강재");
    svg += zoneRect(bodyX + bodyW, bodyTop, 10, bodyH, cornerColor, "corner", (zones.corner && zones.corner.title) || "보강재");

    // Partition divider(s)
    const nPa = (zones.geometry && zones.geometry.n_partitions) || 0;
    if (nPa > 0) {
      for (let i = 1; i <= nPa; i++) {
        const x = bodyX + (bodyW * i) / (nPa + 1);
        svg += '<line x1="' + x + '" y1="' + bodyTop + '" x2="' + x + '" y2="' + (bodyTop + bodyH) + '" stroke="#7a5cff" stroke-width="4" stroke-dasharray="6,4" data-zone="partition" style="cursor:pointer;"><title>' + escapeXml((zones.partition && zones.partition.title) || "Partition") + '</title></line>';
      }
    }

    // Skid frame
    svg += zoneRect(bodyX - 14, bodyTop + bodyH + 6, bodyW + 28, skidH, "#c9c9c9", "skid", (zones.skid && zones.skid.title) || "스틸 스키드");

    // Clickable Bolts & Nuts Indicator text inside SVG
    svg += '<rect x="' + (bodyX + 20) + '" y="' + (bodyTop + bodyH / 2 - 14) + '" width="80" height="28" rx="6" fill="#f03e3e" opacity="0.85" stroke="#ffffff" stroke-width="1.5" data-zone="bolts" style="cursor:pointer;"><title>All Bolts & Nuts Details</title></rect>';
    svg += '<text x="' + (bodyX + 60) + '" y="' + (bodyTop + bodyH / 2 + 4) + '" text-anchor="middle" font-size="10.5" font-weight="600" fill="#ffffff" pointer-events="none">Bolts/Washers</text>';

    svg += "</svg>";
    return svg;
  }

  function zoneRect(x, y, w, h, fill, zoneKey, titleText) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '" stroke="#8892a0" stroke-width="1" data-zone="' + zoneKey + '" style="cursor:pointer;"><title>' + escapeXml(titleText || "") + '</title></rect>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-size="11" fill="#2b3242" pointer-events="none">' + escapeXml((titleText || "").split(" (")[0]) + "</text>";
  }

  function escapeXml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- Info panel ----
  function renderInfoPanel(zoneInfo) {
    const panel = document.getElementById("visualConfigInfoPanel");
    if (!panel) return;
    if (!zoneInfo) {
      panel.innerHTML = '<div style="color:var(--text-secondary,#888);font-size:13px;padding:16px;text-align:center;">Click on an area above to view parts and quantities.</div>';
      return;
    }
    let html = '<div style="font-weight:700;font-size:14px;margin-bottom:8px;">' + escapeXml(zoneInfo.title) + "</div>";
    if (zoneInfo.error) {
      html += '<div style="color:#c0392b;font-size:12.5px;">Calculation error: ' + escapeXml(zoneInfo.error) + "</div>";
    } else if (!zoneInfo.parts || !zoneInfo.parts.length) {
      html += '<div style="color:var(--text-secondary,#888);font-size:12.5px;">No parts applicable for this zone under current dimensions.</div>';
    } else {
      html += '<table style="width:100%;border-collapse:collapse;font-size:12.5px;">' +
        '<thead><tr style="text-align:left;border-bottom:1px solid #eee;"><th style="padding:4px 6px;">Part</th><th style="padding:4px 6px;text-align:right;">Qty</th></tr></thead><tbody>';
      zoneInfo.parts.forEach((p) => {
        html += '<tr style="border-bottom:1px solid #f5f5f5;"><td style="padding:4px 6px;"><div style="font-weight:600;">' + escapeXml(p.partName) + '</div><div style="font-family:monospace;font-size:10.5px;color:#888;">' + escapeXml(p.partNo) + "</div></td>" +
          '<td style="padding:4px 6px;text-align:right;">' + p.qty + "</td></tr>";
      });
      html += "</tbody></table>";
    }
    if (zoneInfo.boltAudit) {
      html += '<button id="btnGotoBoltAudit" style="margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid var(--border-color,#ccc);background:#f4f8ff;color:#1a4d80;font-size:12.5px;cursor:pointer;"><i class="fa-solid fa-square-root-variable"></i> View Formulas in Bolt Logic & Audit</button>';
    } else if (zoneInfo.ruleCat) {
      html += '<button id="btnGotoRuleEditor" style="margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid var(--border-color,#ccc);background:#f4f8ff;color:#1a4d80;font-size:12.5px;cursor:pointer;"><i class="fa-solid fa-square-root-variable"></i> View Zone Formulas</button>';
    }
    panel.innerHTML = html;
    const boltAuditBtn = document.getElementById("btnGotoBoltAudit");
    if (boltAuditBtn) {
      boltAuditBtn.addEventListener("click", () => {
        const tabBtn = document.querySelector('.tab-btn[data-tab="tab-bolt-recipes"]');
        if (tabBtn) tabBtn.click();
      });
    }
    const btn = document.getElementById("btnGotoRuleEditor");
    if (btn) {
      btn.addEventListener("click", () => {
        if (global.RuleEditorUI) global.RuleEditorUI.gotoCategory(zoneInfo.ruleCat, "");
      });
    }
  }

  let lastZones = {};

  function render() {
    const container = document.getElementById("visualConfigDiagram");
    if (!container) return;
    const cfg = readGeometryInputs();
    let zones;
    try {
      zones = computeZones(cfg);
    } catch (err) {
      container.innerHTML = '<div style="color:#c0392b;font-size:13px;padding:20px;">Unable to render diagram: ' + escapeXml(err.message) + "</div>";
      return;
    }
    lastZones = zones;
    if (zones.error) {
      container.innerHTML = '<div style="color:#c0392b;font-size:13px;padding:20px;">Dimension error: ' + escapeXml(zones.error) + " (All dimensions must be in 0.5m increments)</div>";
      renderInfoPanel(null);
      return;
    }
    container.innerHTML = buildSvg(cfg, zones);
    renderInfoPanel(null);

    container.querySelectorAll("[data-zone]").forEach((el) => {
      el.addEventListener("click", () => {
        const zoneKey = el.getAttribute("data-zone");
        let info = null;
        if (zoneKey === "roofBottom") info = zones.roofBottom;
        else if (zoneKey === "corner") info = zones.corner;
        else if (zoneKey === "skid") info = zones.skid;
        else if (zoneKey === "partition") info = zones.partition;
        else if (zoneKey === "bolts") info = zones.bolts;
        else if (zoneKey.indexOf("course:") === 0) {
          const key = zoneKey.slice("course:".length);
          info = (zones.courses || []).find((c) => c.key === key) || null;
        }
        renderInfoPanel(info);
      });
    });
  }

  function init() {
    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-visual-config"]');
    if (tabBtn) tabBtn.addEventListener("click", render);
    // Render once eagerly too, so the tab isn't blank if opened before any click handler fires.
    try { render(); } catch (e) { /* inputs may not exist yet on some pages */ }
  }

  global.VisualConfigUI = { init: init, render: render };
})(typeof window !== "undefined" ? window : globalThis);
