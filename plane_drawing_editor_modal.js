// =============================================================================
// PLANE DRAWING EDIT WINDOW Modal (Interactive L-Shape & Custom Notch Plane Editor)
// =============================================================================
(function() {

  let modalEl = null;
  let canvasEl = null;
  let ctx = null;

  let currentGrid = []; // 2D array of boolean (rows x cols)
  let maxCols = 5;
  let maxRows = 5;

  function initModal() {
    if (document.getElementById('planeDrawingEditModal')) return;

    const html = `
      <div id="planeDrawingEditModal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); z-index: 99999; justify-content: center; align-items: center;">
        <div style="width: 90%; max-width: 780px; background: #ffffff; border-radius: 12px; border: 1.5px solid #cbd5e1; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); display: flex; flex-direction: column; overflow: hidden;">
          
          <!-- Modal Header (Matching Screenshot #2 Window Title) -->
          <div style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 800; font-size: 14px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-pen-ruler" style="color: #0284c7;"></i>
              <span>PLANE DRAWING EDIT WINDOW</span>
              <span id="planeGridInfoBadge" style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 10px; font-weight: 700;">5x5m (25 Panels)</span>
            </div>
            
            <!-- Toolbar Icons (Matching Screenshot #2 Top Toolbar) -->
            <div style="display: flex; gap: 6px; align-items: center;">
              <button type="button" onclick="window.PlaneDrawingEditorModal.presetRect()" class="btn btn-sm btn-outline" style="height: 28px; padding: 0 8px; font-size: 11px; font-weight: 700;" title="Full Rectangle Plane"><i class="fa-solid fa-vector-square"></i> Full Rect</button>
              <button type="button" onclick="window.PlaneDrawingEditorModal.presetLShape()" class="btn btn-sm btn-outline" style="height: 28px; padding: 0 8px; font-size: 11px; font-weight: 700;" title="L-Shape Plane Preset"><i class="fa-solid fa-chart-pie"></i> L-Shape</button>
              <button type="button" onclick="window.PlaneDrawingEditorModal.toggleInvert()" class="btn btn-sm btn-outline" style="height: 28px; padding: 0 8px; font-size: 11px; font-weight: 700;" title="Invert Selection"><i class="fa-solid fa-repeat"></i> Invert</button>
              <button type="button" onclick="window.PlaneDrawingEditorModal.close()" style="background: none; border: none; font-size: 18px; color: #ef4444; cursor: pointer; padding: 0 6px;" title="Close Window">&times;</button>
            </div>
          </div>

          <!-- Canvas Drawing Window -->
          <div style="padding: 16px; background: #f1f5f9; display: flex; justify-content: center; align-items: center; min-height: 420px; position: relative;">
            <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
              <canvas id="planeDrawingModalCanvas" width="600" height="400" style="cursor: pointer; display: block;"></canvas>
            </div>
            <div style="position: absolute; bottom: 8px; left: 24px; font-size: 11px; color: #64748b;">
              <i class="fa-solid fa-mouse-pointer"></i> Click panel grid cells to add/remove panels (Toggle L-Shape / Notch cutout)
            </div>
          </div>

          <!-- Modal Footer (Matching Screenshot #2 < 뒤로 | 다음 > | 취소) -->
          <div style="background: #f8fafc; border-top: 1.5px solid #cbd5e1; padding: 10px 18px; display: flex; justify-content: flex-end; gap: 8px; align-items: center;">
            <button type="button" onclick="window.PlaneDrawingEditorModal.close()" class="btn btn-outline" style="height: 32px; padding: 0 16px; font-size: 12px; font-weight: 700;">취소</button>
            <button type="button" onclick="window.PlaneDrawingEditorModal.apply()" class="btn btn-primary" style="height: 32px; padding: 0 20px; font-size: 12px; font-weight: 700; background: #0284c7; border: none;">다음(N) &gt;</button>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    modalEl = document.getElementById('planeDrawingEditModal');
    canvasEl = document.getElementById('planeDrawingModalCanvas');
    ctx = canvasEl.getContext('2d');

    canvasEl.addEventListener('click', onCanvasClick);
  }

  function open(cols, rows) {
    initModal();
    maxCols = Math.max(1, Math.min(20, cols || 5));
    maxRows = Math.max(1, Math.min(20, rows || 5));

    // Initialize grid with full panels
    currentGrid = [];
    for (let r = 0; r < maxRows; r++) {
      const row = [];
      for (let c = 0; c < maxCols; c++) {
        row.push(true);
      }
      currentGrid.push(row);
    }

    modalEl.style.display = 'flex';
    draw();
  }

  function close() {
    if (modalEl) modalEl.style.display = 'none';
  }

  function presetRect() {
    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < maxCols; c++) {
        currentGrid[r][c] = true;
      }
    }
    draw();
  }

  function presetLShape() {
    presetRect();
    // Cut out top-right corner to form L-Shape (Matching Screenshot #3)
    const cutCols = Math.floor(maxCols / 2);
    const cutRows = Math.floor(maxRows / 2);
    for (let r = 0; r < cutRows; r++) {
      for (let c = maxCols - cutCols; c < maxCols; c++) {
        currentGrid[r][c] = false;
      }
    }
    draw();
  }

  function toggleInvert() {
    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < maxCols; c++) {
        currentGrid[r][c] = !currentGrid[r][c];
      }
    }
    draw();
  }

  function onCanvasClick(e) {
    const rect = canvasEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const margin = 20;
    const availW = canvasEl.width - margin * 2;
    const availH = canvasEl.height - margin * 2;
    const cellSize = Math.min(availW / maxCols, availH / maxRows);

    const startX = (canvasEl.width - cellSize * maxCols) / 2;
    const startY = (canvasEl.height - cellSize * maxRows) / 2;

    const c = Math.floor((clickX - startX) / cellSize);
    const r = Math.floor((clickY - startY) / cellSize);

    if (r >= 0 && r < maxRows && c >= 0 && c < maxCols) {
      currentGrid[r][c] = !currentGrid[r][c];
      draw();
    }
  }

  function draw() {
    if (!canvasEl || !window.CAD2DDrawingEngine) return;
    window.CAD2DDrawingEngine.renderPlaneView(canvasEl, currentGrid, {});

    // Update Badge
    let activePanels = 0;
    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < maxCols; c++) {
        if (currentGrid[r][c]) activePanels++;
      }
    }

    const badge = document.getElementById('planeGridInfoBadge');
    if (badge) {
      badge.textContent = `${maxCols}x${maxRows}m (${activePanels} Panels)`;
    }
  }

  function apply() {
    close();
    if (typeof window.onPlaneGridEdited === 'function') {
      window.onPlaneGridEdited(currentGrid);
    }
  }

  window.PlaneDrawingEditorModal = {
    open: open,
    close: close,
    presetRect: presetRect,
    presetLShape: presetLShape,
    toggleInvert: toggleInvert,
    apply: apply
  };

})();
