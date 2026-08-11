// =============================================================================
// CAD 2D Technical Vector Drawing Engine (Plane, Front, Side, Concrete Pad)
// =============================================================================
(function() {
  
  // Render Top Plane View (Matching Screenshot #2 & #3)
  function renderPlaneView(canvas, gridMatrix, options) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const rows = gridMatrix.length;
    const cols = gridMatrix[0] ? gridMatrix[0].length : 0;
    if (rows === 0 || cols === 0) return;

    const margin = 20 * dpr;
    const availW = w - margin * 2;
    const availH = h - margin * 2;
    const cellW = availW / cols;
    const cellH = availH / rows;
    const cellSize = Math.min(cellW, cellH);

    const startX = (w - cellSize * cols) / 2;
    const startY = (h - cellSize * rows) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (gridMatrix[r][c]) {
          const x = startX + c * cellSize;
          const y = startY + r * cellSize;

          // Panel Background Fill
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(x, y, cellSize, cellSize);

          // Panel Outer Box
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.2 * dpr;
          ctx.strokeRect(x, y, cellSize, cellSize);

          // Inner Bevel Box
          const pad = cellSize * 0.08;
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.8 * dpr;
          ctx.strokeRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);

          // Diagonal Rib Lines (Matching Screenshot #2 & #3)
          ctx.beginPath();
          ctx.moveTo(x + pad, y + pad);
          ctx.lineTo(x + cellSize - pad, y + cellSize - pad);
          ctx.moveTo(x + cellSize - pad, y + pad);
          ctx.lineTo(x + pad, y + cellSize - pad);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.8 * dpr;
          ctx.stroke();

          // Center Boss Circle
          const radius = cellSize * 0.1;
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize / 2, radius, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1 * dpr;
          ctx.stroke();
        }
      }
    }

    // Outer Perimeter Border
    drawPerimeterBorder(ctx, gridMatrix, startX, startY, cellSize, dpr);
  }

  // Render Front Elevation View (Matching Screenshot #4 & #5)
  function renderFrontElevation(canvas, cols, tiers, options) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (cols <= 0 || tiers <= 0) return;

    const margin = 24 * dpr;
    const availW = w - margin * 2;
    const availH = h - margin * 2 - 15 * dpr;
    const cellW = availW / cols;
    const cellH = availH / tiers;
    const cellSize = Math.min(cellW, cellH);

    const startX = (w - cellSize * cols) / 2;
    const startY = (h - cellSize * tiers) / 2 - 8 * dpr;

    // 1. Bottom Skid Steel Channels
    const skidH = 10 * dpr;
    const skidY = startY + tiers * cellSize;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(startX - 4 * dpr, skidY, cols * cellSize + 8 * dpr, skidH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.4 * dpr;
    ctx.strokeRect(startX - 4 * dpr, skidY, cols * cellSize + 8 * dpr, skidH);

    // 2. Stacking Panel Tiers
    for (let t = 0; t < tiers; t++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * cellSize;
        const y = startY + (tiers - 1 - t) * cellSize;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2 * dpr;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Convex Diamond Ribs
        const pad = cellSize * 0.12;
        ctx.beginPath();
        ctx.moveTo(x + cellSize / 2, y + pad);
        ctx.lineTo(x + cellSize - pad, y + cellSize / 2);
        ctx.lineTo(x + cellSize / 2, y + cellSize - pad);
        ctx.lineTo(x + pad, y + cellSize / 2);
        ctx.closePath();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 0.9 * dpr;
        ctx.stroke();

        // Cross Ribs
        ctx.beginPath();
        ctx.moveTo(x + pad, y + pad);
        ctx.lineTo(x + cellSize - pad, y + cellSize - pad);
        ctx.moveTo(x + cellSize - pad, y + pad);
        ctx.lineTo(x + pad, y + cellSize - pad);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 0.7 * dpr;
        ctx.stroke();

        // Center Boss Circle
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.08, 0, Math.PI * 2);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 0.8 * dpr;
        ctx.stroke();
      }
    }

    // 3. Corner Fastener Plates (4-bolt Plates at Panel Intersections)
    const plateSize = 9 * dpr;
    for (let t = 1; t < tiers; t++) {
      for (let c = 0; c <= cols; c++) {
        const px = startX + c * cellSize - plateSize / 2;
        const py = startY + (tiers - t) * cellSize - plateSize / 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px, py, plateSize, plateSize);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(px, py, plateSize, plateSize);

        // Bolt dots
        ctx.fillStyle = '#0f172a';
        const dotR = 0.9 * dpr;
        const off = plateSize * 0.25;
        ctx.beginPath();
        ctx.arc(px + off, py + off, dotR, 0, Math.PI * 2);
        ctx.arc(px + plateSize - off, py + off, dotR, 0, Math.PI * 2);
        ctx.arc(px + off, py + plateSize - off, dotR, 0, Math.PI * 2);
        ctx.arc(px + plateSize - off, py + plateSize - off, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Top Roof Curvature
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let c = 0; c < cols; c++) {
      const cx1 = startX + c * cellSize + cellSize * 0.25;
      const cy1 = startY - 3 * dpr;
      const cx2 = startX + c * cellSize + cellSize * 0.75;
      const cy2 = startY - 3 * dpr;
      const endX = startX + (c + 1) * cellSize;
      const endY = startY;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, endX, endY);
    }
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.4 * dpr;
    ctx.stroke();
  }

  function drawPerimeterBorder(ctx, grid, startX, startY, cellSize, dpr) {
    const rows = grid.length;
    const cols = grid[0].length;
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.2 * dpr;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) {
          const x = startX + c * cellSize;
          const y = startY + r * cellSize;

          if (r === 0 || !grid[r - 1][c]) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); ctx.stroke();
          }
          if (r === rows - 1 || !grid[r + 1][c]) {
            ctx.beginPath(); ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); ctx.stroke();
          }
          if (c === 0 || !grid[r][c - 1]) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); ctx.stroke();
          }
          if (c === cols - 1 || !grid[r][c + 1]) {
            ctx.beginPath(); ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); ctx.stroke();
          }
        }
      }
    }
  }

  // Expose API
  window.CADVectorEngine = {
    renderPlaneView: renderPlaneView,
    renderFrontElevation: renderFrontElevation,
    renderSideElevation: renderFrontElevation
  };

})();
