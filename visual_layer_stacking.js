// =============================================================================
// Visual Layer Stacking Graphic Diagram Renderer for Pallet Packing
// Supports proportional panel width rendering:
// - 1x2m Pallet: 1x2m panel (100% full), 1x1m panel (1/2 side-by-side), 0.5x1m panel (1/4)
// - 1x1.5m Pallet: 1x1.5m (100%), 1x1m (2/3), 0.5x1m (1/3)
// - 1x1m Pallet: 1x1m (100%), 0.5x1m (1/2)
// =============================================================================
(function(global) {
  "use strict";

  function getPanelLengthRatio(partNo, palletLength) {
    let w = 1000, l = 1000;
    if (typeof PalletPacking !== 'undefined' && typeof PalletPacking.getPanelDimensions === 'function') {
      const dims = PalletPacking.getPanelDimensions(partNo);
      if (dims) {
        w = dims.w || 1000;
        l = dims.l || 1000;
      }
    }
    const maxDim = Math.max(w, l);
    const minDim = Math.min(w, l);

    // 1. Full 2.0m panel:
    if (maxDim >= 1800) {
      return Math.min(1.0, 2000 / palletLength);
    }
    // 2. 1.5m panel:
    if (maxDim >= 1400) {
      return Math.min(1.0, 1500 / palletLength);
    }
    // 3. 1.0m panel:
    if (maxDim >= 900) {
      return Math.min(1.0, 1000 / palletLength);
    }
    // 4. 0.5m half/quarter panel:
    return Math.min(1.0, 500 / palletLength);
  }

  function getPanelColors(partNo, tierNum) {
    const pNo = (partNo || "").toUpperCase().trim();
    if (pNo.startsWith("MF")) return { fill: "#a855f7", stroke: "#7e22ce", text: "#ffffff", badge: "맨홀" }; // Purple
    if (pNo.startsWith("RF")) return { fill: "#3b82f6", stroke: "#1d4ed8", text: "#ffffff", badge: "천정" }; // Blue
    if (pNo.startsWith("BF") || pNo.startsWith("NF")) return { fill: "#f59e0b", stroke: "#b45309", text: "#ffffff", badge: "저판" }; // Amber
    if (pNo.startsWith("NH") || pNo.startsWith("NQ") || pNo.startsWith("PF") || pNo.startsWith("PH")) return { fill: "#0d9488", stroke: "#0f766e", text: "#ffffff", badge: "격벽" }; // Teal
    if (tierNum === 1) return { fill: "#10b981", stroke: "#047857", text: "#ffffff", badge: "하단" }; // Green
    return { fill: "#0284c7", stroke: "#0369a1", text: "#ffffff", badge: "측판" }; // Sky
  }

  function renderPalletLayerDiagramContainer(pallet, options) {
    if (!pallet || !pallet.items || pallet.items.length === 0) {
      return '<div style="font-size:11px; color:#94a3b8; font-style:italic; text-align:center; padding: 20px;">Empty Pallet</div>';
    }

    const Ht = options?.Ht || 80;
    const Fh = options?.Fh || 70;
    const Ph = options?.Ph || 150;
    const limit = options?.limit || 2000;

    const pType = pallet.palletType || (typeof PalletPacking !== 'undefined' && typeof PalletPacking.getActualPalletTypeForPallet === 'function' ? PalletPacking.getActualPalletTypeForPallet(pallet) : '1x2m');
    const palLength = (pType === "1x2m") ? 2000 : ((pType === "1x1.5m") ? 1500 : 1000);

    // Expand items into tiers using PalletPacking helper if available, or fallback
    let tiers = [];
    if (typeof PalletPacking !== 'undefined' && typeof PalletPacking.expandPalletItemsToTiers === 'function') {
      tiers = PalletPacking.expandPalletItemsToTiers(pallet);
    } else {
      pallet.items.forEach(item => {
        for (let i = 0; i < (item.qty || 1); i++) {
          tiers.push({ partNo: item.partNo, subItems: [item] });
        }
      });
    }

    const totalTiers = tiers.length;
    if (totalTiers === 0) {
      return '<div style="font-size:11px; color:#94a3b8; font-style:italic; text-align:center; padding: 20px;">No Layers</div>';
    }

    // Precompute cumulative heights
    let runningH = Ph;
    const tierHeights = [];
    tiers.forEach((t, idx) => {
      const isTop = (idx === totalTiers - 1);
      const stepH = isTop ? Ht : Fh;
      runningH += stepH;
      tierHeights.push({
        tierNum: idx + 1,
        stepH: stepH,
        cumH: Math.round(runningH * 10) / 10,
        isTop: isTop,
        partNo: t.partNo || (t.subItems && t.subItems[0] ? t.subItems[0].partNo : 'Panel'),
        subItems: t.subItems || [{ partNo: t.partNo, qty: t.qty || 1 }]
      });
    });

    const finalHeight = runningH;
    const limitExceeded = finalHeight > limit;

    // SVG Drawing Dimensions
    const svgW = 320;
    const svgH = 340;
    const marginB = 35;
    const marginT = 25;
    const marginL = 50;
    const marginR = 60;
    const drawH = svgH - marginB - marginT;

    // Scaling ratio: map limit (2000mm) or finalHeight to drawH
    const maxVal = Math.max(limit, finalHeight) * 1.08;
    const scaleY = drawH / maxVal;

    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; height:auto; max-height:360px; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; display:block;">`;

    // 1. Background Grid & Limit Threshold Line (2000mm)
    const limitY = svgH - marginB - (limit * scaleY);
    svg += `<line x1="${marginL - 10}" y1="${limitY}" x2="${svgW - marginR + 10}" y2="${limitY}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 3" />`;
    svg += `<text x="${svgW - marginR + 12}" y="${limitY + 4}" fill="#ef4444" font-size="9.5" font-weight="bold">Max ${limit}mm</text>`;

    // 2. Pallet Base Wooden/Steel Frame (Height Ph = 150mm)
    const baseW = svgW - marginL - marginR;
    const baseY = svgH - marginB;
    const baseH = Ph * scaleY;

    // Wooden Feet Blocks
    const footW = baseW * 0.22;
    svg += `<rect x="${marginL}" y="${baseY - baseH}" width="${footW}" height="${baseH}" fill="#b45309" rx="2" />`;
    svg += `<rect x="${marginL + baseW / 2 - footW / 2}" y="${baseY - baseH}" width="${footW}" height="${baseH}" fill="#b45309" rx="2" />`;
    svg += `<rect x="${marginL + baseW - footW}" y="${baseY - baseH}" width="${footW}" height="${baseH}" fill="#b45309" rx="2" />`;

    // Pallet Base Top Runner
    const runnerH = Math.max(5, baseH * 0.35);
    svg += `<rect x="${marginL - 4}" y="${baseY - baseH}" width="${baseW + 8}" height="${runnerH}" fill="#d97706" stroke="#92400e" stroke-width="1" rx="2" />`;
    svg += `<text x="${marginL - 8}" y="${baseY - baseH / 2 + 3}" fill="#78350f" font-size="9" font-weight="bold" text-anchor="end">Pallet +${Ph}mm</text>`;

    // 3. Render Tier Stack Boxes (Bottom to Top) with Proportional Width
    let curY = baseY - baseH;

    tierHeights.forEach((t, idx) => {
      const tierH = t.stepH * scaleY;
      const yPos = curY - tierH;
      curY = yPos;

      const subList = t.subItems || [{ partNo: t.partNo, qty: 1 }];
      const pieces = [];
      subList.forEach(s => {
        const ratio = getPanelLengthRatio(s.partNo, palLength);
        const count = Number(s.qty) || 1;
        for (let i = 0; i < count; i++) {
          pieces.push({ partNo: s.partNo, ratio: ratio });
        }
      });

      svg += `<g class="pallet-tier-group" cursor="pointer">`;

      let currentX = marginL;
      pieces.forEach(p => {
        const pieceW = Math.min(baseW - (currentX - marginL), baseW * p.ratio);
        if (pieceW <= 0.5) return;
        const colors = getPanelColors(p.partNo, t.tierNum);

        svg += `<rect x="${currentX}" y="${yPos}" width="${pieceW}" height="${tierH}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="0.8" rx="1.5" opacity="0.95">
                  <title>${t.tierNum}단: ${p.partNo} (폭 ${(p.ratio * 100).toFixed(0)}% | 높이 +${t.stepH}mm | 누계 ${t.cumH}mm)</title>
                </rect>`;

        // Panel Flange Lip Line
        if (!t.isTop) {
          svg += `<line x1="${currentX + 1}" y1="${yPos + 1}" x2="${currentX + pieceW - 1}" y2="${yPos + 1}" stroke="rgba(255,255,255,0.7)" stroke-width="0.7" />`;
        } else {
          // Topmost Convex Crown Lip
          svg += `<path d="M ${currentX} ${yPos} Q ${currentX + pieceW / 2} ${yPos - 2} ${currentX + pieceW} ${yPos}" fill="none" stroke="${colors.stroke}" stroke-width="1.2" />`;
        }

        // Tier Number & Part Label inside box if space allows
        if (tierH >= 6.5 && pieceW >= 22) {
          const fontSize = (pieceW < 55) ? 6.5 : ((pieceW < 80 || totalTiers > 15) ? 7.5 : 8.5);
          svg += `<text x="${currentX + pieceW / 2}" y="${yPos + tierH / 2 + 2.8}" fill="${colors.text}" font-size="${fontSize}" font-weight="bold" text-anchor="middle" pointer-events="none">${p.partNo}</text>`;
        }

        currentX += pieceW;
      });

      // If tier has empty space (incomplete tier), draw subtle dashed placeholder
      const emptyW = (marginL + baseW) - currentX;
      if (emptyW > 3) {
        svg += `<rect x="${currentX}" y="${yPos}" width="${emptyW}" height="${tierH}" fill="rgba(241, 245, 249, 0.4)" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="3 2" rx="1.5">
                  <title>${t.tierNum}단 빈 공간 (${((emptyW/baseW)*100).toFixed(0)}% 여유)</title>
                </rect>`;
        if (tierH >= 7 && emptyW >= 35) {
          svg += `<text x="${currentX + emptyW / 2}" y="${yPos + tierH / 2 + 2.5}" fill="#94a3b8" font-size="6.5" font-style="italic" text-anchor="middle">Empty</text>`;
        }
      }

      // Height Marker Label on the right
      if (t.isTop || t.tierNum === 1 || t.tierNum % 5 === 0 || t.tierNum === totalTiers) {
        svg += `<text x="${marginL + baseW + 6}" y="${yPos + tierH / 2 + 3}" fill="#334155" font-size="8.5" font-weight="bold">${t.cumH}mm</text>`;
        svg += `<line x1="${marginL + baseW}" y1="${yPos + tierH / 2}" x2="${marginL + baseW + 4}" y2="${yPos + tierH / 2}" stroke="#64748b" stroke-width="0.8" />`;
      }

      svg += `</g>`;
    });

    // 4. Total Height Badge Line at Top
    const topY = curY;
    svg += `<line x1="${marginL - 10}" y1="${topY}" x2="${marginL + baseW + 10}" y2="${topY}" stroke="${limitExceeded ? '#ef4444' : '#0284c7'}" stroke-width="1.5" stroke-dasharray="2 2" />`;
    svg += `<rect x="${marginL + baseW / 2 - 45}" y="${Math.max(2, topY - 18)}" width="90" height="15" fill="${limitExceeded ? '#fee2e2' : '#e0f2fe'}" stroke="${limitExceeded ? '#ef4444' : '#0284c7'}" stroke-width="1" rx="4" />`;
    svg += `<text x="${marginL + baseW / 2}" y="${Math.max(12, topY - 7)}" fill="${limitExceeded ? '#991b1b' : '#0369a1'}" font-size="9" font-weight="bold" text-anchor="middle">Total: ${finalHeight}mm (${totalTiers}단)</text>`;

    svg += `</svg>`;

    return svg;
  }

  function openPalletDiagramModal(pallet, options) {
    if (!pallet) return;
    let modalEl = document.getElementById('palletDiagramModal');
    if (!modalEl) {
      const html = `
        <div id="palletDiagramModal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); z-index: 99999; justify-content: center; align-items: center;">
          <div style="width: 90%; max-width: 840px; background: #ffffff; border-radius: 12px; border: 1.5px solid #cbd5e1; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden;">
            <div style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 800; font-size: 15px; color: #0284c7; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-layer-group"></i>
                <span id="palletModalTitle">Pallet Stacking Diagram</span>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" onclick="window.print()" class="btn btn-sm btn-outline" style="height: 28px; padding: 0 10px; font-size: 11.5px; font-weight: 700;"><i class="fa-solid fa-print"></i> Print</button>
                <button type="button" onclick="document.getElementById('palletDiagramModal').style.display='none'" style="background: none; border: none; font-size: 20px; color: #ef4444; cursor: pointer; padding: 0 6px;">&times;</button>
              </div>
            </div>
            <div id="palletModalBody" style="padding: 20px; max-height: 80vh; overflow-y: auto;"></div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      modalEl = document.getElementById('palletDiagramModal');
    }

    const pType = pallet.palletType || (typeof PalletPacking !== 'undefined' && typeof PalletPacking.getActualPalletTypeForPallet === 'function' ? PalletPacking.getActualPalletTypeForPallet(pallet) : '1x2m');
    const palLength = (pType === "1x2m") ? 2000 : ((pType === "1x1.5m") ? 1500 : 1000);

    const titleEl = document.getElementById('palletModalTitle');
    if (titleEl) {
      titleEl.textContent = `Pallet #${pallet.id} (${pType}) - 층별 적재 정밀 도면`;
    }

    const bodyEl = document.getElementById('palletModalBody');
    if (bodyEl) {
      const Ht = options?.Ht || 80;
      const Fh = options?.Fh || 70;
      const Ph = options?.Ph || 150;
      const limit = options?.limit || 2000;

      const largeSvg = renderPalletLayerDiagramContainer(pallet, { Ht, Fh, Ph, limit });

      let tiers = [];
      if (typeof PalletPacking !== 'undefined' && typeof PalletPacking.expandPalletItemsToTiers === 'function') {
        tiers = PalletPacking.expandPalletItemsToTiers(pallet);
      } else {
        pallet.items.forEach(item => {
          for (let i = 0; i < (item.qty || 1); i++) {
            tiers.push({ partNo: item.partNo, subItems: [item] });
          }
        });
      }

      let detailRowsHtml = '<div style="display: flex; flex-direction: column-reverse; gap: 6px; max-height: 480px; overflow-y: auto; padding-right: 4px;">';
      tiers.forEach((t, idx) => {
        const tierNum = idx + 1;
        const subList = t.subItems || [{ partNo: t.partNo, qty: t.qty || 1 }];
        const itemsBadges = subList.map(s => {
          const colors = getPanelColors(s.partNo, tierNum);
          const ratio = getPanelLengthRatio(s.partNo, palLength);
          const ratioText = (ratio >= 0.99) ? '전체 (100%)' : ((ratio >= 0.49 && ratio <= 0.51) ? '1/2 (50%)' : ((ratio >= 0.24 && ratio <= 0.26) ? '1/4 (25%)' : `${(ratio*100).toFixed(0)}%`));
          return `<span style="background:${colors.fill}; color:${colors.text}; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">${s.partNo} <small style="opacity:0.85;">(${ratioText}) x${s.qty || 1}pc</small></span>`;
        }).join(' ');

        detailRowsHtml += `
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; gap: 8px;">
            <span style="font-weight: 800; color: #0284c7; min-width: 38px;">${tierNum}단</span>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;">${itemsBadges}</div>
          </div>
        `;
      });
      detailRowsHtml += '</div>';

      bodyEl.innerHTML = `
        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; align-items: start;">
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="font-weight: 800; font-size: 12px; color: #0369a1; margin-bottom: 8px; text-align: center;">2D Vector Elevation Stacking Blueprint</div>
            ${largeSvg}
          </div>
          <div>
            <div style="font-weight: 800; font-size: 12px; color: #334155; margin-bottom: 8px;">층별 상세 적재 내역 (Total ${tiers.length}단)</div>
            ${detailRowsHtml}
          </div>
        </div>
      `;
    }

    modalEl.style.display = 'flex';
  }

  function openPalletDiagramById(palletId) {
    if (typeof PalletPacking === 'undefined' || typeof PalletPacking.getPallets !== 'function') return;
    const pallets = PalletPacking.getPallets();
    const pallet = pallets.find(p => p.id === palletId);
    if (!pallet) return;

    const Ht = parseFloat(document.getElementById("packHt")?.value) || 80;
    const Fh = parseFloat(document.getElementById("packFh")?.value) || 70;
    const Ph = parseFloat(document.getElementById("packPh")?.value) || 150;
    const limit = parseFloat(document.getElementById("packLimit")?.value) || 2000;

    openPalletDiagramModal(pallet, { Ht, Fh, Ph, limit });
  }

  // Expose API
  global.VisualLayerStacking = {
    renderPalletLayerDiagramContainer,
    openPalletDiagramModal,
    openPalletDiagramById
  };

})(typeof window !== "undefined" ? window : globalThis);
