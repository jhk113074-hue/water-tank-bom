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
// to Firestore `settings/steelAccessoriesLayout`. Registering a part on a
// position edits the override; "JSON 내보내기" produces a merged file to
// commit back over the shipped default, so git stays the source of truth.
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

  global.saClickPosition = function (posId) {
    const row = document.getElementById('sa-pos-row-' + posId);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const oldBg = row.style.background;
      row.style.background = '#fef08a'; // yellow highlight
      setTimeout(function() { row.style.background = oldBg; }, 1200);
      
      const input = row.querySelector('.sa-pos-partno');
      if (input) {
        setTimeout(function() { input.focus(); }, 400);
      }
    }
  };

  const LAYOUT_URL = "steel_accessories_layout.json?v=4.40.656_1787474186598";
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
  let matchingOpen = false;   // 품번 매칭 패널 표시 여부
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

  // ---------------------------------------------------------------------------
  // Part naming (거래처별 표기) -- see part_naming.js
  // ---------------------------------------------------------------------------
  // The DB's partNo stays the canonical key everywhere in this file: quantities,
  // rowId bindings and geometry all key off it. PartNaming only changes what a
  // part is CALLED on screen, and resolves a foreign label back to the canonical
  // part so a drawing labelled WBR-1610Z can still find DB record WCP-1610Z.
  function PN() { return global.PartNaming || null; }

  function canonicalPartNo(partNo) {
    const pn = PN();
    return pn && partNo ? pn.toCanonical(partNo) : partNo;
  }

  // What to print for a canonical part under the selected 거래처.
  function shownPartNo(partNo) {
    const pn = PN();
    return pn && partNo ? pn.displayPartNo(partNo) : partNo;
  }

  function resolveUnifiedPartNo(partNo, intMat) {
    if (!partNo || typeof partNo !== "string") return partNo;
    const m = partNo.match(/^([A-Z0-9]+)-([A-Z0-9]+?)(?:Z[\/\-])?SA2(?:[\/\-]|SA4|4|[A-Z0-9]+)+$/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      const codeNum = m[2];
      const mat = intMat || (typeof document !== "undefined" && document.getElementById("internalItem") ? document.getElementById("internalItem").value : "SS316");
      if (mat === "HDG" || mat === "Galvanized") {
        const zCode = `${prefix}-${codeNum}Z`;
        const plainCode = `${prefix}-${codeNum}`;
        const db = allParts() || [];
        if (db.some((p) => p.partNo === zCode)) return zCode;
        if (db.some((p) => p.partNo === plainCode)) return plainCode;
        return zCode;
      }
      const targetSuffix = (mat === "SS316") ? "SA4" : "SA2";
      return `${prefix}-${codeNum}${targetSuffix}`;
    }
    return partNo;
  }

  function lookupPart(partNo) {
    if (!partNo) return null;
    const resolvedCode = resolveUnifiedPartNo(partNo);
    const db = allParts();
    if (!db) return null;
    let direct = db.find((p) => p.partNo === resolvedCode);
    if (direct) return direct;
    if (resolvedCode !== partNo) {
      direct = db.find((p) => p.partNo === partNo);
      if (direct) return direct;
    }
    const canon = canonicalPartNo(resolvedCode);
    return (canon !== resolvedCode && db.find((p) => p.partNo === canon)) || null;
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
      applyCustomDiagramsAndTitles();
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      } catch (e) { /* ignore */ }
      render();
    }).catch(function (err) {
      console.warn("[SteelAccessories] Firestore 도면 오버라이드 불러오기 실패, localStorage만 사용:", err);
    });
  }

  function applyCustomDiagramsAndTitles() {
    if (!layout || !Array.isArray(layout.diagrams)) return;
    if (Array.isArray(overrides.deletedDiagrams) && overrides.deletedDiagrams.length > 0) {
      layout.diagrams = layout.diagrams.filter(function (d) {
        return !overrides.deletedDiagrams.includes(d.id);
      });
    }
    if (overrides.diagramTitles) {
      layout.diagrams.forEach(function (d) {
        if (overrides.diagramTitles[d.id]) {
          d.title = overrides.diagramTitles[d.id];
        }
      });
    }
    if (Array.isArray(overrides.customDiagrams)) {
      overrides.customDiagrams.forEach(function (cd) {
        if (!layout.diagrams.some(function (d) { return d.id === cd.id; })) {
          if (!Array.isArray(overrides.deletedDiagrams) || !overrides.deletedDiagrams.includes(cd.id)) {
            layout.diagrams.push(cd);
          }
        }
      });
    }
    if (Array.isArray(overrides.diagramOrder) && overrides.diagramOrder.length > 0) {
      layout.diagrams.sort(function (a, b) {
        const idxA = overrides.diagramOrder.indexOf(a.id);
        const idxB = overrides.diagramOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }
  }

  function renameDiagramPrompt(diagramId) {
    if (!diagramId) return;
    const diagram = getDiagram(diagramId);
    if (!diagram) return;
    const oldTitle = diagram.title || diagramId;
    const newTitle = prompt("변경할 탭 이름을 입력하세요:", oldTitle);
    if (!newTitle || newTitle.trim() === "" || newTitle.trim() === oldTitle) return;
    
    diagram.title = newTitle.trim();
    if (!overrides.diagramTitles) overrides.diagramTitles = {};
    overrides.diagramTitles[diagramId] = newTitle.trim();
    persistOverrides();
    render();
  }

  function copyDiagramPrompt(sourceDiagramId) {
    const srcId = sourceDiagramId || currentDiagramId;
    const srcDiagram = getDiagram(srcId);
    if (!srcDiagram) return;

    const defaultNewTitle = (srcDiagram.title || srcId) + " (복사본)";
    const newTitle = prompt("복사할 탭의 이름을 입력하세요:", defaultNewTitle);
    if (newTitle === null) return;

    const finalTitle = newTitle.trim() || defaultNewTitle;
    const newDiagramId = srcId + "_copy_" + Date.now();

    const clonedDiagram = JSON.parse(JSON.stringify(srcDiagram));
    clonedDiagram.id = newDiagramId;
    clonedDiagram.title = finalTitle;
    clonedDiagram.isCustom = true;
    clonedDiagram.members = JSON.parse(JSON.stringify(effectiveMembers(srcDiagram)));

    // Ensure clonedDiagram heightSpecs exist
    if (!clonedDiagram.heightSpecs) clonedDiagram.heightSpecs = {};

    const parties = (PN() && typeof PN().listParties === "function") ? PN().listParties() : ["YSACC (Default)"];
    if (!parties.includes("YSACC (Default)")) parties.unshift("YSACC (Default)");

    ALL_HEIGHTS.forEach(function (h) {
      parties.forEach(function (p) {
        const spec = effectiveHeightSpec(srcDiagram, h, p);
        if (spec) {
          const specClone = JSON.parse(JSON.stringify(spec));
          // If members were baked or custom, copy them explicitly
          specClone.members = JSON.parse(JSON.stringify(heightMembers(srcDiagram, h, p)));
          specClone.mode = "manual";
          writeHeightSpec(newDiagramId, h, specClone, p);
          if (p === "YSACC (Default)" || !clonedDiagram.heightSpecs[h]) {
            clonedDiagram.heightSpecs[h] = JSON.parse(JSON.stringify(specClone));
          }
        }
      });
    });

    // Copy any custom member patches or additions for all companies
    Object.keys(overrides).forEach(function (k) {
      if (k.startsWith("__added__::" + srcId)) {
        overrides["__added__::" + newDiagramId] = JSON.parse(JSON.stringify(overrides[k]));
      } else if (k.startsWith("__company_diagram__::") && k.endsWith("::" + srcId)) {
        const newKey = k.slice(0, k.length - srcId.length) + newDiagramId;
        overrides[newKey] = JSON.parse(JSON.stringify(overrides[k]));
      } else if (k.startsWith(srcId + "::")) {
        const newKey = newDiagramId + "::" + k.slice(srcId.length + 2);
        overrides[newKey] = JSON.parse(JSON.stringify(overrides[k]));
      }
    });

    if (layout && Array.isArray(layout.diagrams)) {
      layout.diagrams.push(clonedDiagram);
    }

    if (!overrides.customDiagrams) overrides.customDiagrams = [];
    overrides.customDiagrams.push(clonedDiagram);
    if (!overrides.diagramTitles) overrides.diagramTitles = {};
    overrides.diagramTitles[newDiagramId] = finalTitle;
    persistOverrides();

    currentDiagramId = newDiagramId;
    render();
    alert("탭이 성공적으로 복사되었습니다! (" + finalTitle + ")");
  }

  function deleteDiagramPrompt(diagramId) {
    if (!diagramId || !layout || !Array.isArray(layout.diagrams)) return;
    if (layout.diagrams.length <= 1) {
      alert("최소 1개의 도면 탭은 유지되어야 하므로 삭제할 수 없습니다.");
      return;
    }
    const diagram = getDiagram(diagramId);
    if (!diagram) return;

    if (!confirm("'" + (diagram.title || diagramId) + "' 탭을 삭제하시겠습니까?\n(해당 도면 탭이 도면 목록에서 완전히 제거됩니다.)")) return;

    layout.diagrams = layout.diagrams.filter(function (d) { return d.id !== diagramId; });
    if (overrides.customDiagrams) {
      overrides.customDiagrams = overrides.customDiagrams.filter(function (d) { return d.id !== diagramId; });
    }
    if (!overrides.deletedDiagrams) overrides.deletedDiagrams = [];
    if (!overrides.deletedDiagrams.includes(diagramId)) {
      overrides.deletedDiagrams.push(diagramId);
    }
    persistOverrides();

    if (currentDiagramId === diagramId) {
      currentDiagramId = layout.diagrams[0] ? layout.diagrams[0].id : "int_side";
    }
    render();
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

  function togglePositionEnabled(diagram, hStr, posId, enabled) {
    const key = heightSpecKey(diagram.id, String(hStr));
    const shipped = (diagram.heightSpecs || {})[String(hStr)];

    if (!overrides[key]) {
      overrides[key] = shipped ? JSON.parse(JSON.stringify(shipped)) : {};
    }

    if (!overrides[key].positions) {
      overrides[key].positions = shipped && shipped.positions ? JSON.parse(JSON.stringify(shipped.positions)) : {};
    }

    if (!overrides[key].positions[posId]) {
      overrides[key].positions[posId] = shipped && shipped.positions && shipped.positions[posId]
        ? JSON.parse(JSON.stringify(shipped.positions[posId]))
        : {};
    }

    overrides[key].positions[posId].enabled = enabled;
    persistOverrides();
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
  function heightSpecKey(diagramId, hStr, party) {
    const p = party !== undefined ? party : (PN() ? PN().activeParty() : "YSACC (Default)");
    if (!p || p === "YSACC (Default)" || p === "표준" || p === "표준 (Standard)") {
      return HEIGHTSPEC_PREFIX + diagramId + "::" + hStr;
    }
    return HEIGHTSPEC_PREFIX + p + "::" + diagramId + "::" + hStr;
  }

  function effectiveHeightSpec(diagram, hStr, party) {
    const p = party !== undefined ? party : (PN() ? PN().activeParty() : "YSACC (Default)");
    const cleanP = (p && p !== "표준" && p !== "표준 (Standard)") ? p : "YSACC (Default)";
    const shipped = (diagram.heightSpecs || {})[String(hStr)];
    
    // Check company's override; if none exists, inherit from YSACC (Default) override or shipped default
    let ov = overrides[heightSpecKey(diagram.id, String(hStr), cleanP)];
    if (!ov && cleanP !== "YSACC (Default)") {
      ov = overrides[heightSpecKey(diagram.id, String(hStr), "YSACC (Default)")];
    }

    if (ov) {
      if (shipped && shipped.positions) {
        if (!ov.positions) {
          ov.positions = JSON.parse(JSON.stringify(shipped.positions));
        } else {
          Object.keys(shipped.positions).forEach(function (posId) {
            if (!ov.positions[posId]) {
              ov.positions[posId] = JSON.parse(JSON.stringify(shipped.positions[posId]));
            }
          });
        }
      }
      if (shipped && shipped.panelStructure && !ov.panelStructure) {
        ov.panelStructure = JSON.parse(JSON.stringify(shipped.panelStructure));
      }
      if (String(hStr) === "1.5") {
        ov.cols = 2.5;
        ov.panelStructure = {
          note: "1.5mH: Left 1mx1.5m + Center 0.5mx1m(bot)/0.5mx0.5m(top) + Right 1mx1.5m",
          sections: [
            { id: "L", xRange: [0, 1], yRange: [0, 1.5] },
            { id: "C_bot", xRange: [1, 1.5], yRange: [0, 1] },
            { id: "C_top", xRange: [1, 1.5], yRange: [1, 1.5] },
            { id: "R", xRange: [1.5, 2.5], yRange: [0, 1.5] }
          ]
        };
      }
      return ov;
    }
    return shipped || null;
  }

  function heightSpecMode(diagram, hStr, party) {
    const spec = effectiveHeightSpec(diagram, hStr, party);
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
      out.xs = (g.xs || []).map(function (x) { return round2(coord(x, scope, 0)); });
      out.yFrom = round2(coord(g.yFrom, scope, 0));
      out.yStep = round2(coord(g.yStep, scope, 1));
      out.yTo = round2(coord(g.yTo, scope, scope.H_O));
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

  // An LV bar's span around its anchor joint (posY). Up to 1m of length
  // hangs BELOW the joint (the panel it braces); anything past 1m -- e.g.
  // WFB-1200Z's extra 0.2m -- continues ABOVE the joint instead of further
  // down, since the overlap for the connection sits on the upper panel.
  function lvBarRange(posY, partLen) {
    if (partLen == null) {
      const y1 = Number.isInteger(posY) ? Math.max(0, posY - 1) : Math.floor(posY);
      return { y1: y1, y2: posY };
    }
    if (partLen > 1) {
      return { y1: Math.max(0, posY - 1), y2: posY + (partLen - 1) };
    }
    return { y1: Math.max(0, posY - partLen), y2: posY };
  }

  function derivePositionGeom(diagram, hStr, posId, partNo) {
    const spec = effectiveHeightSpec(diagram, hStr);
    const posSpec = (spec && spec.positions) ? spec.positions[posId] : null;
    const H = (spec && spec.H_O) || parseFloat(hStr);
    const cols = (spec && spec.cols) || (diagram && diagram.cols) || 3;

    if (!posSpec) return { kind: "h", y: 0, x1: 0, x2: cols };

    if (posId.startsWith("CS") || posSpec.axis === "cs") {
      const posY = posSpec.y != null ? posSpec.y : 0;
      const xArr = Array.isArray(posSpec.x) ? posSpec.x : [posSpec.x];
      const x1s = xArr.map(function(x) { return Math.max(0, x - 0.25); });
      const x2s = xArr.map(function(x) { return Math.min(cols, x + 0.25); });
      return { kind: "h", y: posY, x1: x1s, x2: x2s };
    }

    if (posId.startsWith("LV") || posSpec.kind === "v") {
      // LV bars are drawn at their real physical length (from the part
      // number, e.g. WFB-0950ZP = 0.95m), ending at the joint/edge the
      // position marks -- not stretched across the whole panel.
      const posY = posSpec.y != null ? posSpec.y : H;
      const partLen = partLengthM(partNo);
      const range = lvBarRange(posY, partLen);
      return { kind: "v", x: posSpec.x, y1: posSpec.yMin != null ? posSpec.yMin : range.y1, y2: posSpec.yMax != null ? posSpec.yMax : range.y2 };
    }

    const yVal = posSpec.y != null ? posSpec.y : 0;
    const xArr = Array.isArray(posSpec.x) ? posSpec.x : [posSpec.x];

    if (cols === 2.5) {
      // 1.5mH, 2.5mH, 3.5mH, 4.5mH: Left 1m [0,1], Center 0.5m [1,1.5], Right 1m [1.5,2.5]
      if (xArr.length === 1) {
        return { kind: "h", y: yVal, x1: 1.0, x2: 1.5 };
      } else {
        return { kind: "h", y: yVal, x1: [0, 1.5], x2: [1.0, 2.5] };
      }
    } else if (cols === 3) {
      // 1mH, 2mH, 3mH, 4mH, 5mH: 3 panels of 1m each
      if (xArr.length === 1) {
        return { kind: "h", y: yVal, x1: 1.0, x2: 2.0 };
      } else {
        return { kind: "h", y: yVal, x1: [0, 2.0], x2: [1.0, 3.0] };
      }
    }

    if (xArr.length === 1) {
      return { kind: "h", y: yVal, x1: Math.max(0, xArr[0] - 0.5), x2: Math.min(cols, xArr[0] + 0.5) };
    }
    const x1s = xArr.map(function(x) { return Math.max(0, x - 0.5); });
    const x2s = xArr.map(function(x) { return Math.min(cols, x + 0.5); });
    return { kind: "h", y: yVal, x1: x1s, x2: x2s };
  }

  // THE accessor. Every renderer/audit path goes through this, so none of them
  // needs to know whether a height is auto or manual -- and coordinates handed
  // out here are always literal numbers.
  function heightMembers(diagram, hStr, party) {
    const p = party !== undefined ? party : (PN() ? PN().activeParty() : "YSACC (Default)");
    const cleanP = (p && p !== "표준" && p !== "표준 (Standard)") ? p : "YSACC (Default)";
    const spec = effectiveHeightSpec(diagram, hStr, cleanP);
    const raw = (spec && spec.mode === "manual" && Array.isArray(spec.members)) ? spec.members : bakeHeightSpec(diagram, hStr);
    return raw.map(function (m) {
      if (m.positionId) {
        const copy = Object.assign({}, m);
        copy.geom = derivePositionGeom(diagram, hStr, m.positionId, m.partNo);
        return copy;
      }
      return m;
    });
  }

  function writeHeightSpec(diagramId, hStr, spec, party) {
    const p = party !== undefined ? party : (PN() ? PN().activeParty() : "YSACC (Default)");
    const cleanP = (p && p !== "표준" && p !== "표준 (Standard)") ? p : "YSACC (Default)";
    overrides[heightSpecKey(diagramId, String(hStr), cleanP)] = spec;
    if (cleanP === "YSACC (Default)") {
      overrides[HEIGHTSPEC_PREFIX + diagramId + "::" + hStr] = spec;
    }
    persistOverrides();
  }

  // First edit on an "auto" height freezes the baked list as its own definition.
  // Returns the (now guaranteed manual) member array, ready to be mutated.
  function detachHeight(diagram, hStr, party) {
    const p = party !== undefined ? party : (PN() ? PN().activeParty() : "YSACC (Default)");
    const cleanP = (p && p !== "표준" && p !== "표준 (Standard)") ? p : "YSACC (Default)";
    if (heightSpecMode(diagram, hStr, cleanP) === "manual") {
      return effectiveHeightSpec(diagram, hStr, cleanP).members;
    }
    const members = bakeHeightSpec(diagram, hStr);
    const shipped = (diagram.heightSpecs || {})[String(hStr)] || {};
    writeHeightSpec(diagram.id, hStr, {
      mode: "manual",
      sheetTitle: shipped.sheetTitle || null,
      positions: shipped.positions ? JSON.parse(JSON.stringify(shipped.positions)) : null,
      panelStructure: shipped.panelStructure ? JSON.parse(JSON.stringify(shipped.panelStructure)) : null,
      members: members,
    }, cleanP);
    return effectiveHeightSpec(diagram, hStr, cleanP).members;
  }

  // Drop this height's local edits so it falls back to the shipped definition
  // (which is itself a complete, position-based manual spec -- there is no
  // separate "auto" baked mode to fall back to).
  function resetHeight(diagram, hStr, party) {
    const p = party !== undefined ? party : (PN() ? PN().activeParty() : "YSACC (Default)");
    const cleanP = (p && p !== "표준" && p !== "표준 (Standard)") ? p : "YSACC (Default)";
    delete overrides[HEIGHTSPEC_PREFIX + cleanP + "::" + diagram.id + "::" + hStr];
    if (cleanP === "YSACC (Default)") {
      delete overrides[HEIGHTSPEC_PREFIX + diagram.id + "::" + hStr];
      delete overrides[HEIGHTSPEC_PREFIX + "spec_" + hStr];
    }
    persistOverrides();
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
  // Always CANONICAL: a member may have been authored with a 거래처 label, but
  // everything downstream (grouping, quantity comparison, DB lookup) has to key
  // off the catalog's own number or the same part would split into two rows.
  function memberPartNo(member, detail) {
    const raw = member.partNo || (detail && detail.partNo) || null;
    return raw ? canonicalPartNo(raw) : null;
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

  function getDefaultScaleForPosition(m, diagram, hStr, scope) {
    if (!m) return "";

    // 1. Primary: Probe scale candidates if rowId is connected
    if (m.rowId) {
      try {
        const diagramObj = (typeof diagram === "object" && diagram) ? diagram : (getDiagram(diagram || (renderCtx ? renderCtx.diagramId : "int_side")));
        if (diagramObj) {
          const cfg = readConfig();
          const members = heightMembers(diagramObj, hStr || (renderCtx ? renderCtx.hSel : "3"));
          const me = members.find(function (x) { return x.memberId === m.memberId; }) || m;
          const siblings = members.reduce(function (a, x) {
            return x.rowId === me.rowId ? a + memberInstanceCount(x, hStr) : a;
          }, 0) || 1;

          const probeScope = scope || engineScope(cfg, diagramObj, hStr);
          const detailMap = rowDetailMap(cfg, diagramObj, hStr);
          const detail = detailMap ? detailMap[me.rowId] : null;

          if (probeScope && detail) {
            const survivors = SCALE_CANDIDATES.filter(function (expr) {
              return SCALE_PROBE_CONFIGS.every(function (probe) {
                const pcfg = Object.assign({}, cfg, probe, { h: parseFloat(hStr || 3) });
                const sc = engineScope(pcfg, diagramObj, hStr);
                const dtMap = rowDetailMap(pcfg, diagramObj, hStr);
                const dt = dtMap ? dtMap[me.rowId] : null;
                if (!sc || !dt) return false;
                try {
                  const v = global.RuleEngine.evaluate(expr, sc);
                  if (typeof v !== "number" || !isFinite(v)) return false;
                  return Math.round(v * siblings) === Math.round(dt.value);
                } catch (e) { return false; }
              });
            });

            if (survivors.length > 0) {
              return survivors[0];
            }
          }
        }
      } catch (e) {}
    }

    // 2. Position-based default rule fallback by position ID prefix:
    const pos = (m.positionId || m.memberId || "").toUpperCase();
    if (pos.startsWith("LH")) {
      if (pos === "LH1" || pos === "LH3" || pos === "LH5" || pos.includes("1M") || pos.includes("WHOLE")) {
        return "(W_C+L1_C+L2_C+L3_C+L4_C)*2";
      }
      return "(W_F+L1_F+L2_F+L3_F+L4_F)*2";
    } else if (pos.startsWith("LV")) {
      if (pos === "LV1" || pos === "LV4" || pos.includes("CORNER") || pos.includes("CNR")) {
        return "4*2";
      }
      return "perim*2";
    } else if (pos.startsWith("CS")) {
      return "(W_C+L1_C+L2_C+L3_C+L4_C)*2";
    }
    return "perim*2";
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
      let expr = m.scale;
      if (expr == null || String(expr).trim() === "") {
        expr = getDefaultScaleForPosition(m, null, hStr, scope);
      }
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
  function courseSeams(hStr, diagram, party) {
    const H = parseFloat(hStr);
    const dId = ((diagram && (diagram.id || '')) + ' ' + (diagram && (diagram.title || ''))).toLowerCase();
    const isParti1m = dId.includes('part') || dId.includes('parti') || dId.includes('int_part');
    const isSide1m = (dId.includes('1x1') || dId.includes('side_1m') || dId.includes('side1m') || dId.includes('int_side_1x1')) && !isParti1m;

    if (isSide1m) {
      const pn = PN();
      const p = party || (pn ? pn.activeParty() : "YSACC (Default)");
      let custId = 'default';
      if (p === 'MNT') custId = 'mnt_spec';
      else if (p === 'WATANI') custId = 'watani_spec';
      else if (p === 'HAYOUNG') custId = 'hayoung_spec';
      else if (p === 'ALMUFTAH') custId = 'almuftah';
      else if (typeof window !== 'undefined' && typeof window.getMatrixCustomerPresetList === 'function') {
        const allCusts = window.getMatrixCustomerPresetList();
        const matched = allCusts.find(c => c.name.replace(/\s*Spec$/i, '').trim() === p.replace(/\s*Spec$/i, '').trim() || c.id === p);
        if (matched) custId = matched.id;
      }

      const numSlices = (H === 1.5) ? 2 : (H === 2.5) ? 3 : (H === 3.5) ? 4 : (H === 4.5) ? 5 : Math.round(H);
      const matrixData = (typeof window !== 'undefined' && typeof window.getCustomerMatrixStorage === 'function')
        ? window.getCustomerMatrixStorage(custId, 2)
        : null;
      const matrixMap = {};
      if (matrixData && Array.isArray(matrixData)) {
        matrixData.forEach(function(r) { matrixMap[r.key] = r; });
      }

      const seams = [];
      let curY = 0;
      for (let si = 0; si < numSlices - 1; si++) {
        const wKey = 'side1x1.' + H + '.slice' + si + '.wide';
        const row = matrixMap[wKey];
        let sM = 1.0;
        if (row && row.label) {
          const match = row.label.match(/\(([\d\.]+)m\)/);
          if (match) sM = parseFloat(match[1]);
        } else if (H.toString().includes('.5') && si === numSlices - 1) {
          sM = 0.5;
        }
        curY += sM;
        if (curY > 0.001 && curY < H - 0.001) seams.push(round2(curY));
      }
      return seams;
    }

    if (isParti1m) {
      const pn = PN();
      const p = party || (pn ? pn.activeParty() : "YSACC (Default)");
      let custId = 'default';
      if (p === 'MNT') custId = 'mnt_spec';
      else if (p === 'WATANI') custId = 'watani_spec';
      else if (p === 'HAYOUNG') custId = 'hayoung_spec';
      else if (p === 'ALMUFTAH') custId = 'almuftah';
      else if (typeof window !== 'undefined' && typeof window.getMatrixCustomerPresetList === 'function') {
        const allCusts = window.getMatrixCustomerPresetList();
        const matched = allCusts.find(c => c.name.replace(/\s*Spec$/i, '').trim() === p.replace(/\s*Spec$/i, '').trim() || c.id === p);
        if (matched) custId = matched.id;
      }

      var numSlices = (H === 1.5) ? 2 : (H === 2.5) ? 3 : (H === 3.5) ? 4 : (H === 4.5) ? 5 : Math.round(H);
      var baseTiers = [];
      for (var bi = 0; bi < numSlices; bi++) {
        baseTiers.push({ sizeM: (H.toString().includes('.5') && bi === numSlices - 1) ? 0.5 : 1.0 });
      }
      var order = (typeof window !== 'undefined' && typeof window.getOption4SliceOrder === 'function')
        ? window.getOption4SliceOrder(custId, H)
        : null;
      var slices = [];
      if (order && order.length === baseTiers.length) {
        for (var oi = 0; oi < order.length; oi++) slices.push(baseTiers[order[oi]]);
      } else {
        slices = baseTiers;
      }

      const pSeams = [];
      let pCurY = 0;
      for (var si = 0; si < slices.length - 1; si++) {
        pCurY += slices[si].sizeM;
        if (pCurY > 0.001 && pCurY < H - 0.001) pSeams.push(round2(pCurY));
      }
      return pSeams;
    }

    const PR = global.PanelRules;
    const table = PR && PR.COURSE_TABLE;
    const courses = table && table[String(hStr)];
    if (!Array.isArray(courses)) {
      const out = [];
      for (let y = 1; y < H - 0.001; y += 1) out.push(y);
      return out;
    }
    // COURSE_TABLE lists the top course first; stack from the bottom up.
    const bottomUp = courses.slice().reverse();
    const stdSeams = [];
    let y = 0;
    for (let i = 0; i < bottomUp.length - 1; i++) {
      y += COURSE_HEIGHT_M[bottomUp[i]] || 1;
      if (y > 0.001 && y < H - 0.001) stdSeams.push(round2(y));
    }
    return stdSeams;
  }

  // Every y a member may legitimately sit at: the floor, each panel joint, and
  // the top of the wall. Used to snap dragging onto real joints.
  function snapYsFor(hStr, diagram, party) {
    return [0].concat(courseSeams(hStr, diagram, party), [parseFloat(hStr)]);
  }

  // ---------------------------------------------------------------------------
  // SVG rendering of ONE height panel
  // ---------------------------------------------------------------------------
  function buildPanelSvg(diagram, hStr, opts) {
    const o = opts || {};
    const pxPerM = o.pxPerM || 40;
    const heightSpec = effectiveHeightSpec(diagram, hStr);
    const cols = (heightSpec && heightSpec.cols) || diagram.cols || 3;
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

    function renderSectionCadPanel(px, py, pw, ph, isPartition) {
      let out = '';
      const strokeColor = isPartition ? "#db2777" : "#334155";
      const fillColor = isPartition ? "#fdf2f8" : "#f8fafc";
      const innerFill = isPartition ? "#fce7f3" : "#f1f5f9";
      const innerStroke = isPartition ? "#f472b6" : "#94a3b8";
      const creaseColor = isPartition ? "#ec4899" : "#64748b";

      out += '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="1" rx="1.5"/>';

      const padX = pw * 0.12;
      const padY = Math.min(pw * 0.12, ph * 0.12);
      const ix = px + padX, iy = py + padY;
      const iw = pw - padX * 2, ih = ph - padY * 2;

      const mH = Math.round((ph / pxPerM) * 10) / 10;
      const mW = Math.round((pw / pxPerM) * 10) / 10;

      if (mW <= 0.6) {
        // 0.5m column panel
        out += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="' + innerFill + '" stroke="' + innerStroke + '" stroke-width="0.8" rx="1"/>';
        out += '<line x1="' + (px + pw / 2) + '" y1="' + iy + '" x2="' + (px + pw / 2) + '" y2="' + (iy + ih) + '" stroke="' + creaseColor + '" stroke-width="0.8" stroke-dasharray="2,2"/>';
      } else if (!isPartition && mH >= 1.8) {
        // 2.0m Pillow panel
        out += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="' + innerFill + '" stroke="' + innerStroke + '" stroke-width="0.8" rx="3"/>';
        const arcY1 = iy + 14, arcY2 = iy + ih - 14;
        out += '<path d="M ' + (ix + 4) + ' ' + iy + ' Q ' + (px + pw / 2) + ' ' + arcY1 + ' ' + (ix + iw - 4) + ' ' + iy + '" fill="none" stroke="' + creaseColor + '" stroke-width="0.9"/>';
        out += '<path d="M ' + (ix + 4) + ' ' + (iy + ih) + ' Q ' + (px + pw / 2) + ' ' + arcY2 + ' ' + (ix + iw - 4) + ' ' + (iy + ih) + '" fill="none" stroke="' + creaseColor + '" stroke-width="0.9"/>';
        out += '<line x1="' + ix + '" y1="' + (iy + ih * 0.38) + '" x2="' + (ix + iw) + '" y2="' + (iy + ih * 0.38) + '" stroke="' + creaseColor + '" stroke-width="0.9"/>';
        out += '<line x1="' + ix + '" y1="' + (iy + ih * 0.62) + '" x2="' + (ix + iw) + '" y2="' + (iy + ih * 0.62) + '" stroke="' + creaseColor + '" stroke-width="0.9"/>';
      } else if (!isPartition && mH >= 1.3) {
        // 1.5m Pillow panel
        out += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="' + innerFill + '" stroke="' + innerStroke + '" stroke-width="0.8" rx="3"/>';
        const arcY1 = iy + 12, arcY2 = iy + ih - 12;
        out += '<path d="M ' + (ix + 4) + ' ' + iy + ' Q ' + (px + pw / 2) + ' ' + arcY1 + ' ' + (ix + iw - 4) + ' ' + iy + '" fill="none" stroke="' + creaseColor + '" stroke-width="0.9"/>';
        out += '<path d="M ' + (ix + 4) + ' ' + (iy + ih) + ' Q ' + (px + pw / 2) + ' ' + arcY2 + ' ' + (ix + iw - 4) + ' ' + (iy + ih) + '" fill="none" stroke="' + creaseColor + '" stroke-width="0.9"/>';
        out += '<line x1="' + ix + '" y1="' + (iy + ih * 0.5) + '" x2="' + (ix + iw) + '" y2="' + (iy + ih * 0.5) + '" stroke="' + creaseColor + '" stroke-width="0.9"/>';
      } else {
        // 1x1m or 1x0.5m Pyramid X-emboss panel
        out += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="' + innerFill + '" stroke="' + innerStroke + '" stroke-width="0.8" rx="2"/>';
        out += '<line x1="' + px + '" y1="' + py + '" x2="' + ix + '" y2="' + iy + '" stroke="' + creaseColor + '" stroke-width="0.8"/>';
        out += '<line x1="' + (px + pw) + '" y1="' + py + '" x2="' + (ix + iw) + '" y2="' + iy + '" stroke="' + creaseColor + '" stroke-width="0.8"/>';
        out += '<line x1="' + px + '" y1="' + (py + ph) + '" x2="' + ix + '" y2="' + (iy + ih) + '" stroke="' + creaseColor + '" stroke-width="0.8"/>';
        out += '<line x1="' + (px + pw) + '" y1="' + (py + ph) + '" x2="' + (ix + iw) + '" y2="' + (iy + ih) + '" stroke="' + creaseColor + '" stroke-width="0.8"/>';
        out += '<line x1="' + ix + '" y1="' + iy + '" x2="' + (ix + iw) + '" y2="' + (iy + ih) + '" stroke="' + creaseColor + '" stroke-width="0.7" stroke-dasharray="2,2"/>';
        out += '<line x1="' + (ix + iw) + '" y1="' + iy + '" x2="' + ix + '" y2="' + (iy + ih) + '" stroke="' + creaseColor + '" stroke-width="0.7" stroke-dasharray="2,2"/>';
      }
      return out;
    }

    const dId = ((diagram && (diagram.id || '')) + ' ' + (diagram && (diagram.title || ''))).toLowerCase();
    const isSide1m = dId.includes('1x1') || dId.includes('side_1m') || dId.includes('side1m') || dId.includes('int_side_1x1');
    const isParti1m = (dId.includes('part') && (dId.includes('1x1') || dId.includes('1m'))) || dId.includes('part_1m') || dId.includes('part1m') || dId.includes('int_part_1x1');
    const isPartiStd = dId.includes('part') && !isParti1m;

    const pn = PN();
    const activeParty = (pn && pn.activeParty()) || 'YSACC (Default)';
    let custId = 'default';
    if (activeParty === 'MNT') custId = 'mnt_spec';
    else if (activeParty === 'WATANI') custId = 'watani_spec';
    else if (activeParty === 'HAYOUNG') custId = 'hayoung_spec';
    else if (activeParty === 'ALMUFTAH') custId = 'almuftah';
    else if (typeof window !== 'undefined' && typeof window.getMatrixCustomerPresetList === 'function') {
      const allCusts = window.getMatrixCustomerPresetList();
      const matched = allCusts.find(c => c.name.replace(/\s*Spec$/i, '').trim() === activeParty.replace(/\s*Spec$/i, '').trim() || c.id === activeParty);
      if (matched) custId = matched.id;
    }

    if (isSide1m) {
      // Dynamic Option 2 Slices from active company's panelMatrix
      var numSlices = (H === 1.5) ? 2 : (H === 2.5) ? 3 : (H === 3.5) ? 4 : (H === 4.5) ? 5 : Math.round(H);
      var slices = [];
      var matrixData = (typeof window !== 'undefined' && typeof window.getCustomerMatrixStorage === 'function')
        ? window.getCustomerMatrixStorage(custId, 2)
        : null;
      var matrixMap = {};
      if (matrixData && Array.isArray(matrixData)) {
        matrixData.forEach(function(r) { matrixMap[r.key] = r; });
      }

      for (var si = 0; si < numSlices; si++) {
        var wKey = 'side1x1.' + H + '.slice' + si + '.wide';
        var row = matrixMap[wKey];
        var sM = 1.0;
        if (row && row.label) {
          var match = row.label.match(/\(([\d\.]+)m\)/);
          if (match) sM = parseFloat(match[1]);
        } else if (H.toString().includes('.5') && si === numSlices - 1) {
          sM = 0.5;
        }
        slices.push({ sizeM: sM });
      }

      var curY = 0;
      for (var sIdx = 0; sIdx < slices.length; sIdx++) {
        var sl = slices[sIdx];
        var sHeightM = sl.sizeM || 1.0;
        var yB = curY, yT = curY + sHeightM;
        var py = Y(yT), ph = Y(yB) - Y(yT);

        // Col 0: Wide 1m
        s += renderSectionCadPanel(X(0), py, X(1) - X(0), ph, false);
        // Col 1: Narrow 0.5m
        s += renderSectionCadPanel(X(1), py, X(1.5) - X(1), ph, false);
        // Col 2: Wide 1m
        s += renderSectionCadPanel(X(1.5), py, X(2.5) - X(1.5), ph, false);

        curY += sHeightM;
      }
    } else if (isParti1m) {
      var numSlices = (H === 1.5) ? 2 : (H === 2.5) ? 3 : (H === 3.5) ? 4 : (H === 4.5) ? 5 : Math.round(H);
      var baseTiers = [];
      for (var bi = 0; bi < numSlices; bi++) {
        baseTiers.push({ sizeM: (H.toString().includes('.5') && bi === numSlices - 1) ? 0.5 : 1.0 });
      }
      var order = (typeof window !== 'undefined' && typeof window.getOption4SliceOrder === 'function')
        ? window.getOption4SliceOrder(custId, H)
        : null;
      var slices = [];
      if (order && order.length === baseTiers.length) {
        for (var oi = 0; oi < order.length; oi++) slices.push(baseTiers[order[oi]]);
      } else {
        slices = baseTiers;
      }

      var curY = 0;
      for (var sIdx = 0; sIdx < slices.length; sIdx++) {
        var sl = slices[sIdx];
        var sHeightM = sl.sizeM || 1.0;
        var yB = curY, yT = curY + sHeightM;
        var py = Y(yT), ph = Y(yB) - Y(yT);
        s += renderSectionCadPanel(X(0), py, X(1) - X(0), ph, true);
        s += renderSectionCadPanel(X(1), py, X(1.5) - X(1), ph, true);
        s += renderSectionCadPanel(X(1.5), py, X(2.5) - X(1.5), ph, true);
        curY += sHeightM;
      }
    } else if (heightSpec && heightSpec.panelStructure && heightSpec.panelStructure.sections) {
      const sections = heightSpec.panelStructure.sections || [];
      sections.forEach(function (sec) {
        if (!sec.xRange) return;
        const x1 = sec.xRange[0], x2 = sec.xRange[1];
        const yMin = (sec.yRange && sec.yRange[0]) || 0;
        const yMax = (sec.yRange && sec.yRange[1]) || H;
        if (yMax <= 0 || yMin >= H) return;
        const yT = Math.min(H, yMax), yB = Math.max(0, yMin);
        const px = X(x1), py = Y(yT), pw = X(x2) - X(x1), ph = Y(yB) - Y(yT);
        s += renderSectionCadPanel(px, py, pw, ph, isPartiStd);
      });
    } else {
      // Fallback: build panels from seams
      const allYs = snapYsFor(hStr);
      for (let i = 0; i < allYs.length - 1; i++) {
        const yB = allYs[i], yT = allYs[i + 1];
        for (let c = 0; c < cols; c++) {
          const px = X(c), py = Y(yT), pw = X(c + 1) - X(c), ph = Y(yB) - Y(yT);
          s += renderSectionCadPanel(px, py, pw, ph, isPartiStd);
        }
      }
    }

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

    // Several DIFFERENT parts are routinely installed on the same joint (the
    // 3mH sheet stacks WFB-0950Z, WFB-0950ZP and WFB-0450Z on one line). Drawn
    // literally they would sit exactly on top of each other and the sheet would
    // show only whichever painted last, so co-located members are fanned apart
    // by a few PIXELS perpendicular to their run. The offset is presentation
    // only -- `geom` is untouched, so position, hit-testing and dragging all
    // still refer to the one true location.
    const OVERLAP_PX = 4;
    const stackSeen = {};
    function stackIndex(g) {
      let sig;
      if (g.kind === "h") sig = "h|" + g.y + "|" + g.x1 + "|" + g.x2;
      else if (g.kind === "v") sig = "v|" + g.x + "|" + g.y1 + "|" + g.y2;
      else if (g.kind === "rect") sig = "rect|" + g.x1 + "|" + g.x2 + "|" + g.y + "|" + g.h;
      else return 0;
      const n = stackSeen[sig] || 0;
      stackSeen[sig] = n + 1;
      return n;
    }

    members.forEach(function (m) {
      if (o.diagramType === 'cs') {
        if (!m.positionId || !m.positionId.startsWith("CS")) return;
      } else if (o.diagramType === 'reinforcing') {
        if (m.positionId && m.positionId.startsWith("CS")) return;
      }
      const g = m.geom || {};
      const detail = m.rowId ? detailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail);
      if (!partNo) return;
      const color = memberColor(m, partNo);
      const selected = selectedMemberId === m.memberId;
      const sw = selected ? 5 : 3;
      const tip = esc((shownPartNo(partNo) || m.aliasLabel || m.memberId) + (m.rowId ? "  [" + m.rowId + "]" : "  [수식 미연결]"));
      const attrs = ' data-member-id="' + esc(m.memberId) + '" style="cursor:pointer;"' +
        (selected ? ' opacity="1"' : '');

      // Pixel nudge that keeps stacked parts distinguishable (see stackIndex).
      const nth = stackIndex(g) * OVERLAP_PX;
      let ox = 0, oy = 0;
      if (g.kind === "h") oy = nth;            // stack downward on screen
      else if (g.kind === "v") ox = nth;       // stack rightward

      // oxA/oyA nudge the start point, oxB/oyB the end point (defaulting to the
      // start's), so a frame's rail can follow legs that have been fanned out
      // in opposite directions.
      function line(x1, y1, x2, y2, oxA, oyA, oxB, oyB) {
        const ax = oxA === undefined ? ox : oxA;
        const ay = oyA === undefined ? oy : oyA;
        const bx = oxB === undefined ? ax : oxB;
        const by = oyB === undefined ? ay : oyB;
        const X1 = X(x1) + ax, Y1 = Y(y1) + ay, X2 = X(x2) + bx, Y2 = Y(y2) + by;
        // A wide yellow halo under the real line makes "which bar is this
        // table row?" answerable at a glance when the table's 위치 chip is
        // clicked -- the badge itself is gone once a part is registered.
        const halo = selected
          ? '<line x1="' + X1 + '" y1="' + Y1 + '" x2="' + X2 + '" y2="' + Y2 +
            '" stroke="#facc15" stroke-width="' + (sw + 8) + '" stroke-linecap="round" opacity="0.85"/>'
          : "";
        return halo + '<line x1="' + X1 + '" y1="' + Y1 + '" x2="' + X2 + '" y2="' + Y2 +
          '" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="square"' + attrs +
          '><title>' + tip + '</title></line>';
      }

      if (g.kind === "h") {
        const y = coord(g.y, scope, 0);
        if (y < -0.01 || y > H + 0.01) return;
        const x1Array = Array.isArray(g.x1) ? g.x1 : [g.x1];
        const x2Array = Array.isArray(g.x2) ? g.x2 : [g.x2];
        const len = Math.max(x1Array.length, x2Array.length);
        for (let i = 0; i < len; i++) {
          const vx1 = x1Array[i] !== undefined ? x1Array[i] : x1Array[0];
          const vx2 = x2Array[i] !== undefined ? x2Array[i] : x2Array[0];
          s += line(coord(vx1, scope, 0), y, coord(vx2, scope, cols), y);
        }
      } else if (g.kind === "v") {
        const y1 = coord(g.y1, scope, 0), y2 = coord(g.y2, scope, H);
        if (y2 < -0.01 || y1 > H + 0.01) return;
        const xArray = Array.isArray(g.x) ? g.x : [g.x];
        for (let i = 0; i < xArray.length; i++) {
          const x = coord(xArray[i], scope, 0);
          s += line(x, Math.max(0, y1), x, Math.min(H, y2));
        }
      } else if (g.kind === "rect") {
        const x1 = coord(g.x1, scope, 0), x2 = coord(g.x2, scope, cols);
        const y = coord(g.y, scope, 0), hh = coord(g.h, scope, 1);
        const yTop = Math.min(H, y + hh), yBot = Math.max(0, y);
        if (yTop <= 0) return;
        // Frames nest OUTWARD so each ㄷ자 stays readable inside the previous.
        const legL = -nth, legR = nth, rail = -nth;
        // open: which side of the frame is left OFF.
        //   "bottom" (default) -> legs + top      "top"  -> legs + bottom
        //   "none"             -> closed frame    "both" -> legs only
        // "both" exists because a ㄷ자 is not always one part: on the 1.5mH
        // sheet the two uprights are WFB-1200Z but the piece joining them is
        // WFB-0450Z, so the upright pair has to be drawable on its own.
        const open = g.open || "bottom";
        s += line(x1, yBot, x1, yTop, legL, 0);        // left leg
        s += line(x2, yBot, x2, yTop, legR, 0);        // right leg
        if (open !== "top" && open !== "both") s += line(x1, yTop, x2, yTop, legL, rail, legR, rail);
        if (open !== "bottom" && open !== "both") s += line(x1, yBot, x2, yBot, legL, -rail, legR, -rail);
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

    // v3 POSITION LABELS: render position markers (LH1, LH2, LV1~LV3... CS1, CS2...)
    if (heightSpec && heightSpec.positions) {
      const positions = heightSpec.positions || {};
      const diagType = o.diagramType || 'all';

      Object.entries(positions).forEach(function (entry) {
        const posId = entry[0];
        const posSpec = entry[1];
        if (!posSpec) return;

        const isCS = posId.startsWith("CS") || posSpec.axis === "cs";
        if (diagType === 'reinforcing' && isCS) return; // Skip CS badges on reinforcing diagram
        if (diagType === 'cs' && !isCS) return;         // Skip LH/LV badges on CS diagram

  function isPositionOccupied(posId, posSpec, o, hStr) {
    if (!posSpec || posSpec.enabled === false) return false;
    const members = o.members || [];
    const detailMap = o.detailMap || {};
    const posY = posSpec.y != null ? posSpec.y : 0;
    const posXs = Array.isArray(posSpec.x) ? posSpec.x : [posSpec.x];
    const H = parseFloat(hStr) || 3;

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const detail = m.rowId ? detailMap[m.rowId] : null;
      if (!memberPartNo(m, detail)) continue;
      
      const pid = m.positionId || inferMemberPositionId(m, hStr);
      if (pid === posId) return true;

      const g = m.geom;
      if (!g) continue;

      if (posId.startsWith("CS") || posSpec.axis === "cs") {
        if (m.layer === "bracket" || m.kindTag === "bracket" || (m.memberId && m.memberId.includes("brk"))) {
          if (g.kind === "marker") {
            const mXs = g.xs || [];
            const yFrom = g.yFrom != null ? g.yFrom : 0;
            const yTo = g.yTo != null ? g.yTo : H;
            if (posY >= yFrom - 0.1 && posY <= yTo + 0.1 && posXs.some(function (x) { return mXs.includes(x); })) {
              return true;
            }
          }
        }
      } else if (posId.startsWith("LH") || posSpec.axis === "h") {
        if (g.kind === "h" || g.kind === "rect") {
          let gy = g.y != null ? (typeof g.y === "number" ? g.y : (typeof coord === "function" ? coord(g.y, heightScope(hStr), 0) : 0)) : 0;
          if (Math.abs(gy - posY) < 0.2) {
            const gx1 = Array.isArray(g.x1) ? Math.min.apply(null, g.x1) : (g.x1 != null ? g.x1 : 0);
            const gx2 = Array.isArray(g.x2) ? Math.max.apply(null, g.x2) : (g.x2 != null ? g.x2 : 3);
            if (posXs.some(function (x) { return x >= gx1 - 0.2 && x <= gx2 + 0.2; })) {
              return true;
            }
          }
        }
      } else if (posId.startsWith("LV") || posSpec.axis === "v") {
        if (g.kind === "v") {
          const gx = Array.isArray(g.x) ? g.x : [g.x];
          const gy1 = g.y1 != null ? g.y1 : 0;
          const gy2 = g.y2 != null ? g.y2 : H;
          if (posXs.some(function (x) { return gx.includes(x); }) && posY >= gy1 - 0.2 && posY <= gy2 + 0.2) {
            return true;
          }
        }
      }
    }
    return false;
  }

        // Check enable/disable status
        const isEnabled = posSpec.enabled !== false;

        // Check if any member is registered at this position
        const isOccupied = isPositionOccupied(posId, posSpec, o, hStr);

        // Position coordinates: if x is an array, render multiple instances
        const xArray = Array.isArray(posSpec.x) ? posSpec.x : [posSpec.x];
        const y = posSpec.y;

        xArray.forEach(function (x) {
          if (y < -0.01 || y > H + 0.01 || x < -0.01 || x > cols + 0.01) return;
          if (!isEnabled) return;

          const cx = X(x);
          const cy = Y(y) + (posSpec.axis === "v" ? 30 : 0);

          if (isCS) {
            // CS square badge - ALWAYS rendered on CS diagram
            const isAssigned = isOccupied;
            const bw = isAssigned ? 42 : 34, bh = 22;
            const strokeColor = isAssigned ? "#16a34a" : "#334155";
            const fillColor = isAssigned ? "#dcfce7" : "#ffffff";
            const textColor = isAssigned ? "#15803d" : "#dc2626";
            const titleAttr = esc(posId + (isAssigned ? " [등록됨]" : " (미등록)"));

            s += '<g class="sa-pos-marker" style="cursor:pointer;" title="' + titleAttr + '" onclick="if(window.saClickPosition) window.saClickPosition(\'' + esc(posId, true) + '\');" opacity="0.95">';
            s += '<rect x="' + (cx - bw / 2) + '" y="' + (cy - bh / 2) + '" width="' + bw + '" height="' + bh + '" rx="4" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="1.8"/>';
            s += '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="11" font-weight="bold" fill="' + textColor + '" pointer-events="none">' + esc(isAssigned ? (posId + " ✓") : posId) + '</text>';
            s += '</g>';
          } else {
            if (isOccupied) return; // Non-CS (LH/LV) circles disappear when bar line is drawn
            // LH / LV circle badge
            const r = 14;
            const strokeColor = "#e74c3c";
            const fillColor = "#ffffff";
            const textColor = "#e74c3c";
            const titleAttr = esc(posId + " (미등록)");

            s += '<g class="sa-pos-marker" style="cursor:pointer;" title="' + titleAttr + '" onclick="if(window.saClickPosition) window.saClickPosition(\'' + esc(posId, true) + '\');" opacity="0.95">';
            s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="2"/>';
            s += '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="12" font-weight="bold" fill="' + textColor + '" pointer-events="none">' + esc(posId) + '</text>';
            s += '</g>';
          }
        });
      });
    }

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
        const shown = shownPartNo(it.partNo);
        const title = esc(shown + (shown !== it.partNo ? " (표준 " + it.partNo + ")" : "") +
          (p ? " — " + (p.nameKo || p.nameEn || "") : " (DB 미등록)"));
        return '<div class="sa-legend-row" data-member-id="' + esc(it.memberId) + '" title="' + title + '">' +
          '<span class="sa-legend-swatch" style="background:' + it.color + '"></span>' +
          '<span class="sa-legend-label' + (p ? "" : " sa-missing") + '">' + esc(shown) + '</span>' +
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
  // One drawn instance's own qty: scale(expr) * how many times its geom
  // repeats (memberInstanceCount), or null if it has no scale yet.
  function memberDrawnQty(m, scope, hStr, diagram) {
    const n = memberInstanceCount(m, hStr);
    let expr = m.scale;
    if (expr == null || String(expr).trim() === "") {
      expr = getDefaultScaleForPosition(m, diagram, hStr, scope);
    }
    if (expr == null || String(expr).trim() === "" || !scope) return { qty: null, n: n };
    try {
      const v = global.RuleEngine.evaluate(String(expr), scope);
      if (typeof v === "number" && isFinite(v)) return { qty: v * n, n: n };
    } catch (e) { /* falls through to unscaled */ }
    return { qty: null, n: n };
  }

  function buildSheetTable(diagram, hStr, members, hDetailMap, cfg) {
    const scope = engineScope(cfg, diagram, hStr);
    const rollup = qtyDrawnByPart(members, hDetailMap, scope, hStr);

    // Group by part number, but keep every drawn INSTANCE (member) inside its
    // group -- the same part can sit at several positions, each needing its
    // own scale, since one badge's multiplier has nothing to do with another's.
    const groups = {};
    members.forEach(function (m) {
      const detail = m.rowId ? hDetailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail) || m.aliasLabel || m.memberId;
      if (!groups[partNo]) {
        groups[partNo] = { partNo: partNo, color: memberColor(m, partNo), rowIds: [], alias: m.aliasLabel || null, instances: [] };
      }
      const g = groups[partNo];
      if (m.rowId && g.rowIds.indexOf(m.rowId) === -1) g.rowIds.push(m.rowId);
      g.instances.push(m);
    });

    const partNos = Object.keys(groups);
    if (!partNos.length) {
      return '<div class="sa-sheet-empty" style="padding:16px; background:#ffffff; border:2px dashed #cbd5e1; border-radius:10px; margin-top:12px; font-size:13px; color:#64748b; text-align:center;"><i class="fa-solid fa-circle-info" style="color:#3b82f6;"></i> 이 높이(' + esc(hStr) + 'mH)에는 아직 등록된 부품이 없습니다. 오른쪽 <b>「위치별 품번 관리」</b>에서 각 포인트(L1, L2, L3...)에 품번을 추가하시면 이 표에 <b>배수식 입력란</b>이 바로 생성됩니다.</div>';
    }
    const formulaByPart = qtyFormulaByPart(diagram, hDetailMap, partNos);

    let html = '<div class="sa-sheet-legend" style="margin-top:6px; border:1.5px solid #e2e8f0; border-radius:8px; padding:10px; background:#ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">';
    html += '<div class="sa-sheet-legend-head" style="font-size:13px; font-weight:800; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">' +
      '<div><i class="fa-solid fa-table-list" style="color:#2563eb;"></i> 부재 범례 · 수량 대조 <span class="sa-sheet-h">' + esc(hStr) + 'mH</span></div>' +
      '</div>';

    // Quick Add Toolbar inside Legend Header
    html += '<div style="margin-bottom:10px; padding:10px 14px; background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border:1px solid #bae6fd; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; box-shadow:0 1px 3px rgba(0,0,0,0.03);">' +
      '<div style="display:flex; align-items:center; gap:6px; font-weight:800; font-size:12px; color:#0369a1;">' +
      '<i class="fa-solid fa-square-plus" style="color:#0284c7; font-size:15px;"></i> 신규 부품 / 위치 수식 추가:' +
      '</div>' +
      '<div class="sa-add-legend-part-form" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex:1; max-width:820px;">' +
      '<select id="saLegendPosSelect" onchange="const customInp = document.getElementById(\'saLegendCustomPos\'); if(customInp) customInp.style.display = this.value === \'CUSTOM\' ? \'inline-block\' : \'none\';" style="height:32px; padding:0 8px; border:1.5px solid #0284c7; border-radius:6px; font-size:12px; font-weight:700; background:#ffffff; color:#0369a1; outline:none; cursor:pointer;">' +
      '<option value="LH1">LH1 (가로1)</option>' +
      '<option value="LH2">LH2 (가로2)</option>' +
      '<option value="LH3">LH3 (가로3)</option>' +
      '<option value="LH4">LH4 (가로4)</option>' +
      '<option value="LH5">LH5 (가로5)</option>' +
      '<option value="LV1">LV1 (세로1)</option>' +
      '<option value="LV2">LV2 (세로2)</option>' +
      '<option value="LV3">LV3 (세로3)</option>' +
      '<option value="LV4">LV4 (세로4)</option>' +
      '<option value="CS1">CS1 (접합부1)</option>' +
      '<option value="CS2">CS2 (접합부2)</option>' +
      '<option value="CS3">CS3 (접합부3)</option>' +
      '<option value="CUSTOM">+ 신규 위치 직접입력</option>' +
      '</select>' +
      '<input type="text" id="saLegendCustomPos" placeholder="위치ID (예: LH7)" style="display:none; width:100px; height:32px; padding:0 8px; border:1.5px solid #0284c7; border-radius:6px; font-size:12px; font-weight:700; outline:none; background:#ffffff;" />' +
      '<input type="text" id="saLegendPartNo" placeholder="품번 검색 (예: WFB-0950ZP)" list="saPartList" style="flex:1.2; min-width:150px; height:32px; padding:0 8px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; outline:none; background:#ffffff;" />' +
      '<input type="text" id="saLegendScale" placeholder="수량 배수식 (예: perim*2, 2*4)" style="flex:1.8; min-width:180px; height:32px; padding:0 8px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12px; font-family:monospace; outline:none; background:#ffffff;" />' +
      '<button type="button" data-action="add-legend-part" data-h="' + esc(hStr) + '" style="height:32px; padding:0 14px; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#ffffff; border:none; border-radius:6px; font-size:12px; font-weight:800; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(2,132,199,0.25);">' +
      '<i class="fa-solid fa-plus"></i> 수식/부품 추가</button>' +
      '<button type="button" data-action="apply-all-default-scales" data-h="' + esc(hStr) + '" style="height:32px; padding:0 12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#ffffff; border:none; border-radius:6px; font-size:12px; font-weight:800; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(16,185,129,0.25);" title="현재 높이의 모든 부재에 위치별 기본 수식 자동 세팅"><i class="fa-solid fa-wand-magic-sparkles"></i> ⚡ 위치별 기본 수식 일괄 적용</button>' +
      '</div></div>';

    html += '<table class="sa-cmp" style="width:100%; border-collapse:collapse; font-size:11.5px;"><thead><tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; height:26px;">' +
      '<th style="width:30px;"></th><th style="padding:3px 7px;">품번</th><th style="padding:3px 7px; text-align:center;">위치</th><th style="padding:3px 7px; text-align:center;">배치</th><th style="padding:3px 7px;">배수식 (scale) — 이 위치 1개가 탱크 전체에서 몇 번 나오는가</th><th style="padding:3px 7px; text-align:right;">도면 수량</th><th style="padding:3px 7px; text-align:center;">상태</th>' +
      '</tr></thead><tbody>';

    let grandTotal = 0, allScaled = true;

    partNos.forEach(function (pn) {
      const g = groups[pn];
      const draw = rollup.byPart[pn] || { qty: 0, instances: 0, unscaled: 0 };
      const fml = formulaByPart[pn];
      const fmlQty = fml ? Math.round(fml.qty) : null;
      const p = lookupPart(pn);
      const shown = shownPartNo(pn);
      const rowIdTxt = g.rowIds.length ? g.rowIds.join(", ") : "수식 행 미연결";

      // --- one row per drawn INSTANCE, each with its own scale input -------
      g.instances.forEach(function (m) {
        const dq = memberDrawnQty(m, scope, hStr);
        const currentScale = m.scale == null ? "" : String(m.scale).trim();
        const isUnscaled = dq.qty == null;
        const drawnCell = isUnscaled
          ? '<span class="sa-unscaled" style="color:#d97706; font-weight:700;">미산정</span>'
          : '<b style="color:#0f172a; font-size:13px;">' + Math.round(dq.qty) + "</b>";

        const scaleInputCell = '<div style="display:flex; align-items:center; gap:4px;">' +
          '<textarea rows="1" class="sa-tbl-scale-input" data-member-id="' + esc(m.memberId) + '" data-h="' + esc(hStr) + '" placeholder="예: N_PA, perim*2, 4" onkeydown="if(event.key===\'Enter\' && !event.shiftKey){event.preventDefault();this.blur();}" style="resize:both; min-width:180px; width:100%; height:30px; min-height:26px; padding:4px 6px; border:1.5px solid ' + (isUnscaled ? '#f59e0b' : '#cbd5e1') + '; border-radius:6px; font-size:11px; font-weight:600; font-family:monospace; background:' + (isUnscaled ? '#fefce8' : '#ffffff') + '; color:#0f172a; box-sizing:border-box; vertical-align:middle; white-space:pre-wrap; word-break:break-all; overflow:auto;">' + esc(currentScale) + '</textarea>' +
          '<button type="button" class="sa-btn-delete-instance" data-action="delete-instance" data-member-id="' + esc(m.memberId) + '" data-h="' + esc(hStr) + '" style="padding:2px 6px; background:#ef4444; color:#ffffff; border:none; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap;" title="이 위치 부품 등록 삭제"><i class="fa-solid fa-trash-can"></i> 삭제</button>' +
          '</div>';

        html += '<tr data-member-id="' + esc(m.memberId) + '" style="border-bottom:1px solid #f1f5f9; height:30px;">' +
          '<td style="padding:3px 7px; text-align:center;"><span class="sa-legend-swatch" style="background:' + g.color + '; width:14px; height:14px; border-radius:3px; display:inline-block;"></span></td>' +
          '<td class="sa-cmp-part' + (p ? "" : " sa-missing") + '" style="padding:3px 7px; font-weight:700; font-size:13px;">' + esc(shown) + "</td>" +
          '<td style="padding:3px 7px; text-align:center;">' +
            (m.positionId
              ? '<div style="display:inline-flex; align-items:center; gap:3px;">' +
                '<span class="sa-pos-chip" style="cursor:pointer;" data-action="locate-member" data-member-id="' + esc(m.memberId) + '" title="도면에서 이 위치 찾기">' + esc(m.positionId) + '</span>' +
                '<button type="button" data-action="quick-add-pos-part" data-pos="' + esc(m.positionId) + '" data-h="' + esc(hStr) + '" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; border-radius:3px; font-size:10px; font-weight:700; cursor:pointer; padding:1px 5px; white-space:nowrap;" title="이 위치(' + esc(m.positionId) + ')에 동일/신규 부품 및 수식 행 추가">+추가</button>' +
                '</div>'
              : '—') +
          '</td>' +
          '<td style="padding:3px 7px; text-align:center; font-weight:600;">' + memberInstanceCount(m, hStr) + "개</td>" +
          '<td style="padding:3px 7px;">' + scaleInputCell + '</td>' +
          '<td class="sa-num" style="padding:3px 7px; text-align:right;">' + drawnCell + "</td>" +
          '<td class="sa-cmp-verdict" style="padding:3px 7px; text-align:center;">' + (isUnscaled ? '<span style="color:#d97706; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> 배수식 필요</span>' : "") + "</td>" +
          "</tr>";
      });

      // --- subtotal row for this part number --------------------------------
      let subVerdict, subVerdictCls;
      if (draw.unscaled > 0) {
        subVerdict = '<span style="color:#d97706; font-weight:700;">미산정 포함</span>';
        subVerdictCls = "sa-v-todo";
        allScaled = false;
      } else {
        const dq = Math.round(draw.qty);
        grandTotal += dq;
        if (fmlQty == null) { subVerdict = '<span style="color:#64748b;">수식 없음</span>'; subVerdictCls = "sa-v-todo"; }
        else if (dq === fmlQty) { subVerdict = '<span style="color:#16a34a; font-weight:700;"><i class="fa-solid fa-check"></i> 일치</span>'; subVerdictCls = "sa-v-ok"; }
        else { subVerdict = '<span style="color:#dc2626; font-weight:700;"><i class="fa-solid fa-circle-xmark"></i> 불일치</span>'; subVerdictCls = "sa-v-bad"; }
      }
      html += '<tr class="' + subVerdictCls + '" style="background:#f8fafc; border-bottom:2px solid #cbd5e1; height:28px;" title="' + esc(rowIdTxt) + '">' +
        '<td></td>' +
        '<td style="padding:3px 7px; font-weight:800;">' + esc(shown) + ' 합계' +
        (g.alias && g.alias !== shown ? '<span class="sa-cmp-alias">' + esc(g.alias) + "</span>" : "") + "</td>" +
        '<td style="padding:3px 7px; text-align:center; color:#64748b;">' + g.instances.length + "곳</td>" +
        '<td style="padding:3px 7px; text-align:center; font-weight:700;">' + draw.instances + "개</td>" +
        '<td></td>' +
        '<td class="sa-num" style="padding:3px 7px; text-align:right; font-weight:800;">' + (draw.unscaled > 0 ? "미산정" : Math.round(draw.qty)) +
        (fmlQty != null ? ' <span style="color:#94a3b8; font-weight:600;">(수식 ' + fmlQty + ")</span>" : "") + "</td>" +
        '<td class="sa-cmp-verdict" style="padding:3px 7px; text-align:center;">' + subVerdict +
        (subVerdictCls === "sa-v-bad" && g.rowIds.length
          ? ' <button class="sa-mini" data-action="fix-formula" data-row="' + esc(g.rowIds[0]) +
            '" data-h="' + esc(hStr) + '" data-target="' + Math.round(draw.qty) + '" style="margin-left:4px;">수식 수정</button>'
          : "") +
        "</td></tr>";
    });

    html += '</tbody><tfoot><tr style="background:#eff6ff; font-weight:700; height:28px;"><td colspan="5" style="padding:3px 7px;">이 시트 총합계' +
      (allScaled ? "" : " (산정된 품번만)") + '</td>' +
      '<td class="sa-num" style="padding:3px 7px; text-align:right;"><b style="font-size:14px; color:#2563eb;">' + grandTotal + '</b></td><td></td></tr></tfoot></table>';
    if (rollup.hasUnscaled) {
      html += '<div class="sa-sheet-note" style="margin-top:10px; font-size:12px; line-height:1.6;">「미산정」은 <b>배수식(scale)</b>이 아직 없는 부재입니다. ' +
        "위 표의 <b>배수식 (scale)</b> 입력란에 수식(예: <code>N_PA</code>, <code>perim*2</code>, <code>4</code> 등)을 직접 입력하고 <b>[저장]</b>을 누르면 도면 수량이 실시간으로 즉시 계산됩니다.</div>";
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

    // Steel accessories are installed where PANEL MEETS PANEL, so a member
    // anchored anywhere else is a drawing error. 1.5mH is a single TOP_15
    // panel, for instance: its only joints are the floor (y=0) and the top of
    // the wall (y=1.5), so anything sitting at y=1 has nothing to bolt to.
    //
    // Only HORIZONTAL members are checked. A bracket (`marker`) clamps the
    // VERTICAL seam between two panels, so its height is free -- WCP-1610Z sits
    // mid-panel on the upright joint in the deck. Vertical bars likewise span
    // between joints rather than resting on one.
    const joints = snapYsFor(hStr);
    const jointTxt = joints.join(", ");
    members.forEach(function (m) {
      const g = m.geom || {};
      if (g.kind !== "h" && g.kind !== "rect") return;
      const y = anchorY(g);
      if (y == null) return;
      if (joints.some(function (j) { return Math.abs(j - y) < 0.01; })) return;
      findings.push({ lv: "warn", member: m.memberId,
        msg: "y=" + y + " 는 판넬 접합부가 아님 (" + hStr + "mH 접합부: " + jointTxt + ")" });
    });

    // NOTE: two or more members sharing one position is NORMAL -- several parts
    // are genuinely installed on top of each other at the same joint (the 3mH
    // sheet stacks WFB-0950Z, WFB-0950ZP and WFB-0450Z on one line). That is
    // not a finding; buildPanelSvg() fans them apart visually instead.

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
    return "";
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
        "<div>도면의 부재를 클릭하면 그 <b>위치</b>의 품목·수량 수식·견적을<br>편집할 수 있습니다.</div></div>";
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
    const shownPn = shownPartNo(partNo);
    html += '<div class="sa-info-title"><span class="sa-legend-swatch" style="background:' + memberColor(m, partNo) + '"></span>' +
      esc(shownPn || "(품목 미지정)") + "</div>";
    if (shownPn && shownPn !== partNo) {
      html += '<div class="sa-info-alias">표준 품번 <code>' + esc(partNo) + "</code></div>";
    }
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
    html += '<textarea rows="1" class="sa-inp" id="saMemberScale" placeholder="예: perim*2, N_PA, (W_C+W_F-1)*N_PA" onkeydown="if(event.key===\'Enter\' && !event.shiftKey){event.preventDefault();this.blur();}" style="resize:both; min-width:200px; width:100%; height:34px; min-height:28px; padding:4px 8px; font-size:12px; font-family:monospace; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; vertical-align:middle; white-space:pre-wrap; word-break:break-all; overflow:auto;">' + esc(m.scale || "") + '</textarea>';
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

  function inferMemberPositionId(m, hStr) {
    if (m.positionId) return m.positionId;
    const mid = (m.memberId || "").toLowerCase();
    const g = m.geom;
    if (!g) return null;
    const H = parseFloat(hStr) || 3;

    // CS Bracket positions
    if (m.layer === "bracket" || m.kindTag === "bracket" || mid.includes("brk") || g.kind === "marker" || mid.includes("wcp1610") || mid.includes("1760sa") || mid.includes("wbr1740")) {
      const y = g.yFrom != null ? g.yFrom : (g.y != null ? g.y : 0);
      if (y === 0) return "CS1";
      return "CS2";
    }

    // Horizontal positions (LH)
    if (g.kind === "h" || g.kind === "rect") {
      let y = g.y != null ? (typeof g.y === "number" ? g.y : (String(g.y).includes("H_O-1") ? H - 1 : (String(g.y).includes("H_O-2") ? H - 2 : (String(g.y).includes("H_O-3") ? H - 3 : 0)))) : 0;
      y = Math.round(y);
      const isCenter = (g.x1 === 1 || (Array.isArray(g.x1) && g.x1.includes(1)));
      if (y === 0) return isCenter ? "LH2" : "LH1";
      if (y === 1) return isCenter ? "LH4" : "LH3";
      if (y === 2) return isCenter ? "LH6" : "LH5";
      if (y === 3) return isCenter ? "LH8" : "LH7";
      if (y === 4) return isCenter ? "LH10" : "LH9";
      return "LH1";
    }

    // Vertical positions (LV)
    if (g.kind === "v") {
      let x = g.x != null ? g.x : 1;
      if (Array.isArray(x)) x = x[0];
      if (x === 0 || x === 3 || x === 2.5) return "LV1";
      return "LV2";
    }

    return null;
  }

  function isCsMember(m, hStr) {
    if (!m) return false;
    if (m.positionId) return m.positionId.startsWith("CS");
    if (m.layer === "bar" || (m.geom && (m.geom.kind === "h" || m.geom.kind === "v" || m.geom.kind === "rect"))) {
      return false; // Reinforcing bar
    }
    if (m.layer === "bracket" || m.kindTag === "bracket" || (m.geom && m.geom.kind === "marker")) {
      return true; // CS bracket
    }
    const pNo = (m.partNo || "").toUpperCase();
    if (pNo.startsWith("WFB")) return false;
    if (pNo.startsWith("WCP") || pNo.startsWith("WBR")) return true;
    const mid = (m.memberId || "").toLowerCase();
    if (mid.includes("brk") || mid.includes("wcp") || mid.includes("wbr")) return true;
    return false;
  }

  // v3 POSITION-BASED PART EDITOR: simple table format showing positions and their parts
  function buildPositionPanel(diagram, hStr, members) {
    const heightSpec = effectiveHeightSpec(diagram, hStr);
    if (!heightSpec || !heightSpec.positions) {
      return '<div class="sa-info sa-info-empty">이 높이는 위치라벨 기반 구조를 지원하지 않습니다.</div>';
    }

    const positions = heightSpec.positions || {};
    const positionMembers = {};

    // Group members by position (using explicit positionId or inferred positionId)
    members.forEach(function (m) {
      const posId = m.positionId || inferMemberPositionId(m, hStr);
      if (posId) {
        if (!positionMembers[posId]) positionMembers[posId] = [];
        positionMembers[posId].push(m);
      }
    });

    // Group positions into Reinforcing (LH/LV) and CS Connection Support (CS)
    const posKeys = Object.keys(positions);
    const reinfPosIds = posKeys.filter(function (k) { return !k.startsWith("CS"); });
    const csPosIds = posKeys.filter(function (k) { return k.startsWith("CS"); });

    function sortPos(arr) {
      return arr.sort(function (a, b) {
        const prefixA = a.replace(/\d+/g, "");
        const prefixB = b.replace(/\d+/g, "");
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
        const numA = parseInt(a.replace(/\D/g, ""), 10) || 999;
        const numB = parseInt(b.replace(/\D/g, ""), 10) || 999;
        return numA - numB;
      });
    }

    const sortedReinf = sortPos(reinfPosIds);
    const sortedCS = sortPos(csPosIds);

    // Simple table layout (no inner scrollbar, flows naturally with page)
    let html = '<div class="sa-position-table" style="padding:6px; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px;">';
    html += '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
    html += '<thead><tr style="border-bottom:2px solid #3b82f6; background:#f0f4f8;">';
    html += '<td style="padding:6px 6px; font-weight:700; color:#1f2937; width:55px; text-align:center;">위치</td>';
    html += '<td style="padding:6px 6px; font-weight:700; color:#1f2937;">품번 관리</td>';
    html += '</tr></thead>';
    html += '<tbody>';

    function renderPosRow(posId, isCSGroup) {
      const posMembersArray = positionMembers[posId] || [];
      const posSpec = positions[posId] || {};
      const isEnabled = posSpec.enabled !== false;
      const bgColor = isEnabled ? '#fafbfc' : '#f3f4f6';
      const opacity = isEnabled ? '1' : '0.6';

      let rowHtml = '<tr id="sa-pos-row-' + esc(posId, true) + '" data-enabled="' + (isEnabled ? 'true' : 'false') + '" style="border-bottom:1px solid #e5e7eb; background:' + bgColor + '; transition: background 0.3s ease; opacity:' + opacity + ';">';

      // Position badge + enable toggle
      rowHtml += '<td style="padding:4px 6px; text-align:center; vertical-align:top;">';
      rowHtml += '<div style="display:flex; flex-direction:column; gap:3px; align-items:center;">';
      if (isCSGroup) {
        rowHtml += '<span class="sa-pos-badge" style="display:inline-block; padding:2px 5px; background:' + (isEnabled ? '#dc2626' : '#9ca3af') + '; color:white; border-radius:4px; text-align:center; font-size:10.5px; font-weight:bold;">' + esc(posId) + '</span>';
      } else {
        rowHtml += '<span class="sa-pos-badge" style="display:inline-block; width:24px; height:24px; background:' + (isEnabled ? '#e74c3c' : '#9ca3af') + '; color:white; border-radius:50%; text-align:center; line-height:24px; font-size:11px; font-weight:bold;">' + esc(posId) + '</span>';
      }
      rowHtml += '<label style="display:flex; align-items:center; gap:3px; cursor:pointer; font-size:9.5px;">';
      rowHtml += '<input type="checkbox" class="sa-pos-enabled-toggle" data-position-id="' + esc(posId) + '" ' + (isEnabled ? 'checked' : '') + ' style="cursor:pointer;">';
      rowHtml += '<span style="color:#6b7280;">' + (isEnabled ? '활성' : '비활') + '</span>';
      rowHtml += '</label>';
      rowHtml += '</div>';
      rowHtml += '</td>';

      // Parts column
      rowHtml += '<td style="padding:4px 6px;">';

      // Show existing parts
      if (posMembersArray.length > 0) {
        rowHtml += '<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;">';
        posMembersArray.forEach(function (m) {
          const partDisplay = m.partNo || m.memberId;
          const context = m.context ? ' (' + m.context + ')' : '';
          rowHtml += '<div style="display:flex; align-items:center; gap:3px; padding:2px 6px; background:white; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">' +
            '<span style="font-weight:600; color:#1f2937;">' + esc(partDisplay) + '</span>' +
            (context ? '<span style="color:#6b7280; font-size:10px;">' + esc(context) + '</span>' : '') +
            '<button data-action="remove-position-part" data-position-id="' + esc(posId) + '" data-member-id="' + esc(m.memberId) + '" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px; font-weight:bold; padding:0; margin-left:3px;" title="부품 삭제">X</button>' +
            '</div>';
        });
        rowHtml += '</div>';
      } else {
        rowHtml += '<div style="color:#9ca3af; font-size:11px; font-style:italic; padding:2px 0; margin-bottom:4px;">등록된 부품 없음</div>';
      }

      // Add part form (inline)
      rowHtml += '<div class="sa-add-part-form" style="display:flex; gap:3px; opacity:' + (isEnabled ? '1' : '0.5') + ';">';
      rowHtml += '<input type="text" class="sa-pos-part-no" placeholder="품번" list="saPartList" style="flex:1; padding:3px 5px; border:1px solid #d1d5db; border-radius:3px; font-size:11px;" data-position-id="' + esc(posId) + '" ' + (isEnabled ? '' : 'disabled') + '>';
      rowHtml += '<input type="text" class="sa-pos-context" placeholder="ctx" style="flex:0.4; padding:3px 5px; border:1px solid #d1d5db; border-radius:3px; font-size:11px;" data-position-id="' + esc(posId) + '" title="context: 1M폭, 0.5M폭 등" ' + (isEnabled ? '' : 'disabled') + '>';
      rowHtml += '<button data-action="add-position-part" data-position-id="' + esc(posId) + '" data-diagram-id="' + esc(diagram.id) + '" data-height="' + esc(hStr) + '" style="padding:3px 10px; background:#3b82f6; color:white; border:none; border-radius:3px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;" ' + (isEnabled ? '' : 'disabled') + '>추가</button>';
      rowHtml += '</div>';

      rowHtml += '</td>';
      rowHtml += '</tr>';
      return rowHtml;
    }

    // 1. Reinforcing section
    if (sortedReinf.length > 0) {
      html += '<tr style="background:#eff6ff; border-bottom:1.5px solid #bfdbfe;"><td colspan="2" style="padding:5px 8px; font-weight:800; color:#1e40af; font-size:11px;"><i class="fa-solid fa-layer-group"></i> 보강재 위치 (LH / LV)</td></tr>';
      sortedReinf.forEach(function (posId) {
        html += renderPosRow(posId, false);
      });
    }

    // 2. CS Connection Support section
    if (sortedCS.length > 0) {
      html += '<tr style="background:#fef2f2; border-bottom:1.5px solid #fca5a5;"><td colspan="2" style="padding:5px 8px; font-weight:800; color:#991b1b; font-size:11px;"><i class="fa-solid fa-shapes"></i> 코너/접합부 (CS - Connection Support)</td></tr>';
      sortedCS.forEach(function (posId) {
        html += renderPosRow(posId, true);
      });
    }

    html += '</tbody></table>';
    html += '</div>';
    return html;
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
  // ---------------------------------------------------------------------------
  // 회사/거래처 탭 Bar + part-number matching panel
  // ---------------------------------------------------------------------------
  function companyTabsBar() {
    const pn = PN();
    let parties = (pn ? pn.listParties() : []).slice();
    
    // Always include any presets from Panel Config
    if (typeof window !== 'undefined' && typeof window.getMatrixCustomerPresetList === 'function') {
      try {
        const matrixCusts = window.getMatrixCustomerPresetList();
        matrixCusts.forEach(function (c) {
          const pName = (c.id === 'default') ? "YSACC (Default)" : c.name.replace(/\s*Spec$/i, '').trim();
          if (pName && parties.indexOf(pName) === -1) {
            parties.push(pName);
          }
        });
      } catch (e) {}
    }

    const defaultList = ["YSACC (Default)", "MNT", "WATANI", "HAYOUNG", "ALMUFTAH"];
    defaultList.forEach(function (dp) {
      if (parties.indexOf(dp) === -1) parties.push(dp);
    });

    if (parties.indexOf("YSACC (Default)") === -1) parties.unshift("YSACC (Default)");
    let cur = (pn ? pn.activeParty() : "YSACC (Default)") || "YSACC (Default)";

    let s = '<div class="sa-company-tabs-bar" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">';
    
    // Left: Company tab list
    s += '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">';
    s += '<span style="font-size:12px; font-weight:800; color:#334155; margin-right:4px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-building" style="color:#0284c7;"></i> 회사/거래처:</span>';
    
    parties.forEach(function (p) {
      const isActive = (p === cur);
      const isDefault = (p === "YSACC (Default)");
      s += '<div style="display:inline-flex; align-items:center; position:relative;">' +
        '<button type="button" class="sa-company-tab' + (isActive ? ' active' : '') + '" data-party="' + esc(p) + '" style="padding:6px 14px; font-size:12px; font-weight:800; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.15s ease; border:' + (isActive ? '2px solid #0284c7; background:#e0f2fe; color:#0369a1;' : '1.5px solid #cbd5e1; background:#ffffff; color:#475569;') + '">' +
          '<span>🏢 ' + esc(p) + '</span>' +
          (isDefault ? '<span style="font-size:10px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:1px 5px; border-radius:4px;">Default</span>' : '') +
          (isActive ? '<span style="font-size:10px; font-weight:700; background:#0284c7; color:#ffffff; padding:1px 5px; border-radius:4px;">Active</span>' : '') +
        '</button>' +
        '</div>';
    });
    s += '</div>';

    // Right: Action buttons (Add, Copy, Rename, Delete)
    s += '<div style="display:flex; align-items:center; gap:6px;">';
    s += '<button type="button" data-action="add-company" style="background:#0284c7; color:#ffffff; border:none; border-radius:6px; padding:5px 12px; font-size:11.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(2,132,199,0.2);"><i class="fa-solid fa-plus"></i> 회사 탭 추가</button>';
    s += '<button type="button" data-action="copy-company" style="background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-copy"></i> 복사</button>';
    s += '<button type="button" data-action="rename-company" style="background:#f8fafc; color:#334155; border:1.5px solid #cbd5e1; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-pen"></i> 이름 변경</button>';
    s += '<button type="button" data-action="delete-company" style="background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-trash"></i> 삭제</button>';
    s += '</div>';

    s += '</div>';
    return s;
  }

  function partySelector() {
    const pn = PN();
    if (!pn) return "";
    const cur = pn.activeParty();
    let s = '<label class="sa-party"><span>거래처</span><select id="saParty">';
    pn.listParties().forEach(function (p) {
      s += '<option value="' + esc(p) + '"' + (p === cur ? " selected" : "") + ">" + esc(p) + "</option>";
    });
    return s + "</select></label>";
  }

  // Every canonical part used anywhere in this diagram, with the label the
  // drawing prints for it and whether it resolves to a catalog record.
  function matchingRows(diagram) {
    const rows = {};
    diagramHeights(diagram).forEach(function (h) {
      const detail = rowDetailMap(readConfig(), diagram, h);
      heightMembers(diagram, h).forEach(function (m) {
        const canon = memberPartNo(m, m.rowId ? detail[m.rowId] : null);
        if (!canon) return;
        if (!rows[canon]) {
          rows[canon] = { canonical: canon, labels: [], inDb: !!lookupPart(canon) };
        }
        const label = (m.aliasLabel || "").replace(/\s*\((INSIDE|Outside|Side Bottom)\)\s*/i, "").trim();
        if (label && label !== canon && rows[canon].labels.indexOf(label) === -1) rows[canon].labels.push(label);
      });
    });
    const list = Object.keys(rows).map(function (k) { return rows[k]; });
    // Unmatched first: what still needs doing should be what you see.
    list.sort(function (a, b) {
      if (a.inDb !== b.inDb) return a.inDb ? 1 : -1;
      return a.canonical.localeCompare(b.canonical);
    });
    return list;
  }

  function buildMatchingPanel(diagram) {
    const pn = PN();
    if (!pn) return "";
    const party = pn.activeParty();
    const rows = matchingRows(diagram);
    const missing = rows.filter(function (r) { return !r.inDb; }).length;

    let html = '<div class="sa-match"><div class="sa-match-head">' +
      "🔗 품번 매칭 <span class=\"sa-match-party\">거래처: " + esc(party) + "</span>" +
      (missing ? '<span class="sa-badge sa-badge-err">DB 미등록 ' + missing + "</span>" : '<span class="sa-badge sa-badge-ok">전부 DB 연결됨</span>') +
      '<button class="sa-mini" data-action="add-party">+ 거래처 추가</button>' +
      '<button class="sa-mini" data-action="close-matching">닫기</button>' +
      "</div>";

    if (party === pn.STANDARD) {
      html += '<div class="sa-match-note">지금은 <b>표준</b> 표기입니다. 거래처를 고르거나 새로 추가하면 그 회사의 품번을 입력할 수 있습니다. ' +
        "표준일 때는 DB 품번이 그대로 표시됩니다.</div>";
    }

    html += '<table class="sa-match-table"><thead><tr>' +
      "<th>도면 표기</th><th>표준 DB 품번</th><th>DB</th><th>" + esc(party) + " 품번</th><th>" + esc(party) + " 품명</th>" +
      "</tr></thead><tbody>";

    rows.forEach(function (r) {
      const cur = party === pn.STANDARD ? null : pn.getMapping(r.canonical, party);
      const p = lookupPart(r.canonical);
      const dis = party === pn.STANDARD ? " disabled" : "";
      html += "<tr" + (r.inDb ? "" : ' class="sa-match-missing"') + ">" +
        "<td>" + esc(r.labels.join(", ") || "—") + "</td>" +
        '<td class="sa-cmp-part">' + esc(r.canonical) +
        (p ? '<span class="sa-cmp-alias">' + esc(p.nameKo || p.nameEn || "") + "</span>" : "") + "</td>" +
        '<td class="sa-match-flag">' + (r.inDb ? "✔" : "✖") + "</td>" +
        '<td><input class="sa-inp sa-match-inp" list="saPartList" data-canonical="' + esc(r.canonical) +
        '" data-field="partNo" value="' + esc((cur && cur.partNo) || "") + '" placeholder="' +
        (r.inDb ? "(비우면 표준 그대로)" : "DB 품번을 골라 연결") + '"' + dis + "></td>" +
        '<td><input class="sa-inp sa-match-inp" data-canonical="' + esc(r.canonical) +
        '" data-field="name" value="' + esc((cur && cur.name) || "") + '" placeholder="(선택)"' + dis + "></td>" +
        "</tr>";
    });

    html += "</tbody></table>";
    html += '<div class="sa-match-note">「도면 표기」가 DB 품번과 다른 것은 도면 파일에 기록된 대응입니다. ' +
      "<b>DB ✖</b> 인 항목은 아직 카탈로그에 연결되지 않은 것으로, 우측 칸에서 실제 DB 품번을 골라 연결하세요. " +
      "추측으로 자동 연결하지 않으므로, 연결하기 전까지는 계속 미등록으로 남습니다.</div>";
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // One height = one sheet, laid out like the original deck's slides:
  // a title bar, the panel views (Outside / Inside) on the left with the
  // reinforcing and bracket layers under each, and the part legend + quantity
  // comparison on the right.
  // ---------------------------------------------------------------------------
  function buildSheet(diagram, hStr, members, detailMap, cfg) {
    const spec = effectiveHeightSpec(diagram, hStr);
    const px = 96;
    const views = diagramViews(diagram);
    const layers = diagramLayers(diagram);

    const title = (spec && spec.sheetTitle) ||
      (diagram.title.replace(/^\d+\.\s*/, "") + " (" + hStr + "mH)");

    const p = PN() ? PN().activeParty() : "YSACC (Default)";
    const cleanP = (p && p !== "표준" && p !== "표준 (Standard)") ? p : "YSACC (Default)";
    const isEdited = !!(overrides[HEIGHTSPEC_PREFIX + cleanP + "::" + diagram.id + "::" + hStr] ||
      (cleanP === "YSACC (Default)" && overrides[HEIGHTSPEC_PREFIX + diagram.id + "::" + hStr]));

    let html = '<div class="sa-sheet">';
    html += '<div class="sa-sheet-title">' + esc(title);
    if (isEdited) {
      html += '<span class="sa-sheet-mode sa-hb-manual">부품 등록됨</span>' +
        '<button class="sa-mini" data-action="reset-height" data-h="' + esc(hStr) + '">이 높이 수정 삭제</button>';
    }
    html += "</div>";

    html += '<div class="sa-sheet-body">';
    html += '<div class="sa-sheet-views">';

    const hasPositions = spec && spec.positions && Object.keys(spec.positions).length > 0;

    views.forEach(function (v) {
      const inView = members.filter(function (m) { return !v.id || memberView(m) === v.id; });
      // A v1 diagram has one unnamed view holding everything; a v2 diagram with
      // an empty face still gets its heading so the sheet matches the original.
      html += '<div class="sa-view-block">';
      if (v.title) html += '<div class="sa-view-title">' + esc(v.title) + "</div>";
      layers.forEach(function (layer) {
        const inLayer = inView.filter(function (m) { return !layer.id || memberLayer(m) === layer.id; });
        if (v.id && !inLayer.length && !hasPositions) return;      // skip empty face/layer combos
        if (layer.title) html += '<div class="sa-layer-title">' + esc(layer.title) + "</div>";
        html += '<div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap;">';

        // Left Diagram: Reinforcing
        html += '<div style="flex:1; min-width:320px; background:#ffffff; border:1.5px solid #cbd5e1; border-radius:8px; padding:10px; box-shadow:0 2px 4px rgba(0,0,0,0.04);">';
        html += '<div style="font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:6px;">' +
          '<span><i class="fa-solid fa-layer-group" style="color:#2563eb;"></i> 보강재 배치 (Reinforcing)</span>' +
          '<button class="sa-mini" data-action="reset-reinforcing-height" data-h="' + esc(hStr) + '" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#334155; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;" title="이 높이의 보강재(LH/LV) 등록만 삭제"><i class="fa-solid fa-rotate-left"></i> 보강재 수정 삭제</button>' +
          '</div>';
        html += '<div class="sa-svg-wrap sa-svg-sheet">' +
          buildPanelSvg(diagram, hStr, {
            members: members, detailMap: detailMap, pxPerM: px,
            layer: layer.id, view: v.id, diagramType: 'reinforcing'
          }) + '</div></div>';

        // Right Diagram: CS Connection Support
        const csCount = members.filter(function (m) { return m.positionId && m.positionId.startsWith("CS"); }).length;
        const csBadgeHtml = csCount > 0
          ? '<span style="font-size:10px; font-weight:700; color:#15803d; background:#dcfce7; border:1px solid #bbf7d0; padding:1px 6px; border-radius:10px; margin-left:4px;">Registered (' + csCount + ')</span>'
          : '<span style="font-size:10px; font-weight:700; color:#475569; background:#f1f5f9; border:1px solid #cbd5e1; padding:1px 6px; border-radius:10px; margin-left:4px;">Undefined</span>';

        html += '<div style="flex:1; min-width:320px; background:#ffffff; border:1.5px solid #cbd5e1; border-radius:8px; padding:10px; box-shadow:0 2px 4px rgba(0,0,0,0.04);">';
        html += '<div style="font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:6px;">' +
          '<span><i class="fa-solid fa-shapes" style="color:#dc2626;"></i> Corner / Intersection (CS - Connection Support) ' + csBadgeHtml + '</span>' +
          '<button class="sa-mini" data-action="reset-cs-height" data-h="' + esc(hStr) + '" style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;" title="Reset CS Connection Support for ' + esc(hStr) + 'mH"><i class="fa-solid fa-rotate-left"></i> Reset CS (' + esc(hStr) + 'mH)</button>' +
          '</div>';
        html += '<div class="sa-svg-wrap sa-svg-sheet">' +
          buildPanelSvg(diagram, hStr, {
            members: members, detailMap: detailMap, pxPerM: px,
            layer: layer.id, view: v.id, diagramType: 'cs'
          }) + '</div></div>';

        html += '</div>';
      });
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="sa-sheet-side">' + buildSheetTable(diagram, hStr, members, detailMap, cfg) + "</div>";
    html += "</div>";

    if (!members.length && !hasPositions) {
      html += '<div class="sa-sheet-empty">No steel members defined for this height (' + esc(hStr) + 'mH).</div>';
    }
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  function render() {
    if (typeof document === "undefined") return;
    const host = document.getElementById("steelAccessoriesContainer");
    if (!host) return;

    if (loadError) {
      host.innerHTML = '<div class="sa-err-box">Failed to load diagram definition file (' + esc(LAYOUT_URL) + '): ' + esc(loadError) + "</div>";
      return;
    }
    if (!layout) {
      host.innerHTML = '<div class="sa-info-empty">Loading diagram definitions...</div>';
      return;
    }

    const diagrams = layout.diagrams || [];
    if (!diagrams.length) { host.innerHTML = '<div class="sa-err-box">Diagram definitions are empty.</div>'; return; }
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

    // Company / Customer Spec Tabs Header Bar
    html += companyTabsBar();

    // Intro
    html += '<div class="sa-intro"><i class="fa-solid fa-circle-info"></i> ' +
      'Reference drawing for steel member layout per height grade. Structured per height sheet, ' +
      'each member is linked to <b>PART MASTER DB Part No.</b> and <b>calculation formula (rowId)</b>. ' +
      'The legend on the right compares drawing counts with formula results -- ' +
      '<b>BOM quantity is always evaluated by formula</b>, while drawing is the verification layer.</div>';

    // Diagram tabs with drag-and-drop reordering, double-click rename & copy button
    html += '<div class="sa-diagram-tabs" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:8px;">';
    diagrams.forEach(function (d) {
      const match = diagramMatchesConfig(d, cfg);
      html += '<div class="sa-dtab-wrap" draggable="true" data-diagram-id="' + esc(d.id) + '" style="display:inline-flex; align-items:center; position:relative; cursor:grab; user-select:none; border-radius:7px; transition:opacity 0.15s, border 0.1s;" title="마우스로 드래그하여 탭 순서 이동 / 더블클릭하여 탭 이름 변경">' +
        '<button class="sa-dtab' + (d.id === currentDiagramId ? " active" : "") + '" data-diagram="' + esc(d.id) + '" ondblclick="if(window.SteelAccessories) window.SteelAccessories.renameDiagramPrompt(\'' + esc(d.id) + '\')" title="마우스로 드래그하여 탭 순서 이동 / 더블클릭하여 탭 이름 변경">' +
          '<span class="sa-drag-grip" style="opacity:0.35; font-size:10.5px; margin-right:4px; cursor:grab; display:inline-flex; align-items:center;"><i class="fa-solid fa-grip-vertical"></i></span>' +
          '<span class="sa-dtab-title">' + esc(d.title) + '</span>' +
          (match === true ? '<span class="sa-badge sa-badge-ok">Active</span>' : match === false ? '<span class="sa-badge sa-badge-muted">Mismatch</span>' : "") +
        '</button>' +
        '<button type="button" data-action="delete-diagram" data-diagram-id="' + esc(d.id) + '" style="padding:2px 6px; font-size:12px; font-weight:800; color:#ef4444; background:#fee2e2; border:1px solid #fca5a5; border-radius:4px; cursor:pointer; margin-left:2px;" title="\'' + esc(d.title) + '\' 탭 삭제">&times;</button>' +
        '</div>';
    });
    html += '<button type="button" data-action="copy-diagram" data-diagram-id="' + esc(currentDiagramId) + '" style="padding:5px 12px; background:linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); color:#0369a1; border:1.5px solid #7dd3fc; border-radius:8px; font-size:12px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(2,132,199,0.15);" title="현재 선택된 탭의 1~5mH 도면, 부품 및 수식을 전체 복사하여 신규 탭 생성"><i class="fa-solid fa-copy" style="color:#0284c7;"></i> 📋 탭 복사하기</button>';
    html += '</div>';

    // Toolbar
    html += '<div class="sa-toolbar">' +
      '<div class="sa-seg">' +
      '<button class="sa-segbtn' + (viewMode === "sheet" ? " active" : "") + '" data-view="sheet">Height Sheets</button>' +
      '<button class="sa-segbtn' + (viewMode === "overview" ? " active" : "") + '" data-view="overview">View All</button>' +
      "</div>" +
      '<div class="sa-tool-right">' +
      '<span style="font-size:11px; font-weight:700; color:#15803d; background:#dcfce7; border:1px solid #bbf7d0; padding:3px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;" title="All position part and multiplier settings are automatically saved and synced to Firebase Firestore DB."><i class="fa-solid fa-cloud-arrow-up"></i> Firestore DB Synced</span>' +
      partySelector() +
      '<button class="sa-btn sa-btn-ghost" data-action="open-matching"><i class="fa-solid fa-link"></i> Part Matching</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="export-json"><i class="fa-solid fa-download"></i> Export JSON</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="import-json"><i class="fa-solid fa-upload"></i> Import JSON</button>' +
      "</div></div>";

    // Height rail (sheet mode)
    if (viewMode === "sheet") {
      const matrix = buildAuditMatrix(diagram, cfg);
      html += '<div class="sa-hrail">';
      heights.forEach(function (h) {
        const hEdited = !!overrides[heightSpecKey(diagram.id, String(h))];
        const r = matrix[h] || { errs: 0, warns: 0 };
        const drawn = heightMembers(diagram, h).length;
        html += '<button class="sa-hchip' + (h === hSel ? " active" : "") + '" data-h="' + esc(h) + '">' +
          '<span class="sa-hchip-h">' + esc(h) + "mH</span>" +
          '<span class="sa-hchip-badge ' + (drawn === 0 ? "sa-hb-none" : hEdited ? "sa-hb-manual" : "sa-hb-auto") + '">' +
          (drawn === 0 ? "Not Defined" : hEdited ? "Parts Reg." : "Default") + "</span>" +
          (r.errs ? '<span class="sa-hchip-dot sa-hd-err" title="Errors ' + r.errs + '"></span>'
            : r.warns ? '<span class="sa-hchip-dot sa-hd-warn" title="Warnings ' + r.warns + '"></span>' : "") +
          "</button>";
      });
      html += "</div>";
    }

    if (matchingOpen) html += buildMatchingPanel(diagram);

    // Drawings + info panel
    html += '<div class="sa-main">';
    html += '<div class="sa-canvas' + (viewMode === "sheet" ? " sa-sheet-mode" : "") + '">';

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
    // Side panel: for v3 schema (positions), show ONLY position management
    // For v2/auto, show the traditional info panel
    const isV3 = effectiveHeightSpec(diagram, hSel) && effectiveHeightSpec(diagram, hSel).positions;

    if (isV3) {
      // v3 heights: position management only (no tabs needed)
      html += '<div class="sa-side" id="saSidePanel" style="padding:0;">';
      html += buildPositionPanel(diagram, hSel, members);
      html += '</div>';
    } else {
      // v2/auto heights: traditional member info with tabs
      html += '<div class="sa-side-tabs" style="display:flex; border-bottom:1px solid #e5e7eb; gap:0; margin-bottom:12px;">';
      html += '<button class="sa-tab-btn sa-tab-active" data-tab="info" title="부재별 편집" style="flex:1; padding:8px 12px; border:none; background:transparent; cursor:pointer; border-bottom:2px solid #3b82f6; color:#3b82f6; font-weight:600; font-size:13px;"><i class="fa-solid fa-pen-to-square"></i> 부재 정보</button>';
      html += '</div>';
      html += '<div class="sa-side" id="saSidePanel">';
      html += '<div class="sa-side-tab-content" data-tab="info">' + buildInfoPanel(diagram, members, detailMap, cfg, hSel) + "</div>";
      html += '</div>';
    }
    html += "</div>";

    // Audit
    html += buildAudit(diagram, cfg, hSel);

    // datalist for the part-number input in edit mode
    html += '<datalist id="saPartList">';
    html += '<option value="WBR-1760SA2/SA4">STS Partition Frame Middle Bracket (Int. Mat. SS304/SS316 자동)</option>';
    (allParts() || []).forEach(function (p) {
      html += '<option value="' + esc(p.partNo) + '">' + esc(p.nameKo || p.nameEn || "") + "</option>";
    });
    html += "</datalist>";
    html += '<input type="file" id="saImportFile" accept="application/json" style="display:none">';

    // Capture scroll positions and active element focus state before replacing innerHTML
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    const sidebarEl = host ? host.querySelector(".sa-sidebar") : null;
    const sidebarScrollTop = sidebarEl ? sidebarEl.scrollTop : 0;
    const mainEl = host ? host.querySelector(".sa-main") : null;
    const mainScrollTop = mainEl ? mainEl.scrollTop : 0;

    const activeEl = typeof document !== "undefined" ? document.activeElement : null;
    let focusMemberId = null, focusPosId = null, focusClass = null, focusStart = null, focusEnd = null;
    if (activeEl && activeEl.classList) {
      if (activeEl.classList.contains("sa-tbl-scale-input")) {
        focusMemberId = activeEl.getAttribute("data-member-id");
      } else if (activeEl.classList.contains("sa-pos-part-no") || activeEl.classList.contains("sa-pos-context")) {
        focusPosId = activeEl.getAttribute("data-pos");
        focusClass = activeEl.classList.contains("sa-pos-part-no") ? "sa-pos-part-no" : "sa-pos-context";
      }
      try {
        focusStart = activeEl.selectionStart;
        focusEnd = activeEl.selectionEnd;
      } catch (e) {}
    }

    host.innerHTML = html;
    wireEvents(host, diagram, members, detailMap, cfg, hSel);

    // Restore scroll positions instantly
    if (typeof window !== "undefined" && scrollY > 0) {
      try { window.scrollTo({ top: scrollY, behavior: "instant" }); } catch (e) { window.scrollTo(0, scrollY); }
    }
    const newSidebarEl = host.querySelector(".sa-sidebar");
    if (newSidebarEl && sidebarScrollTop > 0) {
      newSidebarEl.scrollTop = sidebarScrollTop;
    }
    const newMainEl = host.querySelector(".sa-main");
    if (newMainEl && mainScrollTop > 0) {
      newMainEl.scrollTop = mainScrollTop;
    }

    // Restore focus if a scale or position input was focused
    if (focusMemberId) {
      const restoredInp = host.querySelector('.sa-tbl-scale-input[data-member-id="' + focusMemberId + '"]');
      if (restoredInp) {
        try { restoredInp.focus({ preventScroll: true }); } catch (e) { restoredInp.focus(); }
        try {
          if (focusStart != null && focusEnd != null) restoredInp.setSelectionRange(focusStart, focusEnd);
        } catch (e) {}
      }
    } else if (focusPosId && focusClass) {
      const restoredPosInp = host.querySelector('.' + focusClass + '[data-pos="' + focusPosId + '"]');
      if (restoredPosInp) {
        try { restoredPosInp.focus({ preventScroll: true }); } catch (e) { restoredPosInp.focus(); }
        try {
          if (focusStart != null && focusEnd != null) restoredPosInp.setSelectionRange(focusStart, focusEnd);
        } catch (e) {}
      }
    }
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
  // Add a new part to a position (v3 schema only)
  // Part numbers encode their own physical length in mm, e.g. WFB-0950ZP is
  // 0.95m, WFB-0450ZP is 0.45m, WFB-1200Z is 1.2m -- so the bar drawn for a
  // position should be exactly that long, not an arbitrary course-height guess.
  function partLengthM(partNo) {
    if (!partNo) return null;
    const m = String(partNo).match(/(\d{4})/);
    if (!m) return null;
    const code = parseInt(m[1], 10); // e.g. 0950 -> 0.95m, 1200 -> 1.2m
    return code > 0 ? code / 1000 : null;
  }

  function addPositionPart(diagramId, heightStr, positionId, partNo, context) {
    const p = PN() ? PN().activeParty() : "YSACC (Default)";
    if (positionId === "CS2" && partNo && (partNo === "WBR-1760SA2" || partNo === "WBR-1760SA4" || partNo.indexOf("1760SA") !== -1)) {
      partNo = "WBR-1760SA2/SA4";
    }
    const diagram = layout.diagrams.find(function (d) { return d.id === diagramId; });
    if (!diagram) return;
    let spec = effectiveHeightSpec(diagram, heightStr, p);
    if (!spec) return;

    // Deep clone if it's not already an override
    const key = heightSpecKey(diagram.id, String(heightStr), p);
    if (!overrides[key]) {
      spec = JSON.parse(JSON.stringify(spec));
    }

    if (!spec.members) {
      spec.members = JSON.parse(JSON.stringify(heightMembers(diagram, heightStr)));
      spec.mode = "manual";
    }
    if (!spec.positions) {
      const shipped = (diagram.heightSpecs || {})[String(heightStr)];
      spec.positions = (shipped && shipped.positions) ? JSON.parse(JSON.stringify(shipped.positions)) : {};
    }

    let bestGeom = { kind: "h", y: 0, x1: 0, x2: 1 };
    let bestLayer = "bar";
    let bestView = "outside";

    const posSpec = (spec.positions || {})[positionId];
    const H = spec.H_O || parseFloat(heightStr);
    const cols = spec.cols || diagram.cols || 3;

    if (posSpec) {
      if (positionId.startsWith("LV") || posSpec.kind === "v") {
        // LV bars are drawn at their real physical length (from the part
        // number, e.g. WFB-0950ZP = 0.95m), ending at the joint/edge the
        // position marks -- not stretched across the whole panel.
        const posY = posSpec.y != null ? posSpec.y : H;
        const partLen = partLengthM(partNo);
        const range = lvBarRange(posY, partLen);
        bestGeom = { kind: "v", x: posSpec.x, y1: posSpec.yMin != null ? posSpec.yMin : range.y1, y2: posSpec.yMax != null ? posSpec.yMax : range.y2 };
      } else {
        const xArr = Array.isArray(posSpec.x) ? posSpec.x : [posSpec.x];
        const minX = Math.min.apply(null, xArr);
        const maxX = Math.max.apply(null, xArr);
        const yVal = posSpec.y != null ? posSpec.y : 0;
        const x1Val = (xArr.length > 1) ? minX : 0;
        const x2Val = (xArr.length > 1) ? maxX : cols;
        bestGeom = { kind: "h", y: yVal, x1: x1Val, x2: x2Val };
      }
    } else {
      const shipped = (diagram.heightSpecs || {})[String(heightStr)];
      const templateMem = (shipped && shipped.members)
        ? shipped.members.find(function(m) { return m.positionId === positionId; })
        : spec.members.find(function(m) { return m.positionId === positionId; });
      if (templateMem && templateMem.geom) {
        bestGeom = JSON.parse(JSON.stringify(templateMem.geom));
        bestLayer = templateMem.layer || "bar";
        bestView = templateMem.view || "outside";
      }
    }

    // Create new member for this position
    const newMemberId = "pos_" + positionId + "_" + Date.now();
    const newMember = {
      memberId: newMemberId,
      positionId: positionId,
      partNo: partNo,
      context: context,
      geom: bestGeom,
      layer: bestLayer,
      view: bestView,
      scale: null
    };

    spec.members.push(newMember);
    writeHeightSpec(diagram.id, heightStr, spec, p);
    return newMember;
  }

  function removePositionPart(diagramId, heightStr, positionId, memberId) {
    const p = PN() ? PN().activeParty() : "YSACC (Default)";
    const diagram = layout.diagrams.find(function (d) { return d.id === diagramId; });
    if (!diagram) return;
    let spec = effectiveHeightSpec(diagram, heightStr, p);
    if (!spec) return;

    // Deep clone if it's not already an override
    const key = heightSpecKey(diagram.id, String(heightStr), p);
    if (!overrides[key]) {
      spec = JSON.parse(JSON.stringify(spec));
    }

    if (!spec.members) {
      spec.members = JSON.parse(JSON.stringify(heightMembers(diagram, heightStr)));
      spec.mode = "manual";
    }

    const idx = spec.members.findIndex(function (m) {
      if (m.memberId && memberId) {
        return m.memberId === memberId && m.positionId === positionId;
      }
      return m.positionId === positionId && !m.memberId && !memberId;
    });
    if (idx >= 0) {
      spec.members.splice(idx, 1);
      writeHeightSpec(diagram.id, heightStr, spec, p);
    }
  }

  function wireEvents(host, diagram, members, detailMap, cfg, hSel) {
    renderCtx = { host: host, diagram: diagram, members: members, detailMap: detailMap, cfg: cfg, hSel: hSel };

    host.querySelectorAll(".sa-company-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        const party = b.getAttribute("data-party");
        const pn = PN();
        if (pn && party) {
          pn.setActiveParty(party);

          // Map party name to customer preset id and sync
          let cid = 'default';
          if (party === 'MNT') cid = 'mnt_spec';
          else if (party === 'WATANI') cid = 'watani_spec';
          else if (party === 'HAYOUNG') cid = 'hayoung_spec';
          else if (party === 'ALMUFTAH') cid = 'almuftah';
          else if (typeof window !== 'undefined' && typeof window.getMatrixCustomerPresetList === 'function') {
            const list = window.getMatrixCustomerPresetList();
            const matched = list.find(c => c.name.replace(/\s*Spec$/i, '').trim() === party.replace(/\s*Spec$/i, '').trim() || c.id === party);
            if (matched) cid = matched.id;
          }
          if (typeof window !== 'undefined') {
            window.selectedCustomerPresetId = cid;
            localStorage.setItem('water_tank_selected_customer_preset_id', cid);
            if (typeof window.renderMatrixPresetTabsUI === 'function') window.renderMatrixPresetTabsUI();
          }

          render();
          updateUrlHash(true);
        }
      });
    });

    host.querySelectorAll(".sa-dtab").forEach(function (b) {
      b.addEventListener("click", function () {
        currentDiagramId = b.getAttribute("data-diagram");
        selectedMemberId = null;
        currentHeight = null;      // fall back to the configured height on the new diagram
        render();
        updateUrlHash(true);
      });
    });

    // Drag & Drop reordering for diagram tabs
    let draggedDiagramId = null;
    host.querySelectorAll(".sa-dtab-wrap").forEach(function (wrap) {
      wrap.addEventListener("dragstart", function (e) {
        draggedDiagramId = wrap.getAttribute("data-diagram-id");
        e.dataTransfer.setData("text/plain", draggedDiagramId);
        e.dataTransfer.effectAllowed = "move";
        wrap.style.opacity = "0.4";
      });
      wrap.addEventListener("dragend", function () {
        wrap.style.opacity = "";
        host.querySelectorAll(".sa-dtab-wrap").forEach(function (w) {
          w.style.borderLeft = "";
          w.style.borderRight = "";
        });
      });
      wrap.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const targetId = wrap.getAttribute("data-diagram-id");
        if (targetId && targetId !== draggedDiagramId) {
          const rect = wrap.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          if (e.clientX < midX) {
            wrap.style.borderLeft = "3px solid #0284c7";
            wrap.style.borderRight = "";
          } else {
            wrap.style.borderRight = "3px solid #0284c7";
            wrap.style.borderLeft = "";
          }
        }
      });
      wrap.addEventListener("dragleave", function () {
        wrap.style.borderLeft = "";
        wrap.style.borderRight = "";
      });
      wrap.addEventListener("drop", function (e) {
        e.preventDefault();
        wrap.style.borderLeft = "";
        wrap.style.borderRight = "";
        const srcId = draggedDiagramId || e.dataTransfer.getData("text/plain");
        const targetId = wrap.getAttribute("data-diagram-id");
        if (!srcId || !targetId || srcId === targetId || !layout || !Array.isArray(layout.diagrams)) return;

        const srcIdx = layout.diagrams.findIndex(function (d) { return d.id === srcId; });
        const targetIdx = layout.diagrams.findIndex(function (d) { return d.id === targetId; });
        if (srcIdx === -1 || targetIdx === -1) return;

        const rect = wrap.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertAfter = e.clientX >= midX;

        const [moved] = layout.diagrams.splice(srcIdx, 1);
        let newTargetIdx = layout.diagrams.findIndex(function (d) { return d.id === targetId; });
        if (insertAfter) {
          newTargetIdx += 1;
        }
        layout.diagrams.splice(newTargetIdx, 0, moved);

        overrides.diagramOrder = layout.diagrams.map(function (d) { return d.id; });
        persistOverrides();
        render();
      });
    });
    host.querySelectorAll(".sa-segbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        viewMode = b.getAttribute("data-view");
        render();
        updateUrlHash(true);
      });
    });
    host.querySelectorAll(".sa-hchip").forEach(function (b) {
      b.addEventListener("click", function () {
        currentHeight = b.getAttribute("data-h");
        selectedMemberId = null;
        render();
        updateUrlHash(true);
      });
    });

    // Tab switching in side panel
    host.querySelectorAll(".sa-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const tabId = btn.getAttribute("data-tab");
        host.querySelectorAll(".sa-tab-btn").forEach(function (b) {
          b.classList.remove("sa-tab-active");
          b.style.borderBottomColor = "#e5e7eb";
          b.style.color = "#6b7280";
        });
        host.querySelectorAll(".sa-side-tab-content").forEach(function (c) { c.style.display = "none"; });
        btn.classList.add("sa-tab-active");
        btn.style.borderBottomColor = "#3b82f6";
        btn.style.color = "#3b82f6";
        const content = host.querySelector('.sa-side-tab-content[data-tab="' + tabId + '"]');
        if (content) content.style.display = "block";
      });
    });

    if (delegatesWired) return;
    delegatesWired = true;

    // Select a member from the drawing, the legend, or an audit finding
    host.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-action], input, textarea, select, button, label, .sa-tbl-scale-input")) return; // Do not move or re-render when clicking form controls
      const el = ev.target.closest ? ev.target.closest("[data-member-id]") : null;
      if (!el) return;
      const newId = el.getAttribute("data-member-id");
      if (selectedMemberId !== newId) {
        selectedMemberId = newId;
        render();
      }
      // Clicking a bar in the drawing jumps to its row in the position panel
      // on the right, same as clicking an (unregistered) badge already does.
      const m = (renderCtx.members || []).find(function (x) { return x.memberId === newId; });
      if (m && m.positionId && global.saClickPosition) {
        setTimeout(function () { global.saClickPosition(m.positionId); }, 0);
      }
    });

    host.addEventListener("click", function (ev) {
      const btn = ev.target.closest ? ev.target.closest("[data-action]") : null;
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const diagram = renderCtx.diagram;

      if (action === "add-company") {
        const newName = prompt("새로 추가할 회사(거래처) 이름을 입력하세요 (예: MNT, WATANI, ALMUFTAH, HYUNDAI):");
        if (!newName || !newName.trim()) return;
        const cleanName = newName.trim();
        const pn = PN();
        if (!pn) return;
        if (pn.listParties().indexOf(cleanName) !== -1) {
          alert("이미 존재하는 회사(거래처) 이름입니다.");
          return;
        }
        pn.addParty(cleanName);
        pn.setActiveParty(cleanName);
        render();
      } else if (action === "copy-company") {
        const pn = PN();
        if (!pn) return;
        const cur = pn.activeParty() || "YSACC (Default)";
        const newName = prompt("[" + cur + "] Spec을 복사할 새 회사 이름을 입력하세요:", cur + " (사본)");
        if (!newName || !newName.trim()) return;
        const cleanName = newName.trim();
        if (pn.listParties().indexOf(cleanName) !== -1) {
          alert("이미 존재하는 회사(거래처) 이름입니다.");
          return;
        }
        pn.copyParty(cur, cleanName);

        // Copy all heightSpec overrides for this company
        Object.keys(overrides).forEach(function (k) {
          const prefix = HEIGHTSPEC_PREFIX + cur + "::";
          if (k.startsWith(prefix)) {
            const newK = HEIGHTSPEC_PREFIX + cleanName + "::" + k.slice(prefix.length);
            overrides[newK] = JSON.parse(JSON.stringify(overrides[k]));
          } else if (cur === "YSACC (Default)" && k.startsWith(HEIGHTSPEC_PREFIX) && !k.includes("::MNT::") && !k.includes("::WATANI::") && !k.includes("::ALMUFTAH::")) {
            const rest = k.slice(HEIGHTSPEC_PREFIX.length);
            if (rest.indexOf("::") !== -1 && !rest.startsWith("spec_")) {
              const newK = HEIGHTSPEC_PREFIX + cleanName + "::" + rest;
              overrides[newK] = JSON.parse(JSON.stringify(overrides[k]));
            }
          }
        });
        persistOverrides();

        pn.setActiveParty(cleanName);
        render();
      } else if (action === "rename-company") {
        const pn = PN();
        if (!pn) return;
        const cur = pn.activeParty() || "YSACC (Default)";
        if (cur === "YSACC (Default)" || cur === "표준" || cur === "표준 (Standard)") {
          alert("기본 YSACC Spec 이름은 변경할 수 없습니다.");
          return;
        }
        const newName = prompt("[" + cur + "]의 변경할 회사 이름을 입력하세요:", cur);
        if (!newName || !newName.trim() || newName.trim() === cur) return;
        const cleanName = newName.trim();
        if (pn.listParties().indexOf(cleanName) !== -1) {
          alert("이미 존재하는 회사(거래처) 이름입니다.");
          return;
        }
        pn.renameParty(cur, cleanName);

        // Rename heightSpec override keys
        Object.keys(overrides).forEach(function (k) {
          const prefix = HEIGHTSPEC_PREFIX + cur + "::";
          if (k.startsWith(prefix)) {
            const newK = HEIGHTSPEC_PREFIX + cleanName + "::" + k.slice(prefix.length);
            overrides[newK] = overrides[k];
            delete overrides[k];
          }
        });
        persistOverrides();

        render();
      } else if (action === "delete-company") {
        const pn = PN();
        if (!pn) return;
        const cur = pn.activeParty() || "YSACC (Default)";
        if (cur === "YSACC (Default)" || cur === "표준" || cur === "표준 (Standard)") {
          alert("기본 YSACC Spec은 삭제할 수 없습니다.");
          return;
        }
        if (!confirm("정말로 [" + cur + "] 회사 Spec 탭을 삭제하시겠습니까?")) return;
        pn.removeParty(cur);

        // Remove heightSpec overrides for this company
        Object.keys(overrides).forEach(function (k) {
          const prefix = HEIGHTSPEC_PREFIX + cur + "::";
          if (k.startsWith(prefix)) {
            delete overrides[k];
          }
        });
        persistOverrides();

        pn.setActiveParty("YSACC (Default)");
        updateUrlHash(true);
        render();
      } else if (action === "save-formula") {
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
      } else if (action === "apply-all-default-scales") {
        const hStr = btn.getAttribute("data-h") || renderCtx.hSel;
        const list = detachHeight(diagram, hStr);
        let count = 0;
        list.forEach(function (m) {
          const defScale = getDefaultScaleForPosition(m, diagram, hStr);
          if (defScale) {
            m.scale = defScale;
            count++;
          }
        });
        persistOverrides();
        render();
        alert(count + "개 위치 부재에 기본 배수식이 성공적으로 자동 대입되었습니다!");
      } else if (action === "apply-scale") {
        // Fills the box only -- saving stays an explicit, separate click.
        const inp = document.getElementById("saMemberScale");
        if (inp) {
          inp.value = btn.getAttribute("data-scale") || "";
          try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
        }
      } else if (action === "copy-diagram") {
        copyDiagramPrompt(btn.getAttribute("data-diagram-id"));
      } else if (action === "delete-diagram") {
        deleteDiagramPrompt(btn.getAttribute("data-diagram-id"));
      } else if (action === "delete-instance") {
        const memberId = btn.getAttribute("data-member-id");
        const hStr = btn.getAttribute("data-h") || renderCtx.hSel;
        if (!memberId) return;
        if (!confirm("이 위치에 등록된 부품을 삭제할까요?")) return;
        const list = detachHeight(diagram, hStr);
        const idx = list.findIndex(function (m) { return m.memberId === memberId; });
        if (idx !== -1) list.splice(idx, 1);
        persistOverrides();
        selectedMemberId = null;
        render();
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
      } else if (action === "reset-reinforcing-height") {
        const h = btn.getAttribute("data-h");
        const p = PN() ? PN().activeParty() : "YSACC (Default)";
        if (!confirm("[" + p + "] " + h + "mH 의 보강재(LH, LV) 등록만 삭제하시겠습니까?\n(CS 접합부 등록은 안전하게 유지됩니다.)")) return;
        const list = detachHeight(diagram, h, p);
        const remaining = list.filter(function (m) { return isCsMember(m, h); });
        list.length = 0;
        remaining.forEach(function (m) { list.push(m); });
        persistOverrides();
        selectedMemberId = null;
        render();
      } else if (action === "reset-cs-height") {
        const h = btn.getAttribute("data-h");
        const p = PN() ? PN().activeParty() : "YSACC (Default)";
        if (!confirm("[" + p + "] " + h + "mH 의 CS 접합부 등록만 삭제하시겠습니까?\n(보강재 등록은 안전하게 유지됩니다.)")) return;
        const list = detachHeight(diagram, h, p);
        const remaining = list.filter(function (m) { return !isCsMember(m, h); });
        list.length = 0;
        remaining.forEach(function (m) { list.push(m); });
        
        const spec = effectiveHeightSpec(diagram, h, p);
        if (spec && spec.positions) {
          Object.keys(spec.positions).forEach(function (pId) {
            if (pId.startsWith("CS")) {
              spec.positions[pId].enabled = false;
            }
          });
        }
        persistOverrides();
        selectedMemberId = null;
        render();
        alert("[" + h + "mH CS 초기화 완료]\n\n" + h + "mH 높이의 CS(코너/접합부) 등록 부품이 초기화되었습니다.\n(보강재 등록 데이터는 안전하게 유지됩니다.)");
      } else if (action === "reset-cs-all-heights") {
        if (!confirm("모든 높이(1mH ~ 5mH)의 CS(코너/접합부) 등록 항목을 일괄 초기화(미정의) 하시겠습니까?\n\n※ 보강재(LH/LV) 등록 데이터는 전혀 손상되지 않고 안전하게 유지됩니다.")) return;
        const heights = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
        const p = PN() ? PN().activeParty() : "YSACC (Default)";
        heights.forEach(function (h) {
          const list = detachHeight(diagram, h, p);
          const remaining = list.filter(function (m) { return !isCsMember(m, h); });
          list.length = 0;
          remaining.forEach(function (m) { list.push(m); });
          
          const spec = effectiveHeightSpec(diagram, h, p);
          if (spec && spec.positions) {
            Object.keys(spec.positions).forEach(function (pId) {
              if (pId.startsWith("CS")) {
                spec.positions[pId].enabled = false;
              }
            });
          }
        });
        persistOverrides();
        selectedMemberId = null;
        render();
        alert("[전체 높이 CS 초기화 완료]\n\n모든 높이(1mH ~ 5mH)의 CS(코너/접합부) 등록 부품이 일괄 초기화(미정의)되었습니다.\n(보강재 등록 데이터는 안전하게 유지됩니다.)");
      } else if (action === "reset-height") {
        const h = btn.getAttribute("data-h");
        const p = PN() ? PN().activeParty() : "YSACC (Default)";
        if (!confirm("[" + p + "] " + h + "mH 의 모든 등록 부품(보강재 및 CS 접합부 둘 다)을 삭제하여 완전 초기화(빈 도면) 하시겠습니까?")) return;
        const list = detachHeight(diagram, h, p);
        list.length = 0; // Clear all members (both reinforcing and CS)
        const spec = effectiveHeightSpec(diagram, h, p);
        if (spec && spec.positions) {
          Object.keys(spec.positions).forEach(function (pId) {
            if (pId.startsWith("CS")) {
              spec.positions[pId].enabled = false;
            }
          });
        }
        persistOverrides();
        selectedMemberId = null;
        render();
      } else if (action === "goto-height") {
        currentHeight = btn.getAttribute("data-h");
        viewMode = "sheet";
        selectedMemberId = null;
        render();
      } else if (action === "save-instance-scale") {
        const memberId = btn.getAttribute("data-member-id");
        const hStr = btn.getAttribute("data-h") || renderCtx.hSel;
        if (!memberId) return;
        const rowEl = btn.closest("tr");
        const inp = rowEl ? rowEl.querySelector(".sa-tbl-scale-input") : null;
        if (!inp) return;
        const text = inp.value.trim();
        if (text && global.RuleEngine) {
          try {
            global.RuleEngine.tokenize(text);
          } catch (e) {
            alert("수식 오류: " + e.message);
            return;
          }
        }
        const start = inp.selectionStart, end = inp.selectionEnd;
        patchHeightMember(diagram, hStr, memberId, { scale: text || null });
        render();
        setTimeout(function () {
          const restoredInp = host.querySelector('.sa-tbl-scale-input[data-member-id="' + memberId + '"]');
          if (restoredInp) {
            try { restoredInp.focus({ preventScroll: true }); } catch (e) { restoredInp.focus(); }
            try { if (start != null && end != null) restoredInp.setSelectionRange(start, end); } catch (e) {}
          }
        }, 0);
      } else if (action === "locate-member") {
        const memberId = btn.getAttribute("data-member-id");
        if (!memberId) return;
        selectedMemberId = memberId;
        render();
        // Scroll the drawing (not the table row we just clicked in) into view
        // so the yellow-halo highlight is actually visible right away.
        setTimeout(function () {
          const svg = host.querySelector("svg.sa-panel-svg");
          if (svg) svg.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
      } else if (action === "edit-part-scale") {
        const pn = btn.getAttribute("data-part");
        const hStr = btn.getAttribute("data-h") || renderCtx.hSel;
        if (!pn) return;
        const members = heightMembers(diagram, hStr);
        const targetMembers = members.filter(function (m) {
          const detail = m.rowId ? detailMap[m.rowId] : null;
          return memberPartNo(m, detail) === pn;
        });
        if (!targetMembers.length) return;

        const currentScale = targetMembers[0].scale || "";
        const promptMsg = "품번 [" + pn + "] 의 배수식(scale)을 입력하세요.\n\n" +
          "※ 배수식은 도면에 그려진 1개가 탱크 전체에서 몇 번 나오는가(배수)입니다.\n" +
          "※ 입력 예시: perim*2, N_PA, (W_C+W_F-1)*N_PA, 4 등\n" +
          "※ 사용할 수 있는 주요 변수: perim, N_PA, W_C, W_F, L_C, L_F, H_O 등";
        const input = prompt(promptMsg, currentScale);

        if (input !== null) {
          const text = input.trim();
          if (text && global.RuleEngine) {
            try {
              global.RuleEngine.tokenize(text);
            } catch (e) {
              alert("수식 오류: " + e.message);
              return;
            }
          }
          targetMembers.forEach(function (m) {
            patchHeightMember(diagram, hStr, m.memberId, { scale: text || null });
          });
          if (targetMembers[0]) selectedMemberId = targetMembers[0].memberId;
          render();
        }
      } else if (action === "fix-formula") {
        fixFormulaForHeight(diagram, btn.getAttribute("data-row"), btn.getAttribute("data-h"), parseFloat(btn.getAttribute("data-target")));
      } else if (action === "open-matching") {
        matchingOpen = !matchingOpen;
        render();
      } else if (action === "close-matching") {
        matchingOpen = false;
        render();
      } else if (action === "add-party") {
        const pn = PN();
        if (!pn) return;
        const name = prompt("추가할 거래처 이름을 입력하세요.\n(그 회사가 쓰는 품번을 따로 등록할 수 있게 됩니다)");
        if (!name || !name.trim()) return;
        if (!pn.addParty(name.trim())) { alert("이미 있는 거래처입니다."); return; }
        pn.setActiveParty(name.trim());
        render();
      } else if (action === "add-position-part") {
        // Add a new part to a position in v3 schema
        const posId = btn.getAttribute("data-position-id");
        const diagramId = btn.getAttribute("data-diagram-id");
        const height = btn.getAttribute("data-height");
        const form = btn.closest(".sa-add-part-form");
        if (!form) return;
        const partNoInput = form.querySelector(".sa-pos-part-no");
        const contextInput = form.querySelector(".sa-pos-context");
        if (!partNoInput || !partNoInput.value.trim()) { alert("품번을 입력하세요."); return; }

        const partNo = partNoInput.value.trim();
        const context = contextInput ? contextInput.value.trim() : "";
        addPositionPart(diagramId, height, posId, partNo, context);
        render();
      } else if (action === "remove-position-part") {
        // Remove a part from a position
        const posId = btn.getAttribute("data-position-id");
        const memberId = btn.getAttribute("data-member-id");
        removePositionPart(diagram.id, renderCtx.hSel, posId, memberId);
        render();
      } else if (action === "export-json") {
        exportJson();
      } else if (action === "import-json") {
        const f = document.getElementById("saImportFile");
        if (f) f.click();
      } else if (action === "quick-add-pos-part") {
        const posId = btn.getAttribute("data-pos");
        const hStr = btn.getAttribute("data-h") || renderCtx.hSel;
        if (!posId) return;

        const partNo = prompt("[" + posId + "] 위치에 추가할 부품 품번을 입력하세요:\n(예: WFB-0950ZP, WCP-1610Z, WFB-0450ZP)");
        if (!partNo || !partNo.trim()) return;

        const scaleText = prompt("[" + posId + " - " + partNo.trim() + "] 위치의 수량 배수식을 입력하세요 (선택사항):\n(예: perim*2, 2*4, (W_C+L1_C+L2_C+L3_C+L4_C)*2)", "");

        if (scaleText && scaleText.trim() && global.RuleEngine) {
          try {
            global.RuleEngine.tokenize(scaleText.trim());
          } catch (e) {
            alert("배수식 오류: " + e.message);
            return;
          }
        }

        const newM = addPositionPart(diagram.id, hStr, posId, partNo.trim(), "");
        if (newM && scaleText && scaleText.trim()) {
          patchHeightMember(diagram, hStr, newM.memberId, { scale: scaleText.trim() });
        }
        render();
      } else if (action === "add-legend-part") {
        const hStr = btn.getAttribute("data-h") || renderCtx.hSel;
        const posSelect = document.getElementById("saLegendPosSelect");
        const customPosInp = document.getElementById("saLegendCustomPos");
        const partNoInp = document.getElementById("saLegendPartNo");
        const scaleInp = document.getElementById("saLegendScale");

        let posId = posSelect ? posSelect.value : "LH1";
        if (posId === "CUSTOM") {
          posId = customPosInp ? customPosInp.value.trim().toUpperCase() : "";
        }
        if (!posId) { alert("위치 ID를 입력하거나 선택하세요."); return; }

        const partNo = partNoInp ? partNoInp.value.trim() : "";
        if (!partNo) { alert("품번을 입력하세요."); return; }

        const scaleText = scaleInp ? scaleInp.value.trim() : "";
        if (scaleText && global.RuleEngine) {
          try {
            global.RuleEngine.tokenize(scaleText);
          } catch (e) {
            alert("배수식 오류: " + e.message);
            return;
          }
        }

        const newM = addPositionPart(diagram.id, hStr, posId, partNo, "");
        if (newM && scaleText) {
          patchHeightMember(diagram, hStr, newM.memberId, { scale: scaleText });
        }
        render();
      }
    });

    function autoSaveInstanceScale(inp) {
      if (!inp) return;
      const memberId = inp.getAttribute("data-member-id");
      const hStr = inp.getAttribute("data-h") || (renderCtx && renderCtx.hSel);
      const diagram = renderCtx && renderCtx.diagram;
      if (!memberId || !diagram || !hStr) return;

      const text = inp.value.trim();
      let isValid = true;
      if (text && global.RuleEngine) {
        try {
          global.RuleEngine.tokenize(text);
          inp.style.borderColor = "#16a34a";
          inp.style.background = "#f0fdf4";
        } catch (e) {
          inp.style.borderColor = "#ef4444";
          inp.style.background = "#fef2f2";
          isValid = false;
        }
      } else {
        inp.style.borderColor = "#cbd5e1";
        inp.style.background = "#ffffff";
      }

      patchHeightMember(diagram, hStr, memberId, { scale: text || null });

      const tr = inp.closest("tr");
      if (tr) {
        const scope = getScopeForDiagram(diagram.id);
        const m = getMemberById(diagram, hStr, memberId);
        if (m) {
          const dq = memberDrawnQty(m, scope, hStr);
          const isUnscaled = dq.qty == null;
          const drawnTd = tr.querySelector(".sa-num");
          const verdictTd = tr.querySelector(".sa-cmp-verdict");

          if (drawnTd) {
            drawnTd.innerHTML = isUnscaled
              ? '<span class="sa-unscaled" style="color:#d97706; font-weight:700;">미산정</span>'
              : '<b style="color:#0f172a; font-size:13px;">' + Math.round(dq.qty) + '</b>';
          }
          if (verdictTd) {
            verdictTd.innerHTML = isUnscaled
              ? '<span style="color:#d97706; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> 배수식 필요</span>'
              : '';
          }
        }
      }
    }

    host.addEventListener("input", function (ev) {
      const t = ev.target;
      if (t && t.classList && t.classList.contains("sa-tbl-scale-input")) {
        const text = t.value.trim();
        const memberId = t.getAttribute("data-member-id");
        const hStr = t.getAttribute("data-h") || (renderCtx && renderCtx.hSel);
        const diagram = renderCtx && renderCtx.diagram;
        if (!memberId || !diagram || !hStr) return;

        if (text && global.RuleEngine) {
          try {
            global.RuleEngine.tokenize(text);
            t.style.borderColor = "#16a34a";
            t.style.background = "#f0fdf4";
          } catch (e) {
            t.style.borderColor = "#ef4444";
            t.style.background = "#fef2f2";
          }
        } else {
          t.style.borderColor = "#cbd5e1";
          t.style.background = "#ffffff";
        }

        const tr = t.closest("tr");
        if (tr) {
          const scope = getScopeForDiagram(diagram.id);
          const m = getMemberById(diagram, hStr, memberId);
          if (m) {
            const mCopy = Object.assign({}, m, { scale: text || null });
            const dq = memberDrawnQty(mCopy, scope, hStr, diagram);
            const isUnscaled = dq.qty == null;
            const drawnTd = tr.querySelector(".sa-num");
            const verdictTd = tr.querySelector(".sa-cmp-verdict");
            if (drawnTd) {
              drawnTd.innerHTML = isUnscaled
                ? '<span class="sa-unscaled" style="color:#d97706; font-weight:700;">미산정</span>'
                : '<b style="color:#0f172a; font-size:13px;">' + Math.round(dq.qty) + '</b>';
            }
            if (verdictTd) {
              verdictTd.innerHTML = isUnscaled
                ? '<span style="color:#d97706; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> 배수식 필요</span>'
                : '';
            }
          }
        }
      }
    });

    host.addEventListener("change", function (ev) {
      const t = ev.target;
      if (t && t.classList && t.classList.contains("sa-tbl-scale-input")) {
        autoSaveInstanceScale(t);
      }
    });

    host.addEventListener("blur", function (ev) {
      const t = ev.target;
      if (t && t.classList && t.classList.contains("sa-tbl-scale-input")) {
        autoSaveInstanceScale(t);
      }
    }, true);

    host.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && ev.target) {
        if (ev.target.classList.contains("sa-tbl-scale-input")) {
          ev.preventDefault();
          autoSaveInstanceScale(ev.target);
          ev.target.blur();
        } else if (ev.target.classList.contains("sa-pos-part-no") || ev.target.classList.contains("sa-pos-context")) {
          ev.preventDefault();
          const formEl = ev.target.closest(".sa-add-part-form");
          const addBtn = formEl ? formEl.querySelector('[data-action="add-position-part"]') : null;
          if (addBtn) addBtn.click();
        }
      }
    });

    // Position enable/disable toggle
    host.addEventListener("change", function (ev) {
      const t = ev.target;
      if (t.classList && t.classList.contains("sa-pos-enabled-toggle")) {
        const posId = t.getAttribute("data-position-id");
        const isEnabled = t.checked;
        const diagram = renderCtx.diagram;
        const hStr = renderCtx.hSel;

        if (diagram && hStr) {
          togglePositionEnabled(diagram, hStr, posId, isEnabled);
          render();
        }
        return;
      }
    });

    // 거래처 switch + matching-table edits. Both are delegated because the
    // controls are rebuilt on every render.
    host.addEventListener("change", function (ev) {
      const t = ev.target;
      const pn = PN();
      if (!pn || !t) return;
      if (t.id === "saParty") {
        pn.setActiveParty(t.value);
        render();
        return;
      }
      if (t.classList && t.classList.contains("sa-match-inp")) {
        const canonical = t.getAttribute("data-canonical");
        const party = pn.activeParty();
        const rowEl = t.closest("tr");
        const get = function (field) {
          const el = rowEl && rowEl.querySelector('.sa-match-inp[data-field="' + field + '"]');
          return el ? el.value.trim() : "";
        };
        pn.setMapping(canonical, party, { partNo: get("partNo"), name: get("name") });
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

  // The y a shape is "hung from", used to check it sits on a panel joint. Bars
  // and brackets have one; a vertical bar spans between joints and has none.
  function anchorY(g) {
    if (!g) return null;
    if (g.kind === "h" || g.kind === "rect") return typeof g.y === "number" ? g.y : null;
    return null;
  }

  function round2(v) { return Math.round(v * 100) / 100; }

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
    "(W_C+L1_C+L2_C+L3_C+L4_C)*2", "(W_F+L1_F+L2_F+L3_F+L4_F)*2", "4*2", "2*4", "perim*2", "perim", "perim3*2", "perim3",
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
      '.sa-intro{background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:8px;padding:7px 10px;font-size:11.5px;line-height:1.45;color:#075985;margin-bottom:7px;}' +
      '.sa-diagram-tabs{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;}' +
      '.sa-dtab-wrap{display:inline-flex;align-items:center;position:relative;cursor:grab;user-select:none;border-radius:7px;transition:opacity 0.15s, border 0.1s;}' +
      '.sa-dtab-wrap:active{cursor:grabbing;}' +
      '.sa-drag-grip{opacity:0.35;font-size:10.5px;margin-right:4px;cursor:grab;display:inline-flex;align-items:center;}' +
      '.sa-drag-grip:hover{opacity:0.8;}' +
      '.sa-dtab{display:flex;align-items:center;gap:5px;padding:5px 9px;border:1.5px solid #cbd5e1;background:#fff;border-radius:7px;font-size:11.5px;font-weight:600;color:#334155;cursor:pointer;}' +
      '.sa-dtab.active{background:#0369a1;border-color:#0369a1;color:#fff;}' +
      '.sa-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px;}' +
      '.sa-tool-right{display:flex;gap:5px;align-items:center;flex-wrap:wrap;}' +
      '.sa-seg{display:inline-flex;border:1.5px solid #cbd5e1;border-radius:7px;overflow:hidden;}' +
      '.sa-segbtn{padding:5px 11px;border:0;background:#fff;font-size:11.5px;font-weight:600;color:#475569;cursor:pointer;}' +
      '.sa-segbtn.active{background:#0369a1;color:#fff;}' +
      '.sa-check{font-size:11.5px;font-weight:600;color:#334155;display:inline-flex;align-items:center;gap:5px;cursor:pointer;}' +
      '.sa-main{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;}' +
      '.sa-canvas{flex:1 1 620px;min-width:320px;display:flex;flex-direction:column;gap:4px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:9px;overflow-x:auto;}' +
      '.sa-layer-title{font-size:11.5px;font-weight:700;color:#0369a1;background:#f0f9ff;border-left:3px solid #0284c7;padding:4px 9px;border-radius:0 5px 5px 0;margin-top:6px;}' +

      // --- Height rail (sheet mode) ---
      '.sa-hrail{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;padding:5px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;}' +
      '.sa-hchip{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:56px;padding:4px 7px;border:1.5px solid #cbd5e1;background:#fff;border-radius:7px;cursor:pointer;}' +
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
      '.sa-sheet-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:13px;font-weight:700;color:#fff;background:#4472c4;border-radius:6px;padding:6px 10px;margin-bottom:6px;}' +
      '.sa-sheet-mode-badge{font-size:10px;}' +
      '.sa-sheet-title .sa-hb-auto,.sa-sheet-title .sa-hb-manual{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:7px;}' +
      '.sa-sheet-detached{font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 9px;margin-bottom:9px;}' +
      '.sa-sheet-body{display:flex;flex-direction:column;gap:8px;align-items:stretch;}' +
      '.sa-sheet-views{display:flex;flex-direction:column;gap:6px;min-width:0;overflow-x:auto;}' +
      '.sa-view-block{border:1px solid #e2e8f0;border-radius:8px;padding:6px;background:#fcfdff;}' +
      '.sa-view-title{font-size:12px;font-weight:700;color:#334155;margin-bottom:6px;}' +
      '.sa-svg-sheet{align-items:flex-start;justify-content:flex-start;margin-top:4px;}' +
      '.sa-sheet-side{width:100%;min-width:0;}' +
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

      // --- 거래처 표기 / 품번 매칭 ---
      '.sa-party{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:#334155;}' +
      '.sa-party select{font-size:11.5px;padding:5px 7px;border:1.5px solid #cbd5e1;border-radius:6px;background:#fff;color:#0f172a;}' +
      '.sa-match{background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;}' +
      '.sa-match-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;}' +
      '.sa-match-party{font-size:11px;font-weight:600;color:#0369a1;background:#e0f2fe;padding:2px 8px;border-radius:8px;}' +
      '.sa-match-note{font-size:10.5px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:7px 9px;margin-top:8px;line-height:1.6;}' +
      '.sa-match-table{width:100%;border-collapse:collapse;font-size:11px;}' +
      '.sa-match-table th{text-align:left;font-size:10px;color:#64748b;font-weight:700;padding:3px 5px;border-bottom:1.5px solid #e2e8f0;white-space:nowrap;}' +
      '.sa-match-table td{padding:4px 5px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}' +
      '.sa-match-table tr.sa-match-missing{background:#fef2f2;}' +
      '.sa-match-flag{text-align:center;font-weight:700;}' +
      '.sa-match-missing .sa-match-flag{color:#dc2626;}' +
      '.sa-match-inp{min-width:130px;}' +

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
      '.sa-panel-svg{display:block;}' +
      '.sa-legend{display:flex;flex-direction:column;gap:2px;min-width:96px;}' +
      '.sa-legend-row{display:flex;align-items:center;gap:5px;font-size:9.5px;cursor:pointer;}' +
      '.sa-legend-row:hover{background:#f1f5f9;}' +
      '.sa-legend-swatch{display:inline-block;width:16px;height:4px;border-radius:1px;}' +
      '.sa-pos-chip{display:inline-block;padding:2px 8px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-weight:700;font-size:11px;border:1px solid #bfdbfe;}' +
      // Typing in either field of a position row blinks that position's badge,
      // so it stays obvious which one you're editing among many similar rows.
      '@keyframes sa-badge-blink{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.35;transform:scale(1.12);}}' +
      '.sa-position-table tr:focus-within .sa-pos-badge{animation:sa-badge-blink 0.9s ease-in-out infinite;box-shadow:0 0 0 3px rgba(37,99,235,0.35);}' +
      '.sa-legend-label{font-family:monospace;color:#0f172a;}' +
      '.sa-legend-label.sa-missing{color:#dc2626;text-decoration:underline dotted;}' +
      '.sa-legend-empty{font-size:10px;color:#94a3b8;}' +
      '.sa-side{flex:1 1 320px;min-width:300px;max-width:460px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:8px;}'+
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
      .then(function (json) {
        layout = json;
        loadError = null;
        applyCustomDiagramsAndTitles();
      })
      .catch(function (err) { loadError = err.message; console.error("[SteelAccessories] 도면 정의 로드 실패:", err); });
  }

  // The drawing file already records, member by member, that (say) the sheet
  // prints "WBR-1610Z" for catalog part WCP-1610Z. Transcribe those pairs into
  // a 거래처 set so the naming layer starts with the knowledge the file already
  // holds. This copies what the author wrote down -- it never infers a match --
  // and seedFromPairs() refuses to overwrite anything already recorded.
  const SEED_PARTY = "YSACC (Default)";

  function seedNamingFromLayout() {
    const pn = PN();
    if (!pn || !layout) return;
    const pairs = [];
    (layout.diagrams || []).forEach(function (d) {
      const all = (d.members || []).concat(
        Object.keys(d.heightSpecs || {}).reduce(function (a, h) {
          return a.concat((d.heightSpecs[h] || {}).members || []);
        }, []));
      all.forEach(function (m) {
        if (!m.partNo || !m.aliasLabel) return;
        const label = String(m.aliasLabel).replace(/\s*\((INSIDE|Outside|Side Bottom)\)\s*/i, "").trim();
        if (!label || label === m.partNo) return;
        pairs.push({ canonical: m.partNo, label: label });
      });
    });
    if (pairs.length) pn.seedFromPairs(SEED_PARTY, pairs);
  }

  function init(db) {
    dbRef = db || null;
    overrides = loadLocalOverrides();
    const pn = PN();
    const naming = pn ? pn.init(db) : Promise.resolve();
    if (pn) pn.onChange(function () { auditCache = { key: null, value: null }; });
    return Promise.all([fetchLayout(), naming]).then(function () {
      seedNamingFromLayout();
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

  function updateUrlHash(updateUrl) {
    if (updateUrl === false) return;
    if (typeof window === "undefined") return;

    const pn = PN();
    const curParty = pn ? (pn.activeParty() || "YSACC (Default)") : "YSACC (Default)";
    let hash = "steel-accessories";

    if (curParty && curParty !== "YSACC (Default)" && curParty !== "표준" && curParty !== "표준 (Standard)") {
      hash += "/" + encodeURIComponent(curParty.toLowerCase().trim());
    }

    if (currentDiagramId) {
      hash += "/" + currentDiagramId;
      if (viewMode === "overview") {
        hash += "/overview";
      } else if (currentHeight) {
        hash += "/" + currentHeight + "m";
      }
    }

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "#" + hash);
    } else {
      window.location.hash = hash;
    }
  }

  function switchView(partyOrDiagramId, diagramIdOrH, subModeOrH, heightVal, updateUrl) {
    if (updateUrl === undefined) updateUrl = true;

    let diagramId = partyOrDiagramId;
    let subMode = diagramIdOrH;
    let hVal = subModeOrH;

    const pn = PN();
    if (pn && partyOrDiagramId) {
      const parties = pn.listParties();
      const rawP = String(partyOrDiagramId).toLowerCase().trim();
      const matchedParty = parties.find(function (p) {
        const pNorm = p.toLowerCase().trim();
        return pNorm === rawP || encodeURIComponent(pNorm) === rawP || (rawP === "ysacc" && pNorm.startsWith("ysacc"));
      });
      if (matchedParty) {
        pn.setActiveParty(matchedParty);
        diagramId = diagramIdOrH;
        subMode = subModeOrH;
        hVal = heightVal;
      }
    }

    if (diagramId) {
      const targetStr = String(diagramId).toLowerCase().trim();
      let foundD = null;

      if (layout && layout.diagrams) {
        // 1. Match diagram ID
        foundD = layout.diagrams.find(function(d) {
          return d.id && String(d.id).toLowerCase().trim() === targetStr;
        });
        // 2. Match diagram 1-6 number
        if (!foundD && !isNaN(parseInt(targetStr, 10))) {
          const parsed = parseInt(targetStr, 10);
          if (parsed >= 1 && parsed <= layout.diagrams.length) {
            foundD = layout.diagrams[parsed - 1];
          }
        }
        // 3. Match diagram title
        if (!foundD) {
          foundD = layout.diagrams.find(function(d) {
            const cleanTitle = String(d.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanT = targetStr.replace(/[^a-z0-9]/g, "");
            return cleanTitle === cleanT || (cleanT && cleanTitle.includes(cleanT));
          });
        }
      }

      if (foundD) {
        currentDiagramId = foundD.id;
      }
    }

    if (subMode) {
      const str = String(subMode).toLowerCase().trim();
      if (str === "overview" || str === "sheet") {
        viewMode = str;
      } else {
        const normH = str.replace("mh", "").replace("m", "");
        if (ALL_HEIGHTS.indexOf(normH) !== -1) {
          viewMode = "sheet";
          currentHeight = normH;
        }
      }
    }

    if (hVal) {
      const str = String(hVal).toLowerCase().trim();
      if (str === "overview" || str === "sheet") {
        viewMode = str;
      } else {
        const normH = str.replace("mh", "").replace("m", "");
        if (ALL_HEIGHTS.indexOf(normH) !== -1) {
          viewMode = "sheet";
          currentHeight = normH;
        }
      }
    }

    render();
    if (updateUrl) {
      updateUrlHash(true);
    }
    return true;
  }

  global.SteelAccessories = {
    init: init,
    render: render,
    switchView: switchView,
    updateUrlHash: updateUrlHash,
    renameDiagramPrompt: renameDiagramPrompt,
    copyDiagramPrompt: copyDiagramPrompt,
    deleteDiagramPrompt: deleteDiagramPrompt,
    getCurrentDiagramId: function () { return currentDiagramId; },
    getViewMode: function () { return viewMode; },
    getCurrentHeight: function () { return currentHeight; },
    getLayout: function () { return layout; },
    getOverrides: function () { return overrides; },
  };
})(typeof window !== "undefined" ? window : globalThis);
