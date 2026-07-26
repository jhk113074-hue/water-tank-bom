// =============================================================================
// WATANI GRP Water Tank -- Panel Costing Tab ("COSTING", 원가 계산)
// =============================================================================
// Re-implements the manufacturing-cost engine from the uploaded
// Panel_Costing_Table.xlsx (sheets: Panel_Cost_Table, LABOUR_Cost,
// Equipment Costs(Press_Machine), Equipment Costs(Drilling)) as an editable
// screen, so raw material / labor / equipment cost assumptions can be
// updated live instead of living only in a spreadsheet.
//
// Formula chain per panel row (mirrors the xlsx exactly, columns noted):
//   rawMaterialCost = wtKg * smcPerKg + gcWeightG * gcPerGram              (M)
//   pressCost = pressRatePerHr/(3600/cTimeSec) + (laborsPress*laborRatePerHr)/(3600/cTimeSec)   (W)
//   drillCost = drillRatePerHr/drillQtyPerHr    + (laborsDrill*laborRatePerHr)/drillQtyPerHr      (AD)
//   calcNonInsulatedCost = rawMaterialCost + pressCost + drillCost        (AE/AL/AN/AP -- "단판")
//   insulationRawCost = insulSkinKg*insulSkinPerKg + mdiKg*mdiPerKg + polyolKg*polyolPerKg  (AF+AG+AH)
//   insulationCostSum = insulationRawCost + insulationProcessingCost      (AJ, AI is "Processing")
//   calcInsulatedCost = calcNonInsulatedCost + insulationCostSum          (AM/AO/AQ -- "보온")
// Either final cost can be manually overridden per row (manualNonInsulatedCost/
// manualInsulatedCost); when set, the override wins over the formula above
// everywhere (display + "DB 반영").
//
// pressRatePerHr/drillRatePerHr are the AVERAGE Total Expense/Hr across all
// equipment entries of that type in `equipmentList` -- equipment (press or
// drilling machines) is a free-form list the user can add/edit/delete, each
// with its own purchase price + depreciation buildup (mirrors the xlsx
// Equipment Costs sheets' fixed/variable expense breakdown):
//   depreciationPerMonth = buyingPrice / depreciationYears / 12
//   repairMaintPerMonth  = depreciationPerMonth * repairMaintPct/100
//   electricityFixedPerMonth = contractedPowerKw * electricityRatePerKwh
//   fixedExpensePerMonth = depreciation + otherDepreciation + repairMaint + electricityFixed + otherExpense
//   variableExpensePerHr = (consumables + electricityVar + othersVar) / variableHrMonth
//   totalExpensePerHr = fixedExpensePerMonth/plannedHrMonth + variableExpensePerHr + boilerExpenseHr
// (plannedHrMonth and variableHrMonth are kept as two separate editable
// divisors, matching the xlsx original: each machine's own available hours
// for its fixed-cost allocation, vs. the pooled production hours the
// variable costs were actually budgeted against.)
//
// laborRatePerHr is computed from an editable working-time + wage-rate
// buildup table, also taken from the xlsx (LABOUR_Cost sheet).
//
// The xlsx's insulation block (Insulation Skin/MDI/POLYOL raw materials +
// insulation processing cost) was entirely blank in the uploaded file --
// there is no verified number to seed it with, so those fields default to
// 0 and are left for the user to fill in.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_costing_v2";

  // ---- Seed data extracted from Panel_Cost_Table (rows 4-27) ----------------
  // Insulation fields (insulSkinKg/mdiKg/polyolKg/insulationProcessingCost)
  // and manual overrides were blank in the xlsx for every row, so they all
  // default to 0 / null (= "use the calculated value").
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
  ].map(function (r) {
    return Object.assign({ insulSkinKg: 0, mdiKg: 0, polyolKg: 0, insulationProcessingCost: 0, manualNonInsulatedCost: null, manualInsulatedCost: null }, r);
  });

  const NEW_ROW_TEMPLATE = {
    code: "", name: "신규 패널", tankHeight: "",
    wtKg: 0, gcWeightG: 0, pressingSec: 300, cTimeSec: 400,
    laborsPress: 2, drillQtyHr: 30, laborsDrill: 2,
    insulSkinKg: 0, mdiKg: 0, polyolKg: 0, insulationProcessingCost: 0,
    manualNonInsulatedCost: null, manualInsulatedCost: null
  };

  const NEW_EQUIPMENT_TEMPLATE = {
    buyingPrice: 0, depreciationYears: 5, otherDepreciationMonth: 0, repairMaintPct: 20,
    contractedPowerKw: 0, electricityRatePerKwh: 0, otherExpenseMonth: 0,
    consumablesMonth: 0, electricityVarMonth: 0, othersVarMonth: 0,
    plannedHrMonth: 401.0133333333334, variableHrMonth: 401.0133333333334, boilerExpenseHr: 0
  };

  const DEFAULT_STATE = {
    material: {
      smcPerKg: 5,             // SMC 원자재 단가 ($/kg)
      gcPerGram: 1050 / 1050 / 180, // G/C(포장/부자재) 단가 ($/g)
      insulSkinPerKg: 0,        // 보온재 - Insulation Skin 단가 ($/kg, 엑셀 원본에 값 없음)
      mdiPerKg: 0,              // 보온재 - MDI 단가 ($/kg, 엑셀 원본에 값 없음)
      polyolPerKg: 0            // 보온재 - POLYOL 단가 ($/kg, 엑셀 원본에 값 없음)
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
    equipmentList: [
      Object.assign({ id: "press-default", name: "프레스기 (기본)", type: "press" }, NEW_EQUIPMENT_TEMPLATE, {
        buyingPrice: 300000, depreciationYears: 5, otherDepreciationMonth: 2000, repairMaintPct: 20,
        contractedPowerKw: 200, electricityRatePerKwh: 7, otherExpenseMonth: 2000,
        consumablesMonth: 500, electricityVarMonth: 15, othersVarMonth: 1000,
        plannedHrMonth: 401.0133333333334, variableHrMonth: 1296, boilerExpenseHr: 5
      }),
      Object.assign({ id: "drill-default", name: "드릴링기 (기본)", type: "drilling" }, NEW_EQUIPMENT_TEMPLATE, {
        buyingPrice: 100000, depreciationYears: 5, otherDepreciationMonth: 500, repairMaintPct: 20,
        contractedPowerKw: 10, electricityRatePerKwh: 7, otherExpenseMonth: 500,
        consumablesMonth: 0, electricityVarMonth: 1, othersVarMonth: 100,
        plannedHrMonth: 401.0133333333334, variableHrMonth: 432, boilerExpenseHr: 0
      })
    ],
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

  // Full purchase-price + depreciation buildup for one equipment entry.
  function computeEquipBuildup(e) {
    const depreciationMonth = e.depreciationYears ? (e.buyingPrice || 0) / e.depreciationYears / 12 : 0;
    const repairMaintMonth = depreciationMonth * ((e.repairMaintPct || 0) / 100);
    const electricityFixedMonth = (e.contractedPowerKw || 0) * (e.electricityRatePerKwh || 0);
    const fixedExpenseMonth = depreciationMonth + (e.otherDepreciationMonth || 0) + repairMaintMonth + electricityFixedMonth + (e.otherExpenseMonth || 0);
    const variableExpenseMonth = (e.consumablesMonth || 0) + (e.electricityVarMonth || 0) + (e.othersVarMonth || 0);
    const variableExpenseHr = e.variableHrMonth ? variableExpenseMonth / e.variableHrMonth : 0;
    const fixedExpenseHr = e.plannedHrMonth ? fixedExpenseMonth / e.plannedHrMonth : 0;
    const totalExpenseHr = fixedExpenseHr + variableExpenseHr + (e.boilerExpenseHr || 0);
    return {
      depreciationMonth: depreciationMonth, repairMaintMonth: repairMaintMonth,
      electricityFixedMonth: electricityFixedMonth, fixedExpenseMonth: fixedExpenseMonth,
      variableExpenseMonth: variableExpenseMonth, variableExpenseHr: variableExpenseHr,
      fixedExpenseHr: fixedExpenseHr, totalExpenseHr: totalExpenseHr
    };
  }

  // Pooled (average) Total Expense/Hr across all equipment of a given type.
  function pooledEquipRatePerHr(type) {
    const list = (state.equipmentList || []).filter(function (e) { return e.type === type; });
    if (!list.length) return 0;
    const sum = list.reduce(function (s, e) { return s + computeEquipBuildup(e).totalExpenseHr; }, 0);
    return sum / list.length;
  }

  function currentRates() {
    return {
      laborRatePerHr: computeLaborRatePerHr(state.labor),
      pressRatePerHr: pooledEquipRatePerHr("press"),
      drillRatePerHr: pooledEquipRatePerHr("drilling"),
      smcPerKg: state.material.smcPerKg,
      gcPerGram: state.material.gcPerGram,
      insulSkinPerKg: state.material.insulSkinPerKg,
      mdiPerKg: state.material.mdiPerKg,
      polyolPerKg: state.material.polyolPerKg
    };
  }

  function computeRow(row, rates) {
    const rawMaterialCost = (row.wtKg || 0) * rates.smcPerKg + (row.gcWeightG || 0) * rates.gcPerGram;
    const pressQtyHr = row.cTimeSec ? (3600 / row.cTimeSec) : 0;
    const pressCost = pressQtyHr ? (rates.pressRatePerHr / pressQtyHr) + ((row.laborsPress || 0) * rates.laborRatePerHr) / pressQtyHr : 0;
    const drillCost = row.drillQtyHr ? (rates.drillRatePerHr / row.drillQtyHr) + ((row.laborsDrill || 0) * rates.laborRatePerHr) / row.drillQtyHr : 0;
    const calcNonInsulatedCost = rawMaterialCost + pressCost + drillCost;

    const insulationRawCost = (row.insulSkinKg || 0) * rates.insulSkinPerKg + (row.mdiKg || 0) * rates.mdiPerKg + (row.polyolKg || 0) * rates.polyolPerKg;
    const insulationCostSum = insulationRawCost + (row.insulationProcessingCost || 0);
    const calcInsulatedCost = calcNonInsulatedCost + insulationCostSum;

    const hasManualNonInsulated = row.manualNonInsulatedCost !== null && row.manualNonInsulatedCost !== undefined && row.manualNonInsulatedCost !== "";
    const hasManualInsulated = row.manualInsulatedCost !== null && row.manualInsulatedCost !== undefined && row.manualInsulatedCost !== "";

    return {
      rawMaterialCost: rawMaterialCost,
      pressCost: pressCost,
      drillCost: drillCost,
      insulationRawCost: insulationRawCost,
      insulationCostSum: insulationCostSum,
      calcNonInsulatedCost: calcNonInsulatedCost,
      calcInsulatedCost: calcInsulatedCost,
      // Final values used everywhere (table display + DB 반영): manual
      // override wins over the formula when the user has typed one in.
      nonInsulatedCost: hasManualNonInsulated ? Number(row.manualNonInsulatedCost) : calcNonInsulatedCost,
      insulatedCost: hasManualInsulated ? Number(row.manualInsulatedCost) : calcInsulatedCost,
      isNonInsulatedManual: hasManualNonInsulated,
      isInsulatedManual: hasManualInsulated
    };
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

  // Fills in any fields introduced after a user already has a saved state
  // (localStorage or Firestore), without discarding their edits.
  function normalizeState() {
    state.material = Object.assign({}, DEFAULT_STATE.material, state.material);
    state.labor = Object.assign({}, DEFAULT_STATE.labor, state.labor);
    if (!Array.isArray(state.equipmentList) || !state.equipmentList.length) {
      state.equipmentList = JSON.parse(JSON.stringify(DEFAULT_STATE.equipmentList));
    } else {
      state.equipmentList = state.equipmentList.map(function (e) {
        return Object.assign({ id: "eq-" + Math.random().toString(36).slice(2) }, NEW_EQUIPMENT_TEMPLATE, e);
      });
    }
    if (!Array.isArray(state.panelRows)) state.panelRows = [];
    state.panelRows = state.panelRows.map(function (r) {
      return Object.assign({ insulSkinKg: 0, mdiKg: 0, polyolKg: 0, insulationProcessingCost: 0, manualNonInsulatedCost: null, manualInsulatedCost: null }, r);
    });
    const knownCodes = {};
    state.panelRows.forEach(function (r) { knownCodes[(r.code || "").toUpperCase()] = true; });
    SEED_PANEL_ROWS.forEach(function (seed) {
      if (!knownCodes[seed.code]) state.panelRows.push(Object.assign({}, seed));
    });
  }

  // ---- DOM rendering -------------------------------------------------------
  function fmt(n) {
    return (Math.round((n + Number.EPSILON) * 10000) / 10000).toString();
  }

  function fmtMoney(n) {
    return "$" + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  function numInput(value, onChangeAttr, extraStyle) {
    return '<input type="number" step="any" class="excel-cell" value="' + fmt(value) + '" onchange="' + onChangeAttr + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>';
  }

  function overrideInput(value, onChangeAttr) {
    const v = (value === null || value === undefined) ? "" : value;
    return '<input type="number" step="any" class="excel-cell" placeholder="자동계산" value="' + v + '" onchange="' + onChangeAttr + '" style="width:90px; border-color:#f59e0b;">';
  }

  function textInput(value, onChangeAttr, extraStyle) {
    return '<input type="text" class="excel-cell" value="' + (value || "") + '" onchange="' + onChangeAttr + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>';
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

  window.updateCostingMaterialField = function (field, value) {
    state.material[field] = parseFloat(value) || 0;
    persist(global.db);
    render();
  };

  window.updateCostingEquipmentField = function (id, field, value) {
    const eq = state.equipmentList.find(function (e) { return e.id === id; });
    if (!eq) return;
    if (field === "name" || field === "type") {
      eq[field] = value;
    } else {
      eq[field] = parseFloat(value) || 0;
    }
    persist(global.db);
    render();
  };

  window.addCostingEquipment = function (type) {
    state.equipmentList.push(Object.assign(
      { id: "eq-" + Date.now() + "-" + Math.floor(Math.random() * 1000), name: type === "press" ? "신규 프레스 설비" : "신규 드릴 설비", type: type },
      NEW_EQUIPMENT_TEMPLATE
    ));
    persist(global.db);
    render();
  };

  window.deleteCostingEquipment = function (id) {
    state.equipmentList = state.equipmentList.filter(function (e) { return e.id !== id; });
    persist(global.db);
    render();
  };

  window.updateCostingPanelRowField = function (idx, field, value) {
    const row = state.panelRows[idx];
    if (!row) return;
    if (field === "code" || field === "name" || field === "tankHeight") {
      row[field] = value;
    } else if (field === "manualNonInsulatedCost" || field === "manualInsulatedCost") {
      row[field] = (value === "" || value === null || value === undefined) ? null : (parseFloat(value));
    } else {
      row[field] = parseFloat(value) || 0;
    }
    persist(global.db);
    render();
  };

  window.addCostingPanelRow = function () {
    const row = Object.assign({}, NEW_ROW_TEMPLATE);
    row.code = "NEW" + (state.panelRows.length + 1);
    state.panelRows.push(row);
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
      const c = computeRow(row, rates);
      const upperCode = row.code.toUpperCase();
      let matched = false;
      global.partsDb.forEach(function (p, idx) {
        if (p && p.category === "PANEL" && p.partNo && p.partNo.toUpperCase().indexOf(upperCode) === 0) {
          global.updateDbField(idx, "price", c.nonInsulatedCost.toFixed(2));
          global.updateDbField(idx, "priceInsulated", c.insulatedCost.toFixed(2));
          updatedCount++;
          matched = true;
        }
      });
      if (matched) codeCount++;
    });
    if (typeof global.renderDbList === "function") global.renderDbList();
    alert(codeCount + "개 패널 코드, 총 " + updatedCount + "개 DB 항목에 단판/보온 단가가 반영되었습니다.");
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

  function renderMaterialTab() {
    const m = state.material;
    return '' +
      '<div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 10px; padding: 12px 16px; font-size: 12.5px; line-height: 1.5; color: #166534; margin-bottom: 14px;">' +
      '<i class="fa-solid fa-circle-info"></i> 모든 패널이 같은 원료를 사용하므로, 아래 단가는 <b>패널원가표의 모든 행에 공통으로</b> 적용됩니다. 보온재(Insulation Skin/MDI/POLYOL) 단가는 원본 엑셀에 값이 비어 있어 기본값 0으로 시작합니다 -- 실제 단가로 채워주세요.' +
      '</div>' +
      '<div class="table-wrapper"><table class="bom-table"><thead><tr><th>구분</th><th>항목</th><th>공통 단가</th></tr></thead><tbody>' +
      '<tr><td rowspan="2">주자재 (Main Material)</td><td>SMC 원자재 단가 ($/kg)</td><td>' + numInput(m.smcPerKg, "updateCostingMaterialField('smcPerKg',this.value)") + '</td></tr>' +
      '<tr><td>G/C(포장재) 단가 ($/g)</td><td>' + numInput(m.gcPerGram, "updateCostingMaterialField('gcPerGram',this.value)") + '</td></tr>' +
      '<tr><td rowspan="3">부자재 (보온재, Insulation)</td><td>Insulation Skin 단가 ($/kg)</td><td>' + numInput(m.insulSkinPerKg, "updateCostingMaterialField('insulSkinPerKg',this.value)") + '</td></tr>' +
      '<tr><td>MDI 단가 ($/kg)</td><td>' + numInput(m.mdiPerKg, "updateCostingMaterialField('mdiPerKg',this.value)") + '</td></tr>' +
      '<tr><td>POLYOL 단가 ($/kg)</td><td>' + numInput(m.polyolPerKg, "updateCostingMaterialField('polyolPerKg',this.value)") + '</td></tr>' +
      '</tbody></table></div>';
  }

  function renderEquipmentTab() {
    const pressRate = pooledEquipRatePerHr("press");
    const drillRate = pooledEquipRatePerHr("drilling");
    const list = state.equipmentList || [];

    let rows = "";
    list.forEach(function (e) {
      const b = computeEquipBuildup(e);
      rows += '<tr>' +
        '<td>' + (e.type === "press" ? '<span class="badge">프레스</span>' : '<span class="badge">드릴</span>') + '</td>' +
        '<td>' + textInput(e.name, "updateCostingEquipmentField('" + e.id + "','name',this.value)", "width:140px;") + '</td>' +
        '<td>' + numInput(e.buyingPrice, "updateCostingEquipmentField('" + e.id + "','buyingPrice',this.value)") + '</td>' +
        '<td>' + numInput(e.depreciationYears, "updateCostingEquipmentField('" + e.id + "','depreciationYears',this.value)", "width:60px;") + '</td>' +
        '<td>' + numInput(e.otherDepreciationMonth, "updateCostingEquipmentField('" + e.id + "','otherDepreciationMonth',this.value)") + '</td>' +
        '<td>' + numInput(e.repairMaintPct, "updateCostingEquipmentField('" + e.id + "','repairMaintPct',this.value)", "width:60px;") + '</td>' +
        '<td>' + numInput(e.contractedPowerKw, "updateCostingEquipmentField('" + e.id + "','contractedPowerKw',this.value)", "width:70px;") + '</td>' +
        '<td>' + numInput(e.electricityRatePerKwh, "updateCostingEquipmentField('" + e.id + "','electricityRatePerKwh',this.value)", "width:70px;") + '</td>' +
        '<td>' + numInput(e.otherExpenseMonth, "updateCostingEquipmentField('" + e.id + "','otherExpenseMonth',this.value)") + '</td>' +
        '<td>' + numInput(e.consumablesMonth, "updateCostingEquipmentField('" + e.id + "','consumablesMonth',this.value)") + '</td>' +
        '<td>' + numInput(e.electricityVarMonth, "updateCostingEquipmentField('" + e.id + "','electricityVarMonth',this.value)") + '</td>' +
        '<td>' + numInput(e.othersVarMonth, "updateCostingEquipmentField('" + e.id + "','othersVarMonth',this.value)") + '</td>' +
        '<td>' + numInput(e.plannedHrMonth, "updateCostingEquipmentField('" + e.id + "','plannedHrMonth',this.value)", "width:80px;") + '</td>' +
        '<td>' + numInput(e.variableHrMonth, "updateCostingEquipmentField('" + e.id + "','variableHrMonth',this.value)", "width:80px;") + '</td>' +
        '<td>' + numInput(e.boilerExpenseHr, "updateCostingEquipmentField('" + e.id + "','boilerExpenseHr',this.value)", "width:60px;") + '</td>' +
        '<td>' + fmtMoney(b.fixedExpenseMonth) + '</td>' +
        '<td>' + fmtMoney(b.variableExpenseHr) + '</td>' +
        '<td><b>' + fmtMoney(b.totalExpenseHr) + '</b></td>' +
        '<td align="center"><i class="fa-solid fa-trash-can action-icon" title="설비 삭제" onclick="deleteCostingEquipment(\'' + e.id + '\')" style="color:var(--neon-rose); cursor:pointer; padding:6px;"></i></td>' +
        '</tr>';
    });

    return '' +
      '<div style="display:flex; gap:16px; margin-bottom:14px; flex-wrap:wrap;">' +
      '<div class="badge">프레스 평균 Total/Hr: <b>' + fmtMoney(pressRate) + '</b></div>' +
      '<div class="badge">드릴 평균 Total/Hr: <b>' + fmtMoney(drillRate) + '</b></div>' +
      '</div>' +
      '<div style="background: #eef6ff; border: 1.5px solid #bcdcff; border-radius: 10px; padding: 12px 16px; font-size: 12.5px; line-height: 1.5; color: #1a4d80; margin-bottom: 14px;">' +
      '<i class="fa-solid fa-circle-info"></i> 설비를 여러 대 등록하면 같은 구분(프레스/드릴)의 <b>Total/Hr 평균값</b>이 패널원가표 전체에 공통으로 쓰입니다. 구매가·내용연수를 입력하면 감가상각비가 자동 반영됩니다.' +
      '</div>' +
      '<div style="display:flex; gap:8px; margin-bottom:10px;">' +
      '<button class="btn btn-outline" onclick="addCostingEquipment(\'press\')"><i class="fa-solid fa-plus"></i> 프레스 설비 추가</button>' +
      '<button class="btn btn-outline" onclick="addCostingEquipment(\'drilling\')"><i class="fa-solid fa-plus"></i> 드릴 설비 추가</button>' +
      '</div>' +
      '<div class="table-wrapper"><table class="bom-table"><thead><tr>' +
      '<th>구분</th><th>설비명</th><th>구매가($)</th><th>내용연수(yr)</th><th>기타감가상각/월</th><th>수리유지비(%)</th>' +
      '<th>계약전력(kW)</th><th>전기단가($/kWh)</th><th>기타비용/월</th>' +
      '<th>소모품비/월</th><th>전기변동비/월</th><th>기타변동비/월</th>' +
      '<th>고정비배분시간/월</th><th>변동비배분시간/월</th><th>보일러비/hr</th>' +
      '<th>고정비/월(계산)</th><th>변동비/hr(계산)</th><th>Total/hr(계산)</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
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
        '<td>' + overrideInput(row.manualNonInsulatedCost, "updateCostingPanelRowField(" + idx + ",'manualNonInsulatedCost',this.value)") + '</td>' +
        '<td><b>' + fmtMoney(c.nonInsulatedCost) + '</b>' + (c.isNonInsulatedManual ? ' <span class="badge" title="수동 조정값 사용 중">수동</span>' : '') + '</td>' +
        '<td>' + numInput(row.insulSkinKg, "updateCostingPanelRowField(" + idx + ",'insulSkinKg',this.value)") + '</td>' +
        '<td>' + numInput(row.mdiKg, "updateCostingPanelRowField(" + idx + ",'mdiKg',this.value)") + '</td>' +
        '<td>' + numInput(row.polyolKg, "updateCostingPanelRowField(" + idx + ",'polyolKg',this.value)") + '</td>' +
        '<td>' + numInput(row.insulationProcessingCost, "updateCostingPanelRowField(" + idx + ",'insulationProcessingCost',this.value)") + '</td>' +
        '<td>' + fmtMoney(c.insulationCostSum) + '</td>' +
        '<td>' + overrideInput(row.manualInsulatedCost, "updateCostingPanelRowField(" + idx + ",'manualInsulatedCost',this.value)") + '</td>' +
        '<td><b>' + fmtMoney(c.insulatedCost) + '</b>' + (c.isInsulatedManual ? ' <span class="badge" title="수동 조정값 사용 중">수동</span>' : '') + '</td>' +
        '<td align="center"><span class="badge">매칭 ' + matches + '건</span></td>' +
        '<td align="center" style="display:flex; gap:6px; justify-content:center;">' +
          '<i class="fa-solid fa-arrow-right-to-bracket action-icon" title="이 행만 DB 반영" onclick="applyCostingRowToDb(' + idx + ')" style="color:#0284c7; cursor:pointer; padding:6px;"></i>' +
          '<i class="fa-solid fa-trash-can action-icon" title="행 삭제" onclick="deleteCostingPanelRow(' + idx + ')" style="color:var(--neon-rose); cursor:pointer; padding:6px;"></i>' +
        '</td>' +
        '</tr>';
    });
    return '' +
      '<div style="background: #fff8e1; border: 1.5px solid #f0c419; border-radius: 10px; padding: 12px 16px; font-size: 12.5px; line-height: 1.5; color: #6b5300; margin-bottom: 14px;">' +
      '<i class="fa-solid fa-triangle-exclamation"></i> "단판원가(수동)"/"보온원가(수동)" 칸에 값을 입력하면 자동 계산 대신 그 값이 최종 원가로 사용됩니다(주황 테두리). 비워두면 다시 자동 계산됩니다.' +
      '</div>' +
      '<div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">' +
      '<button class="btn btn-primary" onclick="applyAllCostingToDb()"><i class="fa-solid fa-database"></i> 전체 DB 반영 (단판+보온)</button>' +
      '<button class="btn btn-outline" onclick="addCostingPanelRow()"><i class="fa-solid fa-plus"></i> 행 추가</button>' +
      '</div>' +
      '<div class="table-wrapper"><table class="bom-table"><thead><tr>' +
      '<th>코드</th><th>품명</th><th>탱크높이</th><th>WT(kg)</th><th>G/C(g)</th>' +
      '<th>Pressing(초)</th><th>C/Time(초)</th><th>인원(Press)</th><th>Drill수량/hr</th><th>인원(Drill)</th>' +
      '<th>원자재비</th><th>프레스가공비</th><th>드릴가공비</th><th>단판원가(수동)</th><th>단판원가</th>' +
      '<th>보온Skin(kg)</th><th>MDI(kg)</th><th>POLYOL(kg)</th><th>보온가공비</th><th>보온원가합계</th><th>보온원가(수동)</th><th>보온원가</th>' +
      '<th>DB매칭</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function subTabBtn(name, label) {
    const active = activeSubTab === name;
    return '<button type="button" class="bom-sub-btn' + (active ? ' active' : '') + '" onclick="switchCostingSubTab(\'' + name + '\')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; background: ' + (active ? '#ffffff' : 'transparent') + '; color: ' + (active ? '#0284c7' : '#64748b') + '; box-shadow: ' + (active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none') + '; white-space: nowrap;">' + label + '</button>';
  }

  function render() {
    const container = document.getElementById("costingContent");
    if (!container || !state) return;

    const nav = '<div style="display:flex; gap:6px; background:#f1f5f9; padding:4px; border-radius:8px; width:fit-content; margin-bottom:16px; flex-wrap:wrap;">' +
      subTabBtn("labor", "인건비 (Labour Cost)") +
      subTabBtn("equipment", "설비비 (Equipment Cost)") +
      subTabBtn("material", "원자재비 (Material Cost)") +
      subTabBtn("panel", "패널 원가표 (Panel Cost Table)") +
      '</div>';

    let body = "";
    if (activeSubTab === "labor") body = renderLaborTab();
    else if (activeSubTab === "equipment") body = renderEquipmentTab();
    else if (activeSubTab === "material") body = renderMaterialTab();
    else body = renderPanelTab();

    container.innerHTML = nav + body;
  }

  // ---- Init -----------------------------------------------------------------
  function init(db) {
    state = loadLocalState() || JSON.parse(JSON.stringify(DEFAULT_STATE));
    normalizeState();

    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-costing"]');
    if (tabBtn) tabBtn.addEventListener("click", render);

    syncFromFirestore(db).then(function () {
      normalizeState();
      render();
    });
  }

  global.CostingUI = { init: init, render: render };
})(window);
