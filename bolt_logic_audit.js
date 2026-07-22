/**
 * Bolt Logic Setting & Calculation Audit Sheet Module
 * Water Tank BOM System - Bolt Calculation Sheet & Setting Replication
 *
 * This panel is a live view onto the SAME verified engine the real BOM uses
 * (AccessoriesEngine.boltsAndNutsParts / accessories_rules.js boltsAndNuts --
 * an exact re-derivation of the original workbook's BoltnNuts!AN5:AZ75), not
 * a separate approximation:
 *   - The left "Calculation Audit Sheet" table renders one row per real
 *     BoltnNuts!AP<n> assembly location, using the current tank dimensions
 *     read straight from the BASIC_TOOL inputs.
 *   - The right "SETTING" panel is the BoltnNuts!BC5:BG75 catalog (one row
 *     per lib id), and its BOLT NAME field is a genuine override: saving it
 *     changes accessories_rules.js's libraryNames[libId] resolution for
 *     every AP<n> row that references it, which flows straight into
 *     app.js generateDefaultBOMFromConfig() -> the real BOM/Cost/Weight
 *     printouts (see getBoltCatalogOverrides() below, and app.js's call to
 *     AccessoriesEngine.boltsAndNutsParts(..., catalogOverrides)).
 *   dia/length/washer/nut are reference-only (exactly like BoltnNuts!BC:BF
 *     in the original sheet: the per-bolt washer/nut counts are already
 *     baked into each AP<n> formula as literal numbers, not read back out of
 *     this table) -- only BOLT NAME actually drives part selection.
 */
