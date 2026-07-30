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

## 2. 7개 개념

도면 11장을 관통하는 구성 논리를 7개로 정리해 그대로 데이터 구조로 옮겼습니다.

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
  byHeight:       { "1": 0, "1.5": 2, ... },   // 라인 1개당 개수
  layersByHeight: { "1": 0, "1.5": 1, ... },   // 층(단) 수 — 생략하면 1
  times: "VJ_PERIM + CORNER",                  // 한 층의 라인 개수
}
```
→ 수량 = `byHeight × layersByHeight × times`. 도면의 색깔 점을 세서 표 숫자만 고치면 됩니다.

> 세 인자를 분리해 두는 이유: 하나로 합치면 "2"가 **2본**인지 **2층**인지 구분되지 않아 도면과 대조할 수 없습니다. 실제로 초기 S4(타이로드)에서 4M 칸에 `4`가 들어가 있었는데 이것이 2본×2층이라는 사실이 코드에서 읽히지 않았고, 그래서 과다 계상을 발견하지 못했습니다.

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


### 개념 7 — 품번의 번호·이름·규격은 거래처마다 다르다

같은 부재라도 거래처에 따라 **품번뿐 아니라 품명과 규격 표기까지** 달라집니다. 그래서 각 row 에 품번을 박아두고 거래처별로 고치게 하면 안 됩니다 — 같은 품번이 여러 row 에 흩어져 있어 하나만 빠뜨리면 조용히 틀립니다.

대신 프로필마다 **정규 품번(canonical) → 거래처 품번** 치환표를 둡니다.

```js
"CUSTOMER-X": {
  extends: "WATANI-STD",
  catalogOverrides: {
    // 품번 + 품명 + 규격 전부 치환
    "WFB-0950Z":  { partNo: "KV-0955Z", nameKo: "External Flange Bar 950",
                    nameEn: "EXT FLANGE BAR 950", spec: "ANGLE 32x64x3x950" },
    // 품번 + 품명만 치환 (규격은 표준에서 상속)
    "WFB-0950ZP": { partNo: "KV-0955ZP", nameKo: "External Flange Bar Flat 950" },
    // 품번은 유지하고 품명/규격만 치환
    "WCA-1000Z":  { nameKo: "Corner Frame 1M", spec: "CORNER FLAME 1000mm" },
  },
}
```

| | |
|---|---|
| **row 수정** | 없음. 정규 품번을 계속 씁니다 |
| **반영 범위** | 치환표 한 줄 → 그 품번이 쓰인 모든 섹션에 동시 반영 |
| **병합 단위** | 필드 단위. 적지 않은 필드는 표준에서 상속 |
| **수량 영향** | 없음. 치환은 이름표만 바꿉니다 (검증 [2c]가 확인) |
| **추적** | 결과에 `canonical` 이 함께 실려 원래 품번을 늘 알 수 있습니다 |

치환된 품번은 거래처 품번이므로 `parts_db.json` 에 없는 것이 정상입니다. 표준 프로필의 `catalog` 에 적지 않은 품번은 `parts_db.json` 값이 그대로 쓰이므로 **바꿀 것만 적으면 됩니다.**

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
| — | **S12** | WALL | **코너 프레임 + 외부 바디 앵글(V계열)** — `verified: true` | `RF==2` |

**S12 는 성격이 다릅니다.** 도면에서 유도한 1차 정의가 아니라, 이미 워크북과 대조 검증된 기존 `external` 보강 수식(`row11`/`row12`/`row16`~`row18`)을 읽을 수 있는 형태로 **이식**한 것입니다. `verified: true` 로 표시되어 있고, 계수를 임의로 바꾸면 회귀입니다. V계열(40mm 폭 중량앵글)은 S1 의 Z계열(30mm)과 다른 부재이므로 중복 계상되지 않습니다.

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

### 신규 등록한 품번 (확인 완료)

| 품번 | 규격 | 배경 |
|---|---|---|
| `TR-14M2000SA2` / `TR-14M2000SA4` | Tie Rod M14×2000mm | M14 계열에 롱너트·너트·와셔만 있고 **로드 본체가 없었습니다.** 설치표준이 4.5M 이상에서 14mm 2본을 요구하므로 등록 (확인 완료) |
| `WCP-17120Z` | ANGLE 170×120×6 | 도면 9장 `17120Z`. Stopper Bracket 과 무관한 **별도 제품**이라는 확인을 받아 전용 품번으로 등록. 명명은 `WCP-1610Z`(160×100) / `WCP-1616Z`(160×160) 규칙을 따름 |

> ⚠️ 세 품번 모두 **중량·단가가 0** 입니다. 원가 산출에 쓰기 전에 채워야 합니다. `WCP-17120Z` 의 정확한 규격(두께/홀 수)도 확인이 필요해 `needsPartConfirm: true` 로 표시해 두었습니다.

`0505S-500` / `0505S-1000`(도면 7장)은 앱 카탈로그에 대응 부재가 없어 현재 스펙에 넣지 않았습니다.

---

## 5. 검증 방법

```bash
node verify_steel_accessories.js              # 요약 + 대조표
node verify_steel_accessories.js --detail     # 시트별 전체 행 상세
node verify_steel_accessories.js --case 3.5x3x4.5 --detail   # 특정 케이스
```

45 케이스(9개 높이 × 5개 형상: 소형 / 반패널 / 격벽1 / 격벽2 / 대형), 1,980 행을 평가합니다.

**실행 옵션**

```bash
node verify_steel_accessories.js               # 4mH 까지 (기본)
node verify_steel_accessories.js --with-tall   # 4.5/5mH 포함
node verify_steel_accessories.js --detail      # 시트별 전체 행
```

기본 범위가 **4mH 까지**입니다. 4.5/5mH 는 위상 전환(아래 ①)이 얽혀 있어 다음 차수로 미뤘습니다.

**현재 결과 (4mH 까지, 35 케이스 / 1,855 행)**

| 검사 | 결과 |
|---|---|
| [1] 구조 — 수식 오류/음수/NaN | ✅ 통과 |
| [1] 품번 존재 여부 | ✅ 전부 존재 |
| [2] 프로필 상속/덮어쓰기 3종 + 불변성 | ✅ 통과 |
| [2c] 카탈로그 치환 3종 (수량 불변 확인) | ✅ 통과 |
| [2b] 기존 검증 엔진과 정확 일치 | ✅ 통과 (140건) |
| [4] 품번별 교집합 편차 — Internal | **24.6%** (15종 중 **7종 Δ=0**) |
| [4] 품번별 교집합 편차 — External | **48.0%** (9종 중 **5종 Δ=0**) |

### 왜 [3] 대신 [4]를 봐야 하는가

처음에 섹션 합계끼리 비교했더니(=[3]) 편차가 85~115% 로 나왔는데, 그 대부분은 **계수 오차가 아니라 범위 불일치**였습니다. 이 스펙의 S4(타이로드)·S6(실링테이프)·S11(부속자재)은 기존 `reinforcingParts` 가 아예 다루지 않는 서브시스템이라, 합계끼리 빼면 "우리만 만드는 부재"가 전부 오차로 보입니다.

그래서 **양쪽이 모두 산출하는 품번만** 골라 비교하는 [4]를 만들었습니다. 이것만이 사과-사과 비교입니다. 추가로 보강 방식(Internal/External)을 양쪽 엔진에 같은 값으로 넣어야 합니다 — 브래킷류(`WCP-*`)는 Internal 서브시스템에만 나오므로 모드를 안 맞추면 전부 "기존 0" 으로 보입니다. (앱 기본값은 Internal 입니다.)

### Δ=0 을 달성한 품번 (12종)

| 모드 | 품번 |
|---|---|
| 공통 | `WFB-0950ZP` · `WFB-0450Z` · `WFB-0950Z` · `WFB-0880SA4` |
| External | `WFB-0950VZ` · `WFB-0450VZ` |
| Internal | `WCP-1610Z` · `WCP-1610SA4` · `WCP-1616Z` · `WCP-1616SA4` · `WCP-17160SA4` · `WBR-9090SA4` |

### 캘리브레이션에서 밝혀진 것

**① 4.5M/5M 은 보강이 줄어드는 게 아니라 위상(topology)이 바뀝니다**

기존 엔진에서 4M→4.5M 로 총량이 688→594 로 *감소*하는 것이 이상해 행 단위 diff 를 떠 보니:

```
row11  WFB-0950VZ   240 → 0      (둘레 밴드 방식, perim×8×2)
row12  WFB-0450VZ     0 → 184    (전면 그리드 방식, 벽면 전체)
```

2.5~4M 은 벽 둘레를 감는 중량앵글 밴드를 높이에 따라 쌓고(×4→×6→×6→×8), 4.5M 이상은 **밴드를 버리고 벽면 전체 그리드로 전환**합니다. 조각 수만 줄고 보강은 강화됩니다. S12 로 이식해 전 케이스 정확 일치를 확인했습니다.

**② 기존 엔진은 4.5M / 5M 에서 코너 앵글을 0개 산출합니다 — BOM 누락**

코너 앵글 규칙(`row16`~`row18`)은 높이별 상수표인데 4.5M·5M 칸이 비어 있습니다. 1M~4M 은 총 코너 높이가 항상 맞는데(3M=8×1500, 4M=8×2000 등) 그 위가 비어 있습니다. S12 는 상수표 대신 **단 스택을 따르는 일반 규칙**(코너 4곳 × 각 단, 품번=그 단의 높이)으로 바꿔 이 구멍을 메웁니다. 그래서 [4]의 `WCA-*` Δ는 **의도된 차이**입니다 — 1M/2.5M 등에서 조각 구성이 달라지지만 총 코너 높이는 동일합니다.

**③ 워크북의 `H_C+H_F-2` 는 이 스펙의 `HJ_N` 과 모든 높이에서 같습니다**

기존 internal 규칙이 브래킷 층 수를 `H_C+H_F-2` 라는 형태로 표현하는데, 그 값이 [개념 1] 단 스택에서 나오는 `HJ_N`(수평 조인트 수)과 정확히 일치합니다. 단 스택이 올바른 추상이라는 교차 확인이고, 덕분에 브래킷 6종을 그대로 이식해 Δ=0 을 만들었습니다. (`perim3 = PERIM_J - N_PA` 도 마찬가지 — 격벽이 지나는 조인트는 외벽 브래킷 대상에서 빠집니다.)

**④ 타이로드를 4배 과다 계상하고 있었습니다**

로드는 마주보는 두 벽을 **관통**하므로 라인을 한 번만 세야 합니다. `VJ_PERIM + CORNER`(2×2에서 8) → `VJ_L + VJ_W*(N_PA+1)`(2). 기존 `M8`/`Q8` 구조와 같습니다.

**⑤ 바닥 플랫바는 전 그리드가 아니라 둘레입니다**

검증된 `row13` 은 `(W_C+totLC)*2` — 둘레 형태입니다. 바닥 전 그리드(`BOT_VJ`)에 깔린다고 본 것이 `WFB-0950ZP` +201% 의 최대 원인이었습니다. 둘레 형태로 바꾸고, 크기와 무관한 상수항(2.5M:8 / 3M:8 / 3.5M:16 / 4M:16)이 `HJ_N × CORNER × 2` 로 정확히 재현되는 것을 확인해 상수표 대신 기하 형태로 넣었습니다.

**⑥ 1M 탱크는 외부 보강이 코너 앵글 4개뿐입니다**

기존 엔진의 1mH 외부 보강 산출물은 `WCA-1000Z` 4개뿐 — 플랜지바·브래킷 전무입니다. 도면 3장의 1M 그림에도 브래킷 표시가 없습니다.

### 남은 캘리브레이션 대상 (4mH 까지)

| 항목 | 편차 | 원인 추정 |
|---|---|---|
| `WFB-0950ZP` (Internal) | −60% | S2/S5 를 external `row13` 에 맞췄는데 Internal 모드는 자기 행을 씁니다. 모드별 분기 필요 |
| `WFB-0950SA4` / `WFB-0950PSA4` | −60% / −49% | S7 격벽 앵글바 — internal 격벽 행과 재대조 |
| `WFB-0450ZP` (External) | +117% | S2.f0455ZP + S5.bf0455ZP + S9 합이 `row9` 를 초과 |
| `WCP-1760SA4` | +16% | S3+S10 합이 `row18` 에 근접, 잔차 확인 |
| `WFB-0450SA4` / `WFB-0450PSA4` | +71% / +100% | 절대 수량이 작아 우선순위 낮음 |
| `WCA-*` | ±250% | **의도된 차이** (위 ②). 조정 대상 아님 |

## 6. 수정 시나리오별 절차

| 하고 싶은 것 | 고칠 곳 | 코드 수정 |
|---|---|---|
| 수량이 틀렸다 | 해당 row 의 `byHeight` 숫자 또는 `formula` 문자열 | 없음 |
| 부재 추가/삭제 | 해당 section 의 `rows[]` 에 한 줄 | 없음 |
| 품번이 바뀌었다 | `row.part` 의 품번 문자열 | 없음 |
| 보강 정책 변경 | `REINFORCE_DEPTH` 표 (S2·S8 동시 반영) | 없음 |
| 새 높이 지원 (예: 6M) | `COURSE_STACK` 에 한 줄 | 없음 |
| 새 고객 추가 | `profiles` 에 `extends` + `overrides` | 없음 |
| 거래처 품번/품명/규격 변경 | 프로필의 `catalogOverrides` 한 곳 | 없음 |
| 새 변수 필요 | `VARIABLES` + engine `buildScope()` 양쪽 | 있음 |
| 새 동적 품번 규칙 | engine `DYNAMIC_PARTS` | 있음 |

---

## 7. 아직 하지 않은 것

- **앱 BOM 에 연결하지 않았습니다.** `index.html` 의 `<script>` 목록에 추가하지 않았고 `app.js` 도 건드리지 않았습니다. 기존 BOM/원가 계산은 그대로입니다. 계수 확정 후 연결하는 것이 안전합니다.
- **Rule Editor UI 연동 없음.** `SteelAccessoriesEngine.variables` 와 `profileOptions()` 가 UI 연동용으로 이미 준비되어 있습니다.
- **계수 미확정.** 위 5절의 편차 검토가 남아 있습니다.
