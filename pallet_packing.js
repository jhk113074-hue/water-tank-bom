// =============================================================================
// GRP Water Tank -- Pallet Packing Logic (pallet_packing.js)
// =============================================================================
(function(global) {
  "use strict";

  let pendingList = [];
  let pallets = [];
  let nextPalletId = 1;

  // Typical dimensions catalog mapping (length/width) based on part numbers or specifications
  const PANEL_SIZE_CATALOG = {
    // 1x2m Panels
    "SL20S": { name: "Side 1x2m", w: 1000, l: 2000 },
    "SL20SX": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20S": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20SX": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20SL": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20SR": { name: "Side 1x2m", w: 1000, l: 2000 },
    "PF20HX": { name: "Partition 0.93x2m", w: 930, l: 2000 },
    "PF20LX": { name: "Partition 0.93x2m", w: 930, l: 2000 },
    
    // 1.5m Side Panels (1.0m x 1.5m)
    "SL15S": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "SL15SX": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "SL15SL": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "SL15SR": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "ST15S": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "ST15H": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "ST15HX": { name: "Side 1x1.5m", w: 1000, l: 1500 },

    // Partition Panels (PF15: 0.93x1m, PH15: 0.93x0.5m)
    "PF15MX": { name: "Partition 0.93x1m", w: 930, l: 1000 },
    "PH15HU15": { name: "Partition 0.93x0.5m", w: 930, l: 500 },
    "PH15MX": { name: "Partition 0.93x0.5m", w: 930, l: 500 },

    // NH / NQ / NF Panels (NH: 0.5x1m, NQ: 0.5x0.5m, NF: 1x1m)
    "NH15LX": { name: "Side Half 0.5x1m", w: 500, l: 1000 },
    "NH15MX": { name: "Side Half 0.5x1m", w: 500, l: 1000 },
    "NH10TX": { name: "Side Half 0.5x1m", w: 500, l: 1000 },
    "NH20BX": { name: "Side Half 0.5x1m", w: 500, l: 1000 },
    "NQ10HX": { name: "Side Quarter 0.5x0.5m", w: 500, l: 500 },
    "NQ10HU15": { name: "Side Quarter 0.5x0.5m", w: 500, l: 500 },
    "NF15BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF10BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    
    // 1x1m Panels
    "SF10SX": { name: "Side 1x1m", w: 1000, l: 1000 },
    "RF00TX": { name: "Roof 1x1m", w: 1000, l: 1000 },
    "BF10BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF20BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF30BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF40BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF45BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF50BX": { name: "Bottom 1x1m", w: 1000, l: 1000 }
  };

  // Panel Dimensions Lookup (100% Respect for User's DB Data)
  let _partsDbMapCache = null;
  let _partsDbMapSource = null;

  function invalidateCache() {
    _partsDbMapCache = null;
    _partsDbMapSource = null;
  }

  function getPartsDbMap() {
    if (typeof partsDb !== 'undefined' && Array.isArray(partsDb)) {
      if (_partsDbMapCache && _partsDbMapSource === partsDb && Object.keys(_partsDbMapCache).length === partsDb.length) {
        return _partsDbMapCache;
      }
      const map = {};
      partsDb.forEach(p => {
        if (p && p.partNo) {
          map[String(p.partNo).toUpperCase().trim()] = p;
        }
      });
      _partsDbMapCache = map;
      _partsDbMapSource = partsDb;
      return map;
    }
    return {};
  }

  function getPanelDimensions(partNo, partName) {
    const pNo = (partNo || "").toUpperCase().trim();
    const pName = (partName || "").toUpperCase().trim();

    // 1. Primary O(1) map lookup in live global parts database
    const map = getPartsDbMap();
    const match = map[pNo];
    if (match) {
      const wVal = parseFloat(match.width);
      const lVal = parseFloat(match.length);
      const rawFh = parseFloat(match.fh);
      const rawHt = parseFloat(match.ht);

      const hasValidData = !isNaN(wVal) && wVal > 0 && !isNaN(lVal) && lVal > 0;

      return {
        name: match.nameKo || match.nameEn || pName || pNo,
        w: hasValidData ? wVal : 0,
        l: hasValidData ? lVal : 0,
        ht: (!isNaN(rawHt) && rawHt > 0) ? rawHt : 80,
        fh: (!isNaN(rawFh) && rawFh > 0) ? rawFh : 70,
        hasDbData: hasValidData
      };
    }

    // 2. Catalog lookup fallback
    if (PANEL_SIZE_CATALOG && PANEL_SIZE_CATALOG[pNo]) {
      const entry = PANEL_SIZE_CATALOG[pNo];
      const catFh = entry.fh || 70;
      const catHt = entry.ht || 80;
      return { ...entry, w: entry.w || 1000, l: entry.l || 1000, ht: catHt, fh: catFh, hasDbData: true };
    }

    // 3. Fallback: Parse panel dimensions dynamically from partNo prefix/naming pattern if DB & catalog lack explicit entry
    let autoW = 1000;
    let autoL = 1000;
    if (pNo.includes("15") || pNo.includes("1.5")) {
      autoL = 1500;
    } else if (pNo.includes("20") || pNo.includes("2.0") || pNo.includes("2M")) {
      autoL = 2000;
    }
    if (pNo.startsWith("PF") || pNo.startsWith("PH")) autoW = 930;
    else if (pNo.startsWith("NH") || pNo.startsWith("NQ")) autoW = 500;
    if (pNo.startsWith("PH") || pNo.startsWith("NQ")) autoL = 500;

    return { name: pName || pNo, w: autoW, l: autoL, ht: 80, fh: 70, hasDbData: true };
  }

  // Dynamic Pallet Base Type Resolution (User Directive: Strictly check physical item dimensions)
  function getActualPalletTypeForPallet(pallet) {
    if (!pallet || !pallet.items || pallet.items.length === 0) {
      return (pallet && pallet.palletType) ? pallet.palletType : "1x1m";
    }

    let has2m = false;
    let has15m = false;

    pallet.items.forEach(item => {
      const pNo = (item.partNo || "").toUpperCase().trim();
      const dims = getPanelDimensions(pNo);
      const itemMax = Math.max(dims.w || 1000, dims.l || 1000);

      if (itemMax > 1500) {
        has2m = true;
      } else if (itemMax > 1000) {
        has15m = true;
      }
    });

    if (has2m) return "1x2m";
    if (has15m) return "1x1.5m";
    return "1x1m"; // If all items <= 1000mm, strictly return 1x1m Pallet!
  }

  function getPalletTypeLabel(pType) {
    if (pType === "1x2m") return "1x2m Pallet";
    if (pType === "1x1.5m") return "1x1.5m Pallet";
    return "1x1m Pallet";
  }

  function getPalletType(partNo) {
    const dims = getPanelDimensions(partNo);
    const maxDim = Math.max(dims.w || 1000, dims.l || 1000);
    if (maxDim > 1500) return "1x2m";
    if (maxDim > 1000) return "1x1.5m";
    return "1x1m";
  }

  // Helper to determine allowed pallet types for a project:
  // 1. If project contains 2.0m panels (SL20, ST20...): Use ["1x2m", "1x1m"] ONLY (1x1.5m prohibited per user directive!)
  // 2. If project contains 1.5m panels (SL15, ST15...): Use ["1x1.5m", "1x1m"] ONLY (1x2m prohibited per user directive!)
  // 3. Otherwise (1.0m / 0.5m panels only): Use ["1x1m"] ONLY
  function getProjectAllowedPalletTypes(pList) {
    let has2m = false;
    let has15m = false;

    const list = (Array.isArray(pList) && pList.length > 0)
      ? pList
      : ((typeof pendingList !== 'undefined' && Array.isArray(pendingList) && pendingList.length > 0)
        ? pendingList
        : (typeof bomItems !== 'undefined' && Array.isArray(bomItems) ? bomItems : []));

    list.forEach(item => {
      if (!item) return;
      const dims = getPanelDimensions(item.partNo);
      const maxDim = Math.max(dims.w || 1000, dims.l || 1000);
      if (maxDim > 1500) has2m = true;
      else if (maxDim > 1000) has15m = true;
    });

    const res = [];
    if (has2m) res.push("1x2m");
    if (has15m) res.push("1x1.5m");
    res.push("1x1m");
    return res;
  }

  function getPalletTypeForProject(partNo, allowedPalletTypes) {
    const dims = getPanelDimensions(partNo);
    const maxDim = Math.max(dims.w || 1000, dims.l || 1000);

    if (maxDim > 1500) return "1x2m";
    if (maxDim > 1000) {
      if (allowedPalletTypes && allowedPalletTypes.includes("1x2m")) return "1x2m";
      return "1x1.5m";
    }
    return "1x1m";
  }

  // Panel Type Classifications per User Specification:
  // Inspect ONLY the first 4 characters of panel part numbers (SLXX, STXX, PFXX, PHXX, BFXX, RFXX, MFXX, NHXX...)
  function isBFPanel(partNo) {
    const tag4 = (partNo || "").toUpperCase().trim().substring(0, 4);
    return tag4.startsWith("BF");
  }

  function isRoofOrManholePanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (pNo.startsWith("RF") || pNo.startsWith("MF")) return true;
    const dims = getPanelDimensions(partNo);
    const name = (dims && dims.name ? dims.name : "").toLowerCase();
    return name.includes("roof") || name.includes("manhole") || name.includes("천정") || name.includes("맨홀");
  }

  function isBottomPanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (pNo.startsWith("BF")) return true;
    const dims = getPanelDimensions(partNo);
    const name = (dims && dims.name ? dims.name : "").toLowerCase();
    return name.includes("bottom") || name.includes("base") || name.includes("저판");
  }

  // Stacking sequence restriction rule (Pure DB & Physical Stacking Hierarchy):
  // Rank 0: Large 1.5m / 2.0m panels (maxDim > 1000mm) at VERY BOTTOM
  // Rank 1: Full 1.0m x 1.0m Side / Partition / Nozzle panels (minDim >= 1000mm)
  // Rank 2: Half / Quarter panels (minDim <= 500mm)
  // Rank 3: Bottom (BF) panels
  // Rank 4: Roof (RF) panels -> TOP LAYER (NO other panels can sit on top!)
  // Rank 5: Manhole (MF) panels -> ABSOLUTE VERY TOP (NO other panels can sit on top!)
  function getPanelStackingRank(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();

    if (pNo.startsWith("MF")) return 5;
    if (pNo.startsWith("RF") || isRoofOrManholePanel(partNo)) return 4;
    if (pNo.startsWith("BF") || isBottomPanel(partNo)) return 3;

    const dims = getPanelDimensions(partNo);
    const w = dims.w || 1000;
    const l = dims.l || 1000;
    const maxDim = Math.max(w, l);
    const minDim = Math.min(w, l);

    if (maxDim > 1000) {
      return 0;
    }
    if (minDim >= 1000) {
      return 1;
    }
    return 2;
  }

  function getTierCapacity(palletType, partNo) {
    const dims = getPanelDimensions(partNo);
    const w = dims.w || 1000;
    const l = dims.l || 1000;
    const maxDim = Math.max(w, l);
    const minDim = Math.min(w, l);
    const pType = palletType || (maxDim > 1500 ? "1x2m" : (maxDim > 1000 ? "1x1.5m" : "1x1m"));

    const palLength = (pType === "1x2m") ? 2000 : ((pType === "1x1.5m") ? 1500 : 1000);
    const palWidth = 1000;

    // 1. 0.5m x 0.5m Panels (w <= 500 AND l <= 500):
    if (w <= 500 && l <= 500) {
      const countW = Math.floor(palWidth / 500);   // 2
      const countL = Math.floor(palLength / 500);  // 2 (1x1m), 3 (1x1.5m), 4 (1x2m)
      return countW * countL; // 4 on 1x1m, 6 on 1x1.5m, 8 on 1x2m
    }

    // 2. Half-Width Panels (minDim <= 500 AND maxDim <= 1500):
    if (minDim <= 500 && maxDim <= 1500) {
      if (pType === "1x2m") return 4;
      if (pType === "1x1.5m") return 3;
      return 2;
    }

    // 3. 1.0m Panels on 1x2m Pallet (2 columns end-to-end along 2000mm length):
    if (pType === "1x2m" && maxDim <= 1000) {
      return 2;
    }

    // 4. Standard 1-column layout:
    return 1;
  }

  // Stacking sequence restriction & Roof/Manhole Topmost Surface Rule (User Directive):
  // Roof and Manhole panels MUST be placed at the VERY TOP of the pallet stack.
  // NO other panel (Side, Bottom, Nozzle, etc.) can EVER sit on top of Roof or Manhole panels!
  function canStackPanelOnPallet(pallet, partNoToPack) {
    if (!pallet || !pallet.items || pallet.items.length === 0) return true;

    const pType = getActualPalletTypeForPallet(pallet);
    const tiers = expandPalletItemsToTiers(pallet);
    if (tiers.length === 0) return true;

    const topTier = tiers[tiers.length - 1];
    const topPartNo = topTier.subItems[topTier.subItems.length - 1].partNo;

    const topRank = getPanelStackingRank(topPartNo);
    const newRank = getPanelStackingRank(partNoToPack);

    if (newRank < topRank) {
      return false; // Cannot stack a lower rank panel (e.g. Side, Bottom) on top of a higher rank panel (e.g. Roof, Manhole)!
    }

    // Strict Roof/Manhole Rule: If top tier is Roof or Manhole, ONLY another Roof or Manhole panel can be stacked on top!
    if (isRoofOrManholePanel(topPartNo) && !isRoofOrManholePanel(partNoToPack)) {
      return false; // REJECT! No other panel category can sit on top of Roof or Manhole panels!
    }

    // Incomplete Tier Rule: If top tier is NOT full, allow stacking if same capacity & higher/equal rank
    if (!topTier.isFull) {
      const topCap = topTier.capacity;
      const newCap = getTierCapacity(pType, partNoToPack);

      if ((newRank <= 1 && topRank <= 1) || (newCap === topCap && newRank >= topRank)) {
        return true;
      }
      return false;
    }

    return true;
  }

  // Mandatory Physical Safety Validation Engine:
  // 1. Roof and Manhole panels MUST be at the very top of the pallet stack (no non-Roof/Manhole panel above them).
  // 2. An intermediate tier layer (any tier from 1 to N-1) CANNOT be incomplete (!isFull) if a mismatching panel category is stacked on top.
  function isPalletPhysicallyValid(pallet) {
    if (!pallet || !pallet.items || pallet.items.length <= 1) return true;
    const tiers = expandPalletItemsToTiers(pallet);
    if (tiers.length <= 1) return true;

    const pType = getActualPalletTypeForPallet(pallet);

    for (let i = 0; i < tiers.length - 1; i++) {
      const tier = tiers[i];
      const tierPartNo = tier.subItems[0].partNo;
      const nextTier = tiers[i + 1];
      const nextPartNo = nextTier.subItems[0].partNo;

      // Strict Roof/Manhole Rule: An intermediate tier CANNOT contain Roof or Manhole panels if the tier above it is NOT Roof or Manhole!
      if (isRoofOrManholePanel(tierPartNo) && !isRoofOrManholePanel(nextPartNo)) {
        return false; // REJECT! Roof and Manhole panels must be at the very top of the pallet stack!
      }

      if (!tier.isFull) {
        const tierRank = getPanelStackingRank(tierPartNo);
        const nextRank = getPanelStackingRank(nextPartNo);

        const tierCap = getTierCapacity(pType, tierPartNo);
        const nextCap = getTierCapacity(pType, nextPartNo);

        if (nextRank < tierRank || (tierCap !== nextCap && nextRank !== tierRank)) {
          return false; // REJECT! Cannot stack a lower-rank or mismatching footprint panel on an incomplete tier!
        }
      }
    }

    return true;
  }

  // Helper to determine if a panel is Bottom (저판) or Roof (천정) for height calculation
  function isBottomOrRoof(partNo, dims) {
    if (isBFPanel(partNo) || isRFPanel(partNo)) return true;
    const name = (dims && dims.name ? dims.name : "").toLowerCase();
    if (name.includes("bottom") || name.includes("base") || name.includes("roof") || name.includes("manhole") || name.includes("저판") || name.includes("천정")) {
      return true;
    }
    return false;
  }

  // Calculate cumulative nested height of a stack of panels on a pallet
  // User Directive: "패킹최상단은 최상판판넬의 Ht값으로 계산해주세요." (Topmost tier uses topmost panel Ht!)
  function calculatePalletHeight(palletItems, defaultHt, defaultFh, Ph, palletType) {
    if (!palletItems || palletItems.length === 0) return 0;
    
    let baseH = (Ph != null) ? Ph : 150;
    const resolvedPalletType = palletType || getActualPalletTypeForPallet({ items: palletItems });

    let totalTiers = 0;
    let topmostHt = defaultHt || 80;
    let fallbackFh = defaultFh || 70;

    for (let i = 0; i < palletItems.length; i++) {
      const item = palletItems[i];
      if (!item || item.qty <= 0) continue;
      const cap = getTierCapacity(resolvedPalletType, item.partNo);
      const tiersCount = Math.ceil(item.qty / (cap > 0 ? cap : 1));
      totalTiers += tiersCount;

      const dims = getPanelDimensions(item.partNo);
      const pHt = (dims && dims.ht > 0) ? dims.ht : (defaultHt || 80);
      const pFh = (dims && dims.fh > 0) ? dims.fh : (defaultFh || 70);
      if (pHt > topmostHt) topmostHt = pHt;
      if (pFh > fallbackFh) fallbackFh = pFh;
    }

    if (totalTiers === 0) return 0;
    const calcH = baseH + (totalTiers - 1) * fallbackFh + topmostHt;
    return Math.round(calcH * 10) / 10;
  }

  // Helper to identify if an item is a panel
  function isPanelItem(item) {
    if (!item || !item.partNo) return false;
    const cat = (item.category || "").toUpperCase().trim();
    if (cat.includes("PANEL")) return true;
    const pNo = (item.partNo || "").toUpperCase().trim();
    if (/^(GW|GR|MH|GF|GD|SL|ST|SF|RF|MF|BF|NF|NH|NQ|PF|PH)\d?/.test(pNo)) return true;
    return false;
  }

  function syncPendingFromBOM() {
    invalidateCache();

    let sourceBom = (typeof window !== 'undefined' && Array.isArray(window.bomItems)) ? window.bomItems : ((typeof bomItems !== 'undefined' && Array.isArray(bomItems)) ? bomItems : []);
    if (!sourceBom || sourceBom.length === 0) {
      pendingList = [];
      pallets = [];
      if (typeof renderPendingTable === 'function') renderPendingTable();
      if (typeof renderPalletsDashboard === 'function') renderPalletsDashboard();
      return;
    }

    // Group and consolidate items similar to updatePrintoutSheet grouping logic
    const itemMap = {};
    const consolidatedList = [];

    sourceBom.forEach(item => {
      if (!isPanelItem(item)) return;

      const pNo = (item.partNo || "").toUpperCase().trim();
      const pName = (item.partName || "").trim();
      const key = `${pNo}::${pName}`;

      if (itemMap[key]) {
        itemMap[key].qty += Number(item.qty) || 0;
      } else {
        itemMap[key] = {
          partNo: item.partNo,
          category: item.category,
          partName: item.partName,
          qty: Number(item.qty) || 0
        };
        consolidatedList.push(itemMap[key]);
      }
    });

    // Calculate total packed quantity per partNo across all current active pallets
    const alreadyPackedMap = {};
    if (Array.isArray(pallets)) {
      pallets.forEach(p => {
        if (Array.isArray(p.items)) {
          p.items.forEach(item => {
            const pNo = (item.partNo || "").toUpperCase().trim();
            alreadyPackedMap[pNo] = (alreadyPackedMap[pNo] || 0) + (Number(item.qty) || 0);
          });
        }
      });
    }

    pendingList = consolidatedList.map(item => {
      const pNo = (item.partNo || "").toUpperCase().trim();
      const packedQty = alreadyPackedMap[pNo] || 0;
      const totalQty = item.qty;
      const pendingQty = Math.max(0, totalQty - packedQty);
      return {
        partNo: item.partNo,
        category: item.category,
        partName: item.partName,
        totalQty: totalQty,
        pendingQty: pendingQty
      };
    });

    renderPendingTable();
    renderPalletsDashboard();
  }

  // Helper to determine required Pallet Dimension Spec
  function getPalletType(partNo) {
    const dims = getPanelDimensions(partNo);
    const maxDim = Math.max(dims.w || 1000, dims.l || 1000);
    if (maxDim > 1500) return "1x2m";
    if (maxDim > 1000) return "1x1.5m";
    return "1x1m";
  }

  function getPalletTypeLabel(palletType) {
    if (palletType === "1x2m") return "1x2m Pallet";
    if (palletType === "1x1.5m") return "1x1.5m Pallet";
    return "1x1m Pallet";
  }

  function renderPendingTable() {
    const tbody = document.getElementById("tbodyPackingPending");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pendingList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" align="center" style="color:var(--text-secondary);">No pending panels. Please generate BOM first.</td></tr>`;
      return;
    }

    pendingList.forEach((item, idx) => {
      if (item.pendingQty <= 0) return;
      const dims = getPanelDimensions(item.partNo);
      const itemPalletType = getPalletType(item.partNo);
      const eligiblePallets = pallets.filter(p => !p.palletType || p.palletType === itemPalletType);

      const dbBadge = (!dims.hasDbData)
        ? `<span onclick="if(window.openMasterDbAddDialog)window.openMasterDbAddDialog('${item.partNo}', '${item.partName}');" style="font-size:10px; color:#ef4444; background:#fee2e2; border:1px solid #fca5a5; padding:1px 5px; border-radius:3px; font-weight:bold; margin-left:4px; cursor:pointer;" title="Click to register this missing part in Master DB">No DB Data (Pending)</span>`
        : `<span style="font-size:10px; color:#0284c7; background:#e0f2fe; padding:1px 4px; border-radius:3px;">${getPalletTypeLabel(itemPalletType)}</span>`;

      const addDbBtn = `<button type="button" class="btn btn-sm" onclick="if(window.openMasterDbAddDialog)window.openMasterDbAddDialog('${item.partNo}', '${item.partName}')" style="background:#0284c7; color:#fff; font-size:10px; font-weight:bold; padding:2px 6px; border-radius:4px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:3px;" title="Register/Edit in Master DB"><i class="fa-solid fa-database"></i> + Master DB</button>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: bold; cursor: pointer; color: #0284c7; text-decoration: underline;" onclick="if(window.openMasterDbAddDialog)window.openMasterDbAddDialog('${item.partNo}', '${item.partName}')" title="Click to view/register in Master DB">${item.partNo}</td>
        <td><span onclick="if(window.openMasterDbAddDialog)window.openMasterDbAddDialog('${item.partNo}', '${item.partName}')" style="cursor:pointer;" title="Click to view/register in Master DB">${item.partName}</span> ${dbBadge}</td>
        <td style="font-weight: bold; color: var(--neon-blue); text-align: center;">${item.pendingQty} / ${item.totalQty}</td>
        <td align="center">
          <div style="display: flex; gap: 4px; align-items: center; justify-content: center;">
            <select class="pallet-select" style="font-size: 11px; padding: 2px;">
              <option value="">-- Select --</option>
              ${eligiblePallets.map(p => `<option value="${p.id}">Pallet #${p.id} (${getPalletTypeLabel(p.palletType || itemPalletType)})</option>`).join('')}
            </select>
            <input type="number" class="qty-input" value="1" min="1" max="${item.pendingQty}" style="width: 40px; padding: 2px; text-align: right; font-size: 11px;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.PalletPacking.manualPack(${idx})" style="padding: 2px 6px; font-size: 10px;">Pack</button>
            ${addDbBtn}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Helper to determine panel family code (User Directive: "SL15XX는 SL15가 같으면 같은 판넬입니다.")
  function getPanelFamilyCode(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (pNo.length >= 4) {
      return pNo.substring(0, 4); // First 4 characters (e.g. SL15, SL20, ST15, BF20, RF00, MF00, NH10)
    }
    return pNo;
  }

  // Helper to format panel width x length dimensions label (e.g. [1x1.5m], [0.93x1m], [0.5x1m], [0.5x0.5m])
  function getPanelDimLabel(partNo) {
    if (!partNo) return "";
    const dims = getPanelDimensions(partNo);
    const w = (dims && dims.w != null) ? (dims.w / 1000) : 1;
    const l = (dims && dims.l != null) ? (dims.l / 1000) : 1;
    return `[${w}x${l}m]`;
  }

  // Helper to group consecutive identical tier layers (e.g. 2~22단: BF50BX x21 pcs)
  // User Directive: "최상단 판넬을 별도로 단을 설정해서, Ht로 합쳐주세요." (Topmost tier N단 MUST BE SEPARATED as its own tier box!)
  function groupConsecutiveTiers(tiers) {
    if (!Array.isArray(tiers) || tiers.length === 0) return [];
    const grouped = [];
    let currentGroup = null;
    const totalCount = tiers.length;

    tiers.forEach((tier, tIdx) => {
      const tierNum = tIdx + 1;
      const isTopmost = (tierNum === totalCount);
      const subList = tier.subItems || [{ partNo: tier.partNo, qty: tier.qty }];
      const partsKey = subList.map(s => `${getPanelFamilyCode(s.partNo)}x${s.qty}`).join("+");

      // Topmost tier MUST NOT be merged with lower tiers, so close lower group when reaching topmost tier!
      if (!isTopmost && currentGroup && currentGroup.partsKey === partsKey) {
        currentGroup.endTier = tierNum;
        currentGroup.totalTierPcs += (tier.totalQty || tier.qty);
        currentGroup.tierCount += 1;
        subList.forEach(s => {
          const ex = currentGroup.accumulatedSubItems.find(a => a.partNo === s.partNo);
          if (ex) ex.qty += s.qty;
          else currentGroup.accumulatedSubItems.push({ partNo: s.partNo, qty: s.qty });
        });
      } else {
        if (currentGroup) grouped.push(currentGroup);
        const initialSubs = subList.map(s => ({ partNo: s.partNo, qty: s.qty }));
        currentGroup = {
          startTier: tierNum,
          endTier: tierNum,
          familyCode: getPanelFamilyCode(subList[0].partNo),
          partsKey: partsKey,
          subItems: subList,
          accumulatedSubItems: initialSubs,
          singleTierQty: (tier.totalQty || tier.qty),
          totalTierPcs: (tier.totalQty || tier.qty),
          capacity: tier.capacity,
          isFull: tier.isFull,
          tierCount: 1,
          isTopmost: isTopmost
        };
      }
    });

    if (currentGroup) grouped.push(currentGroup);
    return grouped;
  }

  // Helper to retrieve unit weight of a panel from partsDb or dimension estimation
  function getPanelUnitWeight(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (typeof partsDb !== 'undefined' && Array.isArray(partsDb)) {
      const match = partsDb.find(p => (p.partNo || "").toUpperCase().trim() === pNo);
      if (match && (match.unitWeight != null || match.weight != null)) {
        const wVal = parseFloat(match.unitWeight || match.weight);
        if (!isNaN(wVal) && wVal > 0) return wVal;
      }
    }

    const dims = getPanelDimensions(partNo);
    const maxDim = Math.max(dims.w || 1000, dims.l || 1000);
    const minDim = Math.min(dims.w || 1000, dims.l || 1000);

    if (minDim <= 500 && maxDim <= 500) return 3.5;
    if (maxDim > 1500) return 25.0;
    if (maxDim > 1000) return 18.5;
    return 12.5;
  }

  // Helper to get wooden pallet tare weight based on pallet type and UI input controls
  function getWoodenPalletTareWeight(palletType) {
    const pType = palletType || "1x1m";
    if (pType === "1x2m") {
      const val = parseFloat(document.getElementById("packPalletW1x2")?.value);
      return !isNaN(val) ? val : 45.0;
    }
    if (pType === "1x1.5m") {
      const val = parseFloat(document.getElementById("packPalletW1x15")?.value);
      return !isNaN(val) ? val : 35.0;
    }
    const val = parseFloat(document.getElementById("packPalletW1x1")?.value);
    return !isNaN(val) ? val : 25.0;
  }

  // Helper to calculate total pallet weight (Net Panel Weight + Wooden Pallet Tare Weight)
  function calculatePalletWeightDetails(pallet) {
    if (!pallet || !pallet.items) {
      return { netWeight: 0, tareWeight: 0, totalWeight: 0 };
    }

    const pType = getActualPalletTypeForPallet(pallet);
    const tareWeight = getWoodenPalletTareWeight(pType);

    let netWeight = 0;
    pallet.items.forEach(item => {
      const unitW = getPanelUnitWeight(item.partNo);
      netWeight += (item.qty || 0) * unitW;
    });

    netWeight = Math.round(netWeight * 10) / 10;
    const totalWeight = Math.round((netWeight + tareWeight) * 10) / 10;

    return {
      netWeight,
      tareWeight,
      totalWeight
    };
  }

  function renderPalletsDashboard() {
    const container = document.getElementById("palletDashboardList") || document.getElementById("palletsDashboard");
    if (!container) return;
    container.innerHTML = "";

    const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
    const Fh = parseFloat(document.getElementById("packFh")?.value) || 70;
    const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
    const limit = parseFloat(document.getElementById("packLimit")?.value) || 2000;

    if (pallets.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 30px; border: 1.5px dashed var(--border-color); border-radius: 8px;">No active pallets. Click [Add New Pallet] or [Run Auto-Packing].</div>`;
      return;
    }

    pallets.forEach(pallet => {
      pallet.palletType = getActualPalletTypeForPallet(pallet);
      const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph, pallet.palletType);
      const weightDetails = calculatePalletWeightDetails(pallet);
      const hPercent = Math.min((finalH / limit) * 100, 100);
      const limitExceeded = finalH > limit;
      
      const card = document.createElement("div");
      card.className = "widget-card glow-card";
      card.style.borderColor = limitExceeded ? "var(--neon-rose)" : "rgba(16, 185, 129, 0.4)";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.gap = "8px";
      card.style.background = "#ffffff";
      card.style.padding = "14px";
      card.style.borderRadius = "10px";

      let statusColor = "#10b981";
      if (limitExceeded) statusColor = "var(--neon-rose)";
      else if (finalH > 1700) statusColor = "#f59e0b"; // warning orange

      // Expand pallet items into individual physical height tiers (1단, 2단, 3단 ... N단)
      const tiers = expandPalletItemsToTiers(pallet);
      // Group consecutive identical tier layers (e.g. 10~20단)
      const groupedTiers = groupConsecutiveTiers(tiers);

      // Pre-compute real-time DB height increments and cumulative height for each tier
      let runningH = Ph;
      const tierCumHeights = [];
      const tierStepHeights = [];
      const numTiersCount = tiers.length;

      tiers.forEach((t, idx) => {
        const isTop = (idx === numTiersCount - 1);
        const pNo = (t.subItems && t.subItems[0]) ? t.subItems[0].partNo : (t.partNo || "");
        const dims = getPanelDimensions(pNo);
        const panelHt = (dims && dims.ht != null && dims.ht > 0) ? dims.ht : (Ht || 80);
        const panelFh = (dims && dims.fh != null && dims.fh > 0) ? dims.fh : (Fh || 70);
        const stepH = isTop ? panelHt : panelFh;
        runningH += stepH;
        tierStepHeights.push({ h: stepH, isTop });
        tierCumHeights.push(Math.round(runningH * 10) / 10);
      });

      let stackVisualHtml = '<div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; display: flex; flex-direction: column-reverse; gap: 4px; max-height: 480px; overflow-y: auto; justify-content: flex-start;">';
      if (groupedTiers.length === 0) {
        stackVisualHtml += '<div style="font-size: 11px; color:#94a3b8; font-style:italic; text-align:center; padding-top:25px;">Empty</div>';
      } else {
        const totalTiersCount = tiers.length;

        groupedTiers.forEach((group) => {
          let layerBg = "rgba(16, 185, 129, 0.1)";
          let layerBorder = "#10b981";
          let layerTextColor = "#065f46";

          const topPartNo = group.subItems[0].partNo;
          const pNo = topPartNo.toUpperCase();
          if (pNo.startsWith("MF")) {
            layerBg = "rgba(168, 85, 247, 0.12)"; // Purple for Manhole (Top)
            layerBorder = "#a855f7";
            layerTextColor = "#6b21a8";
          } else if (pNo.startsWith("RF")) {
            layerBg = "rgba(59, 130, 246, 0.12)"; // Blue for Roof
            layerBorder = "#3b82f6";
            layerTextColor = "#1e40af";
          } else if (pNo.startsWith("BF") || pNo.startsWith("NF")) {
            layerBg = "rgba(245, 158, 11, 0.12)"; // Yellow for Bottom/Drain
            layerBorder = "#f59e0b";
            layerTextColor = "#92400e";
          } else if (group.startTier === 1) {
            layerBg = "rgba(16, 185, 129, 0.15)"; // Green for Base (Bottom)
            layerBorder = "#10b981";
            layerTextColor = "#065f46";
          }

          const isTopmostGroup = group.isTopmost || (group.endTier === totalTiersCount);

          let tierTag = "";
          if (group.startTier === 1 && group.endTier === 1 && totalTiersCount === 1) {
            tierTag = `1단 (Top/Bottom)`;
          } else if (group.startTier === 1) {
            tierTag = (group.endTier === 1) ? `1단 (Bottom)` : `1~${group.endTier}단 (Bottom)`;
          } else if (isTopmostGroup) {
            tierTag = `${group.endTier}단 (Top)`;
          } else {
            tierTag = (group.startTier === group.endTier) ? `${group.startTier}단` : `${group.startTier}~${group.endTier}단`;
          }

          const uniquePartNos = group.accumulatedSubItems ? group.accumulatedSubItems.map(a => a.partNo) : group.subItems.map(s => s.partNo);
          let partsText = "";
          if (uniquePartNos.length === 1) {
            const pNo = uniquePartNos[0];
            const dimLbl = getPanelDimLabel(pNo);
            partsText = `${pNo} <span style="font-weight:700; color:#0284c7; font-size:10.5px;">${dimLbl}</span> x${group.totalTierPcs} ${group.totalTierPcs > 1 ? 'pcs' : 'pc'}`;
          } else {
            const family = group.familyCode || uniquePartNos[0].substring(0, 4);
            const detailStr = group.accumulatedSubItems.map(a => `${a.partNo} <span style="color:#0284c7;">${getPanelDimLabel(a.partNo)}</span> x${a.qty}`).join(", ");
            partsText = `${family} x${group.totalTierPcs} pcs <span style="font-size:10px; opacity:0.9;">(${detailStr})</span>`;
          }

          // Compute exact Fh / Ht increment and cumulative height for this UI group row
          const endTierIdx = group.endTier - 1;
          const endCumH = tierCumHeights[endTierIdx];
          const groupPartNo = uniquePartNos[0] || topPartNo;
          const dims = getPanelDimensions(groupPartNo);
          const panelHt = (dims && dims.ht != null && dims.ht > 0) ? dims.ht : (Ht || 80);
          const panelFh = (dims && dims.fh != null && dims.fh > 0) ? dims.fh : (Fh || 70);

          let hLabel = "";
          let badgeBg = "#e0f2fe";
          let badgeBorder = "#bae6fd";
          let badgeColor = "#0284c7";

          if (isTopmostGroup) {
            hLabel = `Ht +${panelHt}mm (Top Ht)`;
            badgeBg = "#fef3c7";
            badgeBorder = "#fde68a";
            badgeColor = "#b45309";
          } else {
            hLabel = group.tierCount > 1 ? `Fh +${panelFh}mm/단` : `Fh +${panelFh}mm`;
          }

          const tierCountNote = group.tierCount > 1 ? `<span style="font-size:10px; color:${layerTextColor}; font-weight:700;">(${group.tierCount}개 단)</span>` : "";
          const heightDetailBadge = `<span style="font-size:9.5px; font-weight:800; color:${badgeColor}; background: ${badgeBg}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${badgeBorder};">${hLabel} | 누계 ${endCumH}mm</span>`;

          stackVisualHtml += `
            <div style="background: ${layerBg}; border: 1px solid ${layerBorder}; padding: 5px 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="background: ${layerBorder}; color: #ffffff; font-size: 9.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.2px;">${tierTag}</span>
                <span style="font-family: monospace; font-weight:700; color:${layerTextColor};">${partsText}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${tierCountNote}
                ${heightDetailBadge}
              </div>
            </div>
          `;
        });
      }
      stackVisualHtml += '</div>';

      const pTypeSpec = pallet.palletType || (pallet.items[0] ? getPalletType(pallet.items[0].partNo) : "1x1m");
      const pTypeBadge = getPalletTypeLabel(pTypeSpec);

      let graphicSvgHtml = "";
      if (typeof window.VisualLayerStacking !== 'undefined' && typeof window.VisualLayerStacking.renderPalletLayerDiagramContainer === 'function') {
        graphicSvgHtml = window.VisualLayerStacking.renderPalletLayerDiagramContainer(pallet, { Ht, Fh, Ph, limit });
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <strong style="color: var(--text-primary); font-size: 14px;">Pallet #${pallet.id}</strong>
            <span style="font-size: 11px; padding: 3px 8px; border-radius: 6px; background: #0284c7; color: #ffffff; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
              ${pTypeBadge}
            </span>
          </div>
          <span style="font-size: 10px; padding: 2px 6px; border-radius: 20px; background: ${statusColor}15; color: ${statusColor}; font-weight: bold;">
            ${limitExceeded ? "Exceeds Limit" : "Safe Load"}
          </span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color: var(--text-secondary);">
          <span>Stacked Height: <strong style="color: ${statusColor}; font-size:12.5px;">${finalH.toFixed(0)}mm</strong> / ${limit}mm</span>
          <span>Gross Weight: <strong style="color: #0284c7; font-size:12.5px;">${weightDetails.totalWeight.toFixed(1)}kg</strong></span>
        </div>
        <div style="font-size:10px; color: #64748b; text-align: right; margin-top: -4px;">
          (Panels: ${weightDetails.netWeight.toFixed(1)}kg + Wooden Pallet: ${weightDetails.tareWeight.toFixed(1)}kg)
        </div>

        <!-- Height visual progress bar -->
        <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
          <div style="width: ${hPercent}%; height: 100%; background: ${statusColor}; border-radius: 4px;"></div>
        </div>

        <!-- Graphic Blueprint Diagram & Tier List Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;">
          <div onclick="if(window.VisualLayerStacking) window.VisualLayerStacking.openPalletDiagramById(${pallet.id})" style="cursor: pointer; position: relative;" title="클릭하면 고해상도 도면을 크게 볼 수 있습니다.">
            <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
              <span><i class="fa-solid fa-layer-group"></i> 층별 도면</span>
              <span class="btn btn-sm btn-primary" style="font-size: 9.5px; padding: 1px 6px; height: 20px; line-height: 18px; border-radius: 4px; background: #0284c7; color: #ffffff; font-weight: 700; border: none; flex-shrink: 0;"><i class="fa-solid fa-magnifying-glass-plus"></i> 크게 보기</span>
            </div>
            ${graphicSvgHtml}
          </div>
          <div>
            <div style="font-size: 10.5px; font-weight: 800; color: #475569; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-list-check"></i> 적재 자재 목록 (Tier Items)
            </div>
            ${stackVisualHtml}
          </div>
        </div>

        <div style="display:flex; justify-content: flex-end; margin-top: 4px;">
          <button type="button" class="btn btn-sm btn-outline" onclick="window.PalletPacking.deletePallet(${pallet.id})" style="border-color: var(--neon-rose); color: var(--neon-rose); padding: 2px 8px; font-size: 11px;"><i class="fa-solid fa-trash-can"></i> Delete Pallet</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function addPallet(pType) {
    pallets.push({
      id: nextPalletId++,
      palletType: pType || null,
      items: []
    });
    renderPendingTable();
    renderPalletsDashboard();
  }

  function deletePallet(palletId) {
    const idx = pallets.findIndex(p => p.id === palletId);
    if (idx !== -1) {
      pallets[idx].items.forEach(item => {
        const pendingItem = pendingList.find(p => p.partNo === item.partNo);
        if (pendingItem) {
          pendingItem.pendingQty += item.qty;
        }
      });
      pallets.splice(idx, 1);
      renderPendingTable();
      renderPalletsDashboard();
    }
  }

  function manualPack(pendingIdx) {
    const select = document.querySelectorAll("#tbodyPackingPending select.pallet-select")[pendingIdx];
    const qtyInput = document.querySelectorAll("#tbodyPackingPending input.qty-input")[pendingIdx];
    if (!select || !qtyInput) return;

    const palletId = parseInt(select.value, 10);
    const qty = parseInt(qtyInput.value, 10);

    if (!palletId) {
      alert("Please select a target pallet.");
      return;
    }
    if (!qty || qty <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }

    const pendingItem = pendingList[pendingIdx];
    if (!pendingItem || qty > pendingItem.pendingQty) {
      alert("Cannot pack more than the pending quantity.");
      return;
    }

    const pallet = pallets.find(p => p.id === palletId);
    if (!pallet) return;

    const itemPalletType = getPalletType(pendingItem.partNo);
    const targetPalletType = pallet.palletType || itemPalletType;

    if (!canFitPanelOnPallet(targetPalletType, pendingItem.partNo)) {
      const dims = getPanelDimensions(pendingItem.partNo);
      alert(`Dimension Mismatch Error: Panel [${pendingItem.partNo}] (${dims.l}mm length) CANNOT fit on a [${getPalletTypeLabel(targetPalletType)}]!\nSL15 (1.5m length) panels MUST be packed on a 1x1.5m or 1x2m Pallet.`);
      return;
    }

    if (!canStackPanelOnPallet(pallet, pendingItem.partNo)) {
      alert(`Stacking restriction: Side/Flat/Side-nozzle panels cannot be stacked on top of Bottom panels.\n(Only Roof panels or other Bottom panels can be stacked above a Bottom panel.)`);
      return;
    }

    if (!pallet.palletType) {
      pallet.palletType = itemPalletType;
    }

    // Stacking verification
    const Ht = parseFloat(document.getElementById("packHt").value) || 80;
    const Fh = parseFloat(document.getElementById("packFh").value) || 70;
    const Ph = parseFloat(document.getElementById("packPh").value) || 150;
    
    // Simulate height addition
    const testItems = JSON.parse(JSON.stringify(pallet.items));
    const existLayer = testItems.find(t => t.partNo === pendingItem.partNo);
    if (existLayer) {
      existLayer.qty += qty;
    } else {
      testItems.push({ partNo: pendingItem.partNo, qty: qty });
    }

    const limit = parseFloat(document.getElementById("packLimit")?.value) || 2000;
    const testH = calculatePalletHeight(testItems, Ht, Fh, Ph);
    if (testH > limit) {
      if (!confirm(`Warning: Adding this quantity will result in a total height of ${testH.toFixed(0)}mm, exceeding the shipping limit (${limit}mm). Continue?`)) {
        return;
      }
    }

    // Apply
    pendingItem.pendingQty -= qty;
    const realLayer = pallet.items.find(t => t.partNo === pendingItem.partNo);
    if (realLayer) {
      realLayer.qty += qty;
    } else {
      pallet.items.push({ partNo: pendingItem.partNo, qty: qty });
    }

    renderPendingTable();
    renderPalletsDashboard();
  }

  function unloadItem(palletId, layerIdx) {
    const pallet = pallets.find(p => p.id === palletId);
    if (!pallet) return;
    const item = pallet.items[layerIdx];
    if (!item) return;

    const pendingItem = pendingList.find(p => p.partNo === item.partNo);
    if (pendingItem) {
      pendingItem.pendingQty += item.qty;
    }

    pallet.items.splice(layerIdx, 1);
    if (pallet.items.length === 0) {
      delete pallet.palletType;
    }

    renderPendingTable();
    renderPalletsDashboard();
  }

  function canFitPanelOnPallet(palletType, panelPartNo) {
    if (!palletType) return true;
    const dims = getPanelDimensions(panelPartNo);
    const maxDim = Math.max(dims.w || 1000, dims.l || 1000);

    if (maxDim > 1500) {
      return palletType === "1x2m"; // 2.0m panels fit ONLY on 1x2m Pallets
    }
    if (maxDim > 1000) {
      return palletType === "1x1.5m" || palletType === "1x2m"; // 1.5m panels fit on 1x1.5m or 1x2m Pallets
    }
    return true; // 1.0m and 0.5m panels fit on all pallets
  }

  // Helper to sort pallet items according to strict physical stacking hierarchy (User Directives):
  // 1. 1.5m / 2.0m Foundation Panels (SL15, ST15, SL20, ST20) at VERY BOTTOM foundation (Rank 0)
  // 2. 1.0m / 0.5m Side & Partition & Nozzle panels (NH10, NH20, NQ10, SF10, NF15...) in MIDDLE (Rank 1)
  // 3. 1.0m Bottom panels (BF10, BF20...) in UPPER LAYER (Rank 2)
  // 4. 1.0m Roof panels (RF00...) in ROOF LAYER (Rank 3)
  // 5. Manhole panels (MF00...) at VERY TOP (Rank 4)
  function sortPalletItemsByHierarchy(items) {
    if (!Array.isArray(items) || items.length <= 1) return items;
    return items.slice().sort((a, b) => {
      const rankA = getPanelStackingRank(a.partNo);
      const rankB = getPanelStackingRank(b.partNo);
      if (rankA !== rankB) return rankA - rankB;

      // Secondary sort: Larger area panels FIRST (maxB - maxA / areaB - areaA)
      const dimsA = getPanelDimensions(a.partNo);
      const dimsB = getPanelDimensions(b.partNo);
      const areaA = (dimsA.w || 1000) * (dimsA.l || 1000);
      const areaB = (dimsB.w || 1000) * (dimsB.l || 1000);
      if (areaA !== areaB) return areaB - areaA;

      const pNoA = (a.partNo || "").toUpperCase().trim();
      const pNoB = (b.partNo || "").toUpperCase().trim();
      return pNoA.localeCompare(pNoB);
    });
  }

  // Helper to get tier area fraction for a part number based on physical panel dimensions and pallet area
  function getItemTierFraction(pType, partNo) {
    const dims = getPanelDimensions(partNo);
    const w = (dims && dims.w != null) ? dims.w : 1000;
    const l = (dims && dims.l != null) ? dims.l : 1000;
    const area = (w * l) / 1000000; // in m^2

    const palArea = (pType === "1x2m") ? 2.0 : ((pType === "1x1.5m") ? 1.5 : 1.0);
    const frac = area / palArea;
    return Math.min(1.0, Math.max(0.125, Math.round(frac * 1000) / 1000));
  }

  // Helper to expand pallet items into individual physical height tiers (1단, 2단, 3단... N단):
  // Performs top-up consolidation across compatible same-rank items so that intermediate tiers are fully filled!
  function expandPalletItemsToTiers(pallet) {
    if (!pallet || !pallet.items || pallet.items.length === 0) return [];
    
    const pType = getActualPalletTypeForPallet(pallet);
    const sortedItems = sortPalletItemsByHierarchy(pallet.items);
    const tiers = [];

    sortedItems.forEach(item => {
      const frac = getItemTierFraction(pType, item.partNo);
      const cap = getTierCapacity(pType, item.partNo);
      let remaining = item.qty;

      while (remaining > 0) {
        // Search for any open incomplete tier of compatible stacking rank that has room for at least 1 piece!
        const openTier = tiers.find(t => {
          if (t.isFull || (t.usedFraction || 0) >= 0.999) return false;
          const rankA = getPanelStackingRank(t.subItems[0].partNo);
          const rankB = getPanelStackingRank(item.partNo);

          const dimsA = getPanelDimensions(t.subItems[0].partNo);
          const dimsB = getPanelDimensions(item.partNo);
          const maxA = Math.max(dimsA.w || 1000, dimsA.l || 1000);
          const minA = Math.min(dimsA.w || 1000, dimsA.l || 1000);
          const maxB = Math.max(dimsB.w || 1000, dimsB.l || 1000);
          const minB = Math.min(dimsB.w || 1000, dimsB.l || 1000);

          // On 1x1.5m pallets: Allow 1x1m panel (1000x1000) + 0.5x1m panel (500x1000) side-by-side pairing to form a 100% full tier layer!
          const is1x1AndHalfPair = (pType === "1x1.5m") && (
            (maxA === 1000 && minA === 1000 && minB <= 500) ||
            (maxB === 1000 && minB === 1000 && minA <= 500)
          );

          const isCompatible = (rankA === rankB) || (rankA <= 3 && rankB <= 3) || is1x1AndHalfPair;
          if (!isCompatible) return false;

          const remFrac = 1.0 - (t.usedFraction || 0);
          return remFrac >= frac - 0.001;
        });

        if (openTier) {
          const remFrac = 1.0 - (openTier.usedFraction || 0);
          const spaceInUnits = Math.max(1, Math.floor((remFrac + 0.001) / frac));
          const add = Math.min(remaining, spaceInUnits);

          const ex = openTier.subItems.find(s => s.partNo === item.partNo);
          if (ex) ex.qty += add;
          else openTier.subItems.push({ partNo: item.partNo, qty: add });

          openTier.totalQty = (openTier.totalQty || 0) + add;
          openTier.usedFraction = (openTier.usedFraction || 0) + (add * frac);
          if (openTier.usedFraction >= 0.999) {
            openTier.isFull = true;
          }
          remaining -= add;
        } else {
          const maxPcsPerTier = Math.max(1, Math.floor((1.0 + 0.001) / frac));
          const add = Math.min(remaining, maxPcsPerTier);
          const usedFrac = add * frac;
          const newTier = {
            partNo: item.partNo,
            qty: add,
            totalQty: add,
            capacity: cap,
            usedFraction: usedFrac,
            isFull: usedFrac >= 0.999,
            subItems: [{ partNo: item.partNo, qty: add }]
          };
          tiers.push(newTier);
          remaining -= add;
        }
      }
    });

    return tiers;
  }

  // Helper to safely load items into active pallets without breaching height or mixing pallet sizes
  function pushToPalletWithLimit(pallet, partNo, qty, Ht, Fh, Ph, limit) {
    const items = (pallet && pallet.items) ? pallet.items : [];
    let found = false;
    const testItems = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      if (items[i].partNo === partNo) {
        testItems[i] = { partNo, qty: items[i].qty + qty };
        found = true;
      } else {
        testItems[i] = items[i];
      }
    }
    if (!found) {
      testItems.push({ partNo, qty });
    }

    // Re-sort testItems according to strict hierarchy (Side -> BF -> RF -> MF)
    const sortedTestItems = sortPalletItemsByHierarchy(testItems);
    const projectedPalletType = getActualPalletTypeForPallet({ items: sortedTestItems });

    // Footprint Fit Check for all items on projected pallet type
    for (let it of sortedTestItems) {
      if (!canFitPanelOnPallet(projectedPalletType, it.partNo)) {
        return false;
      }
    }

    // Physical Stacking Validation: ensure no incomplete tier exists underneath a higher-rank item
    if (!isPalletPhysicallyValid({ palletType: projectedPalletType, items: sortedTestItems })) {
      return false;
    }

    const projectedH = calculatePalletHeight(sortedTestItems, Ht, Fh, Ph, projectedPalletType);
    return projectedH <= limit;
  }

  // Helper to find maximum fitting quantity that maintains physical safety validation
  function getFitQty(pallet, partNo, availableQty, Ht, Fh, Ph, limit) {
    if (availableQty <= 0) return 0;
    const dims = getPanelDimensions(partNo);
    if (!dims.hasDbData || dims.w <= 0 || dims.l <= 0) return 0;

    const items = pallet.items || [];
    const pType = getActualPalletTypeForPallet(pallet);

    // Fast footprint & stacking hierarchy guard (checked ONCE in O(1))
    if (!canFitPanelOnPallet(pType, partNo)) return 0;
    if (!canStackPanelOnPallet(pallet, partNo)) return 0;

    const cap = getTierCapacity(pType, partNo);

    const helperCheckQty = (q) => {
      if (q <= 0) return false;
      return pushToPalletWithLimit(pallet, partNo, q, Ht, Fh, Ph, limit);
    };

    // 1. Calculate height math bounds to skip impossible large quantities instantly
    const currentH = calculatePalletHeight(items, Ht, Fh, Ph, pType);
    const availH = limit - currentH;
    if (availH <= 0) return 0;

    const panelFh = (dims.fh > 0) ? dims.fh : (Fh || 70);
    const maxTiers = Math.floor(availH / panelFh);
    if (maxTiers <= 0) return 0;

    const maxEstQty = Math.min(availableQty, Math.max(cap, maxTiers * cap));

    // 2. Check maxEstQty first
    if (helperCheckQty(maxEstQty)) {
      return maxEstQty;
    }

    // 3. Check full tier multiples descending from maxEstQty
    const startMultiples = Math.floor(maxEstQty / cap) * cap;
    for (let q = startMultiples; q > 0; q -= cap) {
      if (helperCheckQty(q)) {
        return q;
      }
    }

    // 4. Binary search fallback between 1 and maxEstQty
    let low = 1;
    let high = maxEstQty;
    let bestQ = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (helperCheckQty(mid)) {
        bestQ = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return bestQ;
  }

  // Helper to add quantity of a partNo to a pallet items array safely and sorted
  function addQtyToPallet(pallet, partNo, qty) {
    if (qty <= 0) return;
    if (!pallet.items) pallet.items = [];
    const ex = pallet.items.find(i => i.partNo === partNo);
    if (ex) ex.qty += qty;
    else pallet.items.push({ partNo, qty });
    pallet.items = sortPalletItemsByHierarchy(pallet.items);
  }

  // Optimized post-packing consolidation pass to merge under-filled pallets into minimum total pallets
  function consolidatePallets(palletsArray, Ht, Fh, Ph, limit) {
    if (!Array.isArray(palletsArray) || palletsArray.length <= 1) return;

    // Sort items on all pallets by hierarchy first
    palletsArray.forEach(p => {
      p.items = sortPalletItemsByHierarchy(p.items);
    });

    let improved = true;
    let iterations = 0;

    while (improved && iterations < 2) {
      improved = false;
      iterations++;

      // 1. Whole Pallet Merging Pass: Attempt to merge entire under-filled pallets into single pallets!
      for (let i = palletsArray.length - 1; i >= 0; i--) {
        const sourcePallet = palletsArray[i];
        if (!sourcePallet || !sourcePallet.items || sourcePallet.items.length === 0) continue;

        for (let j = 0; j < palletsArray.length; j++) {
          if (i === j) continue;
          const targetPallet = palletsArray[j];
          if (!targetPallet || !targetPallet.items) continue;

          // Fast height pruning: if combined minimum height exceeds limit + 50, skip heavy merging checks!
          const h1 = calculatePalletHeight(targetPallet.items, Ht, Fh, Ph, targetPallet.palletType);
          const h2 = calculatePalletHeight(sourcePallet.items, Ht, Fh, Ph, sourcePallet.palletType);
          if (h1 + h2 - Ph > limit + 50) continue;

          // Combine items
          const itemMap = {};
          [...targetPallet.items, ...sourcePallet.items].forEach(it => {
            const pNo = (it.partNo || "").toUpperCase().trim();
            itemMap[pNo] = (itemMap[pNo] || 0) + (Number(it.qty) || 0);
          });
          const combinedList = Object.keys(itemMap).map(pNo => ({ partNo: pNo, qty: itemMap[pNo] }));
          const sortedCombined = sortPalletItemsByHierarchy(combinedList);

          const combinedType = getActualPalletTypeForPallet({ items: sortedCombined });

          // Check footprint fit for all combined items
          let fitOk = true;
          for (let it of sortedCombined) {
            if (!canFitPanelOnPallet(combinedType, it.partNo)) {
              fitOk = false;
              break;
            }
          }
          if (!fitOk) continue;

          // Check cumulative height limit & physical safety validation
          const combinedH = calculatePalletHeight(sortedCombined, Ht, Fh, Ph, combinedType);
          if (combinedH <= limit) {
            const testPallet = { palletType: combinedType, items: sortedCombined };
            if (isPalletPhysicallyValid(testPallet)) {
              targetPallet.items = sortedCombined;
              targetPallet.palletType = combinedType;
              palletsArray.splice(i, 1);
              improved = true;
              break;
            }
          }
        }
        if (improved) break;
      }

      if (improved) continue;

      // 2. Partial Item Transfer Pass: Move top items from shorter pallets to fill remaining height on taller pallets!
      for (let i = palletsArray.length - 1; i >= 0; i--) {
        const sourcePallet = palletsArray[i];
        if (!sourcePallet || !sourcePallet.items || sourcePallet.items.length === 0) continue;

        for (let k = sourcePallet.items.length - 1; k >= 0; k--) {
          const sItem = sourcePallet.items[k];
          if (!sItem || sItem.qty <= 0) continue;

          for (let j = 0; j < palletsArray.length; j++) {
            if (i === j) continue;
            const targetPallet = palletsArray[j];
            if (!targetPallet || !targetPallet.items) continue;

            const targetH = calculatePalletHeight(targetPallet.items, Ht, Fh, Ph, targetPallet.palletType);
            if (targetH >= limit - 30) continue;

            if (!canFitPanelOnPallet(targetPallet.palletType || "1x1m", sItem.partNo) || !canStackPanelOnPallet(targetPallet, sItem.partNo)) continue;

            const fit = getFitQty(targetPallet, sItem.partNo, sItem.qty, Ht, Fh, Ph, limit);
            if (fit > 0) {
              const targetItemsCopy = targetPallet.items.map(it => ({ ...it }));
              const exist = targetItemsCopy.find(it => it.partNo === sItem.partNo);
              if (exist) exist.qty += fit;
              else targetItemsCopy.push({ partNo: sItem.partNo, qty: fit });

              const sortedTarget = sortPalletItemsByHierarchy(targetItemsCopy);
              const testTargetPallet = { palletType: getActualPalletTypeForPallet({ items: sortedTarget }), items: sortedTarget };

              if (isPalletPhysicallyValid(testTargetPallet)) {
                sItem.qty -= fit;
                if (sItem.qty <= 0) {
                  sourcePallet.items.splice(k, 1);
                }
                targetPallet.items = sortedTarget;
                targetPallet.palletType = testTargetPallet.palletType;
                improved = true;
                break;
              }
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
    }

    // Clean up empty pallets
    for (let i = palletsArray.length - 1; i >= 0; i--) {
      if (!palletsArray[i].items || palletsArray[i].items.length === 0) {
        palletsArray.splice(i, 1);
      }
    }

    palletsArray.forEach((p, idx) => {
      p.id = idx + 1;
    });
  }

  // Scenario execution engine with strict size isolation & optimization trial
  function executeScenarioEngine(scenarioCode, pList, Ht, Fh, Ph, limit) {
    let simNextId = 1;
    const simPallets = [];

    // Determine primary pallet dimension type for this project (e.g. "1x1.5m" for 1.5m tanks, "1x2m" for 2m tanks, "1x1m" for 1m tanks)
    const palletTypesOrder = getProjectAllowedPalletTypes(pList);
    const primaryPalletType = palletTypesOrder[0];

    if (scenarioCode === "A") {
      // Standard Mix (Side -> Bottom -> Roof) on Primary Pallet Size, sorted by size to maximize density!
      const sorted = pList.slice().sort((a, b) => {
        const rankA = getPanelStackingRank(a.partNo);
        const rankB = getPanelStackingRank(b.partNo);
        if (rankA !== rankB) return rankA - rankB;

        const dimsA = getPanelDimensions(a.partNo);
        const dimsB = getPanelDimensions(b.partNo);
        const maxA = Math.max(dimsA.w || 1000, dimsA.l || 1000);
        const maxB = Math.max(dimsB.w || 1000, dimsB.l || 1000);
        return maxB - maxA; // Larger panels first!
      });

      let currentPallet = { id: simNextId++, palletType: primaryPalletType, items: [] };
      simPallets.push(currentPallet);

      sorted.forEach(item => {
        while (item.pendingQty > 0) {
          const fit = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
          if (fit > 0) {
            addQtyToPallet(currentPallet, item.partNo, fit);
            item.pendingQty -= fit;
          } else {
            currentPallet = { id: simNextId++, palletType: primaryPalletType, items: [] };
            simPallets.push(currentPallet);
            const fit2 = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
            if (fit2 > 0) {
              addQtyToPallet(currentPallet, item.partNo, fit2);
              item.pendingQty -= fit2;
            } else {
              break;
            }
          }
        }
      });
    } else {
      palletTypesOrder.forEach(pType => {
        const typeItems = pList.filter(i => getPalletTypeForProject(i.partNo, palletTypesOrder) === pType && i.pendingQty > 0);
        if (typeItems.length === 0) return;

        if (scenarioCode === "B") {
        // Dedicated per PartNo
        typeItems.forEach(item => {
          if (item.pendingQty <= 0) return;
          let currentPallet = { id: simNextId++, palletType: pType, items: [] };
          simPallets.push(currentPallet);

          while (item.pendingQty > 0) {
            const fit = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
            if (fit > 0) {
              addQtyToPallet(currentPallet, item.partNo, fit);
              item.pendingQty -= fit;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              const fit2 = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
              if (fit2 > 0) {
                addQtyToPallet(currentPallet, item.partNo, fit2);
                item.pendingQty -= fit2;
              } else {
                break;
              }
            }
          }
        });
      } else if (scenarioCode === "C") {
        // Bottom Dedicated
        const bottomItems = typeItems.filter(item => {
          const pNo = item.partNo.toUpperCase();
          return pNo.startsWith("BF") || pNo.startsWith("NF");
        });
        const otherItems = typeItems.filter(item => !bottomItems.includes(item));

        const packList = (list) => {
          if (list.length === 0) return;
          let currentPallet = { id: simNextId++, palletType: pType, items: [] };
          simPallets.push(currentPallet);

          list.forEach(item => {
            while (item.pendingQty > 0) {
              const fit = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
              if (fit > 0) {
                addQtyToPallet(currentPallet, item.partNo, fit);
                item.pendingQty -= fit;
              } else {
                currentPallet = { id: simNextId++, palletType: pType, items: [] };
                simPallets.push(currentPallet);
                const fit2 = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
                if (fit2 > 0) {
                  addQtyToPallet(currentPallet, item.partNo, fit2);
                  item.pendingQty -= fit2;
                } else {
                  break;
                }
              }
            }
          });
        };
        packList(bottomItems);
        packList(otherItems);
      } else if (scenarioCode === "D") {
        // Roof & Bottom Pairing
        const roofList = typeItems.filter(item => isRoofPanel(item.partNo));
        const bottomList = typeItems.filter(item => isBottomPanel(item.partNo));

        let currentPallet = { id: simNextId++, palletType: pType, items: [] };
        simPallets.push(currentPallet);

        let hasPairs = true;
        while (hasPairs) {
          const activeRoof = roofList.find(r => r.pendingQty > 0);
          const activeBottom = bottomList.find(b => b.pendingQty > 0);

          if (activeRoof && activeBottom) {
            const testItems = currentPallet.items.map(it => ({ ...it }));
            const addOne = (arr, partNo) => {
              const ex = arr.find(a => a.partNo === partNo);
              if (ex) ex.qty += 1;
              else arr.push({ partNo, qty: 1 });
            };
            addOne(testItems, activeRoof.partNo);
            addOne(testItems, activeBottom.partNo);

            const testH = calculatePalletHeight(testItems, Ht, Fh, Ph);
            if (testH <= limit) {
              addQtyToPallet(currentPallet, activeRoof.partNo, 1);
              addQtyToPallet(currentPallet, activeBottom.partNo, 1);
              activeRoof.pendingQty -= 1;
              activeBottom.pendingQty -= 1;
            } else {
              if (currentPallet.items.length === 0) {
                hasPairs = false;
              } else {
                currentPallet = { id: simNextId++, palletType: pType, items: [] };
                simPallets.push(currentPallet);
              }
            }
          } else {
            hasPairs = false;
          }
        }

        const remaining = typeItems.filter(item => item.pendingQty > 0);
        remaining.forEach(item => {
          while (item.pendingQty > 0) {
            const fit = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
            if (fit > 0) {
              addQtyToPallet(currentPallet, item.partNo, fit);
              item.pendingQty -= fit;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              const fit2 = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
              if (fit2 > 0) {
                addQtyToPallet(currentPallet, item.partNo, fit2);
                item.pendingQty -= fit2;
              } else {
                break;
              }
            }
          }
        });
      } else { // Scenario E or fallback
        let currentPallet = { id: simNextId++, palletType: pType, items: [] };
        simPallets.push(currentPallet);

        typeItems.forEach(item => {
          while (item.pendingQty > 0) {
            const fit = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
            if (fit > 0) {
              addQtyToPallet(currentPallet, item.partNo, fit);
              item.pendingQty -= fit;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              const fit2 = getFitQty(currentPallet, item.partNo, item.pendingQty, Ht, Fh, Ph, limit);
              if (fit2 > 0) {
                addQtyToPallet(currentPallet, item.partNo, fit2);
                item.pendingQty -= fit2;
              } else {
                break;
              }
            }
          }
        });
      }
    });
  }

    const activePallets = simPallets.filter(p => p.items && p.items.length > 0);
    consolidatePallets(activePallets, Ht, Fh, Ph, limit);

    return {
      pallets: activePallets,
      pendingList: pList,
      nextPalletId: activePallets.length + 1
    };
  }

  // Automatic Packing Engine with Minimum Pallet Optimization
  function runAutoPack() {
    const btn = document.getElementById("btnAutoPack");
    if (btn && btn.dataset && !btn.dataset.packing) {
      btn.dataset.packing = "true";
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Packing...';
      btn.disabled = true;

      setTimeout(() => {
        try {
          runAutoPackInternal();
        } finally {
          btn.dataset.packing = "";
          btn.innerHTML = origHtml;
          btn.disabled = false;
        }
      }, 10);
      return;
    }
    runAutoPackInternal();
  }

  function runAutoPackInternal() {
    // 1. ALWAYS sync latest panels from BOM items
    syncPendingFromBOM();

    const scenarioEl = document.getElementById("packScenarioSelect");
    const scenario = scenarioEl ? scenarioEl.value : "AUTO";
    const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
    const Fh = parseFloat(document.getElementById("packFh")?.value) || 70;
    const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
    const limit = parseFloat(document.getElementById("packLimit")?.value) || 2000;

    // Reset pending items to full
    pendingList.forEach(item => {
      item.pendingQty = item.totalQty;
    });

    if (pendingList.length === 0 || pendingList.every(i => i.totalQty <= 0)) {
      alert("No pending panels found. Please generate BOM first.");
      return;
    }

    if (scenario === "AUTO") {
      // Run simulations across scenarios to find the MINIMUM total pallet count with ZERO leftover pending items
      const candidateScenarios = ["A", "C"];
      let bestResult = null;

      for (let scCode of candidateScenarios) {
        const simPending = JSON.parse(JSON.stringify(pendingList));
        const res = executeScenarioEngine(scCode, simPending, Ht, Fh, Ph, limit);
        
        const leftoverCount = res.pendingList.reduce((sum, item) => sum + (Number(item.pendingQty) || 0), 0);
        const count = res.pallets.length;
        let fillSum = 0;
        res.pallets.forEach(p => {
          fillSum += calculatePalletHeight(p.items, Ht, Fh, Ph) / limit;
        });
        const avgFill = count > 0 ? fillSum / count : 0;

        // Priority 1: Zero leftover pending items (leftoverCount === 0)
        // Priority 2: Minimum total pallet count
        // Priority 3: Maximum average fill density
        if (!bestResult ||
            leftoverCount < bestResult.leftoverCount ||
            (leftoverCount === bestResult.leftoverCount && count < bestResult.count) ||
            (leftoverCount === bestResult.leftoverCount && count === bestResult.count && avgFill > bestResult.avgFill)) {
          bestResult = {
            scenarioCode: scCode,
            leftoverCount: leftoverCount,
            count: count,
            avgFill: avgFill,
            res: res
          };
        }

        // Fast early exit: If Scenario A packed 100% of items with 0 leftover, it's 100% optimal!
        if (leftoverCount === 0) break;
      }

      if (bestResult) {
        pallets = bestResult.res.pallets;
        pendingList = bestResult.res.pendingList;
        nextPalletId = bestResult.res.nextPalletId;
        renderPendingTable();
        renderPalletsDashboard();
        return;
      }
    }

    // Direct single scenario run
    const simPending = JSON.parse(JSON.stringify(pendingList));
    const res = executeScenarioEngine(scenario, simPending, Ht, Fh, Ph, limit);
    pallets = res.pallets;
    pendingList = res.pendingList;
    nextPalletId = res.nextPalletId;

    renderPendingTable();
    renderPalletsDashboard();
  }

  function printPalletList() {
    openPackingListPreview();
  }

  function getFormattedTankSizeString() {
    const formulaEl = document.getElementById("statSizeFormula");
    if (formulaEl && formulaEl.textContent && formulaEl.textContent.trim()) {
      return formulaEl.textContent.trim();
    }

    const l1 = parseFloat(document.getElementById("tankLength1")?.value) || 0;
    const l2 = parseFloat(document.getElementById("tankLength2")?.value) || 0;
    const l3 = parseFloat(document.getElementById("tankLength3")?.value) || 0;
    const l4 = parseFloat(document.getElementById("tankLength4")?.value) || 0;
    const w = parseFloat(document.getElementById("tankWidth")?.value) || 0;
    const h = parseFloat(document.getElementById("tankHeight")?.value) || 0;

    const validLengths = [l1, l2, l3, l4].filter(val => val > 0);
    const totalLength = validLengths.reduce((sum, val) => sum + val, 0) || (l1 || 2);
    const resolvedW = w > 0 ? w : 2;
    const resolvedH = h > 0 ? h : 2;

    let lengthDesc = `${totalLength}m(L)`;
    if (validLengths.length > 1) {
      lengthDesc = `${totalLength}(${validLengths.join('+')})m(L)`;
    }

    return `${lengthDesc} * ${resolvedW}m(W) * ${resolvedH}m(H)`;
  }

  function generatePackingListSheetHTML() {
    const deliverTo = document.getElementById("deliveredTo")?.value || "A Location";
    const customerName = document.getElementById("customerName")?.value || "MEP";
    const orderNo = document.getElementById("ipoNo")?.value || "WA-2022-01";
    const orderDate = document.getElementById("orderDate")?.value || new Date().toISOString().slice(0,10);
    const isInsulated = document.getElementById("insulationType")?.value === "insulated" ? "Insulated" : "Non-Insulated";
    const tankSizeStr = getFormattedTankSizeString();
    const savedLogo = localStorage.getItem('custom_company_logo');
    const companyName = localStorage.getItem('custom_company_name') || 'YSACC';

    let logoHtml = `<span style="font-weight: 800; font-size: 22px; color: #0284c7; letter-spacing: 1px;">${companyName}</span>`;
    if (savedLogo) {
      logoHtml = `<img src="${savedLogo}" style="max-height: 54px; max-width: 220px; object-fit: contain;">`;
    }

    let html = `
      <div style="font-family: 'Outfit', 'Arial', sans-serif; color: #1e293b; width: 100%; max-width: 100%; margin: 0 auto; background: #ffffff; padding: 5px; box-sizing: border-box;">
    `;

    if (pallets.length === 0) {
      return html + `<div style="text-align:center; padding:50px; color:#94a3b8; font-size:14px; font-weight:bold;">No pallets created or packed yet. Please run [Auto Packing] or [Add Pallet] first.</div></div>`;
    }

    pallets.forEach((pallet, idx) => {
      const palletIndexStr = `#${idx + 1}  /  #${pallets.length}`;
      let totalQty = 0;
      
      const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
      const Fh = parseFloat(document.getElementById("packFh")?.value) || 40;
      const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
      const limit = parseFloat(document.getElementById("packLimit")?.value) || 2000;
      const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph);
      const isLast = idx === pallets.length - 1;
      const breakCss = isLast ? "" : "page-break-after: always; break-after: page;";

      html += `
        <div class="pallet-page-block" style="margin: 0 auto 20px auto; ${breakCss} page-break-inside: avoid; break-inside: avoid; background: #ffffff; border: 2px solid #0f172a; border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); box-sizing: border-box; width: 275mm; max-width: 275mm; height: 185mm; min-height: 185mm; max-height: 185mm; display: flex; flex-direction: column; justify-content: space-between;">
          
          <!-- Top Header Box -->
          <div style="display:flex; justify-content: space-between; align-items:center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px;">
            <div>${logoHtml}</div>
            <h2 style="margin: 0; font-size: 21px; font-weight: 900; color: #0f172a; letter-spacing: 0.5px; text-transform: uppercase;">PALLET PACKING LIST</h2>
          </div>

          <!-- General metadata header grid -->
          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; border: 1.5px solid #334155; margin-bottom: 8px; text-align: center; border-radius: 6px; overflow: hidden;">
            <div style="padding: 6px 10px; border-right: 1.5px solid #334155;">
              <div style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Deliver to</div>
              <div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-top:2px;">${deliverTo}</div>
            </div>
            <div style="padding: 6px 10px; background:#f8fafc; border-right: 1.5px solid #334155;">
              <div style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Project / Order No.</div>
              <div style="font-size:13.5px; font-weight:800; color:#0284c7; margin-top:2px;">${orderNo} (${isInsulated})</div>
            </div>
            <div style="padding: 6px 10px;">
              <div style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">PALLET INDEX & SPEC</div>
              <div style="font-size:13.5px; color:#0f172a; font-weight:800; margin-top:2px;">${palletIndexStr} <span style="color:#059669;">[${getPalletTypeLabel(pallet.palletType)}]</span></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; border: 1.5px solid #334155; margin-bottom: 12px; text-align: center; border-radius: 6px; overflow: hidden;">
            <div style="padding: 6px 10px; border-right: 1.5px solid #334155;">
              <div style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Shipping Date</div>
              <div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-top:2px;">${orderDate}</div>
            </div>
            <div style="padding: 6px 10px; background:#f8fafc; border-right: 1.5px solid #334155;">
              <div style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Customer</div>
              <div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-top:2px;">${customerName}</div>
            </div>
            <div style="padding: 6px 10px;">
              <div style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Tank Size & Height</div>
              <div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-top:2px;">${tankSizeStr}</div>
            </div>
          </div>

          <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
            <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #334155; font-size: 12.5px; text-align: center; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background: #f1f5f9; color: #1e293b; font-weight: bold; border-bottom: 1.5px solid #334155;">
                  <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1; width: 200px; font-size: 12.5px;">Part Name</th>
                  <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1; width: 150px; font-size: 12.5px;">Part No.</th>
                  <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1; width: 130px; font-size: 12.5px;">SIZE</th>
                  <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1; width: 90px; text-align: right; font-size: 12.5px;">Q'TY</th>
                  <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1; width: 60px; font-size: 12.5px;">UNIT</th>
                  <th style="padding: 8px 10px; font-size: 12.5px;">Remarks</th>
                </tr>
              </thead>
              <tbody>
        `;

        if (pallet.items.length === 0) {
          html += `<tr><td colspan="6" style="padding: 20px; color:#94a3b8; font-style:italic;">No panels stacked in this pallet.</td></tr>`;
        } else {
          pallet.items.forEach(layer => {
            const dims = getPanelDimensions(layer.partNo);
            totalQty += layer.qty;

            let cleanName = "Wall Panel";
            const pNo = layer.partNo.toUpperCase();
            if (pNo.startsWith("RF")) cleanName = "Roof";
            else if (pNo.startsWith("MF")) cleanName = "Manhole";
            else if (pNo.startsWith("BF")) cleanName = "Base (Bottom)";
            else if (pNo.startsWith("NF") && pNo.includes("B")) cleanName = "Nozzle_Drain";
            else if (pNo.startsWith("NF") && pNo.includes("L")) cleanName = "Side (Nozzle)";
            else if (pNo.startsWith("SL") || pNo.startsWith("ST")) cleanName = "Side_Wall";

            html += `
              <tr style="border-bottom: 1px solid #cbd5e1;">
                <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; text-align: left; font-weight: 700; font-size: 13px;">${cleanName}</td>
                <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 14px; color: #0284c7;">${layer.partNo}</td>
                <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; font-size: 12.5px;">${dims.w/1000} x ${dims.l/1000}m</td>
                <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; font-weight: 800; font-size: 15px; text-align: right; color: #0f172a;">${layer.qty}</td>
                <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; font-size: 12.5px;">EA</td>
                <td style="padding: 7px 10px; text-align: left; font-size: 11.5px; color: #64748b;">Ht: ${dims.ht}mm / Fh: ${dims.fh}mm</td>
              </tr>
            `;
          });
        }

        html += `
              <tr style="font-weight: bold; background: #f8fafc; border-top: 2px solid #334155;">
                <td colspan="3" style="padding: 9px 12px; text-align: right; border-right: 1px solid #cbd5e1; font-size: 13.5px; font-weight: 800;">PALLET TOTAL</td>
                <td style="padding: 9px 12px; text-align: right; font-size: 16px; font-weight: 900; color: #059669; border-right: 1px solid #cbd5e1;">${totalQty}</td>
                <td style="padding: 9px 12px; border-right: 1px solid #cbd5e1; font-size: 13px;">EA</td>
                <td style="padding: 9px 12px; font-size: 12.5px; text-align: right; color: #0284c7;">Stacked Height: <b>${finalH.toFixed(0)} mm</b> / ${limit}mm</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Inspection signoff boxes -->
        <div style="display: flex; justify-content: flex-end; gap: 20px; margin-top: 10px; shrink: 0;">
          <div style="border: 1.5px solid #cbd5e1; border-radius: 6px; width: 160px; height: 56px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 6px 8px; font-size: 11.5px; background: #f8fafc;">
            <div style="font-weight: 800; color: #334155; font-size: 11.5px;">Prepared By</div>
            <div style="color:#94a3b8; font-style:italic; font-size: 9.5px;">(Signature)</div>
          </div>
          <div style="border: 1.5px solid #cbd5e1; border-radius: 6px; width: 160px; height: 56px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 6px 8px; font-size: 11.5px; background: #f8fafc;">
            <div style="font-weight: 800; color: #334155; font-size: 11.5px;">Approved By</div>
            <div style="color:#94a3b8; font-style:italic; font-size: 9.5px;">(Signature)</div>
          </div>
        </div>
      </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  function printPalletList() {
    openPackingListPreview();
  }

  function openPackingListPreview() {
    const modal = document.getElementById("packingListPreviewModal");
    const container = document.getElementById("modalPackingListContent");

    const html = generatePackingListSheetHTML();
    if (container) {
      container.innerHTML = html;
    }

    if (modal) {
      modal.style.display = "block";
    }

    if (typeof makeModallessDraggable === "function") {
      makeModallessDraggable("packingListPreviewWindow", "packingListPreviewHeader");
    }
  }

  function closePackingListPreview() {
    const modal = document.getElementById("packingListPreviewModal");
    if (modal) modal.style.display = "none";
  }

  function toggleMinimizePackingPreview() {
    const win = document.getElementById("packingListPreviewWindow");
    if (!win) return;
    if (win.style.height === "50px") {
      win.style.height = "calc(92vh - 50px)";
    } else {
      win.style.height = "50px";
    }
  }

  function printPackingListSheet() {
    document.body.classList.add("printing-packing-list");
    const cleanup = () => {
      document.body.classList.remove("printing-packing-list");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 2000);
  }

  function exportPackingListToExcel() {
    try {
      if (typeof XLSX === "undefined") {
        alert("SheetJS (XLSX) library is not loaded.");
        return;
      }

      if (pallets.length === 0) {
        alert("No pallet packing results to export.");
        return;
      }

      const wb = XLSX.utils.book_new();
      const excelRows = [];

      const getVal = id => {
        const el = document.getElementById(id);
        return el ? el.value : "";
      };

      const deliverTo = getVal("deliveredTo") || "A Location";
      const customerName = getVal("customerName") || "MEP";
      const orderNo = getVal("ipoNo") || "WA-2022-01";
      const isInsulated = getVal("insulationType") || "Non-Insulated";
      const tankL1 = getVal("tankLength1") || "3";
      const tankW = getVal("tankWidth") || "3.5";
      const tankH = getVal("tankHeight") || "1.5";

      excelRows.push(["GRP WATER TANK PALLET PACKING LIST", "", "", "", "", ""]);
      excelRows.push(["Customer: " + customerName, "", "Project: " + orderNo, "", "Deliver to: " + deliverTo, ""]);
      excelRows.push(["Tank Size: " + tankW + "x" + tankL1 + "x" + tankH + "mH", "", "Spec: " + isInsulated, "", "Date: " + new Date().toISOString().slice(0, 10), ""]);
      excelRows.push([]);

      pallets.forEach((pallet, idx) => {
        const pLabel = `Pallet #${idx + 1} (${getPalletTypeLabel(pallet.palletType)})`;
        const Ht = parseFloat(getVal("packHt")) || 80;
        const Fh = parseFloat(getVal("packFh")) || 40;
        const Ph = parseFloat(getVal("packPh")) || 150;
        const limit = parseFloat(getVal("packLimit")) || 2000;
        const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph);

        excelRows.push(["[ " + pLabel + " ] - Stacked Height: " + finalH.toFixed(0) + "mm / " + limit + "mm", "", "", "", "", ""]);
        excelRows.push(["Part Name", "Part No.", "Dimensions", "Q'ty", "Unit", "Remarks"]);

        let pTotal = 0;
        if (pallet.items.length === 0) {
          excelRows.push(["No items", "", "", 0, "EA", ""]);
        } else {
          pallet.items.forEach(layer => {
            const dims = getPanelDimensions(layer.partNo);
            pTotal += layer.qty;
            let cleanName = "Wall Panel";
            const pNo = layer.partNo.toUpperCase();
            if (pNo.startsWith("RF")) cleanName = "Roof";
            else if (pNo.startsWith("MF")) cleanName = "Manhole";
            else if (pNo.startsWith("BF")) cleanName = "Base (Bottom)";
            else if (pNo.startsWith("NF") && pNo.includes("B")) cleanName = "Nozzle_Drain";
            else if (pNo.startsWith("NF") && pNo.includes("L")) cleanName = "Side (Nozzle)";
            else if (pNo.startsWith("SL") || pNo.startsWith("ST")) cleanName = "Side_Wall";

            excelRows.push([cleanName, layer.partNo, (dims.w / 1000) + " x " + (dims.l / 1000) + "m", layer.qty, "EA", `Ht:${dims.ht}mm / Fh:${dims.fh}mm`]);
          });
        }
        excelRows.push(["PALLET TOTAL", "", "", pTotal, "EA", `Height: ${finalH.toFixed(0)}mm`]);
        excelRows.push([]);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(wb, ws, "Pallet_Packing_List");

      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `YSACC_Pallet_Packing_List_${todayStr}.xlsx`;
      XLSX.writeFile(wb, filename);

      alert(`🎉 Pallet Packing List exported to Excel successfully (${filename}).`);
    } catch (e) {
      console.error("Packing List Excel Export Error:", e);
      alert("Error during Excel export: " + e.message);
    }
  }

  async function resetAllPacking() {
    let confirmReset = false;
    if (typeof showCustomAppDialog !== "undefined") {
      confirmReset = await showCustomAppDialog({
        type: "confirm",
        title: "Reset All Packing",
        icon: "fa-solid fa-rotate-left",
        message: "Are you sure you want to reset all packing results and return items to pending list?",
        confirmText: "Reset",
        cancelText: "Cancel"
      });
    } else {
      confirmReset = confirm("Are you sure you want to reset all packing results and return items to pending list?");
    }

    if (!confirmReset) return;

    pallets = [];
    nextPalletId = 1;
    syncPendingFromBOM();
  }

  function wireUpUI() {
    const btnSync = document.getElementById("btnRefreshPackPending");
    const btnAuto = document.getElementById("btnAutoPack");
    const btnAdd = document.getElementById("btnAddPallet");
    const btnReset = document.getElementById("btnResetPacking");
    const btnPrint = document.getElementById("btnPrintPackingList");

    if (btnSync) btnSync.addEventListener("click", syncPendingFromBOM);
    if (btnAuto) btnAuto.addEventListener("click", runAutoPack);
    if (btnAdd) btnAdd.addEventListener("click", addPallet);
    if (btnReset) btnReset.addEventListener("click", resetAllPacking);
    if (btnPrint) btnPrint.addEventListener("click", printPalletList);

    // Initial triggers for panel inputs changes
    ["packHt", "packFh", "packPh"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => {
          renderPalletsDashboard();
        });
      }
    });
  }

  function getPalletData() {
    return {
      pallets: JSON.parse(JSON.stringify(pallets)),
      pendingList: JSON.parse(JSON.stringify(pendingList)),
      nextPalletId: nextPalletId
    };
  }

  function loadPalletData(data) {
    if (!data) return;
    if (Array.isArray(data.pallets)) {
      pallets = JSON.parse(JSON.stringify(data.pallets));
    }
    if (Array.isArray(data.pendingList)) {
      pendingList = JSON.parse(JSON.stringify(data.pendingList));
    }
    if (data.nextPalletId != null) {
      nextPalletId = data.nextPalletId;
    }
    renderPendingTable();
    renderPalletsDashboard();
  }

  function init() {
    wireUpUI();
    syncPendingFromBOM();
  }

  function exportPackingListToPDF(btnEl) {
    try {
      const element = document.getElementById("modalPackingListContent");
      if (!element) return;

      const btn = btnEl || (typeof event !== "undefined" && event ? event.target?.closest("button") : null);
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Exporting...`;
      }

      const ipo = document.getElementById("ipoNo")?.value || "BOM";
      const filename = `${ipo}_Pallet_Packing_List.pdf`;

      const opt = {
        margin: [4, 4, 4, 4],
        filename: filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 1.5, backgroundColor: "#ffffff", useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"] }
      };

      if (typeof html2pdf !== "undefined") {
        html2pdf().set(opt).from(element).save().then(() => {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Export PDF`;
          }
        }).catch(err => {
          console.error("PDF generation error:", err);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Export PDF`;
          }
          window.print();
        });
      } else {
        window.print();
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Export PDF`;
        }
      }
    } catch (err) {
      console.error("PDF Export Error:", err);
      window.print();
    }
  }

  global.openPackingListPreview = openPackingListPreview;
  global.closePackingListPreview = closePackingListPreview;
  global.toggleMinimizePackingPreview = toggleMinimizePackingPreview;
  global.printPackingListSheet = printPackingListSheet;
  global.exportPackingListToExcel = exportPackingListToExcel;
  global.exportPackingListToPDF = exportPackingListToPDF;

  global.PalletPacking = {
    init,
    syncPendingFromBOM,
    runAutoPack,
    addPallet,
    resetAllPacking,
    manualPack,
    unloadItem,
    deletePallet,
    printPalletList,
    getPalletData,
    loadPalletData,
    expandPalletItemsToTiers,
    groupConsecutiveTiers,
    calculatePalletHeight,
    calculatePalletWeightDetails,
    getActualPalletTypeForPallet,
    getFitQty,
    getPanelDimLabel,
    getPanelDimensions,
    invalidateCache,
    isPalletPhysicallyValid,
    renderPalletsDashboard,
    getPallets: function() { return pallets; }
  };

})(typeof window !== "undefined" ? window : globalThis);

