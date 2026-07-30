#!/usr/bin/env node
// =============================================================================
// Steel Accessories 스펙 검증 스크립트
// =============================================================================
//   node verify_steel_accessories.js            (요약 + 대조표)
//   node verify_steel_accessories.js --detail   (시트별 전체 행 상세)
//   node verify_steel_accessories.js --case 3.5x3x4.5   (특정 케이스만)
//   node verify_steel_accessories.js --only-4m          (4mH 까지만)
//
// 이 스크립트가 하는 일:
//   [1] 구조 검사   -- 정의된 모든 높이/치수 조합에서 수식이 오류 없이 돌고,
//                      음수/NaN 이 없고, 품번이 parts_db.json 에 존재하는지
//   [2] 프로필 검사 -- extends/overrides 가 의도대로 반영되는지
//   [3] 대조표      -- 이미 검증된 accessories_engine.js(기존 엔진)의 합계와
//                      새 스펙의 합계를 나란히 놓고 차이(Δ)를 보여줍니다
//
// [3]의 차이는 "버그"가 아닙니다. 새 스펙은 Korvan 설치표준 개념에서 유도한
// 1차 정의이므로, 이 표를 보면서 steel_accessories_rules.js 의 계수를
// 조정해 나가는 것이 이 스크립트의 용도입니다.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const PanelEngine = require("./panel_engine.js");
const AccessoriesEngine = require("./accessories_engine.js");
const SteelAccessoriesEngine = require("./steel_accessories_engine.js");
const SteelRules = require("./steel_accessories_rules.js");

const partsDb = JSON.parse(fs.readFileSync(path.join(__dirname, "parts_db.json"), "utf8"));
const knownParts = new Set(partsDb.map((p) => String(p.partNo)));

const argv = process.argv.slice(2);
const wantDetail = argv.includes("--detail");
const caseArg = (() => {
  const i = argv.indexOf("--case");
  return i >= 0 ? argv[i + 1] : null;
})();

// 캘리브레이션 범위: 1~5mH 전 구간이 맞춰졌으므로 기본이 전체입니다.
// --only-4m 으로 4mH 까지만 좁힐 수 있습니다(4.5/5mH 회귀를 분리해 볼 때 유용).
const ALL_HEIGHTS = Object.keys(SteelRules.courseStack).map(Number).sort((a, b) => a - b);
const only4m = argv.includes("--only-4m");
const HEIGHTS = only4m ? ALL_HEIGHTS.filter((h) => h <= 4) : ALL_HEIGHTS;

// 검증 케이스: 작은 탱크 / 반패널 포함 / 격벽 포함 / 대형 -- 각 높이마다
function buildCases() {
  const shapes = [
    { W: 2,   L: [2],       label: "소형 2x2" },
    { W: 3.5, L: [3],       label: "반패널 3.5x3" },
    { W: 3,   L: [3, 3],    label: "격벽1 3x(3+3)" },
    { W: 4.5, L: [4, 4, 4], label: "격벽2 4.5x(4+4+4)" },
    { W: 6,   L: [8],       label: "대형 6x8" },
  ];
  const cases = [];
  HEIGHTS.forEach((H) => {
    shapes.forEach((s) => {
      cases.push({
        H, W: s.W, L: s.L, label: `${s.label} @ ${H}mH`,
        key: `${s.W}x${s.L.join("+")}x${H}`,
      });
    });
  });
  return cases;
}

function geometryOf(c) {
  return PanelEngine.makeGeometry(c.W, c.L[0], c.H, c.L[1] || 0, c.L[2] || 0, c.L[3] || 0);
}

// S6 의 50mm 테이프 길이는 패널 구성에서 나오므로(패널 역할별 플랜지 둘레),
// 이미 검증된 PanelEngine.sealingTapeDetail 의 값을 스펙에 넘겨줍니다.
// steel_accessories_engine.js 는 이 값을 options.tapeMeters50 으로 받습니다.
function tapeMetersOf(c) {
  try {
    return PanelEngine.sealingTapeDetail(
      { W: c.W, L1: c.L[0], L2: c.L[1] || 0, L3: c.L[2] || 0, L4: c.L[3] || 0, H: c.H },
      { sidePanelOnly: "DEFAULT", partitionPanelOnly: "DEFAULT" }
    ).totalMeters;
  } catch (e) { return 0; }
}

// 케이스별 옵션 (테이프 길이는 케이스마다 다르므로 여기서 합칩니다)
function optionsFor(c, extra) {
  return Object.assign({}, OPTIONS, { tapeMeters50: tapeMetersOf(c) }, extra || {});
}

