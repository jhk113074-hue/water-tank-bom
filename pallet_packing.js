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
    "SL20SX": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20SX": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20SL": { name: "Side 1x2m", w: 1000, l: 2000 },
    "ST20SR": { name: "Side 1x2m", w: 1000, l: 2000 },
    "PF20HX": { name: "Partition 1x2m", w: 1000, l: 2000 },
    "PF20LX": { name: "Partition 1x2m", w: 1000, l: 2000 },
    
    // 1x1.5m Panels
    "SL15SX": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "SL15SL": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "SL15SR": { name: "Side 1x1.5m", w: 1000, l: 1500 },
    "PF15MX": { name: "Partition 1x1.5m", w: 1000, l: 1500 },
    
    // 1x1m Panels
    "SF10SX": { name: "Side 1x1m", w: 1000, l: 1000 },
    "RF00TX": { name: "Roof 1x1m", w: 1000, l: 1000 },
    "BF10BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF20BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF30BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF40BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF45BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "BF50BX": { name: "Bottom 1x1m", w: 1000, l: 1000 },
    "NF10BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF15BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF20BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF30BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF40BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF45BX": { name: "Drain 1x1m", w: 1000, l: 1000 },
    "NF50BX": { name: "Drain 1x1m", w: 1000, l: 1000 }
  };

  function getPanelDimensions(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    const tag4 = pNo.substring(0, 4); // First 4 characters: SL20, ST20, PF20, PH20, SL15, ST15, PF15, PH15...
    
    // Primary rule: Inspect the first 4 characters of panel part numbers (SLXX, STXX, PFXX, PHXX)
    if (/^(SL20|ST20|PF20|PH20)/.test(tag4)) {
      const w = (tag4.startsWith("PF") || tag4.startsWith("PH")) ? 930 : 1000;
      return { name: "Panel 1x2m", w: w, l: 2000, ht: 80, fh: 70 };
    }
    if (/^(SL15|ST15|PF15|PH15)/.test(tag4) || (pNo.startsWith("NH15") && (pNo.includes("L") || pNo.includes("S")))) {
      const w = (tag4.startsWith("PF") || tag4.startsWith("PH")) ? 930 : 1000;
      return { name: "Panel 1x1.5m", w: w, l: 1500, ht: 80, fh: 70 };
    }

    if (PANEL_SIZE_CATALOG[pNo]) {
      const entry = PANEL_SIZE_CATALOG[pNo];
      return { ...entry, ht: 80, fh: 70 };
    }

    // Secondary lookup in live global parts database
    if (typeof partsDb !== 'undefined' && Array.isArray(partsDb)) {
      const match = partsDb.find(p => (p.partNo || "").toUpperCase().trim() === pNo);
      if (match && match.width && match.length) {
        return {
          name: match.nameKo || match.nameEn || pNo,
          w: parseFloat(match.width),
          l: parseFloat(match.length),
          ht: parseFloat(match.ht || 80),
          fh: parseFloat(match.fh || 70)
        };
      }
    }

    // Default: 1x1m Panel (1000x1000mm)
    return { name: "Panel 1x1m", w: 1000, l: 1000, ht: 80, fh: 70 };
  }

  // Dynamic Pallet Base Type Resolution:
  // A pallet is assigned as "1x2m Pallet" IF AND ONLY IF it contains at least one 1x2m panel.
  // If there are NO 1x2m panels, it MUST NOT be a 1x2m Pallet!
  function getActualPalletTypeForPallet(pallet) {
    if (!pallet || !pallet.items || pallet.items.length === 0) return "1x1m";
    let maxDim = 1000;
    pallet.items.forEach(item => {
      const dims = getPanelDimensions(item.partNo);
      const itemMax = Math.max(dims.w || 1000, dims.l || 1000);
      if (itemMax > maxDim) maxDim = itemMax;
    });
    if (maxDim > 1500) return "1x2m";
    if (maxDim > 1000) return "1x1.5m";
    return "1x1m";
  }

  // Panel Type Classifications per User Specification:
  // 1. Bottom Panels (BF): BF...
  function isBFPanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    return pNo.startsWith("BF");
  }

  // 2. Roof Panels (RF): RF..., MF...
  function isRFPanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    return pNo.startsWith("RF") || pNo.startsWith("MF");
  }

  // 3. Side / Flat / Nozzle Panels: NH, NQ, SF, NF, SL, ST, PF, PH
  function isSideFlatNozzlePanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (isBFPanel(pNo) || isRFPanel(pNo)) return false;
    return true;
  }

  // Legacy helper aliases for backwards compatibility in sorting loops
  function isBottomPanel(partNo) { return isBFPanel(partNo); }
  function isRoofPanel(partNo) { return isRFPanel(partNo); }
  function isSideOrPartitionPanel(partNo) { return isSideFlatNozzlePanel(partNo); }

  // Helper to determine panel physical stacking rank (User Specification):
  // Rank 1: 1x1m Side / Nozzle / Flat panels (NH10, NH20, NQ10, SF10, NF15, SL10...) -> AT VERY BOTTOM
  // Rank 2: 1x1m Bottom panels (BF10, BF20...) -> ABOVE 1x1m Side panels
  // Rank 3: 1.5m / 2.0m Half / Tall panels (SL15, ST15, PF15, PH15, NH15...) -> ON TOP of 1x1m panels
  // Rank 4: 1x1m Roof Flat panels (RF00...) -> ABOVE Half panels
  // Rank 5: 1x1m Roof Manhole panels (MF00...) -> AT VERY TOP (ABOVE RF panels)
  function getPanelStackingRank(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();

    // MF (Roof Manhole) panels sit at VERY TOP (Rank 5)
    if (pNo.startsWith("MF")) {
      return 5;
    }

    // RF (Roof Flat) panels sit above Half panels (Rank 4)
    if (pNo.startsWith("RF")) {
      return 4;
    }

    const dims = getPanelDimensions(partNo);
    const maxDim = Math.max(dims.w || 1000, dims.l || 1000);

    // 1.5m or 2.0m Half / Tall panels sit ON TOP of 1x1m panels (Rank 3)
    if (maxDim > 1000) {
      return 3;
    }

    // Bottom panels (BF) sit in middle (Rank 2)
    if (isBFPanel(partNo)) {
      return 2;
    }

    // 1x1m Side / Nozzle / Drain panels sit at VERY BOTTOM (Rank 1)
    return 1;
  }

  // Stacking sequence restriction rule (User Specification):
  // - 1x1m Side & Bottom panels placed at VERY BOTTOM.
  // - Half panels (1.5m) placed ON TOP of 1x1m panels.
  // - Roof panels (RF, MF) placed AT VERY TOP.
  function canStackPanelOnPallet(pallet, partNoToPack) {
    if (!pallet.items || pallet.items.length === 0) return true;

    // The top-most layer currently on the pallet (items are stacked bottom -> top)
    const topItem = pallet.items[pallet.items.length - 1];
    const topPartNo = topItem ? topItem.partNo : "";

    if (topPartNo === partNoToPack) {
      return true;
    }

    const topRank = getPanelStackingRank(topPartNo);
    const newRank = getPanelStackingRank(partNoToPack);

    // Stacking rule: New panel rank MUST be >= top panel rank!
    return newRank >= topRank;
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
  function calculatePalletHeight(palletItems, defaultHt, defaultFh, Ph, palletType) {
    if (!palletItems || palletItems.length === 0) return 0;
    
    let totalHeight = (Ph != null) ? Ph : 150; // Pallet base height (e.g. 150mm)

    // Infer palletType if not explicitly passed
    const resolvedPalletType = palletType || (palletItems[0] ? getPalletType(palletItems[0].partNo) : "1x1m");

    palletItems.forEach(layer => {
      const qty = layer.qty;
      const dims = getPanelDimensions(layer.partNo);
      
      const Ht = (dims && dims.ht != null) ? dims.ht : (defaultHt || 80);
      const Fh = (dims && dims.fh != null) ? dims.fh : (defaultFh || 70);

      let nestedStacksCount = qty;
      // On a 1x2m Pallet (2000mm length), 1x1m and 1x1.5m panels sit in 2 side-by-side columns (2열 분할 적재)
      if (resolvedPalletType === "1x2m" && (dims.l || 1000) <= 1500) {
        nestedStacksCount = Math.ceil(qty / 2);
      } else if (resolvedPalletType === "1x2m" && dims.l === 1000 && dims.w === 500) {
        nestedStacksCount = Math.ceil(qty / 4);
      }

      if (nestedStacksCount > 0) {
        // Rule:
        // - 저판, 천정: 최상단 품목에 전체높이(Ht) 반영, 아래 적재 품목은 플랜지높이(Fh) 반영 -> Ht + (nestedStacksCount - 1) * Fh
        // - 나머지 모든 PANEL (측판, 격벽 등): 플랜지높이(Fh)만 반영 -> nestedStacksCount * Fh
        if (isBottomOrRoof(layer.partNo, dims)) {
          totalHeight += Ht + (nestedStacksCount - 1) * Fh;
        } else {
          totalHeight += nestedStacksCount * Fh;
        }
      }
    });

    return Math.round(totalHeight * 10) / 10;
  }

  // Helper to identify if an item is a panel
  function isPanelItem(item) {
    if (!item || !item.partNo) return false;
    const cat = (item.category || "").toUpperCase().trim();
    if (cat.includes("PANEL")) return true;
    const pNo = (item.partNo || "").toUpperCase().trim();
    if (/^(SL|ST|SF|RF|MF|BF|NF|NH|NQ|PF|PH)\d/.test(pNo)) return true;
    return false;
  }

  function syncPendingFromBOM() {
    // Same bare-identifier note as getPanelDimensions() above -- app.js's
    // `bomItems` is a top-level `let`, never a `window.bomItems` property.
    if (typeof bomItems === 'undefined' || !Array.isArray(bomItems)) return;

    // Group and consolidate items similar to updatePrintoutSheet grouping logic
    const itemMap = {};
    const consolidatedList = [];

    bomItems.forEach(item => {
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
      const itemPalletType = getPalletType(item.partNo);
      const eligiblePallets = pallets.filter(p => !p.palletType || p.palletType === itemPalletType);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: bold;">${item.partNo}</td>
        <td>${item.partName} <span style="font-size:10px; color:#0284c7; background:#e0f2fe; padding:1px 4px; border-radius:3px;">${getPalletTypeLabel(itemPalletType)}</span></td>
        <td style="font-weight: bold; color: var(--neon-blue); text-align: center;">${item.pendingQty} / ${item.totalQty}</td>
        <td align="center">
          <div style="display: flex; gap: 4px; align-items: center; justify-content: center;">
            <select class="pallet-select" style="font-size: 11px; padding: 2px;">
              <option value="">-- Select --</option>
              ${eligiblePallets.map(p => `<option value="${p.id}">Pallet #${p.id} (${getPalletTypeLabel(p.palletType || itemPalletType)})</option>`).join('')}
            </select>
            <input type="number" class="qty-input" value="1" min="1" max="${item.pendingQty}" style="width: 40px; padding: 2px; text-align: right; font-size: 11px;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.PalletPacking.manualPack(${idx})" style="padding: 2px 6px; font-size: 10px;">Pack</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderPalletsDashboard() {
    const container = document.getElementById("palletDashboardList") || document.getElementById("palletsDashboard");
    if (!container) return;
    container.innerHTML = "";

    const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
    const Fh = parseFloat(document.getElementById("packFh")?.value) || 70;
    const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
    const limit = 2000;

    if (pallets.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 30px; border: 1.5px dashed var(--border-color); border-radius: 8px;">No active pallets. Click [Add New Pallet] or [Run Auto-Packing].</div>`;
      return;
    }

    pallets.forEach(pallet => {
      pallet.palletType = getActualPalletTypeForPallet(pallet);
      const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph, pallet.palletType);
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

      // Draw Stack representation block inside pallet card
      let stackVisualHtml = '<div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; display: flex; flex-direction: column-reverse; gap: 4px; min-height: 80px; justify-content: flex-start;">';
      if (pallet.items.length === 0) {
        stackVisualHtml += '<div style="font-size: 11px; color:#94a3b8; font-style:italic; text-align:center; padding-top:25px;">Empty</div>';
      } else {
        pallet.items.forEach((layer, lIdx) => {
          let layerBg = "rgba(16, 185, 129, 0.1)";
          let layerBorder = "#10b981";
          const pNo = layer.partNo.toUpperCase();
          if (pNo.startsWith("RF") || pNo.startsWith("MF")) {
            layerBg = "rgba(59, 130, 246, 0.1)"; // Blue for Roof/Manhole
            layerBorder = "#3b82f6";
          } else if (pNo.startsWith("BF") || pNo.startsWith("NF")) {
            layerBg = "rgba(245, 158, 11, 0.1)"; // Yellow for Bottom/Drain
            layerBorder = "#f59e0b";
          }

          stackVisualHtml += `
            <div style="background: ${layerBg}; border: 1px solid ${layerBorder}; padding: 4px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <span style="font-family: monospace; font-weight:bold;">${layer.partNo}</span>
              <span>x${layer.qty} pcs</span>
              <button type="button" onclick="window.PalletPacking.unloadItem(${pallet.id}, ${lIdx})" style="border:none; background:transparent; color:var(--neon-rose); cursor:pointer; font-size: 11px; padding: 0 4px;"><i class="fa-solid fa-circle-minus"></i></button>
            </div>
          `;
        });
      }
      stackVisualHtml += '</div>';

      const pTypeSpec = pallet.palletType || (pallet.items[0] ? getPalletType(pallet.items[0].partNo) : "1x1m");
      const pTypeBadge = getPalletTypeLabel(pTypeSpec);

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

        <div style="font-size:11.5px; color: var(--text-secondary);">
          Stacked Height: <strong style="color: ${statusColor}; font-size:13px;">${finalH.toFixed(0)}mm</strong> / 2000mm
        </div>

        <!-- Height visual progress bar -->
        <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
          <div style="width: ${hPercent}%; height: 100%; background: ${statusColor}; border-radius: 4px;"></div>
        </div>

        ${stackVisualHtml}

        <div style="display:flex; justify-content: flex-end; margin-top: 4px;">
          <button type="button" class="btn btn-sm btn-outline" onclick="window.PalletPacking.deletePallet(${pallet.id})" style="border-color: var(--neon-rose); color: var(--neon-rose); padding: 2px 8px; font-size: 11px;"><i class="fa-solid fa-trash-can"></i> Delete Pallet</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function addPallet() {
    pallets.push({
      id: nextPalletId++,
      palletType: "1x1m",
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
    if (pallet.palletType && pallet.palletType !== itemPalletType) {
      alert(`Specification mismatch: This pallet is designated for [${getPalletTypeLabel(pallet.palletType)}].\nPlease pack [${getPalletTypeLabel(itemPalletType)}] panels into a matching pallet.`);
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

    const testH = calculatePalletHeight(testItems, Ht, Fh, Ph);
    if (testH > 2000) {
      if (!confirm(`Warning: Adding this quantity will result in a total height of ${testH.toFixed(0)}mm, exceeding the shipping limit (2000mm). Continue?`)) {
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
    const panelType = getPalletType(panelPartNo);
    if (panelType === "1x2m") return palletType === "1x2m";
    if (panelType === "1x1.5m") return palletType === "1x2m" || palletType === "1x1.5m";
    return true; // 1x1m panels fit on 1x2m, 1x1.5m, and 1x1m pallets
  }

  // Helper to sort pallet items according to strict physical stacking hierarchy:
  // 1. 1x1m Side / Nozzle panels (NH10, NH20, NQ10, SF10, NF15...) at VERY BOTTOM (Rank 1)
  // 2. 1x1m Bottom panels (BF10, BF20...) in MIDDLE (Rank 2)
  // 3. 1.5m / 2.0m Half / Tall panels (SL15, ST15, PF15, PH15...) ON TOP of 1x1m panels (Rank 3)
  // 4. 1x1m Roof / Manhole panels (RF00, MF00...) at VERY TOP (Rank 4)
  function sortPalletItemsByHierarchy(items) {
    if (!Array.isArray(items) || items.length <= 1) return items;
    return items.slice().sort((a, b) => {
      const rankA = getPanelStackingRank(a.partNo);
      const rankB = getPanelStackingRank(b.partNo);
      return rankA - rankB;
    });
  }

  // Helper to safely load items into active pallets without breaching height or mixing pallet sizes
  function pushToPalletWithLimit(pallet, partNo, qty, Ht, Fh, Ph, limit) {
    const pType = getActualPalletTypeForPallet(pallet);

    // Footprint Fit Check: Larger panels cannot go on smaller pallets; smaller panels CAN go on larger pallets!
    if (!canFitPanelOnPallet(pType, partNo)) {
      return false;
    }

    const testItems = JSON.parse(JSON.stringify(pallet.items || []));
    const exist = testItems.find(i => i.partNo === partNo);
    if (exist) exist.qty += qty;
    else testItems.push({ partNo, qty });

    // Re-sort testItems according to strict hierarchy (Side -> BF -> RF)
    const sortedTestItems = sortPalletItemsByHierarchy(testItems);

    const projectedPalletType = getActualPalletTypeForPallet({ items: sortedTestItems });
    const projectedH = calculatePalletHeight(sortedTestItems, Ht, Fh, Ph, projectedPalletType);
    return projectedH <= limit;
  }

  // Post-packing consolidation pass to merge under-filled pallets into minimum total pallets
  function consolidatePallets(palletsArray, Ht, Fh, Ph, limit) {
    // Sort items on all pallets by hierarchy first
    palletsArray.forEach(p => {
      p.items = sortPalletItemsByHierarchy(p.items);
    });

    let improved = true;
    let iterations = 0;

    while (improved && iterations < 20) {
      improved = false;
      iterations++;

      // Sort pallets ascending by total height to attempt emptying smaller/less-filled pallets first
      palletsArray.sort((a, b) => {
        const pTypeA = getActualPalletTypeForPallet(a);
        const pTypeB = getActualPalletTypeForPallet(b);
        return calculatePalletHeight(a.items, Ht, Fh, Ph, pTypeA) - calculatePalletHeight(b.items, Ht, Fh, Ph, pTypeB);
      });

      for (let i = 0; i < palletsArray.length; i++) {
        const sourcePallet = palletsArray[i];
        if (!sourcePallet.items || sourcePallet.items.length === 0) continue;

        const sourceItemsCopy = JSON.parse(JSON.stringify(sourcePallet.items));
        let fullyDistributed = true;

        const otherPallets = palletsArray.filter((_, idx) => idx !== i);
        const testTargets = JSON.parse(JSON.stringify(otherPallets));

        for (let k = 0; k < sourceItemsCopy.length; k++) {
          const sItem = sourceItemsCopy[k];
          let qtyToDistribute = sItem.qty;

          for (let target of testTargets) {
            while (qtyToDistribute > 0) {
              if (pushToPalletWithLimit(target, sItem.partNo, 1, Ht, Fh, Ph, limit)) {
                const ex = target.items.find(it => it.partNo === sItem.partNo);
                if (ex) ex.qty += 1;
                else target.items.push({ partNo: sItem.partNo, qty: 1 });
                target.items = sortPalletItemsByHierarchy(target.items);
                qtyToDistribute -= 1;
              } else {
                break;
              }
            }
            if (qtyToDistribute === 0) break;
          }

          if (qtyToDistribute > 0) {
            fullyDistributed = false;
            break;
          }
        }

        if (fullyDistributed) {
          otherPallets.forEach((realT, idx) => {
            realT.items = sortPalletItemsByHierarchy(testTargets[idx].items);
          });
          palletsArray.splice(i, 1);
          improved = true;
          break;
        }
      }

      if (improved) continue;

      // Pass 2: Top up under-filled pallets by pulling items from other pallets
      for (let i = 0; i < palletsArray.length; i++) {
        const targetPallet = palletsArray[i];
        const tType = getActualPalletTypeForPallet(targetPallet);
        const currentH = calculatePalletHeight(targetPallet.items, Ht, Fh, Ph, tType);
        if (currentH >= limit - 100) continue; // Skip nearly full pallets

        for (let j = palletsArray.length - 1; j >= 0; j--) {
          if (i === j) continue;
          const donorPallet = palletsArray[j];
          if (!donorPallet.items || donorPallet.items.length === 0) continue;

          for (let k = 0; k < donorPallet.items.length; k++) {
            const dItem = donorPallet.items[k];
            while (dItem.qty > 0 && pushToPalletWithLimit(targetPallet, dItem.partNo, 1, Ht, Fh, Ph, limit)) {
              const ex = targetPallet.items.find(it => it.partNo === dItem.partNo);
              if (ex) ex.qty += 1;
              else targetPallet.items.push({ partNo: dItem.partNo, qty: 1 });
              targetPallet.items = sortPalletItemsByHierarchy(targetPallet.items);
              dItem.qty -= 1;
              improved = true;
            }
          }
          donorPallet.items = donorPallet.items.filter(it => it.qty > 0);
        }
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

    // Group pending items by pallet dimension type (1x2m, 1x1.5m, 1x1m)
    const palletTypesOrder = ["1x2m", "1x1.5m", "1x1m"];

    palletTypesOrder.forEach(pType => {
      const typeItems = pList.filter(i => getPalletType(i.partNo) === pType && i.pendingQty > 0);
      if (typeItems.length === 0) return;

      if (scenarioCode === "A") {
        // Standard Mix (Side -> Bottom -> Roof)
        const sorted = [];
        const pushByCond = (cond) => {
          typeItems.forEach(item => {
            if (cond(item.partNo) && item.pendingQty > 0 && !sorted.includes(item)) {
              sorted.push(item);
            }
          });
        };
        // Side & Partition panels FIRST (at bottom of stack)
        pushByCond(p => isSideOrPartitionPanel(p));
        // Bottom panels SECOND (above Side panels)
        pushByCond(p => isBottomPanel(p));
        // Roof panels THIRD (at top of stack)
        pushByCond(p => isRoofPanel(p));
        typeItems.forEach(item => {
          if (!sorted.includes(item) && item.pendingQty > 0) sorted.push(item);
        });

        let currentPallet = { id: simNextId++, palletType: pType, items: [] };
        simPallets.push(currentPallet);

        sorted.forEach(item => {
          while (item.pendingQty > 0) {
            if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
              const exist = currentPallet.items.find(i => i.partNo === item.partNo);
              if (exist) exist.qty += 1;
              else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            }
          }
        });
      } else if (scenarioCode === "B") {
        // Dedicated per PartNo
        typeItems.forEach(item => {
          if (item.pendingQty <= 0) return;
          let currentPallet = { id: simNextId++, palletType: pType, items: [] };
          simPallets.push(currentPallet);

          while (item.pendingQty > 0) {
            if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
              const exist = currentPallet.items.find(i => i.partNo === item.partNo);
              if (exist) exist.qty += 1;
              else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
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
              if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
                const exist = currentPallet.items.find(i => i.partNo === item.partNo);
                if (exist) exist.qty += 1;
                else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
                item.pendingQty -= 1;
              } else {
                currentPallet = { id: simNextId++, palletType: pType, items: [] };
                simPallets.push(currentPallet);
                currentPallet.items.push({ partNo: item.partNo, qty: 1 });
                item.pendingQty -= 1;
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
            const testItems = JSON.parse(JSON.stringify(currentPallet.items));
            const addOne = (arr, partNo) => {
              const ex = arr.find(a => a.partNo === partNo);
              if (ex) ex.qty += 1;
              else arr.push({ partNo, qty: 1 });
            };
            addOne(testItems, activeRoof.partNo);
            addOne(testItems, activeBottom.partNo);

            const testH = calculatePalletHeight(testItems, Ht, Fh, Ph);
            if (testH <= limit) {
              addOne(currentPallet.items, activeRoof.partNo);
              addOne(currentPallet.items, activeBottom.partNo);
              activeRoof.pendingQty -= 1;
              activeBottom.pendingQty -= 1;
            } else {
              if (currentPallet.items.length === 0) {
                // Pairing not possible on an empty pallet, exit pairing loop
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
            if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
              const exist = currentPallet.items.find(i => i.partNo === item.partNo);
              if (exist) exist.qty += 1;
              else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            }
          }
        });
      } else { // Scenario E or fallback
        let currentPallet = { id: simNextId++, palletType: pType, items: [] };
        simPallets.push(currentPallet);

        typeItems.forEach(item => {
          while (item.pendingQty > 0) {
            if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
              const exist = currentPallet.items.find(i => i.partNo === item.partNo);
              if (exist) exist.qty += 1;
              else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            } else {
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
              currentPallet.items.push({ partNo: item.partNo, qty: 1 });
              item.pendingQty -= 1;
            }
          }
        });
      }
    });

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
    // 1. ALWAYS sync latest panels from BOM items
    syncPendingFromBOM();

    const scenarioEl = document.getElementById("packScenarioSelect");
    const scenario = scenarioEl ? scenarioEl.value : "AUTO";
    const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
    const Fh = parseFloat(document.getElementById("packFh")?.value) || 70;
    const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
    const limit = 2000;

    // Reset pending items to full
    pendingList.forEach(item => {
      item.pendingQty = item.totalQty;
    });

    if (pendingList.length === 0 || pendingList.every(i => i.totalQty <= 0)) {
      alert("No pending panels found. Please generate BOM first.");
      return;
    }

    if (scenario === "AUTO") {
      // Run simulations across all scenarios to find the MINIMUM total pallet count
      const candidateScenarios = ["A", "B", "C", "D", "E"];
      let bestResult = null;

      candidateScenarios.forEach(scCode => {
        const simPending = JSON.parse(JSON.stringify(pendingList));
        const res = executeScenarioEngine(scCode, simPending, Ht, Fh, Ph, limit);
        
        const count = res.pallets.length;
        let fillSum = 0;
        res.pallets.forEach(p => {
          fillSum += calculatePalletHeight(p.items, Ht, Fh, Ph) / limit;
        });
        const avgFill = count > 0 ? fillSum / count : 0;

        if (!bestResult || count < bestResult.count || (count === bestResult.count && avgFill > bestResult.avgFill)) {
          bestResult = {
            scenarioCode: scCode,
            count: count,
            avgFill: avgFill,
            res: res
          };
        }
      });

      if (bestResult) {
        pallets = bestResult.res.pallets;
        pendingList = bestResult.res.pendingList;
        nextPalletId = bestResult.res.nextPalletId;
        renderPendingTable();
        renderPalletsDashboard();
        setTimeout(() => {
          alert(`✨ Optimal Auto-Packing Complete!\n\nPacked into a minimum of ${bestResult.count} pallets categorized by size (1x2m, 1x1.5m, 1x1m).`);
        }, 100);
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

  function generatePackingListSheetHTML() {
    const deliverTo = document.getElementById("deliveredTo")?.value || "A Location";
    const customerName = document.getElementById("customerName")?.value || "MEP";
    const orderNo = document.getElementById("ipoNo")?.value || "WA-2022-01";
    const orderDate = document.getElementById("orderDate")?.value || new Date().toISOString().slice(0,10);
    const isInsulated = document.getElementById("insulationType")?.value === "insulated" ? "Insulated" : "Non-Insulated";
    const tankWidth = document.getElementById("tankWidth")?.value || "2";
    const tankLength1 = document.getElementById("tankLength1")?.value || "2";
    const tankHeight = document.getElementById("tankHeight")?.value || "2";
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
              <div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-top:2px;">${tankWidth}mW x ${tankLength1}mL x ${tankHeight}mH</div>
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
                <td style="padding: 9px 12px; font-size: 12.5px; text-align: right; color: #0284c7;">Stacked Height: <b>${finalH.toFixed(0)} mm</b> / 2000mm</td>
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
        const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph);

        excelRows.push(["[ " + pLabel + " ] - Stacked Height: " + finalH.toFixed(0) + "mm / 2000mm", "", "", "", "", ""]);
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
    loadPalletData
  };

})(typeof window !== "undefined" ? window : globalThis);

