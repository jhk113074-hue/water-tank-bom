// =============================================================================
// WATANI GRP Water Tank -- STEEL ACCESSORIES tab ("철자재 도면 ↔ DB ↔ 수식")
// =============================================================================
// Renders the reinforcing REFERENCE DRAWINGS (the height-by-height side/
// partition panel elevations that used to live only in an Excel sheet) as
// data-driven SVG, and wires every drawn member to the two things a
// maintainer actually needs:
//
//   1. the real catalog part  -> parts_db.json (PART MASTER DB)
//   2. the formula that makes its quantity
//      -> AccessoriesRules.reinforcing.<ruleSet>.rows[<rowId>]
//
// Click a member on the drawing and you get its DB record, its live quantity
// for the CURRENT tank configuration, and an inline editor for its formula
// that writes through RuleEditorUI.setFieldFormula() -- i.e. the exact same
// override store (localStorage `water_tank_rule_overrides_v1` + Firestore
// `settings/ruleOverrides`) that the Rule Editor and the Steel Reinforcing
// Logic tab already use. There is no second copy of any rule here.
//
// THIS FILE NEVER CHANGES A BOM QUANTITY BY ITSELF. Every number it shows is
// produced by AccessoriesEngine.reinforcingRowDetail() -- the same verified
// engine app.js uses for the real BOM. The drawing is a navigation and
// VERIFICATION layer: because each member declares which formula row it
// belongs to, the tab can cross-check the picture against the formulas and
// report both directions of drift (drawn but zero qty / qty but not drawn).
//
// The drawing itself is data: steel_accessories_layout.json (shipped default,
// git-managed) plus a user override object stored in localStorage and synced
// to Firestore `settings/steelAccessoriesLayout`. "도면 편집" edits the
// override; "JSON 내보내기" produces a merged file to commit back over the
// shipped default, so git stays the source of truth.
//
// -----------------------------------------------------------------------------
// PER-HEIGHT SHEETS (layout version 2)
// -----------------------------------------------------------------------------
// The original YS ACC deck (Internal_Reinforcement_Assembly.pptx, section 4
// "Panel Configuration") is organised as ONE SHEET PER HEIGHT GRADE, each
// showing two views of the same panel -- "Outside of Partition" / "Inside of
// Partition" (or "Front Side" / "Back Side") -- next to a part legend whose
// contents change with the height. The "-1"/"-2" suffixes on the 3.5mH and 4mH
// slides are NOT variants: they are the same two views split across two slides
// because the legend outgrew one page.
//
// So the model here is (diagram x height) -> { views: [...] }, and this file
// renders exactly that:
//
//   * `diagram.views[]`     the outside/inside faces (a DIFFERENT axis from
//                           `diagram.layers[]`, which is 보강재 vs 브라켓)
//   * `member.view`         which face a member sits on
//   * `diagram.heightSpecs` per-height definitions, keyed by height string
//   * `member.scale`        how many times ONE drawn instance occurs in the
//                           whole tank -- see qtyDrawnByPart() for why a raw
//                           count of drawn elements is not comparable to a
//                           formula row's output
//
// A height is either "auto" (baked on the fly from the parametric `members[]`,
// so it keeps tracking edits to the shared definition) or "manual" (detached:
// its member list is stored explicitly with literal coordinates, and the other
// eight heights are unaffected by edits to it). A height detaches on its first
// edit. Every field above is OPTIONAL -- a version 1 file with none of them
// loads and renders exactly as before.
// =============================================================================
(function (global) {
  "use strict";

  const LAYOUT_URL = "steel_accessories_layout.json";
  const STORAGE_KEY = "water_tank_steel_accessories_layout_v1";
  const FIRESTORE_DOC = "steelAccessoriesLayout";

  const ALL_HEIGHTS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
  const DEFAULT_COLOR = "#64748b";
  const HEIGHTSPEC_PREFIX = "__heightspec__::";   // + diagramId + "::" + height

  let layout = null;          // shipped default (from LAYOUT_URL)
  let overrides = {};         // "diagramId::memberId" -> partial member  |  "__added__" -> [members]
  let dbRef = null;
  let currentDiagramId = null;
  let viewMode = "sheet";     // "sheet" = one height per sheet, "overview" = every height side by side
  let currentHeight = null;   // selected height string in sheet mode (null = follow BOM INPUT)
  let selectedMemberId = null;
  let editMode = false;
  let loadError = null;
  let renderCtx = {};         // current render's diagram/members/etc for delegated handlers
  let delegatesWired = false; // host-level listeners are attached exactly once
  let auditCache = { key: null, value: null };
  let overrideGeneration = 0; // bumped on every override write, invalidates auditCache

  // ---------------------------------------------------------------------------
  // Small shared helpers
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function num(id, dflt) {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? dflt : v;
  }

  function val(id, dflt) {
    const el = document.getElementById(id);
    return el ? el.value : dflt;
  }

  // Same note as visual_config.js: app.js declares `partsDb` with a top-level
  // `let`, which does not attach to window -- but classic <script> tags share
  // one top-level lexical scope, so a bare reference resolves once app.js ran.
  // If app.js aborted before assigning it the bare name is still in its TDZ
  // and throws, so fall back to an explicitly published global.
  function allParts() {
    try {
      if (typeof partsDb !== "undefined" && Array.isArray(partsDb)) return partsDb;
    } catch (e) { /* TDZ -- app.js did not finish */ }
    return Array.isArray(global.partsDb) ? global.partsDb : null;
  }

  function lookupPart(partNo) {
    if (!partNo) return null;
    const db = allParts();
    return (db && db.find((p) => p.partNo === partNo)) || null;
  }

  function readConfig() {
    return {
      w: num("tankWidth", 2),
      l1: num("tankLength1", 3),
      l2: num("tankLength2", 0),
      l3: num("tankLength3", 0),
      l4: num("tankLength4", 0),
      h: num("tankHeight", 2),
      isIntReinf: val("reinfMethod", "External") === "Internal",
      isSA4: parseInt(val("boltMaterial", "2"), 10) === 2,
      sidePanelOnly: val("sidePanelOnly", "DEFAULT") === "1x1",
      partitionPanelOnly: val("partitionPanelOnly", "DEFAULT") === "1x1",
    };
  }

  // ---------------------------------------------------------------------------
  // Layout: shipped defaults + user overrides
  // ---------------------------------------------------------------------------
  function loadLocalOverrides() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("[SteelAccessories] localStorage 불러오기 실패:", e);
      return {};
    }
  }

  function persistOverrides() {
    overrideGeneration++;
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      console.error("[SteelAccessories] localStorage 저장 실패:", e);
    }
    if (dbRef) {
      dbRef.collection("settings").doc(FIRESTORE_DOC)
        .set({ overrides: overrides, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(function (err) {
          console.warn("[SteelAccessories] Firestore 도면 오버라이드 저장 실패 (localStorage에는 저장됨):", err);
        });
    }
  }

  function syncFromFirestore(db) {
    if (!db) return Promise.resolve();
    return db.collection("settings").doc(FIRESTORE_DOC).get().then(function (doc) {
      if (!doc.exists) return;
      const remote = (doc.data() || {}).overrides || {};
      overrides = Object.assign({}, overrides, remote);
      overrideGeneration++;
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      } catch (e) { /* ignore */ }
      render();
    }).catch(function (err) {
      console.warn("[SteelAccessories] Firestore 도면 오버라이드 불러오기 실패, localStorage만 사용:", err);
    });
  }

  // Merge shipped member + override patch. `__deleted__` hides a shipped member;
  // members added in edit mode live under overrides["__added__::" + diagramId].
  function effectiveMembers(diagram) {
    const out = [];
    (diagram.members || []).forEach(function (m) {
      const patch = overrides[diagram.id + "::" + m.memberId];
      if (patch && patch.__deleted__) return;
      out.push(patch ? Object.assign({}, m, patch) : m);
    });
    const added = overrides["__added__::" + diagram.id];
    if (Array.isArray(added)) added.forEach(function (m) { out.push(Object.assign({ isAdded: true }, m)); });
    return out;
  }

  // Edit ONE height's copy of a member. Detaches the height on first use, so
  // the other grades keep following the shared parametric definition. This is
  // the write path for every edit made on a sheet.
  function patchHeightMember(diagram, hStr, memberId, patch) {
    const list = detachHeight(diagram, hStr);
    const hit = list.find(function (m) { return m.memberId === memberId; });
    if (!hit) return false;
    Object.assign(hit, patch);
    persistOverrides();
    return true;
  }

  function patchMember(diagramId, memberId, patch) {
    const addedKey = "__added__::" + diagramId;
    const added = overrides[addedKey];
    if (Array.isArray(added)) {
      const hit = added.find(function (m) { return m.memberId === memberId; });
      if (hit) { Object.assign(hit, patch); persistOverrides(); return; }
    }
    const key = diagramId + "::" + memberId;
    overrides[key] = Object.assign({}, overrides[key] || {}, patch);
    persistOverrides();
  }

  // Which row of the sheet a member belongs to. The original drawings put the
  // reinforcing bars and the bracket layout on two SEPARATE rows of panel
  // elevations (the "1.0mH … 5.0mH" captions repeat under each), so the tab
  // renders one row per layer rather than stacking both on one panel.
  function memberLayer(m) {
    return m.layer || (m.kindTag === "bracket" ? "bracket" : "bar");
  }

  function diagramLayers(diagram) {
    if (Array.isArray(diagram.layers) && diagram.layers.length) return diagram.layers;
    return [{ id: null, title: null }];   // single-row diagram (partition sheets)
  }

  // The outside/inside faces of the panel. Orthogonal to layers: a member is
  // e.g. "a bar on the outside face" or "a bracket on the inside face". A v1
  // file has no `views`, so everything collapses onto one unnamed face.
  function diagramViews(diagram) {
    if (Array.isArray(diagram.views) && diagram.views.length) return diagram.views;
    return [{ id: null, title: null }];
  }

  function memberView(m) {
    return m.view || null;
  }

  function diagramHeights(diagram) {
    return diagram.heights || ALL_HEIGHTS;
  }

  function getDiagram(id) {
    if (!layout) return null;
    return (layout.diagrams || []).find(function (d) { return d.id === id; }) || null;
  }

  // ---------------------------------------------------------------------------
  // Per-height definitions
  // ---------------------------------------------------------------------------
  // A height spec is { mode: "auto" | "manual", members?: [...], sheetTitle? }.
  // Shipped specs live on the diagram; user edits live in the same override
  // blob as member patches, under a distinct key prefix so the two schemes
  // cannot collide.
  function heightSpecKey(diagramId, hStr) {
    return HEIGHTSPEC_PREFIX + diagramId + "::" + hStr;
  }

  function effectiveHeightSpec(diagram, hStr) {
    const ov = overrides[heightSpecKey(diagram.id, String(hStr))];
    if (ov) return ov;
    const shipped = (diagram.heightSpecs || {})[String(hStr)];
    return shipped || null;
  }

  function heightSpecMode(diagram, hStr) {
    const spec = effectiveHeightSpec(diagram, hStr);
    return spec && spec.mode === "manual" && Array.isArray(spec.members) ? "manual" : "auto";
  }

  // Resolve every coordinate of a geom to a literal number at one height, so a
  // detached height can be dragged around without a formula string silently
  // swallowing the move (see the note on isDraggableCoord below).
  function bakeGeom(g, scope, cols) {
    if (!g) return {};
    const out = Object.assign({}, g);
    const n = function (k, dflt) { if (out[k] !== undefined) out[k] = round2(coord(out[k], scope, dflt)); };
    if (g.kind === "h") { n("y", 0); n("x1", 0); n("x2", cols); }
    else if (g.kind === "v") { n("x", 0); n("y1", 0); n("y2", scope.H_O); }
    else if (g.kind === "rect") { n("x1", 0); n("x2", cols); n("y", 0); n("h", 1); }
    else if (g.kind === "marker") {
      if (Array.isArray(out.xs)) out.xs = out.xs.map(function (v) { return round2(coord(v, scope, 0)); });
      else n("x", cols / 2);
      n("yFrom", 1); n("yStep", 1); n("yTo", scope.H_O - 1);
    }
    return out;
  }

  // Bake the parametric member list into a concrete list for ONE height.
  // This is what an "auto" height renders, and the seed a height detaches to.
  function bakeHeightSpec(diagram, hStr) {
    const scope = heightScope(hStr);
    const cols = diagram.cols || 3;
    return effectiveMembers(diagram)
      .filter(function (m) { return memberAppearsAt(m, hStr); })
      .map(function (m) {
        const out = Object.assign({}, m);
        delete out.heights;              // the height key IS the height now
        out.layer = memberLayer(m);
        out.geom = bakeGeom(m.geom, scope, cols);
        return out;
      });
  }

  // THE accessor. Every renderer/audit path goes through this, so none of them
  // needs to know whether a height is auto or manual -- and coordinates handed
  // out here are always literal numbers.
  function heightMembers(diagram, hStr) {
    const spec = effectiveHeightSpec(diagram, hStr);
    if (spec && spec.mode === "manual" && Array.isArray(spec.members)) return spec.members;
    return bakeHeightSpec(diagram, hStr);
  }

  function writeHeightSpec(diagramId, hStr, spec) {
    overrides[heightSpecKey(diagramId, String(hStr))] = spec;
    persistOverrides();
  }

  // First edit on an "auto" height freezes the baked list as its own definition.
  // Returns the (now guaranteed manual) member array, ready to be mutated.
  function detachHeight(diagram, hStr) {
    if (heightSpecMode(diagram, hStr) === "manual") {
      return effectiveHeightSpec(diagram, hStr).members;
    }
    const members = bakeHeightSpec(diagram, hStr);
    const shipped = (diagram.heightSpecs || {})[String(hStr)] || {};
    writeHeightSpec(diagram.id, hStr, {
      mode: "manual",
      sheetTitle: shipped.sheetTitle || null,
      members: members,
    });
    return effectiveHeightSpec(diagram, hStr).members;
  }

  function resetHeight(diagram, hStr) {
    delete overrides[heightSpecKey(diagram.id, String(hStr))];
    // A shipped manual spec would come straight back, so mark it auto instead
    // of leaving the user unable to undo.
    const shipped = (diagram.heightSpecs || {})[String(hStr)];
    if (shipped && shipped.mode === "manual") {
      overrides[heightSpecKey(diagram.id, String(hStr))] = { mode: "auto" };
    }
    persistOverrides();
  }

  // Copy one height's definition onto another. Coordinates are copied VERBATIM
  // -- they were baked at `fromH`, and whether a given bar should keep its
  // absolute y (bottom-anchored) or follow the panel top (top-anchored) is a
  // judgement only the drawing owner can make. The UI says so before copying.
  function copyHeightSpec(diagram, fromH, toH) {
    const members = JSON.parse(JSON.stringify(heightMembers(diagram, fromH)));
    writeHeightSpec(diagram.id, toH, { mode: "manual", members: members, copiedFrom: String(fromH) });
  }

  // ---------------------------------------------------------------------------
  // Bindings: member -> formula row + resolved part number + live quantity
  // ---------------------------------------------------------------------------
  function ruleRowsFor(diagram) {
    const AR = global.AccessoriesRules;
    if (!AR || !AR.reinforcing) return [];
    const set = AR.reinforcing[diagram.ruleSet];
    return (set && set.rows) || [];
  }

  function findRule(diagram, rowId) {
    if (!rowId) return null;
    return ruleRowsFor(diagram).find(function (r) { return r.id === rowId; }) || null;
  }

  // Which table inside the rule editor's category holds the quantity rows.
  // For reinf_ext/reinf_int that is table 1 (table 0 is the intermediates),
  // which this file used to hardcode -- derive it instead so a category that
  // grows a table does not silently write into the wrong one.
  function rowsTableIndex(diagram) {
    const AR = global.AccessoriesRules;
    const set = AR && AR.reinforcing && AR.reinforcing[diagram.ruleSet];
    return set && Array.isArray(set.intermediates) ? 1 : 0;
  }

  // Live per-row {value, partNo, formula} keyed by row id. Uses the same engine
  // call as reinforcing_audit.js / the BOM.
  //
  // `hOverride` swaps ONLY the tank height, keeping every other configured
  // dimension: that is what makes a per-height sheet comparable to its formula
  // row ("if this tank were built at 2.5mH, how many of this part?"). Omit it
  // for the real, currently-configured quantity.
  function rowDetailMap(cfg, diagram, hOverride) {
    const map = {};
    if (typeof PanelEngine === "undefined" || typeof AccessoriesEngine === "undefined") return map;
    const h = hOverride == null ? cfg.h : parseFloat(hOverride);
    try {
      const g = PanelEngine.makeGeometry(cfg.w, cfg.l1, h, cfg.l2, cfg.l3, cfg.l4);
      const isInt = diagram.ruleSet === "internal";
      AccessoriesEngine.reinforcingRowDetail(g, isInt, cfg.isSA4, cfg.sidePanelOnly)
        .forEach(function (d) { map[d.id] = d; });
    } catch (e) {
      console.warn("[SteelAccessories] reinforcingRowDetail 실패:", e);
    }
    return map;
  }

  // partNo shown for a member: explicit override wins, else the row's own
  // resolved catalog number (which already applies the SA2/SA4 bolt-spec rule).
  function memberPartNo(member, detail) {
    if (member.partNo) return member.partNo;
    return (detail && detail.partNo) || null;
  }

  // ---------------------------------------------------------------------------
  // Drawing-derived quantity ("도면 기준 수량")
  // ---------------------------------------------------------------------------
  // WHY THIS IS NOT JUST A COUNT. The sheet is a STANDARD-ARRANGEMENT REFERENCE
  // panel of `cols` (3) bays -- it is not the tank. A formula row, meanwhile,
  // produces a WHOLE-TANK quantity out of W_C/W_F/L_C/L_F/N_PA/perim/... So
  // counting drawn elements and comparing that to a row's value would be
  // comparing a picture to a building.
  //
  // The bridge is `member.scale`: a formula string saying how many times ONE
  // drawn instance occurs in the whole tank, evaluated in the SAME scope the
  // quantity engine builds. A member with no `scale` is reported as 미산정 --
  // deliberately NOT counted as zero, because a confidently wrong comparison is
  // worse than an obviously incomplete one.
  // `hOverride` builds the scope as if the tank were this height -- matching
  // rowDetailMap(cfg, diagram, hOverride), so the two sides of the comparison
  // are always evaluated under identical assumptions. Intermediates are
  // recomputed rather than patched afterwards, so a ruleset whose intermediates
  // DO depend on height stays correct.
  function engineScope(cfg, diagram, hOverride) {
    if (typeof PanelEngine === "undefined" || !global.RuleEngine) return null;
    const h = hOverride == null ? cfg.h : parseFloat(hOverride);
    try {
      const g = PanelEngine.makeGeometry(cfg.w, cfg.l1, h, cfg.l2, cfg.l3, cfg.l4);
      const base = {
        W_C: g.W.whole, W_F: g.W.half,
        L1_C: g.L1.whole, L1_F: g.L1.half, L2_C: g.L2.whole, L2_F: g.L2.half,
        L3_C: g.L3.whole, L3_F: g.L3.half, L4_C: g.L4.whole, L4_F: g.L4.half,
        L_C: g.L_C_sum, L_F: g.L_F_sum,
        H_O: g.H.value, H_C: g.H.whole, H_F: g.H.half,
        N_PA: g.n_partitions, L2_O: g.L2.value,
        S_1M: cfg.sidePanelOnly ? 1 : 0,
      };
      const AR = global.AccessoriesRules;
      const rules = AR && AR.reinforcing && AR.reinforcing[diagram.ruleSet];
      if (rules && rules.intermediates) {
        return global.RuleEngine.withIntermediates(rules.intermediates, base);
      }
      return base;
    } catch (e) {
      console.warn("[SteelAccessories] engineScope 실패:", e);
      return null;
    }
  }

  // How many physical elements one member entry actually puts on the sheet.
  // A bar is one element, but a `marker` is a PATTERN: it stamps a bracket at
  // every x in `xs` for every course from yFrom to yTo. Counting that as "1"
  // would make every bracket comparison wrong by the course count, so the
  // multiplier is per DRAWN ELEMENT, not per member entry.
  function memberInstanceCount(m, hStr) {
    const g = m.geom || {};
    if (g.kind !== "marker") return 1;
    const scope = heightScope(hStr);
    const xs = Array.isArray(g.xs) ? g.xs.length : 1;
    const yFrom = coord(g.yFrom, scope, 1);
    const yStep = coord(g.yStep, scope, 1) || 1;
    const yTo = coord(g.yTo, scope, scope.H_O - 1);
    let steps = 0;
    for (let y = yFrom; y <= yTo + 0.001; y += yStep) steps++;
    return Math.max(0, xs * steps);
  }

  // -> { byPart: { partNo: {qty, instances, unscaled} }, hasUnscaled }
  // `unscaled` counts instances with no `scale`; their qty is NOT guessed.
  function qtyDrawnByPart(members, detailMap, scope, hStr) {
    const byPart = {};
    let hasUnscaled = false;
    members.forEach(function (m) {
      const detail = m.rowId ? detailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail) || m.aliasLabel || m.memberId;
      if (!byPart[partNo]) byPart[partNo] = { qty: 0, instances: 0, unscaled: 0 };
      const slot = byPart[partNo];
      const n = memberInstanceCount(m, hStr);
      slot.instances += n;
      const expr = m.scale;
      if (expr == null || String(expr).trim() === "" || !scope) {
        slot.unscaled += n;
        hasUnscaled = true;
        return;
      }
      try {
        const v = global.RuleEngine.evaluate(String(expr), scope);
        if (typeof v === "number" && isFinite(v)) slot.qty += v * n;
        else { slot.unscaled += n; hasUnscaled = true; }
      } catch (e) {
        slot.unscaled += n;
        hasUnscaled = true;
      }
    });
    return { byPart: byPart, hasUnscaled: hasUnscaled };
  }

  // Formula-side quantity for the same grouping: rows sharing a resolved part
  // number are summed, so both sides of the comparison are "qty of this part".
  function qtyFormulaByPart(diagram, detailMap, drawnPartNos) {
    const byPart = {};
    Object.keys(detailMap).forEach(function (rowId) {
      const d = detailMap[rowId];
      if (!d || !d.partNo) return;
      if (drawnPartNos && drawnPartNos.indexOf(d.partNo) === -1) return;
      if (!byPart[d.partNo]) byPart[d.partNo] = { qty: 0, rowIds: [] };
      byPart[d.partNo].qty += d.value || 0;
      byPart[d.partNo].rowIds.push(rowId);
    });
    return byPart;
  }

  function memberColor(member, partNo) {
    if (member.color) return member.color;
    const colors = (layout && layout.colors) || {};
    if (partNo && colors[partNo]) return colors[partNo];
    // material-prefix parts: WFB-0950SA4 -> try the WFB-0950 key
    if (partNo) {
      const base = partNo.replace(/SA[24]$/, "");
      if (colors[base]) return colors[base];
    }
    if (member.kindTag === "bracket") return colors.bracket || DEFAULT_COLOR;
    return DEFAULT_COLOR;
  }

  // ---------------------------------------------------------------------------
  // Geometry: evaluate a coordinate that may be a number or a formula string
  // ---------------------------------------------------------------------------
  function coord(v, scope, dflt) {
    if (v === undefined || v === null) return dflt;
    if (typeof v === "number") return v;
    try {
      return global.RuleEngine ? global.RuleEngine.evaluate(String(v), scope) : dflt;
    } catch (e) {
      return dflt;
    }
  }

  function heightScope(hStr) {
    const H_O = parseFloat(hStr);
    const H_C = Math.floor(H_O);
    const H_F = H_O % 1 === 0.5 ? 1 : 0;
    return { H_O: H_O, H_C: H_C, H_F: H_F };
  }

  function memberAppearsAt(member, hStr) {
    if (!Array.isArray(member.heights)) return true;
    return member.heights.indexOf(String(hStr)) !== -1;
  }

  // ---------------------------------------------------------------------------
  // Panel courses: where panel actually meets panel
  // ---------------------------------------------------------------------------
  // Wall panels come in 1x1, 1x1.5, 1x2 and 1x0.5 m, and a height grade is
  // built from a specific STACK of them (panel_rules.js COURSE_TABLE, listed
  // top-course first). Steel accessories are installed AT THE JOINTS between
  // panels, so the sheet has to draw the real seams -- not a 1 m rule.
  //
  // This matters: 3mH is TOP_20(2m) over LOWER(1m), i.e. exactly ONE horizontal
  // joint at y=1. Drawing a line every metre invented a second joint at y=2
  // that no panel edge corresponds to.
  const COURSE_HEIGHT_M = {
    LOWER_SOLO: 1, LOWER: 1, MID_LOWER: 1, MID_TOP: 1, TOP_15: 1.5, TOP_20: 2,
  };

  // -> ascending y positions of the horizontal panel joints, excluding 0 and
  // the top edge. Falls back to a 1 m rule when the height grade is unknown.
  function courseSeams(hStr) {
    const PR = global.PanelRules;
    const table = PR && PR.COURSE_TABLE;
    const courses = table && table[String(hStr)];
    const H = parseFloat(hStr);
    if (!Array.isArray(courses)) {
      const out = [];
      for (let y = 1; y < H - 0.001; y += 1) out.push(y);
      return out;
    }
    // COURSE_TABLE lists the top course first; stack from the bottom up.
    const bottomUp = courses.slice().reverse();
    const seams = [];
    let y = 0;
    for (let i = 0; i < bottomUp.length - 1; i++) {
      y += COURSE_HEIGHT_M[bottomUp[i]] || 1;
      if (y > 0.001 && y < H - 0.001) seams.push(round2(y));
    }
    return seams;
  }

  // Every y a member may legitimately sit at: the floor, each panel joint, and
  // the top of the wall. Used to snap dragging onto real joints.
  function snapYsFor(hStr) {
    return [0].concat(courseSeams(hStr), [parseFloat(hStr)]);
  }

  // ---------------------------------------------------------------------------
  // SVG rendering of ONE height panel
  // ---------------------------------------------------------------------------
  function buildPanelSvg(diagram, hStr, opts) {
    const o = opts || {};
    const pxPerM = o.pxPerM || 40;
    const cols = diagram.cols || 3;
    const scope = heightScope(hStr);
    const H = scope.H_O;

    const padL = 10, padR = 10, padT = 14, padB = 22;
    const w = cols * pxPerM, h = H * pxPerM;
    const svgW = w + padL + padR, svgH = h + padT + padB;
    const X = (x) => padL + x * pxPerM;
    const Y = (y) => padT + (H - y) * pxPerM;   // origin bottom-left

    // data-px / data-h let the drag handler convert pointer pixels back into
    // drawing metres without re-deriving the scale.
    let s = '<svg class="sa-panel-svg" viewBox="0 0 ' + svgW + ' ' + svgH + '" width="' + svgW + '" height="' + svgH +
      '" data-px="' + pxPerM + '" data-h="' + H + '" xmlns="http://www.w3.org/2000/svg">';

    // Panel outline + 1m grid (columns and course seams), like the Excel sheet
    s += '<rect x="' + X(0) + '" y="' + Y(H) + '" width="' + w + '" height="' + h + '" fill="#ffffff" stroke="#111827" stroke-width="1"/>';
    for (let c = 1; c < cols; c++) {
      s += '<line x1="' + X(c) + '" y1="' + Y(0) + '" x2="' + X(c) + '" y2="' + Y(H) + '" stroke="#111827" stroke-width="0.7"/>';
    }
    // Horizontal PANEL JOINTS for this height grade (not a 1 m rule) -- this is
    // where steel accessories are actually installed.
    courseSeams(hStr).forEach(function (y) {
      s += '<line x1="' + X(0) + '" y1="' + Y(y) + '" x2="' + X(cols) + '" y2="' + Y(y) +
        '" stroke="#111827" stroke-width="0.7"/>';
    });

    // `o.members` is already the resolved list for THIS height (heightMembers),
    // so there is no per-height visibility test left to do here -- only the
    // layer/view split of the sheet.
    const members = (o.members || []).filter(function (m) {
      if (o.layer && memberLayer(m) !== o.layer) return false;
      if (o.view && memberView(m) !== o.view) return false;
      return true;
    });
    const detailMap = o.detailMap || {};
    const bracketSeen = {};   // "x,y" -> how many bracket icons already drawn there

    members.forEach(function (m) {
      const g = m.geom || {};
      const detail = m.rowId ? detailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail);
      const color = memberColor(m, partNo);
      const selected = selectedMemberId === m.memberId;
      const sw = selected ? 5 : 3;
      const tip = esc((partNo || m.aliasLabel || m.memberId) + (m.rowId ? "  [" + m.rowId + "]" : "  [수식 미연결]"));
      const attrs = ' data-member-id="' + esc(m.memberId) + '" style="cursor:pointer;"' +
        (selected ? ' opacity="1"' : '');

      function line(x1, y1, x2, y2) {
        return '<line x1="' + X(x1) + '" y1="' + Y(y1) + '" x2="' + X(x2) + '" y2="' + Y(y2) +
          '" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="square"' + attrs +
          '><title>' + tip + '</title></line>';
      }

      if (g.kind === "h") {
        const y = coord(g.y, scope, 0);
        if (y < -0.01 || y > H + 0.01) return;
        s += line(coord(g.x1, scope, 0), y, coord(g.x2, scope, cols), y);
      } else if (g.kind === "v") {
        const y1 = coord(g.y1, scope, 0), y2 = coord(g.y2, scope, H);
        if (y2 < -0.01 || y1 > H + 0.01) return;
        const x = coord(g.x, scope, 0);
        s += line(x, Math.max(0, y1), x, Math.min(H, y2));
      } else if (g.kind === "rect") {
        const x1 = coord(g.x1, scope, 0), x2 = coord(g.x2, scope, cols);
        const y = coord(g.y, scope, 0), hh = coord(g.h, scope, 1);
        const yTop = Math.min(H, y + hh), yBot = Math.max(0, y);
        if (yTop <= 0) return;
        const open = g.open || "bottom";
        s += line(x1, yBot, x1, yTop);                 // left leg
        s += line(x2, yBot, x2, yTop);                 // right leg
        if (open !== "top") s += line(x1, yTop, x2, yTop);
        if (open !== "bottom") s += line(x1, yBot, x2, yBot);
      } else if (g.kind === "marker") {
        // Bracket glyph, drawn the way the original sheet draws it: a small
        // 2-hole plate with a diagonal hatch. Several part numbers can sit on
        // the same panel joint, so they stack DOWNWARD from the node instead
        // of fanning out sideways (which used to make the row look nothing
        // like the drawing).
        const xs = Array.isArray(g.xs) ? g.xs : [coord(g.x, scope, cols / 2)];
        const yFrom = coord(g.yFrom, scope, 1);
        const yStep = coord(g.yStep, scope, 1) || 1;
        const yTo = coord(g.yTo, scope, H - 1);
        const bw = 13, bh = 8;
        for (let y = yFrom; y <= yTo + 0.001; y += yStep) {
          xs.forEach(function (xRaw) {
            const x = coord(xRaw, scope, 0);
            const key = x + "," + y;
            const idx = bracketSeen[key] || 0;
            bracketSeen[key] = idx + 1;
            const cx = X(x);
            const cy = Y(y) + idx * (bh + 2);
            const sw2 = selected ? 2.2 : 1.2;
            s += '<g' + attrs + '><title>' + tip + '</title>' +
              '<rect x="' + (cx - bw / 2) + '" y="' + (cy - bh / 2) + '" width="' + bw + '" height="' + bh +
              '" rx="1" fill="#ffffff" stroke="' + color + '" stroke-width="' + sw2 + '"/>' +
              '<circle cx="' + (cx - bw / 4) + '" cy="' + cy + '" r="1.3" fill="' + color + '"/>' +
              '<circle cx="' + (cx + bw / 4) + '" cy="' + cy + '" r="1.3" fill="' + color + '"/>' +
              '<line x1="' + (cx + bw / 2) + '" y1="' + (cy - bh / 2) + '" x2="' + (cx + bw / 2 + 7) + '" y2="' + (cy - bh / 2 - 7) +
              '" stroke="' + color + '" stroke-width="0.9" opacity="0.65"/>' +
              "</g>";
          });
        }
      }
    });

    // Height caption, matching the original sheet's "3.5mH" labels
    s += '<text x="' + (svgW / 2) + '" y="' + (svgH - 6) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">' +
      esc(hStr) + 'mH</text>';
    s += "</svg>";
    return s;
  }

  // A part number's material family, used to split a legend the way the
  // original partition sheets do: HDG/plain "…Z / …ZP / …ZL" in one block,
  // stainless "…SA2 / …SA4" in another.
  function partFamily(partNo) {
    return /SA[24]$/.test(String(partNo)) ? "sa" : "z";
  }

  // Compact legend used by the OVERVIEW (all heights at a glance) mode.
  function buildLegend(diagram, hStr, members, detailMap, layer) {
    const seen = {};
    const items = [];
    members.forEach(function (m) {
      if (layer && memberLayer(m) !== layer) return;
      const detail = m.rowId ? detailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail) || m.aliasLabel || m.memberId;
      if (seen[partNo]) return;
      seen[partNo] = true;
      items.push({ partNo: partNo, color: memberColor(m, partNo), memberId: m.memberId, rowId: m.rowId });
    });
    if (!items.length) return '<div class="sa-legend-empty">-</div>';

    function block(list) {
      return list.map(function (it) {
        const p = lookupPart(it.partNo);
        const title = esc(it.partNo + (p ? " — " + (p.nameKo || p.nameEn || "") : " (DB 미등록)"));
        return '<div class="sa-legend-row" data-member-id="' + esc(it.memberId) + '" title="' + title + '">' +
          '<span class="sa-legend-swatch" style="background:' + it.color + '"></span>' +
          '<span class="sa-legend-label' + (p ? "" : " sa-missing") + '">' + esc(it.partNo) + '</span>' +
          "</div>";
      }).join("");
    }

    const z = items.filter(function (it) { return partFamily(it.partNo) === "z"; });
    const sa = items.filter(function (it) { return partFamily(it.partNo) === "sa"; });
    // Two blocks only when both families are present -- matching the original
    // partition sheets, which list the Z/ZP parts above the SA2/SA4 parts.
    if (z.length && sa.length) {
      return '<div class="sa-legend">' + block(z) + '<div class="sa-legend-gap"></div>' + block(sa) + "</div>";
    }
    return '<div class="sa-legend">' + block(items) + "</div>";
  }

  // ---------------------------------------------------------------------------
  // Sheet legend = the PPT's part list, plus the drawing/formula comparison
  // ---------------------------------------------------------------------------
  // One row per distinct part on this height's sheet:
  //   도면 기준  = Σ scale over the drawn instances (미산정 when unscaled)
  //   수식 기준  = Σ of the formula rows resolving to the same part, evaluated
  //               at THIS sheet's height
  function buildSheetTable(diagram, hStr, members, hDetailMap, cfg) {
    const scope = engineScope(cfg, diagram, hStr);
    const rollup = qtyDrawnByPart(members, hDetailMap, scope, hStr);

    // Group members by the part they resolve to, keeping a representative for
    // colour/click-through and collecting the scale expressions in play.
    const groups = {};
    members.forEach(function (m) {
      const detail = m.rowId ? hDetailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail) || m.aliasLabel || m.memberId;
      if (!groups[partNo]) {
        groups[partNo] = { partNo: partNo, color: memberColor(m, partNo), memberId: m.memberId, rowIds: [], scales: [], alias: m.aliasLabel || null };
      }
      const g = groups[partNo];
      if (m.rowId && g.rowIds.indexOf(m.rowId) === -1) g.rowIds.push(m.rowId);
      const sc = m.scale == null ? "" : String(m.scale).trim();
      if (sc && g.scales.indexOf(sc) === -1) g.scales.push(sc);
    });

    const partNos = Object.keys(groups);
    if (!partNos.length) {
      return '<div class="sa-sheet-empty">이 높이에는 정의된 철자재가 없습니다.</div>';
    }
    const formulaByPart = qtyFormulaByPart(diagram, hDetailMap, partNos);

    let html = '<div class="sa-sheet-legend">';
    html += '<div class="sa-sheet-legend-head">부재 범례 · 수량 대조 <span class="sa-sheet-h">' + esc(hStr) + 'mH</span></div>';
    html += '<table class="sa-cmp"><thead><tr>' +
      "<th></th><th>품번</th><th>배치</th><th>도면 수량</th><th>수식 수량</th><th></th>" +
      "</tr></thead><tbody>";

    let totalQty = 0, allScaled = true;

    partNos.forEach(function (pn) {
      const g = groups[pn];
      const draw = rollup.byPart[pn] || { qty: 0, instances: 0, unscaled: 0 };
      const fml = formulaByPart[pn];
      const fmlQty = fml ? Math.round(fml.qty) : null;
      const p = lookupPart(pn);

      let drawnCell, verdict, verdictCls;
      if (draw.unscaled > 0) {
        drawnCell = '<span class="sa-unscaled">미산정</span>';
        verdict = "배수식 필요";
        verdictCls = "sa-v-todo";
      } else {
        const dq = Math.round(draw.qty);
        drawnCell = "<b>" + dq + "</b>";
        if (fmlQty == null) { verdict = "수식 없음"; verdictCls = "sa-v-todo"; }
        else if (dq === fmlQty) { verdict = "✔ 일치"; verdictCls = "sa-v-ok"; }
        else { verdict = "⚠ 불일치"; verdictCls = "sa-v-bad"; }
      }

      if (draw.unscaled === 0) totalQty += Math.round(draw.qty);
      else allScaled = false;

      const rowIdTxt = g.rowIds.length ? g.rowIds.join(", ") : "수식 행 미연결";
      html += '<tr data-member-id="' + esc(g.memberId) + '" class="' + verdictCls + '">' +
        '<td><span class="sa-legend-swatch" style="background:' + g.color + '"></span></td>' +
        '<td class="sa-cmp-part' + (p ? "" : " sa-missing") + '" title="' + esc(pn + (p ? " — " + (p.nameKo || p.nameEn || "") : " (DB 미등록)")) + '">' + esc(pn) +
        (g.alias && g.alias !== pn ? '<span class="sa-cmp-alias">' + esc(g.alias) + "</span>" : "") + "</td>" +
        "<td>" + draw.instances + "개</td>" +
        '<td class="sa-num">' + drawnCell + "</td>" +
        '<td class="sa-num sa-cmp-scale" title="' + esc(rowIdTxt) + '">' + (fmlQty == null ? "—" : fmlQty) + "</td>" +
        '<td class="sa-cmp-verdict">' + verdict +
        (verdictCls === "sa-v-bad" && g.rowIds.length
          ? ' <button class="sa-mini" data-action="fix-formula" data-row="' + esc(g.rowIds[0]) +
            '" data-h="' + esc(hStr) + '" data-target="' + Math.round(draw.qty) + '">수식 수정</button>'
          : "") +
        "</td></tr>";
    });

    html += '</tbody><tfoot><tr><td colspan="3">이 시트 합계 수량' +
      (allScaled ? "" : " (산정된 항목만)") + "</td>" +
      '<td class="sa-num"><b>' + totalQty + "</b></td><td colspan=\"2\"></td></tr></tfoot></table>";
    if (rollup.hasUnscaled) {
      html += '<div class="sa-sheet-note">「미산정」은 <b>배수식(scale)</b>이 아직 없는 부재입니다. ' +
        "배수식은 <i>도면에 그려진 1개가 탱크 전체에서 몇 번 나오는가</i>를 나타내며, " +
        "부재를 클릭해 입력하면 도면 기준 수량이 계산됩니다. 추측값을 넣지 않으므로 0으로 표시하지 않습니다.</div>";
    }
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // Audit: does the drawing agree with the formulas?
  // ---------------------------------------------------------------------------
  // Findings for ONE height of one diagram. Same checks the single-height audit
  // always ran, plus the two the per-height model makes possible (a member with
  // no scale, and a drawing/formula quantity mismatch).
  function auditHeight(diagram, hStr, cfg) {
    const rows = ruleRowsFor(diagram);
    const ruleIds = {};
    rows.forEach(function (r) { ruleIds[r.id] = true; });

    const members = heightMembers(diagram, hStr);
    const hDetailMap = rowDetailMap(cfg, diagram, hStr);
    const findings = [];
    const drawnRowIds = {};

    members.forEach(function (m) {
      const detail = m.rowId ? hDetailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail);
      if (m.rowId) drawnRowIds[m.rowId] = true;

      if (!partNo) {
        findings.push({ lv: "err", member: m.memberId, msg: "품번이 지정되지 않았고 수식 행에서도 해석되지 않음" });
      } else if (!lookupPart(partNo)) {
        findings.push({ lv: "err", member: m.memberId, msg: "품번 <b>" + esc(partNo) + "</b> 이(가) PART MASTER DB에 없음" });
      }
      if (m.scale == null || String(m.scale).trim() === "") {
        findings.push({ lv: "warn", member: m.memberId, msg: "배수식(scale) 미지정 — 도면 기준 수량을 계산할 수 없어 <b>미산정</b>으로 표시됩니다." });
      }
      if (!m.rowId) {
        findings.push({ lv: "err", member: m.memberId, msg: "수식 행(rowId) 미연결 — 도면에는 있으나 산출 수식이 없음" });
      } else if (!ruleIds[m.rowId]) {
        findings.push({ lv: "err", member: m.memberId, msg: "rowId <b>" + esc(m.rowId) + "</b> 이(가) " + esc(diagram.ruleSet) + " 수식 목록에 없음" });
      } else {
        const d = hDetailMap[m.rowId];
        const rule = findRule(diagram, m.rowId);
        if (rule && String(rule.formula).trim() === "0") {
          // A row that ships as literal "0" is a placeholder: the drawing
          // shows the part but the original workbook never defined how many.
          findings.push({ lv: "warn", member: m.memberId, msg: "산출 수식이 아직 정의되지 않음 (<b>" + esc(m.rowId) + "</b> = 0). 부재를 클릭해 수식을 입력하면 BOM에 반영됩니다." });
        } else if (d && !(d.value > 0)) {
          findings.push({ lv: "warn", member: m.memberId, msg: hStr + "mH 도면에는 그려지나 수식 수량이 0" });
        }
        if (m.partNo && d && d.partNo && d.partNo !== m.partNo) {
          findings.push({ lv: "warn", member: m.memberId, msg: "도면 품번 <b>" + esc(m.partNo) + "</b> ≠ 수식 해석 품번 <b>" + esc(d.partNo) + "</b>" });
        }
      }
    });

    // Reverse direction: a row with quantity but nothing drawn for it.
    // Limited to `rowScope` -- the rows this particular drawing is responsible
    // for. Without it a side-panel sheet would "miss" every partition row, and
    // vice versa, drowning the real findings.
    const scoped = Array.isArray(diagram.rowScope) ? diagram.rowScope : null;
    rows.forEach(function (r) {
      if (scoped && scoped.indexOf(r.id) === -1) return;
      const d = hDetailMap[r.id];
      if (d && d.value > 0 && !drawnRowIds[r.id]) {
        findings.push({ lv: "warn", member: null, msg: "<b>" + esc(r.id) + "</b> (" + esc(d.partNo || "-") + ") 수량 " + d.value + " 이나 " + hStr + "mH 도면에 해당 부재가 없음" });
      }
    });

    // Drawing vs formula, part by part -- only meaningful where every instance
    // of that part carries a scale.
    const scope = engineScope(cfg, diagram, hStr);
    const rollup = qtyDrawnByPart(members, hDetailMap, scope, hStr);
    const drawnPartNos = Object.keys(rollup.byPart);
    const formulaByPart = qtyFormulaByPart(diagram, hDetailMap, drawnPartNos);
    drawnPartNos.forEach(function (pn) {
      const draw = rollup.byPart[pn];
      if (draw.unscaled > 0) return;
      const fml = formulaByPart[pn];
      if (!fml) return;
      const dq = Math.round(draw.qty), fq = Math.round(fml.qty);
      if (dq !== fq) {
        findings.push({ lv: "warn", member: null, mismatch: true,
          msg: "<b>" + esc(pn) + "</b> 도면 기준 " + dq + " ≠ 수식 기준 " + fq + " (" + esc(fml.rowIds.join(", ")) + ")" });
      }
    });

    const errs = findings.filter(function (f) { return f.lv === "err"; }).length;
    return { findings: findings, errs: errs, warns: findings.length - errs };
  }

  // Full diagram x height matrix. Cached per (diagram, config, override
  // generation) because a 9-height sweep re-runs the quantity engine 9 times
  // and render() is called on every click.
  function buildAuditMatrix(diagram, cfg) {
    const key = JSON.stringify([diagram.id, cfg, overrideGeneration]);
    if (auditCache.key === key) return auditCache.value;
    const byHeight = {};
    diagramHeights(diagram).forEach(function (h) {
      byHeight[h] = auditHeight(diagram, h, cfg);
    });
    auditCache = { key: key, value: byHeight };
    return byHeight;
  }

  function buildAudit(diagram, cfg, focusHeight) {
    const matrix = buildAuditMatrix(diagram, cfg);
    const heights = diagramHeights(diagram);
    const totErr = heights.reduce(function (a, h) { return a + matrix[h].errs; }, 0);
    const totWarn = heights.reduce(function (a, h) { return a + matrix[h].warns; }, 0);

    let html = '<div class="sa-audit">';
    html += '<div class="sa-audit-head">🔍 도면 ↔ 수식 검증 <span class="sa-badge sa-badge-err">오류 ' + totErr + "</span>" +
      '<span class="sa-badge sa-badge-warn">경고 ' + totWarn + "</span>" +
      '<span class="sa-audit-note">전체 ' + heights.length + "개 높이 기준</span></div>";

    // Per-height summary strip -- click to jump to that height's sheet.
    html += '<div class="sa-audit-strip">';
    heights.forEach(function (h) {
      const r = matrix[h];
      const cls = r.errs ? "sa-chip-err" : r.warns ? "sa-chip-warn" : "sa-chip-ok";
      html += '<button class="sa-audit-chip ' + cls + (String(h) === String(focusHeight) ? " active" : "") +
        '" data-action="goto-height" data-h="' + esc(h) + '">' + esc(h) + "mH" +
        (r.errs ? '<span class="sa-chip-n">' + r.errs + "</span>" : r.warns ? '<span class="sa-chip-n">' + r.warns + "</span>" : "") +
        "</button>";
    });
    html += "</div>";

    const focus = matrix[String(focusHeight)];
    if (!focus) {
      html += '<div class="sa-audit-ok">이 도면에 정의되지 않은 높이입니다.</div>';
    } else if (!focus.findings.length) {
      html += '<div class="sa-audit-ok">' + esc(focusHeight) + "mH: 도면과 수식이 모두 일치합니다.</div>";
    } else {
      html += '<div class="sa-audit-sub">' + esc(focusHeight) + "mH 상세</div>";
      html += '<ul class="sa-audit-list">' + focus.findings.map(function (f) {
        return '<li class="sa-audit-' + f.lv + '"' + (f.member ? ' data-member-id="' + esc(f.member) + '"' : "") + ">" +
          (f.member ? "<code>" + esc(f.member) + "</code> " : "") + f.msg + "</li>";
      }).join("") + "</ul>";
    }
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // Info panel for the selected member
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Position panel: the editor for ONE steel-accessory position on the sheet
  // ---------------------------------------------------------------------------
  // The working order is deliberately position-first, matching how the drawings
  // are actually authored:
  //
  //   ① 위치      place it on the panel (drag, or type coordinates)
  //   ② 품목      pick ANY part from the master DB -- a position is a slot, and
  //               a different product can be quoted in the same slot
  //   ③ 수량 수식  define how many of it the whole tank needs, for THIS position
  //   ④ 견적      수량 x 단가 for this position
  //
  // The legacy per-row formula binding (rowId) is kept BELOW that, as a
  // cross-check against the verified workbook rules -- not as the starting
  // point. A position is fully usable before it is ever bound to a row.
  function buildInfoPanel(diagram, members, detailMap, cfg, hSel) {
    if (!selectedMemberId) {
      return '<div class="sa-info sa-info-empty"><i class="fa-solid fa-hand-pointer"></i>' +
        "<div>도면의 부재를 클릭하면 그 <b>위치</b>의 품목·수량 수식·견적을<br>편집할 수 있습니다." +
        '<br><br>새 위치는 "부재 추가"로 만듭니다.</div></div>';
    }
    const m = members.find(function (x) { return x.memberId === selectedMemberId; });
    if (!m) return '<div class="sa-info sa-info-empty">선택된 부재를 찾을 수 없습니다.</div>';

    const detail = m.rowId ? detailMap[m.rowId] : null;
    const partNo = memberPartNo(m, detail);
    const p = lookupPart(partNo);
    const rule = findRule(diagram, m.rowId);
    const scope = engineScope(cfg, diagram, hSel);
    const nEl = memberInstanceCount(m, hSel);

    // Quantity this position contributes to the whole tank, at this height.
    let qty = null, qtyErr = null;
    if (m.scale != null && String(m.scale).trim() && scope) {
      try {
        const v = global.RuleEngine.evaluate(String(m.scale), scope);
        if (typeof v === "number" && isFinite(v)) qty = Math.round(v * nEl);
      } catch (e) { qtyErr = e.message; }
    }

    let html = '<div class="sa-info">';
    html += '<div class="sa-info-title"><span class="sa-legend-swatch" style="background:' + memberColor(m, partNo) + '"></span>' +
      esc(partNo || "(품목 미지정)") + "</div>";
    html += '<div class="sa-info-alias">' + esc(hSel) + "mH · " + esc(m.memberId) +
      (m.aliasLabel && m.aliasLabel !== partNo ? " · 도면 원본 표기 <code>" + esc(m.aliasLabel) + "</code>" : "") + "</div>";
    if (m.note) html += '<div class="sa-info-note">' + esc(m.note) + "</div>";

    // --- ① 위치 -------------------------------------------------------------
    html += '<div class="sa-info-sec">① 위치 (Position)</div>';
    html += '<table class="sa-info-table">';
    if (Array.isArray(diagram.views) && diagram.views.length) {
      html += "<tr><td>면</td><td>" + optionSelect("saMemberView", diagramViews(diagram), m.view) + "</td></tr>";
    }
    if (Array.isArray(diagram.layers) && diagram.layers.length) {
      html += "<tr><td>레이어</td><td>" + optionSelect("saMemberLayer", diagramLayers(diagram), memberLayer(m)) + "</td></tr>";
    }
    html += '<tr><td>좌표</td><td><textarea class="sa-inp sa-geom" id="saMemberGeom" spellcheck="false">' + esc(JSON.stringify(m.geom || {})) + "</textarea></td></tr>";
    html += "<tr><td>그려지는 개수</td><td><b>" + nEl + "</b>개" +
      (m.geom && m.geom.kind === "marker" ? ' <span class="sa-hint">(가로 위치 × 단수)</span>' : "") + "</td></tr>";
    html += "</table>";
    html += '<div class="sa-hint">' + (editMode ? "도면에서 직접 끌어 옮길 수 있습니다 (0.25m 스냅, Shift로 해제)." : '"도면 편집"을 켜면 끌어서 옮길 수 있습니다.') + "</div>";

    // --- ② 품목 -------------------------------------------------------------
    html += '<div class="sa-info-sec">② 품목 (Part) — 이 위치에 다른 제품도 지정 가능</div>';
    html += '<input class="sa-inp" id="saMemberPartNo" list="saPartList" value="' + esc(m.partNo || "") +
      '" placeholder="' + esc(detail && detail.partNo ? "(비우면 수식 행 기준: " + detail.partNo + ")" : "품번 검색") + '">';
    if (p) {
      html += '<table class="sa-info-table">' +
        row2("품명", p.nameKo || p.nameEn) + row2("규격", p.spec) +
        row2("단위", p.unit || "EA") +
        row2("중량", (p.weight || 0) + " kg") + row2("분류", p.category) + "</table>";
    } else {
      html += '<div class="sa-err-box">품번 <b>' + esc(partNo || "-") + "</b> 이(가) PART MASTER DB에 없습니다.</div>";
    }
    html += '<div class="sa-btn-row">' +
      '<button class="sa-btn sa-btn-ghost" data-action="goto-partdb" data-part="' + esc(partNo || "") + '">' +
      '<i class="fa-solid fa-database"></i> DB에서 보기</button></div>';

    // --- ③ 수량 수식 ---------------------------------------------------------
    html += '<div class="sa-info-sec">③ 수량 수식 — 이 위치가 탱크 전체에서 몇 개인가</div>';
    html += '<div class="sa-info-note sa-note-plain">도면은 표준 배치 기준(' + (diagram.cols || 3) +
      "칸)이라 그려진 개수를 그대로 쓸 수 없습니다. 여기 그려진 <b>1개</b>가 탱크 전체에서 몇 번 나오는지 적어주세요. " +
      "총 수량 = 수식값 × 그려진 개수(" + nEl + ").</div>";
    html += '<input class="sa-inp" id="saMemberScale" value="' + esc(m.scale || "") + '" placeholder="예: perim*2, N_PA, (W_C+W_F-1)*N_PA">';
    html += '<div class="sa-btn-row">' +
      '<button class="sa-btn sa-btn-primary" data-action="save-scale" data-h="' + esc(hSel) + '"><i class="fa-solid fa-floppy-disk"></i> 수량 수식 저장</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="suggest-scale" data-h="' + esc(hSel) + '">후보 추천</button></div>';
    html += '<div class="sa-formula-msg" id="saScaleMsg"></div>';
    html += '<div class="sa-var-help">사용 가능 변수: W_C W_F L_C L_F L1_C..L4_F H_O H_C H_F N_PA L2_O S_1M · 중간값: totLC totLF perim perim3</div>';

    // --- ④ 산출 수량 ---------------------------------------------------------
    html += '<div class="sa-info-sec">④ 산출 수량 (현재 BOM INPUT · ' + esc(hSel) + "mH 기준)</div>";
    if (qtyErr) {
      html += '<div class="sa-err-box">수량 수식 오류: ' + esc(qtyErr) + "</div>";
    } else if (qty == null) {
      html += '<div class="sa-quote sa-quote-todo">수량 수식이 없어 <b>미산정</b>입니다. ③에 수식을 입력하면 수량이 계산됩니다.</div>';
    } else {
      html += '<div class="sa-quote sa-quote-ok"><span class="sa-quote-n">' + qty + "</span> " +
        esc(p && p.unit ? p.unit : "EA") + '<div class="sa-hint">수식값 × 그려진 개수(' + nEl + ") = 탱크 전체 수량</div></div>";
    }

    // --- Cross-check against the verified workbook rows (secondary) ----------
    html += '<div class="sa-info-sec sa-sec-muted">참고 · 기존 산출 수식 행 대조 (' + esc(diagram.auditCategory) + ")</div>";
    html += "<table class=\"sa-info-table\"><tr><td>수식 행</td><td>" + rowIdSelect(diagram, m) + "</td></tr></table>";
    if (!m.rowId) {
      html += '<div class="sa-hint">이 위치는 기존 수식 행에 연결되어 있지 않습니다. 위 ③ 수량 수식만으로도 견적은 산출됩니다.</div>';
    } else if (!rule) {
      html += '<div class="sa-err-box">rowId <b>' + esc(m.rowId) + "</b> 을(를) 수식 목록에서 찾을 수 없습니다.</div>";
    } else {
      const rq = detail ? detail.value : "-";
      html += '<div class="sa-row-meta"><code>' + esc(m.rowId) + "</code>" +
        '<span class="sa-qty">행 수량 <b>' + esc(rq) + "</b>" + (qty != null ? " · 이 위치 " + qty : "") + "</span></div>";
      if (String(rule.formula).trim() === "0") {
        html += '<div class="sa-info-note">이 행은 원본 워크북에 수량식이 없어 <b>0</b>으로 등록된 자리입니다. ' +
          "BOM에 반영하려면 아래에 실제 수량식을 입력하세요.</div>";
      }
      html += '<textarea class="sa-formula" id="saFormulaInput" spellcheck="false">' + esc(rule.formula) + "</textarea>";
      html += '<div class="sa-btn-row">' +
        '<button class="sa-btn sa-btn-ghost" data-action="save-formula" data-row="' + esc(m.rowId) + '" data-cat="' + esc(diagram.auditCategory) + '"><i class="fa-solid fa-floppy-disk"></i> 행 수식 저장</button>' +
        '<button class="sa-btn sa-btn-ghost" data-action="reset-formula" data-row="' + esc(m.rowId) + '" data-cat="' + esc(diagram.auditCategory) + '"><i class="fa-solid fa-arrow-rotate-left"></i> 기본값</button>' +
        '<button class="sa-btn sa-btn-ghost" data-action="goto-reinf"><i class="fa-solid fa-cubes"></i> 검산표</button>' +
        "</div>";
      html += '<div class="sa-formula-msg" id="saFormulaMsg"></div>';
    }

    // --- Save / delete this position ----------------------------------------
    html += '<div class="sa-btn-row sa-save-row">' +
      '<button class="sa-btn sa-btn-primary" data-action="save-member" data-h="' + esc(hSel) + '"><i class="fa-solid fa-floppy-disk"></i> 이 높이에 저장</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="save-member-all" data-h="' + esc(hSel) + '">모든 높이에 적용 (좌표 제외)</button>' +
      '<button class="sa-btn sa-btn-danger" data-action="delete-member" data-h="' + esc(hSel) + '"><i class="fa-solid fa-trash"></i> 위치 삭제</button>' +
      "</div>";
    html += '<div class="sa-formula-msg" id="saMemberMsg"></div>';
    html += '<div class="sa-hint">저장하면 <b>' + esc(hSel) + "mH 만</b> 수정됩니다(이 높이가 공통 정의에서 분리됨).</div>";

    html += "</div>";
    return html;

    function row2(k, v) {
      return "<tr><td>" + esc(k) + "</td><td>" + esc(v == null || v === "" ? "-" : v) + "</td></tr>";
    }
  }

  // <select> over a diagram's views or layers. Both are [{id, title}] and both
  // legitimately have a null id (a v1 diagram's single unnamed face/row).
  function optionSelect(elId, list, current) {
    let s = '<select class="sa-inp" id="' + elId + '">';
    list.forEach(function (it) {
      const v = it.id == null ? "" : it.id;
      s += '<option value="' + esc(v) + '"' + ((current || "") === v ? " selected" : "") + ">" +
        esc(it.title || it.id || "(기본)") + "</option>";
    });
    return s + "</select>";
  }

  function rowIdSelect(diagram, m) {
    const rows = ruleRowsFor(diagram);
    let s = '<select class="sa-inp" id="saMemberRowId"><option value="">(미연결)</option>';
    rows.forEach(function (r) {
      const pn = ((global.AccessoriesRules.reinforcing[diagram.ruleSet].partNumbers || {})[r.id]);
      const label = r.id + (typeof pn === "string" ? " — " + pn : pn && pn.materialPrefix ? " — " + pn.materialPrefix + "SA2/SA4" : "");
      s += '<option value="' + esc(r.id) + '"' + (m.rowId === r.id ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    return s + "</select>";
  }

  // ---------------------------------------------------------------------------
  // One height = one sheet, laid out like the original deck's slides:
  // a title bar, the panel views (Outside / Inside) on the left with the
  // reinforcing and bracket layers under each, and the part legend + quantity
  // comparison on the right.
  // ---------------------------------------------------------------------------
  function buildSheet(diagram, hStr, members, detailMap, cfg) {
    const spec = effectiveHeightSpec(diagram, hStr);
    const mode = heightSpecMode(diagram, hStr);
    const px = 96;
    const views = diagramViews(diagram);
    const layers = diagramLayers(diagram);

    const title = (spec && spec.sheetTitle) ||
      (diagram.title.replace(/^\d+\.\s*/, "") + " (" + hStr + "mH)");

    let html = '<div class="sa-sheet">';
    html += '<div class="sa-sheet-title">' + esc(title) +
      '<span class="sa-sheet-mode ' + (mode === "manual" ? "sa-hb-manual" : "sa-hb-auto") + '">' +
      (mode === "manual" ? "이 높이만 수정됨" : "기본값 (공통 정의 연동)") + "</span>";
    if (mode === "manual") {
      html += '<button class="sa-mini" data-action="reset-height" data-h="' + esc(hStr) + '">기본값으로 되돌리기</button>';
    }
    html += '<button class="sa-mini" data-action="copy-height" data-h="' + esc(hStr) + '">다른 높이로 복사</button>';
    html += "</div>";

    if (mode === "manual") {
      html += '<div class="sa-sheet-detached">이 높이는 공통 도면 정의에서 <b>분리</b>되어 있습니다. ' +
        "공통 정의(부재 목록·좌표)를 고쳐도 이 높이에는 반영되지 않습니다.</div>";
    }

    html += '<div class="sa-sheet-body">';
    html += '<div class="sa-sheet-views">';

    views.forEach(function (v) {
      const inView = members.filter(function (m) { return !v.id || memberView(m) === v.id; });
      // A v1 diagram has one unnamed view holding everything; a v2 diagram with
      // an empty face still gets its heading so the sheet matches the original.
      html += '<div class="sa-view-block">';
      if (v.title) html += '<div class="sa-view-title">' + esc(v.title) + "</div>";
      layers.forEach(function (layer) {
        const inLayer = inView.filter(function (m) { return !layer.id || memberLayer(m) === layer.id; });
        if (v.id && !inLayer.length) return;      // skip empty face/layer combos
        if (layer.title) html += '<div class="sa-layer-title">' + esc(layer.title) + "</div>";
        html += '<div class="sa-svg-wrap sa-svg-sheet">' +
          buildPanelSvg(diagram, hStr, {
            members: members, detailMap: detailMap, pxPerM: px,
            layer: layer.id, view: v.id,
          }) + "</div>";
      });
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="sa-sheet-side">' + buildSheetTable(diagram, hStr, members, detailMap, cfg) + "</div>";
    html += "</div>";

    if (!members.length) {
      html += '<div class="sa-sheet-empty">이 높이(' + esc(hStr) + "mH)에는 정의된 철자재가 없습니다. " +
        '"부재 추가"로 이 높이의 정의를 시작할 수 있습니다.</div>';
    }
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  function render() {
    const host = document.getElementById("steelAccessoriesContainer");
    if (!host) return;

    if (loadError) {
      host.innerHTML = '<div class="sa-err-box">도면 정의 파일(' + esc(LAYOUT_URL) + ')을 불러오지 못했습니다: ' + esc(loadError) + "</div>";
      return;
    }
    if (!layout) {
      host.innerHTML = '<div class="sa-info-empty">도면 정의를 불러오는 중...</div>';
      return;
    }

    const diagrams = layout.diagrams || [];
    if (!diagrams.length) { host.innerHTML = '<div class="sa-err-box">도면 정의가 비어 있습니다.</div>'; return; }
    if (!currentDiagramId || !getDiagram(currentDiagramId)) currentDiagramId = diagrams[0].id;

    const diagram = getDiagram(currentDiagramId);
    const cfg = readConfig();
    const heights = diagramHeights(diagram);

    // The sheet's height: an explicit pick, else the configured tank height,
    // else the first height this diagram defines.
    let hSel = currentHeight != null ? String(currentHeight) : String(cfg.h);
    if (heights.indexOf(hSel) === -1) hSel = heights[0];

    const members = heightMembers(diagram, hSel);
    const detailMap = rowDetailMap(cfg, diagram, hSel);

    let html = styleBlock();

    // Intro
    html += '<div class="sa-intro"><i class="fa-solid fa-circle-info"></i> ' +
      '높이 등급별 철자재 배치 <b>기준 도면</b>입니다. 원본 시트와 같이 <b>높이 하나당 한 장</b>으로 구성되며, ' +
      '각 부재는 <b>PART MASTER DB 품번</b>과 <b>산출 수식(rowId)</b>에 연결되어 있습니다. ' +
      '우측 범례는 도면에서 집계한 수량과 수식이 낸 수량을 나란히 대조합니다 — ' +
      '<b>BOM 수량은 언제나 수식이 산출</b>하며, 도면은 정의·검증 계층입니다.</div>';

    // Diagram tabs
    html += '<div class="sa-diagram-tabs">';
    diagrams.forEach(function (d) {
      const match = diagramMatchesConfig(d, cfg);
      html += '<button class="sa-dtab' + (d.id === currentDiagramId ? " active" : "") + '" data-diagram="' + esc(d.id) + '">' +
        esc(d.title) +
        (match === true ? '<span class="sa-badge sa-badge-ok">현재 설정</span>' : match === false ? '<span class="sa-badge sa-badge-muted">설정 불일치</span>' : "") +
        "</button>";
    });
    html += "</div>";

    // Toolbar
    html += '<div class="sa-toolbar">' +
      '<div class="sa-seg">' +
      '<button class="sa-segbtn' + (viewMode === "sheet" ? " active" : "") + '" data-view="sheet">높이별 시트</button>' +
      '<button class="sa-segbtn' + (viewMode === "overview" ? " active" : "") + '" data-view="overview">전체 보기</button>' +
      "</div>" +
      '<div class="sa-tool-right">' +
      '<label class="sa-check"><input type="checkbox" id="saEditMode"' + (editMode ? " checked" : "") + '> 도면 편집</label>' +
      (editMode ? '<span class="sa-drag-tip">부재를 끌어서 이동 (0.25m 스냅, Shift로 해제)</span><span class="sa-drag-hint" id="saDragHint"></span>' : "") +
      '<button class="sa-btn sa-btn-ghost" data-action="add-member"><i class="fa-solid fa-plus"></i> 부재 추가</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="export-json"><i class="fa-solid fa-download"></i> JSON 내보내기</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="import-json"><i class="fa-solid fa-upload"></i> JSON 가져오기</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="reset-all"><i class="fa-solid fa-arrow-rotate-left"></i> 전체 기본값</button>' +
      "</div></div>";

    // Height rail (sheet mode): one chip per height grade this diagram defines,
    // badged with whether the height is still following the shared parametric
    // definition or has been detached and edited on its own.
    if (viewMode === "sheet") {
      const matrix = buildAuditMatrix(diagram, cfg);
      html += '<div class="sa-hrail">';
      heights.forEach(function (h) {
        const mode = heightSpecMode(diagram, h);
        const r = matrix[h] || { errs: 0, warns: 0 };
        const drawn = heightMembers(diagram, h).length;
        html += '<button class="sa-hchip' + (h === hSel ? " active" : "") + '" data-h="' + esc(h) + '">' +
          '<span class="sa-hchip-h">' + esc(h) + "mH</span>" +
          '<span class="sa-hchip-badge ' + (drawn === 0 ? "sa-hb-none" : mode === "manual" ? "sa-hb-manual" : "sa-hb-auto") + '">' +
          (drawn === 0 ? "미정의" : mode === "manual" ? "수정됨" : "기본값") + "</span>" +
          (r.errs ? '<span class="sa-hchip-dot sa-hd-err" title="오류 ' + r.errs + '"></span>'
            : r.warns ? '<span class="sa-hchip-dot sa-hd-warn" title="경고 ' + r.warns + '"></span>' : "") +
          "</button>";
      });
      html += "</div>";
    }

    // Drawings + info panel
    html += '<div class="sa-main">';
    html += '<div class="sa-canvas' + (editMode ? " sa-editing" : "") + (viewMode === "sheet" ? " sa-sheet-mode" : "") + '">';

    if (viewMode === "sheet") {
      html += buildSheet(diagram, hSel, members, detailMap, cfg);
    } else {
      const px = 40;
      // All panels sit on one baseline, as on the original sheet: reserve the
      // tallest panel's height in every cell and bottom-align inside it.
      const maxH = heights.reduce(function (a, h) { return Math.max(a, parseFloat(h)); }, 0);
      const wrapH = maxH * px + 36;
      // One ROW of panel elevations per layer -- reinforcing bars on top,
      // brackets underneath -- exactly how the original sheets are laid out.
      diagramLayers(diagram).forEach(function (layer) {
        if (layer.title) html += '<div class="sa-layer-title">' + esc(layer.title) + "</div>";
        html += '<div class="sa-layer-row">';
        heights.forEach(function (hStr) {
          const hm = heightMembers(diagram, hStr);
          const hd = rowDetailMap(cfg, diagram, hStr);
          html += '<div class="sa-height-block' + (hStr === hSel ? " sa-hb-current" : "") + '" data-h="' + esc(hStr) + '">' +
            '<div class="sa-svg-wrap" style="height:' + wrapH + 'px">' +
            buildPanelSvg(diagram, hStr, { members: hm, detailMap: hd, pxPerM: px, layer: layer.id }) +
            "</div>" +
            buildLegend(diagram, hStr, hm, hd, layer.id) +
            "</div>";
        });
        html += "</div>";
      });
    }
    html += "</div>";
    html += '<div class="sa-side" id="saSidePanel">' + buildInfoPanel(diagram, members, detailMap, cfg, hSel) + "</div>";
    html += "</div>";

    // Audit
    html += buildAudit(diagram, cfg, hSel);

    // datalist for the part-number input in edit mode
    html += '<datalist id="saPartList">';
    (allParts() || []).forEach(function (p) {
      html += '<option value="' + esc(p.partNo) + '">' + esc(p.nameKo || p.nameEn || "") + "</option>";
    });
    html += "</datalist>";
    html += '<input type="file" id="saImportFile" accept="application/json" style="display:none">';

    host.innerHTML = html;
    wireEvents(host, diagram, members, detailMap, cfg, hSel);
  }

  // null = diagram has no config precondition; true/false = matches or not
  function diagramMatchesConfig(diagram, cfg) {
    const w = diagram.appliesWhen;
    if (!w) return null;
    let ok = true;
    if (w.reinfMethod) ok = ok && ((w.reinfMethod === "Internal") === cfg.isIntReinf);
    if (w.sidePanelOnly) ok = ok && ((w.sidePanelOnly === "1x1") === cfg.sidePanelOnly);
    if (w.partitionPanelOnly) ok = ok && ((w.partitionPanelOnly === "1x1") === cfg.partitionPanelOnly);
    return ok;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  function wireEvents(host, diagram, members, detailMap, cfg, hSel) {
    // The delegated listeners below live on `host`, which render() does NOT
    // replace (only its innerHTML), so attaching them on every render would
    // stack a new copy each time -- one click would then fire N handlers and
    // trigger N re-renders. Attach them once and let them read the current
    // render's context from renderCtx instead of from a stale closure.
    renderCtx = { host: host, diagram: diagram, members: members, detailMap: detailMap, cfg: cfg, hSel: hSel };

    host.querySelectorAll(".sa-dtab").forEach(function (b) {
      b.addEventListener("click", function () {
        currentDiagramId = b.getAttribute("data-diagram");
        selectedMemberId = null;
        currentHeight = null;      // fall back to the configured height on the new diagram
        render();
      });
    });
    host.querySelectorAll(".sa-segbtn").forEach(function (b) {
      b.addEventListener("click", function () { viewMode = b.getAttribute("data-view"); render(); });
    });
    host.querySelectorAll(".sa-hchip").forEach(function (b) {
      b.addEventListener("click", function () {
        currentHeight = b.getAttribute("data-h");
        selectedMemberId = null;
        render();
      });
    });
    const editChk = host.querySelector("#saEditMode");
    if (editChk) editChk.addEventListener("change", function () { editMode = editChk.checked; render(); });

    if (delegatesWired) return;
    delegatesWired = true;

    // Select a member from the drawing, the legend, or an audit finding
    host.addEventListener("click", function (ev) {
      if (suppressNextClick) { suppressNextClick = false; return; }   // that was a drag
      const el = ev.target.closest ? ev.target.closest("[data-member-id]") : null;
      if (!el) return;
      selectedMemberId = el.getAttribute("data-member-id");
      render();
    });

    wireDrag(host);

    host.addEventListener("click", function (ev) {
      const btn = ev.target.closest ? ev.target.closest("[data-action]") : null;
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const diagram = renderCtx.diagram;

      if (action === "save-formula") {
        const ta = document.getElementById("saFormulaInput");
        const msg = document.getElementById("saFormulaMsg");
        if (!ta || !global.RuleEditorUI) return;
        const res = global.RuleEditorUI.setFieldFormula(btn.getAttribute("data-cat"), rowsTableIndex(diagram), btn.getAttribute("data-row"), ta.value.trim());
        if (!res || !res.ok) {
          if (msg) { msg.className = "sa-formula-msg sa-msg-err"; msg.textContent = "저장 실패: " + ((res && res.error) || "알 수 없는 오류"); }
          return;
        }
        if (msg) { msg.className = "sa-formula-msg sa-msg-ok"; msg.textContent = "저장되었습니다. BOM을 다시 생성하면 반영됩니다."; }
        refreshDependentViews();
        render();
      } else if (action === "reset-formula") {
        if (!global.RuleEditorUI) return;
        const res = global.RuleEditorUI.resetFieldFormula(btn.getAttribute("data-cat"), rowsTableIndex(diagram), btn.getAttribute("data-row"));
        const msg = document.getElementById("saFormulaMsg");
        if (msg) {
          msg.className = "sa-formula-msg " + (res && res.ok ? "sa-msg-ok" : "sa-msg-err");
          msg.textContent = res && res.ok ? "기본 수식으로 되돌렸습니다." : "기본값이 없습니다.";
        }
        refreshDependentViews();
        render();
      } else if (action === "goto-reinf") {
        const tabBtn = document.querySelector('.tab-btn[data-tab="tab-reinf-audit"]');
        if (tabBtn) tabBtn.click();
      } else if (action === "goto-partdb") {
        const tabBtn = document.querySelector('.tab-btn[data-tab="tab-parts-db-master"]');
        if (tabBtn) tabBtn.click();
        const search = document.getElementById("dbTabSearchInput");
        if (search) {
          search.value = btn.getAttribute("data-part") || "";
          search.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else if (action === "save-member") {
        saveMemberEdits(diagram, btn.getAttribute("data-h"), false);
      } else if (action === "save-member-all") {
        saveMemberEdits(diagram, btn.getAttribute("data-h"), true);
      } else if (action === "save-scale") {
        saveScale(diagram, btn.getAttribute("data-h"));
      } else if (action === "suggest-scale") {
        suggestScale(diagram, btn.getAttribute("data-h"));
      } else if (action === "apply-scale") {
        // Fills the box only -- saving stays an explicit, separate click.
        const inp = document.getElementById("saMemberScale");
        if (inp) { inp.value = btn.getAttribute("data-scale") || ""; inp.focus(); }
      } else if (action === "delete-member") {
        if (!selectedMemberId) return;
        const h = btn.getAttribute("data-h");
        if (!confirm("이 부재를 " + h + "mH 도면에서 삭제할까요?\n(다른 높이와 수식/부품 데이터는 영향받지 않습니다.)")) return;
        const list = detachHeight(diagram, h);
        const i = list.findIndex(function (m) { return m.memberId === selectedMemberId; });
        if (i !== -1) list.splice(i, 1);
        persistOverrides();
        selectedMemberId = null;
        render();
      } else if (action === "reset-height") {
        const h = btn.getAttribute("data-h");
        if (!confirm(h + "mH 의 개별 수정을 버리고 공통 도면 정의로 되돌릴까요?")) return;
        resetHeight(diagram, h);
        selectedMemberId = null;
        render();
      } else if (action === "copy-height") {
        copyHeightPrompt(diagram, btn.getAttribute("data-h"));
      } else if (action === "goto-height") {
        currentHeight = btn.getAttribute("data-h");
        viewMode = "sheet";
        selectedMemberId = null;
        render();
      } else if (action === "fix-formula") {
        fixFormulaForHeight(diagram, btn.getAttribute("data-row"), btn.getAttribute("data-h"), parseFloat(btn.getAttribute("data-target")));
      } else if (action === "add-member") {
        addMember(diagram, renderCtx.hSel);
      } else if (action === "export-json") {
        exportJson();
      } else if (action === "import-json") {
        const f = document.getElementById("saImportFile");
        if (f) f.click();
      } else if (action === "reset-all") {
        if (!confirm("이 브라우저에 저장된 도면 편집 내용을 모두 지우고 기본 도면으로 되돌릴까요?")) return;
        overrides = {};
        persistOverrides();
        selectedMemberId = null;
        render();
      }
    });

    // Delegated too -- #saImportFile is recreated on every render.
    host.addEventListener("change", function (ev) {
      const fileInput = ev.target;
      if (!fileInput || fileInput.id !== "saImportFile") return;
      {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const parsed = JSON.parse(String(reader.result));
            if (!parsed || !Array.isArray(parsed.diagrams)) throw new Error("diagrams 배열이 없습니다.");
            // Importing replaces the baseline AND discards local edits, which
            // used to happen with no warning at all.
            const nOv = Object.keys(overrides).length;
            if (nOv && !confirm(
              "가져오기를 진행하면 이 브라우저에 저장된 도면 편집 " + nOv + "건이 모두 삭제되고\n" +
              "가져온 파일이 기준 도면이 됩니다. 계속할까요?")) {
              fileInput.value = "";
              return;
            }
            layout = parsed;
            overrides = {};       // an imported file replaces the baseline outright
            persistOverrides();
            selectedMemberId = null;
            render();
            alert("도면 정의를 가져왔습니다.\n영구 반영하려면 이 파일을 " + LAYOUT_URL + " 로 커밋하세요.");
          } catch (e) {
            alert("가져오기 실패: " + e.message);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Drag-to-adjust (edit mode only)
  // ---------------------------------------------------------------------------
  // Fine-positioning a member by typing raw JSON coordinates is unusable, so in
  // edit mode a member can simply be dragged on the drawing. The drop writes
  // through the SAME patchMember() path the JSON editor uses, so there is one
  // persistence story (localStorage + Firestore), not two.
  //
  // Formula coordinates ("H_O-1") used to be undraggable, because one geom was
  // shared across all nine grades and freezing it to a number would silently
  // change the other eight. Per-height sheets removed that coupling: what a
  // sheet hands out is ALWAYS baked literal coordinates for that one height,
  // and the drop writes back to that height alone (detaching it). So a drag on
  // a sheet now does exactly what it looks like it does.
  //
  // isDraggableCoord() still guards the overview mode, where the parametric
  // definition is what's on screen and formula coords must stay untouched.
  const SNAP_M = 0.25;
  let dragState = null;
  let suppressNextClick = false;

  function isDraggableCoord(v) {
    return typeof v !== "string";
  }

  function wireDrag(host) {
    // move/up go on `window`, not on the element or the container: the drop
    // re-renders the drawing, and a pointer that leaves the SVG (easy to do
    // when nudging a bar near the panel edge) must still finish the drag.
    host.addEventListener("pointerdown", function (ev) {
      if (!editMode || dragState) return;
      // Overview mode shows the shared parametric definition across every
      // grade; dragging there has no single height to write to.
      if (viewMode !== "sheet") return;
      const el = ev.target.closest ? ev.target.closest("svg.sa-panel-svg [data-member-id]") : null;
      if (!el) return;
      const svg = el.closest("svg.sa-panel-svg");
      if (!svg) return;
      const memberId = el.getAttribute("data-member-id");
      const m = (renderCtx.members || []).find(function (x) { return x.memberId === memberId; });
      if (!m || !m.geom) return;

      const rect = svg.getBoundingClientRect();
      const pxPerM = parseFloat(svg.getAttribute("data-px")) || 40;
      // The SVG renders at its intrinsic size, but guard against CSS scaling.
      const scale = rect.width / (parseFloat(svg.getAttribute("width")) || rect.width);
      dragState = {
        memberId: memberId, geom0: JSON.parse(JSON.stringify(m.geom)),
        x0: ev.clientX, y0: ev.clientY, perM: pxPerM * (scale || 1),
        moved: false, dx: 0, dy: 0, diagramId: renderCtx.diagram.id,
        hStr: renderCtx.hSel,
      };
      ev.preventDefault();
    });

    global.addEventListener("pointermove", function (ev) {
      if (!dragState) return;
      const dxPx = ev.clientX - dragState.x0, dyPx = ev.clientY - dragState.y0;
      if (!dragState.moved && Math.abs(dxPx) + Math.abs(dyPx) < 3) return;
      dragState.moved = true;
      dragState.dx = dxPx / dragState.perM;
      dragState.dy = -dyPx / dragState.perM;    // screen y grows downward, drawing y upward
      if (!ev.shiftKey) {
        // Horizontal: panels are 1 m wide, half panels 0.5 m -> a 0.25 m grid
        // covers every real vertical edge.
        dragState.dx = Math.round(dragState.dx / SNAP_M) * SNAP_M;
        // Vertical: snap the member's own anchor onto an actual panel joint,
        // because that is the only place an accessory is installed. Falls back
        // to the plain grid when the shape has no single y anchor.
        const anchor = anchorY(dragState.geom0);
        if (anchor == null) {
          dragState.dy = Math.round(dragState.dy / SNAP_M) * SNAP_M;
        } else {
          const want = anchor + dragState.dy;
          const ys = snapYsFor(dragState.hStr);
          let best = ys[0];
          ys.forEach(function (y) { if (Math.abs(y - want) < Math.abs(best - want)) best = y; });
          dragState.dy = round2(best - anchor);
        }
      }
      showDragHint(dragState);
    });

    global.addEventListener("pointerup", function () {
      const st = dragState;
      dragState = null;
      if (!st) return;
      showDragHint(null);
      if (!st.moved) return;
      suppressNextClick = true;          // don't let the drop count as a select
      if (!st.dx && !st.dy) return;
      const geom = applyDragToGeom(st.geom0, st.dx, st.dy);
      if (!geom) return;
      selectedMemberId = st.memberId;
      if (JSON.stringify(geom) === JSON.stringify(st.geom0)) { render(); return; }
      // Writes to THIS height only, detaching it from the shared definition.
      const diagram = getDiagram(st.diagramId);
      if (diagram && st.hStr != null) patchHeightMember(diagram, st.hStr, st.memberId, { geom: geom });
      render();
    });

    global.addEventListener("pointercancel", function () { dragState = null; showDragHint(null); });
  }

  // Move only the axes the shape can actually move along, and only numeric
  // coordinates (see the formula-string note above).
  function applyDragToGeom(g0, dx, dy) {
    const g = JSON.parse(JSON.stringify(g0));
    const addX = function (k) { if (isDraggableCoord(g[k])) g[k] = round2(g[k] + dx); };
    const addY = function (k) { if (isDraggableCoord(g[k])) g[k] = round2(g[k] + dy); };
    if (g.kind === "h") { addY("y"); addX("x1"); addX("x2"); }
    else if (g.kind === "v") { addX("x"); addY("y1"); addY("y2"); }
    else if (g.kind === "rect") { addX("x1"); addX("x2"); addY("y"); }
    else if (g.kind === "marker") {
      if (Array.isArray(g.xs)) g.xs = g.xs.map(function (v) { return isDraggableCoord(v) ? round2(v + dx) : v; });
      else addX("x");
      addY("yFrom"); addY("yTo");
    } else return null;
    return g;
  }

  // The y a shape is "hung from", used to snap it onto a panel joint. Bars and
  // brackets have one; a vertical bar spans between joints and has none, so it
  // keeps the plain grid.
  function anchorY(g) {
    if (!g) return null;
    if (g.kind === "h") return typeof g.y === "number" ? g.y : null;
    if (g.kind === "rect") return typeof g.y === "number" ? g.y : null;
    if (g.kind === "marker") return typeof g.yFrom === "number" ? g.yFrom : null;
    return null;
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  function showDragHint(st) {
    const el = document.getElementById("saDragHint");
    if (!el) return;
    el.textContent = st && st.moved
      ? "이동 Δx " + round2(st.dx) + "m, Δy " + round2(st.dy) + "m  (Shift: 스냅 해제)"
      : "";
  }

  // `applyAll` writes to the shared parametric member instead of the one height
  // -- the escape hatch for "this correction belongs on every grade".
  function saveMemberEdits(diagram, hStr, applyAll) {
    if (!selectedMemberId) return;
    const msg = document.getElementById("saMemberMsg");
    const rowSel = document.getElementById("saMemberRowId");
    const partInp = document.getElementById("saMemberPartNo");
    const colorInp = document.getElementById("saMemberColor");
    const viewSel = document.getElementById("saMemberView");
    const layerSel = document.getElementById("saMemberLayer");
    const geomInp = document.getElementById("saMemberGeom");
    let geom;
    try {
      geom = JSON.parse(geomInp.value);
    } catch (e) {
      if (msg) { msg.className = "sa-formula-msg sa-msg-err"; msg.textContent = "좌표(geom) JSON 오류: " + e.message; }
      return;
    }
    const patch = {
      rowId: rowSel && rowSel.value ? rowSel.value : null,
      partNo: partInp && partInp.value.trim() ? partInp.value.trim() : null,
      color: colorInp && colorInp.value.trim() ? colorInp.value.trim() : null,
      view: viewSel && viewSel.value ? viewSel.value : null,
      layer: layerSel && layerSel.value ? layerSel.value : null,
      geom: geom,
    };
    if (applyAll) {
      // Geometry is baked at ONE height; pushing it onto the shared definition
      // would silently freeze every other grade to this height's coordinates.
      delete patch.geom;
      patchMember(diagram.id, selectedMemberId, patch);
      if (msg) { msg.className = "sa-formula-msg sa-msg-ok"; msg.textContent = "좌표를 제외한 속성을 모든 높이에 적용했습니다."; }
    } else {
      patchHeightMember(diagram, hStr, selectedMemberId, patch);
    }
    render();
  }

  function saveScale(diagram, hStr) {
    if (!selectedMemberId) return;
    const inp = document.getElementById("saMemberScale");
    const msg = document.getElementById("saScaleMsg");
    if (!inp) return;
    const text = inp.value.trim();
    if (text && global.RuleEngine) {
      try {
        global.RuleEngine.tokenize(text);
      } catch (e) {
        if (msg) { msg.className = "sa-formula-msg sa-msg-err"; msg.textContent = "수식 오류: " + e.message; }
        return;
      }
    }
    patchHeightMember(diagram, hStr, selectedMemberId, { scale: text || null });
    render();
  }

  // Candidate multiplier expressions, in the order a maintainer would try them.
  // Deliberately small: this proposes, it never applies.
  const SCALE_CANDIDATES = [
    "perim*2", "perim", "perim3*2", "perim3",
    "(W_C+W_F-1)*2", "W_C+W_F-1", "(W_C+W_F-1)*N_PA",
    "(W_C+totLC)*2", "(W_F+totLF)*2", "W_C+totLC", "W_F+totLF",
    "N_PA", "N_PA*2", "N_PA*4",
    "1", "2", "4", "8",
  ];

  // Sample tank configurations the candidate must ALSO satisfy. One matching
  // config proves nothing (many expressions collide at a single point), so a
  // candidate is only offered when it reproduces the row total everywhere.
  const SCALE_PROBE_CONFIGS = [
    { w: 2, l1: 3, l2: 0, l3: 0, l4: 0 },
    { w: 3.5, l1: 3, l2: 3, l3: 0, l4: 0 },
    { w: 5, l1: 4, l2: 0, l3: 0, l4: 0 },
    { w: 4, l1: 2.5, l2: 2, l3: 2, l4: 0 },
  ];

  // For the selected member, find expressions e such that -- across every probe
  // config -- (instances of this member's row on this sheet) * e equals the
  // row's own quantity. Anything that survives all four is worth a look.
  function suggestScale(diagram, hStr) {
    const msg = document.getElementById("saScaleMsg");
    if (!selectedMemberId || !global.RuleEngine) return;
    const cfg = readConfig();
    const members = heightMembers(diagram, hStr);
    const me = members.find(function (x) { return x.memberId === selectedMemberId; });
    if (!me || !me.rowId) {
      if (msg) { msg.className = "sa-formula-msg sa-msg-err"; msg.textContent = "rowId가 연결되어야 후보를 계산할 수 있습니다."; }
      return;
    }
    // How many drawn elements share this row on this sheet -- the row total is
    // split across them, so each element carries total/elements.
    const siblings = members.reduce(function (a, x) {
      return x.rowId === me.rowId ? a + memberInstanceCount(x, hStr) : a;
    }, 0) || 1;

    const survivors = SCALE_CANDIDATES.filter(function (expr) {
      return SCALE_PROBE_CONFIGS.every(function (probe) {
        const pcfg = Object.assign({}, cfg, probe, { h: parseFloat(hStr) });
        const scope = engineScope(pcfg, diagram, hStr);
        const detail = rowDetailMap(pcfg, diagram, hStr)[me.rowId];
        if (!scope || !detail) return false;
        try {
          const v = global.RuleEngine.evaluate(expr, scope);
          if (typeof v !== "number" || !isFinite(v)) return false;
          return Math.round(v * siblings) === Math.round(detail.value);
        } catch (e) { return false; }
      });
    });

    if (!msg) return;
    if (!survivors.length) {
      msg.className = "sa-formula-msg sa-msg-err";
      msg.innerHTML = "4개 샘플 설정을 모두 만족하는 후보가 없습니다. " +
        "<code>" + esc(me.rowId) + "</code> 의 수식을 참고해 직접 입력하세요.";
      return;
    }
    msg.className = "sa-formula-msg";
    msg.innerHTML = '<span class="sa-msg-ok">후보 (' + siblings + "개 인스턴스 기준, 4개 샘플 모두 일치):</span> " +
      survivors.map(function (s) {
        return '<button class="sa-mini" data-action="apply-scale" data-scale="' + esc(s) + '">' + esc(s) + "</button>";
      }).join(" ") + '<div class="sa-var-help">확인 후 「배수식 저장」을 눌러야 반영됩니다.</div>';
  }

  function copyHeightPrompt(diagram, fromH) {
    const others = diagramHeights(diagram).filter(function (h) { return h !== String(fromH); });
    const to = prompt(
      fromH + "mH 의 정의를 어느 높이로 복사할까요?\n" +
      "가능한 높이: " + others.join(", ") + "\n\n" +
      "※ 좌표는 " + fromH + "mH 기준 그대로 복사됩니다. 패널 상단 기준으로 배치된 부재는 복사 후 조정이 필요합니다.",
      others[0]);
    if (!to) return;
    const target = String(to).trim();
    if (others.indexOf(target) === -1) { alert("이 도면에 없는 높이입니다: " + target); return; }
    if (heightSpecMode(diagram, target) === "manual" &&
        !confirm(target + "mH 는 이미 개별 수정되어 있습니다. 덮어쓸까요?")) return;
    copyHeightSpec(diagram, fromH, target);
    currentHeight = target;
    render();
  }

  // Reconcile ONE height's term of a formula row with what the drawing says.
  // Uses rule_editor.js's decomposition so the other eight grades keep their
  // existing terms untouched; falls back to whole-formula editing when the
  // formula cannot be split safely (verifyReconstruction says so).
  function fixFormulaForHeight(diagram, rowId, hStr, targetQty) {
    const RE = global.RuleEditorUI;
    const rule = findRule(diagram, rowId);
    if (!RE || !rule) return;
    if (!isFinite(targetQty)) return;

    const table = RE.tryBuildHeightTable ? RE.tryBuildHeightTable(rule.formula) : null;
    if (!table) {
      alert("이 수식(" + rowId + ")은 높이별로 분해할 수 없어 개별 높이만 수정할 수 없습니다.\n" +
        "부재를 클릭해 수식 전체를 직접 편집하세요.\n\n현재 수식:\n" + rule.formula);
      return;
    }
    const key = parseFloat(hStr);
    const current = table[key] != null ? String(table[key]) : "0";
    const next = prompt(
      rowId + " · " + hStr + "mH 항 수정\n\n" +
      "도면 기준 수량: " + targetQty + "\n" +
      "이 높이의 현재 수식 항:\n" + current + "\n\n" +
      "다른 높이의 항은 그대로 유지됩니다. 새 수식을 입력하세요:",
      current);
    if (next == null) return;

    table[key] = String(next).trim() || "0";
    const rebuilt = RE.reconstructFormula(table);
    const res = RE.setFieldFormula(diagram.auditCategory, rowsTableIndex(diagram), rowId, rebuilt);
    if (!res || !res.ok) {
      alert("수식 저장 실패: " + ((res && res.error) || "알 수 없는 오류"));
      return;
    }
    refreshDependentViews();
    render();
  }

  // A new member belongs to the height it was added on. Adding one therefore
  // detaches that height -- the alternative (adding to the shared list) would
  // make it appear on all nine grades at once, which is never what is wanted
  // when working from a per-height sheet.
  function addMember(diagram, hStr) {
    const id = "custom_" + Date.now();
    const views = diagramViews(diagram);
    const layers = diagramLayers(diagram);
    const list = detachHeight(diagram, hStr);
    list.push({
      memberId: id, rowId: null, partNo: null, aliasLabel: "새 부재", color: "#000000",
      scale: null,
      view: views[0].id, layer: layers[0].id,
      geom: { kind: "h", y: 1, x1: 0, x2: diagram.cols || 3 },
    });
    persistOverrides();
    selectedMemberId = id;
    editMode = true;
    render();
  }

  // Merge shipped layout + overrides into one file, ready to commit over
  // steel_accessories_layout.json (git stays the source of truth).
  function exportJson() {
    if (!layout) return;
    const merged = JSON.parse(JSON.stringify(layout));
    merged.version = 2;
    merged.diagrams = (merged.diagrams || []).map(function (d) {
      const copy = Object.assign({}, d);
      copy.members = effectiveMembers(d).map(function (m) {
        const c = Object.assign({}, m);
        delete c.isAdded;
        delete c.__deleted__;
        return c;
      });
      // Only DETACHED heights are written out. An "auto" height has no
      // independent content -- baking it into the file would freeze it against
      // future edits to the shared members[], which is the opposite of what
      // "기본값" means.
      const specs = {};
      diagramHeights(d).forEach(function (h) {
        const spec = effectiveHeightSpec(d, h);
        if (spec && spec.mode === "manual" && Array.isArray(spec.members)) {
          specs[h] = { mode: "manual", sheetTitle: spec.sheetTitle || undefined, members: spec.members };
        }
      });
      if (Object.keys(specs).length) copy.heightSpecs = specs;
      else delete copy.heightSpecs;
      return copy;
    });
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = LAYOUT_URL;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // A formula edit made here must show up on the Steel Reinforcing Logic tab
  // and in the BOM, exactly as if it had been made there.
  function refreshDependentViews() {
    try {
      if (typeof global.renderReinforcingAuditView === "function") global.renderReinforcingAuditView();
    } catch (e) { /* tab not present */ }
  }

  // ---------------------------------------------------------------------------
  // Styles (scoped to this tab)
  // ---------------------------------------------------------------------------
  function styleBlock() {
    return '<style>' +
      '.sa-intro{background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:12px 16px;font-size:12.5px;line-height:1.6;color:#075985;margin-bottom:12px;}' +
      '.sa-diagram-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}' +
      '.sa-dtab{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1.5px solid #cbd5e1;background:#fff;border-radius:8px;font-size:12px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.sa-dtab.active{background:#0369a1;border-color:#0369a1;color:#fff;}' +
      '.sa-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}' +
      '.sa-tool-right{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}' +
      '.sa-seg{display:inline-flex;border:1.5px solid #cbd5e1;border-radius:8px;overflow:hidden;}' +
      '.sa-segbtn{padding:7px 14px;border:0;background:#fff;font-size:12px;font-weight:600;color:#475569;cursor:pointer;}' +
      '.sa-segbtn.active{background:#0369a1;color:#fff;}' +
      '.sa-check{font-size:12px;font-weight:600;color:#334155;display:inline-flex;align-items:center;gap:5px;cursor:pointer;}' +
      '.sa-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;}' +
      '.sa-canvas{flex:1 1 620px;min-width:320px;display:flex;flex-direction:column;gap:6px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;overflow-x:auto;}' +
      '.sa-layer-title{font-size:11.5px;font-weight:700;color:#0369a1;background:#f0f9ff;border-left:3px solid #0284c7;padding:4px 9px;border-radius:0 5px 5px 0;margin-top:6px;}' +

      // --- Height rail (sheet mode) ---
      '.sa-hrail{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;padding:7px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:9px;}' +
      '.sa-hchip{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:64px;padding:6px 9px;border:1.5px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;}' +
      '.sa-hchip:hover{border-color:#0284c7;}' +
      '.sa-hchip.active{background:#0369a1;border-color:#0369a1;}' +
      '.sa-hchip-h{font-size:12px;font-weight:700;color:#0f172a;}' +
      '.sa-hchip.active .sa-hchip-h{color:#fff;}' +
      '.sa-hchip-badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:7px;white-space:nowrap;}' +
      '.sa-hb-auto{background:#f1f5f9;color:#64748b;}' +
      '.sa-hb-manual{background:#fef3c7;color:#92400e;}' +
      '.sa-hb-none{background:#f8fafc;color:#cbd5e1;}' +
      '.sa-hchip-dot{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;}' +
      '.sa-hd-err{background:#dc2626;} .sa-hd-warn{background:#f59e0b;}' +

      // --- One-height sheet ---
      '.sa-canvas.sa-sheet-mode{overflow-x:visible;}' +
      '.sa-sheet-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:14px;font-weight:700;color:#fff;background:#4472c4;border-radius:7px;padding:9px 14px;margin-bottom:10px;}' +
      '.sa-sheet-mode-badge{font-size:10px;}' +
      '.sa-sheet-title .sa-hb-auto,.sa-sheet-title .sa-hb-manual{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:7px;}' +
      '.sa-sheet-detached{font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 9px;margin-bottom:9px;}' +
      '.sa-sheet-body{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:14px;align-items:start;}' +
      '@media (max-width:1100px){.sa-sheet-body{grid-template-columns:1fr;}}' +
      '.sa-sheet-views{display:flex;flex-direction:column;gap:12px;min-width:0;overflow-x:auto;}' +
      '.sa-view-block{border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fcfdff;}' +
      '.sa-view-title{font-size:12px;font-weight:700;color:#334155;margin-bottom:6px;}' +
      '.sa-svg-sheet{align-items:flex-start;justify-content:flex-start;margin-top:4px;}' +
      '.sa-sheet-side{min-width:0;}' +
      '.sa-sheet-legend{border:1.5px solid #e2e8f0;border-radius:9px;padding:10px;background:#fff;}' +
      '.sa-sheet-legend-head{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#0f172a;margin-bottom:7px;}' +
      '.sa-sheet-h{font-size:10px;font-weight:700;background:#e0f2fe;color:#0369a1;padding:1px 7px;border-radius:8px;}' +
      '.sa-sheet-empty{font-size:12px;color:#94a3b8;padding:14px;text-align:center;}' +
      '.sa-sheet-note{font-size:10.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;margin-top:8px;line-height:1.55;}' +
      '.sa-height-block.sa-hb-current{outline:2px solid #0284c7;outline-offset:3px;border-radius:4px;}' +

      // --- Drawing vs formula comparison table ---
      '.sa-cmp{width:100%;border-collapse:collapse;font-size:10.5px;}' +
      '.sa-cmp th{text-align:left;font-size:9.5px;color:#64748b;font-weight:700;padding:2px 4px;border-bottom:1.5px solid #e2e8f0;white-space:nowrap;}' +
      '.sa-cmp td{padding:3px 4px;border-bottom:1px solid #f1f5f9;vertical-align:middle;white-space:nowrap;}'+
      '.sa-cmp td.sa-cmp-part{white-space:normal;}' +
      '.sa-cmp tbody tr{cursor:pointer;}' +
      '.sa-cmp tbody tr:hover{background:#f8fafc;}' +
      '.sa-cmp-part{font-family:monospace;font-weight:700;color:#0f172a;white-space:nowrap;}' +
      '.sa-cmp-part.sa-missing{color:#dc2626;text-decoration:underline dotted;}' +
      '.sa-cmp-alias{display:block;font-size:8.5px;font-weight:400;color:#94a3b8;}' +
      '.sa-cmp-scale{font-family:monospace;color:#475569;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.sa-cmp-verdict{white-space:nowrap;font-weight:700;}' +
      '.sa-v-ok .sa-cmp-verdict{color:#047857;}' +
      '.sa-v-bad .sa-cmp-verdict{color:#b91c1c;}' +
      '.sa-v-bad{background:#fef2f2;}' +
      '.sa-v-todo .sa-cmp-verdict{color:#92400e;}' +
      '.sa-unscaled{color:#92400e;font-weight:700;}' +
      '.sa-mini{font-size:9.5px;font-weight:700;padding:1px 6px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:5px;cursor:pointer;margin-left:3px;}' +
      '.sa-mini:hover{background:#f1f5f9;border-color:#0284c7;}' +
      '.sa-scale-eval{font-size:10.5px;color:#334155;margin-top:5px;}' +
      '.sa-note-plain{color:#334155;background:#f8fafc;border-color:#e2e8f0;}' +
      '.sa-num{text-align:right;font-variant-numeric:tabular-nums;}' +
      '.sa-cmp tfoot td{padding:5px 4px;border-top:1.5px solid #cbd5e1;font-size:10px;font-weight:700;color:#0f172a;}' +

      // --- Position panel (①위치 ②품목 ③수량 수식 ④견적) ---
      '.sa-hint{font-size:10px;color:#64748b;margin-top:5px;line-height:1.5;}' +
      '.sa-sec-muted{color:#94a3b8 !important;border-bottom-color:#f1f5f9 !important;}' +
      '.sa-quote{font-size:11.5px;border-radius:6px;padding:8px 10px;line-height:1.55;}' +
      '.sa-quote-todo{background:#fffbeb;border:1px solid #fde68a;color:#92400e;}' +
      '.sa-quote-ok{background:#f0f9ff;border:1px solid #bae6fd;color:#075985;}' +
      '.sa-quote-n{font-size:22px;font-weight:800;color:#0369a1;}' +
      '.sa-save-row{margin-top:14px;padding-top:10px;border-top:1.5px solid #e2e8f0;}' +

      // --- Audit height strip ---
      '.sa-audit-strip{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:9px;}' +
      '.sa-audit-chip{font-size:10px;font-weight:700;padding:3px 8px;border-radius:7px;border:1.5px solid transparent;cursor:pointer;display:inline-flex;align-items:center;gap:4px;}' +
      '.sa-audit-chip.active{border-color:#0369a1;}' +
      '.sa-chip-ok{background:#dcfce7;color:#166534;}' +
      '.sa-chip-warn{background:#fef3c7;color:#92400e;}' +
      '.sa-chip-err{background:#fee2e2;color:#b91c1c;}' +
      '.sa-chip-n{background:rgba(0,0,0,.12);padding:0 4px;border-radius:6px;}' +
      '.sa-audit-sub{font-size:11px;font-weight:700;color:#334155;margin:8px 0 4px;}' +
      // nowrap + the canvas's own overflow-x keeps all nine height grades on a
      // single row, the way the original sheet prints them.
      '.sa-layer-row{display:flex;flex-wrap:nowrap;gap:14px;align-items:flex-start;padding-bottom:8px;border-bottom:1px dashed #e2e8f0;}' +
      '.sa-layer-row:last-child{border-bottom:0;}' +
      '.sa-height-block{display:flex;flex-direction:column;align-items:center;gap:6px;}' +
      '.sa-svg-wrap{display:flex;align-items:flex-end;justify-content:center;}' +
      '.sa-legend-gap{height:7px;}' +
      '.sa-editing .sa-panel-svg [data-member-id]{cursor:move;}' +
      '.sa-editing .sa-panel-svg{touch-action:none;}' +
      '.sa-drag-tip{font-size:11px;color:#0369a1;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;padding:3px 8px;}' +
      '.sa-drag-hint{font-size:11px;color:#92400e;font-family:monospace;min-width:150px;}' +
      '.sa-panel-svg{display:block;}' +
      '.sa-legend{display:flex;flex-direction:column;gap:2px;min-width:96px;}' +
      '.sa-legend-row{display:flex;align-items:center;gap:5px;font-size:9.5px;cursor:pointer;}' +
      '.sa-legend-row:hover{background:#f1f5f9;}' +
      '.sa-legend-swatch{display:inline-block;width:16px;height:4px;border-radius:1px;}' +
      '.sa-legend-label{font-family:monospace;color:#0f172a;}' +
      '.sa-legend-label.sa-missing{color:#dc2626;text-decoration:underline dotted;}' +
      '.sa-legend-empty{font-size:10px;color:#94a3b8;}' +
      '.sa-side{flex:1 1 320px;min-width:300px;max-width:460px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;}'+
      '.sa-canvas.sa-sheet-mode{flex:1 1 720px;}' +
      '.sa-info-empty{color:#94a3b8;font-size:12.5px;text-align:center;padding:30px 10px;line-height:1.7;}' +
      '.sa-info-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;font-family:monospace;color:#0f172a;margin-bottom:4px;}' +
      '.sa-info-alias{font-size:11px;color:#64748b;margin-bottom:6px;}' +
      '.sa-info-note{font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;margin-bottom:8px;line-height:1.5;}' +
      '.sa-info-sec{font-size:11px;font-weight:700;color:#0369a1;border-bottom:1.5px solid #e0f2fe;padding-bottom:3px;margin:12px 0 6px;}' +
      '.sa-info-table{width:100%;border-collapse:collapse;font-size:11.5px;}' +
      '.sa-info-table td{padding:3px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top;}' +
      '.sa-info-table td:first-child{color:#64748b;width:76px;white-space:nowrap;}' +
      '.sa-row-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:5px;}' +
      '.sa-row-meta code{background:#e0f2fe;color:#0369a1;padding:1px 5px;border-radius:3px;font-weight:700;}' +
      '.sa-qty{color:#334155;}' +
      '.sa-formula{width:100%;min-height:80px;font-family:monospace;font-size:11.5px;line-height:1.5;padding:8px;border:1.5px solid #cbd5e1;border-radius:6px;resize:vertical;}' +
      '.sa-geom{min-height:52px;}' +
      '.sa-inp{width:100%;font-size:11.5px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;font-family:monospace;}' +
      '.sa-btn-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}' +
      '.sa-btn{padding:6px 11px;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;border:1.5px solid #cbd5e1;background:#fff;color:#334155;}' +
      '.sa-btn-primary{background:#0369a1;border-color:#0369a1;color:#fff;}' +
      '.sa-btn-danger{background:#fff;border-color:#fca5a5;color:#dc2626;}' +
      '.sa-btn-ghost:hover{background:#f1f5f9;}' +
      '.sa-formula-msg{font-size:11px;margin-top:6px;min-height:14px;}' +
      '.sa-msg-ok{color:#047857;} .sa-msg-err{color:#dc2626;}' +
      '.sa-var-help{font-size:10px;color:#64748b;margin-top:6px;font-family:monospace;line-height:1.5;}' +
      '.sa-err-box{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:6px;padding:8px 10px;font-size:11.5px;line-height:1.5;}' +
      '.sa-audit{margin-top:16px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;}' +
      '.sa-audit-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;}' +
      '.sa-audit-note{font-size:11px;font-weight:500;color:#64748b;margin-left:auto;}' +
      '.sa-badge{font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;}' +
      '.sa-badge-err{background:#fee2e2;color:#b91c1c;} .sa-badge-warn{background:#fef3c7;color:#92400e;}' +
      '.sa-badge-ok{background:#dcfce7;color:#166534;} .sa-badge-muted{background:#f1f5f9;color:#64748b;}' +
      '.sa-audit-ok{font-size:12px;color:#047857;}' +
      '.sa-audit-list{margin:0;padding-left:18px;font-size:11.5px;line-height:1.8;}' +
      '.sa-audit-list li{cursor:pointer;}' +
      '.sa-audit-err{color:#b91c1c;} .sa-audit-warn{color:#92400e;}' +
      '.sa-audit-list code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:10.5px;}' +
      "</style>";
  }

  // ---------------------------------------------------------------------------
  // Init / wiring
  // ---------------------------------------------------------------------------
  function fetchLayout() {
    return fetch(LAYOUT_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) { layout = json; loadError = null; })
      .catch(function (err) { loadError = err.message; console.error("[SteelAccessories] 도면 정의 로드 실패:", err); });
  }

  function init(db) {
    dbRef = db || null;
    overrides = loadLocalOverrides();
    return fetchLayout().then(function () {
      render();
      return syncFromFirestore(dbRef);
    });
  }

  // Re-render when the tab is opened or the tank configuration changes --
  // same self-wiring pattern as reinforcing_audit.js.
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      const tabBtn = document.querySelector('.tab-btn[data-tab="tab-steel-accessories"]');
      if (tabBtn) tabBtn.addEventListener("click", function () { render(); });
      ["tankWidth", "tankLength1", "tankLength2", "tankLength3", "tankLength4", "tankHeight",
        "numPartition", "reinfMethod", "boltMaterial", "sidePanelOnly", "partitionPanelOnly"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", function () {
          const tab = document.getElementById("tab-steel-accessories");
          if (tab && tab.classList.contains("active")) render();
        });
      });
    });
  }

  global.SteelAccessories = {
    init: init,
    render: render,
    getLayout: function () { return layout; },
    getOverrides: function () { return overrides; },
  };
})(typeof window !== "undefined" ? window : globalThis);