(function () {
  function boltRules() {
    return (typeof AccessoriesRules !== 'undefined' && AccessoriesRules.boltsAndNuts) ? AccessoriesRules.boltsAndNuts : null;
  }

  // For each lib id in the catalog, collect the (deduplicated) location
  // labels of every AP<n> row that resolves to it -- straight from
  // accessories_rules.js boltsAndNuts.rows, so this can never drift out of
  // sync with the real engine.
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

  // Merge any saved BOLT NAME (and dia/length/washer/nut, display-only)
  // edits on top of a freshly-rebuilt real catalog -- so if
  // accessories_rules.js's catalog ever changes, this panel always shows
  // every current real lib id, with past edits still applied by id.
  function loadSavedBoltSettings() {
    boltSettings = { items: buildDefaultItems() };
    const saved = localStorage.getItem('water_tank_bolt_logic_settings');
    if (!saved) return;
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

  function saveBoltSettings() {
    localStorage.setItem('water_tank_bolt_logic_settings', JSON.stringify(boltSettings));
    renderBoltAuditView();
    alert('볼트 로직 SETTING이 저장되었습니다. BOLT NAME 변경 사항은 실제 BOM/COST/WEIGHT 산출 결과에도 바로 반영됩니다.');
  }

  function resetBoltSettings() {
    if (confirm('볼트 로직 SETTING을 초기 기본값(원본 Excel BoltnNuts 카탈로그)으로 복원하시겠습니까?')) {
      localStorage.removeItem('water_tank_bolt_logic_settings');
      boltSettings = { items: buildDefaultItems() };
      renderBoltAuditView();
    }
  }

  // Derive a catalog entry's BOLT NAME from its DIA-M/LEN(MM), following the
  // same naming convention as the real BoltnNuts catalog:
  //   - Bolts (WBT-...): "WBT-" + dia + length, keeping any trailing letter
  //     suffix the current name already has (e.g. the "P" pin-type marker in
  //     WBT-1058P / WBT-1460P / WBT-14130P).
  //   - Nuts/Washers (WNT-.../WFW-...): these are named "M<dia>" with no
  //     length component (length is always 0 for them, same as the original
  //     sheet), so only DIA-M affects their name.
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

  // Inline HTML "onchange" attribute handlers run against the global scope,
  // not this IIFE's closure, so they can't reach the local `boltSettings`
  // variable directly (referencing it there throws "boltSettings is not
  // defined" and silently no-ops the edit) -- route every SETTING panel edit
  // through this exposed global instead.
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

  // Overrides built from whatever is currently in memory (including
  // not-yet-saved edits) -- used for this panel's own live preview so typing
  // in the SETTING table updates the audit columns immediately.
  function currentOverrides() {
    const overrides = {};
    boltSettings.items.forEach((it) => {
      if (it.boltName) overrides[it.id] = it.boltName;
    });
    return overrides;
  }

  // Real BOM name overrides, keyed by lib id -- consumed by
  // app.js generateDefaultBOMFromConfig() via AccessoriesEngine.boltsAndNutsParts's
  // "catalogOverrides" param. Reloads from the last SAVED state (not any
  // in-progress unsaved edit in this panel), matching the explicit
  // Save-to-apply contract the SETTING panel's 저장 button implies.
  window.getBoltCatalogOverrides = function () {
    loadSavedBoltSettings();
    return currentOverrides();
  };

  function numFromInput(id, fallback) {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? fallback : v;
  }

  // Real current tank geometry -- read straight from the BASIC_TOOL inputs
  // (same fields app.js's generateDefaultBOMFromConfig() reads), so this
  // audit sheet always reflects what the rest of the app is actually
  // configured to build, not a fixed placeholder scenario.
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

  // Resolve the real part number a given AP<n> row would use under a
  // specific material option (1-6), applying the same catalogOverrides
  // logic as accessories_engine.js boltsAndNutsParts() -- used only to
  // render the 6 material-option preview columns; the actual BOM always
  // goes through the real engine directly.
  function resolvePartNoForOption(row, optValue, overrides) {
    if (row.literal) {
      const ov = overrides && overrides[row.id];
      return (ov && String(ov).trim()) || row.literal;
    }
    const libId = (row.libByOption && row.libByOption[optValue]) || row.lib;
    if (!libId || !row.suffix) return '';
    const ov = overrides && overrides[libId];
    const rules = boltRules();
    const base = (ov && String(ov).trim()) || (rules && rules.libraryNames[libId]) || '';
    return base + row.suffix[optValue - 1];
  }

  // Live per-assembly-location breakdown for the current tank -- this calls
  // the SAME verified engine app.js uses for the real BOM (see the file
  // header comment), so the totals shown here are the real totals, not an
  // independent approximation.
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

    return detail.map((d) => ({
      rowId: d.id,
      group: d.section || 'OTHER',
      item: d.partNo || '-',
      loc: d.label || d.id,
      qty: Math.round(d.value),
      add: Math.ceil(d.value * 0.05)
    }));
  }

  function renderBoltAuditView() {
    const container = document.getElementById('boltLogicAuditContainer');
    if (!container) return;

    // NOTE: does NOT reload from localStorage here -- this renders whatever
    // is currently in memory (including not-yet-saved SETTING edits), so
    // editing a field or resizing the tank doesn't wipe an in-progress edit.
    // loadSavedBoltSettings() is only called on initial load and on reset.
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
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                <i class="fa-solid fa-circle-info"></i> BASIC_TOOL 탭의 실제 치수/보강방식/볼트사양 설정값을 그대로 사용해 실제 BOM과 동일한 엔진(AccessoriesEngine.boltsAndNutsParts)으로 계산됩니다.
              </div>
            </div>
            <button type="button" onclick="exportBoltAuditToExcel()" class="btn btn-outline btn-sm" style="border-color: #10b981; color: #10b981; display: flex; align-items: center; gap: 6px; font-weight: 700;">
              <i class="fa-solid fa-file-excel"></i> 검산표 엑셀 다운로드
            </button>
          </div>

          <div style="overflow-x: auto;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px; border: 1px solid #cbd5e1; width: 100px;">PART NAME</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Bolt Assemble Location</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 60px;">INITIAL</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 50px;">Qty</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 65px;">Add (+)</th>
                  ${materialOptions.map(m => `<th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 10px; background: #e2e8f0; width: 110px;">${m.label}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${auditRows.map((r, i) => {
                  const isHeaderRow = i === 0 || auditRows[i - 1].group !== r.group;
                  const row = rowsById[r.rowId];
                  return `
                    ${isHeaderRow ? `
                      <tr style="background: #e0f2fe; font-weight: 700; color: #0369a1;">
                        <td colspan="11" style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 11.5px;">
                          ■ ${r.group} SECTION
                        </td>
                      </tr>
                    ` : ''}
                    <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; font-family: monospace; color: #1e293b;">${r.item}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #334155;">${r.loc}<span style="color:#94a3b8;font-size:9.5px;"> (${r.rowId})</span></td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${r.qty}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7;">${r.qty}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: 600;">+${r.add}</td>
                      ${materialOptions.map(m => `
                        <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-size: 10px; color: #475569;">
                          ${row ? resolvePartNoForOption(row, m.value, overrides) : ''}
                        </td>
                      `).join('')}
                    </tr>
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

          <!-- Top Parameters (reference only -- see accessories_rules.js comment: not wired into any formula, exactly like the original workbook's BC3/BF3 cells) -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display: block; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px;">Nos of Holes/M for Roof (1x1m)</label>
              <input type="number" value="${(rules && rules.holesPerM_Roof1x1) || 8}" disabled title="참고용 원본 Excel 값 - 실제 수식에는 직접 반영되지 않습니다 (원본 워크북과 동일)" style="width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box; background:#f1f5f9; color:#64748b;">
            </div>
            <div>
              <label style="display: block; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px;">Nos of Holes/M for Roof (0.5x1m)</label>
              <input type="number" value="${(rules && rules.holesPerM_Roof05x1) || 4}" disabled title="참고용 원본 Excel 값 - 실제 수식에는 직접 반영되지 않습니다 (원본 워크북과 동일)" style="width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box; background:#f1f5f9; color:#64748b;">
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
                      <input type="text" value="${item.boltName}" onchange="updateBoltSettingField(${idx}, 'boltName', this.value)" title="이 부품(Lib #${item.id})명을 바꾸면 저장 시 실제 BOM 계산에 반영됩니다." style="width: 80px; padding: 2px 4px; font-size: 10px; font-family: monospace; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 8px; line-height: 1.5;">
            <i class="fa-solid fa-circle-info"></i> BOLT NAME만 실제 계산(BOM/COST/WEIGHT)에 영향을 줍니다. DIA-M/LEN/Washer/Nut는 원본 Excel BoltnNuts!BC:BG와 동일한 참고 정보이며, 각 조립 위치별 실제 수량 배수는 이미 산출 수식에 반영되어 있습니다.
          </div>

        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // Export audit table to Excel CSV
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
      const matCols = materialOptions.map(m => row ? resolvePartNoForOption(row, m.value, overrides) : '').map(v => `"${v}"`).join(',');
      csvContent += `"${r.group}","${r.item}","${r.loc}",${r.qty},${r.qty},${r.add},${matCols}\n`;
    });

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bolt_Calculation_Audit_${dim.length}x${dim.width}x${dim.height}m.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Expose global methods
  window.renderBoltAuditView = renderBoltAuditView;
  window.saveBoltSettings = saveBoltSettings;
  window.resetBoltSettings = resetBoltSettings;

  // Auto-render on load, then keep it live: re-render whenever the user
  // switches into this tab, or edits any of the real dimension/material
  // inputs it depends on.
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
