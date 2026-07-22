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
    if (PANEL_SIZE_CATALOG[pNo]) {
      return PANEL_SIZE_CATALOG[pNo];
    }
    // Fallback parser heuristics based on common strings
    if (pNo.includes("20")) return { name: "Panel 1x2m", w: 1000, l: 2000 };
    if (pNo.includes("15")) return { name: "Panel 1x1.5m", w: 1000, l: 1500 };
    return { name: "Panel 1x1m", w: 1000, l: 1000 };
  }

  // Calculate cumulative nested height of a stack of panels on a pallet
  function calculatePalletHeight(palletItems, Ht, Fh, Ph) {
    if (!palletItems || palletItems.length === 0) return 0;
    
    // Group into stacked layers.
    // In our algorithm, same layer is processed for "parallel" packing.
    // If a layer has panels that can sit side-by-side on the pallet size, we only add +Fh once.
    let totalHeight = Ph; // Pallet base height
    let firstPanel = true;

    // We process stack list sequentially
    palletItems.forEach(layer => {
      // layer is { partNo, qty }
      const qty = layer.qty;
      const dims = getPanelDimensions(layer.partNo);
      
      // Determine how many fit side-by-side on a standard 1x2m or 1.5m pallet area
      // 1x2m panel area is 2 sq-meters. 1x1m fits 2.
      let nestedStacksCount = qty;
      if (dims.l === 1000 && dims.w === 1000) {
        // 1x1m fits 2 side-by-side
        nestedStacksCount = Math.ceil(qty / 2);
      } else if (dims.l === 1000 && dims.w === 500) {
        // 0.5x1m fits 4 side-by-side
        nestedStacksCount = Math.ceil(qty / 4);
      }

      if (nestedStacksCount > 0) {
        if (firstPanel) {
          totalHeight += Ht + (nestedStacksCount - 1) * Fh;
          firstPanel = false;
        } else {
          totalHeight += nestedStacksCount * Fh;
        }
      }
    });

    return totalHeight;
  }

  function syncPendingFromBOM() {
    if (typeof window.bomItems === 'undefined') return;
    
    // Extract only panels
    const panelsOnly = window.bomItems.filter(item => {
      const cat = (item.category || "").toUpperCase().trim();
      return cat === "PANELS" || cat === "PANEL";
    });

    pendingList = panelsOnly.map(item => {
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
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: bold;">${item.partNo}</td>
        <td>${item.partName}</td>
        <td style="font-weight: bold; color: var(--neon-blue); text-align: center;">${item.pendingQty} / ${item.totalQty}</td>
        <td align="center">
          <div style="display: flex; gap: 4px; align-items: center; justify-content: center;">
            <select class="pallet-select" style="font-size: 11px; padding: 2px;">
              <option value="">-- 선택 --</option>
              ${pallets.map(p => `<option value="${p.id}">Pallet #${p.id}</option>`).join('')}
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
    const Fh = parseFloat(document.getElementById("packFh").value) || 40;
    const Ph = parseFloat(document.getElementById("packPh").value) || 150;
    const limit = 2000;

    if (pallets.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 30px; border: 1.5px dashed var(--border-color); border-radius: 8px;">활성화된 파렛트가 없습니다. [새 파렛트 추가] 또는 [자동 패킹]을 실행하세요.</div>`;
      return;
    }

    pallets.forEach(pallet => {
      const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph);
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

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color: var(--text-primary); font-size: 13px;">Pallet #${pallet.id}</strong>
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
      items: [] // array of { partNo, qty }
    });
    renderPendingTable();
    renderPalletsDashboard();
  }

  function deletePallet(palletId) {
    const idx = pallets.findIndex(p => p.id === palletId);
    if (idx !== -1) {
      // Unload items back to pending list
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

    // Stacking verification
    const Ht = parseFloat(document.getElementById("packHt").value) || 80;
    const Fh = parseFloat(document.getElementById("packFh").value) || 40;
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

    // Put back to pending
    const pendingItem = pendingList.find(p => p.partNo === item.partNo);
    if (pendingItem) {
      pendingItem.pendingQty += item.qty;
    }

    pallet.items.splice(layerIdx, 1);
    renderPendingTable();
    renderPalletsDashboard();
  }

  // Automatic Packing Scenario Engine
  function runAutoPack() {
    const scenario = document.getElementById("packScenarioSelect").value;
    const Ht = parseFloat(document.getElementById("packHt").value) || 80;
    const Fh = parseFloat(document.getElementById("packFh").value) || 40;
    const Ph = parseFloat(document.getElementById("packPh").value) || 150;
    const limit = 2000;

    // Reload pending quantities to 100% full
    pendingList.forEach(item => {
      item.pendingQty = item.totalQty;
    });
    pallets = [];
    nextPalletId = 1;

    if (pendingList.length === 0 || pendingList.every(i => i.totalQty <= 0)) {
      alert("대기 판넬 수량이 없습니다. BOM을 먼저 생성하세요.");
      return;
    }

    // Scenario Logic Router
    if (scenario === "A") {
      runScenarioA(Ht, Fh, Ph, limit);
    } else if (scenario === "B") {
      runScenarioB(Ht, Fh, Ph, limit);
    } else if (scenario === "C") {
      runScenarioC(Ht, Fh, Ph, limit);
    } else if (scenario === "D") {
      runScenarioD(Ht, Fh, Ph, limit);
    } else if (scenario === "E") {
      runScenarioE(Ht, Fh, Ph, limit);
    }

    renderPendingTable();
    renderPalletsDashboard();
  }

  // Helper to safely load items into active pallets without breaching height
  function pushToPalletWithLimit(pallet, partNo, qty, Ht, Fh, Ph, limit) {
    const testItems = JSON.parse(JSON.stringify(pallet.items));
    const exist = testItems.find(i => i.partNo === partNo);
    if (exist) exist.qty += qty;
    else testItems.push({ partNo, qty });

    const projectedH = calculatePalletHeight(testItems, Ht, Fh, Ph);
    return projectedH <= limit;
  }

  // A: Standard Mix (Side -> Bottom -> Roof)
  function runScenarioA(Ht, Fh, Ph, limit) {
    // Sort logic sequence: Side first, then Base/Drain, then Roof/Manhole
    const sortedPending = [];
    const pushByPrefix = (prefix) => {
      pendingList.forEach(item => {
        if (item.partNo.toUpperCase().startsWith(prefix) && item.pendingQty > 0) {
          sortedPending.push(item);
        }
      });
    };
    
    pushByPrefix("SL"); // 1x2m / 1x1.5m Sides
    pushByPrefix("ST"); // 1x2m
    pushByPrefix("SF"); // 1x1m Sides
    pushByPrefix("BF"); // Bottoms
    pushByPrefix("NF"); // Drains
    pushByPrefix("RF"); // Roof
    pushByPrefix("MF"); // Manhole
    
    // Remaining anything else
    pendingList.forEach(item => {
      if (!sortedPending.includes(item) && item.pendingQty > 0) {
        sortedPending.push(item);
      }
    });

    let currentPallet = { id: nextPalletId++, items: [] };
    pallets.push(currentPallet);

    sortedPending.forEach(item => {
      while (item.pendingQty > 0) {
        // Try to add 1 unit
        if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
          const exist = currentPallet.items.find(i => i.partNo === item.partNo);
          if (exist) exist.qty += 1;
          else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
          item.pendingQty -= 1;
        } else {
          // Open new pallet
          currentPallet = { id: nextPalletId++, items: [] };
          pallets.push(currentPallet);
          
          // Force pack at least 1 item to avoid infinite loop
          currentPallet.items.push({ partNo: item.partNo, qty: 1 });
          item.pendingQty -= 1;
        }
      }
    });
  }

  // B: Same Size Only (2m separate, 1.5m separate, etc.)
  function runScenarioB(Ht, Fh, Ph, limit) {
    const sizeGroups = {
      size2m: [],
      size1_5m: [],
      size1m: []
    };

    pendingList.forEach(item => {
      const dims = getPanelDimensions(item.partNo);
      if (dims.l === 2000) sizeGroups.size2m.push(item);
      else if (dims.l === 1500) sizeGroups.size1_5m.push(item);
      else sizeGroups.size1m.push(item);
    });

    const packGroup = (groupItems) => {
      if (groupItems.length === 0) return;
      let currentPallet = { id: nextPalletId++, items: [] };
      pallets.push(currentPallet);

      groupItems.forEach(item => {
        while (item.pendingQty > 0) {
          if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
            const exist = currentPallet.items.find(i => i.partNo === item.partNo);
            if (exist) exist.qty += 1;
            else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
            item.pendingQty -= 1;
          } else {
            currentPallet = { id: nextPalletId++, items: [] };
            pallets.push(currentPallet);
            currentPallet.items.push({ partNo: item.partNo, qty: 1 });
            item.pendingQty -= 1;
          }
        }
      });
    };

    packGroup(sizeGroups.size2m);
    packGroup(sizeGroups.size1_5m);
    packGroup(sizeGroups.size1m);
  }

  // C: Bottom Only separate packing
  function runScenarioC(Ht, Fh, Ph, limit) {
    const bottomItems = [];
    const otherItems = [];

    pendingList.forEach(item => {
      const pNo = item.partNo.toUpperCase();
      if (pNo.startsWith("BF") || pNo.startsWith("NF")) {
        bottomItems.push(item);
      } else {
        otherItems.push(item);
      }
    });

    const packList = (list) => {
      if (list.length === 0) return;
      let currentPallet = { id: nextPalletId++, items: [] };
      pallets.push(currentPallet);

      list.forEach(item => {
        while (item.pendingQty > 0) {
          if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
            const exist = currentPallet.items.find(i => i.partNo === item.partNo);
            if (exist) exist.qty += 1;
            else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
            item.pendingQty -= 1;
          } else {
            currentPallet = { id: nextPalletId++, items: [] };
            pallets.push(currentPallet);
            currentPallet.items.push({ partNo: item.partNo, qty: 1 });
            item.pendingQty -= 1;
          }
        }
      });
    };

    packList(bottomItems);
    packList(otherItems);
  }

  // D: Roof & Bottom 1:1 Pairs
  function runScenarioD(Ht, Fh, Ph, limit) {
    const roofList = pendingList.filter(item => item.partNo.toUpperCase().startsWith("RF"));
    const bottomList = pendingList.filter(item => item.partNo.toUpperCase().startsWith("BF"));
    const others = pendingList.filter(item => !roofList.includes(item) && !bottomList.includes(item));

    let currentPallet = { id: nextPalletId++, items: [] };
    pallets.push(currentPallet);

    // Keep pairing 1 roof and 1 bottom
    let hasPairs = true;
    while (hasPairs) {
      const activeRoof = roofList.find(r => r.pendingQty > 0);
      const activeBottom = bottomList.find(b => b.pendingQty > 0);

      if (activeRoof && activeBottom) {
        // Try adding the pair
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
          currentPallet = { id: nextPalletId++, items: [] };
          pallets.push(currentPallet);
        }
      } else {
        hasPairs = false;
      }
    }

    // Pack remaining leftover roof, bottoms, and other items
    const remaining = pendingList.filter(item => item.pendingQty > 0);
    remaining.forEach(item => {
      while (item.pendingQty > 0) {
        if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
          const exist = currentPallet.items.find(i => i.partNo === item.partNo);
          if (exist) exist.qty += 1;
          else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
          item.pendingQty -= 1;
        } else {
          currentPallet = { id: nextPalletId++, items: [] };
          pallets.push(currentPallet);
          currentPallet.items.push({ partNo: item.partNo, qty: 1 });
          item.pendingQty -= 1;
        }
      }
    });
  }

  // E: Special Set (Side 1x1m + Drain + Roof)
  function runScenarioE(Ht, Fh, Ph, limit) {
    const side1mList = pendingList.filter(item => item.partNo.toUpperCase().startsWith("SF"));
    const drainList = pendingList.filter(item => item.partNo.toUpperCase().startsWith("NF"));
    const roofList = pendingList.filter(item => item.partNo.toUpperCase().startsWith("RF"));

    let currentPallet = { id: nextPalletId++, items: [] };
    pallets.push(currentPallet);

    let setsActive = true;
    while (setsActive) {
      const activeSide = side1mList.find(s => s.pendingQty > 0);
      const activeDrain = drainList.find(d => d.pendingQty > 0);
      const activeRoof = roofList.find(r => r.pendingQty > 0);

      if (activeSide && activeDrain && activeRoof) {
        const testItems = JSON.parse(JSON.stringify(currentPallet.items));
        const addOne = (arr, partNo) => {
          const ex = arr.find(a => a.partNo === partNo);
          if (ex) ex.qty += 1;
          else arr.push({ partNo, qty: 1 });
        };
        addOne(testItems, activeSide.partNo);
        addOne(testItems, activeDrain.partNo);
        addOne(testItems, activeRoof.partNo);

        const testH = calculatePalletHeight(testItems, Ht, Fh, Ph);
        if (testH <= limit) {
          addOne(currentPallet.items, activeSide.partNo);
          addOne(currentPallet.items, activeDrain.partNo);
          addOne(currentPallet.items, activeRoof.partNo);
          activeSide.pendingQty -= 1;
          activeDrain.pendingQty -= 1;
          activeRoof.pendingQty -= 1;
        } else {
          currentPallet = { id: nextPalletId++, items: [] };
          pallets.push(currentPallet);
        }
      } else {
        setsActive = false;
      }
    }

    // Pack remaining leftover parts
    const remaining = pendingList.filter(item => item.pendingQty > 0);
    remaining.forEach(item => {
      while (item.pendingQty > 0) {
        if (pushToPalletWithLimit(currentPallet, item.partNo, 1, Ht, Fh, Ph, limit)) {
          const exist = currentPallet.items.find(i => i.partNo === item.partNo);
          if (exist) exist.qty += 1;
          else currentPallet.items.push({ partNo: item.partNo, qty: 1 });
          item.pendingQty -= 1;
        } else {
          currentPallet = { id: nextPalletId++, items: [] };
          pallets.push(currentPallet);
          currentPallet.items.push({ partNo: item.partNo, qty: 1 });
          item.pendingQty -= 1;
        }
      }
    });
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

    if (btnSync) btnSync.addEventListener("click", syncPendingFromBOM);
    if (btnAuto) btnAuto.addEventListener("click", runAutoPack);
    if (btnAdd) btnAdd.addEventListener("click", addPallet);
    if (btnReset) btnReset.addEventListener("click", resetAllPacking);

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

  global.PalletPacking = {
    init,
    syncPendingFromBOM,
    manualPack,
    unloadItem,
    deletePallet
  };

})(typeof window !== "undefined" ? window : globalThis);
