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
      "corner_angle_10":           { partNo: "WCA-1010", unit: 1.0, SKU: "WST-P0120M", label: "Corner Angle 1.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_15":           { partNo: "WCA-1510", unit: 1.5, SKU: "WST-P0120M", label: "Corner Angle 1.5mH (HDG)", category: "Steel Accessories" },
      "corner_angle_20":           { partNo: "WCA-2010", unit: 2.0, SKU: "WST-P0120M", label: "Corner Angle 2.0mH (HDG)", category: "Steel Accessories" },
      "corner_angle_general":      { partNo: "WST-P0120M", unit: 1.0, SKU: "WST-P0120M", label: "모서리 세로 조인트 (Corner Angle Vertical 1M)", category: "Steel Accessories" },
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
    return masterConfig;
  }

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

  function setCategoryFilter(cat) {
    activeCategoryFilter = cat;
    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) {
      renderSealingTapeManagerUI(container.id);
    }
  }

  function renderSealingTapeManagerUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const config = getMasterConfig();
    const roles = config.roles;

    let rowsHtml = '';
    let idx = 1;

    Object.keys(roles).forEach((key) => {
      const item = roles[key];
      const category = item.category || 'General';

      if (activeCategoryFilter !== 'ALL' && activeCategoryFilter !== category) {
        return;
      }

      const defaultUnit = DEFAULT_MASTER_CONFIG.roles[key] ? DEFAULT_MASTER_CONFIG.roles[key].unit : item.unit;
      const isModified = (item.unit !== defaultUnit);
      const partNoDisplay = item.partNo || '-';

      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${isModified ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')};">
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">${idx++}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-size: 11px;">
            <span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-right: 6px;">${escapeHtml(category)}</span>
            ${escapeHtml(item.label || key)}
            ${isModified ? `<span style="font-size: 9.5px; color: #0284c7; font-weight: 800; margin-left: 4px;">(수식/값 수정됨)</span>` : ''}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; font-weight: 800; color: #0284c7; background: #f0f9ff;">
            <input type="text" value="${escapeHtml(partNoDisplay)}" onchange="SealingTapeEditor.updatePartNo('${key}', this.value)" style="width: 100%; border: 1px solid #7dd3fc; border-radius: 4px; font-family: monospace; font-weight: 800; color: #0284c7; padding: 2px 4px; background: #ffffff;">
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2px solid #e0f2fe;">
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-ribbon" style="color: #0284c7; font-size: 18px;"></i> 실링테이프 품번(Part No) & 높이별 수식 마스터 설정 (Sealing Tape Master)
              <span style="font-size: 11px; font-weight: 800; color: #ffffff; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 3px 10px; border-radius: 20px; box-shadow: 0 2px 5px rgba(2,132,199,0.3);">
                <i class="fa-solid fa-pen-to-square"></i> 판넬 & Steel Accessories 품번별 소요량 정의
              </span>
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
              모든 판넬 및 Steel Accessories의 <strong>자재 품번(Part No / SKU)</strong>별 필요 실링테이프 소요 미터(m/PCS) 및 테이프 자재를 직접 설정할 수 있습니다.
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

        <!-- Category Filter Buttons -->
        <div style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;">
          <button type="button" onclick="SealingTapeEditor.setCategoryFilter('ALL')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'ALL' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'ALL' ? '#ffffff' : '#0284c7'}; cursor: pointer;">전체 (All)</button>
          <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Roof & Bottom')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'Roof & Bottom' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'Roof & Bottom' ? '#ffffff' : '#0284c7'}; cursor: pointer;">지붕 & 바닥 판넬</button>
          <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Side Panels')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'Side Panels' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'Side Panels' ? '#ffffff' : '#0284c7'}; cursor: pointer;">측면 판넬 (Side)</button>
          <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Partitions')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'Partitions' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'Partitions' ? '#ffffff' : '#0284c7'}; cursor: pointer;">격벽 판넬 (Partitions)</button>
          <button type="button" onclick="SealingTapeEditor.setCategoryFilter('Steel Accessories')" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 20px; border: 1px solid #0284c7; background: ${activeCategoryFilter === 'Steel Accessories' ? '#0284c7' : '#ffffff'}; color: ${activeCategoryFilter === 'Steel Accessories' ? '#ffffff' : '#0284c7'}; cursor: pointer;">🔩 Steel Accessories (철재 부자재 품번별)</button>
        </div>

        <!-- Master Matrix Table -->
        <div class="table-wrapper" style="max-height: 520px; overflow-y: auto; overflow-x: auto; border: 1.5px solid #0284c7; border-radius: 8px;">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed;">
            <thead>
              <tr style="background: #e0f2fe; border-bottom: 2px solid #0284c7; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 40px; text-align: center; color: #0369a1; font-weight: 800;">No</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; color: #0369a1; font-weight: 800;">부위 / 항목명 (Panel Role)</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 140px; color: #0369a1; font-weight: 800;">자재 품번 (Part No / SKU) ✏️</th>
                <th style="padding: 8px; border: 1px solid #bae6fd; width: 170px; color: #0369a1; font-weight: 800;">카탈로그 키 (Catalog Key)</th>
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

  function updatePartNo(key, val) {
    const trimmed = String(val || '').trim();
    const config = getMasterConfig();
    if (config.roles[key]) {
      config.roles[key].partNo = trimmed;
      saveSealingTapeMaster();
    }
  }

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
      config.roles[key].partNo = DEFAULT_MASTER_CONFIG.roles[key].partNo;
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
          <button type="button" onclick="document.getElementById('partMasterPickerModal').remove()" style="background: transparent; border: none; color: #ffffff; font-size: 20px; cursor: pointer;">
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
      </div>
    `;

    document.body.appendChild(modal);
    filterPickerParts();
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

    const container = document.getElementById('sealingTapeMasterFullContainer') || document.getElementById('sealingTapeMasterModalBody');
    if (container) renderSealingTapeManagerUI(container.id);
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
    getPartNoUnitMeter: getPartNoUnitMeter,
    getRoleUnitMeter: getPartNoUnitMeter,
    getMasterConfig: getMasterConfig,
    setCategoryFilter: setCategoryFilter,
    renderSealingTapeManagerUI: renderSealingTapeManagerUI,
    openSealingTapeMasterModal: openSealingTapeMasterModal,
    openPartMasterPickerModal: openPartMasterPickerModal,
    filterPickerParts: filterPickerParts,
    selectPartFromPicker: selectPartFromPicker,
    addBrandNewPartToDb: addBrandNewPartToDb,
    updatePartNo: updatePartNo,
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
