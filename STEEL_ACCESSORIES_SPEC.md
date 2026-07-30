# Steel Accessories 수식 정의 (설치표준 기반)

> 참조: Korvan Installation Standard (2015-07-23, 11장) — **개념만** 차용, 품번은 앱 카탈로그(`parts_db.json`) 사용
> 구성 파일: `steel_accessories_rules.js` (수식/표) · `steel_accessories_engine.js` (해석기) · `verify_steel_accessories.js` (검증)

---

## 1. 왜 만들었는가

기존 `accessories_rules.js` 의 Steel Accessories 수식(`reinforcing` / `tieRod` / `steelSkidDetailed`)은 원본 엑셀 워크북의 셀 주소를 그대로 옮긴 것입니다.

```js
{ id: "row12", formula: "((L1_F>0?trunc((L1_O-1.5)/2):trunc(L1_O/2))+ ... " }
```

숫자는 맞지만(882+315 조합 대조 검증 완료) **왜 그런지 읽을 수 없고**, 고객사가 바뀌었을 때 어느 행을 고쳐야 하는지 알 수 없습니다. 이 스펙은 기존 것을 **대체하지 않고 나란히 놓여**, 같은 부재를 "읽을 수 있는 형태"로 정의합니다.

| | 기존 `accessories_rules.js` | 새 `steel_accessories_rules.js` |
|---|---|---|
| 출처 | 엑셀 워크북 셀 | 설치표준 도면 |
| 행 이름 | `row12`, `AP46` | `a0955Z`, `tr14x2` |
| 읽기 | 셀 주소를 알아야 함 | 도면 시트 번호로 대조 |
| 고객 대응 | 파일 복제 | 프로필 추가 |
| 검증 상태 | **검증 완료** | 구조 검증 완료, **계수는 확인 대상** |

---

## 2. 6개 개념

도면 11장을 관통하는 구성 논리를 6개로 정리해 그대로 데이터 구조로 옮겼습니다.

### 개념 1 — 높이 = 수직 단(course) 스택

도면 각 장 좌하단의 `1M / 1.5M / ... / 5M Height` 그림이 곧 이 표입니다.

```
1M   [1000]                      2.5M [1500, 1000]              4M   [2000, 1000, 1000]
1.5M [1500]                      3M   [2000, 1000]              4.5M [1500, 1000, 1000, 1000]
2M   [2000]                      3.5M [1500, 1000, 1000]        5M   [2000, 1000, 1000, 1000]
```

최상단만 1500/2000 이고 그 아래는 전부 1000 입니다. `panel_rules.js` 의 `COURSE_TABLE`(TOP_15/TOP_20/LOWER/MID_LOWER/MID_TOP)과 같은 구성을 mm 로 표현한 것이라 둘은 항상 같은 단 수를 가집니다.

→ 수식 변수: `CRS_N`(단 수), `CRS_TOP`(최상단 mm), `CRS_1000`(1000mm 단 수), `HJ_N`(단 사이 수평 조인트 = `CRS_N-1`)

### 개념 2 — 조인트 라인 수 = 순수 기하 계산

부재는 "패널"이 아니라 "조인트 라인"과 "교차점"에 붙습니다. 그래서 수량 계산의 뼈대는 라인/교차점 개수입니다.

```
COL_W = W_C + W_F          폭방향 패널 열 수
COL_L = L_C + L_F          길이방향 패널 열 수
COL_L1..COL_L4             칸(compartment)별 열 수  ← 격벽이 있으면 반드시 칸별로!
COL_PERIM = (COL_W+COL_L)*2   외벽 둘레 열 수
VJ_PERIM  = ((COL_W-1)+(COL_L-1))*2   외벽 둘레 수직 조인트 (코너 제외)
CORNER    = 4
BOT_VJ    = (COL_W-1)*COL_L + (COL_L-1)*COL_W   바닥 내부 조인트 라인
PA_COL    = COL_W*N_PA        격벽 열 수
PA_VJ     = (COL_W-1)*N_PA    격벽 수직 조인트
```

> ⚠️ 칸별 계산이 중요한 이유: 격벽 3칸 탱크에서 전체 길이(`COL_L`)로 세면 격벽 라인의 열이 중복 계상됩니다. 실제로 루프 서포터를 `COL_L` 로 계산했을 때 4.5×(4+4+4) 케이스에서 22개(정답 18개)가 나왔고, `verify` 스크립트의 [2b] 검사가 이를 잡아냈습니다.

### 개념 3 — 부재 배치 = "어느 라인에 몇 개"

행(row)은 딱 두 형태만 있습니다.

