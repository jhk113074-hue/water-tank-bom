// =============================================================================
// WATANI GRP Water Tank -- Steel Accessories ENGINE (인터프리터)
// =============================================================================
// steel_accessories_rules.js 의 선언형 스펙을 읽어 실제 수량으로 바꿔주는 얇은
// 인터프리터입니다. accessories_engine.js 와 같은 역할/같은 스타일이며, 수식은
// 전부 rule_engine.js 가 평가합니다. **이 파일에는 계수/품번이 없습니다** --
// 숫자를 바꾸려면 항상 steel_accessories_rules.js 만 고치십시오.
//
// 하는 일 딱 4가지:
//   1) 프로필 해석      resolveProfile()  : extends/overrides 를 펼쳐 최종 스펙
//   2) 변수 계산        buildScope()      : 기하 -> 단/그리드/보강 변수
//   3) 수식 평가        compute()         : byHeight x times  또는  formula
//   4) 품번/재질 해석   resolvePart()     : Z/SA2/SA4 접미사 + @동적품번
//
// 사용법:
//   const g = PanelEngine.makeGeometry(3.5, 3, 4.5, 3);      // 기존 geometry
//   const r = SteelAccessoriesEngine.compute(g, {
//     profile: "WATANI-STD",
//     reinf: "External",          // #reinfMethod
//     internalMaterial: "SS316",  // #internalItem
//     tieRodInternal: "SS316",    // #internalTieRod
//     tieRodExternal: "HDG",      // #outsideTieRod
//     sidePanelOnly: false,       // #sidePanelOnly
//   });
//   r.sections  // 도면 시트별 행 상세 (검산/감사 시트용)
//   r.parts     // 품번별 합계 (BOM 용)
//   r.warnings  // 미매핑 품번, 확인 필요 항목 등
// =============================================================================
(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./rule_engine.js"), require("./steel_accessories_rules.js"));
  } else {
    global.SteelAccessoriesEngine = factory(global.RuleEngine, global.SteelAccessoriesRules);
  }
})(typeof window !== "undefined" ? window : globalThis, function (RuleEngine, Rules) {
  "use strict";

  if (!RuleEngine) throw new Error("steel_accessories_engine.js requires rule_engine.js to be loaded first.");
  if (!Rules) throw new Error("steel_accessories_engine.js requires steel_accessories_rules.js to be loaded first.");

  // ---------------------------------------------------------------------------
  // 1) 프로필 해석 -- extends 로 상속받고 overrides 로 행 단위 덮어쓰기
  // ---------------------------------------------------------------------------
  // overrides 키는 "섹션ID.행ID" (예: "S3.b1616_17160"). 그 행에서 지정한
  // 필드만 교체하며, byHeight/part 는 (전체 교체가 아니라) 키 단위 병합입니다
  // -- 5M 하나만 고치고 싶을 때 표 9칸을 다시 쓰지 않도록.
  function resolveProfile(profileName) {
    const name = profileName || Rules.defaultProfile;
    const profile = Rules.profiles[name];
    if (!profile) {
      const known = Object.keys(Rules.profiles).join(", ");
      throw new Error(`알 수 없는 Steel Accessories 프로필: "${name}" (사용 가능: ${known})`);
    }

    let base;
    if (profile.extends) {
      base = resolveProfile(profile.extends);
    } else {
      base = {
        name,
        label: profile.label,
        courseStack: profile.courseStack || Rules.courseStack,
        reinforceDepth: profile.reinforceDepth || Rules.reinforceDepth,
        catalog: profile.catalog || {},
        sections: profile.sections || [],
      };
      return base;
    }

    // 상속 프로필: 섹션을 깊은 복사한 뒤 overrides 적용
    const sections = base.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({ ...r })),
    }));
    const overrides = profile.overrides || {};
    Object.keys(overrides).forEach((key) => {
      const [sectionId, rowId] = key.split(".");
      const section = sections.find((s) => s.id === sectionId);
      const row = section && section.rows.find((r) => r.id === rowId);
      if (!row) {
        throw new Error(`프로필 "${name}" 의 overrides 키 "${key}" 에 해당하는 행이 없습니다.`);
      }
      const patch = overrides[key];
      Object.keys(patch).forEach((field) => {
        if ((field === "byHeight" || field === "layersByHeight" || field === "part") && row[field]) {
          row[field] = Object.assign({}, row[field], patch[field]);
        } else {
          row[field] = patch[field];
        }
      });
    });

    // [개념 7] 카탈로그 치환: 상속받은 catalog 위에 catalogOverrides 를 품번
    // 단위로 병합합니다(항목 전체 교체가 아니라 필드 단위 병합 -- 이름만
    // 바꾸고 규격은 물려받는 경우가 많기 때문).
    const catalog = {};
    Object.keys(base.catalog || {}).forEach((pn) => { catalog[pn] = Object.assign({}, base.catalog[pn]); });
    const catOv = profile.catalogOverrides || profile.catalog || {};
    Object.keys(catOv).forEach((pn) => {
      catalog[pn] = Object.assign({}, catalog[pn] || {}, catOv[pn]);
    });

    return {
      name,
      label: profile.label || base.label,
      courseStack: profile.courseStack || base.courseStack,
      reinforceDepth: profile.reinforceDepth || base.reinforceDepth,
      catalog,
      sections,
    };
  }

  // 정규 품번 -> 거래처 품번/품명/규격. profile.catalog 에 항목이 없으면
  // 정규 품번을 그대로 쓰고 이름/규격은 앱 카탈로그(parts_db.json)에 맡깁니다.
  function applyCatalog(canonical, profile) {
    const entry = (profile.catalog || {})[canonical];
    if (!entry) return { partNo: canonical, canonical: canonical };
    return {
      partNo: entry.partNo || canonical,
      canonical: canonical,
      nameKo: entry.nameKo,
      nameEn: entry.nameEn,
      spec: entry.spec,
      note: entry.note,
    };
  }

  // ---------------------------------------------------------------------------
  // 2) 변수 계산 -- [개념 1] 단 스택 + [개념 2] 그리드 + [개념 4] 보강 등급
  // ---------------------------------------------------------------------------
  // steel_accessories_rules.js VARIABLES 사전과 1:1로 대응해야 합니다.
  // 변수를 추가하려면 여기와 VARIABLES 양쪽에 넣으십시오.
  function buildScope(g, options, profile) {
    const opt = options || {};

    const W_O = g.W.value, W_C = g.W.whole, W_F = g.W.half;
    const L1_O = g.L1.value, L2_O = g.L2.value, L3_O = g.L3.value, L4_O = g.L4.value;
    const L_O = L1_O + L2_O + L3_O + L4_O;
    const L_C = g.L_C_sum, L_F = g.L_F_sum;
    const H_O = g.H.value;
    // H_C/H_F: 높이의 정수부 / 0.5 플래그. 기존 검증 규칙이 브래킷 층 수를
    // "H_C+H_F-2" 로 표현하는데 그 값은 모든 높이에서 HJ_N 과 같습니다
    // (H>1 로 게이트되어 1mH 예외는 발생하지 않음). 다만 "H_C-1" 처럼
    // HJ_N 으로 환원되지 않는 형태도 있어 두 변수를 그대로 노출합니다.
    const H_C = g.H.whole, H_F = g.H.half;
    const N_PA = g.n_partitions;

    // [개념 1] 단 스택
    const stack = profile.courseStack[String(H_O)];
    if (!stack) {
      const known = Object.keys(profile.courseStack).join(", ");
      throw new Error(`Steel Accessories: ${H_O}mH 의 단(course) 구성이 정의되어 있지 않습니다 ` +
        `(정의된 높이: ${known}). steel_accessories_rules.js 의 courseStack 에 추가하십시오.`);
    }
    const CRS_N = stack.length;
    const CRS_TOP = stack[0];
    const CRS_1000 = stack.filter((mm) => mm === 1000).length;
    const HJ_N = CRS_N - 1;

    // [개념 2] 그리드
    const COL_W = W_C + W_F;
    const COL_L = L_C + L_F;
    // 칸(compartment)별 열 수. 격벽으로 나뉜 각 칸을 따로 세어야 하는 부재
    // (루프 서포터 등)에 필요합니다 -- 전체 길이로 세면 격벽 라인의 열이
    // 중복 계상됩니다.
    const COL_L1 = g.L1.whole + g.L1.half;
    const COL_L2 = g.L2.whole + g.L2.half;
    const COL_L3 = g.L3.whole + g.L3.half;
    const COL_L4 = g.L4.whole + g.L4.half;
    const COL_PERIM = (COL_W + COL_L) * 2;
    const VJ_W = Math.max(COL_W - 1, 0);
    const VJ_L = Math.max(COL_L - 1, 0);
    const VJ_PERIM = (VJ_W + VJ_L) * 2;
    // 폭면 1개 + 길이면 1개만 센 수직 조인트 라인 수 = VJ_PERIM/2.
    // 기존 accessories_rules.js 가 "perim" 이라 부르는 값과 정확히 같습니다
    // ("(W_C+W_F-1)+(L_C+L_F-1)"). 검증된 수식을 이식할 때 씁니다.
    const PERIM_J = VJ_W + VJ_L;
    const CORNER = 4;
    const BOT_N = COL_W * COL_L;
    const BOT_VJ = VJ_W * COL_L + VJ_L * COL_W;
    const PA_COL = COL_W * N_PA;
    const PA_VJ = VJ_W * N_PA;

    // [개념 4] 보강 등급
    const depthRow = profile.reinforceDepth.find((r) => H_O <= r.maxH);
    const RNF_ROWS = depthRow ? depthRow.rows : 0;
    const RNF_SIDES = depthRow ? depthRow.sides : 0;

    // 옵션 플래그
    const RF = (opt.reinf === "External") ? 2 : 1;
    const S_1M = opt.sidePanelOnly ? 1 : 0;

    return {
      W_O, W_C, W_F, L_O, L_C, L_F, L1_O, L2_O, L3_O, L4_O, H_O, H_C, H_F, N_PA,
      CRS_N, CRS_TOP, CRS_1000, HJ_N,
      COL_W, COL_L, COL_L1, COL_L2, COL_L3, COL_L4,
      COL_PERIM, VJ_W, VJ_L, VJ_PERIM, PERIM_J, CORNER, BOT_N, BOT_VJ, PA_COL, PA_VJ,
      RNF_ROWS, RNF_SIDES, RF, S_1M,
    };
  }

  // ---------------------------------------------------------------------------
  // 4) 품번/재질 해석
  // ---------------------------------------------------------------------------
  // row.material 이 가리키는 UI 선택값 -> 접미사 -> row.part 에서 품번 선택.
  //   SS316 -> SA4,  SS304 -> SA2,  HDG -> Z
  // row.part 가 문자열이면 재질과 무관한 고정 품번입니다.
  // "@" 로 시작하는 품번은 동적 생성(높이/용량 의존) -- DYNAMIC_PARTS 참조.
  const MATERIAL_KEY = { SS316: "SA4", SS304: "SA2", HDG: "Z" };

  const DYNAMIC_PARTS = {
    // 루프 서포터는 높이별 품번 (accessories_rules.js roofSupporter 와 동일 규칙)
    "@ROOF_SUPPORT": (scope) => "WRS-" + (scope.H_O * 1000) + "P",
    // 에어벤트는 공칭용량 100TON 경계로 50A/100A
    "@AIR_VENT": (scope) => (scope.W_O * scope.L_O * scope.H_O < 100 ? "WAV-0050A" : "WAV-0100A"),
  };

  function resolvePart(row, options, scope, warnings, profile) {
    const spec = row.part;
    let partNo = null;

    if (typeof spec === "string") {
      partNo = spec;
    } else if (spec && typeof spec === "object") {
      const src = Rules.materialSources[row.material];
      const selected = (src && src.source) ? (options[src.source] || "HDG") : "HDG";
      const key = MATERIAL_KEY[selected] || "Z";
      partNo = spec[key] || spec.Z || spec.SA2 || spec.SA4 || null;
      if (!spec[key]) {
        warnings.push(`${row.id}: 재질 ${selected}(${key}) 품번이 정의되지 않아 대체 품번 ${partNo} 을 사용했습니다.`);
      }
    }

    if (partNo && partNo.charAt(0) === "@") {
      const fn = DYNAMIC_PARTS[partNo];
      if (!fn) {
        warnings.push(`${row.id}: 동적 품번 ${partNo} 의 생성 규칙이 없습니다.`);
        return null;
      }
      partNo = fn(scope);
    }

    if (!partNo) {
      warnings.push(`${row.id}: 품번이 정의되지 않았습니다 (row.part 확인).`);
      return null;
    }

    // [개념 7] 정규 품번을 거래처 품번/품명/규격으로 치환
    const resolved = applyCatalog(partNo, profile);
    if (row.needsPartConfirm) {
      warnings.push(`${row.id}: 품번 ${resolved.partNo} 은 확인 대상입니다 (규격/중량/단가 미확정).`);
    }
    return resolved;
  }

  // ---------------------------------------------------------------------------
  // 3) 계산 본체
  // ---------------------------------------------------------------------------
  // 행 평가 순서 = rules 파일에 적힌 순서입니다. 앞선 행의 결과를 뒤 행이
  // 수식에서 행 ID 로 참조할 수 있습니다(예: S4.trNut12 가 tr12x1 을 참조).
  // accessories_rules.js boltsAndNuts 가 AP<n> 을 서로 참조하는 것과 같은 방식.
  function compute(g, options) {
    const opt = options || {};
    const profile = resolveProfile(opt.profile);
    const warnings = [];
    const scope = buildScope(g, opt, profile);

    const byPart = {};
    const sections = [];

    profile.sections.forEach((section) => {
      const active = RuleEngine.evaluate(section.appliesWhen || "true", scope) === true
        || RuleEngine.evaluate(section.appliesWhen || "true", scope) > 0;

      const rows = section.rows.map((row) => {
        let qty = 0;
        let how = "";

        if (!active) {
          how = `미적용 (${section.appliesWhen})`;
        } else if (row.byHeight) {
          // (A) 표 형태:  라인당 개수 × 층 수 × 한 층의 라인 수
          //   byHeight       = 높이별 "라인 1개당 개수"
          //   layersByHeight = 높이별 "층(단) 수"  -- 생략하면 1
          //   times          = "한 층의 라인 개수" 수식
          // 세 인자를 분리해 두는 이유: 하나로 합치면 "2" 가 2본인지 2층인지
          // 구분되지 않아 도면과 대조할 수 없습니다(실제로 S4 에서 발생했던 문제).
          const per = row.byHeight[String(scope.H_O)];
          if (per === undefined) {
            warnings.push(`${section.id}.${row.id}: byHeight 표에 ${scope.H_O}mH 항목이 없어 0 으로 처리했습니다.`);
          }
          const layers = row.layersByHeight ? (Number(row.layersByHeight[String(scope.H_O)]) || 0) : 1;
          const lines = row.times ? Number(RuleEngine.evaluate(row.times, scope)) || 0 : 1;
          qty = (Number(per) || 0) * layers * lines;
          how = `${Number(per) || 0}개/라인`
            + (row.layersByHeight ? ` × ${layers}층` : "")
            + ` × (${row.times || 1})=${lines}라인`;
        } else if (row.formula) {
          // (B) 수식 형태
          qty = Number(RuleEngine.evaluate(row.formula, scope)) || 0;
          how = row.formula;
        } else {
          warnings.push(`${section.id}.${row.id}: byHeight 또는 formula 중 하나는 있어야 합니다.`);
        }

        qty = Math.max(0, qty);
        // 뒤 행이 참조할 수 있도록 행 ID 로 스코프에 기록 (반올림 전 값)
        scope[row.id] = qty;

        const rounded = row.unit === "M" ? Math.round(qty * 10) / 10 : Math.round(qty);
        const res = (active && rounded > 0) ? resolvePart(row, opt, scope, warnings, profile) : null;
        const partNo = res ? res.partNo : null;

        // intermediate 행은 뒤 행이 참조할 중간값일 뿐이므로 BOM 집계에서 제외
        if (res && rounded > 0 && !row.intermediate) {
          const key = partNo + "|" + (row.unit || "PCS");
          byPart[key] = byPart[key] || {
            partNo, canonical: res.canonical, nameKo: res.nameKo, nameEn: res.nameEn,
            spec: res.spec, note: res.note, unit: row.unit || "PCS", qty: 0, from: [],
          };
          byPart[key].qty += rounded;
          byPart[key].from.push(`${section.id}.${row.id}`);
        }

        return {
          id: row.id, rowKey: `${section.id}.${row.id}`,
          korvan: row.korvan, partNo, label: row.label, where: row.where,
          canonical: res ? res.canonical : null,
          nameKo: res ? res.nameKo : undefined, spec: res ? res.spec : undefined,
          unit: row.unit || "PCS", qty: rounded, how,
          material: row.material, needsPartConfirm: !!row.needsPartConfirm,
          intermediate: !!row.intermediate,
        };
      });

      sections.push({
        id: section.id, sheet: section.sheet, panel: section.panel,
        title: section.title, titleKo: section.titleKo,
        // verified: true 인 섹션은 이미 워크북과 대조 검증된 수식을 읽을 수 있는
        // 형태로 이식한 것이므로 계수를 임의로 바꾸면 회귀가 됩니다.
        verified: !!section.verified,
        appliesWhen: section.appliesWhen, active, rows,
        subtotal: rows.reduce((s, r) => s + r.qty, 0),
      });
    });

    const parts = Object.keys(byPart)
      .map((k) => byPart[k])
      .filter((p) => p.qty > 0)
      .sort((a, b) => a.partNo.localeCompare(b.partNo));

    return {
      profile: profile.name, profileLabel: profile.label,
      scope, sections, parts,
      total: parts.reduce((s, p) => s + p.qty, 0),
      warnings,
    };
  }

  // 프로필 목록 (UI 드롭다운용)
  function profileOptions() {
    return Object.keys(Rules.profiles).map((k) => ({ value: k, label: Rules.profiles[k].label }));
  }

  const SteelAccessoriesEngine = {
    compute, resolveProfile, buildScope, profileOptions,
    variables: Rules.variables,
  };

  return SteelAccessoriesEngine;
});
