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
// =============================================================================
(function (global) {
  "use strict";

  const LAYOUT_URL = "steel_accessories_layout.json";
  const STORAGE_KEY = "water_tank_steel_accessories_layout_v1";
  const FIRESTORE_DOC = "steelAccessoriesLayout";

  const ALL_HEIGHTS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
  const DEFAULT_COLOR = "#64748b";

  let layout = null;          // shipped default (from LAYOUT_URL)
  let overrides = {};         // "diagramId::memberId" -> partial member  |  "__added__" -> [members]
  let dbRef = null;
  let currentDiagramId = null;
  let viewMode = "all";       // "all" = every height side by side, "current" = configured height only
  let selectedMemberId = null;
  let editMode = false;
  let loadError = null;

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

  function getDiagram(id) {
    if (!layout) return null;
    return (layout.diagrams || []).find(function (d) { return d.id === id; }) || null;
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

  // Live per-row {value, partNo, formula} for the CURRENT tank config, keyed by
  // row id. Uses the same engine call as reinforcing_audit.js / the BOM.
  function rowDetailMap(cfg, diagram) {
    const map = {};
    if (typeof PanelEngine === "undefined" || typeof AccessoriesEngine === "undefined") return map;
    try {
      const g = PanelEngine.makeGeometry(cfg.w, cfg.l1, cfg.h, cfg.l2, cfg.l3, cfg.l4);
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

    let s = '<svg class="sa-panel-svg" viewBox="0 0 ' + svgW + ' ' + svgH + '" width="' + svgW + '" height="' + svgH + '" xmlns="http://www.w3.org/2000/svg">';

    // Panel outline + 1m grid (columns and course seams), like the Excel sheet
    s += '<rect x="' + X(0) + '" y="' + Y(H) + '" width="' + w + '" height="' + h + '" fill="#ffffff" stroke="#111827" stroke-width="1"/>';
    for (let c = 1; c < cols; c++) {
      s += '<line x1="' + X(c) + '" y1="' + Y(0) + '" x2="' + X(c) + '" y2="' + Y(H) + '" stroke="#111827" stroke-width="0.7"/>';
    }
    for (let y = 1; y < H; y += 1) {
      s += '<line x1="' + X(0) + '" y1="' + Y(y) + '" x2="' + X(cols) + '" y2="' + Y(y) + '" stroke="#111827" stroke-width="0.7"/>';
    }

    const members = o.members || [];
    const detailMap = o.detailMap || {};
    const bracketSeen = {};   // "x,y" -> how many bracket icons already drawn there

    members.forEach(function (m) {
      if (!memberAppearsAt(m, hStr)) return;
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
        const xs = Array.isArray(g.xs) ? g.xs : [coord(g.x, scope, cols / 2)];
        const yFrom = coord(g.yFrom, scope, 1);
        const yStep = coord(g.yStep, scope, 1) || 1;
        const yTo = coord(g.yTo, scope, H - 1);
        for (let y = yFrom; y <= yTo + 0.001; y += yStep) {
          xs.forEach(function (xRaw) {
            const x = coord(xRaw, scope, 0);
            const key = x + "," + y;
            const idx = bracketSeen[key] || 0;
            bracketSeen[key] = idx + 1;
            const cx = X(x) + (idx % 2 === 0 ? -1 : 1) * (5 + Math.floor(idx / 2) * 9);
            const cy = Y(y) - Math.floor(idx / 2) * 2;
            s += '<rect x="' + (cx - 4) + '" y="' + (cy - 4) + '" width="8" height="8" rx="1.5" fill="#ffffff" stroke="' + color +
              '" stroke-width="' + (selected ? 2.5 : 1.4) + '"' + attrs + '><title>' + tip + '</title></rect>';
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

  // Legend for one height: the distinct parts drawn there, in the sheet's style
  function buildLegend(diagram, hStr, members, detailMap) {
    const seen = {};
    const items = [];
    members.forEach(function (m) {
      if (!memberAppearsAt(m, hStr)) return;
      const detail = m.rowId ? detailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail) || m.aliasLabel || m.memberId;
      if (seen[partNo]) return;
      seen[partNo] = true;
      items.push({ partNo: partNo, color: memberColor(m, partNo), memberId: m.memberId, rowId: m.rowId });
    });
    if (!items.length) return '<div class="sa-legend-empty">-</div>';
    return '<div class="sa-legend">' + items.map(function (it) {
      const p = lookupPart(it.partNo);
      const title = esc(it.partNo + (p ? " — " + (p.nameKo || p.nameEn || "") : " (DB 미등록)"));
      return '<div class="sa-legend-row" data-member-id="' + esc(it.memberId) + '" title="' + title + '">' +
        '<span class="sa-legend-swatch" style="background:' + it.color + '"></span>' +
        '<span class="sa-legend-label' + (p ? "" : " sa-missing") + '">' + esc(it.partNo) + '</span>' +
        '</div>';
    }).join("") + "</div>";
  }

  // ---------------------------------------------------------------------------
  // Audit: does the drawing agree with the formulas?
  // ---------------------------------------------------------------------------
  function buildAudit(diagram, members, detailMap, cfg) {
    const rows = ruleRowsFor(diagram);
    const ruleIds = {};
    rows.forEach(function (r) { ruleIds[r.id] = true; });
    const hStr = String(cfg.h);
    const findings = [];

    const drawnRowIds = {};
    members.forEach(function (m) {
      const detail = m.rowId ? detailMap[m.rowId] : null;
      const partNo = memberPartNo(m, detail);
      const here = memberAppearsAt(m, hStr);
      if (here && m.rowId) drawnRowIds[m.rowId] = true;

      if (!partNo) {
        findings.push({ lv: "err", member: m.memberId, msg: "품번이 지정되지 않았고 수식 행에서도 해석되지 않음" });
      } else if (!lookupPart(partNo)) {
        findings.push({ lv: "err", member: m.memberId, msg: "품번 <b>" + esc(partNo) + "</b> 이(가) PART MASTER DB에 없음" });
      }
      if (!m.rowId) {
        findings.push({ lv: "err", member: m.memberId, msg: "수식 행(rowId) 미연결 — 도면에는 있으나 산출 수식이 없음" });
      } else if (!ruleIds[m.rowId]) {
        findings.push({ lv: "err", member: m.memberId, msg: "rowId <b>" + esc(m.rowId) + "</b> 이(가) " + esc(diagram.ruleSet) + " 수식 목록에 없음" });
      } else if (here) {
        const d = detailMap[m.rowId];
        const rule = findRule(diagram, m.rowId);
        if (rule && String(rule.formula).trim() === "0") {
          // A row that ships as literal "0" is a placeholder: the drawing
          // shows the part but the original workbook never defined how many.
          // Call that out as its own case rather than as a generic zero-qty
          // mismatch, and only once per member.
          findings.push({ lv: "warn", member: m.memberId, msg: "산출 수식이 아직 정의되지 않음 (<b>" + esc(m.rowId) + "</b> = 0). 부재를 클릭해 수식을 입력하면 BOM에 반영됩니다." });
        } else if (d && !(d.value > 0)) {
          findings.push({ lv: "warn", member: m.memberId, msg: "현재 설정(" + hStr + "mH)에서 도면에는 그려지나 수식 수량이 0" });
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
    const scope = Array.isArray(diagram.rowScope) ? diagram.rowScope : null;
    rows.forEach(function (r) {
      if (scope && scope.indexOf(r.id) === -1) return;
      const d = detailMap[r.id];
      if (d && d.value > 0 && !drawnRowIds[r.id]) {
        findings.push({ lv: "warn", member: null, msg: "<b>" + esc(r.id) + "</b> (" + esc(d.partNo || "-") + ") 수량 " + d.value + " 이나 " + hStr + "mH 도면에 해당 부재가 없음" });
      }
    });

    const errs = findings.filter(function (f) { return f.lv === "err"; }).length;
    const warns = findings.length - errs;
    let html = '<div class="sa-audit">';
    html += '<div class="sa-audit-head">🔍 도면 ↔ 수식 검증 <span class="sa-badge sa-badge-err">오류 ' + errs + '</span>' +
      '<span class="sa-badge sa-badge-warn">경고 ' + warns + '</span>' +
      '<span class="sa-audit-note">현재 설정 ' + esc(hStr) + 'mH 기준</span></div>';
    if (!findings.length) {
      html += '<div class="sa-audit-ok">도면과 수식이 모두 일치합니다.</div>';
    } else {
      html += '<ul class="sa-audit-list">' + findings.map(function (f) {
        return '<li class="sa-audit-' + f.lv + '"' + (f.member ? ' data-member-id="' + esc(f.member) + '"' : "") + '>' +
          (f.member ? '<code>' + esc(f.member) + '</code> ' : "") + f.msg + "</li>";
      }).join("") + "</ul>";
    }
    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // Info panel for the selected member
  // ---------------------------------------------------------------------------
  function buildInfoPanel(diagram, members, detailMap, cfg) {
    if (!selectedMemberId) {
      return '<div class="sa-info sa-info-empty"><i class="fa-solid fa-hand-pointer"></i><div>도면의 부재를 클릭하면<br>DB 정보와 산출 수식을 편집할 수 있습니다.</div></div>';
    }
    const m = members.find(function (x) { return x.memberId === selectedMemberId; });
    if (!m) return '<div class="sa-info sa-info-empty">선택된 부재를 찾을 수 없습니다.</div>';

    const detail = m.rowId ? detailMap[m.rowId] : null;
    const partNo = memberPartNo(m, detail);
    const p = lookupPart(partNo);
    const rule = findRule(diagram, m.rowId);

    let html = '<div class="sa-info">';
    html += '<div class="sa-info-title"><span class="sa-legend-swatch" style="background:' + memberColor(m, partNo) + '"></span>' +
      esc(partNo || "(품번 미지정)") + "</div>";
    if (m.aliasLabel && m.aliasLabel !== partNo) {
      html += '<div class="sa-info-alias">도면 원본 표기: <code>' + esc(m.aliasLabel) + "</code></div>";
    }
    if (m.note) html += '<div class="sa-info-note">' + esc(m.note) + "</div>";

    // --- PART MASTER DB ---
    html += '<div class="sa-info-sec">PART MASTER DB</div>';
    if (p) {
      html += '<table class="sa-info-table">' +
        row2("품명(KO)", p.nameKo) + row2("품명(EN)", p.nameEn) + row2("규격", p.spec) +
        row2("중량", (p.weight || 0) + " kg") + row2("단가", (p.price || 0).toLocaleString()) +
        row2("단위", p.unit) + row2("분류", p.category) + "</table>";
    } else {
      html += '<div class="sa-err-box">품번 <b>' + esc(partNo || "-") + "</b> 이(가) PART MASTER DB에 없습니다.</div>";
    }
    html += '<button class="sa-btn sa-btn-ghost" data-action="goto-partdb" data-part="' + esc(partNo || "") + '">' +
      '<i class="fa-solid fa-database"></i> PART MASTER DB에서 보기</button>';

    // --- Formula ---
    html += '<div class="sa-info-sec">산출 수식 (' + esc(diagram.auditCategory) + ")</div>";
    if (!m.rowId) {
      html += '<div class="sa-err-box">이 부재는 산출 수식(rowId)에 연결되어 있지 않습니다. 도면 편집에서 rowId를 지정하세요.</div>';
    } else if (!rule) {
      html += '<div class="sa-err-box">rowId <b>' + esc(m.rowId) + "</b> 을(를) 수식 목록에서 찾을 수 없습니다.</div>";
    } else {
      const qty = detail ? detail.value : "-";
      html += '<div class="sa-row-meta"><code>' + esc(m.rowId) + '</code>' +
        '<span class="sa-qty">현재 설정 수량 <b>' + esc(qty) + "</b></span></div>";
      if (String(rule.formula).trim() === "0") {
        html += '<div class="sa-info-note">이 부재는 원본 워크북에 수량식이 없어 <b>0</b>으로 신규 등록된 행입니다. ' +
          "수식이 0인 동안에는 BOM에 전혀 반영되지 않습니다 — 아래에 실제 수량식을 입력하고 저장하세요.</div>";
      }
      html += '<textarea class="sa-formula" id="saFormulaInput" spellcheck="false">' + esc(rule.formula) + "</textarea>";
      html += '<div class="sa-btn-row">' +
        '<button class="sa-btn sa-btn-primary" data-action="save-formula" data-row="' + esc(m.rowId) + '" data-cat="' + esc(diagram.auditCategory) + '"><i class="fa-solid fa-floppy-disk"></i> 수식 저장</button>' +
        '<button class="sa-btn sa-btn-ghost" data-action="reset-formula" data-row="' + esc(m.rowId) + '" data-cat="' + esc(diagram.auditCategory) + '"><i class="fa-solid fa-arrow-rotate-left"></i> 기본값</button>' +
        '<button class="sa-btn sa-btn-ghost" data-action="goto-reinf"><i class="fa-solid fa-cubes"></i> 검산표로 이동</button>' +
        "</div>";
      html += '<div class="sa-formula-msg" id="saFormulaMsg"></div>';
      html += '<div class="sa-var-help">사용 가능 변수: W_C W_F L_C L_F L1_C..L4_F H_O H_C H_F N_PA L2_O S_1M · 중간값: totLC totLF perim perim3</div>';
    }

    // --- Drawing binding (edit mode) ---
    if (editMode) {
      html += '<div class="sa-info-sec">도면 연결 편집</div>';
      html += '<table class="sa-info-table">';
      html += '<tr><td>rowId</td><td>' + rowIdSelect(diagram, m) + "</td></tr>";
      html += '<tr><td>품번</td><td><input class="sa-inp" id="saMemberPartNo" list="saPartList" value="' + esc(m.partNo || "") + '" placeholder="(비우면 rowId에서 자동)"></td></tr>';
      html += '<tr><td>색상</td><td><input class="sa-inp" id="saMemberColor" type="text" value="' + esc(m.color || memberColor(m, partNo)) + '"></td></tr>';
      html += '<tr><td>표시 높이</td><td><input class="sa-inp" id="saMemberHeights" value="' + esc((m.heights || ALL_HEIGHTS).join(",")) + '"></td></tr>';
      html += '<tr><td>좌표(geom)</td><td><textarea class="sa-inp sa-geom" id="saMemberGeom" spellcheck="false">' + esc(JSON.stringify(m.geom || {})) + "</textarea></td></tr>";
      html += "</table>";
      html += '<div class="sa-btn-row">' +
        '<button class="sa-btn sa-btn-primary" data-action="save-member"><i class="fa-solid fa-floppy-disk"></i> 도면 저장</button>' +
        '<button class="sa-btn sa-btn-ghost" data-action="reset-member"><i class="fa-solid fa-arrow-rotate-left"></i> 기본 도면</button>' +
        '<button class="sa-btn sa-btn-danger" data-action="delete-member"><i class="fa-solid fa-trash"></i> 부재 삭제</button>' +
        "</div>";
      html += '<div class="sa-formula-msg" id="saMemberMsg"></div>';
    }

    html += "</div>";
    return html;

    function row2(k, v) {
      return "<tr><td>" + esc(k) + "</td><td>" + esc(v == null || v === "" ? "-" : v) + "</td></tr>";
    }
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
    const members = effectiveMembers(diagram);
    const detailMap = rowDetailMap(cfg, diagram);

    let html = styleBlock();

    // Intro
    html += '<div class="sa-intro"><i class="fa-solid fa-circle-info"></i> ' +
      '높이 등급별 철자재 배치 <b>기준 도면</b>입니다. 도면의 각 부재는 <b>PART MASTER DB 품번</b>과 ' +
      '<b>산출 수식(rowId)</b>에 연결되어 있어, 부재를 클릭하면 실제 부품 정보와 수식을 바로 확인·수정할 수 있습니다. ' +
      '도면은 원본 엑셀과 동일한 표준 배치 기준(3칸)이며, <b>수량은 항상 현재 BOM INPUT 설정으로 계산</b>됩니다.</div>';

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
      '<button class="sa-segbtn' + (viewMode === "all" ? " active" : "") + '" data-view="all">전체 높이</button>' +
      '<button class="sa-segbtn' + (viewMode === "current" ? " active" : "") + '" data-view="current">현재 높이 (' + esc(cfg.h) + 'mH)</button>' +
      "</div>" +
      '<div class="sa-tool-right">' +
      '<label class="sa-check"><input type="checkbox" id="saEditMode"' + (editMode ? " checked" : "") + '> 도면 편집</label>' +
      '<button class="sa-btn sa-btn-ghost" data-action="add-member"><i class="fa-solid fa-plus"></i> 부재 추가</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="export-json"><i class="fa-solid fa-download"></i> JSON 내보내기</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="import-json"><i class="fa-solid fa-upload"></i> JSON 가져오기</button>' +
      '<button class="sa-btn sa-btn-ghost" data-action="reset-all"><i class="fa-solid fa-arrow-rotate-left"></i> 전체 기본값</button>' +
      "</div></div>";

    // Drawings + info panel
    html += '<div class="sa-main">';
    html += '<div class="sa-canvas">';
    const heights = viewMode === "current"
      ? [String(cfg.h)].filter(function (h) { return (diagram.heights || ALL_HEIGHTS).indexOf(h) !== -1; })
      : (diagram.heights || ALL_HEIGHTS);
    if (!heights.length) {
      html += '<div class="sa-err-box">현재 설정 높이 ' + esc(cfg.h) + 'mH 는 이 도면(' + esc(diagram.title) + ')에 정의되어 있지 않습니다.</div>';
    }
    const px = viewMode === "current" ? 96 : 40;
    // All panels sit on one baseline, as on the original sheet: reserve the
    // tallest panel's height in every cell and bottom-align inside it.
    const maxH = heights.reduce(function (a, h) { return Math.max(a, parseFloat(h)); }, 0);
    const wrapH = maxH * px + 36;
    heights.forEach(function (hStr) {
      html += '<div class="sa-height-block">' +
        '<div class="sa-svg-wrap" style="height:' + wrapH + 'px">' +
        buildPanelSvg(diagram, hStr, { members: members, detailMap: detailMap, pxPerM: px }) +
        "</div>" +
        buildLegend(diagram, hStr, members, detailMap) +
        "</div>";
    });
    html += "</div>";
    html += '<div class="sa-side" id="saSidePanel">' + buildInfoPanel(diagram, members, detailMap, cfg) + "</div>";
    html += "</div>";

    // Audit
    html += buildAudit(diagram, members, detailMap, cfg);

    // datalist for the part-number input in edit mode
    html += '<datalist id="saPartList">';
    (allParts() || []).forEach(function (p) {
      html += '<option value="' + esc(p.partNo) + '">' + esc(p.nameKo || p.nameEn || "") + "</option>";
    });
    html += "</datalist>";
    html += '<input type="file" id="saImportFile" accept="application/json" style="display:none">';

    host.innerHTML = html;
    wireEvents(host, diagram, members, detailMap, cfg);
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
  function wireEvents(host, diagram, members, detailMap, cfg) {
    host.querySelectorAll(".sa-dtab").forEach(function (b) {
      b.addEventListener("click", function () {
        currentDiagramId = b.getAttribute("data-diagram");
        selectedMemberId = null;
        render();
      });
    });
    host.querySelectorAll(".sa-segbtn").forEach(function (b) {
      b.addEventListener("click", function () { viewMode = b.getAttribute("data-view"); render(); });
    });
    const editChk = host.querySelector("#saEditMode");
    if (editChk) editChk.addEventListener("change", function () { editMode = editChk.checked; render(); });

    // Select a member from the drawing, the legend, or an audit finding
    host.addEventListener("click", function (ev) {
      const el = ev.target.closest ? ev.target.closest("[data-member-id]") : null;
      if (!el) return;
      selectedMemberId = el.getAttribute("data-member-id");
      const side = document.getElementById("saSidePanel");
      if (side) side.innerHTML = buildInfoPanel(diagram, members, detailMap, cfg);
      // re-render drawings so the selection highlight updates
      render();
    });

    host.addEventListener("click", function (ev) {
      const btn = ev.target.closest ? ev.target.closest("[data-action]") : null;
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "save-formula") {
        const ta = document.getElementById("saFormulaInput");
        const msg = document.getElementById("saFormulaMsg");
        if (!ta || !global.RuleEditorUI) return;
        const res = global.RuleEditorUI.setFieldFormula(btn.getAttribute("data-cat"), 1, btn.getAttribute("data-row"), ta.value.trim());
        if (!res || !res.ok) {
          if (msg) { msg.className = "sa-formula-msg sa-msg-err"; msg.textContent = "저장 실패: " + ((res && res.error) || "알 수 없는 오류"); }
          return;
        }
        if (msg) { msg.className = "sa-formula-msg sa-msg-ok"; msg.textContent = "저장되었습니다. BOM을 다시 생성하면 반영됩니다."; }
        refreshDependentViews();
        render();
      } else if (action === "reset-formula") {
        if (!global.RuleEditorUI) return;
        const res = global.RuleEditorUI.resetFieldFormula(btn.getAttribute("data-cat"), 1, btn.getAttribute("data-row"));
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
        saveMemberEdits(diagram);
      } else if (action === "reset-member") {
        if (!selectedMemberId) return;
        delete overrides[diagram.id + "::" + selectedMemberId];
        persistOverrides();
        render();
      } else if (action === "delete-member") {
        if (!selectedMemberId) return;
        if (!confirm("이 부재를 도면에서 삭제할까요?\n(수식/부품 데이터는 삭제되지 않고, 도면 표시만 제거됩니다.)")) return;
        const addedKey = "__added__::" + diagram.id;
        if (Array.isArray(overrides[addedKey])) {
          overrides[addedKey] = overrides[addedKey].filter(function (m) { return m.memberId !== selectedMemberId; });
        }
        patchMember(diagram.id, selectedMemberId, { __deleted__: true });
        selectedMemberId = null;
        render();
      } else if (action === "add-member") {
        addMember(diagram);
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

    const fileInput = host.querySelector("#saImportFile");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const parsed = JSON.parse(String(reader.result));
            if (!parsed || !Array.isArray(parsed.diagrams)) throw new Error("diagrams 배열이 없습니다.");
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
      });
    }
  }

  function saveMemberEdits(diagram) {
    if (!selectedMemberId) return;
    const msg = document.getElementById("saMemberMsg");
    const rowSel = document.getElementById("saMemberRowId");
    const partInp = document.getElementById("saMemberPartNo");
    const colorInp = document.getElementById("saMemberColor");
    const heightsInp = document.getElementById("saMemberHeights");
    const geomInp = document.getElementById("saMemberGeom");
    let geom;
    try {
      geom = JSON.parse(geomInp.value);
    } catch (e) {
      if (msg) { msg.className = "sa-formula-msg sa-msg-err"; msg.textContent = "좌표(geom) JSON 오류: " + e.message; }
      return;
    }
    patchMember(diagram.id, selectedMemberId, {
      rowId: rowSel && rowSel.value ? rowSel.value : null,
      partNo: partInp && partInp.value.trim() ? partInp.value.trim() : null,
      color: colorInp && colorInp.value.trim() ? colorInp.value.trim() : null,
      heights: heightsInp ? heightsInp.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : undefined,
      geom: geom,
    });
    render();
  }

  function addMember(diagram) {
    const id = "custom_" + Date.now();
    const key = "__added__::" + diagram.id;
    if (!Array.isArray(overrides[key])) overrides[key] = [];
    overrides[key].push({
      memberId: id, rowId: null, partNo: null, aliasLabel: "새 부재", color: "#000000",
      heights: (diagram.heights || ALL_HEIGHTS).slice(),
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
    merged.diagrams = (merged.diagrams || []).map(function (d) {
      const copy = Object.assign({}, d);
      copy.members = effectiveMembers(d).map(function (m) {
        const c = Object.assign({}, m);
        delete c.isAdded;
        delete c.__deleted__;
        return c;
      });
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
      '.sa-canvas{flex:1 1 620px;min-width:320px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;overflow-x:auto;}' +
      '.sa-height-block{display:flex;flex-direction:column;align-items:center;gap:6px;}' +
      '.sa-svg-wrap{display:flex;align-items:flex-end;justify-content:center;}' +
      '.sa-panel-svg{display:block;}' +
      '.sa-legend{display:flex;flex-direction:column;gap:2px;min-width:96px;}' +
      '.sa-legend-row{display:flex;align-items:center;gap:5px;font-size:9.5px;cursor:pointer;}' +
      '.sa-legend-row:hover{background:#f1f5f9;}' +
      '.sa-legend-swatch{display:inline-block;width:16px;height:4px;border-radius:1px;}' +
      '.sa-legend-label{font-family:monospace;color:#0f172a;}' +
      '.sa-legend-label.sa-missing{color:#dc2626;text-decoration:underline dotted;}' +
      '.sa-legend-empty{font-size:10px;color:#94a3b8;}' +
      '.sa-side{flex:1 1 320px;min-width:300px;max-width:460px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px;}' +
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
