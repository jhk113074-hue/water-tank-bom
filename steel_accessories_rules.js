// =============================================================================
// WATANI GRP Water Tank -- Steel Accessories SPEC (선언형 규칙 / declarative rules)
// =============================================================================
// 이 파일의 목적 (WHY THIS FILE EXISTS)
// -----------------------------------------------------------------------------
// 기존 accessories_rules.js 의 Steel Accessories 관련 수식(reinforcing /
// tieRod / steelSkidDetailed)은 원본 엑셀 워크북의 셀 주소(AP12, M8:M93 ...)를
// 그대로 옮겨온 것이라 "숫자는 맞지만 왜 그런지 읽을 수 없는" 상태입니다.
// 고객사가 바뀌면(보강 방식, 부재 규격, 높이 구성이 다른 고객) 어느 행을
// 고쳐야 하는지 알 수 없습니다.
//
// 이 파일은 그것을 대체하지 않고, 그 옆에 나란히 놓이는 **설치표준 기반의
// 읽을 수 있는 스펙**입니다. Korvan Installation Standard(2015-07-23) 도면의
// 구성 개념을 그대로 데이터 구조로 옮겼습니다:
//
//   [개념 1] 높이 = 수직 단(course) 스택            → courseStack
//            (도면 좌하단 "1M / 1.5M / ... / 5M Height" 그림이 곧 이 표)
//   [개념 2] 조인트 라인 수 = 순수 기하 계산         → derived (수식)
//   [개념 3] 부재 배치 = "어느 라인에 몇 개"          → sections[].rows[]
//   [개념 4] 수압 깊이가 깊을수록 보강이 두꺼워진다  → reinforceDepth / byHeight 표
//   [개념 5] 재질은 접미사 규칙                       → materialSuffix (Z/SA2/SA4)
//   [개념 6] 고객사마다 표만 갈아끼운다               → profiles
//
// 도면 시트 번호 1~11 이 그대로 sections[].sheet 로 남아 있으므로, 종이 도면과
// 코드를 나란히 놓고 대조할 수 있습니다.
//
// -----------------------------------------------------------------------------
// 수정 방법 (HOW TO EDIT) -- 코드를 몰라도 됩니다
// -----------------------------------------------------------------------------
//  * 수량이 틀렸다        → 해당 row 의 byHeight 표 숫자 또는 formula 문자열만 수정
//  * 부재를 추가/삭제     → 해당 section 의 rows[] 에 한 줄 추가 / 삭제
//  * 품번이 바뀌었다      → row.part 의 품번 문자열만 수정
//  * 높이 구성이 다르다   → courseStack 에 높이 키를 추가
//  * 고객사가 다르다      → profiles 에 새 프로필을 추가하고 extends 로 상속
//
// row 는 딱 두 가지 형태만 있습니다. 둘 다 한 줄로 읽힙니다.
//   (A) 표 형태:  byHeight(라인 1개당 개수) x layersByHeight(층 수, 생략시 1)
//                 x times(한 층의 라인 개수 수식)
//   (B) 수식 형태: formula(수량 전체를 한 수식으로)
// (A)를 우선 쓰십시오 -- 도면과 1:1로 대조되고, 숫자만 바꾸면 되기 때문입니다.
//
// -----------------------------------------------------------------------------
// 검증 상태 (VERIFICATION STATUS) -- 반드시 읽어주십시오
// -----------------------------------------------------------------------------
// 아래 수량들은 Korvan 설치표준 도면의 **배치 개념에서 유도한 1차 정의**이며,
// 원본 엑셀 워크북의 캐시값과 대조 검증된 것이 아닙니다. 즉 구조/변수/편집
// 방식은 확정본이지만 **개별 계수는 고객 확인(sign-off) 대상**입니다.
// node verify_steel_accessories.js 를 실행하면 기존 검증된 엔진
// (accessories_engine.js)의 합계와 이 스펙의 합계 차이가 표로 출력됩니다.
// 그 차이를 보고 계수를 조정하는 것이 이 파일의 사용법입니다.
// =============================================================================
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // [개념 1] 높이 → 수직 단(course) 스택 (mm, 위에서 아래 순서)
  // ---------------------------------------------------------------------------
  // 도면 1~10장 좌하단의 "xM Height" 그림과 정확히 같은 표입니다.
  // 예: 4.5M = 최상단 1500 + 1000 + 1000 + 1000.
  // panel_rules.js 의 COURSE_TABLE(TOP_15/TOP_20/LOWER/MID_LOWER/MID_TOP)과
  // 같은 구성을 mm 단위로 표현한 것이므로 둘은 항상 같은 단 수를 가집니다.
  // 새 높이(예: 6M)를 지원하려면 여기에 한 줄만 추가하십시오.
  const COURSE_STACK = {
    "1":   [1000],
    "1.5": [1500],
    "2":   [2000],
    "2.5": [1500, 1000],
    "3":   [2000, 1000],
    "3.5": [1500, 1000, 1000],
    "4":   [2000, 1000, 1000],
    "4.5": [1500, 1000, 1000, 1000],
    "5":   [2000, 1000, 1000, 1000],
  };

  // ---------------------------------------------------------------------------
  // [개념 4] 수압 깊이별 보강 등급 (도면 2장 좌상단 주석을 표로 옮긴 것)
  // ---------------------------------------------------------------------------
  //   3M / 3.5M  : "at joint side grid of bottom & wall panel"      → 1단, 한쪽
  //   4M         : "at all grid of bottom panel (one side)"         → 2단, 한쪽
  //   4.5M 이상  : "at all grid of bottom panel (Both side)"        → 2단, 양쪽
  //   2.5M 이하  : 플랫바 보강 없음 (바닥 플랜지만)
  // rows  = 최하단부터 몇 개 단에 플랫바 보강을 넣는가
  // sides = 안/밖 몇 면에 넣는가 (1=한쪽, 2=양쪽)
  // 엔진이 이 표를 읽어 수식 변수 RNF_ROWS / RNF_SIDES 로 넣어줍니다.
  const REINFORCE_DEPTH = [
    { maxH: 2.5,      rows: 0, sides: 0, note: "플랫바 보강 없음" },
    { maxH: 3.5,      rows: 1, sides: 1, note: "바닥+벽 접합 그리드 1단, 한쪽" },
    { maxH: 4,        rows: 2, sides: 1, note: "바닥패널 전 그리드, 한쪽" },
    { maxH: Infinity, rows: 2, sides: 2, note: "바닥패널 전 그리드, 양쪽" },
  ];

  // ---------------------------------------------------------------------------
  // [개념 5] 재질 접미사 규칙
  // ---------------------------------------------------------------------------
  // 앱 카탈로그(parts_db.json)의 품번 접미사 체계:
  //   Z / HDG = 용융아연도금,  SA2 = STS304,  SA4 = STS316,  P = Plastic Cap
  // row.material 이 어느 UI 선택값을 따라가는지 선언합니다.
  //   "HDG"        : 항상 아연도금 (외부 노출부 고정)
  //   "INT"        : #internalItem   (Int. Mat.)   선택값
  //   "TIEROD_INT" : #internalTieRod (Int. Tie-rod) 선택값
  //   "TIEROD_EXT" : #outsideTieRod  (Outside Tie)  선택값
  const MATERIAL_SOURCES = {
    HDG:        { label: "아연도금 고정",        source: null },
    INT:        { label: "내부재 재질 선택",      source: "internalMaterial" },
    TIEROD_INT: { label: "내부 타이로드 재질",    source: "tieRodInternal" },
    TIEROD_EXT: { label: "외부 타이로드 재질",    source: "tieRodExternal" },
  };

  // ---------------------------------------------------------------------------
  // [개념 2] 수식에서 쓸 수 있는 변수 사전
  // ---------------------------------------------------------------------------
  // 엔진(steel_accessories_engine.js)이 모두 계산해서 넣어줍니다.
  // Rule Editor UI 에 그대로 뿌릴 수 있도록 설명을 데이터로 들고 있습니다.
  // 이름은 기존 accessories_rules.js 와 최대한 맞췄습니다(W_C, W_F, H_O ...).
  const VARIABLES = [
    // --- 치수 (기존 규칙 파일과 동일한 이름) ---
    { name: "W_O",  group: "치수", desc: "폭 (m). 예: 3.5" },
    { name: "W_C",  group: "치수", desc: "폭방향 1m 패널 개수" },
    { name: "W_F",  group: "치수", desc: "폭방향 0.5m 패널 유무 (0 또는 1)" },
    { name: "L_O",  group: "치수", desc: "전체 길이 (m) = L1+L2+L3+L4" },
    { name: "L_C",  group: "치수", desc: "길이방향 1m 패널 개수 합계" },
    { name: "L_F",  group: "치수", desc: "길이방향 0.5m 패널 개수 합계" },
    { name: "L1_O", group: "치수", desc: "1번 칸 길이 (m). L2_O~L4_O 동일" },
    { name: "H_O",  group: "치수", desc: "높이 (m). 1 ~ 5" },
    { name: "N_PA", group: "치수", desc: "격벽(파티션) 개수" },

    // --- 단(course) 모델 : [개념 1] ---
    { name: "CRS_N",    group: "단", desc: "수직 단 개수 (4.5M → 4)" },
    { name: "CRS_TOP",  group: "단", desc: "최상단 단 높이 (mm). 1000/1500/2000" },
    { name: "CRS_1000", group: "단", desc: "1000mm 단 개수 (4.5M → 3)" },
    { name: "HJ_N",     group: "단", desc: "단 사이 수평 조인트 라인 수 = CRS_N-1" },

    // --- 그리드 모델 : [개념 2] ---
    { name: "COL_W",     group: "그리드", desc: "폭방향 패널 열 수 = W_C+W_F" },
    { name: "COL_L",     group: "그리드", desc: "길이방향 패널 열 수 = L_C+L_F" },
    { name: "COL_L1",    group: "그리드", desc: "1번 칸의 열 수. COL_L2~COL_L4 동일. 칸별로 세야 하는 부재용" },
    { name: "COL_PERIM", group: "그리드", desc: "외벽 둘레 패널 열 수 = (COL_W+COL_L)*2" },
    { name: "VJ_W",      group: "그리드", desc: "폭면 수직 조인트 라인 수 = COL_W-1" },
    { name: "VJ_L",      group: "그리드", desc: "길이면 수직 조인트 라인 수 = COL_L-1" },
    { name: "VJ_PERIM",  group: "그리드", desc: "외벽 둘레 수직 조인트 라인 수 (코너 제외)" },
    { name: "PERIM_J",   group: "그리드", desc: "폭면1+길이면1 만 센 수직 조인트 수 = VJ_PERIM/2. 기존 규칙의 perim 과 동일" },
    { name: "CORNER",    group: "그리드", desc: "코너 개수. 항상 4" },
    { name: "BOT_N",     group: "그리드", desc: "바닥 패널 개수 = COL_W*COL_L" },
    { name: "BOT_VJ",    group: "그리드", desc: "바닥 패널 내부 조인트 라인 수" },
    { name: "PA_COL",    group: "그리드", desc: "격벽 패널 열 수 = COL_W*N_PA" },
    { name: "PA_VJ",     group: "그리드", desc: "격벽 수직 조인트 라인 수 = (COL_W-1)*N_PA" },

    // --- 보강 등급 : [개념 4] ---
    { name: "RNF_ROWS",  group: "보강", desc: "플랫바 보강 단 수 (최하단부터). REINFORCE_DEPTH 표에서" },
    { name: "RNF_SIDES", group: "보강", desc: "플랫바 보강 면 수 (1=한쪽, 2=양쪽)" },

    // --- 옵션 플래그 ---
    { name: "RF",    group: "옵션", desc: "보강 방식. 1=Internal, 2=External (#reinfMethod)" },
    { name: "S_1M",  group: "옵션", desc: "0.5/1M 측면패널 전용. 0 또는 1 (#sidePanelOnly)" },
  ];

  // ===========================================================================
  // [개념 6] 고객 프로필
  // ===========================================================================
  // 표준 프로필 하나 + 그것을 상속(extends)해서 일부만 덮어쓰는 고객 프로필들.
  // 새 고객 추가 절차:
  //   1) profiles 에 { label, extends: "WATANI-STD", overrides: {...} } 추가
  //   2) overrides 에 "sectionId.rowId" 키로 바꿀 값만 적기
  //      예: overrides: { "S1.a0955Z": { byHeight: { "5": 3 } },
  //                       "S4.tr14":   { part: { Z: "TR-14M4000Z" } } }
  //   3) UI/코드 수정 없음. 프로필 이름만 골라 호출하면 끝.
  // ---------------------------------------------------------------------------

  // 도면 시트 1~11 → 섹션 정의. 각 row 는 한 줄로 읽히도록 유지하십시오.
  const SECTIONS_WATANI_STD = [

    // -----------------------------------------------------------------------
    // 시트 1 : WALL PANEL - External Flange Bar (Angle)  [외부 앵글 플랜지바]
    // -----------------------------------------------------------------------
    // 도면 1장: 빨강 1205Z = 최상단 단(1500/2000)의 수직 조인트 보강,
    //           보라 0955Z = 단 사이 수평 조인트 라인의 1m 패널 구간,
    //           초록 0455Z = 수직/수평 조인트가 만나는 교차점의 짧은 조각.
    // 외부 보강(External)일 때만 쓰입니다 -> appliesWhen: "RF==2".
    {
      id: "S1", sheet: 1, panel: "WALL", title: "External Flange Bar (Angle)",
      titleKo: "외부 플랜지바 (앵글)",
      appliesWhen: "RF==2",
      rows: [
        {
          id: "a1205Z", korvan: "1205Z", material: "HDG", unit: "PCS",
          part: { Z: "WFB-1200Z", SA2: "WFB-1200SA2", SA4: "WFB-1200SA4" },
          label: "Angle Flange Bar 1200mm (10 holes)",
          where: "최상단 단(1500/2000)의 벽패널 수직 조인트 — 좌/우 플랜지 2개",
          // 도면 1장: 1M 은 단이 하나뿐이고 1205Z 를 쓰지 않음(0455/0955만).
          byHeight: { "1": 0, "1.5": 2, "2": 2, "2.5": 2, "3": 2, "3.5": 2, "4": 2, "4.5": 2, "5": 2 },
          times: "VJ_PERIM + CORNER",
        },
        {
          id: "a0955Z", korvan: "0955Z", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0950Z", SA2: "WFB-0950SA2", SA4: "WFB-0950SA4" },
          label: "Angle Flange Bar 950mm",
          where: "단 사이 수평 조인트 라인 × 둘레 1m 패널 열",
          // 라인 1개당 1개. 라인 수는 times 가 계산.
          byHeight: { "1": 0, "1.5": 0, "2": 0, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "HJ_N * (W_C + L_C) * 2",
        },
        {
          id: "a0455Z", korvan: "0455Z", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0450Z", SA2: "WFB-0450SA2", SA4: "WFB-0450SA4" },
          label: "Angle Flange Bar 450mm",
          where: "0.5m 패널 열의 수평 조인트 — 반패널이 있을 때만 발생",
          // 캘리브레이션: 원래 times 에 VJ_PERIM(수직 조인트 교차점)을 더했는데
          // 검증된 external row8 에는 대응 항이 없습니다. 0455Z 는 **0.5m 열
          // 전용** 부재이므로 (W_F+L_F)*2 만이 맞고, 높이는 층 수로만 늘어납니다.
          // row8 원형: (H==1.5||H==2)?(W_F+totLF)*2 : (H==2.5||H==3)?x2 :
          //            (H==3.5||H==4)?x3 : ...  -> 아래 layersByHeight 와 동일.
          byHeight:       { "1": 0, "1.5": 1, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          layersByHeight: { "1": 0, "1.5": 1, "2": 1, "2.5": 2, "3": 2, "3.5": 3, "4": 3, "4.5": 4, "5": 4 },
          times: "(W_F + L_F) * 2",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 2 : WALL PANEL - External Flange Bar (Flat)  [외부 플랫 보강바]
    // -----------------------------------------------------------------------
    // [개념 4]가 가장 잘 드러나는 시트입니다. 수량이 아니라 "몇 단까지 /
    // 몇 면에" 가 높이로 결정되고(RNF_ROWS, RNF_SIDES), 나머지는 그리드 곱.
    {
      id: "S2", sheet: 2, panel: "WALL", title: "External Flange Bar (Flat) - Reinforcing",
      titleKo: "외부 플랫 보강바",
      appliesWhen: "RF==2",
      rows: [
        {
          id: "f0955ZP", korvan: "0955ZP", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0950ZP", SA2: "WFB-0950PSA2", SA4: "WFB-0950PSA4" },
          label: "Flat Reinforcing Bar 950mm",
          where: "하부 보강 단의 수평 그리드 라인 × 둘레 1m 패널 열 × 보강 면수",
          formula: "RNF_ROWS * RNF_SIDES * (W_C + L_C) * 2",
        },
        {
          id: "f0455ZP", korvan: "0455ZP", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0450ZP", SA2: "WFB-0450PSA2", SA4: "WFB-0450PSA4" },
          label: "Flat Reinforcing Bar 450mm",
          where: "3M 초과에서 0.5m 열에 추가되는 보강 1단",
          // 캘리브레이션: 검증된 external row9 는 0.5m 구간 플랫바를
          //   (H>1 ? 1단) + (H>3 ? +1단) + (H>3 ? W_F*N_PA)
          // 로만 늘립니다. 1단째는 S5.bf0455ZP 가 담당하므로 여기서는 추가분만.
          // RNF_ROWS/RNF_SIDES(2단/양쪽)를 쓰지 않는 이유: 0455ZP 는 반패널
          // 채움재라서 수압 보강 밴드처럼 겹쳐 붙지 않습니다(4M 에서 2단이
          // 아니라 1단 추가). 950mm 쪽(f0955ZP)은 그대로 RNF 개념을 씁니다.
          formula: "H_O > 3 ? ((W_F + L_F) * 2 + W_F * N_PA) : 0",
        },
        {
          // 검증된 external row13 의 마지막 상수항을 읽을 수 있는 형태로 옮긴 것.
          // 원형은 크기와 무관한 상수였습니다: 2.5M:8, 3M:8, 3.5M:16, 4M:16.
          // 코너 4곳 × 2개 × 수평 조인트 수(HJ_N) 로 정확히 재현됩니다
          //   2.5M/3M  HJ_N=1 -> 4*2*1 = 8
          //   3.5M/4M  HJ_N=2 -> 4*2*2 = 16
          // 상수표가 아니라 기하 형태로 두면 다른 높이에도 자동으로 확장됩니다.
          id: "f0955ZPcorner", korvan: "0955ZP (corner)", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0950ZP", SA2: "WFB-0950PSA2", SA4: "WFB-0950PSA4" },
          label: "Flat Reinforcing Bar 950mm — 코너 마감",
          where: "각 수평 조인트 라인의 코너 4곳 × 2개",
          formula: "HJ_N * CORNER * 2",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 3 : WALL PANEL - External / Internal Bracket  [벽체 브래킷]
    // -----------------------------------------------------------------------
    // 도면 3장 범례의 5가지 조합을 그대로 5개 row 로 옮겼습니다.
    // 브래킷은 "조인트 교차점(십자점)" 부재라서 수량 = 교차점 수.
    // 색상별 배치가 높이마다 다르므로 byHeight 표를 씁니다.
    {
      id: "S3", sheet: 3, panel: "WALL", title: "External / Internal Bracket",
      titleKo: "벽체 외부/내부 브래킷",
      verified: true,
      appliesWhen: "true",
      // ** verified: true ** -- 아래 5행은 도면 3장의 범례를 유지하면서, 수량
      // 수식만 이미 워크북과 대조 검증된 internal 보강 규칙에서 이식했습니다.
      // 이식 대응 (기존 internal 행 -> 아래 행):
      //   row52 (WCP-1610Z)      -> b1610Z    의 둘레항 + 코너항
      //   row53 (WCP-1616Z)      -> b1616Z
      //   row18 (WCP-1760*)      -> b1760S    의 둘레항
      //   row19 (WCP-17160*)     -> b17160S   의 둘레항
      //   row22 (WBR-9090*)      -> b9090S
      //
      // 두 가지가 확인됐습니다:
      //  (1) 워크북이 브래킷 층 수를 "H_C+H_F-2" 로 표현하는데, 이 값은 모든
      //      높이에서 이 스펙의 HJ_N(수평 조인트 수)과 정확히 같습니다. 즉
      //      [개념 1] 단 스택이 올바른 추상이라는 교차 확인입니다.
      //  (2) 워크북의 perim3 = perim - N_PA = PERIM_J - N_PA (격벽이 지나는
      //      조인트는 외벽 브래킷 대상에서 빠짐).
      //
      // 격벽(N_PA) 항은 여기 두지 않고 S10 이 담당합니다 -- 섹션마다 자기
      // 기하만 갖게 분리한 것이며, S3+S10 합이 원본 row 와 일치합니다.
      rows: [
        {
          id: "b1610Z", korvan: "1610Z", material: "HDG", unit: "PCS",
          part: { Z: "WCP-1610Z", SA2: "WCP-1610SA2", SA4: "WCP-1610SA4" },
          label: "External Cross Plate 160x100 (2 holes)",
          where: "벽 둘레 수직 조인트 + 3M 이상에서 코너 보강 추가",
          formula: "(H_O > 1 ? (PERIM_J - N_PA) * 2 : 0)"
                 + " + (H_O >= 3 ? CORNER * 2 * HJ_N : 0)",
        },
        {
          id: "b1616Z", korvan: "1616Z", material: "HDG", unit: "PCS",
          part: { Z: "WCP-1616Z", SA2: "WCP-1616SA2", SA4: "WCP-1616SA4" },
          label: "External Cross Plate 160x160 (4 holes)",
          where: "2.5M 이상: 벽 둘레 수직 조인트 × 수평 조인트 층",
          formula: "H_O >= 2.5 ? (PERIM_J - N_PA) * 2 * HJ_N : 0",
        },
        {
          id: "b1760S", korvan: "1760S", material: "INT", unit: "PCS",
          part: { Z: "WCP-1760SA2", SA2: "WCP-1760SA2", SA4: "WCP-1760SA4" },
          label: "Internal Tie-rod Bracket 60x320 (1 hole)",
          where: "벽 둘레 수직 조인트 — 타이로드 1본 지지",
          formula: "H_O > 1 ? (PERIM_J - N_PA) * 2 : 0",
        },
        {
          id: "b17160S", korvan: "17160S", material: "INT", unit: "PCS",
          part: { Z: "WCP-17160SA2", SA2: "WCP-17160SA2", SA4: "WCP-17160SA4" },
          label: "Internal Tie-rod Bracket 160x320 (2 holes)",
          where: "2.5M 이상 하부 — 타이로드 2본 지지. 층 수는 H_C-1",
          // (H_C-1) 은 HJ_N 으로 환원되지 않습니다: 3M 에서 2, 3.5M 에서 2.
          formula: "H_O >= 2.5 ? (PERIM_J - N_PA) * 2 * (H_C - 1) : 0",
        },
        {
          id: "b9090S", korvan: "9090S", material: "INT", unit: "PCS",
          part: { Z: "WBR-9090SA2", SA2: "WBR-9090SA2", SA4: "WBR-9090SA4" },
          label: "Internal Corner Bracket 85x85",
          where: "3M 이상: 코너 4곳 × 수평 조인트 층 (도면 3장 '모서리' 상세)",
          formula: "H_O >= 3 ? CORNER * HJ_N : 0",
        },
      ],
    },

    // 시트 4 : WALL PANEL - Tie Rod  [타이로드]
    // -----------------------------------------------------------------------
    {
      id: "S4", sheet: 4, panel: "WALL", title: "Tie Rod",
      titleKo: "타이로드",
      appliesWhen: "true",
      rows: [
        {
          id: "tr12x1", korvan: "12MM 1EA", material: "TIEROD_INT", unit: "PCS",
          part: { Z: "TR-12M2000Z", SA2: "TR-12M2000SA2", SA4: "TR-12M2000SA4" },
          label: "Tie Rod M12 (1 EA / line)",
          where: "상부 층 — 수압이 낮은 구간",
          byHeight: { "1": 0, "1.5": 1, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "VJ_L + VJ_W * (N_PA + 1)",
        },
        {
          // NOTE 카탈로그: HDG(Z) 계열에는 1000mm 로드가 없습니다(TR-12M1200Z 가 최단).
          // #internalTieRod 는 STS316/STS304 만 제공하므로 실사용에는 문제가 없어
          // Z 키를 두지 않았습니다. HDG 를 쓰려면 Z 품번을 등록 후 추가하십시오.
          id: "tr12x1h", korvan: "12MM 1EA (.5M)", material: "TIEROD_INT", unit: "PCS",
          part: { SA2: "TR-12M1000SA2", SA4: "TR-12M1000SA4" },
          label: "Tie Rod M12 (1 EA, 0.5M pitch line)",
          where: "최상단 단과 하부 단의 접합 라인",
          byHeight: { "1": 0, "1.5": 0, "2": 0, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "VJ_L + VJ_W * (N_PA + 1)",
        },
        {
          id: "tr12x2", korvan: "12MM 2EA", material: "TIEROD_INT", unit: "PCS",
          part: { Z: "TR-12M2000Z", SA2: "TR-12M2000SA2", SA4: "TR-12M2000SA4" },
          label: "Tie Rod M12 (2 EA / line)",
          where: "중하부 층 — 라인당 2본",
          // byHeight(라인당 본 수) 와 layersByHeight(층 수) 를 분리했습니다.
          // 이전에는 두 값을 곱해 한 칸에 넣어서(4M 에 "4") 2본인지 2층인지
          // 도면과 대조할 수 없었습니다 -- 대조표에서 타이로드가 과다하게
          // 나온 주 원인입니다. 층 수는 도면 4장의 점 층수를 그대로 셌습니다.
          byHeight:       { "1": 0, "1.5": 0, "2": 0, "2.5": 0, "3": 2, "3.5": 2, "4": 2, "4.5": 2, "5": 2 },
          layersByHeight: { "1": 0, "1.5": 0, "2": 0, "2.5": 0, "3": 1, "3.5": 1, "4": 2, "4.5": 1, "5": 2 },
          times: "VJ_L + VJ_W * (N_PA + 1)",
        },
        {
          // NOTE 카탈로그 공백: parts_db.json 에 M14 타이로드 **본체가 없습니다**
          // (M14 계열은 TC-14M60SA2/SA4 롱너트와 WNT/WFW-M14 만 등록되어 있음).
          // 설치표준은 4.5M 이상에서 14mm 2본을 요구하므로 품번을 먼저 등록해야
          // 합니다. verify 스크립트가 이 품번을 "카탈로그 미등록"으로 보고합니다.
          id: "tr14x2", korvan: "14MM 2EA", material: "TIEROD_INT", unit: "PCS",
          part: { SA2: "TR-14M2000SA2", SA4: "TR-14M2000SA4" },
          needsPartConfirm: true,
          label: "Tie Rod M14 (2 EA / line)",
          where: "최하부 층 — 4.5M 이상에서만 14mm 로 승급",
          byHeight:       { "1": 0, "1.5": 0, "2": 0, "2.5": 0, "3": 0, "3.5": 0, "4": 0, "4.5": 2, "5": 2 },
          layersByHeight: { "1": 0, "1.5": 0, "2": 0, "2.5": 0, "3": 0, "3.5": 0, "4": 0, "4.5": 1, "5": 1 },
          times: "VJ_L + VJ_W * (N_PA + 1)",
        },
        // 도면 4장 주석: "Using two nuts to Internal Bracket for tie rod at the
        // bottom side for over the 4M height tank" -> 4M 초과에서 하단 너트 2개.
        {
          id: "trNut12", korvan: "NUT M12", material: "TIEROD_INT", unit: "PCS",
          part: { Z: "WNT-M12HDG", SA2: "WNT-M12SA2", SA4: "WNT-M12SA4" },
          label: "M12 Nut (both ends, +1 at bottom over 4M)",
          where: "타이로드 양단 2개 + 4M 초과 시 최하단 1개 추가",
          formula: "(tr12x1 + tr12x1h + tr12x2) * 2 + (H_O > 4 ? tr12x2 : 0)",
        },
        {
          id: "trNut14", korvan: "NUT M14", material: "TIEROD_INT", unit: "PCS",
          part: { Z: "WNT-M14HDG", SA2: "WNT-M14SA2", SA4: "WNT-M14SA4" },
          label: "M14 Nut (both ends + bottom extra)",
          where: "14mm 타이로드 양단 + 하단 추가",
          formula: "tr14x2 * 3",
        },
        {
          id: "trWasher12", korvan: "WASHER M12", material: "TIEROD_INT", unit: "PCS",
          part: { Z: "WFW-M12HDG", SA2: "WFW-M12SA2", SA4: "WFW-M12SA4" },
          label: "M12 Washer (both ends)",
          where: "타이로드 양단",
          formula: "(tr12x1 + tr12x1h + tr12x2) * 2",
        },
        {
          id: "trWasher14", korvan: "WASHER M14", material: "TIEROD_INT", unit: "PCS",
          part: { Z: "WFW-M14HDG", SA2: "WFW-M14SA2", SA4: "WFW-M14SA4" },
          label: "M14 Washer (both ends)",
          where: "14mm 타이로드 양단",
          formula: "tr14x2 * 2",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 5 : BOTTOM PANEL - External Flange Bar (Flat)
    // -----------------------------------------------------------------------
    // 도면 5장: 바닥패널 조인트에 플랫바. 1M 은 둘레만, 1.5M 이상은 격벽
    // 접합부까지, 3M 이상은 전 그리드 -- 라는 단계 구조.
    {
      id: "S5", sheet: 5, panel: "BOTTOM", title: "Bottom External Flange Bar (Flat)",
      titleKo: "바닥 외부 플랫 플랜지바",
      appliesWhen: "true",
      rows: [
        {
          id: "bf0955ZP", korvan: "0955ZP", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0950ZP", SA2: "WFB-0950PSA2", SA4: "WFB-0950PSA4" },
          label: "Bottom Flat Flange Bar 950mm",
          where: "바닥-벽 접합부 둘레의 1m 구간",
          // 캘리브레이션: 원래 times 에 BOT_VJ(바닥 전체 내부 그리드)를 더했는데
          // 검증된 external row13 은 **둘레 형태 (W_C+totLC)*2** 만 씁니다.
          // 바닥 플랫바가 바닥 전 그리드에 깔린다고 본 것이 과다 계상의 최대
          // 원인이었습니다(WFB-0950ZP +201%).
          // row13 의 층 수는 1M:0, 1.5~2.5M:1, 3~3.5M:2, 4M:3 인데,
          // 그 중 3M 이상의 추가분은 S2.f0955ZP(RNF_ROWS x RNF_SIDES)가 이미
          // 담당합니다. 따라서 여기서는 1층만 맡습니다 -- 두 섹션 합이 row13.
          byHeight: { "1": 0, "1.5": 1, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "(W_C + L_C) * 2",
        },
        {
          id: "bf0455ZP", korvan: "0455ZP", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0450ZP", SA2: "WFB-0450PSA2", SA4: "WFB-0450PSA4" },
          label: "Bottom Flat Flange Bar 450mm",
          where: "바닥-벽 접합부 둘레의 0.5m 구간",
          // 위 bf0955ZP 와 같은 이유로 둘레 형태만 남기고 PA_COL(격벽 전 열)을
          // 뺐습니다. 격벽 접합부는 S9 가 따로 담당합니다.
          byHeight: { "1": 0, "1.5": 1, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "(W_F + L_F) * 2",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 6 : BOTTOM PANEL - Installation Sealing Tape
    // -----------------------------------------------------------------------
    // 도면 6장 + 11장 Accessory Standards 의 실링테이프 규격을 합친 섹션.
    //   30mm : Roof+Roof
    //   50mm : Wall, Bottom, 1760S  (기본 조인트 전체)
    //   120mm: Corner frame, 17160S, 9090S
    // 4M 이상은 "Additional Sealing Tape" 가 추가됩니다(도면 6장 파란 선).
    // 단위가 Roll(30M) 이므로 길이(m)를 먼저 구해 롤 수로 올림합니다.
    {
      id: "S6", sheet: 6, panel: "BOTTOM", title: "Installation Sealing Tape",
      titleKo: "설치용 실링테이프",
      appliesWhen: "true",
      rows: [
        {
          // intermediate: true -> 계산은 하고 뒤 행이 참조할 수 있지만 BOM 에는
          // 나가지 않는 중간값입니다(길이 m -> 롤 수 환산용). 같은 품번이
          // M 과 Roll 로 두 번 집계되는 것을 막습니다.
          id: "tape50m", korvan: "Sealing Tape 50mm", material: "HDG", unit: "M",
          intermediate: true,
          part: { Z: "WST-P0050RO" },
          label: "PVC Sealant 50mm — 소요 길이 (m)",
          where: "벽/바닥 전 조인트. 4M 이상은 추가 테이프 포함",
          // 바닥 그리드 라인 길이 + 벽 둘레 각 단 + 격벽. 4M 이상 1.3배(추가분).
          formula: "((BOT_VJ + COL_W * COL_L) + COL_PERIM * CRS_N + PA_COL * CRS_N) * (H_O >= 4 ? 1.3 : 1)",
        },
        {
          id: "tape50roll", korvan: "Sealing Tape 50mm", material: "HDG", unit: "Roll",
          part: { Z: "WST-P0050RO" },
          label: "PVC Sealant 50mm (30M/Roll)",
          where: "tape50m 을 30M 롤로 환산",
          formula: "ceil(tape50m / 30)",
        },
        {
          id: "tape120", korvan: "Corner Sealant 120mm", material: "HDG", unit: "Roll",
          part: { Z: "WST-P0120M" },
          label: "Corner Angle PVC Sealant 120mm (1M/Roll)",
          where: "코너 프레임 전 높이 4곳 + 17160S/9090S 브래킷부",
          // 1롤 = 1M 이므로 "소요 길이(m) = 롤 수". 코너 4곳 × 높이 +
          // 코너 브래킷 1개당 0.3m 여유분.
          formula: "ceil(CORNER * H_O + b9090S * 0.3)",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 7 : PARTITION PANEL - Internal Flange Bar (Angle)
    // -----------------------------------------------------------------------
    // 도면 7장. 격벽은 내부재이므로 material: "INT" (STS304/316 선택 반영).
    // 격벽 단 높이가 벽체와 달라 924/1490/1414 로 표기되지만, 부재 길이
    // 계열은 같은 450/880/950/1200 을 씁니다.
    {
      id: "S7", sheet: 7, panel: "PARTITION", title: "Internal Flange Bar (Angle)",
      titleKo: "격벽 내부 플랜지바 (앵글)",
      appliesWhen: "N_PA > 0",
      rows: [
        {
          id: "p1205S", korvan: "1205S", material: "INT", unit: "PCS",
          part: { Z: "WFB-1200Z", SA2: "WFB-1200SA2", SA4: "WFB-1200SA4" },
          label: "Internal Angle Bar 1200mm",
          where: "격벽 최상단 단의 수직 조인트",
          byHeight: { "1": 0, "1.5": 2, "2": 0, "2.5": 2, "3": 0, "3.5": 2, "4": 0, "4.5": 2, "5": 0 },
          times: "PA_VJ + 2",
        },
        {
          id: "p0955S", korvan: "0955S", material: "INT", unit: "PCS",
          part: { Z: "WFB-0950Z", SA2: "WFB-0950SA2", SA4: "WFB-0950SA4" },
          label: "Internal Angle Bar 950mm",
          where: "격벽 수평 조인트 라인 × 1m 열",
          byHeight: { "1": 0, "1.5": 0, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "HJ_N * W_C * N_PA",
        },
        {
          id: "p880S", korvan: "880S", material: "INT", unit: "PCS",
          part: { Z: "WFB-0880SA2", SA2: "WFB-0880SA2", SA4: "WFB-0880SA4" },
          label: "Internal Angle Bar 880mm",
          where: "격벽 폭방향 내부 조인트 (924mm 단 대응 길이)",
          // 캘리브레이션: 검증된 internal row13 은 (H_O>1 && 격벽있음) ? VJ_W : 0
          // 입니다. 원래 CRS_1000*(PA_VJ+2)*2 로 두어 +444% 과다였습니다.
          formula: "(H_O > 1 && N_PA > 0) ? VJ_W : 0",
        },
        {
          id: "p0455S", korvan: "0455S", material: "INT", unit: "PCS",
          part: { Z: "WFB-0450Z", SA2: "WFB-0450SA2", SA4: "WFB-0450SA4" },
          label: "Internal Angle Bar 450mm",
          where: "격벽 0.5m 열 + 수평/수직 교차점",
          byHeight: { "1": 0, "1.5": 0, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "HJ_N * (W_F * N_PA + PA_VJ)",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 8 : PARTITION PANEL - Internal Flange Bar (Flat)
    // -----------------------------------------------------------------------
    // 도면 8장: 격벽 플랫바 보강도 [개념 4] 그대로 -- 3.5M부터 등장하고
    // 4.5M부터 단이 늘어납니다. RNF_ROWS/RNF_SIDES 를 그대로 재사용합니다.
    {
      id: "S8", sheet: 8, panel: "PARTITION", title: "Internal Flange Bar (Flat)",
      titleKo: "격벽 내부 플랫 보강바",
      appliesWhen: "N_PA > 0",
      rows: [
        {
          id: "pf0955SP", korvan: "0955SP", material: "INT", unit: "PCS",
          part: { Z: "WFB-0950ZP", SA2: "WFB-0950PSA2", SA4: "WFB-0950PSA4" },
          label: "Internal Flat Bar 950mm",
          where: "격벽 하부 보강 단 × 1m 열 × 보강 면수",
          formula: "RNF_ROWS * RNF_SIDES * W_C * N_PA",
        },
        {
          id: "pf880SP", korvan: "880SP", material: "INT", unit: "PCS",
          part: { Z: "WFB-0880ZP", SA2: "WFB-0880PSA2", SA4: "WFB-0880PSA4" },
          label: "Internal Flat Bar 880mm",
          where: "격벽 하부 보강 단의 수직 방향",
          formula: "RNF_ROWS * RNF_SIDES * (PA_VJ + 2)",
        },
        {
          id: "pf0455SP", korvan: "0455SP", material: "INT", unit: "PCS",
          part: { Z: "WFB-0450ZP", SA2: "WFB-0450PSA2", SA4: "WFB-0450PSA4" },
          label: "Internal Flat Bar 450mm",
          where: "격벽 0.5m 열 보강",
          formula: "RNF_ROWS * RNF_SIDES * W_F * N_PA",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 9 : PARTITION - External Flange Bar (Flat) + Bracket
    // -----------------------------------------------------------------------
    // 도면 9장: 격벽이 외벽과 만나는 지점(partition+wall)의 외부측 부재.
    // 격벽 양 끝단은 항상 외벽에 붙으므로 수량 기준은 N_PA*2.
    {
      id: "S9", sheet: 9, panel: "PARTITION", title: "Partition-Wall External Bar & Bracket",
      titleKo: "격벽-외벽 접합 외부 부재",
      appliesWhen: "N_PA > 0",
      rows: [
        {
          id: "pw0955ZP", korvan: "0955ZP", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0950ZP", SA2: "WFB-0950PSA2", SA4: "WFB-0950PSA4" },
          label: "External Flat Bar 950mm (partition line)",
          where: "격벽 라인의 외벽 외부측 — 4M 초과에서만 발생",
          // 캘리브레이션: 검증된 external row13 의 격벽 항은
          //   (H_O>3 ? W_C*N_PA : 0) + (H_O>3 ? 2*N_PA : 0)
          // 즉 3M 초과에서만 발생하고 단 수(CRS_N)와는 무관합니다.
          // 원래 CRS_N*N_PA*2 로 두어 낮은 높이에서도 계상되고 있었습니다.
          formula: "H_O > 3 ? (W_C * N_PA + 2 * N_PA) : 0",
        },
        {
          id: "pw0455ZP", korvan: "0455ZP", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0450ZP", SA2: "WFB-0450PSA2", SA4: "WFB-0450PSA4" },
          label: "External Flat Bar 450mm (partition line)",
          where: "격벽 라인 바닥측 짧은 조각",
          formula: "N_PA * 2",
        },
        {
          id: "pw1610_1760_12", korvan: "1610Z+1760S (12MM)", material: "INT", unit: "SET",
          part: { Z: "WCP-1610Z", SA2: "WCP-1760SA2", SA4: "WCP-1760SA4" },
          label: "Cross Plate + Bracket, M12 tie rod",
          where: "격벽-외벽 접합 교차점 (상부 단, 도면 하늘색)",
          byHeight: { "1": 1, "1.5": 1, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "N_PA * 2 * max(CRS_N - 1, 1)",
        },
        {
          id: "pw17120_1760", korvan: "17120Z+1760S", material: "INT", unit: "SET",
          part: { Z: "WCP-17120Z", SA2: "WCP-1760SA2", SA4: "WCP-1760SA4" },
          label: "External Cross Plate 170x120 + Tie-rod Bracket",
          where: "격벽-외벽 최하부 접합 (도면 진한 주황)",
          // 17120Z 는 Stopper Bracket 등과 무관한 **별도 제품**이라는 확인을
          // 받아 WCP-17120Z(ANGLE 170x120x6)로 신규 등록했습니다. 앱 명명
          // 규칙(WCP-1610Z=160x100, WCP-1616Z=160x160)을 따랐습니다.
          // 중량/단가는 미입력이므로 원가 산출 전 채워야 합니다.
          needsPartConfirm: true,
          byHeight: { "1": 0, "1.5": 1, "2": 1, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 1, "5": 1 },
          times: "N_PA * 2",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 10 : PARTITION PANEL - Internal Bracket
    // -----------------------------------------------------------------------
    // 도면 10장 범례: 격벽은 양쪽에서 힘을 받으므로 1760S/17160S 가 2EA 씩.
    //   1760S + 1610S + 1760S  (1610S 1EA / 1760S 2EA)
    //   1760S + 1616S + 1760S  (1616S 1EA / 1760S 2EA)
    //   17160S + 1616S + 17160S(1616S 1EA / 17160S 2EA)
    {
      id: "S10", sheet: 10, panel: "PARTITION", title: "Partition Internal Bracket",
      titleKo: "격벽 내부 브래킷",
      verified: true,
      appliesWhen: "N_PA > 0",
      // ** verified: true ** -- S3 와 같은 이식이며, 여기는 **격벽(N_PA) 항만**
      // 담당합니다. S3(벽 둘레) + S10(격벽) 합이 원본 row 와 일치합니다:
      //   row20 (WCP-1610*)  = VJ_W*N_PA                     -> pb1610S
      //   row21 (WCP-1616*)  = VJ_W*HJ_N*N_PA                -> pb1616S
      //   row18 (WCP-1760*)  += VJ_W*N_PA + HJ_N*2*N_PA      -> pb1760S
      //   row19 (WCP-17160*) += VJ_W*HJ_N*N_PA               -> pb17160S
      //   row52 (WCP-1610Z)  += HJ_N*2*N_PA                  -> pb1610Zextra
      // 도면 10장 범례의 "1760S 2EA / 17160S 2EA"(격벽은 양쪽에서 받으므로
      // 2개씩) 개념은 위 수식의 *2 항에 이미 반영되어 있습니다.
      rows: [
        {
          id: "pb1610S", korvan: "1610S", material: "INT", unit: "PCS",
          part: { Z: "WCP-1610Z", SA2: "WCP-1610SA2", SA4: "WCP-1610SA4" },
          label: "Internal Cross Plate 160x100 (2 holes)",
          where: "격벽 수직 조인트 (폭방향 내부 조인트 × 격벽 수)",
          formula: "H_O > 1 ? VJ_W * N_PA : 0",
        },
        {
          id: "pb1616S", korvan: "1616S", material: "INT", unit: "PCS",
          part: { Z: "WCP-1616Z", SA2: "WCP-1616SA2", SA4: "WCP-1616SA4" },
          label: "Internal Cross Plate 160x160 (4 holes)",
          where: "격벽 수직 조인트 × 수평 조인트 층",
          formula: "H_O > 1 ? VJ_W * HJ_N * N_PA : 0",
        },
        {
          id: "pb1760S", korvan: "1760S (2EA)", material: "INT", unit: "PCS",
          part: { Z: "WCP-1760SA2", SA2: "WCP-1760SA2", SA4: "WCP-1760SA4" },
          label: "Internal Tie-rod Bracket 60x320 (1 hole)",
          where: "격벽 수직 조인트 + 2.5M 이상 수평 조인트 양쪽 2개",
          formula: "(H_O > 1 ? VJ_W * N_PA : 0) + (H_O >= 2.5 ? HJ_N * 2 * N_PA : 0)",
        },
        {
          id: "pb17160S", korvan: "17160S (2EA)", material: "INT", unit: "PCS",
          part: { Z: "WCP-17160SA2", SA2: "WCP-17160SA2", SA4: "WCP-17160SA4" },
          label: "Internal Tie-rod Bracket 160x320 (2 holes)",
          where: "격벽 수직 조인트 × 수평 조인트 층 — 타이로드 2본",
          formula: "H_O > 1 ? VJ_W * HJ_N * N_PA : 0",
        },
        {
          id: "pb1610Zextra", korvan: "1610Z (partition)", material: "HDG", unit: "PCS",
          part: { Z: "WCP-1610Z" },
          label: "External Cross Plate 160x100 — 격벽 추가분",
          where: "2.5M 이상: 격벽 라인의 수평 조인트 양쪽",
          formula: "H_O >= 2.5 ? HJ_N * 2 * N_PA : 0",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 시트 11 : SUBSIDIARY MATERIALS - Steel Skid / Accessory Standards
    // -----------------------------------------------------------------------
    // 도면 11장의 "Accessory Standards" 표를 그대로 수식화한 섹션입니다.
    // 이 시트는 계수가 도면에 숫자로 명시되어 있어 가장 신뢰도가 높습니다.
    //   Roof support : {(Width/2)-1} x {(Length/2)-1}
    //   Air vent     : 1EA / 30m^2  (100TON 미만 50A, 이상 100A)
    //   Anchor Bolt  : 4ea + 1ea per every 5m (Width/Length)
    //   Liner        : 스틸스키드 전 교차점 (1.6t/2ea, 3.2t/3ea)
    //   Nut/Washer   : 타이로드 양단
    // 스틸스키드 본체(레일 길이/품번)는 이미 검증된 accessories_rules.js
    // steelSkidDetailed 가 담당하므로 여기서는 중복 정의하지 않고, 도면 11장의
    // "Jointer for Steel Skid A/B" 와 부속자재만 다룹니다.
    {
      id: "S11", sheet: 11, panel: "SUBSIDIARY", title: "Steel Skid Jointer & Accessory Standards",
      titleKo: "스틸스키드 조이너 & 부속자재 표준",
      appliesWhen: "true",
      rows: [
        {
          id: "skidJointer", korvan: "7575Z", material: "HDG", unit: "PCS",
          part: { Z: "WBR-7575Z" },
          label: "Jointer for Steel Skid A/B (width+length)",
          where: "스틸스키드 A/B 폭방향 + 길이방향 이음부",
          formula: "COL_W * 2 + COL_L * 2",
        },
        {
          id: "skidAngleJointer", korvan: "0125Z", material: "HDG", unit: "PCS",
          part: { Z: "WBR-0120Z" },
          label: "Steel Skid A - Angle Type jointer",
          where: "스키드 A 앵글 타입 (1~2mH). 2.5mH 이상은 채널 타입 사용",
          formula: "H_O <= 2 ? (COL_W + COL_L) * 2 : 0",
        },
        {
          id: "skidChannelJointer", korvan: "120210Z", material: "HDG", unit: "PCS",
          part: { Z: "WBR-0240Z" },
          label: "Steel Skid A - Channel Type jointer",
          where: "스키드 A 채널 타입 (2.5mH 이상)",
          formula: "H_O >= 2.5 ? (COL_W + COL_L) * 2 : 0",
        },
        {
          id: "roofSupport", korvan: "Roof support", material: "HDG", unit: "PCS",
          part: { Z: "@ROOF_SUPPORT" },  // @ 접두사 = 엔진이 높이로 품번 생성
          label: "Roof Support {(W/2)-1} x {(L/2)-1}",
          where: "지붕 내부 지지점 = 각 칸의 그리드 내부 교차점 (칸별로 계산)",
          // 도면 11장은 "{(Width/2)-1} X {(Length/2)-1}" 로만 적혀 있어 Width 가
          // m 인지 패널 열 수인지 모호합니다. 이미 워크북과 대조 검증된
          // accessories_rules.js roofSupporter("(W_C+W_F-1)*(Lc+Lf-1)/2")와
          // **완전히 같은 값**이 나오도록 맞췄습니다(verify [2b] 에서 전 케이스
          // 일치 검사). 반드시 칸별로 계산해야 합니다 -- 전체 길이(COL_L)로
          // 세면 격벽 라인의 열이 중복 계상됩니다.
          // ceil 이 앞 두 칸에만 걸리는 것은 원본 워크북의 동작을 그대로
          // 따른 것입니다(칸별 0.5 단수가 상쇄되도록 의도된 것으로 보임).
          formula: "ceil((COL_W-1)*(COL_L1-1)/2 + (L2_O>0 ? (COL_W-1)*(COL_L2-1)/2 : 0))"
                 + " + (L3_O>0 ? (COL_W-1)*(COL_L3-1)/2 : 0)"
                 + " + (L4_O>0 ? (COL_W-1)*(COL_L4-1)/2 : 0)",
        },
        {
          id: "airVent", korvan: "Air vent", material: "HDG", unit: "PCS",
          part: { Z: "@AIR_VENT" },      // 100TON 미만 WAV-0050A / 이상 WAV-0100A
          label: "Air Vent 1EA / 30m2",
          where: "도면 11장: 100TON 미만 50A, 100TON 이상 100A",
          formula: "ceil(W_O * L_O / 30)",
        },
        {
          id: "anchorBolt", korvan: "Anchor Bolt", material: "HDG", unit: "SET",
          part: { Z: "WBR-5010Z" },
          label: "Anchor Set: 4ea + 1ea per every 5m",
          where: "도면 11장 Accessory Standards 3행 그대로",
          formula: "4 + floor(W_O / 5) + floor(L_O / 5)",
        },
        {
          id: "liner", korvan: "Liner", material: "HDG", unit: "PCS",
          part: { Z: "LNR-5.0T" },
          label: "Liner / Shim Plate (all skid crossing points)",
          where: "스틸스키드 전 교차점. 도면 11장: 1.6t/2ea, 3.2t/3ea",
          formula: "(COL_W + 1) * (COL_L + 1) * 2",
        },
      ],
    },

    // =======================================================================
    // S12 : 코너 프레임 & 외부 바디 앵글(V계열)   ** verified: true **
    // =======================================================================
    // 위 S1~S11 과 성격이 다릅니다. 이 섹션은 도면에서 유도한 1차 정의가 아니라,
    // **이미 워크북과 대조 검증된** accessories_rules.js 의 external 보강 수식을
    // 읽을 수 있는 형태로 이식한 것입니다. 따라서 계수를 임의로 바꾸면 회귀가
    // 됩니다(verified: true 로 표시).
    //
    // 이식 근거 (기존 external 규칙의 행 번호 -> 아래 행):
    //   row16/17/18 (WCA-1000Z/1500Z/2000Z)  -> corner frame 3행
    //   row11       (WFB-0950VZ)             -> bodyBand
    //   row12       (WFB-0450VZ)             -> bodyGrid + bodyBandShort
    //
    // 여기서 밝혀진 두 가지 사실:
    //
    //  (1) 4.5M/5M 에서 보강이 "줄어드는" 것이 아니라 **위상이 바뀝니다.**
    //      2.5~4M : 둘레 밴드 방식  -- WFB-0950VZ 를 perim x (4,6,6,8) x 2
    //      4.5~5M : 전면 그리드 방식 -- WFB-0450VZ 를 벽면 그리드 전체에
    //      둘 다 V계열(40mm 폭 중량앵글)이고 S1 의 Z계열(30mm)과는 다른 부재라
    //      중복 계상되지 않습니다.
    //
    //  (2) 기존 워크북은 **4.5M/5M 에서 코너 앵글을 0개** 산출합니다(row16/17/18
    //      이 모두 그 높이를 비워둠). 가장 높은 탱크에서 코너 프레임이 BOM 에서
    //      빠지는 누락입니다. 아래 corner frame 3행은 상수표 대신 **단 스택을
    //      그대로 따르는 일반 규칙**으로 바꿔 이 구멍을 메웁니다:
    //        코너 앵글 = 코너 4곳 x 각 단, 품번은 그 단의 높이(1000/1500/2000)
    //      기존 워크북과의 대조 (총 코너 높이 기준, 4곳 x 합계):
    //        1M   4x1000            = 기존과 동일
    //        1.5M 4x1500            = 동일
    //        2M   4x2000            = 동일
    //        2.5M 4x1500 + 4x1000   = 동일
    //        3M   4x2000 + 4x1000   = 기존 8x1500 -- 조각 구성만 다르고 총 3000 동일
    //        3.5M 4x1500 + 8x1000   = 기존 4x1500+4x2000 -- 총 3500 동일
    //        4M   4x2000 + 8x1000   = 기존 8x2000 -- 총 4000 동일
    //        4.5M 4x1500 + 12x1000  = 기존 0 (누락 보완)
    //        5M   4x2000 + 12x1000  = 기존 0 (누락 보완)
    {
      id: "S12", sheet: 6, panel: "WALL", title: "Corner Frame & External Body Angle (V-series)",
      titleKo: "코너 프레임 & 외부 바디 앵글(V계열)",
      verified: true,
      appliesWhen: "RF==2",
      rows: [
        {
          id: "wca1000", korvan: "Corner Frame 1000", material: "HDG", unit: "PCS",
          part: { Z: "WCA-1000Z" },
          label: "Corner Angle 1000mm",
          where: "코너 4곳 × 1000mm 단 개수",
          formula: "CRS_1000 * CORNER",
        },
        {
          id: "wca1500", korvan: "Corner Frame 1500", material: "HDG", unit: "PCS",
          part: { Z: "WCA-1500Z" },
          label: "Corner Angle 1500mm",
          where: "코너 4곳 × 최상단 단이 1500mm 인 경우",
          formula: "(CRS_TOP == 1500 ? 1 : 0) * CORNER",
        },
        {
          id: "wca2000", korvan: "Corner Frame 2000", material: "HDG", unit: "PCS",
          part: { Z: "WCA-2000Z" },
          label: "Corner Angle 2000mm",
          where: "코너 4곳 × 최상단 단이 2000mm 인 경우",
          formula: "(CRS_TOP == 2000 ? 1 : 0) * CORNER",
        },
        {
          // 기존 row11 원형: (H==3.5||H==3)?perim*6*2 : (H==4)?perim*8*2 : (H==2.5)?perim*4*2 : 0
          // perim == PERIM_J 이므로 "층 수 × (PERIM_J*2)" 로 분해했습니다.
          id: "bodyBand", korvan: "(V-series band)", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0950VZ" },
          label: "Body Angle 950mm (V, 40x65) — 둘레 밴드",
          where: "2.5~4M: 벽 둘레를 감는 중량앵글 밴드. 높이가 오르면 단이 늘어남",
          byHeight:       { "1": 0, "1.5": 0, "2": 0, "2.5": 1, "3": 1, "3.5": 1, "4": 1, "4.5": 0, "5": 0 },
          layersByHeight: { "1": 0, "1.5": 0, "2": 0, "2.5": 4, "3": 6, "3.5": 6, "4": 8, "4.5": 0, "5": 0 },
          times: "PERIM_J * 2",
        },
        {
          // 기존 row12 전반부: (H==4.5||H==5) ? (W_C*(totLC+totLF-1)+totLC*(W_C+W_F-1))*2 : 0
          // totLC+totLF == COL_L, totLC == L_C, W_C+W_F-1 == COL_W-1
          id: "bodyGrid", korvan: "(V-series grid)", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0450VZ" },
          label: "Body Angle 450mm (V, 40x64) — 전면 그리드",
          where: "4.5~5M: 둘레 밴드 대신 벽면 전체 그리드로 위상 전환",
          formula: "(H_O >= 4.5 ? (W_C * (COL_L - 1) + L_C * (COL_W - 1)) * 2 : 0)",
        },
        {
          // 기존 row12 후반부: (H==3.5||H==2.5) ? perim*2*2 : 0
          id: "bodyBandShort", korvan: "(V-series band, short)", material: "HDG", unit: "PCS",
          part: { Z: "WFB-0450VZ" },
          label: "Body Angle 450mm (V) — 밴드 마감재",
          where: "2.5M / 3.5M 밴드의 마감 조각",
          byHeight:       { "1": 0, "1.5": 0, "2": 0, "2.5": 1, "3": 0, "3.5": 1, "4": 0, "4.5": 0, "5": 0 },
          layersByHeight: { "1": 0, "1.5": 0, "2": 0, "2.5": 2, "3": 0, "3.5": 2, "4": 0, "4.5": 0, "5": 0 },
          times: "PERIM_J * 2",
        },
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // [개념 7] 품번 카탈로그 치환 레이어 -- 거래처마다 품번/이름/규격이 다르다
  // ---------------------------------------------------------------------------
  // 같은 부재라도 거래처에 따라 **품번 자체는 물론 이름과 규격 표기까지**
  // 달라집니다. 그래서 각 row 의 part 에 박힌 품번을 직접 고치게 하면 안 됩니다
  // (같은 품번이 여러 row 에 흩어져 있어 하나만 빠뜨리면 조용히 틀립니다).
  //
  // 대신 프로필마다 **정규 품번(canonical) -> 거래처 품번** 치환표를 둡니다.
  //   - row 는 손대지 않습니다. 정규 품번을 계속 씁니다.
  //   - 치환표 한 곳만 고치면 그 품번이 쓰인 모든 row 에 한꺼번에 반영됩니다.
  //   - 엔진은 결과에 canonical(정규 품번)을 함께 실어 보내므로 추적됩니다.
  //
  // catalog 항목에 넣을 수 있는 필드 (모두 선택):
  //   partNo  거래처 품번 (없으면 정규 품번 그대로)
  //   nameKo  한글 품명      nameEn  영문 품명      spec  규격 표기
  //   note    비고 (BOM 에는 안 나가고 감사 시트에만 표시)
  //
  // 표준 프로필의 catalog 는 "이름/규격만" 담습니다(품번은 앱 카탈로그와 동일).
  // 여기에 적지 않은 품번은 parts_db.json 값이 그대로 쓰이므로, 전부 적을
  // 필요는 없습니다 -- 바꿀 것만 적으십시오.
  const CATALOG_WATANI_STD = {
    "WFB-0450Z":   { nameKo: "앵글 플랜지바 450",       spec: "ANGLE 30x64x3x450" },
    "WFB-0950Z":   { nameKo: "앵글 플랜지바 950",       spec: "ANGLE 30x65x3x950" },
    "WFB-1200Z":   { nameKo: "앵글 플랜지바 1200",      spec: "ANGLE 32x64x3x1200" },
    "WFB-0450ZP":  { nameKo: "플랫 보강바 450",         spec: "PLATE 40x3x450" },
    "WFB-0950ZP":  { nameKo: "플랫 보강바 950",         spec: "PLATE 40x3x950" },
    "WFB-0950VZ":  { nameKo: "바디 앵글 950 (V, 중량)", spec: "ANGLE 40x65x3x950" },
    "WFB-0450VZ":  { nameKo: "바디 앵글 450 (V, 중량)", spec: "ANGLE 40x64x3x450" },
    "WCP-1610Z":   { nameKo: "크로스 플레이트 160x100", spec: "ANGLE 160x100x6 (2홀)" },
    "WCP-1616Z":   { nameKo: "크로스 플레이트 160x160", spec: "ANGLE 160x160x6 (4홀)" },
    "WCP-17120Z":  { nameKo: "크로스 플레이트 170x120", spec: "ANGLE 170x120x6 (2홀)",
                     note: "신규 등록 품번 -- 규격/중량/단가 확인 대상" },
    "WCA-1000Z":   { nameKo: "코너 앵글 1000",          spec: "CORNER ANGLE 1000mm" },
    "WCA-1500Z":   { nameKo: "코너 앵글 1500",          spec: "CORNER ANGLE 1500mm" },
    "WCA-2000Z":   { nameKo: "코너 앵글 2000",          spec: "CORNER ANGLE 2000mm" },
    "TR-14M2000SA2": { nameKo: "타이로드 M14x2000 STS304",
                       note: "신규 등록 품번 -- 중량/단가 확인 대상" },
    "TR-14M2000SA4": { nameKo: "타이로드 M14x2000 STS316",
                       note: "신규 등록 품번 -- 중량/단가 확인 대상" },
  };

  // ---------------------------------------------------------------------------
  // 프로필 정의
  // ---------------------------------------------------------------------------
  const PROFILES = {
    "WATANI-STD": {
      label: "WATANI 표준 (Korvan 설치표준 개념 기반)",
      note: "기본 프로필. 앱 카탈로그(parts_db.json) 품번 사용. 계수는 고객 확인 대상.",
      courseStack: COURSE_STACK,
      reinforceDepth: REINFORCE_DEPTH,
      catalog: CATALOG_WATANI_STD,
      sections: SECTIONS_WATANI_STD,
    },

    // 고객 프로필 예시 -- 이 형태를 복사해서 새 고객을 추가하십시오.
    // overrides 키는 "섹션ID.행ID" 이며, 그 행에서 바꿀 필드만 적습니다.
    "SAMPLE-CUSTOMER": {
      label: "샘플 고객 (표준에서 3가지만 변경)",
      note: "새 고객 프로필 작성 예시. 실제 사용 전 값 확인 필요.",
      extends: "WATANI-STD",
      overrides: {
        // 1) 4M 탱크의 12mm 2본 타이로드를 2층 -> 3층으로 (표 한 칸만 병합)
        "S4.tr12x2": { layersByHeight: { "4": 3 } },
        // 2) 타이로드를 전량 STS316 고정 품번으로
        "S4.tr12x1": { part: { Z: "TR-12M2000SA4", SA2: "TR-12M2000SA4", SA4: "TR-12M2000SA4" } },
        // 3) 앵커볼트를 5m당 1ea -> 4m당 1ea 로
        "S11.anchorBolt": { formula: "4 + floor(W_O / 4) + floor(L_O / 4)" },
      },
      // [개념 7] 품번/이름/규격 치환 -- row 는 하나도 안 건드립니다.
      // 이 거래처는 950 앵글을 자기 품번/품명으로 부르고, 코너 앵글 규격
      // 표기도 다릅니다. 여기 한 줄만 고치면 그 품번이 쓰인 모든 섹션에
      // 동시에 반영됩니다.
      catalogOverrides: {
        "WFB-0950Z":  { partNo: "KV-0955Z", nameKo: "External Flange Bar 950",
                        nameEn: "EXT FLANGE BAR 950", spec: "ANGLE 32x64x3x950 (거래처 규격)" },
        "WFB-0950ZP": { partNo: "KV-0955ZP", nameKo: "External Flange Bar Flat 950" },
        "WCA-1000Z":  { nameKo: "Corner Frame 1M", spec: "CORNER FLAME 1000mm" },
      },
      // 높이 구성 자체가 다른 고객이면 courseStack 을 덮어쓰면 됩니다:
      // courseStack: { ...COURSE_STACK, "6": [2000, 1000, 1000, 1000, 1000] },
    },
  };

  const SteelAccessoriesRules = {
    SCHEMA_VERSION: 1,
    SOURCE: "Korvan Installation Standard 2015-07-23 (개념 참조) + parts_db.json (품번)",
    VERIFIED: false,   // 계수 미검증. verify_steel_accessories.js 참조.
    defaultProfile: "WATANI-STD",
    courseStack: COURSE_STACK,
    reinforceDepth: REINFORCE_DEPTH,
    materialSources: MATERIAL_SOURCES,
    variables: VARIABLES,
    profiles: PROFILES,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SteelAccessoriesRules;
  } else {
    global.SteelAccessoriesRules = SteelAccessoriesRules;
  }
})(typeof window !== "undefined" ? window : globalThis);
