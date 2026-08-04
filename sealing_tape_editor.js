/**
 * sealing_tape_editor.js - Sealing Tape Master Settings & Part Number (SKU) Matrix Manager
 * Provides a dedicated SYSTEM SETTINGS manager for Sealing Tape unit lengths,
 * SKU mappings, and formulas across all Part Numbers (Panels & Steel Accessories).
 */

(function (global) {
  "use strict";

  const STORAGE_KEY = 'YSACC_SEALING_TAPE_MASTER_V1';

  // Default Master Configuration mapped by Part Number (품번) and Catalog Key
  const DEFAULT_MASTER_CONFIG = {
    mainTapeSku: 'WST-P0050RO',
    mainTapeName: 'PVC SEALANT 3mm (30M/Roll)',
    rollLengthMeters: 30,
    cornerTapeSku: 'WST-P0120M',
    cornerTapeName: 'CORNER ANGLE PVC SEALANT 1M',

    roles: {
      // Panels (Mapped by Catalog Key & Vendor Part No)
      "roof_bottom.manhole":       { partNo: "MF00TX", unit: 2.1, SKU: "WST-P0050RO", label: "Roof Manhole (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.roof_full":     { partNo: "RF00TX", unit: 2.1, SKU: "WST-P0050RO", label: "Roof Full (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.roof_half":     { partNo: "NH10TX", unit: 1.6, SKU: "WST-P0050RO", label: "Roof Half (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.roof_quarter":  { partNo: "NQ10TX", unit: 0.6, SKU: "WST-P0050RO", label: "Roof Quarter (0.5x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.base_full":     { partNo: "BF10BX", unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Full (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.base_par":      { partNo: "BF10BP", unit: 5.1, SKU: "WST-P0050RO", label: "Bottom Par (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.hbase":         { partNo: "NH10BX", unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Half (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.hbase_short":   { partNo: "NH10BPS", unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Half Short (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.hbase_long":    { partNo: "NH10BPL", unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Half Long (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.qbase":         { partNo: "NQ10BX", unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Quarter (0.5x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.drain":         { partNo: "NF10BX", unit: 4.1, SKU: "WST-P0050RO", label: "Drain Panel (1x1m)", category: "Roof & Bottom" },

      "side.TOP_15.side":          { partNo: "SF10SX", unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Full", category: "Side Panels" },
      "side.TOP_15.side_parLT":    { partNo: "SF10SL", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Par-LT", category: "Side Panels" },
      "side.TOP_15.side_parRT":    { partNo: "SF10SR", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Par-RT", category: "Side Panels" },
      "side.TOP_15.hside":         { partNo: "NH10SX", unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Half", category: "Side Panels" },

      "side.TOP_20.side":          { partNo: "ST20HX", unit: 5.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Full", category: "Side Panels" },
      "side.TOP_20.side_parLT":    { partNo: "ST20HL", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Par-LT", category: "Side Panels" },
      "side.TOP_20.side_parRT":    { partNo: "ST20HR", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Par-RT", category: "Side Panels" },

      "side.MID_TOP.side":         { partNo: "SF30MX", unit: 4.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Full", category: "Side Panels" },
      "side.MID_LOWER.side":       { partNo: "SF40LX", unit: 4.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Full", category: "Side Panels" },
      "side.LOWER.side":           { partNo: "SF50LX", unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Full", category: "Side Panels" },

      "partition.TOP_15.partition":{ partNo: "PF10HU15", unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Full", category: "Partitions" },
      "partition.TOP_20.partition":{ partNo: "PF20HU20", unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Full", category: "Partitions" },
      "partition.LOWER.partition": { partNo: "PF10HU10", unit: 4.1, SKU: "WST-P0050RO", label: "Partition LOWER 1.0mH Full", category: "Partitions" },

      // Steel Accessories Items (Mapped by Part Number SKU)
      "corner_angle_10":           { partNo: "WCA-1000Z", unit: 1.0, SKU: "WST-P0120M", label: "Corner Angle 1.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_15":           { partNo: "WCA-1500Z", unit: 1.5, SKU: "WST-P0120M", label: "Corner Angle 1.5mH (HDG)", category: "Steel Accessories" },
      "corner_angle_20":           { partNo: "WCA-2000Z", unit: 2.0, SKU: "WST-P0120M", label: "Corner Angle 2.0mH (HDG)", category: "Steel Accessories" },
      "base_angle_10":             { partNo: "WBA-1010A", unit: 1.0, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 1.0m", category: "Steel Accessories" },
      "base_angle_15":             { partNo: "WBA-1510A", unit: 1.5, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 1.5m", category: "Steel Accessories" }
    }
  };

  let masterConfig = null;
  let activeCategoryFilter = 'ALL';

  function loadSealingTapeMaster() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        masterConfig = {
          mainTapeSku: parsed.mainTapeSku || DEFAULT_MASTER_CONFIG.mainTapeSku,
          mainTapeName: parsed.mainTapeName || DEFAULT_MASTER_CONFIG.mainTapeName,
          rollLengthMeters: parsed.rollLengthMeters || DEFAULT_MASTER_CONFIG.rollLengthMeters,
          cornerTapeSku: parsed.cornerTapeSku || DEFAULT_MASTER_CONFIG.cornerTapeSku,
          cornerTapeName: parsed.cornerTapeName || DEFAULT_MASTER_CONFIG.cornerTapeName,
          roles: Object.assign({}, DEFAULT_MASTER_CONFIG.roles, parsed.roles || {})
        };
      } else {
        masterConfig = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG));
      }
    } catch (e) {
      masterConfig = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG));
    }
    if (masterConfig && masterConfig.roles && masterConfig.roles["corner_angle_general"]) {
      delete masterConfig.roles["corner_angle_general"];
    }
    return masterConfig;
  }

  function saveSealingTapeMaster(refreshModal = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(masterConfig));
    } catch (e) {
      console.error("Failed to save Sealing Tape Master config:", e);
    }
    if (typeof window.generateDefaultBOM === 'function') {
      window.generateDefaultBOM();
    } else if (typeof window.renderBOM === 'function') {
      window.renderBOM();
    }
    if (typeof window.renderCOST === 'function') window.renderCOST();
    if (typeof window.renderWEIGHT === 'function') window.renderWEIGHT();
    if (typeof window.calculateWidgets === 'function') window.calculateWidgets();
    if (typeof window.renderAll === 'function') window.renderAll();
    if (typeof window.renderReinforcingAuditView === 'function') window.renderReinforcingAuditView();
    if (typeof window.updatePrintoutSheet === 'function') window.updatePrintoutSheet();

    if (refreshModal) {
      const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
      if (container) {
        renderSealingTapeManagerUI(container.id);
      }
    }
  }

  // Lookup unit meter by Part Number (품번) or Catalog Key
  function getPartNoUnitMeter(partNo, catalogKey) {
    if (!masterConfig) loadSealingTapeMaster();
    const roles = masterConfig.roles;

    // 1. Search by exact Part Number match first
    if (partNo) {
      for (const key in roles) {
        if (roles[key] && roles[key].partNo === partNo && roles[key].unit !== undefined) {
          return roles[key].unit;
        }
      }
    }

    // 2. Search by Catalog Key match
    if (catalogKey && roles[catalogKey] && roles[catalogKey].unit !== undefined) {
      return roles[catalogKey].unit;
    }

    // 3. Search in DEFAULT config
    if (catalogKey && DEFAULT_MASTER_CONFIG.roles[catalogKey]) {
      return DEFAULT_MASTER_CONFIG.roles[catalogKey].unit;
    }

    return null;
  }

  function getMasterConfig() {
    if (!masterConfig) loadSealingTapeMaster();
    return masterConfig;
  }

  let showOnlyActiveQty = true;

  function getCalculatedSKUTotals(activeBomItems) {
    const config = getMasterConfig();
    const roles = (config && config.roles) || {};
    const items = Array.isArray(activeBomItems) ? activeBomItems : (typeof window !== 'undefined' && Array.isArray(window.bomItems) ? window.bomItems : []);

    const bomQtyMap = {};
    items.forEach(it => {
      if (!it || !it.partNo || !it.qty) return;
      const pNo = String(it.partNo).trim();
      bomQtyMap[pNo] = (bomQtyMap[pNo] || 0) + (parseFloat(it.qty) || 0);
    });

    const skuMap = {};

    Object.keys(roles).forEach(key => {
      const item = roles[key];
      if (!item || !item.partNo) return;
      const partNoVal = String(item.partNo).trim();
      const qty = bomQtyMap[partNoVal] || 0;
      if (qty <= 0) return;

      const unit = parseFloat(item.unit) || 0;
      const meters = qty * unit;
      const sku = String(item.SKU || 'WST-P0050RO').trim();

      if (!skuMap[sku]) {
        skuMap[sku] = { sku: sku, meters: 0, bomQtySum: 0, unitSum: 0, count: 0 };
      }
      skuMap[sku].meters += meters;
      skuMap[sku].bomQtySum += qty;
      skuMap[sku].unitSum += unit;
      skuMap[sku].count++;
    });

    Object.keys(skuMap).forEach(sku => {
      const dbPart = (typeof window !== 'undefined' && typeof window.lookupPart === 'function') ? window.lookupPart(sku) : null;
      const isPiece = (sku.includes('120') || sku.includes('1M') || (dbPart && dbPart.unit === 'PCS'));
      const rollLength = (dbPart && dbPart.rollLength) ? parseFloat(dbPart.rollLength) : 30.0;

      skuMap[sku].unit = isPiece ? 'PCS' : (dbPart && dbPart.unit ? dbPart.unit : 'Roll');
      skuMap[sku].pkgQty = isPiece ? Math.ceil(skuMap[sku].meters / 1.0) : Math.ceil(skuMap[sku].meters / (rollLength || 30.0));
      skuMap[sku].dbPart = dbPart;
    });

    return skuMap;
  }

  function syncSealingTapeStateToURL() {
    if (typeof window === 'undefined' || !window.history || !window.location) return;
    try {
      const url = new URL(window.location.href);
      const params = url.searchParams;

      params.set('st_cat', activeCategoryFilter || 'ALL');
      params.set('st_qty_only', showOnlyActiveQty ? '1' : '0');
      if (currentSortCol) {
        params.set('st_sort', currentSortCol);
        params.set('st_dir', currentSortDir || 'asc');
      } else {
        params.delete('st_sort');
        params.delete('st_dir');
      }

      window.history.replaceState(null, '', url.pathname + '?' + params.toString() + url.hash);
    } catch (e) {}
  }

  function loadSealingTapeStateFromURL() {
    if (typeof window === 'undefined' || !window.location) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('st_cat')) {
        activeCategoryFilter = params.get('st_cat');
      }
      if (params.has('st_qty_only')) {
        showOnlyActiveQty = (params.get('st_qty_only') === '1');
      }
      if (params.has('st_sort')) {
        currentSortCol = params.get('st_sort');
        currentSortDir = params.get('st_dir') || 'asc';
      }
    } catch (e) {}
  }

  function setCategoryFilter(cat) {
    activeCategoryFilter = cat;
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) {
      renderSealingTapeManagerUI(container.id);
    }
    syncSealingTapeStateToURL();
  }

  function toggleShowOnlyActiveQty() {
    showOnlyActiveQty = !showOnlyActiveQty;
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) {
      renderSealingTapeManagerUI(container.id);
    }
    syncSealingTapeStateToURL();
  }

  function getGasketPartOptions() {
    const db = (typeof window !== 'undefined' && Array.isArray(window.partsDb)) ? window.partsDb : [];
    const optionsMap = {};

    // Standard default fallback SKUs
    optionsMap['WST-P0050RO'] = 'WST-P0050RO (3mm PVC 30M)';
    optionsMap['WST-P0120M'] = 'WST-P0120M (Corner PVC 1M)';
    optionsMap['WST-EPDM50'] = 'WST-EPDM50 (EPDM Foam 10M)';

    db.forEach(p => {
      if (!p || (!p.partNo && !p.id)) return;
      const pNo = String(p.partNo || p.id).trim();
      const cat = String(p.category || '').toUpperCase();
      const name = String(p.nameKo || p.nameEn || p.partName || pNo).trim();
      const spec = p.spec ? ` [${p.spec}]` : '';

      const isMatch = pNo.startsWith('WST-') ||
                      cat.includes('GASKET') ||
                      cat.includes('SEAL') ||
                      cat.includes('TAPE') ||
                      name.toUpperCase().includes('SEALANT') ||
                      name.toUpperCase().includes('GASKET') ||
                      name.toUpperCase().includes('TAPE');

      if (isMatch) {
        optionsMap[pNo] = `${pNo} - ${name}${spec}`;
      }
    });

    return optionsMap;
  }

  function renderSealingTapeManagerUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const config = getMasterConfig();
    const roles = config.roles;
    const gasketOptions = getGasketPartOptions();

    // Fetch active BOM OUT items for current tank Q'ty verification
    let activeBomItems = [];
    try {
      if (typeof window.bomItems !== 'undefined' && Array.isArray(window.bomItems) && window.bomItems.length > 0) {
        activeBomItems = window.bomItems;
      } else {
        const savedDraft = localStorage.getItem('water_tank_bom_draft');
        if (savedDraft) activeBomItems = JSON.parse(savedDraft);
      }
    } catch (e) {}

    // Map BOM quantities by partNo
    const bomQtyMap = {};
    if (Array.isArray(activeBomItems)) {
      activeBomItems.forEach(bItem => {
        if (bItem && bItem.partNo) {
          const pNo = String(bItem.partNo).trim();
          bomQtyMap[pNo] = (bomQtyMap[pNo] || 0) + (Number(bItem.qty) || 0);
        }
      });
    }

    let rowsHtml = '';
    let idx = 1;
    let totalItems = 0;
    let totalUnitSum = 0;
    let totalBomQtySum = 0;
    let totalCalculatedMetersSum = 0;

    const skuSubtotalsMap = {};
    let roleKeys = Object.keys(roles);

    if (currentSortCol && currentSortCol !== 'no') {
      roleKeys.sort((aKey, bKey) => {
        const itemA = roles[aKey] || {};
        const itemB = roles[bKey] || {};
        const partNoA = itemA.partNo ? String(itemA.partNo).trim() : '';
        const partNoB = itemB.partNo ? String(itemB.partNo).trim() : '';
        const bomQtyA = partNoA && bomQtyMap[partNoA] !== undefined ? bomQtyMap[partNoA] : 0;
        const bomQtyB = partNoB && bomQtyMap[partNoB] !== undefined ? bomQtyMap[partNoB] : 0;
        const unitA = parseFloat(itemA.unit) || 0;
        const unitB = parseFloat(itemB.unit) || 0;
        const metersA = bomQtyA * unitA;
        const metersB = bomQtyB * unitB;

        let valA = 0, valB = 0;
        if (currentSortCol === 'label') {
          valA = (itemA.label || aKey).toLowerCase();
          valB = (itemB.label || bKey).toLowerCase();
        } else if (currentSortCol === 'partNo') {
          valA = partNoA.toLowerCase();
          valB = partNoB.toLowerCase();
        } else if (currentSortCol === 'catalogKey') {
          valA = aKey.toLowerCase();
          valB = bKey.toLowerCase();
        } else if (currentSortCol === 'bomQty') {
          valA = bomQtyA;
          valB = bomQtyB;
        } else if (currentSortCol === 'unit') {
          valA = unitA;
          valB = unitB;
        } else if (currentSortCol === 'totalMeters') {
          valA = metersA;
          valB = metersB;
        } else if (currentSortCol === 'sku') {
          valA = (itemA.SKU || '').toLowerCase();
          valB = (itemB.SKU || '').toLowerCase();
        }

        if (typeof valA === 'string') {
          return currentSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return currentSortDir === 'asc' ? valA - valB : valB - valA;
        }
      });
    }

    roleKeys.forEach((key) => {
      const item = roles[key];
      const category = item.category || 'General';

      let isCategoryMatch = false;
      if (activeCategoryFilter === 'ALL') {
        isCategoryMatch = true;
      } else if (activeCategoryFilter === 'PANELS') {
        isCategoryMatch = (category === 'Roof & Bottom' || category === 'Side Panels' || category === 'Partitions' || category.includes('Panel'));
      } else {
        isCategoryMatch = (activeCategoryFilter === category);
      }

      if (!isCategoryMatch) {
        return;
      }

      const partNoVal = item.partNo ? String(item.partNo).trim() : '';
      const bomQty = partNoVal && bomQtyMap[partNoVal] !== undefined ? bomQtyMap[partNoVal] : 0;

      if (showOnlyActiveQty && bomQty <= 0 && key !== highlightedRoleKey) {
        return;
      }

      totalItems++;
      const unitVal = parseFloat(item.unit) || 0;
      const totalMeters = bomQty * unitVal;

      totalUnitSum += unitVal;
      totalBomQtySum += bomQty;
      totalCalculatedMetersSum += totalMeters;

      const skuKey = String(item.SKU || 'WST-P0050RO').trim();
      if (!skuSubtotalsMap[skuKey]) {
        skuSubtotalsMap[skuKey] = { sku: skuKey, count: 0, unitSum: 0, bomQtySum: 0, bomMetersSum: 0 };
      }
      skuSubtotalsMap[skuKey].count++;
      skuSubtotalsMap[skuKey].unitSum += unitVal;
      skuSubtotalsMap[skuKey].bomQtySum += bomQty;
      skuSubtotalsMap[skuKey].bomMetersSum += totalMeters;

      const defaultUnit = DEFAULT_MASTER_CONFIG.roles[key] ? DEFAULT_MASTER_CONFIG.roles[key].unit : item.unit;
      const isModified = (item.unit !== defaultUnit);
      const isHighlighted = (key === highlightedRoleKey);
      const partNoDisplay = item.partNo || '-';

      const rowBg = isHighlighted ? '#fef9c3' : (isModified ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'));
      const rowBorder = isHighlighted ? '2px solid #eab308' : '1px solid #e2e8f0';

      const skuOptionsHtml = Object.entries(gasketOptions).map(([skuVal, label]) => 
        `<option value="${skuVal}" ${item.SKU === skuVal ? 'selected' : ''}>${escapeHtml(label)}</option>`
      ).join('');

      rowsHtml += `
        <tr ondragover="SealingTapeEditor.onRowDragOver(event)" 
            ondragenter="SealingTapeEditor.onRowDragEnter(event)" 
            ondragleave="SealingTapeEditor.onRowDragLeave(event)" 
            ondrop="SealingTapeEditor.onRowDrop(event, '${key}')" 
            style="border-bottom: ${rowBorder}; background: ${rowBg}; transition: background 0.5s ease;">
          <td draggable="true"
              ondragstart="SealingTapeEditor.onRowDragStart(event, '${key}')"
              ondragend="SealingTapeEditor.onRowDragEnd(event)"
              style="padding: 6px 4px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px; white-space: nowrap; cursor: grab;" title="드래그하여 순서 변경">
            <i class="fa-solid fa-grip-vertical" style="cursor: grab; color: #0284c7; margin-right: 4px;"></i>${idx++}
          </td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-size: 11px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 9.5px; background: #e0f2fe; color: #0284c7; padding: 2px 5px; border-radius: 4px; font-weight: 700; flex-shrink: 0;">${escapeHtml(category)}</span>
              <input type="text" value="${escapeHtml(item.label || key)}" oninput="SealingTapeEditor.updateRoleLabel('${key}', this.value, false)" onchange="SealingTapeEditor.updateRoleLabel('${key}', this.value, true)" onkeydown="SealingTapeEditor.handleInputKeydown(event, this)" style="flex: 1; min-width: 0; box-sizing: border-box; width: 100%; border: 1px solid #7dd3fc; border-radius: 4px; font-size: 11px; font-weight: 700; color: #0f172a; padding: 3px 5px; background: #ffffff;">
            </div>
          </td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; font-weight: 800; color: #0284c7; background: #f0f9ff;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="flex: 1; font-family: monospace; font-weight: 800; color: #0284c7; font-size: 11px; padding: 2px 4px; background: #e0f2fe; border-radius: 4px; border: 1px solid #7dd3fc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(partNoDisplay)}">${escapeHtml(partNoDisplay)}</span>
              <button type="button" onclick="SealingTapeEditor.openPartNoPickerForKey('${key}')" title="Part Master DB에서 품번 검색 및 선택" style="flex-shrink: 0; background: #0284c7; border: none; color: #ffffff; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(2,132,199,0.25); transition: background 0.15s;" onmouseover="this.style.background='#0369a1';" onmouseout="this.style.background='#0284c7';">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
            </div>
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 800; color: ${bomQty > 0 ? '#0284c7' : '#94a3b8'}; font-size: 11.5px; background: ${bomQty > 0 ? '#e0f2fe' : '#ffffff'};">
            ${bomQty > 0 ? `<i class="fa-solid fa-cube" style="font-size: 10px; margin-right: 3px;"></i>${bomQty} PCS` : '0 PCS'}
          </td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right;">
            <input type="number" step="0.1" min="0" value="${item.unit}" oninput="SealingTapeEditor.updateRoleUnit('${key}', this.value, false)" onchange="SealingTapeEditor.updateRoleUnit('${key}', this.value, true)" onkeydown="SealingTapeEditor.handleInputKeydown(event, this)" style="box-sizing: border-box; width: 65px; max-width: 100%; text-align: right; font-weight: 800; color: #0284c7; padding: 4px 5px; border: 2px solid ${isModified ? '#0284c7' : '#38bdf8'}; border-radius: 6px; background: #ffffff;">
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: ${totalMeters > 0 ? '#059669' : '#94a3b8'}; font-size: 12px; background: ${totalMeters > 0 ? '#dcfce7' : '#ffffff'};">
            ${totalMeters > 0 ? `${totalMeters.toFixed(1)} m` : '0.0 m'}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-size: 10.5px; color: #334155;">
            <select onchange="SealingTapeEditor.updateRoleSku('${key}', this.value)" style="padding: 3px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 10.5px; width: 100%;">
              ${skuOptionsHtml}
            </select>
          </td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
            <button type="button" onclick="SealingTapeEditor.duplicateRole('${key}')" title="이 항목을 바로 밑으로 복사" style="background: #e0f2fe; border: 1px solid #38bdf8; color: #0284c7; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(2,132,199,0.15);" onmouseover="this.style.background='#0284c7'; this.style.color='#ffffff';" onmouseout="this.style.background='#e0f2fe'; this.style.color='#0284c7';">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" onclick="SealingTapeEditor.deleteRole('${key}')" title="항목 삭제" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; margin-left: 5px; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(220,38,38,0.15);" onmouseover="this.style.background='#dc2626'; this.style.color='#ffffff';" onmouseout="this.style.background='#fee2e2'; this.style.color='#dc2626';">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </td>
        </tr>
      `;
    });

    const summaryCardsHtml = Object.keys(skuSubtotalsMap).map(skuKey => {
      const sub = skuSubtotalsMap[skuKey];
      if (!sub || (sub.bomMetersSum <= 0 && sub.bomQtySum <= 0)) return '';

      const isPiece = (skuKey.includes('120') || skuKey.includes('1M'));
      const dbPart = (typeof window !== 'undefined' && typeof window.lookupPart === 'function') ? window.lookupPart(skuKey) : null;
      const rollLength = (dbPart && dbPart.rollLength) ? parseFloat(dbPart.rollLength) : 30.0;
      const pkgQty = isPiece ? Math.ceil(sub.bomMetersSum / 1.0) : Math.ceil(sub.bomMetersSum / (rollLength || 30.0));
      const pkgUnit = isPiece ? 'PCS' : (dbPart && dbPart.unit ? dbPart.unit : 'Roll');
      const labelText = gasketOptions[skuKey] || skuKey;

      const isCorner = isPiece || skuKey.includes('120');
      const cardBg = isCorner ? '#f0fdf4' : '#eff6ff';
      const cardBorder = isCorner ? '1px solid #86efac' : '1px solid #93c5fd';
      const titleColor = isCorner ? '#15803d' : '#1d4ed8';
      const numColor = isCorner ? '#166534' : '#1e40af';
      const badgeBg = isCorner ? '#dcfce7' : '#dbeafe';
      const badgeColor = isCorner ? '#16a34a' : '#2563eb';

      return `
        <div style="flex: 1.2; min-width: 170px; background: ${cardBg}; border: ${cardBorder}; border-radius: 8px; padding: 8px 12px;">
          <span style="font-size: 11px; font-weight: 700; color: ${titleColor}; display: block;">${isCorner ? '🟩' : '🟦'} ${escapeHtml(labelText)}</span>
          <span style="font-size: 15px; font-weight: 800; color: ${numColor};">${sub.bomMetersSum.toFixed(1)} m <span style="font-size: 12px; font-weight: 800; color: ${badgeColor}; background: ${badgeBg}; padding: 1px 6px; border-radius: 10px;">(발주: ${pkgQty} ${pkgUnit})</span></span>
        </div>
      `;
    }).join('');

    const html = `
      <div style="background: #ffffff; padding: 18px; border-radius: 12px; border: 1.5px solid #0284c7; box-shadow: 0 4px 15px rgba(2,132,199,0.08);">
        <!-- Top Control Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2px solid #e0f2fe;">
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-ribbon" style="color: #0284c7; font-size: 18px;"></i> 실링테이프 품번(Part No) & 높이별 수식 마스터 설정 (Sealing Tape Master)
              <span style="font-size: 11px; font-weight: 800; color: #ffffff; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 3px 10px; border-radius: 20px; box-shadow: 0 2px 5px rgba(2,132,199,0.3);">
                <i class="fa-solid fa-pen-to-square"></i> 판넬 & Steel Accessories 품번별 소요량 정의
              </span>
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
              모든 판넬 및 Steel Accessories의 <strong>자재 품번(Part No / SKU)</strong>별 필요 실링테이프 소요 미터(m/PCS) 및 테이프 자재를 직접 설정하고 현재 탱크 BOM 산출량을 실시간으로 검증할 수 있습니다.
            </p>
          </div>

          <div style="display: flex; gap: 8px;">
            <button type="button" onclick="SealingTapeEditor.addCustomRolePrompt()" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 5px rgba(2,132,199,0.2);">
              <i class="fa-solid fa-plus"></i> 새 품번/부위 추가
            </button>
            <button type="button" onclick="SealingTapeEditor.resetAllToDefault()" style="background: #eab308; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 5px rgba(234,179,8,0.2);">
              <i class="fa-solid fa-rotate-left"></i> 마스터 기본값 원복
            </button>
          </div>
        </div>

        <!-- Total Summary Cards Bar -->
        <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 130px; background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 8px 12px;">
            <span style="font-size: 11px; font-weight: 700; color: #0369a1; display: block;">📋 총 항목 수 (Total Roles)</span>
            <span style="font-size: 16px; font-weight: 800; color: #0284c7;">${totalItems}개 항목</span>
          </div>
          ${summaryCardsHtml}
          <div style="flex: 1.2; min-width: 170px; background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 8px 12px;">
            <span style="font-size: 11px; font-weight: 700; color: #a16207; display: block;">🧮 현재 탱크 실링테이프 총 소요미터</span>
            <span style="font-size: 16px; font-weight: 800; color: #854d0e;">${totalCalculatedMetersSum.toFixed(1)} m</span>
          </div>
        </div>

        <!-- Category & Q'ty Filter Buttons Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <!-- Left: Category Filter Pills -->
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('ALL')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'ALL' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'ALL' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🌐 전체 (All)</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('PANELS')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'PANELS' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'PANELS' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🧱 판넬류 전체 (Panels)</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Steel Accessories')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'Steel Accessories' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'Steel Accessories' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🔩 Steel Accessories (철재 부자재)</button>

            <span style="display: inline-block; height: 16px; border-right: 1px solid #cbd5e1; margin: 0 3px;"></span>

            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Roof & Bottom')" style="padding: 4px 9px; font-size: 10.5px; font-weight: 600; border-radius: 20px; border: 1px solid #7dd3fc; background: ${activeCategoryFilter === 'Roof & Bottom' ? '#0369a1' : '#f0f9ff'}; color: ${activeCategoryFilter === 'Roof & Bottom' ? '#ffffff' : '#0369a1'}; cursor: pointer;">지붕&바닥</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Side Panels')" style="padding: 4px 9px; font-size: 10.5px; font-weight: 600; border-radius: 20px; border: 1px solid #7dd3fc; background: ${activeCategoryFilter === 'Side Panels' ? '#0369a1' : '#f0f9ff'}; color: ${activeCategoryFilter === 'Side Panels' ? '#ffffff' : '#0369a1'}; cursor: pointer;">측면(Side)</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Partitions')" style="padding: 4px 9px; font-size: 10.5px; font-weight: 600; border-radius: 20px; border: 1px solid #7dd3fc; background: ${activeCategoryFilter === 'Partitions' ? '#0369a1' : '#f0f9ff'}; color: ${activeCategoryFilter === 'Partitions' ? '#ffffff' : '#0369a1'}; cursor: pointer;">격벽(Partitions)</button>
          </div>

          <!-- Right: Q'ty > 0 Only Filter Toggle Button -->
          <div>
            <button type="button" onclick="SealingTapeEditor.toggleShowOnlyActiveQty()" style="padding: 5px 13px; font-size: 11px; font-weight: 800; border-radius: 20px; border: 1.5px solid ${showOnlyActiveQty ? '#059669' : '#0284c7'}; background: ${showOnlyActiveQty ? '#dcfce7' : '#ffffff'}; color: ${showOnlyActiveQty ? '#15803d' : '#0284c7'}; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: ${showOnlyActiveQty ? '0 2px 6px rgba(5,150,105,0.25)' : 'none'};">
              <i class="fa-solid ${showOnlyActiveQty ? 'fa-square-check' : 'fa-square'}" style="font-size: 13px;"></i> 📦 BOM 수량 있는 항목만 보기 (Q'ty > 0)
            </button>
          </div>
        </div>

        <!-- Master Matrix Table -->
        <div class="table-wrapper" style="max-height: 520px; overflow-y: auto; overflow-x: auto; border: 1.5px solid #0284c7; border-radius: 8px;">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
            <thead>
              <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0; z-index: 10;">
                <th onclick="SealingTapeEditor.sortByColumn('no')" style="padding: 8px 4px; border: 1px solid #bae6fd; width: 45px; text-align: center; color: #0369a1; font-weight: 800; cursor: pointer;" title="기본/드래그 순서 정렬">No ${currentSortCol === 'no' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('label')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 175px; color: #0369a1; font-weight: 800; cursor: pointer;" title="부위/항목명 정렬">부위 / 항목명 ✏️ ${currentSortCol === 'label' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('partNo')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 110px; color: #0369a1; font-weight: 800; cursor: pointer;" title="자재품번 정렬">자재 품번 ✏️ ${currentSortCol === 'partNo' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('bomQty')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 80px; text-align: center; color: #0369a1; font-weight: 800; background: #bae6fd; cursor: pointer;" title="BOM 수량 정렬">BOM 수량 📦 ${currentSortCol === 'bomQty' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('unit')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 80px; text-align: right; color: #0369a1; font-weight: 800; cursor: pointer;" title="단위길이 정렬">단위길이(m) ✏️ ${currentSortCol === 'unit' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('totalMeters')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 90px; text-align: right; color: #047857; font-weight: 800; background: #a7f3d0; cursor: pointer;" title="소요미터 정렬">소요미터 (Total m) ${currentSortCol === 'totalMeters' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('sku')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 160px; color: #0369a1; font-weight: 800; cursor: pointer;" title="반영자재 정렬">실제 반영 자재 (SKU) ${currentSortCol === 'sku' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th style="padding: 8px 6px; border: 1px solid #bae6fd; width: 85px; text-align: center; color: #0369a1; font-weight: 800;">작업</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              ${Object.keys(skuSubtotalsMap).map(skuKey => {
                const sub = skuSubtotalsMap[skuKey];
                if (!sub || (sub.bomMetersSum <= 0 && sub.bomQtySum <= 0)) return '';

                const isPiece = (skuKey.includes('120') || skuKey.includes('1M'));
                const dbPart = (typeof window !== 'undefined' && typeof window.lookupPart === 'function') ? window.lookupPart(skuKey) : null;
                const rollLength = (dbPart && dbPart.rollLength) ? parseFloat(dbPart.rollLength) : 30.0;
                const pkgQty = isPiece ? Math.ceil(sub.bomMetersSum / 1.0) : Math.ceil(sub.bomMetersSum / (rollLength || 30.0));
                const pkgUnit = isPiece ? 'PCS' : (dbPart && dbPart.unit ? dbPart.unit : 'Roll');
                const labelText = gasketOptions[skuKey] || skuKey;

                const isCorner = isPiece || skuKey.includes('120');
                const bgStyle = isCorner ? 'background: #f0fdf4; border-top: 1px solid #86efac;' : 'background: #eff6ff; border-top: 2px solid #3b82f6;';
                const textColor = isCorner ? 'color: #166534;' : 'color: #1e40af;';
                const borderColor = isCorner ? 'border: 1px solid #bbf7d0;' : 'border: 1px solid #bfdbfe;';
                const highlightBg = isCorner ? 'background: #dcfce7;' : 'background: #dbeafe;';

                return `
                  <tr style="${bgStyle} font-size: 11px;">
                    <td colspan="3" style="padding: 6px 8px; ${borderColor} text-align: right; ${textColor} font-weight: 800;">
                      ${isCorner ? '🟩' : '🟦'} ${escapeHtml(labelText)} 소계:
                    </td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: center; ${textColor} font-weight: 800;">${sub.bomQtySum} PCS</td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: right; ${textColor} font-weight: 800;">${sub.unitSum.toFixed(1)} m/PCS</td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: right; ${textColor} font-weight: 800; ${highlightBg}">${sub.bomMetersSum.toFixed(1)} m</td>
                    <td style="padding: 6px 8px; ${borderColor} ${textColor} font-weight: 800;">📦 발주량: ${pkgQty} ${pkgUnit} (${sub.count}개 부위)</td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: center; ${textColor}">-</td>
                  </tr>
                `;
              }).join('')}
            </tfoot>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function handleInputKeydown(e, currentInput) {
    if (e.key === 'Enter') {
      e.preventDefault();
      currentInput.blur();
      
      const td = currentInput.closest('td');
      const tr = currentInput.closest('tr');
      if (!td || !tr) return;

      const colIndex = Array.from(tr.children).indexOf(td);
      const nextTr = tr.nextElementSibling;
      if (nextTr && nextTr.children[colIndex]) {
        const nextInput = nextTr.children[colIndex].querySelector('input, select');
        if (nextInput) {
          nextInput.focus();
          if (typeof nextInput.select === 'function') nextInput.select();
        }
      }
    }
  }

  function updateRoleLabel(key, val, isFinalCommit = true) {
    const trimmed = String(val || '').trim();
    if (!trimmed) return;
    const config = getMasterConfig();
    if (config.roles[key]) {
      config.roles[key].label = trimmed;
      if (isFinalCommit) {
        saveSealingTapeMaster(false);
      }
    }
  }

  function updatePartNo(key, val, isFinalCommit = true) {
    const trimmed = String(val || '').trim();
    const config = getMasterConfig();
    if (config.roles[key]) {
      config.roles[key].partNo = trimmed;
      if (isFinalCommit) {
        saveSealingTapeMaster(false);
      }
    }
  }

  function updateRoleUnit(key, val, isFinalCommit = true) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    const config = getMasterConfig();
    if (!config.roles[key]) config.roles[key] = { unit: num, SKU: 'WST-P0050RO', label: key, category: 'Custom' };
    config.roles[key].unit = num;
    if (isFinalCommit) {
      saveSealingTapeMaster(false);
    }
  }

  function updateRoleSku(key, sku) {
    const config = getMasterConfig();
    if (config.roles[key]) {
      config.roles[key].SKU = sku;
      saveSealingTapeMaster(false);
    }
  }

  function resetRoleUnit(key) {
    const config = getMasterConfig();
    if (DEFAULT_MASTER_CONFIG.roles[key]) {
      config.roles[key].unit = DEFAULT_MASTER_CONFIG.roles[key].unit;
      config.roles[key].SKU = DEFAULT_MASTER_CONFIG.roles[key].SKU;
      config.roles[key].partNo = DEFAULT_MASTER_CONFIG.roles[key].partNo;
      saveSealingTapeMaster();
    }
  }

  let highlightedRoleKey = null;
  let currentSortCol = null; // 'no', 'label', 'partNo', 'catalogKey', 'bomQty', 'unit', 'totalMeters', 'sku'
  let currentSortDir = 'asc';
  let draggedKey = null;

  function sortByColumn(col) {
    if (currentSortCol === col) {
      currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortCol = col;
      currentSortDir = 'asc';
    }
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);
    syncSealingTapeStateToURL();
  }

  function onRowDragStart(e, key) {
    draggedKey = key;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
    const tr = e.currentTarget ? e.currentTarget.closest('tr') : null;
    if (tr) tr.style.opacity = '0.5';
  }

  function onRowDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onRowDragEnter(e) {
    const tr = e.currentTarget ? e.currentTarget.closest('tr') : null;
    if (tr) tr.style.borderTop = '3px solid #0284c7';
  }

  function onRowDragLeave(e) {
    const tr = e.currentTarget ? e.currentTarget.closest('tr') : null;
    if (tr) tr.style.borderTop = '';
  }

  function onRowDrop(e, targetKey) {
    e.preventDefault();
    const tr = e.currentTarget ? e.currentTarget.closest('tr') : null;
    if (tr) tr.style.borderTop = '';
    if (!draggedKey || draggedKey === targetKey) return;

    const config = getMasterConfig();
    if (!config.roles[draggedKey] || !config.roles[targetKey]) return;

    const draggedItem = config.roles[draggedKey];
    const newRoles = {};

    Object.keys(config.roles).forEach(k => {
      if (k === draggedKey) return;
      newRoles[k] = config.roles[k];
      if (k === targetKey) {
        newRoles[draggedKey] = draggedItem;
      }
    });

    config.roles = newRoles;
    currentSortCol = null; // Reset sort column to apply manual drag order
    saveSealingTapeMaster();

    highlightedRoleKey = draggedKey;
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);

    setTimeout(() => {
      highlightedRoleKey = null;
    }, 3000);
  }

  function onRowDragEnd(e) {
    const tr = e.currentTarget ? e.currentTarget.closest('tr') : null;
    if (tr) tr.style.opacity = '1';
    draggedKey = null;
  }

  function deleteRole(key) {
    const config = getMasterConfig();
    if (config.roles[key]) {
      const label = config.roles[key].label || key;
      if (confirm(`'${label}' (${key}) 항목을 정말 삭제하시겠습니까?`)) {
        delete config.roles[key];
        saveSealingTapeMaster();
        const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
        if (container) renderSealingTapeManagerUI(container.id);
      }
    }
  }

  function duplicateRole(key) {
    const config = getMasterConfig();
    if (config.roles[key]) {
      const source = config.roles[key];
      const newKey = `${key}_copy_${Date.now().toString(36)}`;
      const cloned = JSON.parse(JSON.stringify(source));
      cloned.label = `${source.label || key} (Copy)`;
      cloned.partNo = source.partNo ? `${source.partNo}_COPY` : 'NEW_PART_COPY';

      // Reconstruct roles map to insert newKey IMMEDIATELY AFTER key (directly below original row)
      const newRoles = {};
      Object.keys(config.roles).forEach(k => {
        newRoles[k] = config.roles[k];
        if (k === key) {
          newRoles[newKey] = cloned;
        }
      });
      config.roles = newRoles;

      saveSealingTapeMaster();

      // Reset filters so the cloned row is 100% visible immediately right below the original row
      activeCategoryFilter = 'ALL';
      showOnlyActiveQty = false;
      highlightedRoleKey = newKey;

      const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
      if (container) renderSealingTapeManagerUI(container.id);

      // Automatically focus, select text, and scroll into view for the newly created row!
      setTimeout(() => {
        const newRowInput = document.querySelector(`input[oninput*="${newKey}"], input[onchange*="${newKey}"]`);
        if (newRowInput) {
          newRowInput.focus();
          if (typeof newRowInput.select === 'function') newRowInput.select();
          newRowInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 60);

      setTimeout(() => {
        highlightedRoleKey = null;
      }, 4000);
    }
  }

  function resetAllToDefault() {
    if (confirm("실링테이프 마스터 설정을 카탈로그 기본값으로 초기화하시겠습니까?")) {
      masterConfig = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG));
      saveSealingTapeMaster();
    }
  }

  function addCustomRolePrompt() {
    openPartMasterPickerModal();
  }

  function openPartMasterPickerModal() {
    let modal = document.getElementById('partMasterPickerModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'partMasterPickerModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; padding: 20px; box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 1050px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.35); border: 2px solid #0284c7;">
        <div style="padding: 14px 20px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-database"></i> PART MASTER DB 품번 등록 & 선택 (Select Part Number)
          </h3>
          <button type="button" onclick="document.getElementById('partMasterPickerModal')?.remove()" style="background: rgba(255,255,255,0.2); border: none; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="닫기 (ESC)">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div style="padding: 14px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="position: relative; flex: 1;">
            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 11px; color: #94a3b8;"></i>
            <input type="text" id="partMasterPickerSearch" onkeyup="SealingTapeEditor.filterPickerParts()" placeholder="품번(Part No), 품명(Part Name), 규격(Spec)으로 검색..." style="width: 100%; padding: 8px 12px 8px 36px; border: 2px solid #0284c7; border-radius: 8px; font-size: 12px; font-weight: 600; outline: none; box-sizing: border-box;">
          </div>
          <button type="button" onclick="SealingTapeEditor.addBrandNewPartToDb()" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 5px rgba(2,132,199,0.25);">
            <i class="fa-solid fa-plus"></i> PART MASTER DB에 신규 품번 직접 등록
          </button>
        </div>

        <div id="partMasterPickerGrid" style="padding: 16px 20px; overflow-y: auto; flex: 1;"></div>

        <!-- Prominent Sticky Bottom Footer Bar for Easy Exit -->
        <div style="padding: 12px 20px; background: #f1f5f9; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 12px; color: #475569; font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-circle-info" style="color: #0284c7;"></i> 키보드 <strong>ESC</strong> 키를 누르거나 바깥 어두운 배경을 누르면 닫힙니다.
          </span>
          <button type="button" onclick="document.getElementById('partMasterPickerModal')?.remove()" style="background: #ef4444; color: #ffffff; border: none; border-radius: 8px; padding: 8px 20px; font-size: 12.5px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(239,68,68,0.35);">
            <i class="fa-solid fa-xmark"></i> 닫기 (Close / ESC)
          </button>
        </div>
      </div>
    `;

    // 1. Backdrop click handler
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // 2. ESC Key handler
    const escListener = function(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const m = document.getElementById('partMasterPickerModal');
        if (m) m.remove();
        window.removeEventListener('keydown', escListener);
      }
    };
    window.addEventListener('keydown', escListener);

    document.body.appendChild(modal);
    filterPickerParts();
  }

  // Open a Part Master DB picker specifically to UPDATE the partNo of an EXISTING role row (key)
  function openPartNoPickerForKey(key) {
    const modalId = 'partNoPickerForKeyModal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; padding: 20px; box-sizing: border-box;
    `;

    const config = getMasterConfig();
    const currentPartNo = (config.roles[key] && config.roles[key].partNo) || '-';
    const currentLabel  = (config.roles[key] && config.roles[key].label) || key;

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 1050px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.35); border: 2px solid #0284c7;">
        <div style="padding: 14px 20px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            자재 품번 선택 (Part Master DB)
            <span style="font-size: 11px; background: rgba(255,255,255,0.2); padding: 2px 10px; border-radius: 20px;">${escapeHtml(currentLabel)} — 현재: ${escapeHtml(currentPartNo)}</span>
          </h3>
          <button type="button" onclick="document.getElementById('${modalId}')?.remove()" style="background: rgba(255,255,255,0.2); border: none; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; font-size: 20px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;" title="닫기">&times;</button>
        </div>

        <div style="padding: 14px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px;">
          <div style="position: relative; flex: 1;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="partNoPickerSearch" value="${currentPartNo !== '-' ? escapeHtml(currentPartNo) : ''}" oninput="SealingTapeEditor.filterPartNoPicker('${key}')" placeholder="품번(Part No), 품명, 규격으로 검색..." style="width: 100%; padding: 8px 12px 8px 36px; border: 2px solid #0284c7; border-radius: 8px; font-size: 12px; font-weight: 600; outline: none; box-sizing: border-box;">
          </div>
        </div>

        <div id="partNoPickerGrid" style="padding: 16px 20px; overflow-y: auto; flex: 1;"></div>

        <div style="padding: 12px 20px; background: #f1f5f9; border-top: 1px solid #cbd5e1; display: flex; justify-content: flex-end;">
          <button type="button" onclick="document.getElementById('${modalId}')?.remove()" style="background: #ef4444; color: #ffffff; border: none; border-radius: 8px; padding: 8px 20px; font-size: 12.5px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            &times; 닫기 (ESC)
          </button>
        </div>
      </div>
    `;

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    const escListener = function(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const m = document.getElementById(modalId);
        if (m) m.remove();
        window.removeEventListener('keydown', escListener);
      }
    };
    window.addEventListener('keydown', escListener);

    document.body.appendChild(modal);
    // Use setTimeout to guarantee the DOM is fully rendered before populating the grid
    setTimeout(function() { filterPartNoPicker(key); }, 0);
  }

  function filterPartNoPicker(key) {
    const searchEl = document.getElementById('partNoPickerSearch');
    const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
    const grid = document.getElementById('partNoPickerGrid');
    if (!grid) return;

    const parts = (typeof window !== 'undefined' && Array.isArray(window.partsDb)) ? window.partsDb : [];
    const filtered = parts.filter(p => {
      if (!query) return true;
      const idStr   = String(p.id || p.partNo || '').toLowerCase();
      const nameKo  = String(p.nameKo || '').toLowerCase();
      const nameEn  = String(p.nameEn || '').toLowerCase();
      const specStr = String(p.spec || '').toLowerCase();
      return idStr.includes(query) || nameKo.includes(query) || nameEn.includes(query) || specStr.includes(query);
    });

    let html = `
      <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
        <thead>
          <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0;">
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 40px; text-align: center; color: #0369a1;">No</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 140px; color: #0369a1; font-weight: 800;">자재 품번 (Part No)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-weight: 800;">품명 (Part Name)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 180px; color: #0369a1; font-weight: 800;">규격 (Spec)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 100px; color: #0369a1; font-weight: 800;">카테고리</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 70px; text-align: center; color: #0369a1; font-weight: 800;">선택</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (filtered.length === 0) {
      html += `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #94a3b8; font-weight: 700;">검색 결과가 없습니다.</td></tr>`;
    } else {
      filtered.slice(0, 150).forEach((p, i) => {
        const partNo   = p.id || p.partNo || 'UNKNOWN';
        const name     = p.nameKo || p.nameEn || p.partName || partNo;
        const spec     = p.spec || '-';
        const category = p.category || 'General';
        html += `
          <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; cursor: pointer;" onclick="SealingTapeEditor.selectPartNoForKey('${key}', '${escapeHtml(partNo)}')">
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${i + 1}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #0284c7; background: #f0f9ff;">${escapeHtml(partNo)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${escapeHtml(name)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #475569;">${escapeHtml(spec)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${escapeHtml(category)}</span></td>
            <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">
              <button type="button" onclick="event.stopPropagation(); SealingTapeEditor.selectPartNoForKey('${key}', '${escapeHtml(partNo)}')" style="background: #0284c7; color: #ffffff; border: none; border-radius: 4px; padding: 3px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">선택</button>
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table>`;
    grid.innerHTML = html;
  }

  function selectPartNoForKey(key, partNo) {
    const config = getMasterConfig();
    if (config.roles[key]) {
      config.roles[key].partNo = partNo;
      saveSealingTapeMaster(true);
    }
    const modal = document.getElementById('partNoPickerForKeyModal');
    if (modal) modal.remove();
  }

  function filterPickerParts() {
    const searchEl = document.getElementById('partMasterPickerSearch');
    const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
    const grid = document.getElementById('partMasterPickerGrid');
    if (!grid) return;

    const parts = (typeof window !== 'undefined' && Array.isArray(window.partsDb)) ? window.partsDb : [];

    const filtered = parts.filter(p => {
      if (!query) return true;
      const idStr = String(p.id || p.partNo || '').toLowerCase();
      const nameKoStr = String(p.nameKo || '').toLowerCase();
      const nameEnStr = String(p.nameEn || '').toLowerCase();
      const specStr = String(p.spec || '').toLowerCase();
      return idStr.includes(query) || nameKoStr.includes(query) || nameEnStr.includes(query) || specStr.includes(query);
    });

    let html = `
      <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
        <thead>
          <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0;">
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 40px; text-align: center; color: #0369a1;">No</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 140px; color: #0369a1; font-weight: 800;">자재 품번 (Part No)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-weight: 800;">품명 (Part Name)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 160px; color: #0369a1; font-weight: 800;">규격 (Specification)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 110px; color: #0369a1; font-weight: 800;">카테고리</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 100px; text-align: right; color: #0369a1; font-weight: 800;">테이프 소요(m)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 70px; text-align: center; color: #0369a1; font-weight: 800;">선택</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (filtered.length === 0) {
      html += `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #94a3b8; font-weight: 700;">검색 결과가 없습니다. 상단 [신규 품번 직접 등록] 버튼을 이용하세요.</td></tr>`;
    } else {
      filtered.slice(0, 100).forEach((p, idx) => {
        const partNo = p.id || p.partNo || 'UNKNOWN';
        const name = p.nameKo || p.nameEn || p.partName || partNo;
        const spec = p.spec || '-';
        const category = p.category || 'General';
        const tapeMeters = p.sealingTapeMeters !== undefined ? p.sealingTapeMeters : 1.5;

        html += `
          <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${idx + 1}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #0284c7; background: #f0f9ff;">${escapeHtml(partNo)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${escapeHtml(name)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #475569;">${escapeHtml(spec)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${escapeHtml(category)}</span></td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #0284c7;">${tapeMeters} m</td>
            <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">
              <button type="button" onclick="SealingTapeEditor.selectPartFromPicker('${escapeHtml(partNo)}', '${escapeHtml(name)}', ${tapeMeters}, '${escapeHtml(category)}')" style="background: #0284c7; color: #ffffff; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">선택</button>
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table>`;
    grid.innerHTML = html;
  }

  function selectPartFromPicker(partNo, label, tapeMeters, category) {
    const unitStr = prompt(`[${partNo}] ${label} 의 필요 실링테이프 소요 미터(m/PCS)를 입력하세요:`, tapeMeters || "1.5");
    if (!unitStr) return;

    const unit = parseFloat(unitStr) || 1.5;
    const key = "part_" + partNo.replace(/[^a-zA-Z0-9_]/g, '_');
    const config = getMasterConfig();

    config.roles[key] = {
      partNo: partNo,
      unit: unit,
      SKU: 'WST-P0050RO',
      label: label,
      category: category || 'Steel Accessories'
    };

    saveSealingTapeMaster();

    const modal = document.getElementById('partMasterPickerModal');
    if (modal) modal.remove();

    // Reset filters so newly added row is 100% visible immediately
    activeCategoryFilter = 'ALL';
    showOnlyActiveQty = false;
    highlightedRoleKey = key;

    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);

    setTimeout(() => {
      highlightedRoleKey = null;
    }, 4000);
  }

  function addBrandNewPartToDb() {
    const partNo = prompt("PART MASTER DB에 새로 등록할 품번(Part No / SKU)을 입력하세요:", "WCA-2510");
    if (!partNo) return;
    const name = prompt("품명(Part Name)을 입력하세요:", "Corner Angle 2.5mH (HDG)");
    if (!name) return;
    const spec = prompt("규격(Specification)을 입력하세요:", "L75x75x6t x 2.5mH");
    if (!spec) return;
    const unitMetersStr = prompt("실링테이프 필요 소요미터(m/PCS)를 입력하세요:", "2.5");
    if (!unitMetersStr) return;

    const unitMeters = parseFloat(unitMetersStr) || 2.5;

    // Add to window.partsDb
    if (typeof window !== 'undefined' && Array.isArray(window.partsDb)) {
      window.partsDb.push({
        id: partNo,
        partNo: partNo,
        nameKo: name,
        nameEn: name,
        spec: spec,
        unit: 'PCS',
        category: 'Steel Accessories',
        subCategory: 'General',
        price: 0,
        weight: 0,
        sealingTapeMeters: unitMeters
      });
      localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
      if (typeof window.renderDbList === 'function') window.renderDbList();
    }

    // Auto select into Sealing Tape Master Manager
    selectPartFromPicker(partNo, name, unitMeters, 'Steel Accessories');
  }

  function closeSealingTapeMasterModal() {
    const modal = document.getElementById('sealingTapeMasterModal');
    if (modal) modal.remove();
    syncSealingTapeStateToURL();
  }

  function openSealingTapeMasterModal() {
    let modal = document.getElementById('sealingTapeMasterModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'sealingTapeMasterModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; padding: 20px; box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 1120px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.3); border: 2px solid #0284c7;">
        <div style="padding: 14px 20px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-ribbon"></i> 실링테이프 품번(Part No) & 수식 마스터 설정 (Sealing Tape Master Manager)
          </h3>
          <button type="button" onclick="SealingTapeEditor.closeSealingTapeMasterModal()" style="background: transparent; border: none; color: #ffffff; font-size: 20px; cursor: pointer;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="sealingTapeMasterModalBody" style="padding: 20px; overflow-y: auto; flex: 1;"></div>
      </div>
    `;

    document.body.appendChild(modal);
    renderSealingTapeManagerUI('sealingTapeMasterModalBody');
    syncSealingTapeStateToURL();
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', loadSealingTapeStateFromURL);
    } else {
      setTimeout(loadSealingTapeStateFromURL, 150);
    }
  }

  const SealingTapeEditor = {
    loadSealingTapeMaster: loadSealingTapeMaster,
    saveSealingTapeMaster: saveSealingTapeMaster,
    getPartNoUnitMeter: getPartNoUnitMeter,
    getRoleUnitMeter: getPartNoUnitMeter,
    getMasterConfig: getMasterConfig,
    getCalculatedSKUTotals: getCalculatedSKUTotals,
    getGasketPartOptions: getGasketPartOptions,
    setCategoryFilter: setCategoryFilter,
    toggleShowOnlyActiveQty: toggleShowOnlyActiveQty,
    sortByColumn: sortByColumn,
    onRowDragStart: onRowDragStart,
    onRowDragOver: onRowDragOver,
    onRowDragEnter: onRowDragEnter,
    onRowDragLeave: onRowDragLeave,
    onRowDrop: onRowDrop,
    onRowDragEnd: onRowDragEnd,
    renderSealingTapeManagerUI: renderSealingTapeManagerUI,
    openSealingTapeMasterModal: openSealingTapeMasterModal,
    closeSealingTapeMasterModal: closeSealingTapeMasterModal,
    openPartMasterPickerModal: openPartMasterPickerModal,
    filterPickerParts: filterPickerParts,
    selectPartFromPicker: selectPartFromPicker,
    addBrandNewPartToDb: addBrandNewPartToDb,
    handleInputKeydown: handleInputKeydown,
    updateRoleLabel: updateRoleLabel,
    updatePartNo: updatePartNo,
    updateRoleUnit: updateRoleUnit,
    updateRoleSku: updateRoleSku,
    resetRoleUnit: resetRoleUnit,
    duplicateRole: duplicateRole,
    deleteRole: deleteRole,
    resetAllToDefault: resetAllToDefault,
    addCustomRolePrompt: addCustomRolePrompt,
    openPartNoPickerForKey: openPartNoPickerForKey,
    filterPartNoPicker: filterPartNoPicker,
    selectPartNoForKey: selectPartNoForKey
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SealingTapeEditor;
  } else {
    global.SealingTapeEditor = SealingTapeEditor;
  }
})(typeof window !== "undefined" ? window : globalThis);