const OPTIONS = {
  profile: "WATANI-STD",
  reinf: "External",
  internalMaterial: "SS316",
  tieRodInternal: "SS316",
  tieRodExternal: "HDG",
  sidePanelOnly: false,
};

// ---------------------------------------------------------------------------
// [1] 구조 검사
// ---------------------------------------------------------------------------
function structuralCheck(cases) {
  const problems = [];
  const unknownParts = new Map();   // partNo -> [rowKey]
  const needsConfirm = new Set();
  let evaluated = 0;

  cases.forEach((c) => {
    let r;
    try {
      r = SteelAccessoriesEngine.compute(geometryOf(c), optionsFor(c));
    } catch (e) {
      problems.push(`${c.label}: 계산 실패 -- ${e.message}`);
      return;
    }
    r.sections.forEach((s) => s.rows.forEach((row) => {
      evaluated++;
      if (!isFinite(row.qty)) problems.push(`${c.label} ${row.rowKey}: 수량이 숫자가 아닙니다 (${row.qty})`);
      if (row.qty < 0) problems.push(`${c.label} ${row.rowKey}: 수량이 음수입니다 (${row.qty})`);
      if (row.partNo && !knownParts.has(row.partNo)) {
        if (!unknownParts.has(row.partNo)) unknownParts.set(row.partNo, []);
        unknownParts.get(row.partNo).push(row.rowKey);
      }
      if (row.needsPartConfirm) needsConfirm.add(row.rowKey);
    }));
  });

  return { problems, unknownParts, needsConfirm, evaluated };
}

// ---------------------------------------------------------------------------
// [2] 프로필 검사 -- overrides 가 실제로 적용되는지
// ---------------------------------------------------------------------------
function profileCheck() {
  const out = [];
  // 세 override 가 모두 눈에 보이는 조건을 고릅니다:
  //   H=4     -> S4.tr12x2 의 layersByHeight["4"] 가 바뀜
  //   W=L=4   -> anchorBolt 가 5m 간격(0ea)과 4m 간격(2ea)에서 달라짐
  //   STS304  -> tr12x1 의 표준 품번이 SA2 이므로 SA4 고정 override 가 보임
  const g = PanelEngine.makeGeometry(4, 4, 4);
  const base = Object.assign({}, OPTIONS, { tieRodInternal: "SS304" });
  const std = SteelAccessoriesEngine.compute(g, base);
  const smp = SteelAccessoriesEngine.compute(g, Object.assign({}, base, { profile: "SAMPLE-CUSTOMER" }));

  function rowOf(res, key) {
    for (const s of res.sections) for (const r of s.rows) if (r.rowKey === key) return r;
    return null;
  }
  [
    ["S4.tr12x2", "layersByHeight override (4M: 2층 -> 3층)"],
    ["S4.tr12x1", "part override (STS316 고정)"],
    ["S11.anchorBolt", "formula override (5m -> 4m 간격)"],
  ].forEach(([key, what]) => {
    const a = rowOf(std, key), b = rowOf(smp, key);
    if (!a || !b) { out.push(`  ✗ ${key}: 행을 찾을 수 없음`); return; }
    const changed = a.qty !== b.qty || a.partNo !== b.partNo;
    out.push(`  ${changed ? "✓" : "✗"} ${key.padEnd(20)} ${what}`);
    out.push(`      표준=${a.qty} ${a.partNo || "-"}   →   샘플=${b.qty} ${b.partNo || "-"}`);
  });

  // 상속 프로필이 표준 프로필을 오염시키지 않았는지 (깊은 복사 확인)
  const std2 = SteelAccessoriesEngine.compute(g, base);
  const same = JSON.stringify(std.parts) === JSON.stringify(std2.parts);
  out.push(`  ${same ? "✓" : "✗"} 표준 프로필 불변성 (overrides 가 원본을 오염시키지 않음)`);
  return out;
}

