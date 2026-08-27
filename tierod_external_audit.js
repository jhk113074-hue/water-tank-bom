/**
 * External Tie-Rod Verification & Adjustment Sheet ("TIE-ROD EXTERNAL AUDIT")
 * Water Tank BOM System
 *
 * Integrated verification sheet for External Tie-Rod (WTR-12M300Z) assembly logic,
 * layer factor management by height, component formulas, and dimension segment tables.
 */
(function (global) {
  "use strict";

  const PRESET_STORAGE_KEY = 'water_tank_tierod_external_customer_presets_v1';
  const ACTIVE_BOM_KEY = 'water_tank_tierod_external_active_bom_spec_v1';

  const defaultFactors = [0, 1, 1, 2, 2, 2, 2, 2, 2, 2];

  const defaultPresets = {
    ysacc: {
      id: 'ysacc',
      name: 'YSACC Spec (Default)',
      factors: [0, 1, 1, 2, 2, 2, 2, 2, 2, 2]
    },
    almuftah: {
      id: 'almuftah',
      name: 'ALMUFTAH Spec',
      factors: [0, 1, 1, 2, 2, 2, 2, 2, 2, 2]
    },
    mnt: {
      id: 'mnt',
      name: 'MNT Spec',
      factors: [0, 1, 1, 2, 2, 2, 2, 2, 2, 2]
    },
    watani: {
      id: 'watani',
      name: 'WATANI Spec',
      factors: [0, 1, 1, 2, 2, 2, 2, 2, 2, 2]
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
    return (typeof AccessoriesRules !== 'undefined' && AccessoriesRules.tieRod) || null;
  }

  function loadCustomerPresets() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(PRESET_STORAGE_KEY) : null;
      if (raw) customerPresets = JSON.parse(raw);
    } catch (e) {
      console.error('[TieRodExternalAudit] Presets load failed:', e);
    }
    if (!customerPresets || typeof customerPresets !== 'object' || !Object.keys(customerPresets).length) {
      customerPresets = JSON.parse(JSON.stringify(defaultPresets));
    }
    try {
      const rawBOM = global.localStorage ? global.localStorage.getItem(ACTIVE_BOM_KEY) : null;
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
      if (global.localStorage) {
        global.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(customerPresets));
        global.localStorage.setItem(ACTIVE_BOM_KEY, JSON.stringify({ presetId: activeBOMPresetId }));
      }
    } catch (e) {
      console.error('[TieRodExternalAudit] Presets save failed:', e);
    }
    if (typeof global.db !== 'undefined' && global.db && global.db.collection) {
      global.db.collection('settings').doc('tierod_external_presets')
        .set({ presets: customerPresets, activeBOMPresetId, updatedAt: new Date().toISOString() }, { merge: true })
        .catch(err => console.warn('[TieRodExternalAudit] Firestore save warning:', err));
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

  function getTankDimSafe() {
    try {
      return (typeof global.getTankDimensions === 'function') ? global.getTankDimensions() : null;
    } catch (e) {
      return null;
    }
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
    if (!rules) return '<p style="color:#94a3b8;">AccessoriesRules.tieRod를 불러올 수 없습니다.</p>';
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
            <input type="number" step="1" min="0" data-layer-idx="${i}" value="${row.factor}" onchange="window.updateExternalTieRodLayer(${i}, this.value)" style="width: 70px; padding: 4px 6px; font-size: 12px; font-family: monospace; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: 700; color: #0f172a;">
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrapper" style="max-height: 420px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 12px; text-align: left; width: 100%;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; background: #f1f5f9;">탱크 높이 (Height, H)</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">Nos of Tie-rod (layer 단수)</th>
            </tr>
          </thead>
          <tbody id="tieRodExternalLayerTbody">${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderComponentTable(dim) {
    const rules = getRules();
    if (!rules || typeof PanelEngine === 'undefined' || typeof AccessoriesEngine === 'undefined') {
      return '<p style="color:#94a3b8;">계산 불가</p>';
    }

    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      return '<p style="color:#94a3b8;">치수 오류</p>';
    }

    const { detail, total } = AccessoriesEngine.tieRodComponentDetail(g);
    const locNames = {
      rodsW: "가로(Width) 방향 타이로드 수량 (WTR-12M300Z)",
      rodsL1: "세로(Length L1) 방향 타이로드 수량 (WTR-12M300Z)",
      rodsL2: "격벽(Partition L2) 방향 타이로드 수량 (WTR-12M300Z)",
      rodsL3: "격벽(Partition L3) 방향 타이로드 수량 (WTR-12M300Z)",
      rodsL4: "격벽(Partition L4) 방향 타이로드 수량 (WTR-12M300Z)",
      row35: "WBR-9090 브라켓 수량",
      row36: "볼트/너트 체결 세트 (WBT-1240HDG, WNT, WFW)",
      row37: "타이로드 커플러 (WTC-12M40)",
      row38: "하단 앵커 브라켓 부속"
    };

    const rowsHtml = detail.map((r, i) => {
      const loc = locNames[r.id] || r.id;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; color: #0284c7; font-size: 11px;">
            ${escapeAttr(r.id)}
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 600; color: #1e293b; font-size: 11.5px; margin-bottom: 3px;">${escapeAttr(loc)}</div>
            <input type="text" value="${escapeAttr(r.formula)}" onchange="window.updateExternalTieRodFormula('${r.id}', this.value)" style="width: 100%; padding: 4px 6px; font-size: 10.5px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; background: #ffffff;">
          </td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7; font-size: 12px;">
            ${r.value}
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrapper" style="max-height: 420px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 11.5px; text-align: left; width: 100%;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 80px; background: #f1f5f9;">ID</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; background: #f1f5f9;">구성 요소 및 산출 수식</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; width: 70px; background: #f1f5f9;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background: #e0f2fe; font-weight: 800; border-top: 2px solid #0284c7;">
              <td colspan="2" style="padding: 8px 10px; border: 1px solid #cbd5e1; color: #0369a1; font-size: 12px;">
                <i class="fa-solid fa-link" style="color: #0284c7; margin-right: 4px;"></i> WTR-12M300Z · External Tie-Rod Assembly (HDG) 완제품 BOM 총 수량
              </td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; color: #0284c7; font-size: 13px;">
                ${total} PCS
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSegmentTable(dim) {
    const rules = getRules();
    if (!rules || !Array.isArray(rules.segmentTable)) return '';

    const currentDims = dim ? [dim.width, dim.l1, dim.l2, dim.l3, dim.l4].filter(v => v && v > 0) : [];

    const rowsHtml = rules.segmentTable.map(row => {
      const [d, c2000, c3000] = row;
      const totalRods = c2000 + c3000 + 1;
      const isCurrentDim = currentDims.some(v => Math.abs(v - d) < 1e-4);
      return `
        <tr style="background: ${isCurrentDim ? '#dcfce7' : '#ffffff'}; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 4px 8px; border: 1px solid #e2e8f0; font-weight: ${isCurrentDim ? '800' : '600'}; font-family: monospace; text-align: center; color: ${isCurrentDim ? '#16a34a' : '#1e293b'};">
            ${isCurrentDim ? '▶ ' : ''}${d.toFixed(1)}m
          </td>
          <td style="padding: 4px 8px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${c2000}</td>
          <td style="padding: 4px 8px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${c3000}</td>
          <td style="padding: 4px 8px; border: 1px solid #e2e8f0; text-align: center; color: #16a34a; font-weight: 700;">1 (잔여)</td>
          <td style="padding: 4px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; background: ${isCurrentDim ? '#bbf7d0' : '#f8fafc'};">${totalRods}본</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
        <h4 style="margin: 0 0 10px 0; font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; justify-content: space-between;">
          <span><i class="fa-solid fa-table" style="color: #0284c7;"></i> 외부 타이로드 치수별 분할 조립표 (Segment Reference Table: 1m ~ 50m)</span>
          <span style="font-size: 11px; font-weight: 600; color: #64748b;">segCount(dim) = 2000mm본수 + 3000mm본수 + 1(잔여본수)</span>
        </h4>
        <div class="table-wrapper" style="max-height: 260px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
          <table class="bom-table" style="border-collapse: collapse; width: 100%; text-align: left;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">탱크 치수(m)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">2,000mm 봉 (본)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">3,000mm 봉 (본)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">마감 잔여봉 (본)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">1라인당 총 로드 수량</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderView() {
    const container = document.getElementById('tieRodExternalAuditContainer');
    if (!container) return;

    const dim = getTankDimSafe() || { width: 4, l1: 4, height: 2, l2: 0, l3: 0, l4: 0, numPartition: 0 };
    const preset = customerPresets[selectedPresetId] || customerPresets['ysacc'];
    const isActiveBOM = selectedPresetId === activeBOMPresetId;

    let html = `
      <!-- Top Navigation: Quick Switch between Internal and External Tie-Rod -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px;">
        <button type="button" onclick="const btn = document.querySelector('.tab-btn[data-tab=\\'tab-tierod-internal-audit\\']'); if (btn) btn.click();" style="padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 12.5px; border: 1px solid #cbd5e1; background: #f8fafc; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-ruler-combined" style="color: #16a34a;"></i> 🔒 Internal Tie-Rod (내부 타이로드 검증)
        </button>
        <button type="button" style="padding: 8px 16px; border-radius: 6px; font-weight: 800; font-size: 12.5px; border: 1.5px solid #0284c7; background: #0284c7; color: #ffffff; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);">
          <i class="fa-solid fa-link"></i> 🌐 External Tie-Rod (외부 타이로드 검증 및 설정)
        </button>
      </div>

      <!-- Header Spec Bar -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-link" style="color: #0284c7;"></i> TIE-ROD EXTERNAL AUDIT (외부 타이로드 검증표)
          </h3>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px;">
              Size: ${dim.l1}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.l1 * dim.width * dim.height).toFixed(1)} M³ · 외부보강
            </span>
            <span style="font-size: 11px; font-weight: 700; color: #15803d; background: #dcfce7; border: 1px solid #bbf7d0; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-cloud-arrow-up"></i> Firestore DB Synced
            </span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 12px; font-weight: 700; color: #334155;">Customer Spec:</label>
          <select id="selTieRodExtPreset" onchange="window.switchExternalTieRodPreset(this.value)" style="padding: 5px 10px; border-radius: 6px; border: 1.5px solid #0284c7; font-size: 12.5px; font-weight: 700; color: #0284c7; outline: none; background: #f0f9ff; cursor: pointer;">
            ${Object.keys(customerPresets).map(k => `
              <option value="${k}" ${k === selectedPresetId ? 'selected' : ''}>${escapeAttr(customerPresets[k].name)}</option>
            `).join('')}
          </select>

          ${isActiveBOM ? `
            <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; border: 1px solid #86efac;">
              <i class="fa-solid fa-check-circle"></i> Active in BOM
            </span>
          ` : `
            <button type="button" onclick="window.setActiveExternalTieRodBOM('${selectedPresetId}')" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 5px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer;">
              Set as BOM Spec
            </button>
          `}
        </div>
      </div>

      <!-- Main Two-Column Layout -->
      <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
        <!-- Left Column: Layer Factor Table (40%) -->
        <div style="flex: 4; min-width: 320px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-layer-group" style="color: #0284c7;"></i> 높이별 타이로드 단수 (Layer Factor Table)
            </h4>
            <button type="button" onclick="window.resetExternalTieRodLayers()" style="font-size: 11px; padding: 2px 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; color: #64748b; cursor: pointer;">
              <i class="fa-solid fa-rotate-left"></i> 기본값
            </button>
          </div>
          ${renderLayerTable(dim)}
        </div>

        <!-- Right Column: Component Breakdown & Formula Table (60%) -->
        <div style="flex: 6; min-width: 480px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-calculator" style="color: #0284c7;"></i> 구성 부재별 산출 수식 및 수량 (WTR-12M300Z Assembly)
            </h4>
            <span style="font-size: 11px; color: #64748b;">수식 수정 시 실시간 계산 및 BOM 반영</span>
          </div>
          ${renderComponentTable(dim)}
        </div>
      </div>

      <!-- Bottom Reference: Dimension Segment Table -->
      ${renderSegmentTable(dim)}
    `;

    container.innerHTML = html;
  }

  window.renderTieRodExternalAuditView = renderView;

  window.switchExternalTieRodPreset = function (presetId) {
    selectedPresetId = presetId;
    applyPresetToEngine(presetId);
    renderView();
    if (typeof global.recalculateBOM === 'function') global.recalculateBOM();
  };

  window.setActiveExternalTieRodBOM = function (presetId) {
    activeBOMPresetId = presetId;
    selectedPresetId = presetId;
    applyPresetToEngine(presetId);
    saveCustomerPresets();
    renderView();
    if (typeof global.recalculateBOM === 'function') global.recalculateBOM();
  };

  window.updateExternalTieRodLayer = function (idx, val) {
    const num = Math.max(0, parseInt(val, 10) || 0);
    const preset = customerPresets[selectedPresetId] || customerPresets['ysacc'];
    if (!Array.isArray(preset.factors)) preset.factors = [...defaultFactors];
    preset.factors[idx] = num;
    applyFactorsToRules(preset.factors);
    saveCustomerPresets();
    renderView();
    if (typeof global.recalculateBOM === 'function') global.recalculateBOM();
  };

  window.resetExternalTieRodLayers = function () {
    if (!confirm('현재 프리셋의 높이별 단수를 기본값으로 되돌리시겠습니까?')) return;
    const preset = customerPresets[selectedPresetId] || customerPresets['ysacc'];
    preset.factors = [...defaultFactors];
    applyFactorsToRules(preset.factors);
    saveCustomerPresets();
    renderView();
    if (typeof global.recalculateBOM === 'function') global.recalculateBOM();
  };

  window.updateExternalTieRodFormula = function (fieldId, formulaVal) {
    const trimmed = String(formulaVal || '').trim();
    if (!trimmed) {
      alert('수식을 입력해 주세요.');
      renderView();
      return;
    }
    if (global.RuleEditorUI && typeof global.RuleEditorUI.setFieldFormula === 'function') {
      const res = global.RuleEditorUI.setFieldFormula('reinforcing', 2, fieldId, trimmed);
      if (!res.ok) {
        alert('수식 오류: ' + (res.error || '알 수 없는 오류'));
      }
    }
    renderView();
    if (typeof global.recalculateBOM === 'function') global.recalculateBOM();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(renderView, 300);

      const tabBtn = document.querySelector('.tab-btn[data-tab="tab-tierod-external-audit"]');
      if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(renderView, 0));

      ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight', 'numPartition', 'reinfMethod'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', renderView);
          el.addEventListener('change', renderView);
        }
      });
    });
  }

  global.TieRodExternalAudit = {
    render: renderView,
    getActiveBOMPresetId: () => activeBOMPresetId,
    switchPreset: window.switchExternalTieRodPreset
  };
})(typeof window !== 'undefined' ? window : this);
