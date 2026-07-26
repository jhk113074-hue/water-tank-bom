/**
 * costing.js - Panel Costing & Master DB Propagation Module (Pass 2)
 * Features:
 * 1. Common Raw Material Prices (SMC, G/C, Insulation Skin/MDI/POLYOL)
 * 2. Equipment Management with Buying Price & Depreciation calculation
 * 3. Manual Override for Single Panel & Insulated Panel Costs
 * 4. Insulation Costing & Integration with BASIC_TOOL Insulation setting
 */

(function(global) {
  "use strict";

  // Common Raw Materials Defaults
  const defaultRawMaterials = {
    smcPerKg: 5.00,
    gcPerKg: 0.05,
    insSkinPerSqm: 1.00,
    insMdiPerKg: 3.50,
    insPolyolPerKg: 3.50
  };

  let rawMaterials = JSON.parse(localStorage.getItem("water_tank_costing_materials") || "null") || defaultRawMaterials;

  // Equipment List Defaults
  const defaultEquipmentList = [
    { type: "PRESS", name: "1500 TON Press", buyPrice: 300000, lifeYears: 5, fixedMonth: 11400, varHour: 1.169, boilerHour: 5.00 },
    { type: "PRESS", name: "1200 TON Press", buyPrice: 250000, lifeYears: 5, fixedMonth: 9500, varHour: 1.169, boilerHour: 5.00 },
    { type: "PRESS", name: "800 TON Press A", buyPrice: 180000, lifeYears: 5, fixedMonth: 7000, varHour: 1.169, boilerHour: 5.00 },
    { type: "PRESS", name: "800 TON Press B", buyPrice: 180000, lifeYears: 5, fixedMonth: 7000, varHour: 1.169, boilerHour: 5.00 },
    { type: "DRILL", name: "Drilling Machine 1", buyPrice: 100000, lifeYears: 5, fixedMonth: 3070, varHour: 0.234, boilerHour: 0.00 }
  ];

  let equipmentList = JSON.parse(localStorage.getItem("water_tank_costing_equipment") || "null") || defaultEquipmentList;

  // 24 Standard Base Panel Codes Data with Insulation
  const defaultPanelCostData = [
    { code: "MF00", desc: "Manhole (1m x 1m)", weight: 13.0, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF10", desc: "Bottom (1m x 1m)", weight: 15.1, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF20", desc: "Bottom (1m x 1m)", weight: 18.5, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.4, insPolyol: 1.4, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF30", desc: "Bottom (1m x 1m)", weight: 21.0, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.6, insPolyol: 1.6, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF40", desc: "Bottom (1m x 1m)", weight: 26.5, subMatCost: 1.32, pressSec: 420, drillSec: 30, insSkin: 1.0, insMdi: 2.0, insPolyol: 2.0, insLabor: 4.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "NF10", desc: "Drain (1m x 1m)", weight: 15.1, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "NF15", desc: "Drain (1m x 1m)", weight: 16.5, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.3, insPolyol: 1.3, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "NF20", desc: "Drain (1m x 1m)", weight: 18.5, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.4, insPolyol: 1.4, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "NF30", desc: "Drain (1m x 1m)", weight: 21.0, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.6, insPolyol: 1.6, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "NF40", desc: "Drain (1m x 1m)", weight: 26.5, subMatCost: 1.32, pressSec: 420, drillSec: 30, insSkin: 1.0, insMdi: 2.0, insPolyol: 2.0, insLabor: 4.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "RF00", desc: "Roof (1m x 1m)", weight: 10.5, subMatCost: 1.32, pressSec: 300, drillSec: 30, insSkin: 1.0, insMdi: 1.0, insPolyol: 1.0, insLabor: 3.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SF10", desc: "Side (1m x 1m)", weight: 12.6, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.1, insPolyol: 1.1, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SF15", desc: "Side (1m x 1m)", weight: 14.0, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SF20", desc: "Side (1m x 1m)", weight: 15.1, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SF25", desc: "Side (1m x 1m)", weight: 18.5, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.4, insPolyol: 1.4, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SF30", desc: "Side (1m x 1m)", weight: 21.0, subMatCost: 1.32, pressSec: 360, drillSec: 30, insSkin: 1.0, insMdi: 1.6, insPolyol: 1.6, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SF40", desc: "Side (1m x 1m)", weight: 26.5, subMatCost: 1.32, pressSec: 420, drillSec: 30, insSkin: 1.0, insMdi: 2.0, insPolyol: 2.0, insLabor: 4.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "PF10", desc: "Partition (0.93x1m)", weight: 12.6, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 0.93, insMdi: 1.1, insPolyol: 1.1, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "PF20", desc: "Partition (0.93x1m)", weight: 15.1, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 0.93, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "PF30", desc: "Partition (0.93x1m)", weight: 18.5, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 0.93, insMdi: 1.4, insPolyol: 1.4, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "PF40", desc: "Partition (0.93x1m)", weight: 21.0, subMatCost: 1.32, pressSec: 570, drillSec: 30, insSkin: 0.93, insMdi: 1.6, insPolyol: 1.6, insLabor: 4.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "SL15", desc: "Side (1m x 1.5m)", weight: 19.3, subMatCost: 1.90, pressSec: 300, drillSec: 30, insSkin: 1.5, insMdi: 1.8, insPolyol: 1.8, insLabor: 4.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "ST20", desc: "Side (1m x 2.0m)", weight: 29.0, subMatCost: 4.94, pressSec: 300, drillSec: 30, insSkin: 2.0, insMdi: 2.4, insPolyol: 2.4, insLabor: 5.50, overrideSinglePrice: null, overrideInsulatedPrice: null }
  ];

  let panelCostRows = JSON.parse(localStorage.getItem("water_tank_costing_panels") || "null") || defaultPanelCostData;

  function switchCostingSubTab(tabName) {
    document.querySelectorAll(".costing-subtab-btn").forEach(btn => {
      btn.style.background = "#f1f5f9";
      btn.style.color = "#475569";
    });
    document.querySelectorAll(".costing-subtab-content").forEach(content => {
      content.style.display = "none";
    });

    const activeBtn = document.getElementById(`costSubTabBtn-${tabName}`);
    const activeContent = document.getElementById(`costSubTab-${tabName}`);
    if (activeBtn) {
      activeBtn.style.background = "#0284c7";
      activeBtn.style.color = "#ffffff";
    }
    if (activeContent) {
      activeContent.style.display = "block";
    }

    if (tabName === "equipment") {
      renderEquipmentTable();
    } else if (tabName === "panels") {
      renderCostingPanelTable();
    }
  }

  function getVal(id, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return defaultVal;
    const v = parseFloat(el.value);
    return isNaN(v) ? defaultVal : v;
  }

  function onGcPartSelected(partNo) {
    if (!partNo) return;
    const partsDb = window.partsDb || [];
    const match = partsDb.find(p => p.partNo === partNo);
    const infoDisplay = document.getElementById("costGcPartInfoDisplay");
    const gcPriceInput = document.getElementById("costMatGcPrice");
    if (match) {
      if (infoDisplay) {
        infoDisplay.innerHTML = `<i class="fa-solid fa-circle-info"></i> PART_ID_TABLE 연동 단위중량: <b>${match.weight} kg (${Math.round(match.weight * 1000)}g)</b> (${match.spec || match.nameKo})`;
      }
      if (gcPriceInput && (match.price != null && match.price > 0)) {
        gcPriceInput.value = match.price;
      }
      rawMaterials.selectedGcPartNo = partNo;
      rawMaterials.gcPartWeight = match.weight;
      localStorage.setItem("water_tank_costing_materials", JSON.stringify(rawMaterials));
    }
  }

  function syncRawMaterialsFromInputs() {
    rawMaterials.smcPerKg = getVal("costMatSmcPrice", 5.00);
    rawMaterials.gcPerKg = getVal("costMatGcPrice", 0.05);
    rawMaterials.insSkinPerSqm = getVal("costMatInsSkinPrice", 1.00);
    rawMaterials.insMdiPerKg = getVal("costMatInsMdiPrice", 3.50);
    rawMaterials.insPolyolPerKg = getVal("costMatInsPolyolPrice", 3.50);

    const gcSelect = document.getElementById("costMatGcPartSelect");
    if (gcSelect && gcSelect.value) {
      rawMaterials.selectedGcPartNo = gcSelect.value;
    }

    localStorage.setItem("water_tank_costing_materials", JSON.stringify(rawMaterials));
  }

  function calcCostingSummary() {
    syncRawMaterialsFromInputs();

    // 1. Working Hours & Labor Rates
    const weekdays = getVal("costWorkHoursWeekdays", 160);
    const saturday = getVal("costWorkHoursSaturday", 16);
    const overtime = getVal("costWorkHoursOvertime", 70);
    const totalWorkingHours = weekdays + saturday + overtime;

    const totalHoursEl = document.getElementById("costTotalWorkingHoursDisplay");
    if (totalHoursEl) totalHoursEl.textContent = `${totalWorkingHours} 시간/월`;

    const directLaborYear = getVal("costDirectLaborYear", 12000);
    const paidLeaveYear = getVal("costPaidLeaveYear", 1000);
    const benefitsYear = getVal("costBenefitsYear", 1200);
    const indirectLaborYear = getVal("costIndirectLaborYear", 7100);

    const totalDirectYear = directLaborYear + paidLeaveYear + benefitsYear + indirectLaborYear;
    const directLaborRate = totalWorkingHours > 0 ? (totalDirectYear / 12 / totalWorkingHours) : 7.2154;
    const indirectLaborRate = totalWorkingHours > 0 ? ((directLaborYear + paidLeaveYear + benefitsYear) / 12 / totalWorkingHours) : 4.8103;

    const symbol = typeof window.getSystemCurrencySymbol === "function" ? window.getSystemCurrencySymbol() : "$";

    const directRateEl = document.getElementById("costDirectLaborRateDisplay");
    const indirectRateEl = document.getElementById("costIndirectLaborRateDisplay");
    if (directRateEl) directRateEl.textContent = `${symbol}${directLaborRate.toFixed(3)} / HR`;
    if (indirectRateEl) indirectRateEl.textContent = `${symbol}${indirectLaborRate.toFixed(3)} / HR`;

    // 2. Equipment Rates calculation (Average for Press and Drill)
    const pressPlannedHours = getVal("costPressPlannedHoursMonth", 401.01);
    let pressTotalRatesSum = 0;
    let pressCount = 0;
    let drillTotalRatesSum = 0;
    let drillCount = 0;

    equipmentList.forEach(eq => {
      const fixedRate = pressPlannedHours > 0 ? (eq.fixedMonth / pressPlannedHours) : 0;
      const rate = fixedRate + (eq.varHour || 0) + (eq.boilerHour || 0);
      if (eq.type === "PRESS") {
        pressTotalRatesSum += rate;
        pressCount++;
      } else if (eq.type === "DRILL") {
        drillTotalRatesSum += rate;
        drillCount++;
      }
    });

    const avgPressRate = pressCount > 0 ? (pressTotalRatesSum / pressCount) : 34.597;
    const avgDrillRate = drillCount > 0 ? (drillTotalRatesSum / drillCount) : 7.889;

    const pressTotalEl = document.getElementById("costPressTotalRateDisplay");
    if (pressTotalEl) pressTotalEl.textContent = `${symbol}${avgPressRate.toFixed(3)} / HR (평균)`;

    const drillTotalEl = document.getElementById("costDrillTotalRateDisplay");
    if (drillTotalEl) drillTotalEl.textContent = `${symbol}${avgDrillRate.toFixed(3)} / HR (평균)`;

    return {
      directLaborRate,
      pressTotalRate: avgPressRate,
      drillTotalRate: avgDrillRate
    };
  }

  function renderEquipmentTable() {
    const tbody = document.getElementById("costingEquipmentTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const pressPlannedHours = getVal("costPressPlannedHoursMonth", 401.01);
    const symbol = typeof window.getSystemCurrencySymbol === "function" ? window.getSystemCurrencySymbol() : "$";

    equipmentList.forEach((eq, idx) => {
      const fixedDeprMonth = (eq.buyPrice && eq.lifeYears) ? (eq.buyPrice / (eq.lifeYears * 12)) : 0;
      const fixedRate = pressPlannedHours > 0 ? (eq.fixedMonth / pressPlannedHours) : 0;
      const hourlyRate = fixedRate + (eq.varHour || 0) + (eq.boilerHour || 0);

      tbody.innerHTML += `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <select onchange="window.updateEquipmentRow(${idx}, 'type', this.value)" style="padding:2px 4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;">
              <option value="PRESS" ${eq.type === "PRESS" ? "selected" : ""}>프레스 (PRESS)</option>
              <option value="DRILL" ${eq.type === "DRILL" ? "selected" : ""}>드릴링 (DRILL)</option>
            </select>
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="text" value="${eq.name}" onchange="window.updateEquipmentRow(${idx}, 'name', this.value)" style="width:110px; font-weight:bold; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" value="${eq.buyPrice}" onchange="window.updateEquipmentRow(${idx}, 'buyPrice', parseFloat(this.value))" style="width:75px; text-align:right; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" value="${eq.lifeYears}" onchange="window.updateEquipmentRow(${idx}, 'lifeYears', parseFloat(this.value))" style="width:45px; text-align:right; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; font-size:11px; color:#64748b;">
            ${symbol}${fixedDeprMonth.toFixed(0)}/월
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" value="${eq.fixedMonth}" onchange="window.updateEquipmentRow(${idx}, 'fixedMonth', parseFloat(this.value))" style="width:75px; text-align:right; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${eq.varHour}" onchange="window.updateEquipmentRow(${idx}, 'varHour', parseFloat(this.value))" style="width:60px; text-align:right; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${eq.boilerHour}" onchange="window.updateEquipmentRow(${idx}, 'boilerHour', parseFloat(this.value))" style="width:60px; text-align:right; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; font-weight:bold; color:#7c3aed; font-size:11.5px;">
            ${symbol}${hourlyRate.toFixed(2)}/HR
          </td>
          <td style="padding:6px;">
            <button type="button" onclick="window.deleteEquipmentRow(${idx})" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:2px 5px; border-radius:4px; font-size:10px; cursor:pointer;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

    localStorage.setItem("water_tank_costing_equipment", JSON.stringify(equipmentList));
  }

  function updateEquipmentRow(idx, field, val) {
    if (equipmentList[idx]) {
      equipmentList[idx][field] = val;
      calcCostingSummary();
      renderEquipmentTable();
      renderCostingPanelTable();
    }
  }

  function addEquipmentRow() {
    equipmentList.push({
      type: "PRESS",
      name: "New Machine",
      buyPrice: 150000,
      lifeYears: 5,
      fixedMonth: 6000,
      varHour: 1.169,
      boilerHour: 5.00
    });
    calcCostingSummary();
    renderEquipmentTable();
    renderCostingPanelTable();
  }

  function deleteEquipmentRow(idx) {
    if (confirm("Are you sure you want to delete this equipment?")) {
      equipmentList.splice(idx, 1);
      calcCostingSummary();
      renderEquipmentTable();
      renderCostingPanelTable();
    }
  }

  function renderCostingPanelTable() {
    const tbody = document.getElementById("costingPanelTableBody");
    if (!tbody) return;

    const symbol = typeof window.getSystemCurrencySymbol === "function" ? window.getSystemCurrencySymbol() : "$";
    const rates = calcCostingSummary();
    const directLaborRate = rates.directLaborRate;
    const pressRate = rates.pressTotalRate;
    const drillRate = rates.drillTotalRate;
    const partsDb = window.partsDb || [];
    const gcDbItems = partsDb.filter(p => p && p.partNo && (p.partNo.startsWith("GC-") || (p.nameKo && p.nameKo.includes("Glass Cloth")) || (p.nameEn && p.nameEn.includes("Glass Cloth"))));
    
    const defaultGcCodes = [
      { partNo: "GC-1150-160", name: "GC-1150-160 (160g)" },
      { partNo: "GC-1150-200", name: "GC-1150-200 (200g)" },
      { partNo: "GC-1200-200", name: "GC-1200-200 (200g)" },
      { partNo: "GC-1650-160", name: "GC-1650-160 (160g)" },
      { partNo: "GC-2150-160", name: "GC-2150-160 (200g)" }
    ];

    tbody.innerHTML = "";

    panelCostRows.forEach((row, idx) => {
      let currentGcPartNo = row.gcPartNo;
      if (currentGcPartNo === undefined) {
        currentGcPartNo = (row.code === "SL15") ? "GC-1650-160" : (row.code === "ST20") ? "GC-2150-160" : "GC-1150-160";
      }

      let gcOptionsHtml = `<option value="NONE" ${currentGcPartNo === "NONE" ? "selected" : ""}>-- Unused (NONE) --</option>`;
      const addedCodes = new Set(["NONE"]);

      defaultGcCodes.forEach(def => {
        addedCodes.add(def.partNo);
        const matchDb = partsDb.find(p => p.partNo === def.partNo);
        const weightText = matchDb ? `${Math.round(matchDb.weight * 1000)}g` : "";
        const label = matchDb ? `${def.partNo} (${weightText})` : def.name;
        gcOptionsHtml += `<option value="${def.partNo}" ${currentGcPartNo === def.partNo ? "selected" : ""}>${label}</option>`;
      });

      gcDbItems.forEach(dbItem => {
        if (!addedCodes.has(dbItem.partNo)) {
          addedCodes.add(dbItem.partNo);
          gcOptionsHtml += `<option value="${dbItem.partNo}" ${currentGcPartNo === dbItem.partNo ? "selected" : ""}>${dbItem.partNo} (${dbItem.nameEn || dbItem.nameKo})</option>`;
        }
      });

      const weight = row.weight || 0;
      const smcPrice = rawMaterials.smcPerKg || 5.00;
      const subMat = row.subMatCost || 1.32;
      const rawMaterialCost = (weight * smcPrice) + subMat;

      const pressSec = row.pressSec || 300;
      const drillSec = row.drillSec || 30;

      const pressHours = pressSec / 3600;
      const pressCost = pressHours * pressRate;
      const pressLaborCost = (pressHours * 2) * directLaborRate;

      const drillHours = drillSec / 3600;
      const drillCost = drillHours * drillRate;
      const drillLaborCost = (drillHours * 2) * directLaborRate;

      const processingCost = pressCost + pressLaborCost + drillCost + drillLaborCost;
      const calculatedSinglePrice = rawMaterialCost + processingCost;

      // Insulation calculation
      // Insulation 25mm calculation
      const insSkin = row.insSkin || 1.0;
      const insMdi = row.insMdi || 1.2;
      const insPolyol = row.insPolyol || 1.2;
      const insLabor = row.insLabor || 3.50;

      const insMatCost25 = (insSkin * rawMaterials.insSkinPerSqm) + (insMdi * rawMaterials.insMdiPerKg) + (insPolyol * rawMaterials.insPolyolPerKg);
      const calculatedIns25Price = calculatedSinglePrice + insMatCost25 + insLabor;

      // Insulation 40mm calculation
      const ins40Skin = row.ins40Skin || insSkin;
      const ins40Mdi = row.ins40Mdi || Math.round((insMdi * 1.6) * 10) / 10;
      const ins40Polyol = row.ins40Polyol || Math.round((insPolyol * 1.6) * 10) / 10;
      const ins40Labor = row.ins40Labor || Math.round((insLabor * 1.25) * 100) / 100;

      const insMatCost40 = (ins40Skin * rawMaterials.insSkinPerSqm) + (ins40Mdi * rawMaterials.insMdiPerKg) + (ins40Polyol * rawMaterials.insPolyolPerKg);
      const calculatedIns40Price = calculatedSinglePrice + insMatCost40 + ins40Labor;

      const finalSinglePrice = row.overrideSinglePrice != null && row.overrideSinglePrice !== "" ? parseFloat(row.overrideSinglePrice) : parseFloat(calculatedSinglePrice.toFixed(2));
      const finalIns25Price = row.overrideIns25Price != null && row.overrideIns25Price !== "" ? parseFloat(row.overrideIns25Price) : (row.overrideInsulatedPrice != null && row.overrideInsulatedPrice !== "" ? parseFloat(row.overrideInsulatedPrice) : parseFloat(calculatedIns25Price.toFixed(2)));
      const finalIns40Price = row.overrideIns40Price != null && row.overrideIns40Price !== "" ? parseFloat(row.overrideIns40Price) : parseFloat(calculatedIns40Price.toFixed(2));

      row.finalSinglePrice = finalSinglePrice;
      row.finalIns25Price = finalIns25Price;
      row.finalInsulatedPrice = finalIns25Price;
      row.finalIns40Price = finalIns40Price;

      tbody.innerHTML += `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:bold; color:#0284c7; border-right:1px solid #e2e8f0;">
            <input type="text" value="${row.code}" onchange="window.updateCostingPanelRow(${idx}, 'code', this.value)" style="width:65px; text-align:center; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px; padding:2px;">
          </td>
          <td style="padding:6px; text-align:left; border-right:1px solid #e2e8f0;">
            <input type="text" value="${row.desc}" onchange="window.updateCostingPanelRow(${idx}, 'desc', this.value)" style="width:120px; border:1px solid #cbd5e1; border-radius:4px; padding:2px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${weight}" onchange="window.updateCostingPanelRow(${idx}, 'weight', parseFloat(this.value))" style="width:55px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:2px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#f0f9ff;">
            <select onchange="window.updateCostingPanelRow(${idx}, 'gcPartNo', this.value)" style="width:135px; font-size:11px; font-weight:700; border:1px solid #cbd5e1; border-radius:4px; padding:2px; color:${currentGcPartNo === 'NONE' ? '#94a3b8' : '#0369a1'}; background:#ffffff; outline:none;" title="Glass Cloth Part No used for this panel moulding">
              ${gcOptionsHtml}
            </select>
          </td>
          <td style="padding:6px; font-weight:600; border-right:1px solid #e2e8f0;">${symbol}${processingCost.toFixed(2)}</td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#f0f9ff;">
            <input type="number" step="any" placeholder="${symbol}${calculatedSinglePrice.toFixed(2)}" value="${row.overrideSinglePrice != null ? row.overrideSinglePrice : ""}" onchange="window.updateCostingPanelRow(${idx}, 'overrideSinglePrice', this.value === '' ? null : parseFloat(this.value))" style="width:70px; text-align:right; font-weight:800; color:#0284c7; border:1px solid #0284c7; border-radius:4px; padding:2px;" title="Manual Single Price Override">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${insSkin}" onchange="window.updateCostingPanelRow(${idx}, 'insSkin', parseFloat(this.value))" style="width:40px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:2px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${insMdi}" onchange="window.updateCostingPanelRow(${idx}, 'insMdi', parseFloat(this.value))" style="width:40px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:2px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${insPolyol}" onchange="window.updateCostingPanelRow(${idx}, 'insPolyol', parseFloat(this.value))" style="width:40px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:2px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#fdf2f8;">
            <input type="number" step="any" placeholder="${symbol}${calculatedIns25Price.toFixed(2)}" value="${row.overrideIns25Price != null ? row.overrideIns25Price : (row.overrideInsulatedPrice != null ? row.overrideInsulatedPrice : "")}" onchange="window.updateCostingPanelRow(${idx}, 'overrideIns25Price', this.value === '' ? null : parseFloat(this.value))" style="width:70px; text-align:right; font-weight:800; color:#be185d; border:1px solid #be185d; border-radius:4px; padding:2px;" title="Manual Insulated 25mm Price Override">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#fff7ed;">
            <input type="number" step="any" placeholder="${symbol}${calculatedIns40Price.toFixed(2)}" value="${row.overrideIns40Price != null ? row.overrideIns40Price : ""}" onchange="window.updateCostingPanelRow(${idx}, 'overrideIns40Price', this.value === '' ? null : parseFloat(this.value))" style="width:70px; text-align:right; font-weight:800; color:#c2410c; border:1px solid #ea580c; border-radius:4px; padding:2px;" title="Manual Insulated 40mm Price Override">
          </td>
          <td style="padding:6px; font-weight:800; color:#059669; border-right:1px solid #e2e8f0; font-size:11px;">
            ${symbol}${finalIns25Price.toFixed(2)} / ${symbol}${finalIns40Price.toFixed(2)}
          </td>
          <td style="padding:6px;">
            <button type="button" onclick="window.deleteCostingPanelRow(${idx})" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:2px 5px; border-radius:4px; font-size:10px; cursor:pointer;" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

    localStorage.setItem("water_tank_costing_panels", JSON.stringify(panelCostRows));
  }

  function updateCostingPanelRow(index, field, val) {
    if (panelCostRows[index]) {
      panelCostRows[index][field] = val;
      renderCostingPanelTable();
    }
  }

  function addCostingPanelRow() {
    panelCostRows.push({
      code: "NEW01",
      desc: "New Panel (1m x 1m)",
      weight: 15.0,
      subMatCost: 1.32,
      pressSec: 330,
      drillSec: 30,
      insSkin: 1.0,
      insMdi: 1.2,
      insPolyol: 1.2,
      insLabor: 3.50,
      ins40Skin: 1.0,
      ins40Mdi: 1.9,
      ins40Polyol: 1.9,
      ins40Labor: 4.50,
      overrideSinglePrice: null,
      overrideIns25Price: null,
      overrideIns40Price: null
    });
    renderCostingPanelTable();
  }

  function deleteCostingPanelRow(index) {
    if (confirm("Are you sure you want to delete this panel costing row?")) {
      panelCostRows.splice(index, 1);
      renderCostingPanelTable();
    }
  }

  function applyCostingToMasterDb() {
    renderCostingPanelTable(); // Recalculate
    if (!window.partsDb || !Array.isArray(window.partsDb)) {
      alert("Master DB is not ready.");
      return;
    }

    let updatedCount = 0;
    const singleCostMap = {};
    const ins25CostMap = {};
    const ins40CostMap = {};

    panelCostRows.forEach(row => {
      if (row.code && row.finalSinglePrice != null) {
        const key = row.code.trim().toUpperCase();
        singleCostMap[key] = row.finalSinglePrice;
        ins25CostMap[key] = row.finalIns25Price;
        ins40CostMap[key] = row.finalIns40Price;
      }
    });

    window.partsDb.forEach(part => {
      if (!part || !part.partNo) return;
      const pNo = part.partNo.trim().toUpperCase();

      Object.keys(singleCostMap).forEach(baseCode => {
        if (pNo.startsWith(baseCode)) {
          part.price = singleCostMap[baseCode];
          part.priceIns25 = ins25CostMap[baseCode];
          part.priceInsulated = ins25CostMap[baseCode];
          part.priceIns40 = ins40CostMap[baseCode];
          updatedCount++;
        }
      });
    });

    try {
      localStorage.setItem("water_tank_parts_db_override", JSON.stringify(window.partsDb));
    } catch (e) {
      console.error("Failed to save partsDb override:", e);
    }

    if (typeof window.renderPartsDbMasterTable === "function") {
      window.renderPartsDbMasterTable();
    }
    if (typeof window.renderDbList === "function") {
      window.renderDbList();
    }
    if (typeof window.generateDefaultBOMFromConfig === "function") {
      window.generateDefaultBOMFromConfig();
    } else if (typeof window.renderAll === "function") {
      window.renderAll();
    }

    alert(`🎉 Successfully updated single/insulated unit prices in Master DB for ${updatedCount} panel parts!`);
  }

  function getCostingData() {
    syncRawMaterialsFromInputs();
    return {
      rawMaterials: JSON.parse(JSON.stringify(rawMaterials)),
      equipmentList: JSON.parse(JSON.stringify(equipmentList)),
      panelCostRows: JSON.parse(JSON.stringify(panelCostRows)),
      inputs: {
        costWorkHoursWeekdays: getVal("costWorkHoursWeekdays", 160),
        costWorkHoursSaturday: getVal("costWorkHoursSaturday", 16),
        costWorkHoursOvertime: getVal("costWorkHoursOvertime", 70),
        costDirectLaborYear: getVal("costDirectLaborYear", 12000),
        costPaidLeaveYear: getVal("costPaidLeaveYear", 1000),
        costBenefitsYear: getVal("costBenefitsYear", 1200),
        costIndirectLaborYear: getVal("costIndirectLaborYear", 7100),
        costPressPlannedHoursMonth: getVal("costPressPlannedHoursMonth", 401.01)
      }
    };
  }

  function setCostingData(data) {
    if (!data) return;
    if (data.rawMaterials) {
      rawMaterials = data.rawMaterials;
      localStorage.setItem("water_tank_costing_materials", JSON.stringify(rawMaterials));
      restoreCostingInputsFromStorage();
    }
    if (data.equipmentList && Array.isArray(data.equipmentList)) {
      equipmentList = data.equipmentList;
      localStorage.setItem("water_tank_costing_equipment", JSON.stringify(equipmentList));
    }
    if (data.panelCostRows && Array.isArray(data.panelCostRows)) {
      panelCostRows = data.panelCostRows;
      localStorage.setItem("water_tank_costing_panels", JSON.stringify(panelCostRows));
    }
    if (data.inputs) {
      Object.keys(data.inputs).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = data.inputs[id];
      });
    }
    initCostingModule();
  }

  function restoreCostingInputsFromStorage() {
    if (document.getElementById("costMatSmcPrice")) document.getElementById("costMatSmcPrice").value = rawMaterials.smcPerKg != null ? rawMaterials.smcPerKg : 5.00;
    if (document.getElementById("costMatGcPrice")) document.getElementById("costMatGcPrice").value = rawMaterials.gcPerKg != null ? rawMaterials.gcPerKg : 0.05;
    if (document.getElementById("costMatInsSkinPrice")) document.getElementById("costMatInsSkinPrice").value = rawMaterials.insSkinPerSqm != null ? rawMaterials.insSkinPerSqm : 1.00;
    if (document.getElementById("costMatInsMdiPrice")) document.getElementById("costMatInsMdiPrice").value = rawMaterials.insMdiPerKg != null ? rawMaterials.insMdiPerKg : 3.50;
    if (document.getElementById("costMatInsPolyolPrice")) document.getElementById("costMatInsPolyolPrice").value = rawMaterials.insPolyolPerKg != null ? rawMaterials.insPolyolPerKg : 3.50;
  }

  global.getCostingData = getCostingData;
  global.setCostingData = setCostingData;
  global.onGcPartSelected = onGcPartSelected;
  global.switchCostingSubTab = switchCostingSubTab;
  global.calcCostingSummary = function() {
    calcCostingSummary();
    renderEquipmentTable();
    renderCostingPanelTable();
  };
  global.renderEquipmentTable = renderEquipmentTable;
  global.updateEquipmentRow = updateEquipmentRow;
  global.addEquipmentRow = addEquipmentRow;
  global.deleteEquipmentRow = deleteEquipmentRow;
  global.renderCostingPanelTable = renderCostingPanelTable;
  global.updateCostingPanelRow = updateCostingPanelRow;
  global.addCostingPanelRow = addCostingPanelRow;
  global.deleteCostingPanelRow = deleteCostingPanelRow;
  global.applyCostingToMasterDb = applyCostingToMasterDb;

  function initCostingModule() {
    restoreCostingInputsFromStorage();
    calcCostingSummary();
    renderEquipmentTable();
    renderCostingPanelTable();
  }

  global.initCostingModule = initCostingModule;

  if (typeof document !== "undefined") {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(initCostingModule, 10);
    } else {
      document.addEventListener("DOMContentLoaded", initCostingModule);
    }
    window.addEventListener("load", initCostingModule);
  }

})(typeof window !== "undefined" ? window : globalThis);