**(A) 표 형태** — 도면과 1:1 대조되므로 **이걸 우선 쓰십시오**

```js
{
  id: "a1205Z", korvan: "1205Z", part: { Z: "WFB-1200Z", ... },
  where: "최상단 단의 벽패널 수직 조인트 — 좌/우 플랜지 2개",
  byHeight: { "1": 0, "1.5": 2, "2": 2, "2.5": 2, "3": 2, ... },  // 라인 1개당 개수
  times: "VJ_PERIM + CORNER",                                     // 라인 개수
}
```
→ 수량 = `byHeight[높이] × times`. 도면의 색깔 점을 세서 표 숫자만 고치면 됩니다.

**(B) 수식 형태** — 높이와 무관하게 기하로만 결정될 때

```js
{ id: "f0955ZP", formula: "RNF_ROWS * RNF_SIDES * (W_C + L_C) * 2" }
```

앞선 행의 결과를 뒤 행이 **행 ID로 참조**할 수 있습니다(예: `trNut12` 가 `tr12x1` 을 참조). 기존 `boltsAndNuts` 가 `AP<n>` 을 서로 참조하는 것과 같은 방식입니다.

### 개념 4 — 수압 깊이가 깊을수록 보강이 두꺼워진다

이 스펙에서 가장 중요한 개념입니다. 도면 2장 좌상단 주석이 그대로 표가 됩니다.

| 높이 | 도면 문구 | `RNF_ROWS` | `RNF_SIDES` |
|---|---|---|---|
| ~2.5M | (플랫바 보강 없음) | 0 | 0 |
| 3M, 3.5M | at joint side grid of bottom & wall panel | 1 | 1 |
| 4M | at all grid of bottom panel (one side) | 2 | 1 |
| 4.5M~ | at all grid of bottom panel (Both side) | 2 | 2 |

그 결과 벽 플랫바(S2)와 격벽 플랫바(S8) 수식이 **`RNF_ROWS * RNF_SIDES * 그리드` 한 줄로 끝납니다.** 보강 정책이 바뀌면 이 표 한 곳만 고치면 두 섹션이 동시에 따라옵니다.

타이로드(S4)도 같은 논리입니다 — 깊이별로 규격이 승급합니다.

```
상부       12mm 1본
중간       12mm 1본 (0.5M 피치)
중하부     12mm 2본
최하부     14mm 2본   ← 4.5M 이상에서만
```

### 개념 5 — 재질은 접미사 규칙

앱 카탈로그의 접미사 체계: `Z`/`HDG` = 용융아연도금, `SA2` = STS304, `SA4` = STS316

```js
part: { Z: "WFB-0950Z", SA2: "WFB-0950SA2", SA4: "WFB-0950SA4" },
material: "INT",   // 어느 UI 선택값을 따라갈지
```

| `material` | 따라가는 UI |
|---|---|
| `HDG` | 항상 아연도금 (외부 노출부) |
| `INT` | `#internalItem` (Int. Mat.) |
| `TIEROD_INT` | `#internalTieRod` (Int. Tie-rod) |
| `TIEROD_EXT` | `#outsideTieRod` (Outside Tie) |

`@ROOF_SUPPORT` 처럼 `@` 로 시작하면 높이/용량에 따라 품번을 동적 생성합니다(엔진의 `DYNAMIC_PARTS`).

### 개념 6 — 고객사마다 표만 갈아끼운다

```js
"SAMPLE-CUSTOMER": {
  label: "샘플 고객",
  extends: "WATANI-STD",
  overrides: {
    "S3.b1616_17160": { byHeight: { "5": 4 } },                    // 5M만 3단→4단
    "S4.tr12x1":      { part: { Z: "TR-12M2000SA4", ... } },       // 품번 고정
    "S11.anchorBolt": { formula: "4 + floor(W_O/4) + floor(L_O/4)" }, // 앵커 간격
  },
}
```

`byHeight` 와 `part` 는 **키 단위 병합**입니다 — 5M 하나만 고치려고 표 9칸을 다시 쓰지 않습니다. 높이 구성 자체가 다른 고객이면 `courseStack` 을 덮어쓰면 됩니다.

---

## 3. 도면 시트 ↔ 섹션 대응

