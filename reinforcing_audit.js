/**
 * Reinforcing / Tie-Rod / Sealing Tape Logic Setting & Calculation Audit Sheet
 * Water Tank BOM System
 *
 * Mirrors bolt_logic_audit.js's pattern (same live formula-audit/setting
 * idea, same custom-row support, same RuleEditorUI-backed inline formula
 * editing) but for the steel reinforcing / tie-rod / sealing-tape parts
 * instead of bolts. Kept as its own self-contained IIFE (not sharing code
 * with bolt_logic_audit.js) since the underlying rule shapes genuinely
 * differ -- see accessories_rules.js's `reinforcing`/`tieRod` rulesets.
 */

(function () {
  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function reinfRules(isIntReinf) {
    return (typeof AccessoriesRules !== 'undefined' && AccessoriesRules.reinforcing)
      ? (isIntReinf ? AccessoriesRules.reinforcing.internal : AccessoriesRules.reinforcing.external)
      : null;
  }

  function tieRodRules() {
    return (typeof AccessoriesRules !== 'undefined') ? AccessoriesRules.tieRod : null;
  }

  function getIsIntReinf() {
    const el = document.getElementById('reinfMethod');
    return el ? el.value !== 'External' : true;
  }

  function getMaterialOption() {
    const el = document.getElementById('boltMaterial');
    return el ? (parseInt(el.value, 10) || 2) : 2;
  }

  function getSidePanelOnly() {
    const el = document.getElementById('sidePanelOnly');
    return el ? el.value === '1x1' : false;
  }

  function getPartitionPanelOnly() {
    const el = document.getElementById('partitionPanelOnly');
    return el ? el.value === '1x1' : false;
  }

  // Turn a reinforcing.*.partNumbers[rowId] spec (see accessories_rules.js)
  // into a human-readable label -- same logic as rule_editor.js's private
  // describePartSpec(), duplicated here since that function isn't exposed
  // on window (only RuleEditorUI.getFieldInfo/setFieldFormula/
  // resetFieldFormula are).
  function describePartSpec(spec) {
    if (typeof spec === 'string') return spec;
    if (!spec) return null;
    if (spec.materialPrefix) {
      return spec.materialPrefix + 'SA2 / ' + spec.materialPrefix + 'SA4 (볼트&너트 사양에 따라 자동 선택)';
    }
    if (spec.byHeight) {
      return spec.byHeight.map((r) => r.part + (r.maxH !== undefined ? ' (H≤' + r.maxH + 'm)' : ' (그 외 높이)')).join(' / ');
    }
    if (spec.byHeightMaterialLR) {
      return spec.byHeightMaterialLR.map((r) => r.base + '+SA2/4' + (r.lr ? '(L/R)' : '')).join(' / ') + ' -- 높이(H)별 자동 선택';
    }
    return null;
  }

  // Section grouping -- verbatim from the reference Excel's EXT_REINF /
  // INT_REINF_INT sheets (column-L category headers), NOT invented. See the
  // "[TANK OUTSIDE]"/"[TANK INSIDE]" band + named sub-group scheme.
  const EXTERNAL_SECTIONS = {
    row8: '[TANK OUTSIDE] External Reinforcing Parts (HDG)', row9: '[TANK OUTSIDE] External Reinforcing Parts (HDG)',
    row10: '[TANK OUTSIDE] External Reinforcing Parts (HDG)', row11: '[TANK OUTSIDE] External Reinforcing Parts (HDG)',
    row12: '[TANK OUTSIDE] External Reinforcing Parts (HDG)', row13: '[TANK OUTSIDE] External Reinforcing Parts (HDG)',
    row14: '[TANK OUTSIDE] External Reinforcing Parts (HDG)',
    row16: '[TANK OUTSIDE] Corner Angle', row17: '[TANK OUTSIDE] Corner Angle', row18: '[TANK OUTSIDE] Corner Angle',
    row23: '[TANK OUTSIDE] HDG External Frame For Outside', row24: '[TANK OUTSIDE] HDG External Frame For Outside',
    row25: '[TANK OUTSIDE] HDG External Frame For Outside', row26: '[TANK OUTSIDE] HDG External Frame For Outside',
    row27: '[TANK OUTSIDE] HDG External Frame For Outside', row28: '[TANK OUTSIDE] HDG External Frame For Outside',
    row41: '[TANK OUTSIDE] HDG RHS/U Bracket (External Frame Fixing Bracket)',
    row45: '[TANK OUTSIDE] HDG External Frame Lower Fixing Bracket',
    row46: '[TANK OUTSIDE] HDG RHS Bracket for Partition',
    row54: '[TANK OUTSIDE] Corner Bracket', row56: '[TANK OUTSIDE] Corner Bracket',
    row76: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)', row77: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row78: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)', row79: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row80: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row86: '[TANK INSIDE] Internal Bracket (Stainless Steel)', row87: '[TANK INSIDE] Internal Bracket (Stainless Steel)',
    row88: '[TANK INSIDE] Internal Bracket (Stainless Steel)', row89: '[TANK INSIDE] Internal Bracket (Stainless Steel)',
    row90: '[TANK INSIDE] Internal Bracket (Stainless Steel)',
    row93: '[TANK INSIDE] Partition Accessories',
  };
  const INTERNAL_SECTIONS = {
    row8_W8: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)', row8_T8: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row9: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)', row10: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row11: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)', row12: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row13: '[TANK INSIDE] Internal Reinforcing (Stainless Steel)',
    row18: '[TANK INSIDE] Internal Bracket (Stainless Steel)', row19: '[TANK INSIDE] Internal Bracket (Stainless Steel)',
    row20: '[TANK INSIDE] Internal Bracket (Stainless Steel)', row21: '[TANK INSIDE] Internal Bracket (Stainless Steel)',
    row22: '[TANK INSIDE] Internal Bracket (Stainless Steel)',
    row25: '[TANK INSIDE] Partition Accessories',
    row38: '[TANK OUTSIDE] External Reinforcing', row39: '[TANK OUTSIDE] External Reinforcing',
    row40: '[TANK OUTSIDE] External Reinforcing', row41: '[TANK OUTSIDE] External Reinforcing',
    row42: '[TANK OUTSIDE] External Reinforcing', row43: '[TANK OUTSIDE] External Reinforcing',
    row45: '[TANK OUTSIDE] External Reinforcing', row47: '[TANK OUTSIDE] External Reinforcing',
    row48: '[TANK OUTSIDE] External Reinforcing', row49: '[TANK OUTSIDE] External Reinforcing',
    row50: '[TANK OUTSIDE] External Reinforcing', row51: '[TANK OUTSIDE] External Reinforcing',
    row52: '[TANK OUTSIDE] External Reinforcing', row53: '[TANK OUTSIDE] External Reinforcing',
    row55: '[TANK OUTSIDE] External Reinforcing',
  };
  const TIE_ROD_SECTION = 'Tie-Rods (External Only)';
  const TIE_ROD_INTERNAL_SECTION = 'Tie-Rods (Internal)';
  const TIE_ROD_LABELS = {
    rodsW: '폭(W) 방향 타이로드 로드(Rod) 필요 수량 소계',
    rodsL1: '길이(L1) 방향 타이로드 로드(Rod) 필요 수량 소계',
    rodsL2: '길이(L2) 방향 타이로드 로드(Rod) 필요 수량 소계',
    rodsL3: '길이(L3) 방향 타이로드 로드(Rod) 필요 수량 소계',
    rodsL4: '길이(L4) 방향 타이로드 로드(Rod) 필요 수량 소계',
    row35: '부속품 1. 앵커 브라켓 (Tie-Rod Anchor Bracket) 수량',
    row36: '부속품 2. 앵커 육각 볼트 & 와셔 (Anchor Bolt & Washer) 수량',
    row37: '부속품 3. 일자 연결 커플러 (Straight Rod Coupler) 수량',
    row38: '부속품 4. 십자/T자 연결 커플러 (Cross Rod Coupler) 수량',
  };

  let customReinforcingRows = [];
  let deletedReinforcingRowIds = new Set();

  const CUSTOM_SEALTAPE_STORAGE_KEY = 'YSACC_CUSTOM_SEALING_TAPE_V1';
  let customSealingTapeUnitLengths = {};
  let customSealingTapeCounts = {};
  let customSealingTapeUserRows = [];

  function loadSavedReinforcingSettings() {
    try {
      const saved = localStorage.getItem('water_tank_custom_reinforcing_rows');
      customReinforcingRows = saved ? JSON.parse(saved) : [];
    } catch (e) {
      customReinforcingRows = [];
    }
    try {
      const savedDeleted = localStorage.getItem('water_tank_deleted_reinforcing_rows');
      deletedReinforcingRowIds = savedDeleted ? new Set(JSON.parse(savedDeleted)) : new Set();
    } catch (e) {
      deletedReinforcingRowIds = new Set();
    }
    try {
      const savedSealTape = localStorage.getItem(CUSTOM_SEALTAPE_STORAGE_KEY);
      if (savedSealTape) {
        const parsed = JSON.parse(savedSealTape);
        customSealingTapeUnitLengths = parsed.unitLengths || {};
        customSealingTapeCounts = parsed.counts || {};
        customSealingTapeUserRows = parsed.userRows || [];
      }
    } catch (e) {
      customSealingTapeUnitLengths = {};
      customSealingTapeCounts = {};
      customSealingTapeUserRows = [];
    }
  }

  function saveReinforcingSettings() {
    localStorage.setItem('water_tank_custom_reinforcing_rows', JSON.stringify(customReinforcingRows));
    localStorage.setItem('water_tank_deleted_reinforcing_rows', JSON.stringify(Array.from(deletedReinforcingRowIds)));
    localStorage.setItem(CUSTOM_SEALTAPE_STORAGE_KEY, JSON.stringify({
      unitLengths: customSealingTapeUnitLengths,
      counts: customSealingTapeCounts,
      userRows: customSealingTapeUserRows
    }));
    renderReinforcingAuditView();
  }

  window.getCustomSealingTapeOverrides = function() {
    return customSealingTapeUnitLengths;
  };

  window.updateSealingTapeUnit = function(rowId, val) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    if (rowId.startsWith('sealtape_')) {
      const catalogKey = rowId.replace('sealtape_', '');
      customSealingTapeUnitLengths[catalogKey] = num;
    } else {
      const userRow = customSealingTapeUserRows.find(r => r.rowId === rowId);
      if (userRow) userRow.unit = num;
    }
    saveReinforcingSettings();
    if (typeof updatePrintoutSheet === 'function') updatePrintoutSheet();
  };

  window.updateSealingTapeCount = function(rowId, val) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    if (rowId.startsWith('sealtape_')) {
      const catalogKey = rowId.replace('sealtape_', '');
      customSealingTapeCounts[catalogKey] = num;
    } else {
      const userRow = customSealingTapeUserRows.find(r => r.rowId === rowId);
      if (userRow) userRow.count = num;
    }
    saveReinforcingSettings();
    if (typeof updatePrintoutSheet === 'function') updatePrintoutSheet();
  };

  window.addCustomSealingTapeRow = function() {
    const defaultHint = "예: Side (TOP 2.0mH), Side (MID 1.0mH), Side (LOWER 1.0mH), Partition (MID 1.0mH), Roof Half, Custom Joint";
    const loc = prompt("부위 (Panel Role) 또는 높이별 판넬 항목명을 입력하세요:\n(" + defaultHint + ")", "Side (MID 1.0mH)");
    if (!loc) return;
    const unitStr = prompt("단위길이(m)를 입력하세요 (예: 1x1m는 4.1m, 2mH는 5.1m, 반판은 3.1m):", "4.1");
    if (!unitStr) return;
    const countStr = prompt("판넬 수 / 개수를 입력하세요:", "4");
    if (!countStr) return;

    const unit = parseFloat(unitStr) || 0;
    const count = parseFloat(countStr) || 0;

    const rowId = 'custom_sealtape_' + Date.now();
    customSealingTapeUserRows.push({
      rowId: rowId,
      section: '실링테이프 (Sealing Tape 3mm PVC)',
      item: 'PVC SEALANT 3mm (WST-P0050RO)',
      loc: loc,
      unit: unit,
      count: count,
      qty: Math.round(unit * count * 10) / 10,
      isCustom: true
    });

    saveReinforcingSettings();
    if (typeof updatePrintoutSheet === 'function') updatePrintoutSheet();
  };

  window.resetSealingTapeFormulas = function() {
    if (confirm("실링테이프 수식을 카탈로그 기본값으로 초기화하시겠습니까? (커스텀 수정 내역이 모두 삭제됩니다.)")) {
      customSealingTapeUnitLengths = {};
      customSealingTapeCounts = {};
      customSealingTapeUserRows = [];
      saveReinforcingSettings();
      if (typeof updatePrintoutSheet === 'function') updatePrintoutSheet();
    }
  };

  // Same custom-formula engine as bolt_logic_audit.js's evalCustomFormula:
  // returns {value, error} so a broken/typo'd formula shows up as a visible
  // red-bordered input with an error tooltip instead of silently showing 0.
  function evalCustomFormula(formulaStr, geom, apValues) {
    const trimmed = String(formulaStr || '').trim();
    if (!trimmed) return { value: 0, error: null };
    if (!isNaN(Number(trimmed))) return { value: Number(trimmed), error: null };

    const vars = {
      W_C: geom.W_C || 0, W_F: geom.W_F || 0,
      L_C: geom.L_C || 0, L_F: geom.L_F || 0,
      L1_C: geom.L1_C || 0, L1_F: geom.L1_F || 0,
      L2_C: geom.L2_C || 0, L2_F: geom.L2_F || 0,
      L3_C: geom.L3_C || 0, L3_F: geom.L3_F || 0,
      L4_C: geom.L4_C || 0, L4_F: geom.L4_F || 0,
      H_O: geom.H_O || 0, H_C: geom.H_C || 0, H_F: geom.H_F || 0,
      N_PA: geom.N_PA || 0, L2_O: geom.L2_O || 0, S_1M: geom.S_1M || 0,
    };
    const scope = Object.assign({}, vars, apValues);
    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, 'return (' + trimmed + ');');
      const res = fn(...values);
      if (typeof res === 'number' && !isNaN(res)) return { value: res, error: null };
      return { value: 0, error: '수식 결과가 숫자가 아닙니다.' };
    } catch (e) {
      return { value: 0, error: e.message };
    }
  }

  // Compute live per-row breakdown for the currently active reinforcing
  // method (External XOR Internal, matching how the real BOM only ever uses
  // one), including custom & deleted rows.
  function computeReinforcingAuditData(dim, isIntReinf, isSA4, sidePanelOnly) {
    if (typeof PanelEngine === 'undefined' || typeof AccessoriesEngine === 'undefined') return [];
    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      console.warn('[ReinforcingAudit] PanelEngine.makeGeometry failed:', e);
      return [];
    }

    const sectionMap = isIntReinf ? INTERNAL_SECTIONS : EXTERNAL_SECTIONS;
    const rules = reinfRules(isIntReinf);
    const category = isIntReinf ? 'reinf_int' : 'reinf_ext';
    const computedRowValues = {};

    let detail = [];
    try {
      detail = AccessoriesEngine.reinforcingRowDetail(g, isIntReinf, isSA4, sidePanelOnly);
    } catch (e) {
      console.warn('[ReinforcingAudit] reinforcingRowDetail failed:', e);
    }

    let rows = detail
      .filter((d) => !deletedReinforcingRowIds.has(d.id))
      .map((d) => {
        computedRowValues[d.id] = d.value;
        const spec = rules && rules.partNumbers && rules.partNumbers[d.id];
        return {
          rowId: d.id,
          category,
          section: sectionMap[d.id] || '[기타] Other',
          item: d.partNo || describePartSpec(spec) || '-',
          loc: d.id,
          qty: d.value,
          formula: d.formula || '',
          isCustom: false,
        };
      });

    const geomForCustom = {
      W_C: g.W.whole, W_F: g.W.half,
      L1_C: g.L1.whole, L1_F: g.L1.half, L2_C: g.L2.whole, L2_F: g.L2.half,
      L3_C: g.L3.whole, L3_F: g.L3.half, L4_C: g.L4.whole, L4_F: g.L4.half,
      L_C: g.L_C_sum, L_F: g.L_F_sum,
      H_O: g.H.value, H_C: g.H.whole, H_F: g.H.half,
      N_PA: g.n_partitions, L2_O: g.L2.value, S_1M: sidePanelOnly ? 1 : 0,
    };

    customReinforcingRows
      .filter((c) => c.category === category && !deletedReinforcingRowIds.has(c.rowId))
      .forEach((c) => {
        let calcQty = Number(c.qty) || 0;
        let formulaError = null;
        if (c.formula && String(c.formula).trim() !== '') {
          const evalResult = evalCustomFormula(c.formula, geomForCustom, computedRowValues);
          calcQty = evalResult.value;
          formulaError = evalResult.error;
        }
        const finalQty = Math.round(calcQty);
        computedRowValues[c.rowId] = finalQty;
        rows.push({
          rowId: c.rowId,
          category,
          section: c.section || '[커스텀] Custom',
          item: c.item || '-',
          loc: c.loc || 'Custom Reinforcing Item',
          qty: finalQty,
          formula: c.formula || String(finalQty),
          formulaError,
          isCustom: true,
        });
      });

    return rows;
  }

  // Live breakdown for the External Tie-Rod assembly's component subtotals
  // (rodsW/rodsL1-4 + accessory row35-38) plus the final WTR-12M300Z total.
  function computeTieRodAudit(dim) {
    if (typeof PanelEngine === 'undefined' || typeof AccessoriesEngine === 'undefined') return null;
    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      return null;
    }
    try {
      const { detail, total } = AccessoriesEngine.tieRodComponentDetail(g);
      const rows = detail
        .filter((d) => !deletedReinforcingRowIds.has('tierod_' + d.id))
        .map((d) => ({
          rowId: 'tierod_' + d.id,
          fieldId: d.id,
          section: TIE_ROD_SECTION,
          item: 'WTR-12M300Z (구성요소)',
          loc: TIE_ROD_LABELS[d.id] || d.id,
          qty: d.value,
          formula: d.formula,
          isCustom: false,
        }));
      return { rows, total };
    } catch (e) {
      console.warn('[ReinforcingAudit] tieRodComponentDetail failed:', e);
      return null;
    }
  }

  // Live per-part breakdown for the INTERNAL Tie-Rod system (real
  // TR-12M####/M12 NUT&BW/TC-12M60 SKUs, not a single rolled-up assembly --
  // see accessories_engine.js tieRodInternalParts() for full provenance).
  function computeTieRodInternalAudit(dim) {
    if (typeof PanelEngine === 'undefined' || typeof AccessoriesEngine === 'undefined') return null;
    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      return null;
    }
    try {
      const internalTieRodEl = document.getElementById('internalTieRod');
      const isSA4 = !internalTieRodEl || internalTieRodEl.value !== 'SS304';
      const { detail, warnings } = AccessoriesEngine.tieRodInternalParts(g, isSA4);
      const rows = detail
        .filter((d) => d.value > 0 && !deletedReinforcingRowIds.has('tierodInt_' + d.id))
        .map((d) => ({
          rowId: 'tierodInt_' + d.id,
          fieldId: d.id,
          section: TIE_ROD_INTERNAL_SECTION,
          item: d.partNo,
          loc: d.id,
          qty: d.value,
          formula: d.formula,
          isCustom: false,
        }));
      const total = rows.reduce((s, r) => s + r.qty, 0);
      return { rows, total, warnings: warnings || [] };
    } catch (e) {
      console.warn('[ReinforcingAudit] tieRodInternalParts failed:', e);
      return null;
    }
  }

  // Live per-role breakdown for 3mm PVC sealing tape -- drives off the SAME
  // shared PanelEngine.sealingTapeDetail() the real BOM uses (see app.js),
  // so this tab always matches what actually ships, not a parallel estimate.
  function computeSealingTapeAudit(dim) {
    if (typeof PanelEngine === 'undefined' || typeof PanelCatalog === 'undefined') return { rows: [], total: 0, note: null };
    const sidePanelOnly = getSidePanelOnly() ? '1x1' : 'DEFAULT';
    const partitionPanelOnly = getPartitionPanelOnly() ? '1x1' : 'DEFAULT';

    const detail = PanelEngine.sealingTapeDetail(
      { W: dim.width, L1: dim.l1, L2: dim.l2, L3: dim.l3, L4: dim.l4, H: dim.height },
      { sidePanelOnly, partitionPanelOnly }
    );

    const rows = detail.rows.filter((r) => !deletedReinforcingRowIds.has('sealtape_' + r.catalogKey)).map((r) => {
      const catalogKey = r.catalogKey;
      const unit = (customSealingTapeUnitLengths[catalogKey] !== undefined) ? customSealingTapeUnitLengths[catalogKey] : r.unit;
      const count = (customSealingTapeCounts[catalogKey] !== undefined) ? customSealingTapeCounts[catalogKey] : r.count;
      const subtotal = Math.round(unit * count * 10) / 10;
      return {
        rowId: 'sealtape_' + catalogKey,
        catalogKey: catalogKey,
        section: '실링테이프 (Sealing Tape 3mm PVC)',
        item: 'PVC SEALANT 3mm (WST-P0050RO)',
        loc: describeCatalogKey(catalogKey),
        unit: unit,
        count: count,
        qty: subtotal,
        formula: `${unit}m × ${count}개`,
        isCustom: false,
        isModified: (customSealingTapeUnitLengths[catalogKey] !== undefined || customSealingTapeCounts[catalogKey] !== undefined)
      };
    });

    // Add WST-P0120M (Corner Angle PVC Sealant 1M) for vertical corners (4 corners x Height H)
    const cornerMetersDefault = Math.ceil(dim.height * 4);
    if (cornerMetersDefault > 0 && !deletedReinforcingRowIds.has('sealtape_corner_angle')) {
      let unit = (customSealingTapeUnitLengths['corner_angle'] !== undefined && customSealingTapeUnitLengths['corner_angle'] > 0) 
        ? customSealingTapeUnitLengths['corner_angle'] : 1.0;
      let count = (customSealingTapeCounts['corner_angle'] !== undefined && customSealingTapeCounts['corner_angle'] > 0) 
        ? customSealingTapeCounts['corner_angle'] : cornerMetersDefault;
      const subtotal = Math.round(unit * count * 10) / 10;
      rows.push({
        rowId: 'sealtape_corner_angle',
        catalogKey: 'corner_angle',
        section: '실링테이프 (Sealing Tape 3mm PVC)',
        item: 'CORNER ANGLE PVC SEALANT 1M (WST-P0120M)',
        loc: '모서리 세로 조인트 (Corner Angle Vertical Joints)',
        unit: unit,
        count: count,
        qty: subtotal,
        formula: `${unit}m × ${count}개 (4모서리 × ${dim.height}mH)`,
        isCustom: false,
        isModified: (customSealingTapeUnitLengths['corner_angle'] !== undefined || customSealingTapeCounts['corner_angle'] !== undefined)
      });
    }

    // Add custom user-created sealing tape rows
    customSealingTapeUserRows.forEach((cr) => {
      if (!deletedReinforcingRowIds.has(cr.rowId)) {
        const subtotal = Math.round(cr.unit * cr.count * 10) / 10;
        rows.push({
          rowId: cr.rowId,
          section: '실링테이프 (Sealing Tape 3mm PVC)',
          item: 'PVC SEALANT 3mm (WST-P0050RO)',
          loc: cr.loc,
          unit: cr.unit,
          count: cr.count,
          qty: subtotal,
          formula: `${cr.unit}m × ${cr.count}개`,
          isCustom: true,
          isModified: true
        });
      }
    });

    const total = Math.round(rows.reduce((s, r) => s + r.qty, 0) * 10) / 10;
    const note = sidePanelOnly === '1x1'
      ? '⚠ "0.5/1M Side Panel only = 1x1M only" 모드의 실링테이프 값은 아직 지원되지 않아 일부 SIDE 부위가 누락될 수 있습니다.'
      : null;
    return { rows, total, note };
  }

  function describeCatalogKey(catalogKey) {
    if (typeof PanelCatalog === 'undefined') return catalogKey;
    const parts = String(catalogKey).split('.');
    if (parts[0] === 'roof_bottom') {
      return PanelCatalog.ROOF_BOTTOM_LABELS[parts[1]] || parts[1];
    }
    if (parts[0] === 'side' && parts.length === 3) {
      const roleLabel = PanelCatalog.SIDE_ROLE_LABELS[parts[2]] || parts[2];
      const courseLabel = PanelCatalog.COURSE_HEIGHT_LABEL[parts[1]] || parts[1];
      return roleLabel + (courseLabel ? ' (' + courseLabel + ')' : '');
    }
    if (parts[0] === 'partition' && parts.length === 3) {
      const roleLabel = PanelCatalog.PARTITION_ROLE_LABELS[parts[2]] || parts[2];
      const courseLabel = PanelCatalog.COURSE_HEIGHT_LABEL[parts[1]] || parts[1];
      return roleLabel + (courseLabel ? ' (' + courseLabel + ')' : '');
    }
    return catalogKey;
  }

  window.updateReinforcingFormulaInline = function (rowId, tableIdx, newVal) {
    const trimmed = String(newVal).trim();
    if (!trimmed) {
      alert('Please enter a formula.');
      renderReinforcingAuditView();
      return;
    }
    if (!window.RuleEditorUI || typeof window.RuleEditorUI.setFieldFormula !== 'function') {
      alert('Failed to load formula editor engine. Please refresh the page.');
      renderReinforcingAuditView();
      return;
    }
    const isIntReinf = getIsIntReinf();
    let catId, realTableIdx;
    if (tableIdx === 'tierod') { catId = 'tierod'; realTableIdx = 1; }
    else if (tableIdx === 'tierodInt') { catId = 'tierodInt'; realTableIdx = 0; }
    else { catId = isIntReinf ? 'reinf_int' : 'reinf_ext'; realTableIdx = 1; }
    const result = window.RuleEditorUI.setFieldFormula(catId, realTableIdx, rowId, trimmed);
    if (!result.ok) {
      alert('Save failed due to formula error: ' + (result.error || 'Unknown error'));
      if (typeof renderTieRodInternalAuditView === 'function') renderTieRodInternalAuditView();
      renderReinforcingAuditView();
      return;
    }
    if (typeof renderTieRodInternalAuditView === 'function') renderTieRodInternalAuditView();
    renderReinforcingAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.updateCustomReinforcingFormula = function (rowId, newVal) {
    const trimmed = String(newVal).trim();
    if (!trimmed) {
      alert('Please enter a formula.');
      renderReinforcingAuditView();
      return;
    }
    const row = customReinforcingRows.find((r) => r.rowId === rowId);
    if (!row) {
      renderReinforcingAuditView();
      return;
    }
    row.formula = trimmed;
    localStorage.setItem('water_tank_custom_reinforcing_rows', JSON.stringify(customReinforcingRows));
    renderReinforcingAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.clearReinforcingFormulaInline = function(rowId, tableIdx) {
    if (!confirm('이 수식을 삭제(0으로 설정)하시겠습니까? (산출 수량이 0으로 변경됩니다.)')) return;
    if (String(rowId).startsWith('custom_')) {
      const row = customReinforcingRows.find(r => r.rowId === rowId);
      if (row) {
        row.formula = '0';
        localStorage.setItem('water_tank_custom_reinforcing_rows', JSON.stringify(customReinforcingRows));
      }
    } else {
      const isIntReinf = getIsIntReinf();
      let catId, realTableIdx;
      if (tableIdx === 'tierod') { catId = 'tierod'; realTableIdx = 1; }
      else if (tableIdx === 'tierodInt') { catId = 'tierodInt'; realTableIdx = 0; }
      else { catId = isIntReinf ? 'reinf_int' : 'reinf_ext'; realTableIdx = 1; }
      if (window.RuleEditorUI && typeof window.RuleEditorUI.setFieldFormula === 'function') {
        window.RuleEditorUI.setFieldFormula(catId, realTableIdx, rowId, '0');
      }
    }
    renderReinforcingAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.clearSealingTapeRow = function(rowId) {
    if (!confirm('이 실링테이프 산출 수식을 삭제(0m로 설정)하시겠습니까?')) return;
    if (String(rowId).startsWith('sealtape_')) {
      const catalogKey = String(rowId).replace('sealtape_', '');
      customSealingTapeUnitLengths[catalogKey] = 0;
      customSealingTapeCounts[catalogKey] = 0;
    } else {
      const userRow = customSealingTapeUserRows.find(r => r.rowId === rowId);
      if (userRow) {
        userRow.unit = 0;
        userRow.count = 0;
      }
    }
    saveReinforcingSettings();
    if (typeof updatePrintoutSheet === 'function') updatePrintoutSheet();
  };

  window.deleteReinforcingRow = function (rowId, isCustom) {
    if (!confirm('Delete this item? (It will be excluded from BOM calculations as well.)')) return;
    if (isCustom) {
      customReinforcingRows = customReinforcingRows.filter((r) => r.rowId !== rowId);
    } else {
      deletedReinforcingRowIds.add(rowId);
    }
    saveReinforcingSettings();
  };

  window.addCustomReinforcingRowPrompt = function (sectionName) {
    const modal = document.getElementById('addCustomReinforcingModal');
    if (!modal) {
      console.error('[addCustomReinforcingRowPrompt] addCustomReinforcingModal element not found');
      return;
    }
    const isIntReinf = getIsIntReinf();
    document.getElementById('reinfModalCategoryLabel').textContent = isIntReinf ? 'Internal Reinforcing' : 'External Reinforcing';
    document.getElementById('reinfModalSection').value = sectionName || '';
    document.getElementById('reinfModalPart').value = '';
    document.getElementById('reinfModalLocation').value = sectionName ? `${sectionName} Additional Item` : '';
    document.getElementById('reinfModalFormula').value = '1';
    document.getElementById('reinfModalQty').value = 1;
    modal.classList.add('active');
    modal.style.display = 'flex';
  };

  window.closeAddCustomReinforcingModal = function () {
    const modal = document.getElementById('addCustomReinforcingModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  };

  window.confirmAddCustomReinforcingModal = function () {
    try {
      const isIntReinf = getIsIntReinf();
      const category = isIntReinf ? 'reinf_int' : 'reinf_ext';
      const section = (document.getElementById('reinfModalSection')?.value || '').trim() || 'Custom';
      const item = (document.getElementById('reinfModalPart')?.value || '').trim().toUpperCase() || 'CUSTOM-PART';
      const loc = (document.getElementById('reinfModalLocation')?.value || '').trim() || 'Additional Item';
      const formula = (document.getElementById('reinfModalFormula')?.value || '').trim();
      const qty = parseInt(document.getElementById('reinfModalQty')?.value, 10) || 1;

      const newId = 'custom_reinf_' + category + '_' + Date.now();
      customReinforcingRows.push({
        rowId: newId, category, section, item, loc,
        formula: formula || String(qty), qty, isCustom: true,
      });

      closeAddCustomReinforcingModal();
      saveReinforcingSettings();
      if (typeof renderAll === 'function') renderAll();
    } catch (err) {
      console.error('[confirmAddCustomReinforcingModal] Error:', err);
      alert('Error adding item: ' + err.message);
    }
  };

  function renderRowsTable(rows, opts) {
    opts = opts || {};
    const sections = [];
    rows.forEach((r) => {
      if (sections.indexOf(r.section) === -1) sections.push(r.section);
    });

    return sections.map((sectionName) => {
      const sectionRows = rows.filter((r) => r.section === sectionName);
      return `
        <tr style="background: #e0f2fe; font-weight: 700; color: #0369a1;">
          <td colspan="4" style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 11.5px;">■ ${escapeAttr(sectionName)}</td>
          <td style="padding: 4px 10px; border: 1px solid #cbd5e1; text-align: right;">
            ${opts.allowAdd ? `<button type="button" onclick="addCustomReinforcingRowPrompt('${escapeAttr(sectionName)}')" style="padding: 3px 10px; font-size: 11px; font-weight: 700; background: #0284c7; color: #ffffff; border: none; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-plus"></i> 항목 추가</button>` : ''}
          </td>
        </tr>
        ${sectionRows.map((r, i) => {
          const rowIdForRuleEditor = r.rowId;
          return `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${r.isCustom ? '#f0fdf4' : (i % 2 === 0 ? '#ffffff' : '#f8fafc')};">
              <td style="padding: 6px 4px; border: 1px solid #e2e8f0; font-weight: 700; font-family: monospace; color: ${r.isCustom ? '#15803d' : '#1e293b'}; font-size: 10px; word-break: break-all;" title="${escapeAttr(r.item)}">
                ${escapeAttr(r.item)} ${r.isCustom ? '<span style="font-size:8px; background:#dcfce7; color:#166534; padding:0 2px; border-radius:2px;">C</span>' : ''}
              </td>
              <td style="padding: 6px 6px; border: 1px solid #e2e8f0; color: #334155; font-size: 10.5px; word-break: break-word;">
                <span style="display: inline-block; padding: 1px 4px; font-size: 9px; font-weight: 700; font-family: monospace; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 3px; margin-right: 4px;">${escapeAttr(r.rowId)}</span>${escapeAttr(r.loc)}
              </td>
              <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">
                ${opts.editable
                  ? `<div style="display: flex; align-items: center; gap: 4px;">
                      <input type="text" value="${escapeAttr(r.formula)}" onchange="${r.isCustom ? `updateCustomReinforcingFormula('${rowIdForRuleEditor}', this.value)` : `updateReinforcingFormulaInline('${rowIdForRuleEditor}', '${opts.tableIdx || ''}', this.value)`}" title="${escapeAttr(r.formulaError ? ('⚠ 수식 오류: ' + r.formulaError) : '')}" style="width: 100%; padding: 3px 5px; font-size: 10px; font-family: monospace; border: 1px solid ${r.formulaError ? '#ef4444' : '#cbd5e1'}; border-radius: 4px; background: ${r.formulaError ? '#fef2f2' : '#ffffff'}; color: #1e293b; box-sizing: border-box;">
                      <button type="button" onclick="clearReinforcingFormulaInline('${rowIdForRuleEditor}', '${opts.tableIdx || ''}')" title="수식 삭제 (0으로 설정)" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px; font-size: 11px; flex-shrink: 0;"><i class="fa-solid fa-eraser"></i></button>
                    </div>`
                  : `<span style="font-family: monospace; font-size: 10px; color: #64748b;">${escapeAttr(r.formula)}</span>`
                }
              </td>
              <td style="padding: 6px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7;">${r.qty}</td>
              <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">
                <button type="button" onclick="deleteReinforcingRow('${r.rowId}', ${!!r.isCustom})" title="이 항목 삭제" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; font-size: 13px;"><i class="fa-solid fa-trash-can"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      `;
    }).join('');
  }

  let currentReinfSubTab = 'inside';

  window.setReinfSubTab = function (tab) {
    currentReinfSubTab = tab;
    renderReinforcingAuditView();
  };

  function renderReinforcingAuditView() {
    const container = document.getElementById('reinforcingAuditContainer');
    if (!container) return;
    if (typeof window.getTankDimensions !== 'function') return;

    const dim = window.getTankDimensions();
    const isIntReinf = getIsIntReinf();
    const isSA4 = getMaterialOption() === 2;
    const sidePanelOnly = getSidePanelOnly();

    const reinfRowsData = computeReinforcingAuditData(dim, isIntReinf, isSA4, sidePanelOnly);
    const tieRodData = computeTieRodAudit(dim);
    const tieRodIntData = isIntReinf ? computeTieRodInternalAudit(dim) : null;
    const sealingTapeData = computeSealingTapeAudit(dim);

    const filteredRows = reinfRowsData.filter((r) => {
      if (currentReinfSubTab === 'inside') {
        return r.category === 'reinf_int' || (r.section && r.section.indexOf('INSIDE') !== -1);
      } else {
        return r.category === 'reinf_ext' || (r.section && r.section.indexOf('OUTSIDE') !== -1);
      }
    });

    let html = `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-industry" style="color: #0284c7;"></i> 철자재 / 타이로드 설정 &amp; 검산표 (Reinforcing / Tie-Rod Audit)
            </h3>
            <span style="font-size: 12px; font-weight: 600; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 4px;">
              Size: ${dim.length}m(L) × ${dim.width}m(W) × ${dim.height}m(H) [1 SET] · ${isIntReinf ? 'Internal' : 'External'} R/F · Partition ${dim.numPartition}
            </span>
          </div>
        </div>

        <!-- TANK INSIDE / TANK OUTSIDE Sub-Tabs Navigation -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <button type="button" onclick="setReinfSubTab('inside')" style="flex: 1; padding: 10px 16px; border-radius: 8px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; border: 2px solid #0284c7; ${currentReinfSubTab === 'inside' ? 'background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; box-shadow: 0 4px 10px rgba(2,132,199,0.25);' : 'background: #f8fafc; color: #0284c7;'}">
            <i class="fa-solid fa-shield-halved"></i> TANK INSIDE (내부 보강재 - Stainless Steel)
          </button>
          <button type="button" onclick="setReinfSubTab('outside')" style="flex: 1; padding: 10px 16px; border-radius: 8px; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; border: 2px solid #0284c7; ${currentReinfSubTab === 'outside' ? 'background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; box-shadow: 0 4px 10px rgba(2,132,199,0.25);' : 'background: #f8fafc; color: #0284c7;'}">
            <i class="fa-solid fa-building-columns"></i> TANK OUTSIDE (외부 보강재 - HDG Steel &amp; External Tie-Rod)
          </button>
        </div>

        <div class="table-wrapper" style="max-height: 460px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 22px;">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 8px; border: 1px solid #cbd5e1; width: 110px; background: #f1f5f9;">PART NAME</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; width: 160px; background: #f1f5f9;">위치 / ROW ID</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; background: #f1f5f9;">산출 수식 (Formula)</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 60px; background: #f1f5f9;">Qty</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; width: 40px; background: #f1f5f9;">작업</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRows.length ? renderRowsTable(filteredRows, { editable: true, allowAdd: true, tableIdx: 1 }) : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8; font-weight: 700;">해당 카테고리에 등록된 보강재 항목이 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>

        ${currentReinfSubTab === 'inside' ? `
          <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">
            <i class="fa-solid fa-link" style="color: #0284c7;"></i> 타이로드 (Internal Tie-Rod)
          </h4>
          <div style="background: #f0f9ff; border: 1.5px solid #0284c7; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #0369a1; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <i class="fa-solid fa-circle-info" style="color: #0284c7; font-size: 15px; margin-right: 6px;"></i>
              <strong>Internal Tie-Rod 수량 및 세부 검증표</strong>는 전용 메뉴인 <strong>[TIE-ROD INTERNAL 검증표]</strong> 탭에서 일원화되어 관리됩니다.
            </div>
            <button type="button" onclick="const btn = document.querySelector('.tab-btn[data-tab=\\'tab-tierod-internal-audit\\']'); if (btn) btn.click();" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <i class="fa-solid fa-arrow-right"></i> 검증표로 이동
            </button>
          </div>
        ` : `
          <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">
            <i class="fa-solid fa-link" style="color: #0284c7;"></i> 외부 타이로드 (External Tie-Rod Assembly HDG WTR-12M300Z)
          </h4>
          <div class="table-wrapper" style="max-height: 460px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 10px;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                  <th style="padding: 8px; border: 1px solid #cbd5e1; width: 160px; background: #f1f5f9;">구성 요소</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; background: #f1f5f9;">설명 / 산출 수식</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 60px; background: #f1f5f9;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${tieRodData ? tieRodData.rows.map((r) => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px 4px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; color: #1e293b; font-size: 10px;">${escapeAttr(r.fieldId)}</td>
                    <td style="padding: 6px 6px; border: 1px solid #e2e8f0;">
                      <input type="text" value="${escapeAttr(r.formula)}" onchange="updateReinforcingFormulaInline('${r.fieldId}', 'tierod', this.value)" style="width: 100%; padding: 3px 5px; font-size: 10px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                      <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">${escapeAttr(r.loc)}</div>
                    </td>
                    <td style="padding: 6px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7;">${r.qty}</td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="padding:8px; text-align:center; color:#94a3b8;">계산 불가</td></tr>'}
                <tr style="background:#f0f9ff; font-weight:700;">
                  <td colspan="2" style="padding: 6px; border: 1px solid #cbd5e1;">WTR-12M300Z · External Tie-Rod Assembly (HDG) 완제품 합계</td>
                  <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; color: #0284c7;">${tieRodData ? tieRodData.total : 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    container.innerHTML = html;
  }

  window.renderReinforcingAuditView = renderReinforcingAuditView;

  document.addEventListener('DOMContentLoaded', () => {
    loadSavedReinforcingSettings();
    setTimeout(renderReinforcingAuditView, 300);

    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-reinf-audit"]');
    if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(renderReinforcingAuditView, 0));

    ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight', 'numPartition', 'reinfMethod', 'boltMaterial', 'sidePanelOnly', 'partitionPanelOnly', 'internalTieRod'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', renderReinforcingAuditView);
        el.addEventListener('change', renderReinforcingAuditView);
      }
    });
  });
})();
