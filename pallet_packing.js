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
    
    // Attempt lookup in live global parts database first. NOTE: app.js
    // declares `partsDb` with `let` at top-level script scope -- that
    // creates a bare-identifier binding shared with any other classic
    // <script> loaded in the same document, but NOT a `window.partsDb`
    // property (only `var` declarations become window properties), so this
    // must reference the bare identifier, not `window.partsDb`.
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

    if (PANEL_SIZE_CATALOG[pNo]) {
      const entry = PANEL_SIZE_CATALOG[pNo];
      return { ...entry, ht: 80, fh: 70 };
    }
    // Fallback parser heuristics based on common strings
    if (pNo.includes("20")) return { name: "Panel 1x2m", w: 1000, l: 2000, ht: 80, fh: 70 };
    if (pNo.includes("15")) return { name: "Panel 1x1.5m", w: 1000, l: 1500, ht: 80, fh: 70 };
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

  // Helper functions for panel category classification
  function isBottomPanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (pNo.startsWith("BF")) return true;
    if (pNo.startsWith("NF")) {
      // NF...LX / NF...L is Side Wall Nozzle (측판 노즐), not Bottom Drain (저판 드레인)!
      if (pNo.includes("L") || pNo.includes("SIDE") || pNo.includes("WALL")) return false;
      return true;
    }
    if (pNo.startsWith("NH") || pNo.startsWith("NQ")) return true;
    return false;
  }

  function isRoofPanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    return pNo.startsWith("RF") || pNo.startsWith("MF");
  }

  function isSideOrPartitionPanel(partNo) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (pNo.startsWith("SF") || pNo.startsWith("SL") || pNo.startsWith("ST") || pNo.startsWith("PF") || pNo.startsWith("PH")) {
      return true;
    }
    if (pNo.startsWith("NF") && (pNo.includes("L") || pNo.includes("SIDE") || pNo.includes("WALL"))) {
      return true;
    }
    return false;
  }

  // Stacking sequence restriction rule:
  // - Above a Bottom panel (저판): ONLY Roof panels or other Bottom panels can be stacked. Side/Partition/Side-nozzle panels CANNOT be stacked!
  // - Above a Roof panel (천정): Roof panels are top-most; no other panels can be stacked on top!
  function canStackPanelOnPallet(pallet, partNoToPack) {
    if (!pallet.items || pallet.items.length === 0) return true;

    const hasBottom = pallet.items.some(i => isBottomPanel(i.partNo));
    const hasRoof = pallet.items.some(i => isRoofPanel(i.partNo));

    if (hasBottom && isSideOrPartitionPanel(partNoToPack)) {
      return false;
    }
    if (hasRoof && (isBottomPanel(partNoToPack) || isSideOrPartitionPanel(partNoToPack))) {
      return false;
    }

    return true;
  }

  // Helper to determine if a panel is Bottom (저판) or Roof (천정)
  function isBottomOrRoof(partNo, dims) {
    if (isBottomPanel(partNo) || isRoofPanel(partNo)) return true;
    const name = (dims && dims.name ? dims.name : "").toLowerCase();
    if (name.includes("bottom") || name.includes("base") || name.includes("drain") || name.includes("roof") || name.includes("manhole") || name.includes("저판") || name.includes("천정") || name.includes("하부") || name.includes("상부")) {
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
      // On a 1x2m Pallet (2000mm length), 1x1m panels sit in 2 side-by-side columns (2열 분할 적재)
      if (resolvedPalletType === "1x2m" && dims.l === 1000 && dims.w === 1000) {
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

  function syncPendingFromBOM() {
    // Same bare-identifier note as getPanelDimensions() above -- app.js's
    // `bomItems` is a top-level `let`, never a `window.bomItems` property.
    if (typeof bomItems === 'undefined') return;

    // Group and consolidate items similar to updatePrintoutSheet grouping logic
    const itemMap = {};
    const consolidatedList = [];

    bomItems.forEach(item => {
      const cat = (item.category || "").toUpperCase().trim();
      if (cat !== "PANELS" && cat !== "PANEL") return;

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

    pendingList = consolidatedList.map(item => {
      return {
        partNo: item.partNo,
        category: item.category,
        partName: item.partName,
        totalQty: item.qty,
        pendingQty: item.qty
      };
    });

    // Reset Pallets
    pallets = [];
    nextPalletId = 1;
    
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
      tbody.innerHTML = `<tr><td colspan="4" align="center" style="color:var(--text-secondary);">대기 중인 판넬 목록이 없습니다. BOM 자동 생성을 먼저 진행하세요.</td></tr>`;
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
              <option value="">-- 선택 --</option>
              ${eligiblePallets.map(p => `<option value="${p.id}">Pallet #${p.id} (${getPalletTypeLabel(p.palletType || itemPalletType)})</option>`).join('')}
            </select>
            <input type="number" class="qty-input" value="1" min="1" max="${item.pendingQty}" style="width: 40px; padding: 2px; text-align: right; font-size: 11px;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.PalletPacking.manualPack(${idx})" style="padding: 2px 6px; font-size: 10px;">적재</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderPalletsDashboard() {
    const container = document.getElementById("palletDashboardList");
    if (!container) return;
    container.innerHTML = "";

    const Ht = parseFloat(document.getElementById("packHt").value) || 80;
    const Fh = parseFloat(document.getElementById("packFh").value) || 70;
    const Ph = parseFloat(document.getElementById("packPh").value) || 150;
    const limit = 2000;

    if (pallets.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 30px; border: 1.5px dashed var(--border-color); border-radius: 8px;">활성화된 파렛트가 없습니다. [새 파렛트 추가] 또는 [자동 패킹]을 실행하세요.</div>`;
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
        stackVisualHtml += '<div style="font-size: 11px; color:#94a3b8; font-style:italic; text-align:center; padding-top:25px;">비어있음</div>';
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
              <span>x${layer.qty}장</span>
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
            ${limitExceeded ? "선적한계 초과" : "안전선적"}
          </span>
        </div>

        <div style="font-size:11.5px; color: var(--text-secondary);">
          누적 높이: <strong style="color: ${statusColor}; font-size:13px;">${finalH.toFixed(0)}mm</strong> / 2000mm
        </div>

        <!-- Height visual progress bar -->
        <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
          <div style="width: ${hPercent}%; height: 100%; background: ${statusColor}; border-radius: 4px;"></div>
        </div>

        ${stackVisualHtml}

        <div style="display:flex; justify-content: flex-end; margin-top: 4px;">
          <button type="button" class="btn btn-sm btn-outline" onclick="window.PalletPacking.deletePallet(${pallet.id})" style="border-color: var(--neon-rose); color: var(--neon-rose); padding: 2px 8px; font-size: 11px;"><i class="fa-solid fa-trash-can"></i> 파렛트 폐기</button>
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
      alert("적재할 파렛트를 선택하세요.");
      return;
    }
    if (!qty || qty <= 0) {
      alert("유효한 수량을 입력하세요.");
      return;
    }

    const pendingItem = pendingList[pendingIdx];
    if (!pendingItem || qty > pendingItem.pendingQty) {
      alert("대기 수량보다 많은 양을 적재할 수 없습니다.");
      return;
    }

    const pallet = pallets.find(p => p.id === palletId);
    if (!pallet) return;

    const itemPalletType = getPalletType(pendingItem.partNo);
    if (pallet.palletType && pallet.palletType !== itemPalletType) {
      alert(`규격 불일치: 해당 파렛트는 [${getPalletTypeLabel(pallet.palletType)}] 전용입니다.\n[${getPalletTypeLabel(itemPalletType)}] 판넬은 동일한 규격의 전용 파렛트에 적재해주세요.`);
      return;
    }

    if (!canStackPanelOnPallet(pallet, pendingItem.partNo)) {
      alert(`적재 순서 제한: 저판(Bottom) 판넬 상단에는 측판/평판/측판노즐 판넬을 적재할 수 없습니다.\n(저판 상단에는 천정(Roof) 판넬 또는 저판 판넬만 적재 가능합니다.)`);
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
      if (!confirm(`주의: 이 수량을 적재하면 누적 높이가 ${testH.toFixed(0)}mm로 선적 제한(2000mm)을 초과합니다. 계속 적재하시겠습니까?`)) {
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

  // Helper to safely load items into active pallets without breaching height or mixing pallet sizes
  function pushToPalletWithLimit(pallet, partNo, qty, Ht, Fh, Ph, limit) {
    const itemType = getPalletType(partNo);
    const pType = (pallet.items && pallet.items.length > 0) ? getActualPalletTypeForPallet(pallet) : itemType;

    // Footprint Fit Check: Larger panels cannot go on smaller pallets; smaller panels CAN go on larger pallets!
    if (!canFitPanelOnPallet(pType, partNo)) {
      return false;
    }

    // Strict Stacking Sequence Restriction: Cannot stack Side/Partition panels on top of Bottom panels!
    if (!canStackPanelOnPallet(pallet, partNo)) {
      return false;
    }

    const testItems = JSON.parse(JSON.stringify(pallet.items));
    const exist = testItems.find(i => i.partNo === partNo);
    if (exist) exist.qty += qty;
    else testItems.push({ partNo, qty });

    const projectedPalletType = getActualPalletTypeForPallet({ items: testItems });
    const projectedH = calculatePalletHeight(testItems, Ht, Fh, Ph, projectedPalletType);
    return projectedH <= limit;
  }

  // Post-packing consolidation pass to merge under-filled pallets into minimum total pallets
  function consolidatePallets(palletsArray, Ht, Fh, Ph, limit) {
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
            realT.items = testTargets[idx].items;
          });
          palletsArray.splice(i, 1);
          improved = true;
          break;
        }
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
        const roofList = typeItems.filter(item => item.partNo.toUpperCase().startsWith("RF"));
        const bottomList = typeItems.filter(item => item.partNo.toUpperCase().startsWith("BF"));

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
              currentPallet = { id: simNextId++, palletType: pType, items: [] };
              simPallets.push(currentPallet);
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
    const scenario = document.getElementById("packScenarioSelect").value;
    const Ht = parseFloat(document.getElementById("packHt").value) || 80;
    const Fh = parseFloat(document.getElementById("packFh").value) || 70;
    const Ph = parseFloat(document.getElementById("packPh").value) || 150;
    const limit = 2000;

    // Reset pending items to full
    pendingList.forEach(item => {
      item.pendingQty = item.totalQty;
    });

    if (pendingList.length === 0 || pendingList.every(i => i.totalQty <= 0)) {
      alert("대기 판넬 수량이 없습니다. BOM을 먼저 생성하세요.");
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
          alert(`✨ 최적 자동적재 분석 완료!\n\n최소 ${bestResult.count}개 파렛트 구성으로 판넬 규격별(1x2m, 1x1.5m, 1x1m) 전용 파렛트에 자동 패킹되었습니다.`);
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

    let logoHtml = `<span style="font-weight: 800; font-size: 16px; color: #0284c7; letter-spacing: 1px;">${companyName}</span>`;
    if (savedLogo) {
      logoHtml = `<img src="${savedLogo}" style="max-height: 44px; max-width: 180px; object-fit: contain;">`;
    }

    let html = `
      <div style="font-family: 'Outfit', 'Arial', sans-serif; color: #1e293b; max-width: 860px; margin: 0 auto; background: #ffffff; padding: 15px;">
    `;

    if (pallets.length === 0) {
      return html + `<div style="text-align:center; padding:50px; color:#94a3b8; font-size:14px; font-weight:bold;">현재 생성되거나 적재된 파렛트가 없습니다. [자동 패킹 실행] 또는 [새 파렛트 추가] 후 다시 시도해 주세요.</div></div>`;
    }

    pallets.forEach((pallet, idx) => {
      const palletIndexStr = `#${idx + 1}  /  #${pallets.length}`;
      let totalQty = 0;
      
      const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
      const Fh = parseFloat(document.getElementById("packFh")?.value) || 40;
      const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
      const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph);

      html += `
        <div style="margin-bottom: 30px; page-break-after: always; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          
          <!-- Top Header Box -->
          <div style="display:flex; justify-content: space-between; align-items:center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px;">
            <div>${logoHtml}</div>
            <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; text-transform: uppercase;">PALLET PACKING LIST</h2>
          </div>

          <!-- General metadata header grid -->
          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; border: 1.5px solid #334155; margin-bottom: 15px; text-align: center; font-size: 11.5px; border-radius: 6px; overflow: hidden;">
            <div style="padding: 8px; border-right: 1px solid #334155;">
              <div style="font-size:10px; color:#64748b; font-weight:600;">Deliver to</div>
              <div style="font-size:13px; font-weight:700; color:#0f172a; margin-top:2px;">${deliverTo}</div>
            </div>
            <div style="padding: 8px; background:#f8fafc; border-right: 1px solid #334155;">
              <div style="font-size:10px; color:#64748b; font-weight:600;">Project / Order No.</div>
              <div style="font-size:13px; font-weight:700; color:#0284c7; margin-top:2px;">${orderNo} (${isInsulated})</div>
            </div>
            <div style="padding: 8px;">
              <div style="font-size:10px; color:#64748b; font-weight:600;">PALLET INDEX & SPEC</div>
              <div style="font-size:13px; color:#0f172a; font-weight:bold; margin-top:2px;">${palletIndexStr} <span style="color:#059669;">[${getPalletTypeLabel(pallet.palletType)}]</span></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; border: 1.5px solid #334155; margin-bottom: 15px; text-align: center; font-size: 11.5px; border-radius: 6px; overflow: hidden;">
            <div style="padding: 8px; border-right: 1px solid #334155;">
              <div style="font-size:10px; color:#64748b; font-weight:600;">Shipping Date</div>
              <div style="font-weight:700; color:#0f172a; margin-top:2px;">${orderDate}</div>
            </div>
            <div style="padding: 8px; background:#f8fafc; border-right: 1px solid #334155;">
              <div style="font-size:10px; color:#64748b; font-weight:600;">Customer</div>
              <div style="font-weight:700; color:#0f172a; margin-top:2px;">${customerName}</div>
            </div>
            <div style="padding: 8px;">
              <div style="font-size:10px; color:#64748b; font-weight:600;">Tank Size & Height</div>
              <div style="font-weight:700; color:#0f172a; margin-top:2px;">${tankWidth}mW x ${tankLength1}mL x ${tankHeight}mH</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #334155; font-size: 11.5px; text-align: center; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background: #f1f5f9; color: #334155; font-weight: bold; border-bottom: 1.5px solid #334155;">
                <th style="padding: 8px; border-right: 1px solid #cbd5e1; width: 180px;">Part Name (품명)</th>
                <th style="padding: 8px; border-right: 1px solid #cbd5e1; width: 140px;">Part No. (부품코드)</th>
                <th style="padding: 8px; border-right: 1px solid #cbd5e1; width: 120px;">SIZE (치수)</th>
                <th style="padding: 8px; border-right: 1px solid #cbd5e1; width: 90px; text-align: right;">Q'TY (수량)</th>
                <th style="padding: 8px; border-right: 1px solid #cbd5e1; width: 60px;">UNIT</th>
                <th style="padding: 8px;">Remarks</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (pallet.items.length === 0) {
        html += `<tr><td colspan="6" style="padding: 25px; color:#94a3b8; font-style:italic;">No panels stacked in this pallet.</td></tr>`;
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
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; text-align: left; font-weight: 600;">${cleanName}</td>
              <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #0284c7;">${layer.partNo}</td>
              <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0;">${dims.w/1000} x ${dims.l/1000}m</td>
              <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0; font-weight: bold; text-align: right; color: #0f172a;">${layer.qty}</td>
              <td style="padding: 7px 10px; border-right: 1px solid #e2e8f0;">EA</td>
              <td style="padding: 7px 10px; text-align: left; font-size:10.5px; color:#64748b;">Ht: ${dims.ht}mm / Fh: ${dims.fh}mm</td>
            </tr>
          `;
        });
      }

      html += `
            <tr style="font-weight: bold; background: #f8fafc; border-top: 1.5px solid #334155;">
              <td colspan="3" style="padding: 8px 10px; text-align: right; border-right: 1px solid #cbd5e1;">PALLET TOTAL</td>
              <td style="padding: 8px 10px; text-align: right; font-size:13px; color:#059669; border-right: 1px solid #cbd5e1;">${totalQty}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #cbd5e1;">EA</td>
              <td style="padding: 8px 10px; font-size:11px; text-align:right; color:#0284c7;">Stacked Height: <b>${finalH.toFixed(0)} mm</b> / 2000mm</td>
            </tr>
          </tbody>
        </table>

        <!-- Inspection signoff boxes -->
        <div style="display: flex; justify-content: flex-end; gap: 20px; margin-top: 20px;">
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; width: 140px; height: 54px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 6px; font-size: 10.5px; background: #f8fafc;">
            <div style="font-weight: bold; color: #475569;">Prepared By</div>
            <div style="color:#cbd5e1; font-style:italic; font-size: 9px;">(Signature)</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; width: 140px; height: 54px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 6px; font-size: 10.5px; background: #f8fafc;">
            <div style="font-weight: bold; color: #475569;">Approved By</div>
            <div style="color:#cbd5e1; font-style:italic; font-size: 9px;">(Signature)</div>
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

    if (!container) return;

    const html = generatePackingListSheetHTML();
    container.innerHTML = html;

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
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing-packing-list");
    }, 1000);
  }

  function exportPackingListToExcel() {
    try {
      if (typeof XLSX === "undefined") {
        alert("SheetJS (XLSX) 라이브러리가 로드되지 않았습니다.");
        return;
      }

      if (pallets.length === 0) {
        alert("내보낼 파렛트 적재 결과가 없습니다.");
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

      alert(`🎉 파렛트 적재명세서가 엑셀 파일(${filename})로 성공적으로 저장되었습니다.`);
    } catch (e) {
      console.error("Packing List Excel Export Error:", e);
      alert("엑셀 내보내기 중 오류 발생: " + e.message);
    }
  }

  function resetAllPacking() {
    if (confirm("정말로 모든 패킹 결과를 초기화하고 대기 상태로 되돌리시겠습니까?")) {
      syncPendingFromBOM();
    }
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

  function init() {
    wireUpUI();
    syncPendingFromBOM();
  }

  global.openPackingListPreview = openPackingListPreview;
  global.closePackingListPreview = closePackingListPreview;
  global.toggleMinimizePackingPreview = toggleMinimizePackingPreview;
  global.printPackingListSheet = printPackingListSheet;
  global.exportPackingListToExcel = exportPackingListToExcel;

  global.PalletPacking = {
    init,
    syncPendingFromBOM,
    manualPack,
    unloadItem,
    deletePallet,
    printPalletList
  };

})(typeof window !== "undefined" ? window : globalThis);