| 시트 | 섹션 | 대상 | 내용 | 적용 조건 |
|---|---|---|---|---|
| 1 | S1 | WALL | External Flange Bar (Angle) — 1205Z/0955Z/0455Z | `RF==2` (외부보강) |
| 2 | S2 | WALL | External Flange Bar (Flat) 보강 — 0955ZP/0455ZP | `RF==2` |
| 3 | S3 | WALL | External/Internal Bracket — 1610Z, 1616Z, 17160S, 9090S | 항상 |
| 4 | S4 | WALL | Tie Rod — 12mm/14mm + 너트/와셔 | 항상 |
| 5 | S5 | BOTTOM | 바닥 External Flange Bar (Flat) | 항상 |
| 6 | S6 | BOTTOM | 실링테이프 50mm/120mm | 항상 |
| 7 | S7 | PARTITION | Internal Flange Bar (Angle) — 1205S/0955S/880S/0455S | `N_PA>0` |
| 8 | S8 | PARTITION | Internal Flange Bar (Flat) — 0955SP/880SP/0455SP | `N_PA>0` |
| 9 | S9 | PARTITION | 격벽-외벽 접합 외부 부재 + 브래킷 | `N_PA>0` |
| 10 | S10 | PARTITION | Internal Bracket (양쪽 2EA 구성) | `N_PA>0` |
| 11 | S11 | SUBSIDIARY | 스키드 조이너, 루프서포터, 에어벤트, 앵커, 라이너 | 항상 |

**스틸스키드 본체(레일 길이/품번)는 이 스펙이 다루지 않습니다.** 이미 검증된 `accessories_rules.js` 의 `steelSkidDetailed` 가 담당하므로 중복 정의하지 않고, S11 은 도면 11장의 조이너와 부속자재만 다룹니다.

---

## 4. Korvan 코드 → 앱 품번 매핑

| Korvan | 앱 품번 (HDG / STS304 / STS316) | 규격 |
|---|---|---|
| 0455Z / 0455S | `WFB-0450Z` / `WFB-0450SA2` / `WFB-0450SA4` | ANGLE 32×64×3×450 |
| 0955Z / 0955S | `WFB-0950Z` / `WFB-0950SA2` / `WFB-0950SA4` | ANGLE 32×64×3×950 |
| 880S | — / `WFB-0880SA2` / `WFB-0880SA4` | ANGLE 32×64×3×880 |
| 1205Z / 1205S | `WFB-1200Z` / `WFB-1200SA2` / `WFB-1200SA4` | ANGLE 32×64×3×1200 |
| 0455ZP / 0455SP | `WFB-0450ZP` / `WFB-0450PSA2` / `WFB-0450PSA4` | PLATE 40×3×450 |
| 0955ZP / 0955SP | `WFB-0950ZP` / `WFB-0950PSA2` / `WFB-0950PSA4` | PLATE 40×3×950 |
| 880SP | `WFB-0880ZP` / `WFB-0880PSA2` / `WFB-0880PSA4` | PLATE 40×3×880 |
| 1610Z | `WCP-1610Z` / `WCP-1610SA2` / `WCP-1610SA4` | Cross Plate 160×100 (2홀) |
| 1616Z / 1616S(3T) | `WCP-1616Z` / `WCP-1616SA2` / `WCP-1616SA4` | Cross Plate 160×160 (4홀) |
| 1760S | — / `WCP-1760SA2` / `WCP-1760SA4` | 타이로드 브래킷 60×320 (1홀) |
| 17160S | — / `WCP-17160SA2` / `WCP-17160SA4` | 타이로드 브래킷 160×320 (2홀) |
| 9090S | — / `WBR-9090SA2` / `WBR-9090SA4` | Internal Corner Bracket 85×85 |
| 7575Z | `WBR-7575Z` | Skid Jointer 75×75×6×70 |
| 0125Z | `WBR-0120Z` | Skid A Angle Type (1~2mH) |
| 120210Z | `WBR-0240Z` | Skid A Channel Type (2.5mH~) |
| Sealing Tape 50mm | `WST-P0050RO` | PVC 50×3, 30M/Roll |
| Corner Sealant 120mm | `WST-P0120M` | PVC 120×3, 1M/Roll |
| Anchor Bolt | `WBR-5010Z` | Anchor Set |
| Liner | `LNR-5.0T` | Shim Plate |

### 확인이 필요한 2건

1. **M14 타이로드 본체가 카탈로그에 없습니다.** `parts_db.json` 의 M14 계열은 롱너트(`TC-14M60SA2/SA4`)와 너트/와셔(`WNT-M14*`, `WFW-M14*`)뿐입니다. 설치표준은 4.5M 이상에서 14mm 2본을 요구하므로 `TR-14M2000SA2/SA4` 를 먼저 등록해야 합니다. → `verify` 스크립트가 "카탈로그 미등록"으로 보고합니다.
2. **`17120Z`** (도면 9장, 격벽-외벽 최하부 접합)에 정확히 대응하는 앱 품번이 없습니다. 임시로 `WBR-75120Z`(Stopper Bracket L-75×120)를 매핑하고 `needsPartConfirm: true` 로 표시했습니다.