// ---------------------------------------------------------------------------
// [2c] 카탈로그 치환 검사 -- 거래처별 품번/품명/규격 변경이 동작하는지
// ---------------------------------------------------------------------------
// 거래처마다 같은 부재를 다른 품번/이름으로 부르므로, row 를 건드리지 않고
// 프로필의 catalogOverrides 만으로 치환되는지 확인합니다. 수량은 절대 바뀌지
// 않아야 합니다(치환은 이름표만 바꾸는 것이므로).
function catalogCheck() {
  const out = [];
  const g = PanelEngine.makeGeometry(3.5, 3, 4, 3);
  const std = SteelAccessoriesEngine.compute(g, OPTIONS);
  const smp = SteelAccessoriesEngine.compute(g, Object.assign({}, OPTIONS, { profile: "SAMPLE-CUSTOMER" }));
  const findBy = (res, canonical) => res.parts.find((p) => p.canonical === canonical);

  [
    ["WFB-0950Z", "품번+품명+규격 전부 치환"],
    ["WFB-0950ZP", "품번+품명만 치환, 규격은 표준에서 상속"],
    ["WCA-1000Z", "품번은 유지하고 품명/규격만 치환"],
  ].forEach(([canonical, what]) => {
    const a = findBy(std, canonical), b = findBy(smp, canonical);
    if (!a || !b) { out.push(`  ✗ ${canonical}: 산출물에 없음`); return; }
    const renamed = a.partNo !== b.partNo || a.nameKo !== b.nameKo || a.spec !== b.spec;
    const qtySame = a.qty === b.qty;
    out.push(`  ${renamed && qtySame ? "✓" : "✗"} ${canonical.padEnd(13)} ${what}`);
    out.push(`      표준: ${a.partNo} / ${a.nameKo || "-"} / ${a.spec || "-"}`);
    out.push(`      샘플: ${b.partNo} / ${b.nameKo || "-"} / ${b.spec || "-"}   (수량 ${a.qty}${qtySame ? " 동일" : " ≠ " + b.qty + " ← 오류"})`);
  });

  // 치환된 품번은 거래처 품번이므로 parts_db.json 에 없는 것이 정상입니다.
  const substituted = smp.parts.filter((p) => p.canonical && p.canonical !== p.partNo);
  out.push(`  ℹ 치환된 품번 ${substituted.length}종 (거래처 품번이므로 parts_db.json 등록 불필요)`);
  return out;
}

// ---------------------------------------------------------------------------
// [2b] 정확 일치 검사 -- 기존 검증 엔진과 반드시 같아야 하는 항목
// ---------------------------------------------------------------------------
// S11(부속자재)의 일부 행은 이미 검증된 accessories_engine.js 와 같은 값을
// 내도록 의도적으로 맞춘 것입니다. 여기서 어긋나면 회귀(regression)입니다.
function exactMatchCheck(cases) {
  const mismatches = [];
  let checked = 0;

  const isSA4 = OPTIONS.internalMaterial === "SS316";

  cases.forEach((c) => {
    const g = geometryOf(c);
    let res;
    try { res = SteelAccessoriesEngine.compute(g, optionsFor(c)); } catch (e) { return; }
    const rowOf = (key) => {
      for (const s of res.sections) for (const r of s.rows) if (r.rowKey === key) return r;
      return null;
    };

    // 루프 서포터: 수량과 품번 모두 일치해야 함
    const rs = AccessoriesEngine.roofSupporter(g);
    const mine = rowOf("S11.roofSupport");
    checked++;
    if (mine.qty !== rs.qty || mine.partNo !== rs.partNo) {
      mismatches.push(`${c.label} roofSupport: 기존 ${rs.qty} ${rs.partNo} ≠ 신규 ${mine.qty} ${mine.partNo}`);
    }

    // S12(verified 섹션)의 V계열 바디 앵글은 기존 external 보강의
    // row11/row12 를 이식한 것이므로 품번별 수량이 정확히 같아야 함.
    // (코너 프레임 3행은 4.5/5M 누락을 의도적으로 보완했으므로 제외 -- 아래
    // cornerFrameGapReport 에서 따로 보고합니다.)
    const extDetail = AccessoriesEngine.reinforcingRowDetail(g, false, false, false);
    const oldOf = (id) => { const r = extDetail.find((x) => x.id === id); return r ? r.value : 0; };
    const oldV950 = oldOf("row11");
    const oldV450 = oldOf("row12");
    const newV950 = rowOf("S12.bodyBand").qty;
    const newV450 = rowOf("S12.bodyGrid").qty + rowOf("S12.bodyBandShort").qty;
    checked += 2;
    if (newV950 !== oldV950) {
      mismatches.push(`${c.label} WFB-0950VZ: 기존 ${oldV950} ≠ 신규 ${newV950} (S12.bodyBand)`);
    }
    if (newV450 !== oldV450) {
      mismatches.push(`${c.label} WFB-0450VZ: 기존 ${oldV450} ≠ 신규 ${newV450} (S12.bodyGrid+bodyBandShort)`);
    }

    // S4 타이로드: 라인(런) 수와 너트/와셔가 검증된 tieRodInternal 과 일치해야
    // 함. 검증된 nut = bw = 4 x 전체 라인 수 이므로 nut/4 가 라인 수입니다.
    // (로드 본체의 카탈로그 길이 분해는 tieRodInternal 이 담당하므로 여기서는
    //  비교하지 않습니다 -- S4 의 로드 행은 intermediate 배치 명세입니다.)
    const s4 = res.sections.find((s) => s.id === "S4");
    if (s4) {
      const q = {};
      s4.rows.forEach((r) => { q[r.id] = r.qty; });
      const myLines = q.tr12x1 + q.tr12x1h + q.tr12x2 + q.tr14x2 + q.trPaLine;
      let vNut = 0;
      try {
        const d = AccessoriesEngine.tieRodInternalParts(g, isSA4).detail;
        vNut = (d.find((x) => x.id === "nut") || {}).value || 0;
      } catch (e) { /* 미지원 조합 */ }
      checked += 2;
      if (myLines !== vNut / 4) {
        mismatches.push(`${c.label} 타이로드 라인 수: 기존 ${vNut / 4} ≠ 신규 ${myLines}`);
      }
      if (q.trNut !== vNut || q.trBw !== vNut) {
        mismatches.push(`${c.label} 타이로드 너트/와셔: 기존 ${vNut} ≠ 신규 ${q.trNut}/${q.trBw}`);
      }
    }

    // S6 실링테이프: app.js 가 BOM 에 넣는 값과 정확히 같아야 함.
    //   WST-P0050RO = ceil(패널기반 소요 미터 / 30) Roll
    //   WST-P0120M  = ceil(높이 x 4) (1M/Roll)
    const tapeM = tapeMetersOf(c);
    const roll = rowOf("S6.tape50roll");
    const corner = rowOf("S6.tape120");
    checked += 2;
    if (roll && roll.qty !== Math.ceil(tapeM / 30)) {
      mismatches.push(`${c.label} 실링테이프 50mm: 기존 ${Math.ceil(tapeM / 30)}Roll ≠ 신규 ${roll.qty}Roll`);
    }
    if (corner && corner.qty !== Math.ceil(c.H * 4)) {
      mismatches.push(`${c.label} 코너 실링테이프: 기존 ${Math.ceil(c.H * 4)} ≠ 신규 ${corner.qty}`);
    }

    // 에어벤트 품번(용량 경계 50A/100A)은 일치해야 함. 수량은 산정 기준이
    // 다름(기존=칸별 합, 신규=전체 면적)에 따라 다를 수 있어 품번만 검사.
    const av = AccessoriesEngine.airVent(g.W.value, [g.L1.value, g.L2.value, g.L3.value, g.L4.value].filter((x) => x > 0),
      AccessoriesEngine.nominalCapaM3(g.W.value, g.L1.value + g.L2.value + g.L3.value + g.L4.value, g.H.value));
    const myAv = rowOf("S11.airVent");
    checked++;
    if (myAv.partNo !== av.partNo) {
      mismatches.push(`${c.label} airVent 품번: 기존 ${av.partNo} ≠ 신규 ${myAv.partNo}`);
    }
  });

  return { mismatches, checked };
}

