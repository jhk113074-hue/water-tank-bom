/**
 * Internal Tie-Rod Verification & Adjustment Sheet ("TIE-ROD INTERNAL 검증표")
 * Water Tank BOM System
 *
 * Integrated verification sheet for INT_TIE_ROD layer, matrix, and formula editor.
 * Features Customer Spec Mapping header bar & Preset Management (YSACC Spec, MNT Spec, WATANI Spec, Custom Specs).
 */
(function () {
  const PRESET_STORAGE_KEY = 'water_tank_tierod_internal_customer_presets_v4';
  const ACTIVE_BOM_KEY = 'water_tank_tierod_internal_active_bom_spec_v4';

  const defaultFactors = [0, 1, 1, 2, 3, 4, 5, 6, 7, 7];

  const defaultPresets = {
    ysacc: {
      id: 'ysacc',
      name: 'YSACC Spec',
      factors: [0, 1, 1, 2, 3, 4, 5, 6, 7, 7]
    },
    mnt: {
      id: 'mnt',
      name: 'MNT Spec',
      factors: [0, 1, 1, 2, 3, 4, 5, 6, 7, 7]
    },
    watani: {
      id: 'watani',
      name: 'WATANI Spec',
      factors: [0, 1, 1, 2, 3, 4, 5, 6, 7, 7]
    },
    almuftah: {
      id: 'almuftah',
      name: 'ALMUFTAH Spec',
      factors: [0, 2, 2, 2, 4, 6, 8, 10, 12, 12]
    }
  };

  let customerPresets = null;
  let selectedPresetId = 'ysacc';
  let activeBOMPresetId = 'ysacc';

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

  function loadCustomerPresets() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(PRESET_STORAGE_KEY) : null;
      if (raw) customerPresets = JSON.parse(raw);
    } catch (e) {
      console.error('[TieRodInternalAudit] Presets load failed:', e);
    }
    if (!customerPresets || typeof customerPresets !== 'object' || !Object.keys(customerPresets).length) {
      customerPresets = JSON.parse(JSON.stringify(defaultPresets));
    }
    try {
      const rawBOM = window.localStorage ? window.localStorage.getItem(ACTIVE_BOM_KEY) : null;
      if (rawBOM) {
        const parsed = JSON.parse(rawBOM);
        if (parsed.presetId) {
          activeBOMPresetId = parsed.presetId;
        }
      }
    } catch (e) {}
  }

  function saveCustomerPresets() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(customerPresets));
        window.localStorage.setItem(ACTIVE_BOM_KEY, JSON.stringify({ presetId: activeBOMPresetId }));
      }
    } catch (e) {
      console.error('[TieRodInternalAudit] Presets save failed:', e);
    }
  }

  function applyFactorsToRules(factors) {
    const rules = getRules();
    if (!rules || !Array.isArray(factors)) return;
    rules.layerFactorTable.forEach((row, i) => {
      if (typeof factors[i] === 'number' && isFinite(factors[i])) row.factor = factors[i];
    });
  }

  function applyPresetToEngine(presetId) {
    const preset = customerPresets[presetId] || customerPresets['ysacc'];
    const factors = (preset && Array.isArray(preset.factors)) ? preset.factors : defaultFactors;
    applyFactorsToRules(factors);
  }

  loadCustomerPresets();
  applyPresetToEngine(activeBOMPresetId);

  function layerRowLabel(row, prevMaxH) {
    if (row.maxH === undefined) return `H > ${prevMaxH}m`;
    if (prevMaxH === undefined) return `H ≤ ${row.maxH}m`;
    return `${prevMaxH}m < H ≤ ${row.maxH}m`;
  }

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

  function activeLayerIndex(rules, H) {
    for (let i = 0; i < rules.layerFactorTable.length; i++) {
      const r = rules.layerFactorTable[i];
      if (r.maxH === undefined || H <= r.maxH) return i;
    }
    return -1;
  }

  function renderLayerTable(dim) {
    const rules = getRules();
    if (!rules) return '<p style="color:#94a3b8;">Unable to load AccessoriesRules.tieRodInternal.</p>';
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
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; background: #f1f5f9;">Tank Height (H)</th>
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
    if (!rules || typeof AccessoriesEngine === 'undefined') return '<p style="color:#94a3b8;">Calculation N/A</p>';

    const isAlmuftah = selectedPresetId === 'almuftah';
    const catalogLengths = isAlmuftah
      ? [1000, 1500, 2000, 3000, 4000, 1220, 1720, 2220, 2720, 3220, 3720, 4220, 4720, 5220]
      : rules.catalogLengthsMm;

    const axisMap = currentDimAxisMap(dim);
    const dimValues = Object.keys(axisMap).map(Number);
    const maxDim = Math.max(100.0, ...(dimValues.length ? dimValues : [0]));
    const dims = buildLengthMatrixRows(maxDim);

    const headerHtml = catalogLengths.map((len) => `<th style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; min-width: 42px;">${len}</th>`).join('');

    const rowsHtml = dims.map((dimVal) => {
      const axisLabel = axisMap[dimVal];
      const isPartitionSeg = axisLabel && (axisLabel.includes('L2') || axisLabel.includes('L3') || axisLabel.includes('L4'));
      const { pieces } = AccessoriesEngine.tieRodInternalSegmentsFor(dimVal, isPartitionSeg, isAlmuftah);
      const counts = {};
      pieces.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
      const cells = catalogLengths.map((len) => {
        const c = counts[len] || 0;
        return `<td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; color: ${c ? '#0284c7' : '#cbd5e1'}; font-weight: ${c ? '700' : '400'};">${c || '-'}</td>`;
      }).join('');

      let reconstructedMm = 0;
      let expectedMm = Math.round(dimVal * 1000);
      let mismatch = false;

      if (isAlmuftah) {
        reconstructedMm = pieces.length ? pieces.reduce((s, p) => s + p, 0) - 220 : 0;
        mismatch = pieces.length > 0 && Math.abs(reconstructedMm - expectedMm) > 1;
      } else {
        const deduction = isPartitionSeg ? 220 : 120;
        reconstructedMm = pieces.length ? pieces.reduce((s, p) => s + p, 0) + deduction : 0;
        mismatch = pieces.length > 0 && reconstructedMm !== expectedMm;
      }

      const reconCell = `<td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: ${mismatch ? '#dc2626' : '#16a34a'}; background: ${mismatch ? '#fef2f2' : 'transparent'};">${pieces.length ? (isAlmuftah ? pieces.reduce((s, p) => s + p, 0) : reconstructedMm) : '-'}${mismatch ? ' ⚠' : ''}</td>`;

      let segLabelHtml = '';
      if (isAlmuftah) {
        segLabelHtml = axisLabel ? `<span style="color:#0284c7;">◀ ${escapeAttr(axisLabel)} (SPT Spec: +220mm)</span>` : '';
      } else {
        segLabelHtml = axisLabel ? `<span style="color:${isPartitionSeg ? '#be185d' : '#16a34a'};">◀ ${escapeAttr(axisLabel)} ${isPartitionSeg ? '(Partition: -220mm)' : '(-120mm)'}</span>` : '';
      }

      return `
        <tr style="background: ${axisLabel ? (isAlmuftah ? '#e0f2fe' : (isPartitionSeg ? '#fce7f3' : '#dcfce7')) : '#ffffff'};">
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; white-space: nowrap;">
            ${dimVal.toFixed(1)}m ${segLabelHtml}
          </td>
          ${cells}
          ${reconCell}
        </tr>
      `;
    }).join('');

    const preset = customerPresets[selectedPresetId] || customerPresets['ysacc'];
    const infoBoxHtml = isAlmuftah ? `
      <div style="font-size: 11px; color: #1e3a8a; margin-bottom: 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; line-height: 1.5;">
        <div><i class="fa-solid fa-circle-info" style="color: #2563eb;"></i> <b>Internal Tie-Rod Logic ([ALMUFTAH Spec] - SPT BOM Nov 24th 2023_R4.xlsm)</b></div>
        <div>• <b>Outer &amp; Partition Walls</b>: Rod Length = <code>(Dim × 1000) + 220 mm</code> (M10 Tie-Rod Extension Spec)</div>
        <div>• <b>Hardware Parts</b>: <code>TR-10M...</code> (M10 Rods), <code>M10 NUT</code>, <code>M10 BW</code> (Bonded Washer), <code>RW</code> (Rubber Washer), <code>TC-10M40</code> (Coupler)</div>
        <div>• <b>Layer Factors</b>: 1.5m~2.5m = 2 layers, 3.0m = 4 layers, 3.5m = 6 layers, 4.0m = 8 layers, 4.5m = 10 layers, 5.0m = 12 layers</div>
      </div>
    ` : `
      <div style="font-size: 11px; color: #475569; margin-bottom: 8px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px 12px; line-height: 1.5;">
        <div><i class="fa-solid fa-circle-info" style="color: #0284c7;"></i> <b>Internal Tie-Rod Logic ([${escapeAttr(preset.name)}])</b></div>
        <div>• <b>Outer Walls (W, L1)</b>: Rod Length = <code>(Dim × 1000) - 120 mm</code> (Outer Wall bracket clearance)</div>
        <div>• <b>Partition Compartments (L2, L3, L4)</b>: Rod Length = <code>(Dim × 1000) - 220 mm</code> (Partition Bracket clearance)</div>
        <div>• <b>Partition Tie-Rod Addition</b>: When tank height <code>H > 2.0m</code>, adds <code>(H_F + H_C - 2) × N_PA</code> tie-rods for partition structure.</div>
      </div>
    `;

    return `
      ${infoBoxHtml}
      <div style="overflow-x: auto; max-height: 420px; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 11px; text-align: left; white-space: nowrap;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 1;">
              <th style="padding: 5px 8px; border: 1px solid #cbd5e1; position: sticky; left: 0; background: #f1f5f9; z-index: 2;">Dimension (m)</th>
              ${headerHtml}
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; min-width: 60px;">Total Rod Length (mm)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderValidationSummary(dim) {
    if (!dim || typeof AccessoriesEngine === 'undefined' || typeof PanelEngine === 'undefined') {
      return '<p style="color:#94a3b8;">Please enter tank dimensions first.</p>';
    }
    try {
      const g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
      const internalTieRodEl = document.getElementById('internalTieRod');
      const isSA4 = !internalTieRodEl || internalTieRodEl.value !== 'SS304';
      const isAlmuftah = selectedPresetId === 'almuftah';
      const { parts, detail, warnings } = AccessoriesEngine.tieRodInternalParts(g, isSA4, isAlmuftah);
      const totalPieces = (parts || []).reduce((s, p) => s + p.qty, 0);
      const activeRows = (detail || []).filter((d) => d.value > 0);
      const preset = customerPresets[selectedPresetId] || customerPresets['ysacc'];

      let statusBanner = '';
      if (!warnings || warnings.length === 0) {
        statusBanner = `
          <div style="background: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #166534; margin-bottom: 14px;">
            <i class="fa-solid fa-circle-check"></i> <b>Audit Passed [${escapeAttr(preset.name)}]</b> -- All lengths and nut/washer counts match independent calculations. (Current tank: ${totalPieces} total rods, ${activeRows.length} part types)
          </div>
        `;
      } else {
        statusBanner = `
          <div style="background: #fef2f2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #991b1b; margin-bottom: 14px;">
            <div style="font-weight: 700; margin-bottom: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> Audit Warning [${escapeAttr(preset.name)}] -- ${warnings.length} issues need review</div>
            ${warnings.map((w) => `<div style="margin-top: 2px;">・ ${escapeAttr(w)}</div>`).join('')}
          </div>
        `;
      }

      let tableHtml = `
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 13.5px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-link" style="color: #0284c7;"></i> Internal Tie-Rod Live Formulas &amp; Audit Table ([${escapeAttr(preset.name)}]) ✏️
              <span style="font-size: 10.5px; font-weight: 600; color: #16a34a; background: #dcfce7; padding: 2px 6px; border-radius: 4px; border: 1px solid #bbf7d0;">Reflected in BOM (Material: ${isSA4 ? 'SS316 / SA4' : 'SS304 / SA2'})</span>
            </h4>
            <div style="display: flex; gap: 6px;">
              <button type="button" onclick="if (typeof RuleEditorUI !== 'undefined') RuleEditorUI.saveCategory('tierodInt');" style="background: #16a34a; color: #ffffff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Save Modified Formulas"><i class="fa-solid fa-floppy-disk"></i> Save Formulas</button>
              <button type="button" onclick="if (typeof RuleEditorUI !== 'undefined') RuleEditorUI.resetCategory('tierodInt');" style="background: #eab308; color: #ffffff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Reset to Default Formulas"><i class="fa-solid fa-rotate-left"></i> Reset to Default</button>
            </div>
          </div>
          <div class="table-wrapper" style="max-height: 380px; overflow-y: auto; overflow-x: auto; border: 2px solid #0284c7; border-radius: 8px; box-shadow: 0 4px 12px rgba(2,132,199,0.08);">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
              <thead>
                <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0; z-index: 10;">
                  <th style="padding: 8px; border: 1px solid #bae6fd; width: 180px; background: #e0f2fe; color: #0369a1; font-weight: 800;">Part No.</th>
                  <th style="padding: 8px; border: 1px solid #bae6fd; background: #e0f2fe; color: #0369a1; font-weight: 800;">Formula (Click to edit directly ✏️)</th>
                  <th style="padding: 8px; border: 1px solid #bae6fd; text-align: right; width: 80px; background: #e0f2fe; color: #0369a1; font-weight: 800;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${activeRows.length ? activeRows.map((r, i) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #0284c7;">${escapeAttr(r.partNo)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">
                      <textarea rows="1" onchange="if (typeof updateReinforcingFormulaInline === 'function') updateReinforcingFormulaInline('${r.id}', 'tierodInt', this.value)" onkeydown="if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.blur(); }" style="resize: both; min-width: 200px; width: 100%; height: 30px; min-height: 26px; padding: 4px 6px; font-size: 10.5px; font-family: monospace; border: 1.5px solid #38bdf8; border-radius: 6px; box-sizing: border-box; background: #ffffff; color: #0f172a; font-weight: 600; vertical-align: middle; white-space: pre-wrap; word-break: break-all; overflow: auto;">${escapeAttr(r.formula)}</textarea>
                    </td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #0284c7; font-size: 12px;">${r.value}</td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="padding:12px; text-align:center; color:#94a3b8; font-weight:700;">Tie-rods are not required for this tank size.</td></tr>'}
                <tr style="background:#e0f2fe; font-weight:800; border-top: 2px solid #0284c7;">
                  <td colspan="2" style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-size: 12px;">Internal Tie-Rod Total Quantity Sum ([${escapeAttr(preset.name)}])</td>
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
      return '<p style="color:#94a3b8;">Calculation unavailable (See console log)</p>';
    }
  }

  function updateUrlHash(updateUrl) {
    if (updateUrl === false) return;
    if (typeof window === 'undefined') return;
    const cleanHash = 'tierod-internal/' + (selectedPresetId || 'ysacc');
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + cleanHash);
    } else {
      window.location.hash = cleanHash;
    }
  }

  function selectPreset(presetId, updateUrl = true) {
    if (!customerPresets[presetId]) return;
    selectedPresetId = presetId;
    applyPresetToEngine(selectedPresetId);
    renderTieRodInternalAuditView();
    if (updateUrl) updateUrlHash(true);
  }

  window.TieRodInternalAudit = {
    selectPreset,
    applyToBOM,
    addSpec,
    renameSpec,
    copySpec,
    deleteSpec,
    resetSpec,
    exportExcel,
    importExcel,
    saveLayerFactors,
    getActiveBOMPresetId,
    updateUrlHash,
    render: renderTieRodInternalAuditView,
    get activePresetId() { return selectedPresetId; },
    get activeBOMPresetId() { return activeBOMPresetId; }
  };

  function applyToBOM() {
    activeBOMPresetId = selectedPresetId;
    saveCustomerPresets();
    applyPresetToEngine(activeBOMPresetId);
    if (typeof window.recalculateBOM === 'function') window.recalculateBOM();
    renderTieRodInternalAuditView();
    const preset = customerPresets[activeBOMPresetId];
    alert(`[${preset ? preset.name : ''}] Spec applied to BOM calculations.`);
  }

  function addSpec() {
    const name = prompt('Enter new Internal Tie-Rod Customer Spec name:', 'New Spec');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const newId = 'spec_' + Date.now();
    customerPresets[newId] = {
      id: newId,
      name: cleanName,
      factors: JSON.parse(JSON.stringify(customerPresets[selectedPresetId]?.factors || defaultFactors))
    };
    selectedPresetId = newId;
    saveCustomerPresets();
    applyPresetToEngine(selectedPresetId);
    renderTieRodInternalAuditView();
  }

  function renameSpec() {
    const preset = customerPresets[selectedPresetId];
    if (!preset) return;
    const name = prompt('Rename Customer Spec:', preset.name);
    if (!name || !name.trim()) return;
    preset.name = name.trim();
    saveCustomerPresets();
    renderTieRodInternalAuditView();
  }

  function copySpec() {
    const preset = customerPresets[selectedPresetId];
    if (!preset) return;
    const name = prompt('Enter duplicate Customer Spec name:', preset.name + ' (Copy)');
    if (!name || !name.trim()) return;
    const newId = 'spec_' + Date.now();
    customerPresets[newId] = {
      id: newId,
      name: name.trim(),
      factors: JSON.parse(JSON.stringify(preset.factors))
    };
    selectedPresetId = newId;
    saveCustomerPresets();
    applyPresetToEngine(selectedPresetId);
    renderTieRodInternalAuditView();
  }

  function deleteSpec() {
    const keys = Object.keys(customerPresets);
    if (keys.length <= 1) {
      alert('At least 1 Customer Spec Preset must be maintained.');
      return;
    }
    const preset = customerPresets[selectedPresetId];
    if (!confirm(`Are you sure you want to delete [${preset ? preset.name : ''}] Spec?`)) return;
    delete customerPresets[selectedPresetId];
    selectedPresetId = Object.keys(customerPresets)[0];
    if (activeBOMPresetId === selectedPresetId) {
      activeBOMPresetId = selectedPresetId;
    }
    saveCustomerPresets();
    applyPresetToEngine(selectedPresetId);
    renderTieRodInternalAuditView();
  }

  function resetSpec() {
    const preset = customerPresets[selectedPresetId];
    if (!preset) return;
    if (!confirm(`Reset Nos of Tie-rod settings for [${preset.name}]?`)) return;
    preset.factors = [...defaultFactors];
    saveCustomerPresets();
    applyPresetToEngine(selectedPresetId);
    renderTieRodInternalAuditView();
  }

  function exportExcel() {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(customerPresets, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `Internal_TieRod_Spec_Mapping_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      alert('Error during export: ' + e.message);
    }
  }

  function importExcel(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported && typeof imported === 'object') {
          customerPresets = imported;
          selectedPresetId = Object.keys(customerPresets)[0] || 'ysacc';
          saveCustomerPresets();
          applyPresetToEngine(selectedPresetId);
          renderTieRodInternalAuditView();
          alert('Internal Tie-Rod Customer Spec Mapping imported successfully.');
        }
      } catch (err) {
        alert('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function renderTieRodInternalAuditView() {
    const container = document.getElementById('tieRodInternalAuditContainer');
    if (!container) return;
    const dim = getTankDimSafe();

    const activePreset = customerPresets[selectedPresetId] || customerPresets['ysacc'];
    const activeBOMPreset = customerPresets[activeBOMPresetId] || customerPresets['ysacc'];

    container.innerHTML = `
      <!-- Top Navigation: Quick Switch between Internal and External Tie-Rod -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px;">
        <button type="button" style="padding: 8px 16px; border-radius: 6px; font-weight: 800; font-size: 12.5px; border: 1.5px solid #16a34a; background: #16a34a; color: #ffffff; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(22,163,74,0.25);">
          <i class="fa-solid fa-ruler-combined"></i> 🔒 Internal Tie-Rod (Internal tie-rod validation & settings)
        </button>
        <button type="button" onclick="const btn = document.querySelector('.tab-btn[data-tab=\\'tab-tierod-external-audit\\']'); if (btn) btn.click();" style="padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 12.5px; border: 1px solid #cbd5e1; background: #f8fafc; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-link" style="color: #0284c7;"></i> 🌐 External Tie-Rod (External tie-rod validation & settings)
        </button>
      </div>

      <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px;">
        <!-- Header Bar Matching Panel Config Customer Spec Mapping -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px;">
          <div>
            <h4 style="margin: 0; font-size: 15px; color: #0284c7; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 800;">
              <i class="fa-solid fa-table-cells"></i>
              <span>Internal Tie-Rod Spec Mapping</span>
              <span style="font-size: 11px; font-weight: bold; color: #15803d; background: #dcfce7; padding: 3px 10px; border-radius: 12px; border: 1px solid #bbf7d0; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-circle-check"></i> Active BOM Spec: [${escapeAttr(activeBOMPreset.name)}]
              </span>
            </h4>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4;">
              * Internal Tie-rod layer factors (1H ~ 5H) and formula mapping per customer specification.
              <span style="font-weight: bold; color: #0284c7; margin-left: 5px;">(Currently viewing [${escapeAttr(activePreset.name)}])</span>
            </div>
          </div>

          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button type="button" onclick="TieRodInternalAudit.applyToBOM()" style="height: 32px; padding: 0 12px; font-size: 11.5px; font-weight: 700; background: #16a34a; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <i class="fa-solid fa-circle-check"></i> Apply to BOM
            </button>
            <button type="button" onclick="TieRodInternalAudit.addSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
              <i class="fa-solid fa-plus"></i> Add Spec
            </button>
            <button type="button" onclick="TieRodInternalAudit.renameSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
              <i class="fa-solid fa-pen"></i> Rename Spec
            </button>
            <button type="button" onclick="TieRodInternalAudit.copySpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
              <i class="fa-solid fa-copy"></i> Copy Spec
            </button>
            <button type="button" onclick="TieRodInternalAudit.deleteSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; color: #dc2626; border: 1px solid #fca5a5; background: #ffffff; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
            <button type="button" onclick="TieRodInternalAudit.exportExcel()" style="height: 32px; padding: 0 10px; font-size: 11.5px; border: 1px solid #10b981; color: #059669; display: flex; align-items: center; gap: 5px; font-weight: 700; background: #ffffff; cursor: pointer;">
              <i class="fa-solid fa-file-excel"></i> Export JSON
            </button>
            <label for="tieRodExcelFileInput" style="height: 32px; padding: 0 10px; font-size: 11.5px; border: 1px solid #2563eb; color: #2563eb; display: flex; align-items: center; gap: 5px; font-weight: 700; background: #ffffff; cursor: pointer; border-radius: 6px; margin: 0;">
              <i class="fa-solid fa-file-import"></i> Import JSON
            </label>
            <input type="file" id="tieRodExcelFileInput" accept=".json, .xlsx, .xls" onchange="TieRodInternalAudit.importExcel(event)" style="display: none;">
            <button type="button" onclick="TieRodInternalAudit.resetSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; border: 1px solid #f43f5e; color: #e11d48; display: flex; align-items: center; gap: 5px; background: #ffffff; border-radius: 6px; cursor: pointer;">Reset</button>
          </div>
        </div>

        <!-- Step 1: Select Customer Spec Preset -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-building"></i>
            <span>Step 1: Select Customer Spec Preset</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; overflow-x: auto; padding-bottom: 4px; flex-wrap: wrap;">
            ${Object.keys(customerPresets).map((presetKey) => {
              const p = customerPresets[presetKey];
              const isSelected = selectedPresetId === presetKey;
              const isBOM = activeBOMPresetId === presetKey;
              return `
                <button type="button" onclick="TieRodInternalAudit.selectPreset('${presetKey}')" style="padding: 8px 16px; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; border: ${isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1'}; background: ${isSelected ? '#0284c7' : '#ffffff'}; color: ${isSelected ? '#ffffff' : '#334155'}; box-shadow: ${isSelected ? '0 2px 6px rgba(2,132,199,0.2)' : 'none'};">
                  <span>${escapeAttr(p.name)}</span>
                  ${isBOM ? `<span style="font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 4px; background: ${isSelected ? '#ffffff' : '#16a34a'}; color: ${isSelected ? '#16a34a' : '#ffffff'};">Active BOM</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div id="tieRodInternalValidationSummary" style="margin-bottom: 20px;">${renderValidationSummary(dim)}</div>

        <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start;">
          <div style="flex: 0 0 auto;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">
              <i class="fa-solid fa-layer-group" style="color: #16a34a;"></i> layer (Nos of Tie-rod) -- Editable ([${escapeAttr(activePreset.name)}])
            </h4>
            <div id="tieRodInternalLayerTable">${renderLayerTable(dim)}</div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button type="button" onclick="TieRodInternalAudit.saveLayerFactors()" style="background: #16a34a; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;" title="Save Spec Layer Factors"><i class="fa-solid fa-floppy-disk"></i> Save Spec</button>
              <button type="button" onclick="TieRodInternalAudit.resetSpec()" style="background: #eab308; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;" title="Reset Spec to Default"><i class="fa-solid fa-rotate-left"></i> Reset Spec</button>
            </div>
          </div>

          <div style="flex: 1 1 480px; min-width: 0;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">
              <i class="fa-solid fa-table-cells" style="color: #0284c7;"></i> Tie-rod Length Matrix -- Verification (Read-Only)
            </h4>
            <div style="font-size: 10.5px; color: #94a3b8; margin-bottom: 6px;">
              <i class="fa-solid fa-circle-info"></i> Green row = row matching current tank dimensions (W/L1~L4). Cell value = piece count by catalog spec.
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
      alert('Nos of Tie-rod value must be a number greater than or equal to 0.');
      return;
    }
    if (customerPresets[selectedPresetId]) {
      customerPresets[selectedPresetId].factors = factors;
      saveCustomerPresets();
    }
    applyFactorsToRules(factors);
    renderTieRodInternalAuditView();
    alert(`[${customerPresets[selectedPresetId].name}] settings saved successfully.`);
  }

  function getActiveBOMPresetId() {
    try {
      const rawBOM = window.localStorage ? window.localStorage.getItem(ACTIVE_BOM_KEY) : null;
      if (rawBOM) {
        const parsed = JSON.parse(rawBOM);
        if (parsed.presetId) return parsed.presetId;
      }
    } catch (e) {}
    return activeBOMPresetId || 'ysacc';
  }

  window.renderTieRodInternalAuditView = renderTieRodInternalAuditView;

  if (typeof document !== 'undefined') {
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
  }
})();
