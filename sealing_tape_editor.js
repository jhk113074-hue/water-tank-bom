/**
 * sealing_tape_editor.js - Sealing Tape Master Settings & Panel Matrix Manager
 * Provides a dedicated SYSTEM SETTINGS manager for Sealing Tape unit lengths,
 * SKU mappings, and formulas across all height grades (1.0mH to 5.0mH).
 */

(function (global) {
  "use strict";

  const STORAGE_KEY = 'YSACC_SEALING_TAPE_MASTER_V1';

  // Default Master Configuration
  const DEFAULT_MASTER_CONFIG = {
    mainTapeSku: 'WST-P0050RO',
    mainTapeName: 'PVC SEALANT 3mm (30M/Roll)',
    rollLengthMeters: 30,
    cornerTapeSku: 'WST-P0120M',
    cornerTapeName: 'CORNER ANGLE PVC SEALANT 1M',

    // Unit lengths per panel catalog role across 1.0mH to 5.0mH
    roles: {
      "roof_bottom.manhole":       { unit: 2.1, SKU: "WST-P0050RO", label: "Roof Manhole (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.roof_full":     { unit: 2.1, SKU: "WST-P0050RO", label: "Roof Full (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.roof_half":     { unit: 1.6, SKU: "WST-P0050RO", label: "Roof Half (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.roof_quarter":  { unit: 0.6, SKU: "WST-P0050RO", label: "Roof Quarter (0.5x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.base_full":     { unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Full (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.base_par":      { unit: 5.1, SKU: "WST-P0050RO", label: "Bottom Par (1x1m)", category: "Roof & Bottom" },
      "roof_bottom.hbase":         { unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Half (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.hbase_short":   { unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Half Short (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.hbase_long":    { unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Half Long (1x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.qbase":         { unit: 4.1, SKU: "WST-P0050RO", label: "Bottom Quarter (0.5x0.5m)", category: "Roof & Bottom" },
      "roof_bottom.drain":         { unit: 4.1, SKU: "WST-P0050RO", label: "Drain Panel (1x1m)", category: "Roof & Bottom" },

      "side.TOP_15.side":          { unit: 4.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Full", category: "Side (Top 1.5m)" },
      "side.TOP_15.side_parLT":    { unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Par-LT", category: "Side (Top 1.5m)" },
      "side.TOP_15.side_parRT":    { unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Par-RT", category: "Side (Top 1.5m)" },
      "side.TOP_15.hside":         { unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 1.5mH Half", category: "Side (Top 1.5m)" },

      "side.TOP_20.side":          { unit: 5.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Full", category: "Side (Top 2.0m)" },
      "side.TOP_20.side_parLT":    { unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Par-LT", category: "Side (Top 2.0m)" },
      "side.TOP_20.side_parRT":    { unit: 6.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Par-RT", category: "Side (Top 2.0m)" },
      "side.TOP_20.hside_a":       { unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half A", category: "Side (Top 2.0m)" },
      "side.TOP_20.hside_b":       { unit: 3.1, SKU: "WST-P0050RO", label: "Side TOP 2.0mH Half B", category: "Side (Top 2.0m)" },

      "side.MID_TOP.side":         { unit: 4.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Full", category: "Side (Mid 1.0m)" },
      "side.MID_TOP.side_parLT":   { unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Par-LT", category: "Side (Mid 1.0m)" },
      "side.MID_TOP.side_parRT":   { unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Par-RT", category: "Side (Mid 1.0m)" },
      "side.MID_TOP.hside":        { unit: 3.1, SKU: "WST-P0050RO", label: "Side MID-TOP 1.0mH Half", category: "Side (Mid 1.0m)" },

      "side.MID_LOWER.side":       { unit: 4.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Full", category: "Side (Mid 1.0m)" },
      "side.MID_LOWER.side_parLT": { unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Par-LT", category: "Side (Mid 1.0m)" },
      "side.MID_LOWER.side_parRT": { unit: 5.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Par-RT", category: "Side (Mid 1.0m)" },
      "side.MID_LOWER.hside":      { unit: 3.1, SKU: "WST-P0050RO", label: "Side MID-LOWER 1.0mH Half", category: "Side (Mid 1.0m)" },

      "side.LOWER.side":           { unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Full", category: "Side (Lower 1.0m)" },
      "side.LOWER.side_parLT":     { unit: 5.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Par-LT", category: "Side (Lower 1.0m)" },
      "side.LOWER.side_parRT":     { unit: 5.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Par-RT", category: "Side (Lower 1.0m)" },
      "side.LOWER.side_nozzle":    { unit: 4.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Nozzle", category: "Side (Lower 1.0m)" },
      "side.LOWER.hside":          { unit: 3.1, SKU: "WST-P0050RO", label: "Side LOWER 1.0mH Half", category: "Side (Lower 1.0m)" },

      "partition.TOP_15.partition":{ unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Full", category: "Partition" },
      "partition.TOP_15.vert":     { unit: 4.1, SKU: "WST-P0050RO", label: "Partition TOP 1.5mH Vert", category: "Partition" },
      "partition.TOP_20.partition":{ unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Full", category: "Partition" },
      "partition.TOP_20.vert":     { unit: 3.1, SKU: "WST-P0050RO", label: "Partition TOP 2.0mH Vert", category: "Partition" },
      "partition.MID_TOP.partition":{ unit: 4.1, SKU: "WST-P0050RO", label: "Partition MID-TOP 1.0mH Full", category: "Partition" },
      "partition.MID_LOWER.partition":{ unit: 4.1, SKU: "WST-P0050RO", label: "Partition MID-LOWER 1.0mH Full", category: "Partition" },
      "partition.LOWER.partition": { unit: 4.1, SKU: "WST-P0050RO", label: "Partition LOWER 1.0mH Full", category: "Partition" },

      "corner_angle":              { unit: 1.0, SKU: "WST-P0120M", label: "모서리 세로 조인트 (Corner Angle 4 corners x H)", category: "Corner Joint" }
    }
  };

  let masterConfig = null;

  // Load config from LocalStorage
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
    return masterConfig;
  }

  // Save config to LocalStorage
  function saveSealingTapeMaster() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(masterConfig));
    } catch (e) {
      console.error("Failed to save Sealing Tape Master config:", e);
    }
    if (typeof window.renderAll === 'function') window.renderAll();
    if (typeof window.renderReinforcingAuditView === 'function') window.renderReinforcingAuditView();
    if (typeof window.updatePrintoutSheet === 'function') window.updatePrintoutSheet();
  }

  // Public getter for unit length of any catalog key
  function getRoleUnitMeter(catalogKey) {
    if (!masterConfig) loadSealingTapeMaster();
    if (masterConfig.roles[catalogKey] && masterConfig.roles[catalogKey].unit !== undefined) {
      return masterConfig.roles[catalogKey].unit;
    }
    if (DEFAULT_MASTER_CONFIG.roles[catalogKey]) {
      return DEFAULT_MASTER_CONFIG.roles[catalogKey].unit;
    }
    return null;
  }

  // Public getter for master config
  function getMasterConfig() {
    if (!masterConfig) loadSealingTapeMaster();
    return masterConfig;
  }

  // Render Sealing Tape Manager View in UI
  function renderSealingTapeManagerUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const config = getMasterConfig();
    const roles = config.roles;

    let rowsHtml = '';
    let idx = 1;

    Object.keys(roles).forEach((key) => {
      const item = roles[key];
      const defaultUnit = DEFAULT_MASTER_CONFIG.roles[key] ? DEFAULT_MASTER_CONFIG.roles[key].unit : item.unit;
      const isModified = (item.unit !== defaultUnit);

      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${isModified ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')};">
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">${idx++}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-size: 11px;">
            <span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-right: 6px;">${escapeHtml(item.category || 'General')}</span>
            ${escapeHtml(item.label || key)}
            ${isModified ? `<span style="font-size: 9.5px; color: #0284c7; font-weight: 800; margin-left: 4px;">(수식/값 수정됨)</span>` : ''}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 10.5px; color: #475569;">${escapeHtml(key)}</td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right;">
            <input type="number" step="0.1" min="0" value="${item.unit}" onchange="SealingTapeEditor.updateRoleUnit('${key}', this.value)" style="width: 85px; text-align: right; font-weight: 800; color: #0284c7; padding: 4px 6px; border: 2px solid ${isModified ? '#0284c7' : '#38bdf8'}; border-radius: 6px; background: #ffffff;">
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #334155;">
            <select onchange="SealingTapeEditor.updateRoleSku('${key}', this.value)" style="padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11px;">
              <option value="WST-P0050RO" ${item.SKU === 'WST-P0050RO' ? 'selected' : ''}>WST-P0050RO (3mm PVC 30M/Roll)</option>
              <option value="WST-P0120M" ${item.SKU === 'WST-P0120M' ? 'selected' : ''}>WST-P0120M (Corner PVC 1M)</option>
              <option value="WST-EPDM50" ${item.SKU === 'WST-EPDM50' ? 'selected' : ''}>WST-EPDM50 (EPDM Foam Tape)</option>
            </select>
          </td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">
            <button type="button" onclick="SealingTapeEditor.resetRoleUnit('${key}')" title="기본값으로 복원" style="background: none; border: none; color: #eab308; cursor: pointer; padding: 2px 4px; font-size: 12px;"><i class="fa-solid fa-rotate-left"></i></button>
          </td>
        </tr>
      `;
    });

    const html = `
      <div style="background: #ffffff; padding: 18px; border-radius: 12px; border: 1.5px solid #0284c7; box-shadow: 0 4px 15px rgba(2,132,199,0.08);">
        <!-- Top Control Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e0f2fe;">
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-ribbon" style="color: #0284c7; font-size: 18px;"></i> 실링테이프 규격 & 높이별 수식 설정 (Sealing Tape Master Manager)
              <span style="font-size: 11px; font-weight: 800; color: #ffffff; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 3px 10px; border-radius: 20px; box-shadow: 0 2px 5px rgba(2,132,199,0.3);">
                <i class="fa-solid fa-pen-to-square"></i> 1.0mH ~ 5.0mH 높이별 판넬 통합 관리
              </span>
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
              모든 높이 등급(1.0mH~5.0mH)의 판넬 부위별 단위 소요 길이(m/PCS) 및 자재 매핑을 직접 설정할 수 있습니다.
            </p>
          </div>

          <div style="display: flex; gap: 8px;">
            <button type="button" onclick="SealingTapeEditor.addCustomRolePrompt()" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 5px rgba(2,132,199,0.2);">
              <i class="fa-solid fa-plus"></i> 새 판넬 부위 추가
            </button>
            <button type="button" onclick="SealingTapeEditor.resetAllToDefault()" style="background: #eab308; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 5px rgba(234,179,8,0.2);">
              <i class="fa-solid fa-rotate-left"></i> 마스터 기본값 원복
            </button>
          </div>
        </div>

        <!-- Master Matrix Table -->
        <div class="table-wrapper" style="max-height: 520px; overflow-y: auto; overflow-x: auto; border: 1.5px solid #0284c7; border-radius: 8px;">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
            <thead>
              <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 40px; text-align: center; color: #0369a1; font-weight: 800;">No</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-weight: 800;">부위 / 판넬 종류 (Panel Role)</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 180px; color: #0369a1; font-weight: 800;">카탈로그 키 (Catalog Key)</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 110px; text-align: right; color: #0369a1; font-weight: 800;">단위길이(m/PCS) ✏️</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 190px; color: #0369a1; font-weight: 800;">실제 반영 자재 (SKU)</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 50px; text-align: center; color: #0369a1; font-weight: 800;">작업</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Action methods
  function updateRoleUnit(key, val) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    const config = getMasterConfig();
    if (!config.roles[key]) config.roles[key] = { unit: num, SKU: 'WST-P0050RO', label: key, category: 'Custom' };
    config.roles[key].unit = num;
    saveSealingTapeMaster();
  }

  function updateRoleSku(key, sku) {
    const config = getMasterConfig();
    if (config.roles[key]) {
      config.roles[key].SKU = sku;
      saveSealingTapeMaster();
    }
  }

  function resetRoleUnit(key) {
    const config = getMasterConfig();
    if (DEFAULT_MASTER_CONFIG.roles[key]) {
      config.roles[key].unit = DEFAULT_MASTER_CONFIG.roles[key].unit;
      config.roles[key].SKU = DEFAULT_MASTER_CONFIG.roles[key].SKU;
      saveSealingTapeMaster();
    }
  }

  function resetAllToDefault() {
    if (confirm("실링테이프 마스터 설정을 카탈로그 기본값으로 초기화하시겠습니까?")) {
      masterConfig = JSON.parse(JSON.stringify(DEFAULT_MASTER_CONFIG));
      saveSealingTapeMaster();
    }
  }

  function addCustomRolePrompt() {
    const label = prompt("새 판넬 부위 이름을 입력하세요 (예: Side TOP 2.0mH Par-LT, Partition MID 1.0mH):", "Side (Custom 1.0mH)");
    if (!label) return;
    const key = prompt("카탈로그 키를 입력하세요 (예: side.TOP_20.custom, partition.MID.custom):", "side.custom_" + Date.now());
    if (!key) return;
    const unitStr = prompt("단위 소요 길이(m/PCS)를 입력하세요:", "4.1");
    if (!unitStr) return;

    const unit = parseFloat(unitStr) || 4.1;
    const config = getMasterConfig();
    config.roles[key] = {
      unit: unit,
      SKU: 'WST-P0050RO',
      label: label,
      category: 'Custom'
    };
    saveSealingTapeMaster();
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
      <div style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 1080px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.3); border: 2px solid #0284c7;">
        <div style="padding: 14px 20px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-ribbon"></i> 실링테이프 규격 & 높이별 수식 마스터 설정 (Sealing Tape Master Manager)
          </h3>
          <button type="button" onclick="document.getElementById('sealingTapeMasterModal').remove()" style="background: transparent; border: none; color: #ffffff; font-size: 20px; cursor: pointer;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="sealingTapeMasterModalBody" style="padding: 20px; overflow-y: auto; flex: 1;"></div>
      </div>
    `;

    document.body.appendChild(modal);
    renderSealingTapeManagerUI('sealingTapeMasterModalBody');
  }

  const SealingTapeEditor = {
    loadSealingTapeMaster: loadSealingTapeMaster,
    saveSealingTapeMaster: saveSealingTapeMaster,
    getRoleUnitMeter: getRoleUnitMeter,
    getMasterConfig: getMasterConfig,
    renderSealingTapeManagerUI: renderSealingTapeManagerUI,
    openSealingTapeMasterModal: openSealingTapeMasterModal,
    updateRoleUnit: updateRoleUnit,
    updateRoleSku: updateRoleSku,
    resetRoleUnit: resetRoleUnit,
    resetAllToDefault: resetAllToDefault,
    addCustomRolePrompt: addCustomRolePrompt
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SealingTapeEditor;
  } else {
    global.SealingTapeEditor = SealingTapeEditor;
  }
})(typeof window !== "undefined" ? window : globalThis);
