/**
 * costing.js - Panel Costing & Master DB Propagation Module (Pass 2)
 * Features:
 * 1. Common Raw Material Prices (SMC, G/C, Insulation Skin/MDI/POLYOL)
 * 2. Equipment Management with Buying Price & Depreciation calculation
 * 3. Company-specific Panel Cost Tables (YSACC, HAYOUNG, MNT, WATANI, ALMUFTAH, etc.)
 * 4. Manual Override for Single Panel & Insulated Panel Costs (25mm & 40mm)
 * 5. Insulation Costing & Integration with BASIC_TOOL Insulation setting
 */

(function(global) {
  "use strict";

  const STORAGE_KEY_V2 = "water_tank_costing_panels_v2";
  const LEGACY_STORAGE_KEY = "water_tank_costing_panels";
  const FIRESTORE_DOC = "costing";

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

  // 24 Standard Base Panel Codes Data for YSACC (Default)
  const defaultPanelCostData = [
    { code: "MF00", desc: "Manhole (1m x 1m)", weight: 13.0, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF10", desc: "Bottom (1m x 1m)", weight: 15.1, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.2, insPolyol: 1.2, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF15", desc: "Bottom (1m x 1m)", weight: 16.5, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.0, insMdi: 1.3, insPolyol: 1.3, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF20", desc: "Bottom (1m x 1m)", weight: 18.5, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.4, insPolyol: 1.4, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF25", desc: "Bottom (1m x 1m)", weight: 20.0, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.5, insPolyol: 1.5, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF30", desc: "Bottom (1m x 1m)", weight: 21.0, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.6, insPolyol: 1.6, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF34", desc: "Bottom (1m x 1m)", weight: 23.0, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.0, insMdi: 1.7, insPolyol: 1.7, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF40", desc: "Bottom (1m x 1m)", weight: 26.5, subMatCost: 1.32, pressSec: 420, drillSec: 30, insSkin: 1.0, insMdi: 2.0, insPolyol: 2.0, insLabor: 4.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "BF45", desc: "Bottom (1m x 1m)", weight: 28.3, subMatCost: 1.32, pressSec: 420, drillSec: 30, insSkin: 1.0, insMdi: 2.1, insPolyol: 2.1, insLabor: 4.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
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

  // HAYOUNG Standard Base Panel Codes Default Data
  const hayoungDefaultPanelCostData = [
    { code: "GR-0505-D", desc: "Roof (0.5m x 0.5m)", weight: 3.0, subMatCost: 0.50, pressSec: 240, drillSec: 30, insSkin: 0.25, insMdi: 0.35, insPolyol: 0.35, insLabor: 2.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GR-0510-F", desc: "Roof (0.5m x 1.0m)", weight: 5.5, subMatCost: 0.80, pressSec: 300, drillSec: 30, insSkin: 0.50, insMdi: 0.65, insPolyol: 0.65, insLabor: 2.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GR-1010-F", desc: "Roof (1.0m x 1.0m)", weight: 9.5, subMatCost: 1.32, pressSec: 300, drillSec: 30, insSkin: 1.00, insMdi: 1.00, insPolyol: 1.00, insLabor: 3.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GF-0505-IA", desc: "Bottom (0.5m x 0.5m)", weight: 4.5, subMatCost: 0.60, pressSec: 240, drillSec: 30, insSkin: 0.25, insMdi: 0.35, insPolyol: 0.35, insLabor: 2.00, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GF-0510-C", desc: "Bottom (0.5m x 1.0m)", weight: 8.5, subMatCost: 0.90, pressSec: 300, drillSec: 30, insSkin: 0.50, insMdi: 0.65, insPolyol: 0.65, insLabor: 2.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GF-1010-C", desc: "Bottom (1.0m x 1.0m)", weight: 15.5, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.00, insMdi: 1.20, insPolyol: 1.20, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GF-1010-IIA", desc: "Bottom Heavy (1.0m x 1.0m)", weight: 17.5, subMatCost: 1.32, pressSec: 360, drillSec: 30, insSkin: 1.00, insMdi: 1.30, insPolyol: 1.30, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-0510-C", desc: "Side (0.5m x 1.0m)", weight: 7.5, subMatCost: 0.80, pressSec: 300, drillSec: 30, insSkin: 0.50, insMdi: 0.60, insPolyol: 0.60, insLabor: 2.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-0510-D", desc: "Side (0.5m x 1.0m)", weight: 8.0, subMatCost: 0.80, pressSec: 300, drillSec: 30, insSkin: 0.50, insMdi: 0.65, insPolyol: 0.65, insLabor: 2.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-0510-IA", desc: "Side (0.5m x 1.0m)", weight: 9.0, subMatCost: 0.90, pressSec: 330, drillSec: 30, insSkin: 0.50, insMdi: 0.70, insPolyol: 0.70, insLabor: 2.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-1010-A", desc: "Side 1H (1.0m x 1.0m)", weight: 13.5, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.00, insMdi: 1.10, insPolyol: 1.10, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-1010-B", desc: "Side 2H (1.0m x 1.0m)", weight: 15.5, subMatCost: 1.32, pressSec: 360, drillSec: 30, insSkin: 1.00, insMdi: 1.20, insPolyol: 1.20, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-1010-IIA", desc: "Side Heavy (1.0m x 1.0m)", weight: 18.0, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.00, insMdi: 1.40, insPolyol: 1.40, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GW-1020-D", desc: "Side 2mH (1.0m x 2.0m)", weight: 32.0, subMatCost: 4.94, pressSec: 420, drillSec: 30, insSkin: 2.00, insMdi: 2.40, insPolyol: 2.40, insLabor: 5.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GD-1010-C", desc: "Drain (1.0m x 1.0m)", weight: 16.5, subMatCost: 1.32, pressSec: 330, drillSec: 30, insSkin: 1.00, insMdi: 1.20, insPolyol: 1.20, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GD-1010-IIA", desc: "Drain Heavy (1.0m x 1.0m)", weight: 18.5, subMatCost: 1.32, pressSec: 390, drillSec: 30, insSkin: 1.00, insMdi: 1.40, insPolyol: 1.40, insLabor: 3.50, overrideSinglePrice: null, overrideInsulatedPrice: null },
    { code: "GP-0510-IIA", desc: "Partition (0.5m x 1.0m)", weight: 8.5, subMatCost: 0.90, pressSec: 330, drillSec: 30, insSkin: 0.50, insMdi: 0.65, insPolyol: 0.65, insLabor: 2.50, overrideSinglePrice: null, overrideInsulatedPrice: null }
  ];

  // Company State Map: { byParty: { "default": [...], "hayoung_spec": [...], ... } }
  let costingPanelsByParty = {};
  let selectedCostingPartyId = null;

  function loadCostingPanels() {
    try {
      const v2Raw = localStorage.getItem(STORAGE_KEY_V2);
      if (v2Raw) {
        const parsed = JSON.parse(v2Raw);
        if (parsed && typeof parsed === "object" && parsed.byParty) {
          costingPanelsByParty = parsed.byParty;
        }
      }
      
      // Backward compatibility: check legacy storage
      if (!costingPanelsByParty["default"]) {
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          try {
            const legacyParsed = JSON.parse(legacyRaw);
            if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
              costingPanelsByParty["default"] = legacyParsed;
            }
          } catch(e) {}
        }
      }

      if (!costingPanelsByParty["default"] || costingPanelsByParty["default"].length === 0) {
        costingPanelsByParty["default"] = JSON.parse(JSON.stringify(defaultPanelCostData));
      }
    } catch(e) {
      console.error("[costing.js] Failed to load costing panels:", e);
      costingPanelsByParty = { "default": JSON.parse(JSON.stringify(defaultPanelCostData)) };
    }
  }

  loadCostingPanels();

  function saveCostingPanels() {
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ byParty: costingPanelsByParty }));
      // Also sync legacy key for backward compatibility
      if (costingPanelsByParty["default"]) {
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(costingPanelsByParty["default"]));
      }
    } catch(e) {
      console.error("[costing.js] Failed to save costing panels:", e);
    }
  }

  function getActiveCostingPartyId() {
    if (selectedCostingPartyId) return selectedCostingPartyId;
    if (global.activeBOMCustomerPresetId) return String(global.activeBOMCustomerPresetId);
    if (global.selectedCustomerPresetId) return String(global.selectedCustomerPresetId);
    return "default";
  }

  function setActiveCostingPartyId(pid) {
    selectedCostingPartyId = pid;
    renderCostingCompanyTabs();
    renderCostingPanelTable();
  }

  function generateDefaultCostingRowsForCompany(partyId) {
    const pid = partyId || getActiveCostingPartyId();
    if (pid === "default") {
      return JSON.parse(JSON.stringify(defaultPanelCostData));
    }
    if (pid === "hayoung_spec") {
      return JSON.parse(JSON.stringify(hayoungDefaultPanelCostData));
    }

    // Dynamic derivation from company matrices
    const extractedPanels = (global.MoldGroupManager && typeof global.MoldGroupManager.getCompanyPanels === 'function')
      ? global.MoldGroupManager.getCompanyPanels(pid)
      : [];

    if (extractedPanels.length > 0) {
      const rows = [];
      const partsDb = Array.isArray(global.partsDb) ? global.partsDb : [];

      extractedPanels.forEach(p => {
        const code = p.partNo;
        const pUpper = code.toUpperCase();
        let w = 15.0;
        let skin = 1.0;
        let mdi = 1.2;
        let poly = 1.2;
        let labor = 3.50;
        let press = 330;
        let desc = p.spec || p.nameKo || p.nameEn || code;

        if (pUpper.includes('0505') || pUpper.includes('500X500')) {
          w = 4.0; skin = 0.25; mdi = 0.35; poly = 0.35; labor = 2.0; press = 240;
        } else if (pUpper.includes('0510') || pUpper.includes('500X1000') || pUpper.includes('SL15')) {
          w = 8.0; skin = 0.5; mdi = 0.65; poly = 0.65; labor = 2.5; press = 300;
        } else if (pUpper.includes('1020') || pUpper.includes('1000X2000') || pUpper.includes('ST20')) {
          w = 30.0; skin = 2.0; mdi = 2.4; poly = 2.4; labor = 5.5; press = 420;
        } else if (pUpper.startsWith('GR') || pUpper.startsWith('RF')) {
          w = 10.5; skin = 1.0; mdi = 1.0; poly = 1.0; labor = 3.0; press = 300;
        } else if (pUpper.startsWith('GF') || pUpper.startsWith('BF') || pUpper.startsWith('GD') || pUpper.startsWith('NF')) {
          w = 16.5; skin = 1.0; mdi = 1.2; poly = 1.2; labor = 3.5; press = 360;
        }

        const dbMatch = partsDb.find(x => x && x.partNo && x.partNo.toUpperCase() === pUpper);
        if (dbMatch && dbMatch.weight) w = dbMatch.weight;

        rows.push({
          code: code,
          desc: desc,
          weight: w,
          subMatCost: 1.32,
          pressSec: press,
          drillSec: 30,
          insSkin: skin,
          insMdi: mdi,
          insPolyol: poly,
          insLabor: labor,
          ins40Skin: skin,
          ins40Mdi: Math.round(mdi * 1.6 * 10) / 10,
          ins40Polyol: Math.round(poly * 1.6 * 10) / 10,
          ins40Labor: Math.round(labor * 1.25 * 100) / 100,
          overrideSinglePrice: dbMatch && dbMatch.price ? dbMatch.price : null,
          overrideIns25Price: dbMatch && dbMatch.priceIns25 ? dbMatch.priceIns25 : (dbMatch && dbMatch.priceInsulated ? dbMatch.priceInsulated : null),
          overrideIns40Price: dbMatch && dbMatch.priceIns40 ? dbMatch.priceIns40 : null
        });
      });
      return rows;
    }

    // Fallback to clone of default data
    return JSON.parse(JSON.stringify(defaultPanelCostData));
  }

  function getCompanyPanelCostRows(partyId) {
    const pid = partyId || getActiveCostingPartyId();
    if (!costingPanelsByParty[pid] || !Array.isArray(costingPanelsByParty[pid]) || costingPanelsByParty[pid].length === 0) {
      costingPanelsByParty[pid] = generateDefaultCostingRowsForCompany(pid);
      saveCostingPanels();
    }
    return costingPanelsByParty[pid];
  }

  function autoSyncCostingCompanyPanels(partyId) {
    const pid = partyId || getActiveCostingPartyId();
    const existingRows = getCompanyPanelCostRows(pid);
    const existingCodeSet = new Set(existingRows.map(r => String(r.code || '').trim().toUpperCase()));

    const extractedPanels = (global.MoldGroupManager && typeof global.MoldGroupManager.getCompanyPanels === 'function')
      ? global.MoldGroupManager.getCompanyPanels(pid)
      : [];

    let addedCount = 0;
    const partsDb = Array.isArray(global.partsDb) ? global.partsDb : [];

    extractedPanels.forEach(p => {
      const code = String(p.partNo || '').trim();
      const pUpper = code.toUpperCase();
      if (!code || existingCodeSet.has(pUpper)) return;

      let w = 15.0;
      let skin = 1.0;
      let mdi = 1.2;
      let poly = 1.2;
      let labor = 3.50;
      let press = 330;
      let desc = p.spec || p.nameKo || p.nameEn || code;

      if (pUpper.includes('0505') || pUpper.includes('500X500')) {
        w = 4.0; skin = 0.25; mdi = 0.35; poly = 0.35; labor = 2.0; press = 240;
      } else if (pUpper.includes('0510') || pUpper.includes('500X1000') || pUpper.includes('SL15')) {
        w = 8.0; skin = 0.5; mdi = 0.65; poly = 0.65; labor = 2.5; press = 300;
      } else if (pUpper.includes('1020') || pUpper.includes('1000X2000') || pUpper.includes('ST20')) {
        w = 30.0; skin = 2.0; mdi = 2.4; poly = 2.4; labor = 5.5; press = 420;
      } else if (pUpper.startsWith('GR') || pUpper.startsWith('RF')) {
        w = 10.5; skin = 1.0; mdi = 1.0; poly = 1.0; labor = 3.0; press = 300;
      } else if (pUpper.startsWith('GF') || pUpper.startsWith('BF') || pUpper.startsWith('GD') || pUpper.startsWith('NF')) {
        w = 16.5; skin = 1.0; mdi = 1.2; poly = 1.2; labor = 3.5; press = 360;
      }

      const dbMatch = partsDb.find(x => x && x.partNo && x.partNo.toUpperCase() === pUpper);
      if (dbMatch && dbMatch.weight) w = dbMatch.weight;

      existingRows.push({
        code: code,
        desc: desc,
        weight: w,
        subMatCost: 1.32,
        pressSec: press,
        drillSec: 30,
        insSkin: skin,
        insMdi: mdi,
        insPolyol: poly,
        insLabor: labor,
        ins40Skin: skin,
        ins40Mdi: Math.round(mdi * 1.6 * 10) / 10,
        ins40Polyol: Math.round(poly * 1.6 * 10) / 10,
        ins40Labor: Math.round(labor * 1.25 * 100) / 100,
        overrideSinglePrice: dbMatch && dbMatch.price ? dbMatch.price : null,
        overrideIns25Price: dbMatch && dbMatch.priceIns25 ? dbMatch.priceIns25 : (dbMatch && dbMatch.priceInsulated ? dbMatch.priceInsulated : null),
        overrideIns40Price: dbMatch && dbMatch.priceIns40 ? dbMatch.priceIns40 : null
      });

      existingCodeSet.add(pUpper);
      addedCount++;
    });

    saveCostingPanels();
    renderCostingPanelTable();

    const customers = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = customers.find(c => String(c.id) === pid);
    const partyName = curCust ? curCust.name : 'Selected Company';

    alert(`[${partyName}] 판넬 동기화 완료: ${addedCount}개의 신규 판넬 코드가 추가되었습니다.`);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderCostingCompanyTabs() {
    const container = document.getElementById("costingCompanyTabsContainer");
    if (!container) return;

    const customers = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [
      { id: 'default', name: 'YSACC Spec' }
    ];
    const activePid = getActiveCostingPartyId();
    const activeBOMId = String(global.activeBOMCustomerPresetId || 'default');

    let html = `<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">`;
    customers.forEach(c => {
      const cid = String(c.id);
      const isSelected = cid === activePid;
      const isActiveBOM = cid === activeBOMId;
      const bg = isSelected ? 'var(--neon-blue, #0284c7)' : '#ffffff';
      const color = isSelected ? '#ffffff' : '#334155';
      const border = isSelected ? 'none' : '1px solid #cbd5e1';

      html += `
        <button type="button" class="btn btn-sm" onclick="window.setActiveCostingPartyId('${cid}')" style="height:32px; padding:0 12px; font-size:11.5px; font-weight:bold; background:${bg}; color:${color}; border:${border}; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:5px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <i class="fa-solid fa-building"></i>
          <span>${escapeHtml(c.name)}</span>
          ${isActiveBOM ? '<span style="font-size:9.5px; background:#22c55e; color:#fff; padding:1px 5px; border-radius:8px; margin-left:3px;">Active BOM</span>' : ''}
        </button>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function switchCostingSubTab(tabName, updateUrl = true) {
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
      renderCostingCompanyTabs();
      renderCostingPanelTable();
    }

    if (updateUrl && typeof window !== "undefined") {
      const cleanHash = `costing/${tabName}`;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + cleanHash);
      } else {
        window.location.hash = cleanHash;
      }
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
        infoDisplay.innerHTML = `<i class="fa-solid fa-circle-info"></i> Linked Unit Weight (Master DB): <b>${match.weight} kg (${Math.round(match.weight * 1000)}g)</b> (${match.spec || match.nameKo})`;
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
    if (totalHoursEl) totalHoursEl.textContent = `${totalWorkingHours} HRS/MO`;

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
    if (pressTotalEl) pressTotalEl.textContent = `${symbol}${avgPressRate.toFixed(3)} / HR (Avg)`;

    const drillTotalEl = document.getElementById("costDrillTotalRateDisplay");
    if (drillTotalEl) drillTotalEl.textContent = `${symbol}${avgDrillRate.toFixed(3)} / HR (Avg)`;

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
              <option value="PRESS" ${eq.type === "PRESS" ? "selected" : ""}>PRESS</option>
              <option value="DRILL" ${eq.type === "DRILL" ? "selected" : ""}>DRILL</option>
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
            ${symbol}${fixedDeprMonth.toFixed(0)} / Mo
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
    renderCostingCompanyTabs();

    const tbody = document.getElementById("costingPanelTableBody");
    if (!tbody) return;

    const pid = getActiveCostingPartyId();
    const panelCostRows = getCompanyPanelCostRows(pid);

    const customers = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = customers.find(c => String(c.id) === pid);
    const partyName = curCust ? curCust.name : 'YSACC Spec';

    const titleEl = document.getElementById("costingPanelTableTitle");
    if (titleEl) {
      titleEl.innerHTML = `<i class="fa-solid fa-list-check"></i> [${escapeHtml(partyName)}] 판넬 원가 & 보온 원가 테이블 (Panel Base Cost & Insulation Cost Table)`;
    }

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
        currentGcPartNo = (row.code === "SL15") ? "GC-1650-160" : (row.code === "ST20" || (row.code && row.code.includes("1020"))) ? "GC-2150-160" : "GC-1150-160";
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
      row.calculatedSinglePrice = calculatedSinglePrice;
      row.calculatedIns25Price = calculatedIns25Price;
      row.calculatedIns40Price = calculatedIns40Price;

      tbody.innerHTML += `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:bold; color:#0284c7; border-right:1px solid #e2e8f0;">
            <input type="text" value="${escapeHtml(row.code)}" onchange="window.updateCostingPanelRow(${idx}, 'code', this.value)" style="width:85px; text-align:center; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px; padding:3px; font-family:monospace;">
          </td>
          <td style="padding:6px; text-align:left; border-right:1px solid #e2e8f0;">
            <input type="text" value="${escapeHtml(row.desc)}" onchange="window.updateCostingPanelRow(${idx}, 'desc', this.value)" style="width:160px; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${weight}" onchange="window.updateCostingPanelRow(${idx}, 'weight', parseFloat(this.value))" style="width:58px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#f0f9ff;">
            <select onchange="window.updateCostingPanelRow(${idx}, 'gcPartNo', this.value)" style="width:132px; font-size:11px; font-weight:700; border:1px solid #cbd5e1; border-radius:4px; padding:3px; color:${currentGcPartNo === 'NONE' ? '#94a3b8' : '#0369a1'}; background:#ffffff; outline:none;" title="Glass Cloth Part No used for this panel moulding">
              ${gcOptionsHtml}
            </select>
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#faf5ff;">
            <input type="number" step="any" value="${pressSec}" onchange="window.updateCostingPanelRow(${idx}, 'pressSec', parseFloat(this.value))" style="width:62px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;" title="Press moulding time in seconds">
          </td>
          <td style="padding:6px; font-weight:700; color:#6b21a8; background:#f3e8ff; border-right:1px solid #e2e8f0;" title="Press Machine Cost (${symbol}${pressCost.toFixed(2)}) + Press Labor Cost (${symbol}${pressLaborCost.toFixed(2)})">
            ${symbol}${(pressCost + pressLaborCost).toFixed(2)}
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#faf5ff;">
            <input type="number" step="any" value="${drillSec}" onchange="window.updateCostingPanelRow(${idx}, 'drillSec', parseFloat(this.value))" style="width:62px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;" title="Drilling time in seconds">
          </td>
          <td style="padding:6px; font-weight:700; color:#6b21a8; background:#f3e8ff; border-right:1px solid #e2e8f0;" title="Drill Machine Cost (${symbol}${drillCost.toFixed(2)}) + Drill Labor Cost (${symbol}${drillLaborCost.toFixed(2)})">
            ${symbol}${(drillCost + drillLaborCost).toFixed(2)}
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#faf5ff;">
            <input type="number" step="any" value="${subMat}" onchange="window.updateCostingPanelRow(${idx}, 'subMatCost', parseFloat(this.value))" style="width:60px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;" title="Sub-material cost ($)">
          </td>
          <td style="padding:6px; font-weight:800; color:#5b21b6; background:#e9d5ff; border-right:1px solid #e2e8f0;" title="Fabrication Cost = Press Cost (${symbol}${(pressCost + pressLaborCost).toFixed(2)}) + Drill Cost (${symbol}${(drillCost + drillLaborCost).toFixed(2)})">
            ${symbol}${processingCost.toFixed(2)}
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#f0f9ff;">
            <input type="number" step="any" placeholder="${symbol}${calculatedSinglePrice.toFixed(2)}" value="${row.overrideSinglePrice != null ? row.overrideSinglePrice : ""}" onchange="window.updateCostingPanelRow(${idx}, 'overrideSinglePrice', this.value === '' ? null : parseFloat(this.value))" style="width:78px; text-align:right; font-weight:800; color:#0284c7; border:1px solid #0284c7; border-radius:4px; padding:3px;" title="Manual Single Price Override">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${insSkin}" onchange="window.updateCostingPanelRow(${idx}, 'insSkin', parseFloat(this.value))" style="width:46px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${insMdi}" onchange="window.updateCostingPanelRow(${idx}, 'insMdi', parseFloat(this.value))" style="width:46px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0;">
            <input type="number" step="any" value="${insPolyol}" onchange="window.updateCostingPanelRow(${idx}, 'insPolyol', parseFloat(this.value))" style="width:46px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; padding:3px;">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#fdf2f8;">
            <input type="number" step="any" placeholder="${symbol}${calculatedIns25Price.toFixed(2)}" value="${row.overrideIns25Price != null ? row.overrideIns25Price : (row.overrideInsulatedPrice != null ? row.overrideInsulatedPrice : "")}" onchange="window.updateCostingPanelRow(${idx}, 'overrideIns25Price', this.value === '' ? null : parseFloat(this.value))" style="width:78px; text-align:right; font-weight:800; color:#be185d; border:1px solid #be185d; border-radius:4px; padding:3px;" title="Manual Insulated 25mm Price Override">
          </td>
          <td style="padding:6px; border-right:1px solid #e2e8f0; background:#fff7ed;">
            <input type="number" step="any" placeholder="${symbol}${calculatedIns40Price.toFixed(2)}" value="${row.overrideIns40Price != null ? row.overrideIns40Price : ""}" onchange="window.updateCostingPanelRow(${idx}, 'overrideIns40Price', this.value === '' ? null : parseFloat(this.value))" style="width:78px; text-align:right; font-weight:800; color:#c2410c; border:1px solid #ea580c; border-radius:4px; padding:3px;" title="Manual Insulated 40mm Price Override">
          </td>
          <td style="padding:6px; font-weight:800; color:#059669; border-right:1px solid #e2e8f0; font-size:11px;">
            ${symbol}${finalIns25Price.toFixed(2)} / ${symbol}${finalIns40Price.toFixed(2)}
          </td>
          <td style="padding:6px; text-align:center;">
            <div style="display:inline-flex; align-items:center; gap:4px;">
              <button type="button" onclick="window.duplicateCostingPanelRow(${idx})" style="background:#e0f2fe; color:#0284c7; border:1px solid #7dd3fc; padding:3px 6px; border-radius:4px; font-size:10px; cursor:pointer;" title="Copy Row">
                <i class="fa-solid fa-copy"></i>
              </button>
              <button type="button" onclick="window.deleteCostingPanelRow(${idx})" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:3px 6px; border-radius:4px; font-size:10px; cursor:pointer;" title="Delete Row">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    saveCostingPanels();
  }

  function updateCostingPanelRow(index, field, val) {
    const pid = getActiveCostingPartyId();
    const rows = getCompanyPanelCostRows(pid);
    if (rows[index]) {
      rows[index][field] = val;
      renderCostingPanelTable();
    }
  }

  function addCostingPanelRow() {
    const pid = getActiveCostingPartyId();
    const rows = getCompanyPanelCostRows(pid);
    rows.push({
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

  function duplicateCostingPanelRow(index) {
    const pid = getActiveCostingPartyId();
    const rows = getCompanyPanelCostRows(pid);
    if (rows[index]) {
      const source = rows[index];
      const cloned = JSON.parse(JSON.stringify(source));
      cloned.code = (cloned.code || "NEW") + "_COPY";
      cloned.desc = (cloned.desc || "Copy Panel") + " (Copy)";
      rows.splice(index + 1, 0, cloned);
      renderCostingPanelTable();
    }
  }

  function deleteCostingPanelRow(index) {
    const pid = getActiveCostingPartyId();
    const rows = getCompanyPanelCostRows(pid);
    if (confirm("Are you sure you want to delete this panel costing row?")) {
      rows.splice(index, 1);
      renderCostingPanelTable();
    }
  }

  function applyCostingToMasterDb(silent = false) {
    renderCostingPanelTable(); // Recalculate
    if (!window.partsDb || !Array.isArray(window.partsDb) || window.partsDb.length === 0) {
      if (!silent) alert("Master DB is not ready.");
      return;
    }

    let updatedCount = 0;
    const pid = getActiveCostingPartyId();
    const rows = getCompanyPanelCostRows(pid);

    const singleCostMap = {};
    const ins25CostMap = {};
    const ins40CostMap = {};

    rows.forEach(row => {
      if (row.code && row.finalSinglePrice != null) {
        const key = row.code.trim().toUpperCase();
        singleCostMap[key] = row.finalSinglePrice;
        ins25CostMap[key] = row.finalIns25Price;
        ins40CostMap[key] = row.finalIns40Price;
      }
    });

    window.partsDb.forEach(part => {
      if (!part || !part.partNo) return;
      const pUpper = part.partNo.trim().toUpperCase();
      let matchedKey = null;

      // 1. Exact match
      if (singleCostMap[pUpper] !== undefined) {
        matchedKey = pUpper;
      } else {
        // 2. Base code match or prefix match
        const baseUpper = (global.MoldGroupManager && typeof global.MoldGroupManager.cleanToPureBaseCode === 'function')
          ? global.MoldGroupManager.cleanToPureBaseCode(part.partNo).toUpperCase()
          : pUpper;
        if (singleCostMap[baseUpper] !== undefined) {
          matchedKey = baseUpper;
        } else {
          // Standard 4-char prefix fallback (e.g. BF10, SF10)
          const pPrefix = pUpper.substring(0, 4);
          Object.keys(singleCostMap).forEach(bCode => {
            if (bCode.substring(0, 4) === pPrefix && !bCode.includes('-')) {
              matchedKey = bCode;
            }
          });
        }
      }

      if (matchedKey) {
        part.price = singleCostMap[matchedKey];
        part.priceIns25 = ins25CostMap[matchedKey];
        part.priceInsulated = ins25CostMap[matchedKey];
        part.priceIns40 = ins40CostMap[matchedKey];
        updatedCount++;
      }
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

    const customers = (typeof global.getMatrixCustomerPresetList === 'function') ? global.getMatrixCustomerPresetList() : [];
    const curCust = customers.find(c => String(c.id) === pid);
    const partyName = curCust ? curCust.name : 'Selected Company';

    if (!silent) {
      alert(`🎉 [${partyName}] Master DB에 단판/보온 판넬 단가 ${updatedCount}건이 성공적으로 업데이트되었습니다!`);
    } else {
      console.log(`🎉 [${partyName}] Master DB updated for ${updatedCount} panel parts!`);
    }
  }

  function getCostingData(partyId) {
    syncRawMaterialsFromInputs();
    const pid = partyId || getActiveCostingPartyId();
    return {
      rawMaterials: JSON.parse(JSON.stringify(rawMaterials)),
      equipmentList: JSON.parse(JSON.stringify(equipmentList)),
      panelCostRows: JSON.parse(JSON.stringify(getCompanyPanelCostRows(pid))),
      byParty: JSON.parse(JSON.stringify(costingPanelsByParty)),
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
    if (data.byParty && typeof data.byParty === "object") {
      costingPanelsByParty = data.byParty;
      saveCostingPanels();
    } else if (data.panelCostRows && Array.isArray(data.panelCostRows)) {
      costingPanelsByParty["default"] = data.panelCostRows;
      saveCostingPanels();
    }
    calcCostingSummary();
    renderEquipmentTable();
    renderCostingCompanyTabs();
    renderCostingPanelTable();
  }

  function restoreCostingInputsFromStorage() {
    if (rawMaterials) {
      if (document.getElementById("costMatSmcPrice")) document.getElementById("costMatSmcPrice").value = rawMaterials.smcPerKg || 5.00;
      if (document.getElementById("costMatGcPrice")) document.getElementById("costMatGcPrice").value = rawMaterials.gcPerKg || 0.05;
      if (document.getElementById("costMatInsSkinPrice")) document.getElementById("costMatInsSkinPrice").value = rawMaterials.insSkinPerSqm || 1.00;
      if (document.getElementById("costMatInsMdiPrice")) document.getElementById("costMatInsMdiPrice").value = rawMaterials.insMdiPerKg || 3.50;
      if (document.getElementById("costMatInsPolyolPrice")) document.getElementById("costMatInsPolyolPrice").value = rawMaterials.insPolyolPerKg || 3.50;
    }
  }

  function openPanelCostFormulaModal() {
    const m = document.getElementById("panelCostFormulaModal");
    if (m) m.style.display = "flex";
  }

  function closePanelCostFormulaModal() {
    const m = document.getElementById("panelCostFormulaModal");
    if (m) m.style.display = "none";
  }

  // Window exports
  global.switchCostingSubTab = switchCostingSubTab;
  global.onGcPartSelected = onGcPartSelected;
  global.updateEquipmentRow = updateEquipmentRow;
  global.addEquipmentRow = addEquipmentRow;
  global.deleteEquipmentRow = deleteEquipmentRow;
  global.updateCostingPanelRow = updateCostingPanelRow;
  global.addCostingPanelRow = addCostingPanelRow;
  global.duplicateCostingPanelRow = duplicateCostingPanelRow;
  global.deleteCostingPanelRow = deleteCostingPanelRow;
  global.applyCostingToMasterDb = applyCostingToMasterDb;
  global.openPanelCostFormulaModal = openPanelCostFormulaModal;
  global.closePanelCostFormulaModal = closePanelCostFormulaModal;
  global.getCostingData = getCostingData;
  global.setCostingData = setCostingData;
  global.renderCostingPanelTable = renderCostingPanelTable;
  global.renderCostingCompanyTabs = renderCostingCompanyTabs;
  global.getActiveCostingPartyId = getActiveCostingPartyId;
  global.setActiveCostingPartyId = setActiveCostingPartyId;
  global.getCompanyPanelCostRows = getCompanyPanelCostRows;
  global.autoSyncCostingCompanyPanels = autoSyncCostingCompanyPanels;

  // Auto initialize on DOM load
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function() {
        restoreCostingInputsFromStorage();
        calcCostingSummary();
        renderCostingCompanyTabs();
        renderCostingPanelTable();
      });
    } else {
      setTimeout(function() {
        restoreCostingInputsFromStorage();
        calcCostingSummary();
        renderCostingCompanyTabs();
        renderCostingPanelTable();
      }, 0);
    }
  }

})(typeof window !== "undefined" ? window : this);
