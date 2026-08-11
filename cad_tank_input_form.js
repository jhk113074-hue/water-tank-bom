// =============================================================================
// CAD Tank Input Form UI Controller (Matching Screenshot #1)
// =============================================================================
(function() {

  function renderThumbnails() {
    if (typeof CAD2DDrawingEngine === 'undefined') return;

    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const W = getVal('cadWidthMm', 5000) / 1000;
    const L = getVal('cadLengthMm', 5000) / 1000;
    const H = getVal('cadHeightMm', 4000) / 1000;

    const cols = Math.max(1, Math.round(L));
    const rows = Math.max(1, Math.round(W));
    const tiers = Math.max(1, Math.round(H));

    // Construct grid matrix
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push(true);
      }
      grid.push(row);
    }

    // 1. Plane View Canvas
    const cvPlane = document.getElementById('cadThumbPlane');
    if (cvPlane) CAD2DDrawingEngine.renderPlaneView(cvPlane, grid, {});

    // 2. Concrete Pad View Canvas
    const cvConc = document.getElementById('cadThumbConc');
    if (cvConc) CAD2DDrawingEngine.renderPlaneView(cvConc, grid, {});

    // 3. Front Elevation Canvas
    const cvFront = document.getElementById('cadThumbFront');
    if (cvFront) CAD2DDrawingEngine.renderFrontElevation(cvFront, cols, tiers, {});

    // 4. Side Elevation Canvas
    const cvSide = document.getElementById('cadThumbSide');
    if (cvSide) CAD2DDrawingEngine.renderSideElevation(cvSide, rows, tiers, {});
  }

  function syncFromMmInputs() {
    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const wMm = getVal('cadWidthMm', 5000);
    const lMm = getVal('cadLengthMm', 5000);
    const hMm = getVal('cadHeightMm', 4000);

    // Sync to main BOM meter inputs
    const tankWidthEl = document.getElementById('tankWidth');
    if (tankWidthEl) tankWidthEl.value = (wMm / 1000).toFixed(1);

    const tankLength1El = document.getElementById('tankLength1');
    if (tankLength1El) tankLength1El.value = (lMm / 1000).toFixed(1);

    const tankHeightEl = document.getElementById('tankHeight');
    if (tankHeightEl) tankHeightEl.value = (hMm / 1000).toFixed(1);

    // Segment Breakdown Cell Sync (Matching Screenshot #1)
    const segW1 = document.getElementById('cadSegW1');
    if (segW1) segW1.value = wMm;
    const segL1 = document.getElementById('cadSegL1');
    if (segL1) segL1.value = lMm;

    renderThumbnails();

    if (typeof window.recalculateBOM === 'function') {
      window.recalculateBOM();
    }
  }

  function syncFromMeterInputs() {
    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const wM = getVal('tankWidth', 3.5);
    const l1M = getVal('tankLength1', 3.0);
    const hM = getVal('tankHeight', 1.5);

    const cadWidthMm = document.getElementById('cadWidthMm');
    if (cadWidthMm) cadWidthMm.value = Math.round(wM * 1000);

    const cadLengthMm = document.getElementById('cadLengthMm');
    if (cadLengthMm) cadLengthMm.value = Math.round(l1M * 1000);

    const cadHeightMm = document.getElementById('cadHeightMm');
    if (cadHeightMm) cadHeightMm.value = Math.round(hM * 1000);

    const segW1 = document.getElementById('cadSegW1');
    if (segW1) segW1.value = Math.round(wM * 1000);
    const segL1 = document.getElementById('cadSegL1');
    if (segL1) segL1.value = Math.round(l1M * 1000);

    renderThumbnails();
  }

  function openPlaneEditor() {
    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const cols = Math.round(getVal('cadLengthMm', 5000) / 1000);
    const rows = Math.round(getVal('cadWidthMm', 5000) / 1000);

    if (window.PlaneDrawingEditorModal) {
      window.PlaneDrawingEditorModal.open(cols, rows);
    }
  }

  // Handle Plane Grid Edited from Modal
  window.onPlaneGridEdited = function(grid) {
    if (!grid || !grid.length) return;
    const rows = grid.length;
    const cols = grid[0].length;

    // Update Plane View and Concrete Pad View Thumbnails
    const cvPlane = document.getElementById('cadThumbPlane');
    if (cvPlane && window.CAD2DDrawingEngine) {
      window.CAD2DDrawingEngine.renderPlaneView(cvPlane, grid, {});
    }
    const cvConc = document.getElementById('cadThumbConc');
    if (cvConc && window.CAD2DDrawingEngine) {
      window.CAD2DDrawingEngine.renderPlaneView(cvConc, grid, {});
    }
  };

  // Expose API
  window.CADTankInputForm = {
    renderThumbnails: renderThumbnails,
    syncFromMmInputs: syncFromMmInputs,
    syncFromMeterInputs: syncFromMeterInputs,
    openPlaneEditor: openPlaneEditor
  };

})();