// ---------------------------------------------------------------------------
// [2d] 코너 프레임 등가성 검사 -- "의도된 차이" 가 정말 등가인지 증명
// ---------------------------------------------------------------------------
// S12 는 기존의 높이별 상수표를 단 스택 규칙으로 일반화했습니다. 조각 구성은
// 달라지지만 **코너 4곳을 덮는 총 길이는 같아야** 합니다. 그것을 실제로 계산해
// 확인합니다 -- 이게 성립하지 않으면 "의도된 차이" 가 아니라 버그입니다.
// (기존이 0 인 4.5/5M 은 원본 누락이므로 비교 대상에서 제외하고 따로 셉니다.)
const WCA_MM = { "WCA-1000Z": 1000, "WCA-1500Z": 1500, "WCA-2000Z": 2000 };
// 조각 구성이 바뀌면 중량/원가도 바뀔 수 있으므로 실제 카탈로그 값으로 확인합니다.
const PART_REC = {};
partsDb.forEach((x) => { PART_REC[x.partNo] = x; });

function cornerFrameEquivalence(cases) {
  const bad = [], gaps = [], priceDelta = [];
  let checked = 0;

  cases.forEach((c) => {
    const g = geometryOf(c);
    ["Internal", "External"].forEach((mode) => {
      const isInt = mode === "Internal";
      const isSA4 = OPTIONS.internalMaterial === "SS316";
      let neu;
      try { neu = SteelAccessoriesEngine.compute(g, optionsFor(c, { reinf: mode })); } catch (e) { return; }
      const lenOf = (parts, get) => parts.reduce((s, p) => s + (WCA_MM[get(p)] || 0) * p.qty, 0);
      const oldLen = lenOf(AccessoriesEngine.reinforcingParts(g, isInt, isSA4, false).parts, (p) => p.partNo);
      const newLen = lenOf(neu.parts, (p) => p.canonical || p.partNo);
      const expect = 4 * c.H * 1000;   // 코너 4곳 × 탱크 높이

      if (oldLen === 0) { gaps.push(`${c.label} / ${mode}`); return; }
      checked++;
      if (newLen !== oldLen || newLen !== expect) {
        bad.push(`${c.label} / ${mode}: 기존 ${oldLen}mm, 신규 ${newLen}mm, 기대 ${expect}mm`);
      }

      // 중량은 카탈로그 값이 길이에 정비례하므로 정확히 보존되어야 합니다.
      // 원가는 미터당 단가가 규격마다 달라(1500mm 이 가장 저렴) 달라질 수 있어
      // 오류가 아니라 증감으로 집계합니다 -- BOM 대체 시 실제 영향입니다.
      const sum = (parts, get, field) => parts.reduce((s2, p) => {
        const pn = get(p);
        if (!WCA_MM[pn]) return s2;
        return s2 + (Number((PART_REC[pn] || {})[field]) || 0) * p.qty;
      }, 0);
      const oldParts = AccessoriesEngine.reinforcingParts(g, isInt, isSA4, false).parts;
      const oldW = sum(oldParts, (p) => p.partNo, "weight");
      const newW = sum(neu.parts, (p) => p.canonical || p.partNo, "weight");
      if (Math.abs(newW - oldW) > 0.05) {
        bad.push(`${c.label} / ${mode}: 코너 프레임 중량 불일치 ${oldW.toFixed(1)} → ${newW.toFixed(1)} kg`);
      }
      const dP = sum(neu.parts, (p) => p.canonical || p.partNo, "price")
               - sum(oldParts, (p) => p.partNo, "price");
      if (Math.abs(dP) > 0.005) priceDelta.push({ label: `${c.label} / ${mode}`, d: dP });
    });
  });
  return { bad, gaps, priceDelta, checked };
}