`0505S-500` / `0505S-1000`(도면 7장)은 앱 카탈로그에 대응 부재가 없어 현재 스펙에 넣지 않았습니다.

---

## 5. 검증 방법

```bash
node verify_steel_accessories.js              # 요약 + 대조표
node verify_steel_accessories.js --detail     # 시트별 전체 행 상세
node verify_steel_accessories.js --case 3.5x3x4.5 --detail   # 특정 케이스
```

45 케이스(9개 높이 × 5개 형상: 소형 / 반패널 / 격벽1 / 격벽2 / 대형), 1,980 행을 평가합니다.

**현재 결과**

| 검사 | 결과 |
|---|---|
| [1] 구조 — 수식 오류/음수/NaN | ✅ 통과 (1,980 행) |
| [1] 품번 존재 여부 | ⚠️ `TR-14M2000SA4` 1종 미등록 (위 4절 참조) |
| [2] 프로필 상속/덮어쓰기 3종 | ✅ 통과 |
| [2] 표준 프로필 불변성 | ✅ 통과 (overrides 가 원본 오염 없음) |
| [2b] 기존 검증 엔진과 정확 일치 | ✅ 통과 (90건 — roofSupport 수량+품번, airVent 품번) |
| [3] 기존 엔진과의 합계 대조 | ℹ️ 보강재 평균 편차 85%, 타이로드 115% |

### [3]의 편차를 어떻게 읽어야 하는가

**이 편차는 버그가 아닙니다.** 이 스펙의 계수는 설치표준 도면의 배치 개념에서 유도한 1차 정의이고, 기존 엔진은 워크북과 대조 검증된 값입니다. 즉 편차는 "두 표준의 차이"이며, 이 표를 보면서 계수를 조정하는 것이 이 스크립트의 용도입니다.

편차 패턴에서 이미 읽히는 것들:

- **1M 탱크에서 신규가 크게 큼(+200~700%)** — 단이 하나뿐인 1M 에서 브래킷/플랜지바를 과다 배치하고 있습니다. `S3.b1610Z` 의 `byHeight["1"]` 부터 검토가 필요합니다.
- **2.5M~4M 은 −1%~−23%** — 이 구간이 가장 잘 맞습니다. 개념 자체는 옳게 잡혔다는 신호입니다.
- **4.5M/5M 에서 신규가 큼(+68~171%)** — 기존 엔진은 4.5M/5M 에서 보강재 수량이 오히려 **떨어집니다**(4M 688 → 4.5M 594). 이는 기존 워크북이 이 구간에서 다른 계열의 부재로 전환하기 때문일 가능성이 높습니다. 어느 쪽이 실제 설치와 맞는지 확인이 필요한 지점입니다.
- **타이로드가 3M 이상에서 신규가 큼** — `S4` 의 `byHeight` 값이 "라인 수"가 아니라 "본 수"로 들어가 있어 층수 × 본수가 중복될 수 있습니다. 도면 4장의 점 개수와 재대조가 필요합니다.

---

## 6. 수정 시나리오별 절차

| 하고 싶은 것 | 고칠 곳 | 코드 수정 |
|---|---|---|
| 수량이 틀렸다 | 해당 row 의 `byHeight` 숫자 또는 `formula` 문자열 | 없음 |
| 부재 추가/삭제 | 해당 section 의 `rows[]` 에 한 줄 | 없음 |
| 품번이 바뀌었다 | `row.part` 의 품번 문자열 | 없음 |
| 보강 정책 변경 | `REINFORCE_DEPTH` 표 (S2·S8 동시 반영) | 없음 |
| 새 높이 지원 (예: 6M) | `COURSE_STACK` 에 한 줄 | 없음 |
| 새 고객 추가 | `profiles` 에 `extends` + `overrides` | 없음 |
| 새 변수 필요 | `VARIABLES` + engine `buildScope()` 양쪽 | 있음 |
| 새 동적 품번 규칙 | engine `DYNAMIC_PARTS` | 있음 |

---

## 7. 아직 하지 않은 것

- **앱 BOM 에 연결하지 않았습니다.** `index.html` 의 `<script>` 목록에 추가하지 않았고 `app.js` 도 건드리지 않았습니다. 기존 BOM/원가 계산은 그대로입니다. 계수 확정 후 연결하는 것이 안전합니다.
- **Rule Editor UI 연동 없음.** `SteelAccessoriesEngine.variables` 와 `profileOptions()` 가 UI 연동용으로 이미 준비되어 있습니다.
- **계수 미확정.** 위 5절의 편차 검토가 남아 있습니다.
