// =============================================================================
// Real-Time 3D Water Tank Mini Preview Engine (Canvas 3D Isometric Renderer)
// =============================================================================
(function() {
  let canvas = null;
  let ctx = null;

  let state = {
    W: 3.5,
    L1: 3.0,
    L2: 3.0,
    L3: 0,
    L4: 0,
    H: 1.5,
    reinfType: 'Internal R/F',
    skidType: '75 Angle',
    insulationType: 'Non-Insulated',
    wireframe: false,
    viewMode: '3D' // '3D', 'TOP', 'FRONT', 'SIDE'
  };

  let camera = {
    rotX: 0.5, // Pitch
    rotY: -0.75, // Yaw
    zoom: 1.0,
    isDragging: false,
    lastX: 0,
    lastY: 0
  };

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Attach mouse / touch event listeners for 3D Orbit Control
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch controls
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    // Initial Resize
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      const ro = new ResizeObserver(() => {
        resizeCanvas();
      });
      ro.observe(canvas.parentElement);
    }

    setTimeout(resizeCanvas, 50);
    setTimeout(resizeCanvas, 200);
    setTimeout(resizeCanvas, 600);

    render();
  }

  function resizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || (parent ? parent.clientWidth : 0) || canvas.clientWidth || 600;
    const h = rect.height || (parent ? parent.clientHeight : 0) || canvas.clientHeight || 220;
    const dpr = window.devicePixelRatio || 1;

    if (w > 0 && h > 0) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    render();
  }

  function update(params) {
    if (params) {
      Object.assign(state, params);
    }
    render();
  }

  function resetCamera() {
    camera.rotX = 0.5;
    camera.rotY = -0.75;
    camera.zoom = 1.0;
    state.viewMode = '3D';
    render();
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    if (mode === 'TOP') { camera.rotX = Math.PI / 2 - 0.01; camera.rotY = 0; }
    else if (mode === 'FRONT') { camera.rotX = 0; camera.rotY = 0; }
    else if (mode === 'SIDE') { camera.rotX = 0; camera.rotY = Math.PI / 2; }
    else { camera.rotX = 0.5; camera.rotY = -0.75; }
    render();
  }

  function onMouseDown(e) {
    camera.isDragging = true;
    camera.lastX = e.clientX;
    camera.lastY = e.clientY;
  }

  function onMouseMove(e) {
    if (!camera.isDragging) return;
    const dx = e.clientX - camera.lastX;
    const dy = e.clientY - camera.lastY;
    camera.lastX = e.clientX;
    camera.lastY = e.clientY;

    camera.rotY += dx * 0.008;
    camera.rotX += dy * 0.008;
    camera.rotX = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camera.rotX));
    render();
  }

  function onMouseUp() {
    camera.isDragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    camera.zoom = Math.max(0.4, Math.min(3.0, camera.zoom * delta));
    render();
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      camera.isDragging = true;
      camera.lastX = e.touches[0].clientX;
      camera.lastY = e.touches[0].clientY;
    }
  }

  function onTouchMove(e) {
    if (!camera.isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - camera.lastX;
    const dy = e.touches[0].clientY - camera.lastY;
    camera.lastX = e.touches[0].clientX;
    camera.lastY = e.touches[0].clientY;

    camera.rotY += dx * 0.008;
    camera.rotX += dy * 0.008;
    camera.rotX = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camera.rotX));
    render();
  }

  function onTouchEnd() {
    camera.isDragging = false;
  }

  // 3D Point Projection Helper
  function project(x, y, z, cx, cy, scale) {
    const cosY = Math.cos(camera.rotY);
    const sinY = Math.sin(camera.rotY);
    let x1 = x * cosY - z * sinY;
    let z1 = x * sinY + z * cosY;

    const cosX = Math.cos(camera.rotX);
    const sinX = Math.sin(camera.rotX);
    let y2 = y * cosX - z1 * sinX;
    let z2 = y * sinX + z1 * cosX;

    const s = scale * camera.zoom;
    return {
      x: cx + x1 * s,
      y: cy - y2 * s,
      z: z2
    };
  }

  function render() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle Grid / Background
    const bgGrad = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, Math.max(w, h));
    bgGrad.addColorStop(0, '#ffffff');
    bgGrad.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Compute dimensions
    const W = Number(state.W) || 3.5;
    const L1 = Number(state.L1) || 3.0;
    const L2 = Number(state.L2) || 0;
    const L3 = Number(state.L3) || 0;
    const L4 = Number(state.L4) || 0;
    const totalL = L1 + L2 + L3 + L4;
    const H = Number(state.H) || 1.5;

    // Update capacity badge text
    const capBadge = document.getElementById('mini3dCapBadge');
    if (capBadge) {
      const nomCapa = (totalL * W * H).toFixed(1);
      capBadge.textContent = `${nomCapa} m³ (${totalL}x${W}x${H}mH)`;
    }

    const cx = w / 2;
    const cy = h / 2 + 10 * dpr;

    // Auto-scale bounding box to fit canvas
    const maxDim = Math.max(totalL, W, H);
    const scale = (Math.min(w, h) * 0.35) / maxDim;

    // Center coordinates
    const halfL = totalL / 2;
    const halfW = W / 2;
    const halfH = H / 2;

    const x0 = -halfL, x1 = halfL;
    const y0 = -halfH, y1 = halfH;
    const z0 = -halfW, z1 = halfW;

    // 1. Draw Steel Skid Channels (Bottom Base)
    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = '#475569';
    const skidOffset = 0.15;
    const pSkid1 = project(x0 - skidOffset, y0 - 0.08, z0, cx, cy, scale);
    const pSkid2 = project(x1 + skidOffset, y0 - 0.08, z0, cx, cy, scale);
    const pSkid3 = project(x1 + skidOffset, y0 - 0.08, z1, cx, cy, scale);
    const pSkid4 = project(x0 - skidOffset, y0 - 0.08, z1, cx, cy, scale);

    ctx.beginPath();
    ctx.moveTo(pSkid1.x, pSkid1.y);
    ctx.lineTo(pSkid2.x, pSkid2.y);
    ctx.lineTo(pSkid3.x, pSkid3.y);
    ctx.lineTo(pSkid4.x, pSkid4.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.fill();
    ctx.stroke();

    // 2. Draw Panels (Side, Roof, Bottom Grid)
    const isInsulated = String(state.insulationType).includes('Insulated');
    const panelColor = isInsulated ? 'rgba(14, 165, 233, 0.28)' : 'rgba(56, 189, 248, 0.18)';
    const panelEdgeColor = isInsulated ? '#0284c7' : '#0369a1';

    const faces = [
      { name: 'bottom', pts: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], color: 'rgba(203, 213, 225, 0.5)' },
      { name: 'top', pts: [[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]], color: panelColor },
      { name: 'front', pts: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], color: panelColor },
      { name: 'back', pts: [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]], color: panelColor },
      { name: 'left', pts: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], color: panelColor },
      { name: 'right', pts: [[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]], color: panelColor }
    ];

    faces.forEach(face => {
      let sumZ = 0;
      face.pts.forEach(pt => {
        const p = project(pt[0], pt[1], pt[2], cx, cy, scale);
        sumZ += p.z;
      });
      face.avgZ = sumZ / face.pts.length;
    });

    faces.sort((a, b) => a.avgZ - b.avgZ);

    faces.forEach(face => {
      ctx.beginPath();
      face.pts.forEach((pt, i) => {
        const p = project(pt[0], pt[1], pt[2], cx, cy, scale);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();

      if (!state.wireframe) {
        ctx.fillStyle = face.color;
        ctx.fill();
      }

      ctx.lineWidth = (state.wireframe ? 1.8 : 1.2) * dpr;
      ctx.strokeStyle = panelEdgeColor;
      ctx.stroke();

      drawPanelGrid(face, x0, x1, y0, y1, z0, z1, totalL, W, H, cx, cy, scale, dpr);
    });

    // 3. Draw Partitions (if L2, L3, L4 present)
    const partitionLengths = [L1, L1 + L2, L1 + L2 + L3].filter((pos, idx) => {
      if (idx === 0 && L2 > 0) return true;
      if (idx === 1 && L3 > 0) return true;
      if (idx === 2 && L4 > 0) return true;
      return false;
    });

    partitionLengths.forEach(partXPos => {
      const partX = x0 + partXPos;
      const p1 = project(partX, y0, z0, cx, cy, scale);
      const p2 = project(partX, y0, z1, cx, cy, scale);
      const p3 = project(partX, y1, z1, cx, cy, scale);
      const p4 = project(partX, y1, z0, cx, cy, scale);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(234, 179, 8, 0.3)';
      ctx.fill();
      ctx.lineWidth = 1.6 * dpr;
      ctx.strokeStyle = '#d97706';
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 4. Draw Internal Tie-Rod Lines
    if (String(state.reinfType).includes('Internal')) {
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      for (let hTier = 1.0; hTier < H; hTier += 1.0) {
        const yTie = y0 + hTier;
        for (let xTie = x0 + 1.0; xTie < x1; xTie += 1.0) {
          const ptA = project(xTie, yTie, z0, cx, cy, scale);
          const ptB = project(xTie, yTie, z1, cx, cy, scale);
          ctx.beginPath();
          ctx.moveTo(ptA.x, ptA.y);
          ctx.lineTo(ptB.x, ptB.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // 5. Draw Dimension Labels
    drawDimensionLabels(totalL, W, H, L1, L2, L3, L4, x0, x1, y0, y1, z0, z1, cx, cy, scale, dpr);
  }

  function drawPanelGrid(face, x0, x1, y0, y1, z0, z1, totalL, W, H, cx, cy, scale, dpr) {
    ctx.lineWidth = 0.8 * dpr;
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.4)';

    if (face.name === 'front' || face.name === 'back') {
      const z = face.name === 'front' ? z1 : z0;
      for (let dx = 1; dx < totalL; dx += 1.0) {
        const pA = project(x0 + dx, y0, z, cx, cy, scale);
        const pB = project(x0 + dx, y1, z, cx, cy, scale);
        ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
      for (let dy = 0.5; dy < H; dy += 0.5) {
        const pA = project(x0, y0 + dy, z, cx, cy, scale);
        const pB = project(x1, y0 + dy, z, cx, cy, scale);
        ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
    } else if (face.name === 'left' || face.name === 'right') {
      const x = face.name === 'right' ? x1 : x0;
      for (let dz = 1; dz < W; dz += 1.0) {
        const pA = project(x, y0, z0 + dz, cx, cy, scale);
        const pB = project(x, y1, z0 + dz, cx, cy, scale);
        ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
      for (let dy = 0.5; dy < H; dy += 0.5) {
        const pA = project(x, y0 + dy, z0, cx, cy, scale);
        const pB = project(x, y0 + dy, z1, cx, cy, scale);
        ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
    } else if (face.name === 'top' || face.name === 'bottom') {
      const y = face.name === 'top' ? y1 : y0;
      for (let dx = 1; dx < totalL; dx += 1.0) {
        const pA = project(x0 + dx, y, z0, cx, cy, scale);
        const pB = project(x0 + dx, y, z1, cx, cy, scale);
        ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
      for (let dz = 1; dz < W; dz += 1.0) {
        const pA = project(x0, y, z0 + dz, cx, cy, scale);
        const pB = project(x1, y, z0 + dz, cx, cy, scale);
        ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
    }
  }

  function drawDimensionLabels(totalL, W, H, L1, L2, L3, L4, x0, x1, y0, y1, z0, z1, cx, cy, scale, dpr) {
    ctx.font = `bold ${10.5 * dpr}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Length Dimension Label
    const pL0 = project(x0, y0 - 0.3, z1 + 0.3, cx, cy, scale);
    const pL1 = project(x1, y0 - 0.3, z1 + 0.3, cx, cy, scale);
    const pLMid = { x: (pL0.x + pL1.x) / 2, y: (pL0.y + pL1.y) / 2 };

    const lenStr = L2 > 0 ? `${totalL}m (${L1}+${L2}${L3 ? '+'+L3 : ''}${L4 ? '+'+L4 : ''})L` : `${totalL}m(L)`;
    drawPillLabel(pLMid.x, pLMid.y, lenStr, '#0284c7', '#e0f2fe', dpr);

    // Width Dimension Label
    const pW0 = project(x1 + 0.3, y0 - 0.3, z0, cx, cy, scale);
    const pW1 = project(x1 + 0.3, y0 - 0.3, z1, cx, cy, scale);
    const pWMid = { x: (pW0.x + pW1.x) / 2, y: (pW0.y + pW1.y) / 2 };

    drawPillLabel(pWMid.x, pWMid.y, `${W}m(W)`, '#0369a1', '#e0f2fe', dpr);

    // Height Dimension Label
    const pH0 = project(x0 - 0.3, y0, z1 + 0.3, cx, cy, scale);
    const pH1 = project(x0 - 0.3, y1, z1 + 0.3, cx, cy, scale);
    const pHMid = { x: (pH0.x + pH1.x) / 2, y: (pH0.y + pH1.y) / 2 };

    drawPillLabel(pHMid.x, pHMid.y, `${H}m(H)`, '#059669', '#dcfce7', dpr);
  }

  function drawPillLabel(x, y, text, textColor, bgColor, dpr) {
    ctx.font = `bold ${10.5 * dpr}px Outfit, sans-serif`;
    const metrics = ctx.measureText(text);
    const pw = metrics.width + 12 * dpr;
    const ph = 18 * dpr;
    const rx = x - pw / 2;
    const ry = y - ph / 2;

    ctx.fillStyle = bgColor;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rx, ry, pw, ph, 9 * dpr);
    } else {
      ctx.rect(rx, ry, pw, ph);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y);
  }

  // Expose Global Public API
  window.Mini3DPreview = {
    init: init,
    update: update,
    resetCamera: resetCamera,
    setViewMode: setViewMode
  };

})();
