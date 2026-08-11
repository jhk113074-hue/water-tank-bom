// =============================================================================
// CAD 2D Technical Drawing Vector Engine (Plane, Front, Side, Concrete Pad)
// =============================================================================
(function() {
  
  // Render Top Plane View (Screenshot #2 & #3)
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

    const margin = 25 * dpr;
    const availW = w - margin * 2;
    const availH = h - margin * 2;
    const cellW = availW / cols;
    const cellH = availH / rows;
    const cellSize = Math.min(cellW, cellH);

    const startX = (w - cellSize * cols) / 2;
    const startY = (h - cellSize * rows) / 2;

    // Draw Outer Wall Frame Border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2 * dpr;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (gridMatrix[r][c]) {
          const x = startX + c * cellSize;
          const y = startY + r * cellSize;

          // Panel Fill
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(x, y, cellSize, cellSize);

          // Panel Outer Box
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.2 * dpr;
          ctx.strokeRect(x, y, cellSize, cellSize);

          // Panel Inner Bevel Box
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

    // Outer Beveled Edge Border for the Tank Perimeter
    drawPerimeterBorder(ctx, gridMatrix, startX, startY, cellSize, dpr);
  }

  // Render Front Elevation View (Screenshot #4)
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

    const margin = 30 * dpr;
    const availW = w - margin * 2;
    const availH = h - margin * 2 - 20 * dpr;
    const cellW = availW / cols;
    const cellH = availH / tiers;
    const cellSize = Math.min(cellW, cellH);

    const startX = (w - cellSize * cols) / 2;
    const startY = (h - cellSize * tiers) / 2 - 10 * dpr;

    // 1. Draw Skid Steel Channels at Bottom
    const skidH = 12 * dpr;
    const skidY = startY + tiers * cellSize;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(startX - 5 * dpr, skidY, cols * cellSize + 10 * dpr, skidH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(startX - 5 * dpr, skidY, cols * cellSize + 10 * dpr, skidH);

    // 2. Draw Stacking Panel Tiers (Bottom to Top)
    for (let t = 0; t < tiers; t++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * cellSize;
        const y = startY + (tiers - 1 - t) * cellSize; // Bottom-up

        // Panel Outer Boundary
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2 * dpr;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Panel Convex Diamond Ribs
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

        // Inner Diamond Cross
        ctx.beginPath();
        ctx.moveTo(x + pad, y + pad);
        ctx.lineTo(x + cellSize - pad, y + cellSize - pad);
        ctx.moveTo(x + cellSize - pad, y + pad);
        ctx.lineTo(x + pad, y + cellSize - pad);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 0.7 * dpr;
        ctx.stroke();

        // Panel Center Circle
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.08, 0, Math.PI * 2);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 0.8 * dpr;
        ctx.stroke();
      }
    }

    // 3. Draw Corner Fastener Plates (4-bolt Plates at Panel Intersections)
    const plateSize = 10 * dpr;
    for (let t = 1; t < tiers; t++) {
      for (let c = 0; c <= cols; c++) {
        const px = startX + c * cellSize - plateSize / 2;
        const py = startY + (tiers - t) * cellSize - plateSize / 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px, py, plateSize, plateSize);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(px, py, plateSize, plateSize);

        // 4 bolt dots
        ctx.fillStyle = '#0f172a';
        const dotR = 1 * dpr;
        const off = plateSize * 0.25;
        ctx.beginPath();
        ctx.arc(px + off, py + off, dotR, 0, Math.PI * 2);
        ctx.arc(px + plateSize - off, py + off, dotR, 0, Math.PI * 2);
        ctx.arc(px + off, py + plateSize - off, dotR, 0, Math.PI * 2);
        ctx.arc(px + plateSize - off, py + plateSize - off, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Draw Roof Curvature Wave Lines
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let c = 0; c < cols; c++) {
      const cx1 = startX + c * cellSize + cellSize * 0.25;
      const cy1 = startY - 4 * dpr;
      const cx2 = startX + c * cellSize + cellSize * 0.75;
      const cy2 = startY - 4 * dpr;
      const endX = startX + (c + 1) * cellSize;
      const endY = startY;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, endX, endY);
    }
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }

  // Draw Outer Perimeter Border Line
  function drawPerimeterBorder(ctx, grid, startX, startY, cellSize, dpr) {
    const rows = grid.length;
    const cols = grid[0].length;
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5 * dpr;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) {
          const x = startX + c * cellSize;
          const y = startY + r * cellSize;

          // Top edge
          if (r === 0 || !grid[r - 1][c]) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); ctx.stroke();
          }
          // Bottom edge
          if (r === rows - 1 || !grid[r + 1][c]) {
            ctx.beginPath(); ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); ctx.stroke();
          }
          // Left edge
          if (c === 0 || !grid[r][c - 1]) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); ctx.stroke();
          }
          // Right edge
          if (c === cols - 1 || !grid[r][c + 1]) {
            ctx.beginPath(); ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); ctx.stroke();
          }
        }
      }
    }
  }

  // Expose Global API
  window.CAD2DDrawingEngine = {
    renderPlaneView: renderPlaneView,
    renderFrontElevation: renderFrontElevation,
    renderSideElevation: renderFrontElevation // Side elevation shares front elevation panel drawing logic
  };

})();
