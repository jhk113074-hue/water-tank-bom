/**
 * Internal Tie-Rod Verification & Adjustment Sheet ("TIE-ROD INTERNAL 검증표")
 * Water Tank BOM System
 *
 * The generic Rule Editor (rule_editor.js) explicitly excludes tie-rod's
 * large lookup tables from its scope (see that file's header comment) --
 * it only exposes the 25 per-catalog-length row FORMULAS for Internal
 * Tie-Rod, not the underlying "layer / Nos of Tie-rod" table or the
 * length-decomposition logic those formulas depend on. This tab fills that
 * gap: it mirrors the reference workbook's own INT_TIE_ROD sheet layout
 * (a small H -> "Nos of Tie-rod" table plus a dim -> catalog-length
 * matrix) so a non-developer can VISUALLY VERIFY the length-matching logic
 * against the original spreadsheet, EDIT the "Nos of Tie-rod" factor per
 * height bracket, and see the same independent piece/nut/bw cross-check
 * used during real BOM generation (accessories_engine.js's
 * tieRodInternalParts) for the tank currently entered in BOM INPUT.
 *
 * Kept as its own file (not folded into reinforcing_audit.js) since it is
 * a distinct concern -- verifying/editing the lookup data behind the
 * formulas, not displaying the formulas' live results.
 */
