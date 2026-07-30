/**
 * Steel Accessories 설치표준 스펙 검산표 (Steel Accessories Spec Audit Sheet)
 * Water Tank BOM System
 *
 * steel_accessories_rules.js / steel_accessories_engine.js 의 결과를 화면에
 * 띄우는 뷰입니다. reinforcing_audit.js / bolt_logic_audit.js 와 같은 패턴
 * (자체 IIFE, window 에 render 함수 노출, 입력 변경 시 재렌더)입니다.
 *
 * 왜 BOM 을 대체하지 않고 "병행 표시" 인가
 * ---------------------------------------------------------------------------
 * 보강재는 1~5mH 전 구간에서 기존 검증 엔진과 공통 품번 전부가 일치하므로
 * 대체해도 숫자가 같습니다. 그런데 이 스펙은 보강재 외에 타이로드(S4)/
 * 실링테이프(S6)/부속자재(S11)도 함께 산출하고, **그 부분은 app.js 가 이미
 * 별도 라인으로 BOM 에 넣고 있습니다**(tieRodInternalParts, airVent,
 * roofSupporter, steelSkidDetailedParts ...). 통째로 붙이면 그 항목들이
 * 이중 계상됩니다. 그래서 1단계는 BOM 을 건드리지 않고 나란히 보여주는
 * 검산표이고, 대체는 영역별로(먼저 보강재만) 나중에 진행하는 것이 안전합니다.
 *
 * 이 화면이 보여주는 것:
 *   1) 프로필 선택 (거래처별 품번/수식 프로필)
 *   2) 계산된 변수 (단 스택 / 그리드 / 보강 등급)
 *   3) 시트별 행 상세 -- 수량, 계산 과정, 설치 위치, 정규 품번
 *   4) 기존 검증 엔진과의 품번별 대조 (일치/불일치/범위밖)
 */

