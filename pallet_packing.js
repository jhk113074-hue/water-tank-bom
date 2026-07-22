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

  // Helper to determine if a panel is Bottom (저판) or Roof (천정)
  function isBottomOrRoof(partNo, dims) {
    const pNo = (partNo || "").toUpperCase().trim();
    const name = (dims && dims.name ? dims.name : "").toLowerCase();
    
    // Bottom / Base / Drain panels
    if (pNo.startsWith("BF") || pNo.startsWith("NF") || pNo.startsWith("NH") || pNo.startsWith("NQ") || pNo.startsWith("PH")) {
      return true;
    }
    // Roof / Manhole panels
    if (pNo.startsWith("RF") || pNo.startsWith("MF")) {
      return true;
    }
    // Check keywords in name
    if (name.includes("bottom") || name.includes("base") || name.includes("drain") || name.includes("roof") || name.includes("manhole") || name.includes("저판") || name.includes("천정") || name.includes("하부") || name.includes("상부")) {
      return true;
    }
    
    return false;
  }

  // Calculate cumulative nested height of a stack of panels on a pallet
  function calculatePalletHeight(palletItems, defaultHt, defaultFh, Ph) {
    if (!palletItems || palletItems.length === 0) return 0;
    
    let totalHeight = Ph; // Pallet base height (e.g. 150mm)

    palletItems.forEach(layer => {
      const qty = layer.qty;
      const dims = getPanelDimensions(layer.partNo);
      
      const Ht = (dims && dims.ht != null) ? dims.ht : defaultHt;
      const Fh = (dims && dims.fh != null) ? dims.fh : defaultFh;

      // Each panel stacked vertically adds 1 layer of height
      const nestedStacksCount = qty;

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

      const pTypeSpec = pallet.palletType || (pallet.items[0] ? getPalletType(pallet.items[0].partNo) : "1x1m");
      const pTypeBadge = getPalletTypeLabel(pTypeSpec);

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color: var(--text-primary); font-size: 13px;">Pallet #${pallet.id}</strong>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #e0f2fe; color: #0284c7; font-weight: bold; margin-left: 4px;">
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

  // Helper to safely load items into active pallets without breaching height or mixing pallet sizes
  function pushToPalletWithLimit(pallet, partNo, qty, Ht, Fh, Ph, limit) {
    const itemType = getPalletType(partNo);
    
    // Strict Size Isolation: Do NOT mix different pallet size specifications!
    if (pallet.palletType && pallet.palletType !== itemType) {
      return false;
    }
    if (!pallet.palletType) {
      pallet.palletType = itemType;
    }

    const testItems = JSON.parse(JSON.stringify(pallet.items));
    const exist = testItems.find(i => i.partNo === partNo);
    if (exist) exist.qty += qty;
    else testItems.push({ partNo, qty });

    const projectedH = calculatePalletHeight(testItems, Ht, Fh, Ph);
    return projectedH <= limit;
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
        const pushByPrefix = (prefix) => {
          typeItems.forEach(item => {
            if (item.partNo.toUpperCase().startsWith(prefix) && item.pendingQty > 0 && !sorted.includes(item)) {
              sorted.push(item);
            }
          });
        };
        pushByPrefix("SL");
        pushByPrefix("ST");
        pushByPrefix("SF");
        pushByPrefix("BF");
        pushByPrefix("NF");
        pushByPrefix("RF");
        pushByPrefix("MF");
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

    return {
      pallets: simPallets.filter(p => p.items && p.items.length > 0),
      pendingList: pList,
      nextPalletId: simNextId
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
    if (pallets.length === 0) {
      alert("출력할 파렛트가 없습니다. 먼저 패킹을 실행해 주세요.");
      return;
    }

    const deliverTo = document.getElementById("deliverTo")?.value || "DAMMAM, KSA";
    const customerName = document.getElementById("customerName")?.value || "ABC";
    const orderNo = document.getElementById("orderNo")?.value || "A Project";
    const orderDate = document.getElementById("orderDate")?.value || new Date().toISOString().split('T')[0];
    const isInsulated = document.getElementById("insulationType")?.value === "insulated" ? "Insulated" : "Non-Insulated";
    const tankWidth = document.getElementById("tankWidth")?.value || "2";
    const tankLength1 = document.getElementById("tankLength1")?.value || "2";
    const tankHeight = document.getElementById("tankHeight")?.value || "2";

    const printWindow = window.open("", "_blank");
    let html = `
      <html>
      <head>
        <title>YSACC PALLET PACKING LIST</title>
        <style>
          body { font-family: 'Outfit', 'Malgun Gothic', sans-serif; padding: 20px; color: #1e293b; background: #fff; }
          .page-break { page-break-after: always; }
          .packing-header { display: grid; grid-template-columns: 200px 1fr 150px; border: 2px solid #000; margin-bottom: 20px; text-align: center; font-size: 13px; font-weight: bold; }
          .header-box { border-right: 1.5px solid #000; padding: 10px; display: flex; flex-direction: column; justify-content: center; }
          .header-box:last-child { border-right: none; }
          .packing-table { width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 13px; margin-top: 15px; }
          .packing-table th, .packing-table td { border: 1.5px solid #000; padding: 10px; text-align: center; }
          .packing-table th { background: #f8fafc; font-weight: bold; }
          .total-row { font-weight: bold; background: #f1f5f9; }
          h2 { margin: 5px 0; color: #0f172a; }
          .sign-area { display: flex; justify-content: flex-end; gap: 40px; margin-top: 40px; }
          .sign-box { border: 1.5px solid #000; width: 150px; height: 70px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 5px; font-size: 11px; }
        </style>
      </head>
      <body>
    `;

    pallets.forEach((pallet, idx) => {
      const palletIndexStr = `#${idx + 1}  /  #${pallets.length}`;
      let totalQty = 0;
      
      const Ht = parseFloat(document.getElementById("packHt").value) || 80;
      const Fh = parseFloat(document.getElementById("packFh").value) || 40;
      const Ph = parseFloat(document.getElementById("packPh").value) || 150;
      const finalH = calculatePalletHeight(pallet.items, Ht, Fh, Ph);

      html += `
        <div class="page-break">
          <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px;">
            <img src="${localStorage.getItem('custom_company_logo') || ''}" style="max-height: 40px; max-width: 150px;" onerror="this.style.display='none'">
            <h2>PALLET PACKING LIST</h2>
          </div>

          <!-- General metadata header grid -->
          <div class="packing-header">
            <div class="header-box">
              <div style="font-size:10px; color:#64748b;">Deliver to</div>
              <div style="font-size:14px; margin-top:4px;">${deliverTo}</div>
            </div>
            <div class="header-box" style="background:#f8fafc; border-left:1.5px solid #000; border-right:1.5px solid #000;">
              <div>Project: ${orderNo}</div>
              <div style="margin-top:6px; font-weight:normal; color:#475569;">Spec: ${isInsulated}</div>
            </div>
            <div class="header-box">
              <div style="font-size:10px; color:#64748b;">PALLET INDEX</div>
              <div style="font-size:16px; color:#0f172a; margin-top:4px;">${palletIndexStr}</div>
            </div>
          </div>

          <div class="packing-header" style="margin-top:-10px;">
            <div class="header-box">
              <div style="font-size:10px; color:#64748b;">Shipping Date</div>
              <div>${orderDate}</div>
            </div>
            <div class="header-box" style="background:#f8fafc;">
              <div style="font-size:10px; color:#64748b;">Customer</div>
              <div>${customerName}</div>
            </div>
            <div class="header-box">
              <div style="font-size:10px; color:#64748b;">Tank Size & Height</div>
              <div>${tankWidth}x${tankLength1}x${tankHeight}mH</div>
            </div>
          </div>

          <table class="packing-table">
            <thead>
              <tr>
                <th width="200">Part Name (품명)</th>
                <th width="150">Part No. (부품코드)</th>
                <th width="120">SIZE (치수)</th>
                <th width="100">Q'TY (수량)</th>
                <th width="80">UNIT</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (pallet.items.length === 0) {
        html += `<tr><td colspan="6" style="padding: 30px; color:#94a3b8; font-style:italic;">No panels stacked in this pallet.</td></tr>`;
      } else {
        pallet.items.forEach(layer => {
          const dims = getPanelDimensions(layer.partNo);
          totalQty += layer.qty;

          // Resolve clean descriptive text labels based on part prefixes
          let cleanName = "Wall Panel";
          const pNo = layer.partNo.toUpperCase();
          if (pNo.startsWith("RF")) cleanName = "Roof";
          else if (pNo.startsWith("MF")) cleanName = "Manhole";
          else if (pNo.startsWith("BF")) cleanName = "Base (Bottom)";
          else if (pNo.startsWith("NF") && pNo.includes("B")) cleanName = "Nozzle_Drain";
          else if (pNo.startsWith("NF") && pNo.includes("L")) cleanName = "Side (Nozzle)";
          else if (pNo.startsWith("SL") || pNo.startsWith("ST")) cleanName = "Side_Wall";

          html += `
            <tr>
              <td style="text-align: left; font-weight: 600;">${cleanName}</td>
              <td style="font-family: monospace; font-weight: bold;">${layer.partNo}</td>
              <td>${dims.w/1000} x ${dims.l/1000}m</td>
              <td style="font-weight: bold; font-size:14px;">${layer.qty}</td>
              <td>EA</td>
              <td style="text-align: left; font-size:11px; color:#64748b;">Ht: ${dims.ht}mm / Fh: ${dims.fh}mm</td>
            </tr>
          `;
        });
      }

      html += `
            <tr class="total-row">
              <td colspan="3" style="text-align: right;">TOTAL</td>
              <td style="font-size:15px; color:#0f172a;">${totalQty}</td>
              <td>EA</td>
              <td style="font-size:11px; text-align:right;">Stacked Height: ${finalH.toFixed(0)} mm</td>
            </tr>
          </tbody>
        </table>

        <!-- Inspection signoff boxes -->
        <div class="sign-area">
          <div class="sign-box">
            <div>Prepared By</div>
            <div style="color:#cbd5e1; font-style:italic;">Sign</div>
          </div>
          <div class="sign-box">
            <div>Approved By</div>
            <div style="color:#cbd5e1; font-style:italic;">Sign</div>
          </div>
        </div>
      </div>
      `;
    });

    html += `
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
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

  global.PalletPacking = {
    init,
    syncPendingFromBOM,
    manualPack,
    unloadItem,
    deletePallet,
    printPalletList
  };

})(typeof window !== "undefined" ? window : globalThis);

