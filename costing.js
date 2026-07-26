/**
 * costing.js - Panel Costing & Master DB Propagation Module
 * Analyzes labor, equipment, and raw material costs from Panel_Costing_Table.xlsx
 * and propagates manufacturing costs to PART_ID_TABLE (master DB).
 */

(function(global) {
  "use strict";

  const defaultPanelCostData = [
    { code: "MF00", desc: "Manhole (1m x 1m)", weight: 13.0, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "BF10", desc: "Bottom (1m x 1m)", weight: 15.1, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "BF20", desc: "Bottom (1m x 1m)", weight: 18.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "BF30", desc: "Bottom (1m x 1m)", weight: 21.0, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "BF40", desc: "Bottom (1m x 1m)", weight: 26.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 420, drillSec: 30 },
    { code: "NF10", desc: "Drain (1m x 1m)", weight: 15.1, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "NF15", desc: "Drain (1m x 1m)", weight: 16.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "NF20", desc: "Drain (1m x 1m)", weight: 18.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "NF30", desc: "Drain (1m x 1m)", weight: 21.0, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "NF40", desc: "Drain (1m x 1m)", weight: 26.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 420, drillSec: 30 },
    { code: "RF00", desc: "Roof (1m x 1m)", weight: 10.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 300, drillSec: 30 },
    { code: "SF10", desc: "Side (1m x 1m)", weight: 12.6, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "SF15", desc: "Side (1m x 1m)", weight: 14.0, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "SF20", desc: "Side (1m x 1m)", weight: 15.1, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "SF25", desc: "Side (1m x 1m)", weight: 18.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "SF30", desc: "Side (1m x 1m)", weight: 21.0, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 360, drillSec: 30 },
    { code: "SF40", desc: "Side (1m x 1m)", weight: 26.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 420, drillSec: 30 },
    { code: "PF10", desc: "Partition (0.93x1m)", weight: 12.6, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 330, drillSec: 30 },
    { code: "PF20", desc: "Partition (0.93x1m)", weight: 15.1, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "PF30", desc: "Partition (0.93x1m)", weight: 18.5, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 390, drillSec: 30 },
    { code: "PF40", desc: "Partition (0.93x1m)", weight: 21.0, pricePerKg: 5.00, subMatCost: 1.32, pressSec: 570, drillSec: 30 },
    { code: "SL15", desc: "Side (1m x 1.5m)", weight: 19.3, pricePerKg: 5.00, subMatCost: 1.90, pressSec: 300, drillSec: 30 },
    { code: "ST20", desc: "Side (1m x 2.0m)", weight: 29.0, pricePerKg: 5.00, subMatCost: 4.94, pressSec: 300, drillSec: 30 }
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
  }

  function getVal(id, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return defaultVal;
    const v = parseFloat(el.value);
    return isNaN(v) ? defaultVal : v;
  }

  function calcCostingSummary() {
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

    const directRateEl = document.getElementById("costDirectLaborRateDisplay");
    const indirectRateEl = document.getElementById("costIndirectLaborRateDisplay");
    if (directRateEl) directRateEl.textContent = `$${directLaborRate.toFixed(3)} / HR`;
    if (indirectRateEl) indirectRateEl.textContent = `$${indirectLaborRate.toFixed(3)} / HR`;

    // 2. Equipment Rates
    const pressFixedMonth = getVal("costPressFixedExpenseMonth", 11400);
    const pressPlannedHours = getVal("costPressPlannedHoursMonth", 401.01);
    const pressVarHour = getVal("costPressVariableExpenseHour", 1.169);
    const pressBoilerHour = getVal("costPressBoilerExpenseHour", 5.00);

    const pressFixedRate = pressPlannedHours > 0 ? (pressFixedMonth / pressPlannedHours) : 28.428;
    const pressTotalRate = pressFixedRate + pressVarHour + pressBoilerHour;

    const pressTotalEl = document.getElementById("costPressTotalRateDisplay");
    if (pressTotalEl) pressTotalEl.textContent = `$${pressTotalRate.toFixed(3)} / HR`;

    const drillFixedMonth = getVal("costDrillFixedExpenseMonth", 3070);
    const drillVarHour = getVal("costDrillVariableExpenseHour", 0.234);
    const drillFixedRate = pressPlannedHours > 0 ? (drillFixedMonth / pressPlannedHours) : 7.655;
    const drillTotalRate = drillFixedRate + drillVarHour;

    const drillTotalEl = document.getElementById("costDrillTotalRateDisplay");
    if (drillTotalEl) drillTotalEl.textContent = `$${drillTotalRate.toFixed(3)} / HR`;

    return {
      directLaborRate,
      pressTotalRate,
      drillTotalRate
    };
  }

  function renderCostingPanelTable() {
    const tbody = document.getElementById("costingPanelTableBody");
    if (!tbody) return;

    const rates = calcCostingSummary();
    const directLaborRate = rates.directLaborRate;
    const pressRate = rates.pressTotalRate;
    const drillRate = rates.drillTotalRate;

    tbody.innerHTML = "";

    panelCostRows.forEach((row, idx) => {
      const weight = row.weight || 0;
      const pricePerKg = row.pricePerKg || 5.00;
      const subMat = row.subMatCost || 1.32;
      const rawMaterialCost = (weight * pricePerKg) + subMat;

      const pressSec = row.pressSec || 300;
      const drillSec = row.drillSec || 30;

      const pressHours = pressSec / 3600;
      const pressCost = pressHours * pressRate;
      const pressLaborCost = (pressHours * 2) * directLaborRate;

      const drillHours = drillSec / 3600;
      const drillCost = drillHours * drillRate;
      const drillLaborCost = (drillHours * 2) * directLaborRate;

      const processingCost = pressCost + pressLaborCost + drillCost + drillLaborCost;
      const mfgCost = rawMaterialCost + processingCost;

      row.calculatedMfgCost = parseFloat(mfgCost.toFixed(2));

      tbody.innerHTML += `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 8px; font-weight:bold; color:#0284c7; border-right:1px solid #e2e8f0;">
            <input type="text" value="${row.code}" onchange="window.updateCostingPanelRow(${idx}, 'code', this.value)" style="width:75px; text-align:center; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px 8px; text-align:left; border-right:1px solid #e2e8f0;">
            <input type="text" value="${row.desc}" onchange="window.updateCostingPanelRow(${idx}, 'desc', this.value)" style="width:140px; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px 8px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${weight}" onchange="window.updateCostingPanelRow(${idx}, 'weight', parseFloat(this.value))" style="width:65px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px 8px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${pricePerKg}" onchange="window.updateCostingPanelRow(${idx}, 'pricePerKg', parseFloat(this.value))" style="width:65px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px 8px; font-weight:600; border-right:1px solid #e2e8f0;">$${rawMaterialCost.toFixed(2)}</td>
          <td style="padding:6px 8px; border-right:1px solid #e2e8f0;">
            <input type="number" value="${pressSec}" onchange="window.updateCostingPanelRow(${idx}, 'pressSec', parseInt(this.value))" style="width:65px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px 8px; border-right:1px solid #e2e8f0;">
            <input type="number" value="${drillSec}" onchange="window.updateCostingPanelRow(${idx}, 'drillSec', parseInt(this.value))" style="width:65px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px 8px; font-weight:600; border-right:1px solid #e2e8f0;">$${processingCost.toFixed(2)}</td>
          <td style="padding:6px 8px; font-weight:800; color:#be185d; background:#fdf2f8; border-right:1px solid #e2e8f0; font-size:13px;">
            $${mfgCost.toFixed(2)}
          </td>
          <td style="padding:6px 8px;">
            <button type="button" onclick="window.deleteCostingPanelRow(${idx})" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:2px 6px; border-radius:4px; font-size:11px; cursor:pointer;" title="삭제">
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
      pricePerKg: 5.00,
      subMatCost: 1.32,
      pressSec: 330,
      drillSec: 30
    });
    renderCostingPanelTable();
  }

  function deleteCostingPanelRow(index) {
    if (confirm("해당 패널 원가 설정 행을 삭제하시겠습니까?")) {
      panelCostRows.splice(index, 1);
      renderCostingPanelTable();
    }
  }

  function applyCostingToMasterDb() {
    renderCostingPanelTable(); // Fresh recalculation
    if (!window.partsDb || !Array.isArray(window.partsDb)) {
      alert("마스터 DB가 준비되지 않았습니다.");
      return;
    }

    let updatedCount = 0;
    const costMap = {};
    panelCostRows.forEach(row => {
      if (row.code && row.calculatedMfgCost) {
        costMap[row.code.trim().toUpperCase()] = row.calculatedMfgCost;
      }
    });

    window.partsDb.forEach(part => {
      if (!part || !part.partNo) return;
      const pNo = part.partNo.trim().toUpperCase();

      // Check matching base panel code (e.g., BF10 matches BF10, BF10BX, BF10BP, etc.)
      Object.keys(costMap).forEach(baseCode => {
        if (pNo.startsWith(baseCode)) {
          part.price = costMap[baseCode];
          updatedCount++;
        }
      });
    });

    // Save updated partsDb to localStorage override
    try {
      localStorage.setItem("water_tank_parts_db_override", JSON.stringify(window.partsDb));
    } catch (e) {
      console.error("Failed to save partsDb override:", e);
    }

    // Re-render Master DB Table if function exists
    if (typeof window.renderPartsDbMasterTable === "function") {
      window.renderPartsDbMasterTable();
    }

    // Re-render BOM if active
    if (typeof window.renderAll === "function") {
      window.renderAll();
    }

    alert(`🎉 총 ${updatedCount}개 패널 부품 마스터 DB의 단가(Price)에 제조원가가 성공적으로 통합 반영되었습니다!`);
  }

  // Exports
  global.switchCostingSubTab = switchCostingSubTab;
  global.calcCostingSummary = function() {
    calcCostingSummary();
    renderCostingPanelTable();
  };
  global.renderCostingPanelTable = renderCostingPanelTable;
  global.updateCostingPanelRow = updateCostingPanelRow;
  global.addCostingPanelRow = addCostingPanelRow;
  global.deleteCostingPanelRow = deleteCostingPanelRow;
  global.applyCostingToMasterDb = applyCostingToMasterDb;

  // Initialize on load
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      calcCostingSummary();
      renderCostingPanelTable();
    });
  }

})(typeof window !== "undefined" ? window : globalThis);
