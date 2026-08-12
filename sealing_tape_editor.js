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
      // Roof & Bottom Panels
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

      // Side Panels (1.5mH / 2.0mH / MID / LOWER)
      "side.TOP_15.side":          { partNo: "SF10SX", unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Full", category: "Side Panels" },
      "side.TOP_15.side_parLT":    { partNo: "SF10SL", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Par-LT", category: "Side Panels" },
      "side.TOP_15.side_parRT":    { partNo: "SF10SR", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Par-RT", category: "Side Panels" },
      "side.TOP_15.hside":         { partNo: "NH10SX", unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Half", category: "Side Panels" },
      "side.TOP_15.hside_parRT":   { partNo: "NH10SR", unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Half Par-RT", category: "Side Panels" },
      "side.TOP_15.hside_parLT":   { partNo: "NH10SL", unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Half Par-LT", category: "Side Panels" },
      "side.TOP_15.qside":         { partNo: "NQ10SX", unit: 1.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Quarter", category: "Side Panels" },
      "side.TOP_15.qside_parRT":   { partNo: "NQ10SR", unit: 1.6, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Quarter Par-RT", category: "Side Panels" },
      "side.TOP_15.qside_parLT":   { partNo: "NQ10SL", unit: 1.6, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Quarter Par-LT", category: "Side Panels" },

      "side.TOP_20.side":          { partNo: "ST20HX", unit: 5.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Full", category: "Side Panels" },
      "side.TOP_20.side_parLT":    { partNo: "ST20HL", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Par-LT", category: "Side Panels" },
      "side.TOP_20.side_parRT":    { partNo: "ST20HR", unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Par-RT", category: "Side Panels" },
      "side.TOP_20.hside_a":       { partNo: "NH20AX", unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half A", category: "Side Panels" },
      "side.TOP_20.hside_a_parRT": { partNo: "NH20AR", unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half A Par-RT", category: "Side Panels" },
      "side.TOP_20.hside_a_parLT": { partNo: "NH20AL", unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half A Par-LT", category: "Side Panels" },
      "side.TOP_20.hside_b":       { partNo: "NH20BX", unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half B", category: "Side Panels" },
      "side.TOP_20.hside_b_parRT": { partNo: "NH20BR", unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half B Par-RT", category: "Side Panels" },
      "side.TOP_20.hside_b_parLT": { partNo: "NH20BL", unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half B Par-LT", category: "Side Panels" },

      "side.MID_TOP.side":         { partNo: "SF30MX", unit: 4.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Full", category: "Side Panels" },
      "side.MID_TOP.side_parLT":   { partNo: "SF30ML", unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Par-LT", category: "Side Panels" },
      "side.MID_TOP.side_parRT":   { partNo: "SF30MR", unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Par-RT", category: "Side Panels" },
      "side.MID_TOP.hside":        { partNo: "NH30MX", unit: 3.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Half", category: "Side Panels" },

      "side.MID_LOWER.side":       { partNo: "SF40LX", unit: 4.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Full", category: "Side Panels" },
      "side.MID_LOWER.side_parLT": { partNo: "SF40LL", unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Par-LT", category: "Side Panels" },
      "side.MID_LOWER.side_parRT": { partNo: "SF40LR", unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Par-RT", category: "Side Panels" },
      "side.MID_LOWER.hside":      { partNo: "NH40LX", unit: 3.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Half", category: "Side Panels" },

      "side.LOWER.side":           { partNo: "SF50LX", unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Full", category: "Side Panels" },
      "side.LOWER.side_parLT":     { partNo: "SF50LL", unit: 5.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Par-LT", category: "Side Panels" },
      "side.LOWER.side_parRT":     { partNo: "SF50LR", unit: 5.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Par-RT", category: "Side Panels" },
      "side.LOWER.side_nozzle":    { partNo: "SF50NZ", unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER Nozzle Panel", category: "Side Panels" },
      "side.LOWER.hside":          { partNo: "NH50LX", unit: 3.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Half", category: "Side Panels" },
      "side.LOWER.hside_parRT":    { partNo: "NH50LR", unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Half Par-RT", category: "Side Panels" },
      "side.LOWER.hside_parLT":    { partNo: "NH50LL", unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Half Par-LT", category: "Side Panels" },

      // Partitions
      "partition.TOP_15.partition":  { partNo: "PF10HU15", unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Full", category: "Partitions" },
      "partition.TOP_15.partition_2":{ partNo: "PF10HU152", unit: 4.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Full-2", category: "Partitions" },
      "partition.TOP_15.vert":       { partNo: "PF10HV15", unit: 4.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Vert", category: "Partitions" },
      "partition.TOP_15.vert_2":      { partNo: "PF10HV152", unit: 4.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Vert-2", category: "Partitions" },

      "partition.TOP_20.partition":  { partNo: "PF20HU20", unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Full", category: "Partitions" },
      "partition.TOP_20.partition_2":{ partNo: "PF20HU202", unit: 4.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Full-2", category: "Partitions" },
      "partition.TOP_20.vert":       { partNo: "PF20HV20", unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Vert", category: "Partitions" },
      "partition.TOP_20.vert_2":      { partNo: "PF20HV202", unit: 4.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Vert-2", category: "Partitions" },

      "partition.MID_TOP.partition": { partNo: "PF30MU", unit: 4.1, SKU: "WST-P0050RO", label: "Partition MID-TOP 1.0mH Full", category: "Partitions" },
      "partition.MID_TOP.vert":      { partNo: "PF30MV", unit: 4.1, SKU: "WST-P0050RO", label: "Partition MID-TOP 1.0mH Vert", category: "Partitions" },

      "partition.MID_LOWER.partition":{ partNo: "PF40LU", unit: 4.1, SKU: "WST-P0050RO", label: "Partition MID-LOWER 1.0mH Full", category: "Partitions" },
      "partition.MID_LOWER.vert":     { partNo: "PF40LV", unit: 4.1, SKU: "WST-P0050RO", label: "Partition MID-LOWER 1.0mH Vert", category: "Partitions" },

      "partition.LOWER.partition":   { partNo: "PF10HU10", unit: 4.1, SKU: "WST-P0050RO", label: "Partition LOWER 1.0mH Full", category: "Partitions" },
      "partition.LOWER.vert":        { partNo: "PF10HV10", unit: 4.1, SKU: "WST-P0050RO", label: "Partition LOWER 1.0mH Vert", category: "Partitions" },

      // Steel Accessories Items
      "corner_angle_10":           { partNo: "WCA-1000Z", unit: 1.0, SKU: "WST-P0120M", label: "Corner Angle 1.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_15":           { partNo: "WCA-1500Z", unit: 1.5, SKU: "WST-P0120M", label: "Corner Angle 1.5mH (HDG)", category: "Steel Accessories" },
      "corner_angle_20":           { partNo: "WCA-2000Z", unit: 2.0, SKU: "WST-P0120M", label: "Corner Angle 2.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_25":           { partNo: "WCA-2500Z", unit: 2.5, SKU: "WST-P0120M", label: "Corner Angle 2.5mH (HDG)", category: "Steel Accessories" },
      "corner_angle_30":           { partNo: "WCA-3000Z", unit: 3.0, SKU: "WST-P0120M", label: "Corner Angle 3.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_35":           { partNo: "WCA-3500Z", unit: 3.5, SKU: "WST-P0120M", label: "Corner Angle 3.5mH (HDG)", category: "Steel Accessories" },
      "corner_angle_40":           { partNo: "WCA-4000Z", unit: 4.0, SKU: "WST-P0120M", label: "Corner Angle 4.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_45":           { partNo: "WCA-4500Z", unit: 4.5, SKU: "WST-P0120M", label: "Corner Angle 4.5mH (HDG)", category: "Steel Accessories" },
      "corner_angle_50":           { partNo: "WCA-5000Z", unit: 5.0, SKU: "WST-P0120M", label: "Corner Angle 5.0mH (HDG)", category: "Steel Accessories" },

      "base_angle_10":             { partNo: "WBA-1010A", unit: 1.0, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 1.0m", category: "Steel Accessories" },
      "base_angle_15":             { partNo: "WBA-1510A", unit: 1.5, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 1.5m", category: "Steel Accessories" },
      "base_angle_20":             { partNo: "WBA-2010A", unit: 2.0, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 2.0m", category: "Steel Accessories" },
      "base_angle_25":             { partNo: "WBA-2510A", unit: 2.5, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 2.5m", category: "Steel Accessories" },
      "base_angle_30":             { partNo: "WBA-3010A", unit: 3.0, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 3.0m", category: "Steel Accessories" },
      "base_angle_35":             { partNo: "WBA-3510A", unit: 3.5, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 3.5m", category: "Steel Accessories" },
      "base_angle_40":             { partNo: "WBA-4010A", unit: 4.0, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 4.0m", category: "Steel Accessories" },
      "base_angle_45":             { partNo: "WBA-4510A", unit: 4.5, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 4.5m", category: "Steel Accessories" },
      "base_angle_50":             { partNo: "WBA-5010A", unit: 5.0, SKU: "WST-P0050RO", label: "Base Angle Frame Joint 5.0m", category: "Steel Accessories" }
    }
  };

  const PRESET_STORAGE_KEY = 'water_tank_sealing_tape_customer_presets_v1';
  const ACTIVE_BOM_KEY = 'water_tank_sealing_tape_active_bom_spec_v1';

  const defaultPresets = {
    ysacc: {
      id: 'ysacc',
      name: 'YSACC Spec',
      roles: JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles))
    },
    mnt: {
      id: 'mnt',
      name: 'MNT Spec',
      roles: JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles))
    },
    watani: {
      id: 'watani',
      name: 'WATANI Spec',
      roles: JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles))
    },
    almuftah: {
      id: 'almuftah',
      name: 'ALMUFTAH Spec',
      roles: JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles))
    }
  };

  let customerPresets = null;
  let selectedPresetId = 'ysacc';
  let activeBOMPresetId = 'ysacc';
  let activeCategoryFilter = 'ALL';

  function loadCustomerPresets() {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (raw) customerPresets = JSON.parse(raw);
    } catch (e) {}
    if (!customerPresets || typeof customerPresets !== 'object' || !Object.keys(customerPresets).length) {
      customerPresets = JSON.parse(JSON.stringify(defaultPresets));
    }
    // Auto-heal & merge any missing default roles into all customer presets
    if (customerPresets && typeof customerPresets === 'object') {
      Object.keys(customerPresets).forEach(pKey => {
        const p = customerPresets[pKey];
        if (p && typeof p === 'object') {
          if (!p.roles || typeof p.roles !== 'object') {
            p.roles = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles));
          } else {
            Object.keys(DEFAULT_MASTER_CONFIG.roles).forEach(rKey => {
              if (!p.roles[rKey]) {
                p.roles[rKey] = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles[rKey]));
              }
            });
          }
        }
      });
    }
    try {
      const rawBOM = localStorage.getItem(ACTIVE_BOM_KEY);
      if (rawBOM) {
        const parsed = JSON.parse(rawBOM);
        if (parsed.presetId) activeBOMPresetId = parsed.presetId;
      }
    } catch (e) {}
  }

  function saveCustomerPresets() {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(customerPresets));
      localStorage.setItem(ACTIVE_BOM_KEY, JSON.stringify({ presetId: activeBOMPresetId }));
    } catch (e) {}
  }

  function getMasterConfig(forActiveBOM = false) {
    if (!customerPresets) loadCustomerPresets();
    const presetId = forActiveBOM ? activeBOMPresetId : selectedPresetId;
    const preset = customerPresets[presetId] || customerPresets['ysacc'] || Object.values(customerPresets)[0];
    return {
      mainTapeSku: DEFAULT_MASTER_CONFIG.mainTapeSku,
      mainTapeName: DEFAULT_MASTER_CONFIG.mainTapeName,
      rollLengthMeters: DEFAULT_MASTER_CONFIG.rollLengthMeters,
      cornerTapeSku: DEFAULT_MASTER_CONFIG.cornerTapeSku,
      cornerTapeName: DEFAULT_MASTER_CONFIG.cornerTapeName,
      roles: (preset && preset.roles) ? preset.roles : DEFAULT_MASTER_CONFIG.roles
    };
  }

  function loadSealingTapeMaster() {
    loadCustomerPresets();
    return getMasterConfig(false);
  }

  function saveSealingTapeMaster(refreshModal = true) {
    saveCustomerPresets();
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

  function updateUrlHash(updateUrl) {
    if (updateUrl === false) return;
    if (typeof window === 'undefined' || !window.location) return;
    const cleanHash = 'sealing-tape/' + (selectedPresetId || 'ysacc');
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + cleanHash);
      } else {
        window.location.hash = cleanHash;
      }
    } catch (e) {}
  }

  function selectPreset(presetId, updateUrl = true) {
    if (!customerPresets) loadCustomerPresets();
    if (!customerPresets[presetId]) return;
    selectedPresetId = presetId;
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);
    if (updateUrl) updateUrlHash(true);
  }

  function applyToBOM() {
    activeBOMPresetId = selectedPresetId;
    saveCustomerPresets();
    if (typeof window.recalculateBOM === 'function') window.recalculateBOM();
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);
    const preset = customerPresets[activeBOMPresetId];
    alert(`[${preset ? preset.name : ''}] Sealing Tape Spec이 BOM 계산 수식에 적용되었습니다.`);
  }

  function addSpec() {
    const name = prompt('새 Sealing Tape Spec 이름을 입력하세요:');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const id = 'custom_' + Date.now();
    const currentRoles = getMasterConfig(false).roles;
    customerPresets[id] = {
      id: id,
      name: cleanName,
      roles: JSON.parse(JSON.stringify(currentRoles))
    };
    selectedPresetId = id;
    saveCustomerPresets();
    selectPreset(id);
  }

  function renameSpec() {
    const current = customerPresets[selectedPresetId];
    if (!current) return;
    const name = prompt('스펙 변경할 이름을 입력하세요:', current.name);
    if (!name || !name.trim()) return;
    current.name = name.trim();
    saveCustomerPresets();
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);
  }

  function copySpec() {
    const current = customerPresets[selectedPresetId];
    if (!current) return;
    const id = 'custom_' + Date.now();
    const copyName = current.name + ' (Copy)';
    customerPresets[id] = {
      id: id,
      name: copyName,
      roles: JSON.parse(JSON.stringify(current.roles))
    };
    selectedPresetId = id;
    saveCustomerPresets();
    selectPreset(id);
  }

  function deleteSpec() {
    const keys = Object.keys(customerPresets);
    if (keys.length <= 1) {
      alert('최소 1개의 Sealing Tape Spec은 유지되어야 합니다.');
      return;
    }
    const current = customerPresets[selectedPresetId];
    if (!confirm(`[${current ? current.name : ''}] Spec을 삭제하시겠습니까?`)) return;
    delete customerPresets[selectedPresetId];
    if (activeBOMPresetId === selectedPresetId) {
      activeBOMPresetId = Object.keys(customerPresets)[0];
    }
    selectedPresetId = Object.keys(customerPresets)[0];
    saveCustomerPresets();
    selectPreset(selectedPresetId);
  }

  function resetSpec() {
    const current = customerPresets[selectedPresetId];
    if (!confirm(`[${current ? current.name : ''}] Spec을 기본 설정값으로 초기화하시겠습니까?`)) return;
    customerPresets[selectedPresetId].roles = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG.roles));
    saveCustomerPresets();
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);
  }

  function exportExcel() {
    if (!customerPresets) loadCustomerPresets();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customerPresets, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `sealing_tape_spec_presets_${selectedPresetId}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  }

  function importExcel(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (typeof parsed === 'object' && parsed !== null) {
          customerPresets = parsed;
          saveCustomerPresets();
          const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
          if (container) renderSealingTapeManagerUI(container.id);
          alert('Sealing Tape Presets가 성공적으로 가져오기(Import) 되었습니다.');
        }
      } catch (err) {
        alert('올바른 Sealing Tape Preset JSON 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  }

  function getActiveBOMPresetId() {
    if (!customerPresets) loadCustomerPresets();
    return activeBOMPresetId || 'ysacc';
  }

  // Lookup unit meter by Part Number (품번) or Catalog Key
  function getPartNoUnitMeter(partNo, catalogKey) {
    const config = getMasterConfig(true); // for Active BOM calculation!
    const roles = config.roles;

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
    return null;
  }

  let showOnlyActiveQty = false;

  function resolveBOMQtyForRole(key, item, bomQtyMap, items) {
    if (!item) return 0;
    const pNoVal = item.partNo ? String(item.partNo).trim() : '';

    if (pNoVal && bomQtyMap[pNoVal] !== undefined && bomQtyMap[pNoVal] > 0) {
      return bomQtyMap[pNoVal];
    }
    if (!items || !items.length) return 0;

    let matchedQty = 0;
    const targetKey = String(key || '').toLowerCase();

    items.forEach(it => {
      if (!it || !it.partNo || !it.qty) return;
      const bPart = String(it.partNo).trim().toUpperCase();
      const bKey = String(it.catalogKey || '').toLowerCase();
      const qty = parseFloat(it.qty) || 0;

      if (pNoVal && bPart === pNoVal.toUpperCase()) {
        matchedQty += qty;
        return;
      }
      if (bKey && bKey === targetKey) {
        matchedQty += qty;
        return;
      }

      if (targetKey === 'roof_bottom.roof_full' && (bPart.startsWith('RF') || bPart.startsWith('RFO'))) {
        matchedQty += qty;
      } else if (targetKey === 'roof_bottom.manhole' && (bPart.startsWith('MF') || bPart.startsWith('MFO'))) {
        matchedQty += qty;
      } else if (targetKey === 'roof_bottom.base_full' && (bPart.startsWith('BF') || bPart.startsWith('BH'))) {
        matchedQty += qty;
      } else if (targetKey === 'roof_bottom.drain' && (bPart.startsWith('NF') || bPart.startsWith('DN'))) {
        matchedQty += qty;
      } else if (targetKey === 'side.top_15.side' && (bPart.startsWith('SL15') || bPart.startsWith('SF10'))) {
        matchedQty += qty;
      } else if (targetKey === 'side.top_20.side' && (bPart.startsWith('ST20') || bPart.startsWith('SL20'))) {
        matchedQty += qty;
      } else if (targetKey.startsWith('corner_angle_') && bPart.startsWith('WCA-')) {
        const hNum = targetKey.replace('corner_angle_', '');
        if (hNum === '10' && bPart.includes('1000')) matchedQty += qty;
        else if (hNum === '15' && bPart.includes('1500')) matchedQty += qty;
        else if (hNum === '20' && bPart.includes('2000')) matchedQty += qty;
        else if (hNum === '25' && bPart.includes('2500')) matchedQty += qty;
        else if (hNum === '30' && bPart.includes('3000')) matchedQty += qty;
        else if (hNum === '35' && bPart.includes('3500')) matchedQty += qty;
        else if (hNum === '40' && bPart.includes('4000')) matchedQty += qty;
        else if (hNum === '45' && bPart.includes('4500')) matchedQty += qty;
        else if (hNum === '50' && bPart.includes('5000')) matchedQty += qty;
      } else if (targetKey.startsWith('base_angle_') && bPart.startsWith('WBA-')) {
        const hNum = targetKey.replace('base_angle_', '');
        if (hNum === '10' && bPart.includes('1010')) matchedQty += qty;
        else if (hNum === '15' && bPart.includes('1510')) matchedQty += qty;
        else if (hNum === '20' && bPart.includes('2010')) matchedQty += qty;
        else if (hNum === '25' && bPart.includes('2510')) matchedQty += qty;
        else if (hNum === '30' && bPart.includes('3010')) matchedQty += qty;
        else if (hNum === '35' && bPart.includes('3510')) matchedQty += qty;
        else if (hNum === '40' && bPart.includes('4010')) matchedQty += qty;
        else if (hNum === '45' && bPart.includes('4510')) matchedQty += qty;
        else if (hNum === '50' && bPart.includes('5010')) matchedQty += qty;
      }
    });

    return matchedQty;
  }

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
      if (!item) return;
      const qty = resolveBOMQtyForRole(key, item, bomQtyMap, items);
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
        // Default to false unless explicitly set in session
        showOnlyActiveQty = (params.get('st_qty_only') === '1');
      } else {
        showOnlyActiveQty = false;
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

  let activeRenderContainerId = null;
  
  function renderSealingTapeManagerUI(containerId) {
    activeRenderContainerId = containerId;
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

      const bomQty = resolveBOMQtyForRole(key, item, bomQtyMap, activeBomItems);

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
      
      const parts = (typeof window !== 'undefined' && Array.isArray(window.partsDb)) ? window.partsDb : [];
      const dbPart = item.partNo ? parts.find(p => String(p.partNo || p.id).trim().toLowerCase() === String(item.partNo).trim().toLowerCase()) : null;
      const dbConnectedHtml = dbPart
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" title="DB Connected"><polyline points="20 6 9 17 4 12"></polyline></svg>`
        : (item.partNo && item.partNo !== '-' ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" title="DB Not Connected (Unknown Part No.)"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>` : '');

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
              style="padding: 6px 4px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px; white-space: nowrap; cursor: grab;" title="Drag to reorder">
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
              <div style="flex: 1; display: flex; align-items: center; background: ${dbPart ? '#dcfce7' : '#ffffff'}; border: 1px solid ${dbPart ? '#86efac' : '#7dd3fc'}; border-radius: 4px; padding: 1px 4px; min-width: 0;">
                <input type="text" value="${escapeHtml(partNoDisplay !== '-' ? partNoDisplay : '')}" oninput="SealingTapeEditor.updatePartNo('${key}', this.value, false)" onchange="SealingTapeEditor.updatePartNo('${key}', this.value, true)" onkeydown="SealingTapeEditor.handleInputKeydown(event, this)" placeholder="Part No." style="flex: 1; min-width: 0; width: 100%; border: none; outline: none; background: transparent; font-family: monospace; font-size: 11px; font-weight: 800; color: #0284c7;">
                <span style="flex-shrink: 0; margin-left: 2px;">${dbConnectedHtml}</span>
              </div>
              <button type="button" onclick="SealingTapeEditor.openPartNoPickerForKey('${key}')" title="Search & select Part No. from Master DB" style="flex-shrink: 0; background: #0284c7; border: none; color: #ffffff; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(2,132,199,0.25); transition: background 0.15s;" onmouseover="this.style.background='#0369a1';" onmouseout="this.style.background='#0284c7';">
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
            <button type="button" onclick="SealingTapeEditor.duplicateRole('${key}')" title="Duplicate item below" style="background: #e0f2fe; border: 1px solid #38bdf8; color: #0284c7; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(2,132,199,0.15);" onmouseover="this.style.background='#0284c7'; this.style.color='#ffffff';" onmouseout="this.style.background='#e0f2fe'; this.style.color='#0284c7';">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" onclick="SealingTapeEditor.deleteRole('${key}')" title="Delete item" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; margin-left: 5px; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(220,38,38,0.15);" onmouseover="this.style.background='#dc2626'; this.style.color='#ffffff';" onmouseout="this.style.background='#fee2e2'; this.style.color='#dc2626';">
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
          <span style="font-size: 15px; font-weight: 800; color: ${numColor};">${sub.bomMetersSum.toFixed(1)} m <span style="font-size: 12px; font-weight: 800; color: ${badgeColor}; background: ${badgeBg}; padding: 1px 6px; border-radius: 10px;">(Order: ${pkgQty} ${pkgUnit})</span></span>
        </div>
      `;
    }).join('');

    if (!customerPresets) loadCustomerPresets();
    const activePreset = customerPresets[selectedPresetId] || customerPresets['ysacc'] || Object.values(customerPresets)[0];
    const activeBOMPreset = customerPresets[activeBOMPresetId] || customerPresets['ysacc'] || Object.values(customerPresets)[0];

    const html = `
      <div style="background: #ffffff; padding: 18px; border-radius: 12px; border: 1.5px solid #0284c7; box-shadow: 0 4px 15px rgba(2,132,199,0.08);">
        <!-- Top Control Header (Matching Internal Tie-Rod Spec Mapping) -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2px solid #cbd5e1; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <i class="fa-solid fa-ribbon" style="color: #0284c7; font-size: 18px;"></i>
              <span>Sealing Tape Spec Mapping</span>
              <span style="font-size: 11px; font-weight: bold; color: #15803d; background: #dcfce7; padding: 3px 10px; border-radius: 12px; border: 1px solid #bbf7d0; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-circle-check"></i> Active BOM Spec: [${escapeHtml(activeBOMPreset ? activeBOMPreset.name : 'YSACC Spec')}]
              </span>
            </h3>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">
              * Sealing Tape unit lengths (m/PCS) and master mapping rules per customer specification.
              <span style="font-weight: bold; color: #0284c7; margin-left: 5px;">(Currently viewing [${escapeHtml(activePreset ? activePreset.name : 'YSACC Spec')}])</span>
            </div>
          </div>

          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button type="button" onclick="SealingTapeEditor.applyToBOM()" style="height: 32px; padding: 0 12px; font-size: 11.5px; font-weight: 700; background: #16a34a; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 5px rgba(22,163,74,0.25);">
              <i class="fa-solid fa-circle-check"></i> Apply to BOM
            </button>
            <button type="button" onclick="SealingTapeEditor.addSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; font-weight: 700; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
              <i class="fa-solid fa-plus"></i> Add Spec
            </button>
            <button type="button" onclick="SealingTapeEditor.renameSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; font-weight: 700; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
              <i class="fa-solid fa-pen"></i> Rename Spec
            </button>
            <button type="button" onclick="SealingTapeEditor.copySpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; font-weight: 700; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
              <i class="fa-solid fa-copy"></i> Copy Spec
            </button>
            <button type="button" onclick="SealingTapeEditor.deleteSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; font-weight: 700; color: #dc2626; border: 1px solid #fca5a5; background: #ffffff; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
            <button type="button" onclick="SealingTapeEditor.exportExcel()" style="height: 32px; padding: 0 10px; font-size: 11.5px; border: 1px solid #10b981; color: #059669; display: flex; align-items: center; gap: 5px; font-weight: 700; background: #ffffff; cursor: pointer; border-radius: 6px;">
              <i class="fa-solid fa-file-excel"></i> Export Excel
            </button>
            <label for="sealingTapeExcelFileInput" style="height: 32px; padding: 0 10px; font-size: 11.5px; border: 1px solid #2563eb; color: #2563eb; display: flex; align-items: center; gap: 5px; font-weight: 700; background: #ffffff; cursor: pointer; border-radius: 6px; margin: 0;">
              <i class="fa-solid fa-file-import"></i> Import Excel
            </label>
            <input type="file" id="sealingTapeExcelFileInput" accept=".json, .xlsx, .xls" onchange="SealingTapeEditor.importExcel(event)" style="display: none;">
            <button type="button" onclick="SealingTapeEditor.resetSpec()" style="height: 32px; padding: 0 10px; font-size: 11.5px; font-weight: 700; border: 1px solid #f43f5e; color: #e11d48; display: flex; align-items: center; gap: 5px; background: #ffffff; border-radius: 6px; cursor: pointer;">Reset</button>
            <button type="button" onclick="SealingTapeEditor.addCustomRolePrompt()" style="height: 32px; padding: 0 10px; font-size: 11.5px; font-weight: 700; background: #0284c7; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; margin-left: 4px;">
              <i class="fa-solid fa-plus"></i> Add Item
            </button>
          </div>
        </div>

        <!-- Step 1: Select Customer Spec Preset -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11.5px; font-weight: 800; color: #475569; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-building" style="color: #0284c7;"></i>
            <span>Step 1: Select Customer Spec Preset</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; overflow-x: auto; padding-bottom: 4px; flex-wrap: wrap;">
            ${Object.keys(customerPresets).map((presetKey) => {
              const p = customerPresets[presetKey];
              const isSelected = selectedPresetId === presetKey;
              const isBOM = activeBOMPresetId === presetKey;
              return `
                <button type="button" onclick="SealingTapeEditor.selectPreset('${presetKey}')" style="padding: 7px 16px; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; border: ${isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1'}; background: ${isSelected ? '#0284c7' : '#ffffff'}; color: ${isSelected ? '#ffffff' : '#334155'}; box-shadow: ${isSelected ? '0 2px 6px rgba(2,132,199,0.2)' : 'none'};">
                  <span>${escapeHtml(p.name)}</span>
                  ${isBOM ? `<span style="font-size: 9px; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: ${isSelected ? '#ffffff' : '#16a34a'}; color: ${isSelected ? '#16a34a' : '#ffffff'};">Active BOM</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Total Summary Cards Bar -->
        <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 130px; background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 8px 12px;">
            <span style="font-size: 11px; font-weight: 700; color: #0369a1; display: block;">📋 Total Items (Total Roles)</span>
            <span style="font-size: 16px; font-weight: 800; color: #0284c7;">${totalItems} Items</span>
          </div>
          ${summaryCardsHtml}
          <div style="flex: 1.2; min-width: 170px; background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 8px 12px;">
            <span style="font-size: 11px; font-weight: 700; color: #a16207; display: block;">🧮 Total Tank Sealing Tape Length</span>
            <span style="font-size: 16px; font-weight: 800; color: #854d0e;">${totalCalculatedMetersSum.toFixed(1)} m</span>
          </div>
        </div>

        <!-- Category & Q'ty Filter Buttons Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <!-- Left: Category Filter Pills -->
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('ALL')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'ALL' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'ALL' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🌐 All</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('PANELS')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'PANELS' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'PANELS' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🧱 All Panels</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Steel Accessories')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'Steel Accessories' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'Steel Accessories' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🔩 Steel Accessories</button>

            <span style="display: inline-block; height: 16px; border-right: 1px solid #cbd5e1; margin: 0 3px;"></span>

            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Roof & Bottom')" style="padding: 4px 9px; font-size: 10.5px; font-weight: 600; border-radius: 20px; border: 1px solid #7dd3fc; background: ${activeCategoryFilter === 'Roof & Bottom' ? '#0369a1' : '#f0f9ff'}; color: ${activeCategoryFilter === 'Roof & Bottom' ? '#ffffff' : '#0369a1'}; cursor: pointer;">Roof & Bottom</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Side Panels')" style="padding: 4px 9px; font-size: 10.5px; font-weight: 600; border-radius: 20px; border: 1px solid #7dd3fc; background: ${activeCategoryFilter === 'Side Panels' ? '#0369a1' : '#f0f9ff'}; color: ${activeCategoryFilter === 'Side Panels' ? '#ffffff' : '#0369a1'}; cursor: pointer;">Side</button>
            <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Partitions')" style="padding: 4px 9px; font-size: 10.5px; font-weight: 600; border-radius: 20px; border: 1px solid #7dd3fc; background: ${activeCategoryFilter === 'Partitions' ? '#0369a1' : '#f0f9ff'}; color: ${activeCategoryFilter === 'Partitions' ? '#ffffff' : '#0369a1'}; cursor: pointer;">Partitions</button>
          </div>

          <!-- Right: Q'ty > 0 Only Filter Toggle Button -->
          <div>
            <button type="button" onclick="SealingTapeEditor.toggleShowOnlyActiveQty()" style="padding: 5px 13px; font-size: 11px; font-weight: 800; border-radius: 20px; border: 1.5px solid ${showOnlyActiveQty ? '#059669' : '#0284c7'}; background: ${showOnlyActiveQty ? '#dcfce7' : '#ffffff'}; color: ${showOnlyActiveQty ? '#15803d' : '#0284c7'}; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: ${showOnlyActiveQty ? '0 2px 6px rgba(5,150,105,0.25)' : 'none'};">
              <i class="fa-solid ${showOnlyActiveQty ? 'fa-square-check' : 'fa-square'}" style="font-size: 13px;"></i> 📦 Show items with BOM Qty > 0 (Q'ty > 0)
            </button>
          </div>
        </div>

        <!-- Master Matrix Table -->
        <div class="table-wrapper" style="max-height: 520px; overflow-y: auto; overflow-x: auto; border: 1.5px solid #0284c7; border-radius: 8px;">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
            <thead>
              <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0; z-index: 10;">
                <th onclick="SealingTapeEditor.sortByColumn('no')" style="padding: 8px 4px; border: 1px solid #bae6fd; width: 45px; text-align: center; color: #0369a1; font-weight: 800; cursor: pointer;" title="Sort by No">No. ${currentSortCol === 'no' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('label')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 175px; color: #0369a1; font-weight: 800; cursor: pointer;" title="Sort by Section / Part Name">Section / Part Name ✏️ ${currentSortCol === 'label' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('partNo')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 110px; color: #0369a1; font-weight: 800; cursor: pointer;" title="Sort by Part No">Part No. ✏️ ${currentSortCol === 'partNo' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('bomQty')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 80px; text-align: center; color: #0369a1; font-weight: 800; background: #bae6fd; cursor: pointer;" title="Sort by BOM Qty">BOM Qty 📦 ${currentSortCol === 'bomQty' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('unit')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 80px; text-align: right; color: #0369a1; font-weight: 800; cursor: pointer;" title="Sort by Unit Length">Unit Length (m) ✏️ ${currentSortCol === 'unit' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('totalMeters')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 90px; text-align: right; color: #047857; font-weight: 800; background: #a7f3d0; cursor: pointer;" title="Sort by Total Length">Total Length (m) ${currentSortCol === 'totalMeters' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onclick="SealingTapeEditor.sortByColumn('sku')" style="padding: 8px 6px; border: 1px solid #bae6fd; width: 160px; color: #0369a1; font-weight: 800; cursor: pointer;" title="Sort by Actual Sealing Tape SKU">Actual Sealing Tape SKU ${currentSortCol === 'sku' ? (currentSortDir === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th style="padding: 8px 6px; border: 1px solid #bae6fd; width: 85px; text-align: center; color: #0369a1; font-weight: 800;">Action</th>
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
                      ${isCorner ? '🟩' : '🟦'} ${escapeHtml(labelText)} Subtotal:
                    </td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: center; ${textColor} font-weight: 800;">${sub.bomQtySum} PCS</td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: right; ${textColor} font-weight: 800;">${sub.unitSum.toFixed(1)} m/PCS</td>
                    <td style="padding: 6px 8px; ${borderColor} text-align: right; ${textColor} font-weight: 800; ${highlightBg}">${sub.bomMetersSum.toFixed(1)} m</td>
                    <td style="padding: 6px 8px; ${borderColor} ${textColor} font-weight: 800;">📦 Order Qty: ${pkgQty} ${pkgUnit} (${sub.count} items)</td>
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

  function getActivePreset() {
    if (!customerPresets) loadCustomerPresets();
    return customerPresets[selectedPresetId] || customerPresets['ysacc'] || Object.values(customerPresets)[0];
  }

  function escapeJsStr(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function updateRoleLabel(key, val, isFinalCommit = true) {
    const trimmed = String(val || '').trim();
    if (!trimmed) return;
    const preset = getActivePreset();
    if (preset && preset.roles && preset.roles[key]) {
      preset.roles[key].label = trimmed;
      if (isFinalCommit) {
        saveSealingTapeMaster(false);
      }
    }
  }

  function updatePartNo(key, val, isFinalCommit = true) {
    const trimmed = String(val || '').trim();
    const preset = getActivePreset();
    if (preset && preset.roles && preset.roles[key]) {
      preset.roles[key].partNo = trimmed;
      if (isFinalCommit) {
        saveSealingTapeMaster(true);
      }
    }
  }

  function updateRoleUnit(key, val, isFinalCommit = true) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    const preset = getActivePreset();
    if (preset && preset.roles) {
      if (!preset.roles[key]) preset.roles[key] = { unit: num, SKU: 'WST-P0050RO', label: key, category: 'Custom' };
      preset.roles[key].unit = num;
      if (isFinalCommit) {
        saveSealingTapeMaster(false);
      }
    }
  }

  function updateRoleSku(key, sku) {
    const preset = getActivePreset();
    if (preset && preset.roles && preset.roles[key]) {
      preset.roles[key].SKU = sku;
      saveSealingTapeMaster(false);
    }
  }

  function resetRoleUnit(key) {
    const preset = getActivePreset();
    if (preset && preset.roles && DEFAULT_MASTER_CONFIG.roles[key]) {
      preset.roles[key].unit = DEFAULT_MASTER_CONFIG.roles[key].unit;
      preset.roles[key].SKU = DEFAULT_MASTER_CONFIG.roles[key].SKU;
      preset.roles[key].partNo = DEFAULT_MASTER_CONFIG.roles[key].partNo;
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
    if (confirm("실링테이프 마스터 설정을 기본값으로 초기화하시겠습니까?")) {
      customerPresets = JSON.parse(JSON.stringify(defaultPresets));
      selectedPresetId = 'ysacc';
      activeBOMPresetId = 'ysacc';
      saveCustomerPresets();
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
            <i class="fa-solid fa-circle-info" style="color: #0284c7;"></i> Press <strong>ESC</strong> key or click backdrop to close.
          </span>
          <button type="button" onclick="document.getElementById('partMasterPickerModal')?.remove()" style="background: #ef4444; color: #ffffff; border: none; border-radius: 8px; padding: 8px 20px; font-size: 12.5px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(239,68,68,0.35);">
            <i class="fa-solid fa-xmark"></i> Close (ESC)
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
            Select Part No. (Part Master DB)
            <span style="font-size: 11px; background: rgba(255,255,255,0.2); padding: 2px 10px; border-radius: 20px;">${escapeHtml(currentLabel)} — Current: ${escapeHtml(currentPartNo)}</span>
          </h3>
          <button type="button" onclick="document.getElementById('${modalId}')?.remove()" style="background: rgba(255,255,255,0.2); border: none; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; font-size: 20px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;" title="Close">&times;</button>
        </div>

        <div style="padding: 14px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px;">
          <div style="position: relative; flex: 1;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="partNoPickerSearch" value="" oninput="SealingTapeEditor.filterPartNoPicker('${key}')" placeholder="Search by Part No., Part Name, Specification (e.g. MF00TX, RF00TX)..." style="width: 100%; padding: 8px 12px 8px 36px; border: 2px solid #0284c7; border-radius: 8px; font-size: 12px; font-weight: 600; outline: none; box-sizing: border-box;">
          </div>
        </div>

        <div id="partNoPickerGrid" style="padding: 16px 20px; overflow-y: auto; flex: 1;"></div>

        <div style="padding: 12px 20px; background: #f1f5f9; border-top: 1px solid #cbd5e1; display: flex; justify-content: flex-end;">
          <button type="button" onclick="document.getElementById('${modalId}')?.remove()" style="background: #ef4444; color: #ffffff; border: none; border-radius: 8px; padding: 8px 20px; font-size: 12.5px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            &times; Close (ESC)
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
      const idStr   = String(p.partNo || p.id || '').toLowerCase();
      const nameKo  = String(p.nameKo || '').toLowerCase();
      const nameEn  = String(p.nameEn || '').toLowerCase();
      const specStr = String(p.spec || '').toLowerCase();
      return idStr.includes(query) || nameKo.includes(query) || nameEn.includes(query) || specStr.includes(query);
    });

    let html = `
      <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
        <thead>
          <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0;">
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 40px; text-align: center; color: #0369a1;">No.</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 140px; color: #0369a1; font-weight: 800;">Part No.</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-weight: 800;">Part Name</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 180px; color: #0369a1; font-weight: 800;">Specification</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 100px; color: #0369a1; font-weight: 800;">Category</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 70px; text-align: center; color: #0369a1; font-weight: 800;">Select</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (filtered.length === 0) {
      html += `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #94a3b8; font-weight: 700;">No search results found.</td></tr>`;
    } else {
      filtered.slice(0, 150).forEach((p, i) => {
        const partNo   = p.partNo || p.id || 'UNKNOWN';
        const name     = p.nameKo || p.nameEn || p.partName || partNo;
        const spec     = p.spec || '-';
        const category = p.category || 'General';
        html += `
          <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; cursor: pointer;" onclick="SealingTapeEditor.selectPartNoForKey('${escapeJsStr(key)}', '${escapeJsStr(partNo)}')">
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${i + 1}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #0284c7; background: #f0f9ff;">${escapeHtml(partNo)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${escapeHtml(name)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #475569;">${escapeHtml(spec)}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${escapeHtml(category)}</span></td>
            <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">
              <button type="button" onclick="event.stopPropagation(); SealingTapeEditor.selectPartNoForKey('${escapeJsStr(key)}', '${escapeJsStr(partNo)}')" style="background: #0284c7; color: #ffffff; border: none; border-radius: 4px; padding: 3px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">Select</button>
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table>`;
    grid.innerHTML = html;
  }

  function selectPartNoForKey(key, partNo) {
    if (!key) return;
    const cleanPartNo = String(partNo || '').trim();
    if (!cleanPartNo) return;

    const preset = getActivePreset();
    if (preset && preset.roles) {
      if (!preset.roles[key]) {
        preset.roles[key] = { partNo: cleanPartNo, unit: 2.1, SKU: 'WST-P0050RO', label: key, category: 'Custom' };
      } else {
        preset.roles[key].partNo = cleanPartNo;
      }
    }

    activeBOMPresetId = selectedPresetId;

    const modal = document.getElementById('partNoPickerForKeyModal');
    if (modal) modal.remove();

    // Reset Q'ty filter to false & highlight newly selected row in yellow glow immediately
    showOnlyActiveQty = false;
    highlightedRoleKey = key;

    saveSealingTapeMaster(true);
    syncSealingTapeStateToURL();

    setTimeout(() => {
      highlightedRoleKey = null;
    }, 4000);
  }

  function filterPickerParts() {
    const searchEl = document.getElementById('partMasterPickerSearch');
    const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
    const grid = document.getElementById('partMasterPickerGrid');
    if (!grid) return;

    const parts = (typeof window !== 'undefined' && Array.isArray(window.partsDb)) ? window.partsDb : [];

    const filtered = parts.filter(p => {
      if (!query) return true;
      const idStr = String(p.partNo || p.id || '').toLowerCase();
      const nameKoStr = String(p.nameKo || '').toLowerCase();
      const nameEnStr = String(p.nameEn || '').toLowerCase();
      const specStr = String(p.spec || '').toLowerCase();
      return idStr.includes(query) || nameKoStr.includes(query) || nameEnStr.includes(query) || specStr.includes(query);
    });

    let html = `
      <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
        <thead>
          <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0;">
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 40px; text-align: center; color: #0369a1;">No.</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 140px; color: #0369a1; font-weight: 800;">Part No.</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-weight: 800;">Part Name</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 160px; color: #0369a1; font-weight: 800;">Specification</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 110px; color: #0369a1; font-weight: 800;">Category</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 100px; text-align: right; color: #0369a1; font-weight: 800;">Tape Meter (m)</th>
            <th style="padding: 8px; border: 1px solid #bae6fd; width: 70px; text-align: center; color: #0369a1; font-weight: 800;">Select</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (filtered.length === 0) {
      html += `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #94a3b8; font-weight: 700;">No search results found. Use [Register New Part No.] button at top.</td></tr>`;
    } else {
      filtered.slice(0, 100).forEach((p, idx) => {
        const partNo = p.partNo || p.id || 'UNKNOWN';
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
              <button type="button" onclick="SealingTapeEditor.selectPartFromPicker('${escapeJsStr(partNo)}', '${escapeJsStr(name)}', ${tapeMeters}, '${escapeJsStr(category)}')" style="background: #0284c7; color: #ffffff; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">Select</button>
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table>`;
    grid.innerHTML = html;
  }

  function selectPartFromPicker(partNo, label, tapeMeters, category) {
    const unitStr = prompt(`[${partNo}] ${label} - Enter required sealing tape meters (m/PCS):`, tapeMeters || "1.5");
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
    const partNo = prompt("Enter new Part No. / SKU to register in PART MASTER DB:", "WCA-2510");
    if (!partNo) return;
    const name = prompt("Enter Part Name:", "Corner Angle 2.5mH (HDG)");
    if (!name) return;
    const spec = prompt("Enter Specification:", "L75x75x6t x 2.5mH");
    if (!spec) return;
    const unitMetersStr = prompt("Enter required sealing tape meters (m/PCS):", "2.5");
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
            <i class="fa-solid fa-ribbon"></i> Sealing Tape Part No. & Height Rule Master Settings (Sealing Tape Master Manager)
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
    
    // Real-time DB sync: re-render UI when custom_parts_db is updated globally
    window.addEventListener('partsDbUpdated', () => {
      if (activeRenderContainerId && document.getElementById(activeRenderContainerId)) {
        renderSealingTapeManagerUI(activeRenderContainerId);
      }
      // Also refresh the Part No Picker modal if it is open
      const searchEl = document.getElementById('partNoPickerSearch');
      if (searchEl) {
        // the oninput handler expects the key to be passed, but we don't store it globally.
        // Instead, we can just trigger a re-evaluation of the parts by simulating an input.
        // We actually store the key in the HTML oninput attribute string. We can extract it or simply rely on the UI being re-rendered and the user opening it again. But let's at least try to trigger the filter.
        searchEl.dispatchEvent(new Event('input'));
      }
    });
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
    selectPartNoForKey: selectPartNoForKey,
    selectPreset: selectPreset,
    applyToBOM: applyToBOM,
    addSpec: addSpec,
    renameSpec: renameSpec,
    copySpec: copySpec,
    deleteSpec: deleteSpec,
    resetSpec: resetSpec,
    exportExcel: exportExcel,
    importExcel: importExcel,
    updateUrlHash: updateUrlHash,
    getActiveBOMPresetId: getActiveBOMPresetId,
    get activePresetId() { return selectedPresetId; },
    get activeBOMPresetId() { return activeBOMPresetId; }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SealingTapeEditor;
  } else {
    global.SealingTapeEditor = SealingTapeEditor;
  }
})(typeof window !== "undefined" ? window : globalThis);
