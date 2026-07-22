/**
 * Bolt Logic Setting & Calculation Audit Sheet Module
 * Water Tank BOM System - Bolt Calculation Sheet & Setting Replication
 * 
 * Supports adding, editing, and deleting bolts for each section (ROOF, BOTTOM, SIDE, PARTITION, STEEL SKID, etc.)
 */

(function () {
  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function boltRules() {
    return (typeof AccessoriesRules !== 'undefined' && AccessoriesRules.boltsAndNuts) ? AccessoriesRules.boltsAndNuts : null;
  }

  function buildLibLocationMap(rules) {
    const map = {};
    (rules.rows || []).forEach((row) => {
      const libIds = [];
      if (row.lib) libIds.push(row.lib);
      if (row.libByOption) Object.keys(row.libByOption).forEach((k) => libIds.push(row.libByOption[k]));
      libIds.forEach((libId) => {
        if (!map[libId]) map[libId] = [];
        if (row.label && map[libId].indexOf(row.label) === -1) map[libId].push(row.label);
      });
    });
    return map;
  }

  function buildDefaultItems() {
    const rules = boltRules();
    if (!rules || !rules.libraryCatalog) return [];
    const locMap = buildLibLocationMap(rules);
    return Object.keys(rules.libraryCatalog)
      .map(Number)
      .sort((a, b) => a - b)
      .map((libId) => {
        const cat = rules.libraryCatalog[libId];
        const locs = locMap[libId] || [];
        return {
          id: libId,
          location: locs.length ? locs.join(' / ') : ('BoltnNuts Lib #' + libId),
          dia: cat.dia,
          length: cat.length,
          washer: cat.washer,
          nut: cat.nut,
          boltName: cat.boltName
        };
      });
  }

  let boltSettings = { items: buildDefaultItems() };
  let customBoltRows = [];
  let deletedRowIds = new Set();
  let expandedFormulaRowId = null;

  // Variables available inside a bolt row's quantity formula (see the big
  // comment above AccessoriesRules.boltsAndNuts in accessories_rules.js).
  // Shown as a hint next to the inline formula editor below.
  const BOLT_FORMULA_VAR_HINT =
    "사용 가능 변수: W_C, W_F, L_C, L_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, H_C, H_F, N_PA, W_O, L_O, RF(1=Internal/2=External), L2_O · 다른 항목 ID(예: AP5, AP18)도 그 값으로 참조 가능";

  function loadSavedBoltSettings() {
    boltSettings = { items: buildDefaultItems() };
    const saved = localStorage.getItem('water_tank_bolt_logic_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const savedItems = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
        const byId = {};
        savedItems.forEach((it) => { if (it && it.id !== undefined) byId[it.id] = it; });
        boltSettings.items = boltSettings.items.map((it) => {
          const ov = byId[it.id];
          if (!ov) return it;
          return Object.assign({}, it, {
            boltName: (typeof ov.boltName === 'string' && ov.boltName.trim()) ? ov.boltName.trim() : it.boltName,
            dia: (ov.dia != null && ov.dia !== '') ? Number(ov.dia) : it.dia,
            length: (ov.length != null && ov.length !== '') ? Number(ov.length) : it.length,
            washer: (ov.washer != null && ov.washer !== '') ? Number(ov.washer) : it.washer,
            nut: (ov.nut != null && ov.nut !== '') ? Number(ov.nut) : it.nut
          });
        });
      } catch (e) {
        console.warn('Failed to parse saved bolt logic settings:', e);
      }
    }

    try {
      const savedCustom = localStorage.getItem('water_tank_custom_bolt_rows');
      if (savedCustom) customBoltRows = JSON.parse(savedCustom);
    } catch (e) {
      customBoltRows = [];
    }

    try {
      const savedDeleted = localStorage.getItem('water_tank_deleted_bolt_rows');
      if (savedDeleted) deletedRowIds = new Set(JSON.parse(savedDeleted));
    } catch (e) {
      deletedRowIds = new Set();
    }
  }

  function saveBoltSettings() {
    localStorage.setItem('water_tank_bolt_logic_settings', JSON.stringify(boltSettings));
    localStorage.setItem('water_tank_custom_bolt_rows', JSON.stringify(customBoltRows));
    localStorage.setItem('water_tank_deleted_bolt_rows', JSON.stringify(Array.from(deletedRowIds)));
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
    alert('볼트 로직 SETTING 및 구성 변경이 저장되었습니다.');
  }

  function resetBoltSettings() {
    if (confirm('볼트 로직 SETTING과 커스텀 변경 사항을 초기 기본값으로 복원하시겠습니까?')) {
      localStorage.removeItem('water_tank_bolt_logic_settings');
      localStorage.removeItem('water_tank_custom_bolt_rows');
      localStorage.removeItem('water_tank_deleted_bolt_rows');
      boltSettings = { items: buildDefaultItems() };
      customBoltRows = [];
      deletedRowIds = new Set();
      renderBoltAuditView();
      if (typeof renderAll === 'function') renderAll();
    }
  }

  function deriveBoltName(item) {
    const prevName = item.boltName || '';
    const prefixMatch = /^([A-Za-z]+-)/.exec(prevName);
    const prefix = prefixMatch ? prefixMatch[1] : 'WBT-';
    if (prefix === 'WNT-' || prefix === 'WFW-') {
      return prefix + 'M' + item.dia;
    }
    const suffixMatch = /^[A-Za-z]+-[0-9]+([A-Za-z]*)$/.exec(prevName);
    const suffix = suffixMatch ? suffixMatch[1] : '';
    const lenPart = item.length ? String(item.length) : '';
    return prefix + item.dia + lenPart + suffix;
  }

  window.updateBoltSettingField = function (idx, field, rawValue) {
    const item = boltSettings.items[idx];
    if (!item) return;
    if (field === 'boltName') {
      item.boltName = String(rawValue).trim();
    } else {
      item[field] = parseInt(rawValue, 10) || 0;
      if (field === 'dia' || field === 'length') {
        item.boltName = deriveBoltName(item);
      }
    }
    renderBoltAuditView();
  };

  function currentOverrides() {
    const overrides = {};
    boltSettings.items.forEach((it) => {
      if (it.boltName) overrides[it.id] = it.boltName;
    });
    return overrides;
  }

  window.getBoltCatalogOverrides = function () {
    loadSavedBoltSettings();
    return currentOverrides();
  };

  window.getCustomBoltRows = function() {
    return customBoltRows;
  };

  window.getDeletedBoltRowIds = function() {
    return deletedRowIds;
  };

  function numFromInput(id, fallback) {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? fallback : v;
  }

  function getTankDimensions() {
    const l1 = numFromInput('tankLength1', 3);
    const l2 = numFromInput('tankLength2', 0);
    const l3 = numFromInput('tankLength3', 0);
    const l4 = numFromInput('tankLength4', 0);
    const width = numFromInput('tankWidth', 3.5);
    const height = numFromInput('tankHeight', 1.5);
    const partitionEl = document.getElementById('numPartition');
    const numPartition = partitionEl ? (parseInt(partitionEl.value, 10) || 0) : 0;
    return {
      l1, l2, l3, l4, length: l1 + l2 + l3 + l4,
      width, height,
      numPartition, partition: numPartition > 0
    };
  }
  window.getTankDimensions = getTankDimensions;

  function getIsIntReinf() {
    const el = document.getElementById('reinfMethod');
    return el ? el.value !== 'External' : true;
  }

  function getMaterialOption() {
    const el = document.getElementById('boltMaterial');
    return el ? (parseInt(el.value, 10) || 2) : 2;
  }

  function resolvePartNoForOption(row, optValue, overrides) {
    if (!row) return '';
    if (row.literal) {
      const ov = overrides && overrides[row.id];
      return (ov && String(ov).trim()) || row.literal;
    }
    const libId = (row.libByOption && row.libByOption[optValue]) || row.lib;
    if (!libId || !row.suffix) return row.item || '';
    const ov = overrides && overrides[libId];
    const rules = boltRules();
    const base = (ov && String(ov).trim()) || (rules && rules.libraryNames[libId]) || '';
    return base + row.suffix[optValue - 1];
  }

  // Compute live per-assembly-location breakdown including custom & deleted rows
  function computeBoltAuditData(dim) {
    const rules = boltRules();
    if (!rules || typeof PanelEngine === 'undefined' || typeof AccessoriesEngine === 'undefined') return [];

    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      console.warn('[BoltLogicAudit] PanelEngine.makeGeometry failed:', e);
      return [];
    }

    const isIntReinf = getIsIntReinf();
    const materialOption = getMaterialOption();
    const overrides = currentOverrides();
    const { detail } = AccessoriesEngine.boltsAndNutsParts(g, isIntReinf, materialOption, overrides);

    let rows = detail
      .filter(d => !deletedRowIds.has(d.id))
      .map((d) => ({
        rowId: d.id,
        group: d.section || 'OTHER',
        item: d.partNo || '-',
        loc: d.label || d.id,
        qty: Math.round(d.value),
        add: Math.ceil(d.value * 0.05),
        isCustom: false
      }));

    // Append custom bolt rows
    customBoltRows.forEach(c => {
      if (!deletedRowIds.has(c.rowId)) {
        rows.push({
          rowId: c.rowId,
          group: c.group || 'OTHER',
          item: c.item || 'WBT-1035',
          loc: c.loc || 'Custom Bolt Item',
          qty: Number(c.qty) || 0,
          add: Number(c.add) || 0,
          isCustom: true
        });
      }
    });

    return rows;
  }

  // Exposed Add Custom Bolt Row Modal Trigger
  window.addCustomBoltRowPrompt = function(groupName) {
    const partNo = prompt(`[ ${groupName} SECTION ] 에 추가할 볼트 품번(Part Name)을 입력하세요:`, 'WBT-1035SA4');
    if (!partNo || !partNo.trim()) return;

    const locName = prompt(`조립 위치/설명(Assemble Location)을 입력하세요:`, `${groupName} 추가 조립 볼트`);
    if (!locName || !locName.trim()) return;

    const qtyStr = prompt(`산출 수량(INITIAL Qty)을 입력하세요:`, '10');
    if (qtyStr === null) return;
    const qty = parseInt(qtyStr, 10) || 0;

    const addStr = prompt(`할증/여유 수량(Add (+))을 입력하세요:`, '1');
    if (addStr === null) return;
    const add = parseInt(addStr, 10) || 0;

    const newId = 'custom_' + groupName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

    customBoltRows.push({
      rowId: newId,
      group: groupName,
      item: partNo.trim().toUpperCase(),
      loc: locName.trim(),
      qty: qty,
      add: add,
      isCustom: true
    });

    saveBoltSettings();
  };

  // Exposed formula-editor handlers -- these drive the SAME engine as the
  // "수식 설정 (Rule Editor)" tab's "볼트 & 너트" category (RuleEditorUI.
  // setFieldFormula/resetFieldFormula in rule_editor.js), so an edit made
  // here is identical in effect and storage to one made there: same
  // localStorage overrides key, same Firestore sync, same "reset to
  // original shipped default" behavior. This lets the bolt logic that used
  // to be editable only on that separate tab be changed directly from this
  // Calculation Audit Sheet instead.
  window.toggleBoltFormulaEditor = function (rowId) {
    expandedFormulaRowId = (expandedFormulaRowId === rowId) ? null : rowId;
    renderBoltAuditView();
  };

  window.saveBoltFormula = function (rowId) {
    const input = document.getElementById('boltFormulaInput_' + rowId);
    if (!input) return;
    const newVal = input.value.trim();
    if (!newVal) { alert('수식을 입력하세요.'); return; }
    if (!window.RuleEditorUI || typeof window.RuleEditorUI.setFieldFormula !== 'function') {
      alert('수식 편집 엔진을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    const result = window.RuleEditorUI.setFieldFormula('bolts', 0, rowId, newVal);
    if (!result.ok) {
      alert('수식 오류로 저장되지 않았습니다: ' + (result.error || '알 수 없는 오류'));
      return;
    }
    expandedFormulaRowId = null;
    renderBoltAuditView();
    if (typeof renderAll === 'function') renderAll();
  };

  window.resetBoltFormula = function (rowId) {
    if (!confirm('이 항목의 산출 수식을 원본 기본값으로 되돌리시겠습니까?')) return;
    if (!window.RuleEditorUI || typeof window.RuleEditorUI.resetFieldFormula !== 'function') return;
    const result = window.RuleEditorUI.resetFieldFormula('bolts', 0, rowId);
    if (result && result.ok) {
      renderBoltAuditView();
      if (typeof renderAll === 'function') renderAll();
    }
  };

  // Exposed Delete Row Handler
  window.deleteBoltRow = function(rowId, isCustom) {
    if (confirm('이 볼트 산출 항목을 삭제하시겠습니까? (BOM 계산에서도 제외됩니다.)')) {
      if (isCustom) {
        customBoltRows = customBoltRows.filter(r => r.rowId !== rowId);
      } else {
        deletedRowIds.add(rowId);
      }
      saveBoltSettings();
    }
  };

  function renderBoltAuditView() {
    const container = document.getElementById('boltLogicAuditContainer');
    if (!container) return;

    const rules = boltRules();
    const dim = getTankDimensions();
    const auditRows = computeBoltAuditData(dim);
    const rowsById = {};
    if (rules) rules.rows.forEach((r) => { rowsById[r.id] = r; });
    const overrides = currentOverrides();
    const materialOptions = (rules && rules.materialOptions) || [
      { value: 1, label: 'EXT:HDG/INT:SS304+R/F:HDG' },
      { value: 2, label: 'EXT:HDG/INT:SS316' },
      { value: 3, label: 'EXT:SS304/INT:SS316' },
      { value: 4, label: 'EXT:SS304/INT:SS316+R/F:Plastic' },
      { value: 5, label: 'INT/EXT:SS304' },
      { value: 6, label: 'INT/EXT:SS316' }
    ];

    // Collect all section names dynamically
    const sections = ['ROOF', 'BOTTOM', 'SIDE', 'PARTITION', 'STEEL SKID', 'PARTITION BRACKET'];
    auditRows.forEach(r => {
      if (r.group && sections.indexOf(r.group) === -1) {
        sections.push(r.group);
      }
    });

    let html = `
      <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; width: 100%;">

        <!-- Left Side: Calculation & Audit Verification Table (70% Width) -->
        <div style="flex: 7; min-width: 650px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
            <div>
              <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-calculator" style="color: #0284c7;"></i> 실시간 볼트 산출 & 검산표 (Calculation Audit Sheet)
              </h3>
              <span style="font-size: 12px; font-weight: 600; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 4px;">
                Size: ${dim.length}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M³ [1 SET] · ${getIsIntReinf() ? 'Internal' : 'External'} R/F · Partition ${dim.numPartition}
              </span>
            </div>
            <div style="display: flex; gap: 8px;">
              ${deletedRowIds.size > 0 ? `
                <button type="button" onclick="deletedRowIds.clear(); saveBoltSettings();" class="btn btn-outline btn-sm" style="font-size: 11px; color: #64748b;">
                  <i class="fa-solid fa-arrow-rotate-left"></i> 삭제 항목 복원 (${deletedRowIds.size})
                </button>
              ` : ''}
              <button type="button" onclick="exportBoltAuditToExcel()" class="btn btn-outline btn-sm" style="border-color: #10b981; color: #10b981; display: flex; align-items: center; gap: 6px; font-weight: 700;">
                <i class="fa-solid fa-file-excel"></i> 검산표 엑셀 다운로드
              </button>
            </div>
          </div>

          <div style="overflow-x: auto;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px; border: 1px solid #cbd5e1; width: 95px;">PART NAME</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Bolt Assemble Location</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 55px;">INITIAL</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 45px;">Qty</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 55px;">Add (+)</th>
                  ${materialOptions.map(m => `<th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 10px; background: #e2e8f0; width: 105px;">${m.label}</th>`).join('')}
                  <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; width: 40px;">작업</th>
                </tr>
              </thead>
              <tbody>
                ${sections.map(sectionName => {
                  const sectionRows = auditRows.filter(r => r.group === sectionName);
                  return `
                    <tr style="background: #e0f2fe; font-weight: 700; color: #0369a1;">
                      <td colspan="5" style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 11.5px;">
                        ■ ${sectionName} SECTION
                      </td>
                      <td colspan="7" style="padding: 4px 10px; border: 1px solid #cbd5e1; text-align: right;">
                        <button type="button" onclick="addCustomBoltRowPrompt('${sectionName}')" style="padding: 3px 10px; font-size: 11px; font-weight: 700; background: #0284c7; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                          <i class="fa-solid fa-plus"></i> [ ${sectionName} ] 섹션 볼트 추가
                        </button>
                      </td>
                    </tr>
                    ${sectionRows.map((r, i) => {
                      const row = rowsById[r.rowId];
                      const totalCols = 5 + materialOptions.length + 1;
                      const fieldInfo = (!r.isCustom && window.RuleEditorUI && typeof window.RuleEditorUI.getFieldInfo === 'function')
                        ? window.RuleEditorUI.getFieldInfo('bolts', 0, r.rowId) : null;
                      const isFormulaModified = !!(fieldInfo && fieldInfo.isModified);
                      const isExpanded = expandedFormulaRowId === r.rowId;
                      const formulaRowHtml = (!r.isCustom && isExpanded) ? `
                        <tr style="background: #fffbeb; border-bottom: 2px solid #f59e0b;">
                          <td colspan="${totalCols}" style="padding: 10px 14px;">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                              <span style="font-size: 11px; font-weight: 700; color: #92400e; white-space: nowrap;">
                                <i class="fa-solid fa-square-root-variable"></i> ${r.rowId} 산출 수식:
                              </span>
                              <input type="text" id="boltFormulaInput_${r.rowId}" value="${escapeAttr(row ? row.formula : '')}" style="flex: 1; min-width: 260px; padding: 5px 8px; font-size: 11.5px; font-family: monospace; border: 1px solid #f59e0b; border-radius: 5px;">
                              <button type="button" onclick="saveBoltFormula('${r.rowId}')" style="padding: 4px 10px; font-size: 11px; font-weight: 700; background: #0284c7; color: #ffffff; border: none; border-radius: 4px; cursor: pointer;">저장</button>
                              <button type="button" onclick="resetBoltFormula('${r.rowId}')" style="padding: 4px 10px; font-size: 11px; font-weight: 700; background: #ffffff; color: #92400e; border: 1px solid #f59e0b; border-radius: 4px; cursor: pointer;">기본값</button>
                              <button type="button" onclick="toggleBoltFormulaEditor('${r.rowId}')" style="padding: 4px 10px; font-size: 11px; background: #ffffff; color: #64748b; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">닫기</button>
                            </div>
                            <div style="font-size: 10px; color: #92400e; margin-top: 6px;">${BOLT_FORMULA_VAR_HINT}</div>
                          </td>
                        </tr>
                      ` : '';
                      return `
                        <tr style="border-bottom: 1px solid #e2e8f0; background: ${r.isCustom ? '#f0fdf4' : (i % 2 === 0 ? '#ffffff' : '#f8fafc')};">
                          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; font-family: monospace; color: ${r.isCustom ? '#15803d' : '#1e293b'};">
                            ${r.item} ${r.isCustom ? '<span style="font-size:9px; background:#dcfce7; color:#166534; padding:1px 4px; border-radius:3px;">커스텀</span>' : ''}
                          </td>
                          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #334155;">
                            ${r.loc} ${!r.isCustom ? `<span style="color:#94a3b8;font-size:9.5px;">(${r.rowId})</span>` : ''}
                            ${!r.isCustom ? `
                              <button type="button" onclick="toggleBoltFormulaEditor('${r.rowId}')" title="산출 수식 편집 (수식 설정과 동일 엔진)" style="background: none; border: none; color: ${isExpanded ? '#0284c7' : '#94a3b8'}; cursor: pointer; padding: 2px 4px; font-size: 11px; vertical-align: middle;">
                                <i class="fa-solid fa-square-root-variable"></i>
                              </button>
                              ${isFormulaModified ? '<span style="font-size:9px; background:#fef3c7; color:#92400e; padding:1px 4px; border-radius:3px;">수식변경</span>' : ''}
                            ` : ''}
                          </td>
                          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${r.qty}</td>
                          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7;">${r.qty}</td>
                          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: 600;">+${r.add}</td>
                          ${materialOptions.map(m => `
                            <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-size: 10px; color: #475569;">
                              ${row ? resolvePartNoForOption(row, m.value, overrides) : (r.isCustom ? r.item : '')}
                            </td>
                          `).join('')}
                          <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">
                            <button type="button" onclick="deleteBoltRow('${r.rowId}', ${r.isCustom})" title="이 항목 삭제" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; font-size: 13px;">
                              <i class="fa-solid fa-trash-can"></i>
                            </button>
                          </td>
                        </tr>
                        ${formulaRowHtml}
                      `;
                    }).join('')}
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right Side: SETTING Control Panel (30% Width) -->
        <div style="flex: 3; min-width: 380px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-sliders" style="color: #0284c7;"></i> SETTING (볼트 카탈로그 / 종류 결정)
            </h3>
            <div style="display: flex; gap: 6px;">
              <button type="button" onclick="resetBoltSettings()" class="btn btn-outline btn-sm" style="font-size: 11px; padding: 4px 8px;">초기화</button>
              <button type="button" onclick="saveBoltSettings()" class="btn btn-primary btn-sm" style="font-size: 11px; padding: 4px 10px; background: #0284c7; border: none; font-weight: 700;">💾 저장</button>
            </div>
          </div>

          <!-- Top Parameters -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display: block; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px;">Nos of Holes/M for Roof (1x1m)</label>
              <input type="number" value="${(rules && rules.holesPerM_Roof1x1) || 8}" disabled title="참고용 원본 Excel 값" style="width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box; background:#f1f5f9; color:#64748b;">
            </div>
            <div>
              <label style="display: block; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px;">Nos of Holes/M for Roof (0.5x1m)</label>
              <input type="number" value="${(rules && rules.holesPerM_Roof05x1) || 4}" disabled title="참고용 원본 Excel 값" style="width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box; background:#f1f5f9; color:#64748b;">
            </div>
          </div>

          <!-- Setting Matrix Table -->
          <div style="overflow-y: auto; max-height: 600px; border: 1px solid #cbd5e1; border-radius: 8px;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; position: sticky; top: 0; border-bottom: 2px solid #cbd5e1; z-index: 2;">
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1;">Location Description</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 45px; text-align: center;">DIA-M</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 50px; text-align: center;">LEN(MM)</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 45px; text-align: center;">Washer</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 40px; text-align: center;">Nut</th>
                  <th style="padding: 6px; width: 85px; text-align: center;">BOLT NAME</th>
                </tr>
              </thead>
              <tbody>
                ${boltSettings.items.map((item, idx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 4px 6px; font-weight: 600; color: #334155; border-right: 1px solid #e2e8f0;" title="${item.location}">${item.location}</td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.dia}" onchange="updateBoltSettingField(${idx}, 'dia', this.value)" style="width: 38px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.length}" onchange="updateBoltSettingField(${idx}, 'length', this.value)" style="width: 42px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.washer}" onchange="updateBoltSettingField(${idx}, 'washer', this.value)" style="width: 36px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.nut}" onchange="updateBoltSettingField(${idx}, 'nut', this.value)" style="width: 34px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center;">
                      <input type="text" value="${item.boltName}" onchange="updateBoltSettingField(${idx}, 'boltName', this.value)" style="width: 80px; padding: 2px 4px; font-size: 10px; font-family: monospace; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 8px; line-height: 1.5;">
            <i class="fa-solid fa-circle-info"></i> BOLT NAME만 실제 계산(BOM/COST/WEIGHT)에 영향을 줍니다.
          </div>

        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  window.exportBoltAuditToExcel = function () {
    const dim = getTankDimensions();
    const rules = boltRules();
    const rowsById = {};
    if (rules) rules.rows.forEach((r) => { rowsById[r.id] = r; });
    const overrides = window.getBoltCatalogOverrides();
    const materialOptions = (rules && rules.materialOptions) || [];
    const data = computeBoltAuditData(dim);

    let csvContent = `Size: ${dim.length}m(L) x ${dim.width}m(W) x ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M3\n`;
    csvContent += `SECTION,PART NAME,Assemble Location,INITIAL Qty,Applied Qty,Add (+),${materialOptions.map(m => m.label).join(',')}\n`;

    data.forEach(r => {
      const row = rowsById[r.rowId];
      const matCols = materialOptions.map(m => row ? resolvePartNoForOption(row, m.value, overrides) : (r.isCustom ? r.item : '')).map(v => `"${v}"`).join(',');
      csvContent += `"${r.group}","${r.item}","${r.loc}",${r.qty},${r.qty},${r.add},${matCols}\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bolt_Calculation_Audit_${dim.length}x${dim.width}x${dim.height}m.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  window.renderBoltAuditView = renderBoltAuditView;
  window.saveBoltSettings = saveBoltSettings;
  window.resetBoltSettings = resetBoltSettings;

  document.addEventListener('DOMContentLoaded', () => {
    loadSavedBoltSettings();
    setTimeout(renderBoltAuditView, 300);

    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-bolt-recipes"]');
    if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(renderBoltAuditView, 0));

    ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight', 'numPartition', 'reinfMethod', 'boltMaterial'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', renderBoltAuditView);
        el.addEventListener('change', renderBoltAuditView);
      }
    });
  });
})();
