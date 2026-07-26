// =============================================================================
// WATANI GRP Water Tank -- Panel Costing Tab ("COSTING", 원가 계산)
// =============================================================================
// Re-implements the manufacturing-cost engine from the uploaded
// Panel_Costing_Table.xlsx (sheets: Panel_Cost_Table, LABOUR_Cost,
// Equipment Costs(Press_Machine), Equipment Costs(Drilling)) as an editable
// screen, so raw material / labor / equipment cost assumptions can be
// updated live instead of living only in a spreadsheet.
//
// Formula chain per panel row (mirrors the xlsx exactly):
//   rawMaterialCost = wtKg * smcPerKg + gcWeightG * gcPerGram
//   pressCost   = pressRatePerHr / (3600/cTimeSec) + (laborsPress   * laborRatePerHr) / (3600/cTimeSec)
//   drillCost   = drillRatePerHr / drillQtyPerHr    + (laborsDrill  * laborRatePerHr) / drillQtyPerHr
//   manufacturingCost = rawMaterialCost + pressCost + drillCost   (xlsx column AE)
//
// Base rates (laborRatePerHr, pressRatePerHr, drillRatePerHr) are themselves
// computed from small editable buildup tables, also taken from the xlsx.
// The upstream depreciation / multi-machine time-pooling detail in the xlsx
// Equipment sheets is internally inconsistent (different monthly-hour
// denominators for fixed vs variable cost) and does not change the final
// consolidated row those sheets already compute, so only that final row
// (Fixed expense/Month, Variable expense/Hr, Boiler expense/Hr, Planned
// time available/Month) is exposed here as editable input.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_costing_v1";

  // ---- Seed data extracted from Panel_Cost_Table (rows 4-27) ----------------
  const SEED_PANEL_ROWS = [
    { code: "MF00", name: "Manhole(1m x 1m)",        tankHeight: "000", wtKg: 14.2, gcWeightG: 0,      pressingSec: 240, cTimeSec: 300, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "RF00", name: "Roof(1x1M)",               tankHeight: "000", wtKg: 8.5,  gcWeightG: 0,      pressingSec: 240, cTimeSec: 340, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "BF10", name: "Base(1x1M)",                tankHeight: "100", wtKg: 14.5, gcWeightG: 238.05, pressingSec: 300, cTimeSec: 400, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "BF20", name: "Base(1x1M)",                tankHeight: "200", wtKg: 16,   gcWeightG: 238.05, pressingSec: 300, cTimeSec: 400, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "BF30", name: "Base(1x1M)",                tankHeight: "300", wtKg: 21,   gcWeightG: 238.05, pressingSec: 360, cTimeSec: 460, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "BF40", name: "Base(1x1M)",                tankHeight: "400", wtKg: 23.5, gcWeightG: 238.05, pressingSec: 360, cTimeSec: 460, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "NH15", name: "FLAT HALF(0.5x1M)",         tankHeight: "150", wtKg: 7.2,  gcWeightG: 238.05, pressingSec: 420, cTimeSec: 520, laborsPress: 1, drillQtyHr: 30, laborsDrill: 1 },
    { code: "NH25", name: "FLAT HALF(0.5x1M)",         tankHeight: "250", wtKg: 8.7,  gcWeightG: 238.05, pressingSec: 390, cTimeSec: 490, laborsPress: 1, drillQtyHr: 30, laborsDrill: 1 },
    { code: "NH35", name: "FLAT HALF(0.5x1M)",         tankHeight: "350", wtKg: 11.4, gcWeightG: 238.05, pressingSec: 570, cTimeSec: 670, laborsPress: 1, drillQtyHr: 30, laborsDrill: 1 },
    { code: "NH40", name: "FLAT HALF(0.5x1M)",         tankHeight: "400", wtKg: 13.5, gcWeightG: 238.05, pressingSec: 570, cTimeSec: 670, laborsPress: 1, drillQtyHr: 30, laborsDrill: 1 },
    { code: "NF10", name: "Nozzle_Drain(1x1m)",        tankHeight: "100", wtKg: 12.5, gcWeightG: 238.05, pressingSec: 300, cTimeSec: 400, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "NF20", name: "Nozzle_Drain(1x1m)",        tankHeight: "200", wtKg: 17.5, gcWeightG: 238.05, pressingSec: 360, cTimeSec: 460, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "NF30", name: "Nozzle_Drain(1x1m)",        tankHeight: "300", wtKg: 21,   gcWeightG: 238.05, pressingSec: 360, cTimeSec: 460, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "NF40", name: "Nozzle_Drain(1x1m)",        tankHeight: "400", wtKg: 25,   gcWeightG: 238.05, pressingSec: 420, cTimeSec: 520, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "SF10", name: "Side(1m x 1m)",             tankHeight: "100", wtKg: 13.8, gcWeightG: 238.05, pressingSec: 300, cTimeSec: 400, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "SF20", name: "Side(1m x 1m)",             tankHeight: "200", wtKg: 17,   gcWeightG: 238.05, pressingSec: 360, cTimeSec: 460, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "SF30", name: "Side(1m x 1m)",             tankHeight: "300", wtKg: 21,   gcWeightG: 238.05, pressingSec: 360, cTimeSec: 460, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "SF40", name: "Side(1m x 1m)",             tankHeight: "400", wtKg: 26.5, gcWeightG: 238.05, pressingSec: 420, cTimeSec: 520, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "PF10", name: "Partition(0.93x1.0m)",      tankHeight: "100", wtKg: 12.6, gcWeightG: 238.05, pressingSec: 330, cTimeSec: 430, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "PF20", name: "Partition(0.93x1.0m)",      tankHeight: "200", wtKg: 15.1, gcWeightG: 238.05, pressingSec: 390, cTimeSec: 490, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "PF30", name: "Partition(0.93x1.0m)",      tankHeight: "300", wtKg: 18.5, gcWeightG: 238.05, pressingSec: 390, cTimeSec: 490, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "PF40", name: "Partition(0.93x1.0m)",      tankHeight: "400", wtKg: 21,   gcWeightG: 238.05, pressingSec: 570, cTimeSec: 670, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "SL15", name: "Side(1m x 1.5m)",           tankHeight: "150", wtKg: 19.3, gcWeightG: 341.55, pressingSec: 300, cTimeSec: 400, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 },
    { code: "ST20", name: "Side(1m x 2.0m)",           tankHeight: "200", wtKg: 29,   gcWeightG: 445.05, pressingSec: 300, cTimeSec: 400, laborsPress: 2, drillQtyHr: 30, laborsDrill: 2 }
  ];

  const DEFAULT_STATE = {
    material: {
      smcPerKg: 5,             // SMC 원자재 단가 ($/kg)
      gcPerGram: 1050 / 1050 / 180 // G/C(포장/부자재) 단가 ($/g)
    },
    labor: {
      // 근무시간(월)
      weekdayHrDay: 8, weekdayDaysMonth: 20,
      satHrDay: 4, satDaysMonth: 4,
      otHrMonth: 70,
      // 임금(연)
      directLaborCostYr: 12000,
      paidLeaveCostYr: 1000,
      otherBenefitsYr: 1200,
      indirectLaborCostYr: 7100
    },
    pressEquip: {
      fixedExpenseMonth: 11400,
      variableExpenseHr: 1.1689814814814814,
      boilerExpenseHr: 5,
      plannedHrMonth: 401.0133333333334
    },
    drillingEquip: {
      fixedExpenseMonth: 3070.0000000000005,
      variableExpenseHr: 0.2337962962962963,
      boilerExpenseHr: 0,
      plannedHrMonth: 401.0133333333334
    },
    panelRows: SEED_PANEL_ROWS.map(function (r) { return Object.assign({}, r); })
  };

  let state = null;
  let activeSubTab = "labor";

  // ---- Rate / cost formulas ---------------------------------------------
  function laborMonthHours(l) {
    return (l.weekdayHrDay * l.weekdayDaysMonth) + (l.satHrDay * l.satDaysMonth) + l.otHrMonth;
  }

  function computeLaborRatePerHr(l) {
    const hrs = laborMonthHours(l);
    if (!hrs) return 0;
    const monthlyCost = (l.directLaborCostYr + l.paidLeaveCostYr + l.otherBenefitsYr + l.indirectLaborCostYr) / 12;
    return monthlyCost / hrs;
  }

  function computeEquipRatePerHr(e) {
    const fixedPerHr = e.plannedHrMonth ? (e.fixedExpenseMonth / e.plannedHrMonth) : 0;
    return fixedPerHr + (e.variableExpenseHr || 0) + (e.boilerExpenseHr || 0);
  }

  function currentRates() {
    return {
      laborRatePerHr: computeLaborRatePerHr(state.labor),
      pressRatePerHr: computeEquipRatePerHr(state.pressEquip),
      drillRatePerHr: computeEquipRatePerHr(state.drillingEquip),
      smcPerKg: state.material.smcPerKg,
      gcPerGram: state.material.gcPerGram
    };
  }

  function computeRow(row, rates) {
    const rawMaterialCost = (row.wtKg || 0) * rates.smcPerKg + (row.gcWeightG || 0) * rates.gcPerGram;
    const pressQtyHr = row.cTimeSec ? (3600 / row.cTimeSec) : 0;
    const pressCost = pressQtyHr ? (rates.pressRatePerHr / pressQtyHr) + ((row.laborsPress || 0) * rates.laborRatePerHr) / pressQtyHr : 0;
    const drillCost = row.drillQtyHr ? (rates.drillRatePerHr / row.drillQtyHr) + ((row.laborsDrill || 0) * rates.laborRatePerHr) / row.drillQtyHr : 0;
    const manufacturingCost = rawMaterialCost + pressCost + drillCost;
    return { rawMaterialCost: rawMaterialCost, pressCost: pressCost, drillCost: drillCost, manufacturingCost: manufacturingCost };
  }

  function matchingDbCount(code) {
    if (typeof global.partsDb === "undefined" || !Array.isArray(global.partsDb)) return 0;
    const upper = code.toUpperCase();
    return global.partsDb.filter(function (p) {
      return p && p.category === "PANEL" && p.partNo && p.partNo.toUpperCase().indexOf(upper) === 0;
    }).length;
  }

  // ---- Persistence (localStorage first, best-effort Firestore) ----------
  function loadLocalState() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      console.error("[Costing] localStorage 불러오기 실패:", e);
      return null;
    }
  }

  function saveLocalState() {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[Costing] localStorage 저장 실패:", e);
    }
  }

  function persist(db) {
    saveLocalState();
    if (db) {
      db.collection("settings").doc("costingTable")
        .set({ state: state, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(function (err) {
          console.warn("[Costing] Firestore에 원가표 저장 실패 (localStorage에는 저장됨):", err);
        });
    }
  }

  function syncFromFirestore(db) {
    if (!db) return Promise.resolve();
    return db.collection("settings").doc("costingTable").get().then(function (doc) {
      if (doc.exists) {
        const remote = (doc.data() || {}).state;
        if (remote && typeof remote === "object") {
          state = remote;
          saveLocalState();
        }
      }
    }).catch(function (err) {
      console.warn("[Costing] Firestore에서 원가표 불러오기 실패, localStorage만 사용:", err);
    });
  }

  // ---- DOM rendering -------------------------------------------------------
  function fmt(n) {
    return (Math.round((n + Number.EPSILON) * 10000) / 10000).toString();
  }

  function fmtMoney(n) {
    return "$" + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  function numInput(value, onChangeAttr) {
    return '<input type="number" step="any" class="excel-cell" value="' + fmt(value) + '" onchange="' + onChangeAttr + '">';
  }

  window.switchCostingSubTab = function (name) {
    activeSubTab = name;
    render();
  };

  window.updateCostingLaborField = function (field, value) {
    state.labor[field] = parseFloat(value) || 0;
    persist(global.db);
    render();
  };

  window.updateCostingEquipField = function (which, field, value) {
    const target = which === "press" ? state.pressEquip : state.drillingEquip;
    target[field] = parseFloat(value) || 0;
    persist(global.db);
    render();
  };

  window.updateCostingMaterialField = function (field, value) {
    state.material[field] = parseFloat(value) || 0;
    persist(global.db);
    render();
  };

  window.updateCostingPanelRowField = function (idx, field, value) {
    const row = state.panelRows[idx];
    if (!row) return;
    if (field === "code" || field === "name" || field === "tankHeight") {
      row[field] = value;
    } else {
      row[field] = parseFloat(value) || 0;
    }
    persist(global.db);
    render();
  };

  window.addCostingPanelRow = function () {
    state.panelRows.push({
      code: "NEW" + (state.panelRows.length + 1), name: "신규 패널", tankHeight: "",
      wtKg: 0, gcWeightG: 0, pressingSec: 300, cTimeSec: 400,
      laborsPress: 2, drillQtyHr: 30, laborsDrill: 2
    });
    persist(global.db);
    render();
  };

  window.deleteCostingPanelRow = function (idx) {
    state.panelRows.splice(idx, 1);
    persist(global.db);
    render();
  };

  window.applyCostingRowToDb = function (idx) {
    applyRowsToDb([state.panelRows[idx]]);
  };

  window.applyAllCostingToDb = function () {
    applyRowsToDb(state.panelRows);
  };

  function applyRowsToDb(rows) {
    if (typeof global.partsDb === "undefined" || !Array.isArray(global.partsDb) || typeof global.updateDbField !== "function") {
      alert("마스터 DB(partsDb)가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const rates = currentRates();
    let updatedCount = 0;
    let codeCount = 0;
    rows.forEach(function (row) {
      if (!row.code) return;
      const cost = computeRow(row, rates).manufacturingCost;
      const upperCode = row.code.toUpperCase();
      let matched = false;
      global.partsDb.forEach(function (p, idx) {
        if (p && p.category === "PANEL" && p.partNo && p.partNo.toUpperCase().indexOf(upperCode) === 0) {
          global.updateDbField(idx, "price", cost.toFixed(2));
          updatedCount++;
          matched = true;
        }
      });
      if (matched) codeCount++;
    });
    if (typeof global.renderDbList === "function") global.renderDbList();
    alert(codeCount + "개 패널 코드, 총 " + updatedCount + "개 DB 항목의 단가가 반영되었습니다.");
    render();
  }

  function renderLaborTab() {
    const l = state.labor;
    const rate = computeLaborRatePerHr(l);
    return '' +
      '<div class="table-wrapper"><table class="bom-table"><thead><tr>' +
      '<th>근무시간</th><th>Hr/Day</th><th>일수/월</th></tr></thead><tbody>' +
      '<tr><td>Regular Time(평일)</td><td>' + numInput(l.weekdayHrDay, "updateCostingLaborField('weekdayHrDay',this.value)") + '</td><td>' + numInput(l.weekdayDaysMonth, "updateCostingLaborField('weekdayDaysMonth',this.value)") + '</td></tr>' +
      '<tr><td>Regular Time(토요일)</td><td>' + numInput(l.satHrDay, "updateCostingLaborField('satHrDay',this.value)") + '</td><td>' + numInput(l.satDaysMonth, "updateCostingLaborField('satDaysMonth',this.value)") + '</td></tr>' +
      '<tr><td>Overtime(OT, 시간/월)</td><td colspan="2">' + numInput(l.otHrMonth, "updateCostingLaborField('otHrMonth',this.value)") + '</td></tr>' +
      '<tr><td><b>합계 시간/월</b></td><td colspan="2"><b>' + fmt(laborMonthHours(l)) + ' hr</b></td></tr>' +
      '</tbody></table></div>' +
      '<div class="table-wrapper" style="margin-top:14px;"><table class="bom-table"><thead><tr>' +
      '<th>임금 항목</th><th>Cost/Year ($)</th></tr></thead><tbody>' +
      '<tr><td>직접 인건비 (Direct labor cost)</td><td>' + numInput(l.directLaborCostYr, "updateCostingLaborField('directLaborCostYr',this.value)") + '</td></tr>' +
      '<tr><td>유급휴가비 (Paid leave cost)</td><td>' + numInput(l.paidLeaveCostYr, "updateCostingLaborField('paidLeaveCostYr',this.value)") + '</td></tr>' +
      '<tr><td>복리후생비 (Other employee benefits)</td><td>' + numInput(l.otherBenefitsYr, "updateCostingLaborField('otherBenefitsYr',this.value)") + '</td></tr>' +
      '<tr><td>간접 노무비 (Indirect labor cost)</td><td>' + numInput(l.indirectLaborCostYr, "updateCostingLaborField('indirectLaborCostYr',this.value)") + '</td></tr>' +
      '<tr><td><b>직접노무비 / Hr (패널원가표에 사용됨)</b></td><td><b>' + fmtMoney(rate) + '</b></td></tr>' +
      '</tbody></table></div>';
  }

  function equipTable(which, e) {
    const rate = computeEquipRatePerHr(e);
    return '<div class="table-wrapper"><table class="bom-table"><thead><tr>' +
      '<th>항목</th><th>값</th></tr></thead><tbody>' +
      '<tr><td>고정비 / 월 (Fixed Expense/Month, $)</td><td>' + numInput(e.fixedExpenseMonth, "updateCostingEquipField('" + which + "','fixedExpenseMonth',this.value)") + '</td></tr>' +
      '<tr><td>변동비 / 시간 (Variable Expense/Hr, $)</td><td>' + numInput(e.variableExpenseHr, "updateCostingEquipField('" + which + "','variableExpenseHr',this.value)") + '</td></tr>' +
      '<tr><td>보일러비 / 시간 (Boiler Expense/Hr, $)</td><td>' + numInput(e.boilerExpenseHr, "updateCostingEquipField('" + which + "','boilerExpenseHr',this.value)") + '</td></tr>' +
      '<tr><td>가동 가능시간 / 월 (Planned Time Available/Month, hr)</td><td>' + numInput(e.plannedHrMonth, "updateCostingEquipField('" + which + "','plannedHrMonth',this.value)") + '</td></tr>' +
      '<tr><td><b>Total Expense / Hr (패널원가표에 사용됨)</b></td><td><b>' + fmtMoney(rate) + '</b></td></tr>' +
      '</tbody></table></div>';
  }

  function renderEquipTab() {
    return '' +
      '<h4 style="margin:6px 0;">프레스 설비 (Press Machine)</h4>' + equipTable("press", state.pressEquip) +
      '<h4 style="margin:16px 0 6px;">드릴 설비 (Drilling Machine)</h4>' + equipTable("drilling", state.drillingEquip) +
      '<h4 style="margin:16px 0 6px;">원자재 단가 (Raw Material Unit Price)</h4>' +
      '<div class="table-wrapper"><table class="bom-table"><thead><tr><th>항목</th><th>단가</th></tr></thead><tbody>' +
      '<tr><td>SMC 원자재 단가 ($/kg)</td><td>' + numInput(state.material.smcPerKg, "updateCostingMaterialField('smcPerKg',this.value)") + '</td></tr>' +
      '<tr><td>G/C(포장재) 단가 ($/g)</td><td>' + numInput(state.material.gcPerGram, "updateCostingMaterialField('gcPerGram',this.value)") + '</td></tr>' +
      '</tbody></table></div>';
  }

  function renderPanelTab() {
    const rates = currentRates();
    let rows = "";
    state.panelRows.forEach(function (row, idx) {
      const c = computeRow(row, rates);
      const matches = matchingDbCount(row.code);
      rows += '<tr>' +
        '<td><input type="text" class="excel-cell" value="' + (row.code || "") + '" onchange="updateCostingPanelRowField(' + idx + ',\'code\',this.value)" style="font-weight:700; width:80px;"></td>' +
        '<td><input type="text" class="excel-cell" value="' + (row.name || "") + '" onchange="updateCostingPanelRowField(' + idx + ',\'name\',this.value)"></td>' +
        '<td><input type="text" class="excel-cell" value="' + (row.tankHeight || "") + '" onchange="updateCostingPanelRowField(' + idx + ',\'tankHeight\',this.value)" style="width:60px;"></td>' +
        '<td>' + numInput(row.wtKg, "updateCostingPanelRowField(" + idx + ",'wtKg',this.value)") + '</td>' +
        '<td>' + numInput(row.gcWeightG, "updateCostingPanelRowField(" + idx + ",'gcWeightG',this.value)") + '</td>' +
        '<td>' + numInput(row.pressingSec, "updateCostingPanelRowField(" + idx + ",'pressingSec',this.value)") + '</td>' +
        '<td>' + numInput(row.cTimeSec, "updateCostingPanelRowField(" + idx + ",'cTimeSec',this.value)") + '</td>' +
        '<td>' + numInput(row.laborsPress, "updateCostingPanelRowField(" + idx + ",'laborsPress',this.value)") + '</td>' +
        '<td>' + numInput(row.drillQtyHr, "updateCostingPanelRowField(" + idx + ",'drillQtyHr',this.value)") + '</td>' +
        '<td>' + numInput(row.laborsDrill, "updateCostingPanelRowField(" + idx + ",'laborsDrill',this.value)") + '</td>' +
        '<td>' + fmtMoney(c.rawMaterialCost) + '</td>' +
        '<td>' + fmtMoney(c.pressCost) + '</td>' +
        '<td>' + fmtMoney(c.drillCost) + '</td>' +
        '<td><b>' + fmtMoney(c.manufacturingCost) + '</b></td>' +
        '<td align="center"><span class="badge">매칭 ' + matches + '건</span></td>' +
        '<td align="center" style="display:flex; gap:6px; justify-content:center;">' +
          '<i class="fa-solid fa-arrow-right-to-bracket action-icon" title="이 행만 DB 반영" onclick="applyCostingRowToDb(' + idx + ')" style="color:#0284c7; cursor:pointer; padding:6px;"></i>' +
          '<i class="fa-solid fa-trash-can action-icon" title="행 삭제" onclick="deleteCostingPanelRow(' + idx + ')" style="color:var(--neon-rose); cursor:pointer; padding:6px;"></i>' +
        '</td>' +
        '</tr>';
    });
    return '' +
      '<div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">' +
      '<button class="btn btn-primary" onclick="applyAllCostingToDb()"><i class="fa-solid fa-database"></i> 전체 DB 반영</button>' +
      '<button class="btn btn-outline" onclick="addCostingPanelRow()"><i class="fa-solid fa-plus"></i> 행 추가</button>' +
      '</div>' +
      '<div class="table-wrapper"><table class="bom-table"><thead><tr>' +
      '<th>코드</th><th>품명</th><th>탱크높이</th><th>WT(kg)</th><th>G/C(g)</th>' +
      '<th>Pressing(초)</th><th>C/Time(초)</th><th>인원(Press)</th><th>Drill수량/hr</th><th>인원(Drill)</th>' +
      '<th>원자재비</th><th>프레스가공비</th><th>드릴가공비</th><th>제조원가</th><th>DB매칭</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function subTabBtn(name, label) {
    const active = activeSubTab === name;
    return '<button type="button" class="bom-sub-btn' + (active ? ' active' : '') + '" onclick="switchCostingSubTab(\'' + name + '\')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; background: ' + (active ? '#ffffff' : 'transparent') + '; color: ' + (active ? '#0284c7' : '#64748b') + '; box-shadow: ' + (active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none') + '; white-space: nowrap;">' + label + '</button>';
  }

  function render() {
    const container = document.getElementById("costingContent");
    if (!container || !state) return;

    const nav = '<div style="display:flex; gap:6px; background:#f1f5f9; padding:4px; border-radius:8px; width:fit-content; margin-bottom:16px;">' +
      subTabBtn("labor", "인건비 (Labour Cost)") +
      subTabBtn("equipment", "설비비 (Equipment Cost)") +
      subTabBtn("panel", "패널 원가표 (Panel Cost Table)") +
      '</div>';

    let body = "";
    if (activeSubTab === "labor") body = renderLaborTab();
    else if (activeSubTab === "equipment") body = renderEquipTab();
    else body = renderPanelTab();

    container.innerHTML = nav + body;
  }

  // ---- Init -----------------------------------------------------------------
  function init(db) {
    state = loadLocalState() || JSON.parse(JSON.stringify(DEFAULT_STATE));
    // Backfill any panel rows added to SEED_PANEL_ROWS after a user already
    // has a saved state, without discarding the user's own edits/added rows.
    const knownCodes = {};
    state.panelRows.forEach(function (r) { knownCodes[(r.code || "").toUpperCase()] = true; });
    SEED_PANEL_ROWS.forEach(function (seed) {
      if (!knownCodes[seed.code]) state.panelRows.push(Object.assign({}, seed));
    });

    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-costing"]');
    if (tabBtn) tabBtn.addEventListener("click", render);

    syncFromFirestore(db).then(render);
  }

  global.CostingUI = { init: init, render: render };
})(window);