(function () {
  const STORAGE_KEY = 'water_tank_tierod_internal_layer_overrides_v1';

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getRules() {
    return (typeof AccessoriesRules !== 'undefined' && AccessoriesRules.tieRodInternal) || null;
  }

  // ---- Layer / "Nos of Tie-rod" override persistence -----------------
  // Same early-apply pattern as rule_editor.js: snapshot the shipped
  // defaults once, then apply any saved override immediately so real BOM
  // calculations (which read AccessoriesRules.tieRodInternal.layerFactorTable
  // directly) reflect it with no reload needed.
  let defaultLayerFactors = null;
  function snapshotDefaults() {
    const rules = getRules();
    if (!rules || defaultLayerFactors) return;
    defaultLayerFactors = rules.layerFactorTable.map((r) => r.factor);
  }

  function loadOverrides() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.error('[TieRodInternalAudit] localStorage 불러오기 실패:', e);
      return null;
    }
  }

  function saveOverrides(factors) {
    try {
      if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(factors));
    } catch (e) {
      console.error('[TieRodInternalAudit] localStorage 저장 실패:', e);
    }
  }

  function applyFactors(factors) {
    const rules = getRules();
    if (!rules || !Array.isArray(factors)) return;
    rules.layerFactorTable.forEach((row, i) => {
      if (typeof factors[i] === 'number' && isFinite(factors[i])) row.factor = factors[i];
    });
  }

  snapshotDefaults();
  applyFactors(loadOverrides());

  function layerRowLabel(row, prevMaxH) {
    if (row.maxH === undefined) return `H > ${prevMaxH}m`;
    if (prevMaxH === undefined) return `H ≤ ${row.maxH}m`;
    return `${prevMaxH}m < H ≤ ${row.maxH}m`;
  }

  // ---- Tie-Rod Length decomposition matrix (read-only verification) --
  // Mirrors the reference workbook's "Tie-rod Length(General TANK)" grid:
  // rows = a raw dimension value (m), columns = the real TR-12M catalog
  // lengths (mm); a cell shows how many pieces of that catalog length a
  // SINGLE rod of that dimension decomposes into. Built from the exact
  // same closed-form decomposition accessories_engine.js's real BOM path
  // uses (AccessoriesEngine.tieRodInternalSegmentsFor), not a
  // reimplementation, so this view can never silently drift from what
  // actually ships.
  // Matches the reference workbook's AG25:AG123 row range exactly (dim 1.0m
  // to 50.0m in 0.5m steps, 99 rows) so this view is a complete replacement
  // for that table, not a partial one.
  function buildLengthMatrixRows(maxDimM) {
    const rows = [];
    for (let dim = 1.0; dim <= maxDimM + 1e-9; dim += 0.5) {
      rows.push(Math.round(dim * 10) / 10);
    }
    return rows;
  }

  function getTankDimSafe() {
    try {
      return (typeof window.getTankDimensions === 'function') ? window.getTankDimensions() : null;
    } catch (e) {
      return null;
    }
  }

  function currentDimAxisMap(dim) {
    if (!dim) return {};
    const map = {};
    [['W', dim.width], ['L1', dim.l1], ['L2', dim.l2], ['L3', dim.l3], ['L4', dim.l4]].forEach(([axis, v]) => {
      if (v && v > 0) {
        const key = Math.round(v * 10) / 10;
        map[key] = map[key] ? map[key] + '/' + axis : axis;
      }
    });
    return map;
  }

  // Same lookup as accessories_engine.js's tieRodInternalLayerFactor (first
  // row whose maxH is undefined or >= H) -- reused here so the highlighted
  // "active" row always matches what the real BOM calc actually uses.
  function activeLayerIndex(rules, H) {
    for (let i = 0; i < rules.layerFactorTable.length; i++) {
      const r = rules.layerFactorTable[i];
      if (r.maxH === undefined || H <= r.maxH) return i;
    }
    return -1;
  }

  function renderLayerTable(dim) {
    const rules = getRules();
    if (!rules) return '<p style="color:#94a3b8;">AccessoriesRules.tieRodInternal을 불러올 수 없습니다.</p>';
    const currentH = dim ? Math.round(dim.height * 10) / 10 : null;
    const activeIdx = currentH !== null ? activeLayerIndex(rules, currentH) : -1;

    let prevMaxH;
    const rowsHtml = rules.layerFactorTable.map((row, i) => {
      const label = layerRowLabel(row, prevMaxH);
      prevMaxH = row.maxH;
      const isActive = i === activeIdx;
      return `
        <tr style="background: ${isActive ? '#dcfce7' : (i % 2 === 0 ? '#ffffff' : '#f8fafc')}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: ${isActive ? '700' : '500'};">
            ${isActive ? '<i class="fa-solid fa-arrow-right" style="color:#16a34a;"></i> ' : ''}${escapeAttr(label)}
          </td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center;">
            <input type="number" step="1" min="0" data-layer-idx="${i}" value="${row.factor}" style="width: 70px; padding: 4px 6px; font-size: 12px; font-family: monospace; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrapper" style="max-height: 380px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 12px; text-align: left; width: 100%;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; background: #f1f5f9;">탱크 높이 (Height, H)</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">Nos of Tie-rod (layer)</th>
            </tr>
          </thead>
          <tbody id="tieRodInternalLayerTbody">${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderLengthMatrix(dim) {
    const rules = getRules();
    if (!rules || typeof AccessoriesEngine === 'undefined') return '<p style="color:#94a3b8;">계산 불가</p>';
    const catalogLengths = rules.catalogLengthsMm;
    const axisMap = currentDimAxisMap(dim);
    const dimValues = Object.keys(axisMap).map(Number);
    const maxDim = Math.max(50.0, ...(dimValues.length ? dimValues : [0]));
    const dims = buildLengthMatrixRows(maxDim);

    const headerHtml = catalogLengths.map((len) => `<th style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; min-width: 42px;">${len}</th>`).join('');

    // "복원값" column -- reproduces the original workbook's own BG25:BG123 /
    // CJ25:CJ123 self-check formula (=SUMPRODUCT(catalog lengths, matched
    // row) + 120), which reconstructs the raw dimension in mm from the
    // matched catalog piece(s) alone. It must always equal dim*1000; if it
    // doesn't, the decomposition for that row is wrong. Kept as a visible
    // column (not just an internal assert) since that is exactly how the
    // reference sheet surfaces the same check.
    const rowsHtml = dims.map((dimVal) => {
      const axisLabel = axisMap[dimVal];
      const { pieces } = AccessoriesEngine.tieRodInternalSegmentsFor(dimVal);
      const counts = {};
      pieces.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
      const cells = catalogLengths.map((len) => {
        const c = counts[len] || 0;
        return `<td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; color: ${c ? '#0284c7' : '#cbd5e1'}; font-weight: ${c ? '700' : '400'};">${c || '-'}</td>`;
      }).join('');
      const reconstructedMm = pieces.length ? pieces.reduce((s, p) => s + p, 0) + 120 : 0;
      const expectedMm = Math.round(dimVal * 1000);
      const mismatch = pieces.length > 0 && reconstructedMm !== expectedMm;
      const reconCell = `<td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: ${mismatch ? '#dc2626' : '#16a34a'}; background: ${mismatch ? '#fef2f2' : 'transparent'};">${pieces.length ? reconstructedMm : '-'}${mismatch ? ' ⚠' : ''}</td>`;
      return `
        <tr style="background: ${axisLabel ? '#dcfce7' : '#ffffff'};">
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; white-space: nowrap;">
            ${dimVal.toFixed(1)}m ${axisLabel ? `<span style="color:#16a34a;">◀ ${escapeAttr(axisLabel)}</span>` : ''}
          </td>
          ${cells}
          ${reconCell}
        </tr>
      `;
    }).join('');

    return `
      <div style="font-size: 10.5px; color: #94a3b8; margin-bottom: 6px;">
        <i class="fa-solid fa-circle-info"></i> 원본 워크북은 이 표를 W/L1용(AG24:BF123)과 L2/L3/L4용(BJ24:CI123) 두 벌로 물리적으로 복제해 두었지만 데이터는 완전히 동일함을 확인하여 하나로 통합했습니다.
        맨 오른쪽 "복원값" 열은 원본의 BG/CJ 자기검증 열과 동일하게, 매칭된 카탈로그 길이 합계로 원래 치수(mm)를 역산해 일치 여부를 표시합니다.
      </div>
      <div style="overflow-x: auto; max-height: 420px; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 11px; text-align: left; white-space: nowrap;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 1;">
              <th style="padding: 5px 8px; border: 1px solid #cbd5e1; position: sticky; left: 0; background: #f1f5f9; z-index: 2;">치수 (m)</th>
              ${headerHtml}
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; min-width: 60px;">복원값(mm)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderValidationSummary(dim) {
    if (!dim || typeof AccessoriesEngine === 'undefined' || typeof PanelEngine === 'undefined') {
      return '<p style="color:#94a3b8;">탱크 치수를 먼저 입력하세요.</p>';
    }
    try {
      const g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
      const internalTieRodEl = document.getElementById('internalTieRod');
      const isSA4 = !internalTieRodEl || internalTieRodEl.value !== 'SS304';
      const { parts, detail, warnings } = AccessoriesEngine.tieRodInternalParts(g, isSA4);
      const totalPieces = (parts || []).reduce((s, p) => s + p.qty, 0);

      const activeRows = (detail || []).filter((d) => d.value > 0);

      let statusBanner = '';
      if (!warnings || warnings.length === 0) {
        statusBanner = `
          <div style="background: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #166534; margin-bottom: 14px;">
            <i class="fa-solid fa-circle-check"></i> <b>검증 통과</b> -- 카탈로그 길이별 합계, M12 NUT/BW 수량 모두 독립 계산값과 일치합니다. (현재 치수 기준 로드 총 ${totalPieces}개, 부품 ${activeRows.length}종)
          </div>
        `;
      } else {
        statusBanner = `
          <div style="background: #fef2f2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #991b1b; margin-bottom: 14px;">
            <div style="font-weight: 700; margin-bottom: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> 검증 경고 -- ${warnings.length}건 확인 필요</div>
            ${warnings.map((w) => `<div style="margin-top: 2px;">・ ${escapeAttr(w)}</div>`).join('')}
          </div>
        `;
      }

      let tableHtml = `
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 13.5px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-link" style="color: #0284c7;"></i> 타이로드 (Tie-Rod, Internal) 실시간 부품별 수식 & 수량 내역표 ✏️ (Rule Editor 통합)
              <span style="font-size: 10.5px; font-weight: 600; color: #16a34a; background: #dcfce7; padding: 2px 6px; border-radius: 4px; border: 1px solid #bbf7d0;">실제 BOM 반영 (재질: ${isSA4 ? 'SS316 / SA4' : 'SS304 / SA2'})</span>
            </h4>
            <div style="display: flex; gap: 6px;">
              <button type="button" onclick="if (typeof RuleEditorUI !== 'undefined') RuleEditorUI.saveCategory('tierodInt');" style="background: #16a34a; color: #ffffff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="수정된 수식 저장"><i class="fa-solid fa-floppy-disk"></i> 수식 저장</button>
              <button type="button" onclick="if (typeof RuleEditorUI !== 'undefined') RuleEditorUI.resetCategory('tierodInt');" style="background: #eab308; color: #ffffff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="카탈로그 기본 수식으로 원복"><i class="fa-solid fa-rotate-left"></i> 기본 수식 원복</button>
            </div>
          </div>
          <div class="table-wrapper" style="max-height: 380px; overflow-y: auto; overflow-x: auto; border: 2px solid #0284c7; border-radius: 8px; box-shadow: 0 4px 12px rgba(2,132,199,0.08);">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
              <thead>
                <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0; z-index: 10;">
                  <th style="padding: 8px; border: 1px solid #bae6fd; width: 180px; background: #e0f2fe; color: #0369a1; font-weight: 800;">부품 (Part No)</th>
                  <th style="padding: 8px; border: 1px solid #bae6fd; background: #e0f2fe; color: #0369a1; font-weight: 800;">산출 수식 (Formula - 클릭 후 실시간 직접 수정 ✏️)</th>
                  <th style="padding: 8px; border: 1px solid #bae6fd; text-align: right; width: 80px; background: #e0f2fe; color: #0369a1; font-weight: 800;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${activeRows.length ? activeRows.map((r, i) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #0284c7;">${escapeAttr(r.partNo)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">
                      <input type="text" value="${escapeAttr(r.formula)}" onchange="if (typeof updateReinforcingFormulaInline === 'function') updateReinforcingFormulaInline('${r.id}', 'tierodInt', this.value)" style="width: 100%; padding: 3px 6px; font-size: 10px; font-family: monospace; border: 1.5px solid #38bdf8; border-radius: 4px; box-sizing: border-box; background: #ffffff; color: #0f172a; font-weight: 600;">
                    </td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #0284c7; font-size: 12px;">${r.value}</td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="padding:12px; text-align:center; color:#94a3b8; font-weight:700;">이 탱크 크기에서는 타이로드가 필요하지 않습니다.</td></tr>'}
                <tr style="background:#e0f2fe; font-weight:800; border-top: 2px solid #0284c7;">
                  <td colspan="2" style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-size: 12px;">Internal Tie-Rod 전체 수량 합계</td>
                  <td style="padding: 8px; border: 1px solid #bae6fd; text-align: right; color: #0284c7; font-size: 13px;">${totalPieces}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      return statusBanner + tableHtml;
    } catch (e) {
      console.warn('[TieRodInternalAudit] validation summary failed:', e);
      return '<p style="color:#94a3b8;">계산 불가 (콘솔 로그 참조)</p>';
    }
  }

  function renderTieRodInternalAuditView() {
    const container = document.getElementById('tieRodInternalAuditContainer');
    if (!container) return;
    const dim = getTankDimSafe();

    container.innerHTML = `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
          <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-ruler-combined" style="color: #16a34a;"></i> Internal Tie-Rod 검증표 (Verification &amp; Adjustment)
          </h3>
          <span style="font-size: 11.5px; color: #64748b; display: block; margin-top: 4px;">
            원본 엑셀 INT_TIE_ROD 시트의 "layer / Nos of Tie-rod" 표와 "Tie-rod Length(General TANK)" 매트릭스를 그대로 재현한 검증/보정 화면입니다.
          </span>
        </div>

        <div id="tieRodInternalValidationSummary" style="margin-bottom: 20px;">${renderValidationSummary(dim)}</div>

        <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start;">
          <div style="flex: 0 0 auto;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">
              <i class="fa-solid fa-layer-group" style="color: #16a34a;"></i> layer (Nos of Tie-rod) -- 수정 가능
            </h4>
            <div id="tieRodInternalLayerTable">${renderLayerTable(dim)}</div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button type="button" onclick="TieRodInternalAudit.saveLayerFactors()" style="background: #16a34a; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;"><i class="fa-solid fa-floppy-disk"></i> 저장</button>
              <button type="button" onclick="TieRodInternalAudit.resetLayerFactors()" style="background: #eab308; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;"><i class="fa-solid fa-rotate-left"></i> 기본값 초기화</button>
            </div>
          </div>

          <div style="flex: 1 1 480px; min-width: 0;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">
              <i class="fa-solid fa-table-cells" style="color: #0284c7;"></i> Tie-rod Length (General TANK) -- 길이 매칭 검증 (읽기 전용)
            </h4>
            <div style="font-size: 10.5px; color: #94a3b8; margin-bottom: 6px;">
              <i class="fa-solid fa-circle-info"></i> 초록색 행 = 현재 입력된 탱크 치수(W/L1~L4)와 일치하는 행. 셀 값 = 해당 치수(행)가 분해되는 카탈로그 규격(열)별 피스 수.
            </div>
            <div id="tieRodInternalLengthMatrix">${renderLengthMatrix(dim)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function saveLayerFactors() {
    const tbody = document.getElementById('tieRodInternalLayerTbody');
    if (!tbody) return;
    const inputs = tbody.querySelectorAll('input[data-layer-idx]');
    const factors = [];
    let valid = true;
    inputs.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-layer-idx'), 10);
      const val = parseFloat(el.value);
      if (isNaN(val) || val < 0) valid = false;
      factors[idx] = val;
    });
    if (!valid) {
      alert('Nos of Tie-rod 값은 0 이상의 숫자여야 합니다.');
      return;
    }
    applyFactors(factors);
    saveOverrides(factors);
    renderTieRodInternalAuditView();
  }

  function resetLayerFactors() {
    if (!defaultLayerFactors) return;
    applyFactors(defaultLayerFactors);
    try {
      if (window.localStorage) window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    renderTieRodInternalAuditView();
  }

  window.TieRodInternalAudit = { saveLayerFactors, resetLayerFactors, render: renderTieRodInternalAuditView };
  window.renderTieRodInternalAuditView = renderTieRodInternalAuditView;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderTieRodInternalAuditView, 300);

    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-tierod-internal-audit"]');
    if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(renderTieRodInternalAuditView, 0));

    ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight', 'numPartition', 'reinfMethod', 'internalTieRod'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', renderTieRodInternalAuditView);
        el.addEventListener('change', renderTieRodInternalAuditView);
      }
    });
  });
})();
