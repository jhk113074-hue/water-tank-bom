#!/usr/bin/env node
// =============================================================================
// Steel Accessories 스펙 검증 스크립트
// =============================================================================
//   node verify_steel_accessories.js            (요약 + 대조표)
//   node verify_steel_accessories.js --detail   (시트별 전체 행 상세)
//   node verify_steel_accessories.js --case 3.5x3x4.5   (특정 케이스만)
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

const HEIGHTS = Object.keys(SteelRules.courseStack).map(Number).sort((a, b) => a - b);

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
      r = SteelAccessoriesEngine.compute(geometryOf(c), OPTIONS);
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
  //   H=5     -> S3.b1616_17160 의 byHeight["5"] 가 바뀜
  //   W=L=4   -> anchorBolt 가 5m 간격(0ea)과 4m 간격(2ea)에서 달라짐
  //   STS304  -> tr12x1 의 표준 품번이 SA2 이므로 SA4 고정 override 가 보임
  const g = PanelEngine.makeGeometry(4, 4, 5);
  const base = Object.assign({}, OPTIONS, { tieRodInternal: "SS304" });
  const std = SteelAccessoriesEngine.compute(g, base);
  const smp = SteelAccessoriesEngine.compute(g, Object.assign({}, base, { profile: "SAMPLE-CUSTOMER" }));

  function rowOf(res, key) {
    for (const s of res.sections) for (const r of s.rows) if (r.rowKey === key) return r;
    return null;
  }
  [
    ["S3.b1616_17160", "byHeight override (5M: 3 -> 4단)"],
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
// [2b] 정확 일치 검사 -- 기존 검증 엔진과 반드시 같아야 하는 항목
// ---------------------------------------------------------------------------
// S11(부속자재)의 일부 행은 이미 검증된 accessories_engine.js 와 같은 값을
// 내도록 의도적으로 맞춘 것입니다. 여기서 어긋나면 회귀(regression)입니다.
function exactMatchCheck(cases) {
  const mismatches = [];
  let checked = 0;

  cases.forEach((c) => {
    const g = geometryOf(c);
    let res;
    try { res = SteelAccessoriesEngine.compute(g, OPTIONS); } catch (e) { return; }
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
console.log(`스키마 v${SteelRules.SCHEMA_VERSION} / 계수 검증상태: ${SteelRules.VERIFIED ? "검증됨" : "미검증 (고객 확인 대상)"}`);
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

// [2b]
const em = exactMatchCheck(cases);
console.log(`\n[2b] 정확 일치 검사 -- 기존 검증 엔진과 같아야 하는 항목 ${em.checked}건`);
if (!em.mismatches.length) {
  console.log("  ✓ roofSupport(수량+품번), airVent(품번) 전 케이스 일치");
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
const failed = sc.problems.length + em.mismatches.length;
console.log(failed ? `구조 검사 실패 ${failed}건 -- 위 내용을 확인하십시오.` : "구조 검사 통과.");
console.log("=".repeat(78));
process.exit(failed ? 1 : 0);