(function () {
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 기존 엔진과 "의도적으로" 다른 품번 -- verify_steel_accessories.js 의
  // INTENTIONAL_DIFFS 와 같은 목록입니다. 코너 프레임은 높이별 상수표를 단
  // 스택 규칙으로 일반화했으므로 조각 구성이 달라지지만 총 길이는 같습니다.
  const INTENTIONAL = {
    'WCA-1000Z': '코너 프레임 일반화 (총 코너 길이는 동일)',
    'WCA-1500Z': '코너 프레임 일반화 (총 코너 길이는 동일)',
    'WCA-2000Z': '코너 프레임 일반화 (총 코너 길이는 동일)',
  };

  function ready() {
    return typeof SteelAccessoriesEngine !== 'undefined'
      && typeof PanelEngine !== 'undefined'
      && typeof window.getTankDimensions === 'function';
  }

  // S6 의 50mm 테이프 길이는 패널 구성에서 나옵니다(패널 역할별 플랜지 둘레).
  // 이미 검증된 PanelEngine.sealingTapeDetail 이 그 계산을 갖고 있으므로 그
  // 값을 스펙에 넘겨줍니다 -- 스펙 쪽에서 기하로 재유도하지 않습니다.
  function tapeMeters(dim) {
    try {
      return PanelEngine.sealingTapeDetail(
        { W: dim.width, L1: dim.l1, L2: dim.l2, L3: dim.l3, L4: dim.l4, H: dim.height },
        {
          sidePanelOnly: (document.getElementById('sidePanelOnly') || {}).value === '1x1' ? '1x1' : 'DEFAULT',
          partitionPanelOnly: (document.getElementById('partitionPanelOnly') || {}).value === '1x1' ? '1x1' : 'DEFAULT',
        }
      ).totalMeters;
    } catch (e) { return 0; }
  }

  function currentOptions(dim) {
    const val = (id, dflt) => {
      const el = document.getElementById(id);
      return el ? el.value : dflt;
    };
    return {
      tapeMeters50: dim ? tapeMeters(dim) : 0,
      profile: val('steelSpecProfile', undefined) || undefined,
      reinf: val('reinfMethod', 'Internal'),
      internalMaterial: val('internalItem', 'SS316'),
      tieRodInternal: val('internalTieRod', 'SS316'),
      tieRodExternal: val('outsideTieRod', 'HDG'),
      sidePanelOnly: val('sidePanelOnly', '') === '1x1',
    };
  }

  function geometry(dim) {
    return PanelEngine.makeGeometry(dim.width, dim.l1, dim.height, dim.l2, dim.l3, dim.l4);
  }

  // 기존 검증 엔진(reinforcing)과 품번별로 대조합니다. isSA4 는 보강 방식이
  // 아니라 내부재 재질 선택을 따르는 접미사 플래그입니다 -- 여기를 어긋나게
  // 넘기면 SA2/SA4 가 갈려 실제로는 일치하는 부재가 불일치로 보입니다.
  function compare(g, opt, res) {
    const rows = {};
    const bump = (pn, key, qty) => {
      rows[pn] = rows[pn] || { partNo: pn, o: 0, n: 0 };
      rows[pn][key] += qty;
    };
    let oldOk = true;
    try {
      const isInt = opt.reinf !== 'External';
      const isSA4 = opt.internalMaterial === 'SS316';
      AccessoriesEngine.reinforcingParts(g, isInt, isSA4, opt.sidePanelOnly).parts
        .forEach((p) => bump(p.partNo, 'o', p.qty));
    } catch (e) { oldOk = false; }
    res.parts.forEach((p) => bump(p.canonical || p.partNo, 'n', p.qty));

    const both = [], onlyNew = [], onlyOld = [];
    Object.keys(rows).forEach((pn) => {
      const r = rows[pn];
      if (r.o > 0 && r.n > 0) both.push(r);
      else if (r.o > 0) onlyOld.push(r);
      else onlyNew.push(r);
    });
    both.sort((a, b) => Math.abs(b.n - b.o) - Math.abs(a.n - a.o) || a.partNo.localeCompare(b.partNo));
    onlyOld.sort((a, b) => b.o - a.o);
    onlyNew.sort((a, b) => b.n - a.n);
    return { both, onlyOld, onlyNew, oldOk };
  }

  function profileSelector(res) {
    const opts = SteelAccessoriesEngine.profileOptions()
      .map((o) => `<option value="${esc(o.value)}"${o.value === res.profile ? ' selected' : ''}>${esc(o.label)}</option>`)
      .join('');
    return `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <label style="font-size:12px; font-weight:700; color:#334155; margin:0;">거래처 프로필</label>
        <select id="steelSpecProfile" style="font-size:12px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:5px;">${opts}</select>
        <span style="font-size:11px; color:#64748b;">품번·품명·규격 치환은 프로필의 catalogOverrides 에서 관리합니다</span>
      </div>`;
  }

  function variablesBlock(scope) {
    const groups = [
      ['치수', ['W_O', 'W_C', 'W_F', 'L_O', 'L_C', 'L_F', 'H_O', 'H_C', 'H_F', 'N_PA']],
      ['단 스택', ['CRS_N', 'CRS_TOP', 'CRS_1000', 'HJ_N']],
      ['그리드', ['COL_W', 'COL_L', 'COL_PERIM', 'VJ_W', 'VJ_L', 'VJ_PERIM', 'PERIM_J', 'CORNER', 'BOT_VJ', 'PA_COL', 'PA_VJ']],
      ['보강/옵션', ['RNF_ROWS', 'RNF_SIDES', 'RF', 'S_1M']],
    ];
    return groups.map(([name, keys]) => `
      <div style="display:flex; gap:6px; align-items:baseline; flex-wrap:wrap; margin-bottom:3px;">
        <span style="font-size:11px; font-weight:700; color:#0284c7; min-width:52px;">${esc(name)}</span>
        ${keys.filter((k) => scope[k] !== undefined).map((k) =>
          `<code style="font-size:11px; background:#f1f5f9; padding:1px 5px; border-radius:3px; color:#0f172a;">${esc(k)}=${esc(scope[k])}</code>`).join('')}
      </div>`).join('');
  }

  function sectionsTable(res) {
    return res.sections.map((s) => {
      const active = s.active;
      const shown = s.rows.filter((r) => r.qty > 0 || active);
      const badge = s.verified
        ? '<span style="font-size:10px; background:#dcfce7; color:#166534; padding:1px 6px; border-radius:8px; font-weight:700;">검증됨</span>'
        : '<span style="font-size:10px; background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:8px; font-weight:700;">확인 대상</span>';
      return `
        <div style="margin-bottom:14px; border:1px solid #e2e8f0; border-radius:7px; overflow:hidden;${active ? '' : ' opacity:0.55;'}">
          <div style="background:#f8fafc; padding:6px 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; border-bottom:1px solid #e2e8f0;">
            <span style="font-size:11px; font-weight:700; color:#64748b;">시트 ${esc(s.sheet)}</span>
            <span style="font-size:12.5px; font-weight:800; color:#0f172a;">[${esc(s.id)}] ${esc(s.titleKo || s.title)}</span>
            <span style="font-size:11px; color:#64748b;">${esc(s.title)}</span>
            ${badge}
            ${active ? '' : `<span style="font-size:11px; color:#b91c1c;">미적용 (${esc(s.appliesWhen)})</span>`}
            <span style="margin-left:auto; font-size:11px; color:#334155;">소계 ${esc(s.subtotal)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
            <thead>
              <tr style="background:#fff; color:#475569;">
                <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #e2e8f0;">행</th>
                <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #e2e8f0;">Korvan</th>
                <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #e2e8f0;">품번</th>
                <th style="text-align:right; padding:4px 8px; border-bottom:1px solid #e2e8f0;">수량</th>
                <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #e2e8f0;">단위</th>
                <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #e2e8f0;">계산 과정</th>
                <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #e2e8f0;">설치 위치</th>
              </tr>
            </thead>
            <tbody>
              ${shown.map((r) => `
                <tr style="${r.qty > 0 ? '' : 'color:#94a3b8;'}">
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9;"><code style="font-size:10.5px;">${esc(r.id)}</code>${r.intermediate ? ' <span style="font-size:9.5px; color:#a16207;">(중간값)</span>' : ''}</td>
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9;">${esc(r.korvan || '')}</td>
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9;">
                    ${esc(r.partNo || '-')}
                    ${r.canonical && r.canonical !== r.partNo ? `<span style="font-size:10px; color:#7c3aed;"> ← ${esc(r.canonical)}</span>` : ''}
                    ${r.needsPartConfirm ? '<span style="font-size:10px; color:#b45309;"> ⚠확인</span>' : ''}
                  </td>
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700;">${esc(r.qty)}</td>
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9;">${esc(r.unit)}</td>
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9;"><code style="font-size:10.5px; color:#475569;">${esc(r.how)}</code></td>
                  <td style="padding:3px 8px; border-bottom:1px solid #f1f5f9; color:#475569;">${esc(r.where || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }).join('');
  }

  function compareTable(cmp) {
    const cell = 'padding:3px 8px; border-bottom:1px solid #f1f5f9;';
    const line = (r) => {
      const d = r.n - r.o;
      const intent = INTENTIONAL[r.partNo];
      const color = d === 0 ? '#166534' : (intent ? '#7c3aed' : '#b91c1c');
      return `
        <tr>
          <td style="${cell}">${esc(r.partNo)}</td>
          <td style="${cell} text-align:right;">${esc(r.o)}</td>
          <td style="${cell} text-align:right;">${esc(r.n)}</td>
          <td style="${cell} text-align:right; font-weight:700; color:${color};">${d === 0 ? '일치' : (d > 0 ? '+' + d : d)}</td>
          <td style="${cell} color:#64748b; font-size:11px;">${esc(intent || '')}</td>
        </tr>`;
    };
    const tunable = cmp.both.filter((r) => !INTENTIONAL[r.partNo]);
    const exact = tunable.filter((r) => r.n === r.o).length;
    return `
      <div style="font-size:12px; color:#334155; margin-bottom:6px;">
        공통 품번 <b>${cmp.both.length}</b>종 중 조정 대상 <b>${tunable.length}</b>종 —
        <b style="color:${exact === tunable.length ? '#166534' : '#b91c1c'};">${exact}종 일치</b>
        ${cmp.both.length - tunable.length ? ` · 의도된 차이 ${cmp.both.length - tunable.length}종` : ''}
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
        <thead>
          <tr style="background:#f8fafc; color:#475569;">
            <th style="text-align:left; padding:4px 8px;">품번 (정규)</th>
            <th style="text-align:right; padding:4px 8px;">기존 엔진</th>
            <th style="text-align:right; padding:4px 8px;">이 스펙</th>
            <th style="text-align:right; padding:4px 8px;">차이</th>
            <th style="text-align:left; padding:4px 8px;">비고</th>
          </tr>
        </thead>
        <tbody>${cmp.both.map(line).join('')}</tbody>
      </table>
      <div style="margin-top:8px; font-size:11.5px; color:#475569; line-height:1.7;">
        <div><b>기존에만 있는 품번 ${cmp.onlyOld.length}종</b>${cmp.onlyOld.length ? ' — 이 스펙의 커버리지 공백입니다: ' + cmp.onlyOld.map((r) => esc(r.partNo) + '(' + r.o + ')').join(', ') : ' ✓ 없음'}</div>
        <div><b>이 스펙에만 있는 품번 ${cmp.onlyNew.length}종</b> — 타이로드/실링테이프/부속자재 등 기존 reinforcing 범위 밖 서브시스템이라 정상입니다.</div>
      </div>`;
  }

  function render() {
    const container = document.getElementById('steelSpecAuditContainer');
    if (!container) return;
    if (!ready()) {
      container.innerHTML = '<div style="padding:16px; color:#b91c1c; font-size:13px;">Steel Accessories 스펙 모듈을 불러오지 못했습니다.</div>';
      return;
    }

    const dim = window.getTankDimensions();
    const opt = currentOptions(dim);
    let res;
    try {
      res = SteelAccessoriesEngine.compute(geometry(dim), opt);
    } catch (e) {
      container.innerHTML = `<div style="padding:16px; color:#b91c1c; font-size:13px;">계산 실패: ${esc(e.message)}</div>`;
      return;
    }
    const cmp = compare(geometry(dim), opt, res);

    container.innerHTML = `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:9px; padding:14px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <h3 style="margin:0; font-size:15px; font-weight:800; color:#0f172a;">
            <i class="fa-solid fa-drafting-compass" style="color:#dc2626;"></i>
            Steel Accessories 설치표준 스펙 검산표
          </h3>
          <span style="font-size:11.5px; color:#64748b;">
            ${esc(dim.width)}m × ${esc(dim.length)}m × ${esc(dim.height)}mH / 격벽 ${esc(dim.numPartition)} / 보강 ${esc(opt.reinf)}
          </span>
        </div>

        <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; padding:8px 10px; font-size:11.5px; color:#78350f; margin-bottom:12px;">
          이 표는 <b>BOM 을 대체하지 않습니다</b>. 보강재는 기존 검증 엔진과 전 구간 일치하지만, 이 스펙이 함께 내는
          타이로드·실링테이프·부속자재는 app.js 가 이미 별도 라인으로 BOM 에 넣고 있어 통째로 붙이면 이중 계상됩니다.
          먼저 이 표로 값을 확인하고, 대체는 영역별로 진행하십시오.
        </div>

        <div style="margin-bottom:12px;">${profileSelector(res)}</div>

        <details style="margin-bottom:12px;" open>
          <summary style="cursor:pointer; font-size:12.5px; font-weight:700; color:#334155;">계산된 변수</summary>
          <div style="margin-top:6px; padding:8px; background:#f8fafc; border-radius:6px;">${variablesBlock(res.scope)}</div>
        </details>

        <details style="margin-bottom:12px;" open>
          <summary style="cursor:pointer; font-size:12.5px; font-weight:700; color:#334155;">
            기존 검증 엔진과의 품번별 대조 ${cmp.oldOk ? '' : '(기존 엔진 계산 실패)'}
          </summary>
          <div style="margin-top:6px;">${compareTable(cmp)}</div>
        </details>

        ${res.warnings.length ? `
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 10px; font-size:11.5px; color:#991b1b; margin-bottom:12px;">
            ${res.warnings.map((w) => `<div>· ${esc(w)}</div>`).join('')}
          </div>` : ''}

        <div style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px;">
          시트별 상세 — 품번별 합계 ${esc(res.parts.length)}종 / 총 ${esc(res.total)}
        </div>
        ${sectionsTable(res)}
      </div>`;

    const sel = document.getElementById('steelSpecProfile');
    if (sel) sel.addEventListener('change', render);
  }

  window.renderSteelSpecAuditView = render;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(render, 300);

    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-steel-spec-audit"]');
    if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(render, 0));

    ['tankLength1', 'tankLength2', 'tankLength3', 'tankLength4', 'tankWidth', 'tankHeight',
     'numPartition', 'reinfMethod', 'internalItem', 'internalTieRod', 'outsideTieRod',
     'sidePanelOnly', 'partitionPanelOnly'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', render);
        el.addEventListener('change', render);
      }
    });
  });
})();
