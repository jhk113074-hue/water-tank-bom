// =============================================================================
// CAD Blueprint & L-Shape Configurator Tab Controller
// =============================================================================
(function() {

  function renderAllCanvases() {
    if (typeof CADVectorEngine === 'undefined') return;

    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const wMm = getVal('cadTabWidthMm', 5000);
    const lMm = getVal('cadTabLengthMm', 5000);
    const hMm = getVal('cadTabHeightMm', 4000);

    const cols = Math.max(1, Math.round(lMm / 1000));
    const rows = Math.max(1, Math.round(wMm / 1000));
    const tiers = Math.max(1, Math.round(hMm / 1000));

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
    const cvPlane = document.getElementById('cadTabCanvasPlane');
    if (cvPlane) CADVectorEngine.renderPlaneView(cvPlane, grid, {});

    // 2. Concrete Pad Canvas
    const cvConc = document.getElementById('cadTabCanvasConc');
    if (cvConc) CADVectorEngine.renderPlaneView(cvConc, grid, {});

    // 3. Front Elevation Canvas
    const cvFront = document.getElementById('cadTabCanvasFront');
    if (cvFront) CADVectorEngine.renderFrontElevation(cvFront, cols, tiers, {});

    // 4. Side Elevation Canvas
    const cvSide = document.getElementById('cadTabCanvasSide');
    if (cvSide) CADVectorEngine.renderSideElevation(cvSide, rows, tiers, {});
  }

  function onMmInputChanged() {
    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const wMm = getVal('cadTabWidthMm', 5000);
    const lMm = getVal('cadTabLengthMm', 5000);

    const segW1 = document.getElementById('cadTabSegW1');
    if (segW1) segW1.value = wMm;
    const segL1 = document.getElementById('cadTabSegL1');
    if (segL1) segL1.value = lMm;

    renderAllCanvases();
  }

  function openPlaneModal() {
    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const cols = Math.round(getVal('cadTabLengthMm', 5000) / 1000);
    const rows = Math.round(getVal('cadTabWidthMm', 5000) / 1000);

    if (window.LShapePlaneModal) {
      window.LShapePlaneModal.open(cols, rows);
    }
  }

  window.onLShapeGridApplied = function(grid) {
    if (!grid || !grid.length) return;
    const cvPlane = document.getElementById('cadTabCanvasPlane');
    if (cvPlane && window.CADVectorEngine) {
      window.CADVectorEngine.renderPlaneView(cvPlane, grid, {});
    }
    const cvConc = document.getElementById('cadTabCanvasConc');
    if (cvConc && window.CADVectorEngine) {
      window.CADVectorEngine.renderPlaneView(cvConc, grid, {});
    }
  };

  function importToBOM() {
    const getVal = (id, def) => {
      const el = document.getElementById(id);
      return el ? (parseFloat(el.value) || def) : def;
    };

    const wM = getVal('cadTabWidthMm', 5000) / 1000;
    const lM = getVal('cadTabLengthMm', 5000) / 1000;
    const hM = getVal('cadTabHeightMm', 4000) / 1000;

    const tankWidthEl = document.getElementById('tankWidth');
    if (tankWidthEl) tankWidthEl.value = wM.toFixed(1);

    const tankLength1El = document.getElementById('tankLength1');
    if (tankLength1El) tankLength1El.value = lM.toFixed(1);

    const tankHeightEl = document.getElementById('tankHeight');
    if (tankHeightEl) tankHeightEl.value = hM.toFixed(1);

    if (typeof window.recalculateBOM === 'function') {
      window.recalculateBOM();
    }

    alert(`CAD Spec (${lM}m x ${wM}m x ${hM}mH) successfully imported into BOM Input!`);
  }

  window.CADBlueprintTab = {
    renderAllCanvases: renderAllCanvases,
    onMmInputChanged: onMmInputChanged,
    openPlaneModal: openPlaneModal,
    importToBOM: importToBOM
  };

})();
