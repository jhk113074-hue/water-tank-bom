/**
 * External Tie-Rod Verification & Adjustment Sheet ("TIE-ROD EXTERNAL AUDIT")
 * Water Tank BOM System
 *
 * Provides a crystal-clear, intuitive, and interactive audit/setting sheet
 * for External Tie-Rod (WTR-12M300Z Assembly) including:
 * 1. Visual overview and installation explanation
 * 2. Layer factors by tank height (단수 설정)
 * 3. Component breakdown with human-friendly names, formulas, and live substitution values
 * 4. Comprehensive variable dictionary table (수식 변수 해설표)
 * 5. Dimension segment decomposition table (1m ~ 50m)
 */
(function (global) {
  "use strict";

  const PRESET_STORAGE_KEY = 'water_tank_tierod_external_customer_presets_v2';
  const ACTIVE_BOM_KEY = 'water_tank_tierod_external_active_bom_spec_v2';

  const defaultFactors = [0, 1, 1, 2, 2, 2, 2, 2, 2, 2];

  const defaultPresets = {
    ysacc: {
      id: 'ysacc',
      name: 'YSACC Spec (Standard)',
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

  function getTankDim() {
    const getV = (id, def) => {
      const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
      return el ? (parseFloat(el.value) || def) : def;
    };
    const width = getV('tankWidth', 4);
    const l1 = getV('tankLength1', 4);
    const l2 = getV('tankLength2', 0);
    const l3 = getV('tankLength3', 0);
    const l4 = getV('tankLength4', 0);
    const height = getV('tankHeight', 2);
    const numPartition = getV('tankPartitions', 0);
    const reinfEl = typeof document !== 'undefined' ? document.getElementById('reinfMethod') : null;
    const reinfMethod = (reinfEl && reinfEl.value) || 'External';
    return { width, l1, l2, l3, l4, height, numPartition, reinfMethod };
  }

  function layerRowLabel(row, prevMaxH) {
    if (row.maxH === undefined) return `H > ${prevMaxH}m (초고단 탱크)`;
    if (prevMaxH === undefined) return `H ≤ ${row.maxH}m (1단 이하: 미설치)`;
    return `${prevMaxH}m < H ≤ ${row.maxH}m`;
  }

  function activeLayerIndex(rules, H) {
    for (let i = 0; i < rules.layerFactorTable.length; i++) {
      const r = rules.layerFactorTable[i];
      if (r.maxH === undefined || H <= r.maxH) return i;
    }
    return -1;
  }

  function getEvaluatedScope(dim) {
    const rules = getRules();
    if (!rules || typeof PanelEngine === 'undefined') return {};

    try {
      const g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
      const W_C = g.W.whole, W_F = g.W.half;
      const L1_C = g.L1.whole, L1_F = g.L1.half;
      const L2_C = g.L2.whole, L2_F = g.L2.half;
      const L3_C = g.L3.whole, L3_F = g.L3.half;
      const L4_C = g.L4.whole, L4_F = g.L4.half;
      const H_O = g.H.value, W_O = g.W.value;
      const L1_O = g.L1.value, L2_O = g.L2.value, L3_O = g.L3.value, L4_O = g.L4.value;

      function layerFactor(H) {
        const row = rules.layerFactorTable.find(r => r.maxH === undefined || H <= r.maxH);
        return row.factor;
      }
      function segCount(dimVal) {
        if (!dimVal || dimVal <= 0) return 0;
        const row = rules.segmentTable.find(r => Math.abs(r[0] - dimVal) < 1e-6);
        if (!row) return 0;
        return row[1] + row[2] + 1;
      }

      const baseScope = { W_C, W_F, L1_C, L1_F, L2_C, L2_F, L3_C, L3_F, L4_C, L4_F, H_O, W_O, L1_O, L2_O, L3_O, L4_O, layerFactor, segCount };
      return (typeof RuleEngine !== 'undefined' && RuleEngine.withIntermediates)
        ? RuleEngine.withIntermediates(rules.intermediates, baseScope)
        : {};
    } catch (e) {
      return {};
    }
  }

  function renderLayerTable(dim) {
    const rules = getRules();
    if (!rules) return '<p style="color:#94a3b8;">AccessoriesRules.tieRod를 불러올 수 없습니다.</p>';
    const currentH = dim ? Math.round(dim.height * 10) / 10 : 2;
    const activeIdx = activeLayerIndex(rules, currentH);

    let prevMaxH;
    const rowsHtml = rules.layerFactorTable.map((row, i) => {
      const label = layerRowLabel(row, prevMaxH);
      prevMaxH = row.maxH;
      const isActive = i === activeIdx;
      return `
        <tr style="background: ${isActive ? '#dcfce7' : (i % 2 === 0 ? '#ffffff' : '#f8fafc')}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 7px 10px; border: 1px solid #e2e8f0; font-weight: ${isActive ? '800' : '500'}; color: ${isActive ? '#15803d' : '#334155'}; font-size: 11.5px;">
            ${isActive ? '<span style="background:#16a34a; color:#ffffff; padding:1px 5px; border-radius:3px; font-size:10px; margin-right:4px;">현재 탱크</span>' : ''}${escapeAttr(label)}
          </td>
          <td style="padding: 5px 10px; border: 1px solid #e2e8f0; text-align: center;">
            <input type="number" step="1" min="0" data-layer-idx="${i}" value="${row.factor}" onchange="window.updateExternalTieRodLayer(${i}, this.value)" style="width: 65px; padding: 4px; font-size: 12px; font-family: monospace; text-align: center; border: 1.5px solid ${isActive ? '#16a34a' : '#cbd5e1'}; border-radius: 4px; font-weight: 700; color: ${isActive ? '#15803d' : '#0f172a'}; background: ${isActive ? '#ffffff' : '#f8fafc'};">
            <span style="font-size: 11px; font-weight: 600; color: #64748b; margin-left: 2px;">단</span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrapper" style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 12px; text-align: left; width: 100%;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; background: #f1f5f9;">탱크 높이 (Height, H)</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; width: 110px; background: #f1f5f9;">설치 단수 (Layer)</th>
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
      return '<p style="color:#94a3b8;">엔진을 불러올 수 없습니다.</p>';
    }

    let g;
    try {
      g = PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
    } catch (e) {
      return '<p style="color:#94a3b8;">치수 오류</p>';
    }

    const scope = getEvaluatedScope(dim);
    const { detail, total } = AccessoriesEngine.tieRodComponentDetail(g);

    const componentMeta = {
      rodsW: {
        title: "① 가로 방향 타이로드 로드봉 (Width Rods)",
        partNo: "WTR-12M300Z (Width)",
        unit: "본",
        desc: "탱크 폭(W)을 가로지르는 M12 HDG 타이로드 관통 봉",
        mathDesc: `가로 라인수(M8 = ${scope.M8 || 0}열) × 라인당 봉수(segW = ${scope.segW || 0}본)`,
        calcPreview: `segW(${scope.segW || 0}본) × M8(${scope.M8 || 0}라인)`
      },
      rodsL1: {
        title: "② 세로 방향 타이로드 로드봉 (Length Rods)",
        partNo: "WTR-12M300Z (Length L1)",
        unit: "본",
        desc: "탱크 길이(L1)를 가로지르는 M12 HDG 타이로드 관통 봉",
        mathDesc: `세로 라인수(Q8 = ${scope.Q8 || 0}열) × 라인당 봉수(segL1 = ${scope.segL1 || 0}본)`,
        calcPreview: `segL1(${scope.segL1 || 0}본) × Q8(${scope.Q8 || 0}라인)`
      },
      rodsL2: {
        title: "③ 격벽(L2) 방향 타이로드 로드봉",
        partNo: "WTR-12M300Z (L2)",
        unit: "본",
        desc: "L2 격벽 구역을 가로지르는 M12 HDG 타이로드 봉",
        mathDesc: `격벽 라인수(U8 = ${scope.U8 || 0}) × 봉수(segL2 = ${scope.segL2 || 0})`,
        calcPreview: `segL2(${scope.segL2 || 0}) × U8(${scope.U8 || 0})`
      },
      rodsL3: {
        title: "④ 격벽(L3) 방향 타이로드 로드봉",
        partNo: "WTR-12M300Z (L3)",
        unit: "본",
        desc: "L3 격벽 구역을 가로지르는 M12 HDG 타이로드 봉",
        mathDesc: `격벽 라인수(Y8 = ${scope.Y8 || 0}) × 봉수(segL3 = ${scope.segL3 || 0})`,
        calcPreview: `segL3(${scope.segL3 || 0}) × Y8(${scope.Y8 || 0})`
      },
      rodsL4: {
        title: "⑤ 격벽(L4) 방향 타이로드 로드봉",
        partNo: "WTR-12M300Z (L4)",
        unit: "본",
        desc: "L4 격벽 구역을 가로지르는 M12 HDG 타이로드 봉",
        mathDesc: `격벽 라인수(AC8 = ${scope.AC8 || 0}) × 봉수(segL4 = ${scope.segL4 || 0})`,
        calcPreview: `segL4(${scope.segL4 || 0}) × AC8(${scope.AC8 || 0})`
      },
      row35: {
        title: "⑥ 외부 타이로드 고정 브라켓",
        partNo: "WBR-9090 (Outside Bracket)",
        unit: "EA",
        desc: "탱크 외측 보강 프레임(H-Beam/C-Channel)과 타이로드를 결합하는 고정 브라켓",
        mathDesc: "타이로드 양 끝단 브라켓 수량 합계",
        calcPreview: `가로 브라켓(4×${scope.M8 || 0}) + 세로 브라켓(4×${scope.Q8 || 0})`
      },
      row36: {
        title: "⑦ 브라켓 조립용 볼트/너트/와셔 세트",
        partNo: "WBT-1240HDG Set (Bolt/Nut/Washer)",
        unit: "SET",
        desc: "WBR-9090 브라켓 1개당 2개소 체결 (M12×40 Bolt + Nut + Spring Washer + Flat Washer)",
        mathDesc: "브라켓 수량 × 2 SET",
        calcPreview: `row35(${scope.row35 || 0}개) × 2`
      },
      row37: {
        title: "⑧ 타이로드 연결 조인트 커플러",
        partNo: "WTC-12M40 (Coupler)",
        unit: "EA",
        desc: "2m 및 3m 분할 규격봉을 길이에 맞게 서로 연결하는 M12 고장력 커플러 너트",
        mathDesc: "(라인당 봉수 - 1) × 타이로드 총 라인수",
        calcPreview: `가로 커플러(${Math.max(0, (scope.segW||1)-1) * (scope.M8||0)}) + 세로 커플러(${Math.max(0, (scope.segL1||1)-1) * (scope.Q8||0)})`
      },
      row38: {
        title: "⑨ 하단/앵커 고정 브라켓 부속",
        partNo: "Anchor / Bottom Fixture Bracket",
        unit: "EA",
        desc: "격벽 및 하단 연결 지점 보강 부속",
        mathDesc: "격벽 유무에 따른 보강 수량",
        calcPreview: `${scope.row38 || 0} EA`
      }
    };

    const rowsHtml = detail.map((r, i) => {
      const meta = componentMeta[r.id] || {
        title: r.id,
        partNo: r.id,
        unit: "EA",
        desc: "구성 부품",
        mathDesc: "",
        calcPreview: ""
      };
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 8px 10px; border: 1px solid #e2e8f0; vertical-align: top;">
            <div style="font-weight: 800; color: #0369a1; font-size: 12px; margin-bottom: 2px;">
              ${escapeAttr(meta.title)}
            </div>
            <div style="font-size: 11px; font-family: monospace; font-weight: 700; color: #475569; margin-bottom: 3px;">
              품번: <span style="color: #0284c7; background: #e0f2fe; padding: 1px 4px; border-radius: 3px;">${escapeAttr(meta.partNo)}</span>
            </div>
            <div style="font-size: 10.5px; color: #64748b; line-height: 1.3;">
              ${escapeAttr(meta.desc)}
            </div>
          </td>
          <td style="padding: 8px 10px; border: 1px solid #e2e8f0; vertical-align: top;">
            <div style="font-size: 10.5px; color: #64748b; margin-bottom: 3px;">
              <i class="fa-solid fa-calculator" style="color: #0284c7;"></i> ${escapeAttr(meta.mathDesc || '산출 수식')}
            </div>
            <input type="text" value="${escapeAttr(r.formula)}" onchange="window.updateExternalTieRodFormula('${r.id}', this.value)" style="width: 100%; padding: 4px 8px; font-size: 11px; font-family: monospace; font-weight: 600; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; background: #ffffff; color: #0f172a;">
            ${meta.calcPreview ? `
              <div style="font-size: 10.5px; font-weight: 700; color: #15803d; margin-top: 3px; background: #f0fdf4; padding: 2px 6px; border-radius: 4px; border: 1px solid #bbf7d0;">
                ▶ 현재 대입 계산: <code>${escapeAttr(meta.calcPreview)}</code> = <strong>${r.value} ${meta.unit}</strong>
              </div>
            ` : ''}
          </td>
          <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right; vertical-align: middle; font-weight: 800; color: #0284c7; font-size: 13px; white-space: nowrap;">
            ${r.value} <span style="font-size: 10.5px; font-weight: 600; color: #64748b;">${meta.unit}</span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrapper" style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
        <table class="bom-table" style="border-collapse: collapse; font-size: 11.5px; text-align: left; width: 100%;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 35%; background: #f1f5f9;">구성 부품 / 역할</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; background: #f1f5f9;">산출 수식 (Formula)</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; width: 85px; background: #f1f5f9;">수량 (Qty)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background: #f0fdf4; font-weight: 800; border-top: 2.5px solid #16a34a;">
              <td colspan="2" style="padding: 10px 12px; border: 1px solid #bbf7d0; color: #166534; font-size: 12.5px;">
                <i class="fa-solid fa-circle-check" style="color: #16a34a; margin-right: 6px;"></i>
                <strong>WTR-12M300Z · External Tie-Rod Assembly (HDG) 완제품 세트 총합 (BOM 반영 수량)</strong>
                <div style="font-size: 11px; font-weight: 500; color: #15803d; margin-top: 2px;">
                  ※ 위의 로드봉, 브라켓, 볼트/너트, 커플러가 1개의 완제품 세트로 패키징되어 BOM OUTPUT에 <strong>${total} PCS</strong>로 산출됩니다.
                </div>
              </td>
              <td style="padding: 10px 12px; border: 1px solid #bbf7d0; text-align: right; color: #16a34a; font-size: 15px;">
                ${total} <span style="font-size: 11px; font-weight: 700;">PCS</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderVariableDictionary(dim) {
    const scope = getEvaluatedScope(dim);

    const varList = [
      {
        sym: "layer",
        name: "타이로드 상하 설치 단수 (Layer)",
        formula: "layerFactor(H_O)",
        val: scope.layer !== undefined ? scope.layer : 0,
        desc: `탱크 높이(${dim.height}mH)에 따라 좌측 단수표에서 결정된 상하 설치 단수`
      },
      {
        sym: "segW",
        name: "가로(Width) 1라인당 로드봉 본수",
        formula: "segCount(W_O)",
        val: scope.segW !== undefined ? scope.segW : 0,
        desc: `폭(${dim.width}m) 1개 라인 관통에 필요한 규격봉 수 (2m봉 + 3m봉 + 잔여마감봉)`
      },
      {
        sym: "segL1",
        name: "세로(Length L1) 1라인당 로드봉 본수",
        formula: "segCount(L1_O)",
        val: scope.segL1 !== undefined ? scope.segL1 : 0,
        desc: `길이(${dim.l1}m) 1개 라인 관통에 필요한 규격봉 수 (2m봉 + 3m봉 + 잔여마감봉)`
      },
      {
        sym: "M8",
        name: "가로 방향 타이로드 총 라인 수",
        formula: "(totalLenCourses - 1) * layer",
        val: scope.M8 !== undefined ? scope.M8 : 0,
        desc: `탱크 길이 방향으로 1m 간격마다 배열된 가로 타이로드의 총 설치 라인 수`
      },
      {
        sym: "Q8",
        name: "세로(L1) 방향 타이로드 총 라인 수",
        formula: "layer * (W_C + W_F - 1)",
        val: scope.Q8 !== undefined ? scope.Q8 : 0,
        desc: `탱크 폭 방향으로 1m 간격마다 배열된 세로 타이로드의 총 설치 라인 수`
      },
      {
        sym: "U8, Y8, AC8",
        name: "격벽 구역(L2, L3, L4) 타이로드 라인 수",
        formula: "L2_O>0 ? layer*(W_C+W_F-1) : 0",
        val: ((scope.U8 || 0) + (scope.Y8 || 0) + (scope.AC8 || 0)),
        desc: `격벽 수조일 때 내부 구획별로 추가 설치되는 세로 타이로드 라인 수`
      },
      {
        sym: "row35",
        name: "WBR-9090 외부 고정 브라켓 총수량",
        formula: "4*M8 + 4*Q8 + ...",
        val: scope.row35 !== undefined ? scope.row35 : 0,
        desc: `타이로드가 외측 프레임과 체결되는 양 끝단 고정 브라켓 총 개수`
      },
      {
        sym: "row36",
        name: "브라켓 체결용 볼트/너트/와셔 세트",
        formula: "row35 * 2",
        val: scope.row36 !== undefined ? scope.row36 : 0,
        desc: `WBR-9090 브라켓 1개당 볼트 2세트 체결`
      },
      {
        sym: "row37",
        name: "타이로드 조인트 커플러 수량",
        formula: "(segW - 1)*M8 + (segL1 - 1)*Q8 + ...",
        val: scope.row37 !== undefined ? scope.row37 : 0,
        desc: `봉과 봉을 연결하는 M12 고장력 조인트 커플러(WTC-12M40) 너트 수량`
      }
    ];

    const rowsHtml = varList.map((v, i) => `
      <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; color: #0284c7;">
          <code>${escapeAttr(v.sym)}</code>
        </td>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">
          ${escapeAttr(v.name)}
        </td>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-family: monospace; color: #475569;">
          <code>${escapeAttr(v.formula)}</code>
        </td>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #16a34a; font-size: 12px; background: #f0fdf4;">
          ${v.val}
        </td>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">
          ${escapeAttr(v.desc)}
        </td>
      </tr>
    `).join('');

    return `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); margin-bottom: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13.5px; font-weight: 800; color: #0f172a; display: flex; align-items: center; justify-content: space-between;">
          <span><i class="fa-solid fa-book-open" style="color: #0284c7;"></i> 3단계: 수식 내부 변수 사전 및 현재 대입 계산값 (Variable Dictionary)</span>
          <span style="font-size: 11px; font-weight: 600; color: #0284c7; background: #e0f2fe; padding: 3px 8px; border-radius: 4px;">
            실시간 치수 연동 계산 중
          </span>
        </h4>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 10px; line-height: 1.4;">
          수식에 사용된 각 기호(Symbol)의 의미와 현재 탱크 치수에 대입된 실제 계산값입니다.
        </div>
        <div class="table-wrapper" style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
          <table class="bom-table" style="border-collapse: collapse; width: 100%; text-align: left;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1; width: 110px;">변수 기호</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1; width: 220px;">한글 명칭</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">기본 산출식</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right; width: 90px; background: #dcfce7; color: #15803d;">현재 대입값</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">세부 설명 및 물리적 의미</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSegmentTable(dim) {
    const rules = getRules();
    if (!rules || !Array.isArray(rules.segmentTable)) return '';

    const currentDims = dim ? [dim.width, dim.l1, dim.l2, dim.l3, dim.l4].filter(v => v && v > 0) : [4, 4];

    const rowsHtml = rules.segmentTable.map(row => {
      const [d, c2000, c3000] = row;
      const totalRods = c2000 + c3000 + 1;
      const isCurrentDim = currentDims.some(v => Math.abs(v - d) < 1e-4);
      return `
        <tr style="background: ${isCurrentDim ? '#dcfce7' : '#ffffff'}; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: ${isCurrentDim ? '800' : '600'}; font-family: monospace; text-align: center; color: ${isCurrentDim ? '#16a34a' : '#1e293b'};">
            ${isCurrentDim ? '<i class="fa-solid fa-arrow-right" style="color:#16a34a;"></i> ' : ''}${d.toFixed(1)}m
          </td>
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${c2000} 본</td>
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${c3000} 본</td>
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; color: #16a34a; font-weight: 700;">1 본 (치수맞춤)</td>
          <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 800; color: #0284c7; background: ${isCurrentDim ? '#bbf7d0' : '#f8fafc'};">${totalRods} 본</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
        <h4 style="margin: 0 0 8px 0; font-size: 13.5px; font-weight: 800; color: #0f172a; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <span><i class="fa-solid fa-ruler-horizontal" style="color: #0284c7;"></i> 4단계: 외부 타이로드 치수별 봉(Rod) 분할 기준표 (Segment Reference Table: 1m ~ 50m)</span>
          <span style="font-size: 11px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 3px 8px; border-radius: 4px;">
            1라인당 총 로드봉 수 = 2,000mm 규격봉 + 3,000mm 규격봉 + 잔여 마감봉(1본)
          </span>
        </h4>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 10px; line-height: 1.4;">
          ※ 탱크 폭(W) 또는 길이(L)가 길어질 때, 현장 시공성과 운반성을 위해 $2\text{m}$ 및 $3\text{m}$ 표준 규격봉과 마감 절단봉을 커플러(WTC-12M40)로 결합하여 1개의 긴 타이로드를 완성합니다.
        </div>
        <div class="table-wrapper" style="max-height: 240px; overflow-y: auto; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px;">
          <table class="bom-table" style="border-collapse: collapse; width: 100%; text-align: left;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">탱크 치수(m)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">2,000mm 봉 (본)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">3,000mm 봉 (본)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">마감 잔여봉 (본)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; background: #f1f5f9;">1라인당 총 봉 수량</th>
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

    const dim = getTankDim();
    const preset = customerPresets[selectedPresetId] || customerPresets['ysacc'];
    const isActiveBOM = selectedPresetId === activeBOMPresetId;

    let html = `
      <!-- Top Navigation: Quick Switch between Internal and External Tie-Rod -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px;">
        <button type="button" onclick="const btn = document.querySelector('.tab-btn[data-tab=\\'tab-tierod-internal-audit\\']'); if (btn) btn.click();" style="padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 12.5px; border: 1px solid #cbd5e1; background: #f8fafc; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-ruler-combined" style="color: #16a34a;"></i> 🔒 Internal Tie-Rod (내부 타이로드 검증 및 설정)
        </button>
        <button type="button" style="padding: 8px 16px; border-radius: 6px; font-weight: 800; font-size: 12.5px; border: 1.5px solid #0284c7; background: #0284c7; color: #ffffff; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);">
          <i class="fa-solid fa-link"></i> 🌐 External Tie-Rod (외부 타이로드 검증 및 설정)
        </button>
      </div>

      <!-- Informative Overview Banner -->
      <div style="background: #f0f9ff; border: 1.5px solid #38bdf8; border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; display: flex; gap: 14px; align-items: flex-start;">
        <div style="font-size: 24px; color: #0284c7; margin-top: 2px;"><i class="fa-solid fa-circle-info"></i></div>
        <div style="flex: 1;">
          <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #0369a1;">
            외부 타이로드(External Tie-Rod) 시스템 산출 원리 및 안내
          </h4>
          <div style="font-size: 12px; color: #334155; line-height: 1.5;">
            • <strong>용도</strong>: 외부보강(External Reinforcement) 수조에서 판넬 외측의 수직 보강 프레임(H-Beam / Angle) 상호 간을 횡단 연결하여 수압에 의한 외측 배부름 변형을 견고하게 잡아주는 HDG M12 타이로드 시스템입니다.<br>
            • <strong>BOM 산출 방식</strong>: 가로/세로 관통 로드봉(WTR-12M300Z), 외측 고정 브라켓(WBR-9090), 체결 볼트/너트(WBT-1240HDG Set), 연결 커플러(WTC-12M40) 부속이 모두 포함된 <strong>완제품 조립 세트(Set)</strong>로 BOM OUTPUT에 등록됩니다.
          </div>
        </div>
      </div>

      <!-- Header Spec Bar -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-link" style="color: #0284c7;"></i> TIE-ROD EXTERNAL AUDIT (외부 타이로드 검증표)
          </h3>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px;">
              현재 탱크 크기: ${dim.l1}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.l1 * dim.width * dim.height).toFixed(1)} M³ [외부보강]
            </span>
            <span style="font-size: 11px; font-weight: 700; color: #15803d; background: #dcfce7; border: 1px solid #bbf7d0; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-cloud-arrow-up"></i> Firestore DB Synced
            </span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 12px; font-weight: 700; color: #334155;">Customer Spec (거래처 사양):</label>
          <select id="selTieRodExtPreset" onchange="window.switchExternalTieRodPreset(this.value)" style="padding: 5px 10px; border-radius: 6px; border: 1.5px solid #0284c7; font-size: 12.5px; font-weight: 700; color: #0284c7; outline: none; background: #f0f9ff; cursor: pointer;">
            ${Object.keys(customerPresets).map(k => `
              <option value="${k}" ${k === selectedPresetId ? 'selected' : ''}>${escapeAttr(customerPresets[k].name)}</option>
            `).join('')}
          </select>

          ${isActiveBOM ? `
            <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; border: 1px solid #86efac; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-check-circle"></i> BOM 적용 중 (Active)
            </span>
          ` : `
            <button type="button" onclick="window.setActiveExternalTieRodBOM('${selectedPresetId}')" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer;">
              BOM 공식 사양으로 지정
            </button>
          `}
        </div>
      </div>

      <!-- Main Two-Column Layout -->
      <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
        <!-- Left Column: Layer Factor Table (38%) -->
        <div style="flex: 38; min-width: 320px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 13.5px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-layer-group" style="color: #0284c7;"></i> 1단계: 높이별 타이로드 단수 (Layer)
            </h4>
            <button type="button" onclick="window.resetExternalTieRodLayers()" style="font-size: 11px; padding: 2px 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; color: #64748b; cursor: pointer;">
              <i class="fa-solid fa-rotate-left"></i> 기본값
            </button>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 10px; line-height: 1.4;">
            탱크 높이에 따라 상하로 몇 단의 외부 타이로드를 설치할지 설정합니다.
          </div>
          ${renderLayerTable(dim)}
        </div>

        <!-- Right Column: Component Breakdown & Formula Table (62%) -->
        <div style="flex: 62; min-width: 500px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 13.5px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-calculator" style="color: #0284c7;"></i> 2단계: 외부 타이로드 구성 부재별 산출 내역
            </h4>
            <span style="font-size: 11px; color: #0284c7; font-weight: 700; background: #f0f9ff; padding: 2px 8px; border-radius: 4px; border: 1px solid #bae6fd;">
              수식 직접 수정 가능
            </span>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 10px; line-height: 1.4;">
            현재 탱크 치수에 맞춰 각 구성 부재의 수량이 실시간으로 자동 산출됩니다.
          </div>
          ${renderComponentTable(dim)}
        </div>
      </div>

      <!-- Section 3: Variable Dictionary Table -->
      ${renderVariableDictionary(dim)}

      <!-- Section 4: Dimension Segment Table -->
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