// ---------------------------------------------------------------------------
// [3] 기존 검증된 엔진과의 대조표
// ---------------------------------------------------------------------------
// 비교 가능한 축만 고릅니다:
//   보강재  : 기존 reinforcingQty  vs  새 S1+S2+S3+S7+S8+S9+S10 (플랜지바/브래킷)
//   타이로드: 기존 tieRodQty       vs  새 S4
// 스틸스키드 본체는 새 스펙이 다루지 않으므로(조이너/부속만) 비교 대상 제외.
const REINF_SECTIONS = ["S1", "S2", "S3", "S7", "S8", "S9", "S10"];
const TIEROD_SECTIONS = ["S4"];

function sumSections(res, ids) {
  return res.sections
    .filter((s) => ids.includes(s.id))
    .reduce((sum, s) => sum + s.rows.reduce((a, r) => a + (r.unit === "M" || r.unit === "Roll" ? 0 : r.qty), 0), 0);
}

function comparisonTable(cases) {
  const rows = [];
  cases.forEach((c) => {
    const g = geometryOf(c);
    let oldReinf = null, oldTie = null, neu = null;
    try { oldReinf = AccessoriesEngine.reinforcingQty(g, OPTIONS.reinf === "Internal", false); } catch (e) { /* 기존 엔진 미지원 조합 */ }
    try { oldTie = AccessoriesEngine.tieRodQty(g); } catch (e) { /* 동일 */ }
    try { neu = SteelAccessoriesEngine.compute(g, OPTIONS); } catch (e) { return; }

    const newReinf = sumSections(neu, REINF_SECTIONS);
    const newTie = sumSections(neu, TIEROD_SECTIONS);
    rows.push({
      label: c.label,
      oldReinf, newReinf, dReinf: oldReinf === null ? null : newReinf - oldReinf,
      oldTie, newTie, dTie: oldTie === null ? null : newTie - oldTie,
    });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// [4] 품번별 교집합 대조 -- 실제 캘리브레이션 도구
// ---------------------------------------------------------------------------
// [3]의 섹션 합계 비교는 범위가 어긋나 있습니다: 이 스펙의 S4(타이로드),
// S6(실링테이프), S11(부속자재)은 기존 reinforcingParts 가 다루지 않는
// 서브시스템이므로 합계끼리 빼면 "범위 차이"가 "계수 오차"처럼 보입니다.
//
// 그래서 **양쪽이 모두 산출하는 품번만** 골라 비교합니다. 이것만이
// 사과-사과 비교이고, 계수를 조정할 근거가 됩니다.
// 보강 방식(Internal/External)은 양쪽 엔진에 같은 값을 넣어 비교합니다 --
// 브래킷류(WCP-*)와 WFB-1200Z 는 Internal 서브시스템에만 나오므로 모드를
// 맞추지 않으면 전부 "기존 0" 으로 보입니다.
// 의도된 차이: 조정 대상이 아니므로 평균 편차 통계에서 제외하고 따로 보고합니다.
const INTENTIONAL_DIFFS = {
  "WCA-1000Z": "코너 프레임 일반화 (기존 상수표는 4.5/5M 이 비어 있음)",
  "WCA-1500Z": "코너 프레임 일반화 — 총 코너 높이는 동일, 조각 구성만 다름",
  "WCA-2000Z": "코너 프레임 일반화 — 총 코너 높이는 동일, 조각 구성만 다름",
};

function partIntersectionTable(cases, reinfMode) {
  const isInt = reinfMode === "Internal";
  const opt = Object.assign({}, OPTIONS, { reinf: reinfMode });
  const agg = {};
  const bump = (pn, key, qty) => {
    agg[pn] = agg[pn] || { o: 0, n: 0 };
    agg[pn][key] += qty;
  };

  cases.forEach((c) => {
    const g = geometryOf(c);
    let neu;
    try { neu = SteelAccessoriesEngine.compute(g, Object.assign({}, opt, { tapeMeters50: tapeMetersOf(c) })); } catch (e) { return; }
    try {
      // isSA4 는 보강 방식이 아니라 **볼트 스펙(내부재 재질)** 을 따르는
      // 접미사 플래그입니다. 이 스펙의 material:"INT" 도 같은 선택값을 보므로
      // 양쪽에 같은 값을 넘겨야 SA2/SA4 가 어긋나지 않습니다. 처음에 isInt 를
      // 넘겼더니 External 모드에서 SA2/SA4 가 갈려 실제로는 일치하는 부재가
      // "미포함"으로 보였습니다.
      const isSA4 = OPTIONS.internalMaterial === "SS316";
      AccessoriesEngine.reinforcingParts(g, isInt, isSA4, false).parts
        .forEach((p) => bump(p.partNo, "o", p.qty));
    } catch (e) { /* 기존 엔진 미지원 조합 */ }
    neu.parts.forEach((p) => bump(p.partNo, "n", p.qty));
  });

  const both = [], onlyOld = [], onlyNew = [];
  Object.keys(agg).forEach((pn) => {
    const v = agg[pn];
    if (v.o > 0 && v.n > 0) both.push({ partNo: pn, o: v.o, n: v.n, d: v.n - v.o });
    else if (v.o > 0) onlyOld.push({ partNo: pn, qty: v.o });
    else if (v.n > 0) onlyNew.push({ partNo: pn, qty: v.n });
  });
  both.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  onlyOld.sort((a, b) => b.qty - a.qty);
  onlyNew.sort((a, b) => b.qty - a.qty);
  return { both, onlyOld, onlyNew };
}

function pct(a, b) {
  if (a === null || a === 0) return "  -  ";
  const p = ((b - a) / a) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(0) + "%";
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------
let cases = buildCases();
if (caseArg) cases = cases.filter((c) => c.key === caseArg);
if (!cases.length) {
  console.error(`--case "${caseArg}" 에 해당하는 케이스가 없습니다. 예: 3.5x3x4.5`);
  process.exit(1);
}

console.log("=".repeat(78));
console.log("Steel Accessories 스펙 검증  (steel_accessories_rules.js)");
const V = SteelRules.VERIFIED || {};
console.log(`스키마 v${SteelRules.SCHEMA_VERSION}`);
console.log(`검증상태: 보강재=${V.reinforcing ? "검증됨" : "미검증"} / 코너프레임=${V.cornerFrame || "-"}`
  + ` / 타이로드=${V.tieRod === "lines" ? "라인수 검증됨" : (V.tieRod ? "검증됨" : "미검증")}`
  + ` / 실링테이프=${V.sealingTape === "delegated" ? "위임+검증됨" : (V.sealingTape ? "검증됨" : "미검증")}`
  + ` / 부속자재=${V.subsidiary || "-"}`);
console.log(`케이스 ${cases.length}개 / 높이 ${HEIGHTS.join(", ")}mH`);
console.log("=".repeat(78));

// [1]
const sc = structuralCheck(cases);
console.log(`\n[1] 구조 검사 -- 평가된 행 ${sc.evaluated}개`);
if (!sc.problems.length) {
  console.log("  ✓ 수식 오류 / 음수 / NaN 없음");
} else {
  sc.problems.slice(0, 20).forEach((p) => console.log("  ✗ " + p));
  if (sc.problems.length > 20) console.log(`  ... 외 ${sc.problems.length - 20}건`);
}
if (sc.unknownParts.size === 0) {
  console.log("  ✓ 모든 품번이 parts_db.json 에 존재");
} else {
  console.log(`  ! parts_db.json 에 없는 품번 ${sc.unknownParts.size}종 -- 카탈로그 등록 또는 품번 수정 필요:`);
  [...sc.unknownParts.entries()].forEach(([p, keys]) => {
    console.log(`      ${p.padEnd(16)} ← ${[...new Set(keys)].join(", ")}`);
  });
}
if (sc.needsConfirm.size) {
  console.log(`  ! 임시 매핑(고객 확인 필요): ${[...sc.needsConfirm].join(", ")}`);
}

// [2]
console.log("\n[2] 프로필 상속/덮어쓰기 검사  (WATANI-STD → SAMPLE-CUSTOMER)");
profileCheck().forEach((l) => console.log(l));

// [2c]
console.log("\n[2c] 카탈로그 치환 검사  (거래처별 품번/품명/규격 변경)");
catalogCheck().forEach((l) => console.log(l));

// [2d]
const cf = cornerFrameEquivalence(cases);
console.log(`\n[2d] 코너 프레임 등가성 검사 -- 총 코너 길이(= 4 × 높이)가 같은지 ${cf.checked}건`);
if (!cf.bad.length) {
  console.log("  ✓ 조각 구성은 달라도 총 코너 길이는 기존과 동일 (= 의도된 차이임이 확인됨)");
} else {
  cf.bad.slice(0, 10).forEach((m) => console.log("  ✗ " + m));
}
if (cf.priceDelta.length) {
  const up = cf.priceDelta.filter((x) => x.d > 0), down = cf.priceDelta.filter((x) => x.d < 0);
  console.log(`  ℹ 코너 프레임 원가 변동 ${cf.priceDelta.length}건 (중량은 전부 동일):`
    + ` 절감 ${down.length}건 / 증가 ${up.length}건`);
  cf.priceDelta.slice(0, 4).forEach((x) => console.log(`      ${x.label}: ${x.d > 0 ? "+" : ""}${x.d.toFixed(2)}`));
}
if (cf.gaps.length) {
  console.log(`  ! 기존이 코너 프레임을 0개 산출하는 케이스 ${cf.gaps.length}건 (원본 누락, 이 스펙이 보완): ${cf.gaps.slice(0, 3).join(" / ")}${cf.gaps.length > 3 ? " ..." : ""}`);
}

// [2b]
const em = exactMatchCheck(cases);
console.log(`\n[2b] 정확 일치 검사 -- 기존 검증 엔진과 같아야 하는 항목 ${em.checked}건`);
if (!em.mismatches.length) {
  console.log("  ✓ roofSupport(수량+품번), airVent(품번), S12 V계열 바디앵글(수량),");
  console.log("    S4 타이로드 라인 수 + 너트/와셔(라인당 4개),");
  console.log("    S6 실링테이프 50mm 롤 수 + 코너 테이프 — 전 케이스 일치");
} else {
  em.mismatches.slice(0, 15).forEach((m) => console.log("  ✗ " + m));
  if (em.mismatches.length > 15) console.log(`  ... 외 ${em.mismatches.length - 15}건`);
}

// [3]
console.log("\n[3] 기존 검증 엔진과의 대조  (Δ = 새 스펙 − 기존 엔진)");
console.log("    ※ 차이는 버그가 아니라 계수 조정 대상입니다. 아래 값을 보고");
console.log("       steel_accessories_rules.js 의 byHeight/formula 를 맞춰가십시오.");
console.log("");
console.log("  " + "케이스".padEnd(26) + "보강재(기존)  보강재(신)   Δ      %      타이로드(기존) (신)    Δ");
console.log("  " + "-".repeat(96));
const table = comparisonTable(cases);
table.forEach((r) => {
  const f = (v) => (v === null ? "  n/a" : String(v).padStart(6));
  console.log("  " + r.label.padEnd(26)
    + f(r.oldReinf) + "     " + f(r.newReinf) + "  " + f(r.dReinf) + "  " + pct(r.oldReinf, r.newReinf).padStart(6)
    + "     " + f(r.oldTie) + " " + f(r.newTie) + " " + f(r.dTie));
});

// 요약 통계
const withReinf = table.filter((r) => r.oldReinf !== null && r.oldReinf > 0);
if (withReinf.length) {
  const avg = withReinf.reduce((s, r) => s + Math.abs(r.dReinf) / r.oldReinf, 0) / withReinf.length * 100;
  console.log(`\n  보강재 평균 절대편차: ${avg.toFixed(1)}%  (${withReinf.length}개 케이스)`);
}
const withTie = table.filter((r) => r.oldTie !== null && r.oldTie > 0);
if (withTie.length) {
  const avg = withTie.reduce((s, r) => s + Math.abs(r.dTie) / r.oldTie, 0) / withTie.length * 100;
  console.log(`  타이로드 평균 절대편차: ${avg.toFixed(1)}%  (${withTie.length}개 케이스)`);
}

// [4] 품번별 교집합 대조
console.log("\n[4] 품번별 교집합 대조 -- 양쪽 엔진이 모두 산출하는 품번만 (진짜 캘리브레이션 대상)");
["Internal", "External"].forEach((mode) => {
  const t = partIntersectionTable(cases, mode);
  console.log(`\n  === 보강 방식: ${mode} ===`);
  if (!t.both.length) {
    console.log("    (공통 품번 없음)");
  } else {
    console.log("    " + "품번".padEnd(18) + "기존     신규       Δ       %");
    console.log("    " + "-".repeat(56));
    t.both.forEach((r) => {
      const mark = INTENTIONAL_DIFFS[r.partNo] ? "  (의도된 차이)" : "";
      console.log("    " + r.partNo.padEnd(18) + String(r.o).padStart(5) + String(r.n).padStart(8)
        + String(r.d).padStart(9) + pct(r.o, r.n).padStart(8) + mark);
    });
    // 통계는 조정 대상(=의도되지 않은 차이)만으로 냅니다.
    const tunable = t.both.filter((r) => !INTENTIONAL_DIFFS[r.partNo]);
    const exact = tunable.filter((r) => r.d === 0).length;
    const tot = tunable.length
      ? tunable.reduce((s, r) => s + Math.abs(r.d) / r.o, 0) / tunable.length * 100 : 0;
    console.log(`    조정 대상 ${tunable.length}종 중 ${exact}종 정확 일치 / 평균 절대편차 ${tot.toFixed(1)}%`);
    const inten = t.both.filter((r) => INTENTIONAL_DIFFS[r.partNo]);
    if (inten.length) {
      console.log(`    의도된 차이 ${inten.length}종: ${inten.map((r) => r.partNo).join(", ")}`);
      console.log(`      └ ${INTENTIONAL_DIFFS[inten[0].partNo]}`);
    }
  }
  // 범위 차이는 오차가 아니라 "어느 쪽이 다루는 영역인가" 의 문제입니다.
  console.log(`    기존에만 있는 품번 ${t.onlyOld.length}종: ${t.onlyOld.slice(0, 6).map((r) => r.partNo).join(", ")}${t.onlyOld.length > 6 ? " ..." : ""}`);
  console.log(`    신규에만 있는 품번 ${t.onlyNew.length}종: ${t.onlyNew.slice(0, 6).map((r) => r.partNo).join(", ")}${t.onlyNew.length > 6 ? " ..." : ""}`);
});

// --detail : 시트별 전체 행
if (wantDetail) {
  const c = cases[Math.floor(cases.length / 2)];
  const res = SteelAccessoriesEngine.compute(geometryOf(c), OPTIONS);
  console.log("\n" + "=".repeat(78));
  console.log(`[상세] ${c.label}  (프로필: ${res.profileLabel})`);
  console.log("=".repeat(78));
  console.log("\n계산된 변수:");
  Object.keys(res.scope).forEach((k) => {
    const v = res.scope[k];
    if (typeof v === "number") process.stdout.write(`  ${k}=${v}`);
  });
  console.log("\n");
  res.sections.forEach((s) => {
    console.log(`--- 시트 ${s.sheet} [${s.id}] ${s.titleKo} (${s.title})${s.active ? "" : "  ** 미적용 **"}`);
    s.rows.forEach((r) => {
      console.log(`    ${String(r.qty).padStart(5)} ${r.unit.padEnd(4)} ${(r.partNo || "-").padEnd(16)} ${(r.korvan || "").padEnd(22)} ${r.how}`);
      console.log(`          ↳ ${r.where}`);
    });
  });
  console.log("\n품번별 집계:");
  res.parts.forEach((p) => console.log(`  ${p.partNo.padEnd(16)} ${String(p.qty).padStart(6)} ${p.unit.padEnd(5)} ← ${p.from.join(", ")}`));
  if (res.warnings.length) {
    console.log("\n경고:");
    res.warnings.forEach((w) => console.log("  ! " + w));
  }
}

console.log("\n" + "=".repeat(78));
const failed = sc.problems.length + em.mismatches.length + cf.bad.length;
console.log(failed ? `구조 검사 실패 ${failed}건 -- 위 내용을 확인하십시오.` : "구조 검사 통과.");
console.log("=".repeat(78));
process.exit(failed ? 1 : 0);
