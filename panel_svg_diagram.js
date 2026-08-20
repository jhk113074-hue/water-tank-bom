/**
 * panel_svg_diagram.js
 * 2D CAD-Style SVG Panel Elevation Diagram Renderer for Water Tank BOM Matrix
 * Renders precision GRP panel shapes (Pyramid X-emboss, Curved Pillow Ribs, Narrow Columns, Flange Bars, Dimensions)
 */

(function (global) {
  'use strict';

  var PanelSvgDiagram = {};

  // Color theme palettes for CAD blueprint & realistic drawing
  var PALETTE = {
    panelBg: '#f8fafc',
    panelBorder: '#334155',
    panelInnerBorder: '#64748b',
    ribLine: '#475569',
    partText: '#0f172a',
    partTextBg: 'rgba(255, 255, 255, 0.85)',
    dimLine: '#0284c7',
    dimText: '#0369a1',
    flangeBar: '#ea580c',
    flangeBarDark: '#c2410c',
    hoverGlow: '#38bdf8'
  };

  /**
   * Renders 1x1m Standard GRP Panel (Square Pyramid X-Emboss)
   */
  function draw1x1mPanel(x, y, w, h, partNo, roleKey, hGrade, isTop) {
    var pad = w * 0.14;
    var ix = x + pad;
    var iy = y + pad;
    var iw = w - pad * 2;
    var ih = h - pad * 2;

    var svg = '';
    svg += '<g class="svg-panel-cell" data-role-key="' + (roleKey || '') + '" data-h-grade="' + (hGrade || '') + '" style="cursor:pointer;" onclick="window.onSvgPanelClick && window.onSvgPanelClick(\'' + (roleKey || '') + '\', \'' + (hGrade || '') + '\')">';
    // Outer face
    svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#f1f5f9" stroke="' + PALETTE.panelBorder + '" stroke-width="1.5" rx="2" />';
    // Inner bevel box
    svg += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="#e2e8f0" stroke="' + PALETTE.panelInnerBorder + '" stroke-width="1" rx="2" />';
    // 4 Diagonal Bevel Rays
    svg += '<line x1="' + x + '" y1="' + y + '" x2="' + ix + '" y2="' + iy + '" stroke="' + PALETTE.ribLine + '" stroke-width="1" />';
    svg += '<line x1="' + (x + w) + '" y1="' + y + '" x2="' + (ix + iw) + '" y2="' + iy + '" stroke="' + PALETTE.ribLine + '" stroke-width="1" />';
    svg += '<line x1="' + x + '" y1="' + (y + h) + '" x2="' + ix + '" y2="' + (iy + ih) + '" stroke="' + PALETTE.ribLine + '" stroke-width="1" />';
    svg += '<line x1="' + (x + w) + '" y1="' + (y + h) + '" x2="' + (ix + iw) + '" y2="' + (iy + ih) + '" stroke="' + PALETTE.ribLine + '" stroke-width="1" />';
    // Center embossed pyramid cross
    svg += '<line x1="' + ix + '" y1="' + iy + '" x2="' + (ix + iw) + '" y2="' + (iy + ih) + '" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="2,2" />';
    svg += '<line x1="' + (ix + iw) + '" y1="' + iy + '" x2="' + ix + '" y2="' + (iy + ih) + '" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="2,2" />';

    // Part Label Overlay Badge
    if (partNo) {
      var tx = x + w / 2;
      var ty = y + h / 2;
      svg += '<rect x="' + (tx - 26) + '" y="' + (ty - 8) + '" width="52" height="16" fill="' + PALETTE.partTextBg + '" stroke="#cbd5e1" stroke-width="0.8" rx="3" />';
      svg += '<text x="' + tx + '" y="' + (ty + 3.5) + '" text-anchor="middle" font-family="Segoe UI, -apple-system, sans-serif" font-size="9" font-weight="800" fill="' + PALETTE.partText + '">' + partNo + '</text>';
    }
    svg += '</g>';
    return svg;
  }

  /**
   * Renders 1x1.5m / 1x2m GRP Panel (Curved Pillow Ribs)
   */
  function drawPillowPanel(x, y, w, h, partNo, roleKey, hGrade, is2m) {
    var pad = w * 0.12;
    var ix = x + pad;
    var iy = y + pad;
    var iw = w - pad * 2;
    var ih = h - pad * 2;

    var svg = '';
    svg += '<g class="svg-panel-cell" data-role-key="' + (roleKey || '') + '" data-h-grade="' + (hGrade || '') + '" style="cursor:pointer;" onclick="window.onSvgPanelClick && window.onSvgPanelClick(\'' + (roleKey || '') + '\', \'' + (hGrade || '') + '\')">';
    // Outer boundary
    svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#f8fafc" stroke="' + PALETTE.panelBorder + '" stroke-width="1.5" rx="3" />';
    // Inner bevel container
    svg += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="#edf2f7" stroke="' + PALETTE.panelInnerBorder + '" stroke-width="1" rx="4" />';

    // Upper Curved Pillow Arch (Concave / Hourglass curve)
    var topArcY = iy + (is2m ? 24 : 18);
    var botArcY = iy + ih - (is2m ? 24 : 18);
    svg += '<path d="M ' + (ix + 6) + ' ' + iy + ' Q ' + (x + w / 2) + ' ' + topArcY + ' ' + (ix + iw - 6) + ' ' + iy + '" fill="none" stroke="' + PALETTE.ribLine + '" stroke-width="1.2" />';
    svg += '<path d="M ' + (ix + 6) + ' ' + (iy + ih) + ' Q ' + (x + w / 2) + ' ' + botArcY + ' ' + (ix + iw - 6) + ' ' + (iy + ih) + '" fill="none" stroke="' + PALETTE.ribLine + '" stroke-width="1.2" />';

    // Horizontal reinforcement rib lines
    if (is2m) {
      var midY1 = iy + ih * 0.38;
      var midY2 = iy + ih * 0.62;
      svg += '<line x1="' + ix + '" y1="' + midY1 + '" x2="' + (ix + iw) + '" y2="' + midY1 + '" stroke="' + PALETTE.ribLine + '" stroke-width="1.2" />';
      svg += '<line x1="' + ix + '" y1="' + midY2 + '" x2="' + (ix + iw) + '" y2="' + midY2 + '" stroke="' + PALETTE.ribLine + '" stroke-width="1.2" />';
    } else {
      var midY = iy + ih * 0.5;
      svg += '<line x1="' + ix + '" y1="' + midY + '" x2="' + (ix + iw) + '" y2="' + midY + '" stroke="' + PALETTE.ribLine + '" stroke-width="1.2" />';
    }

    // Part Label Overlay Badge
    if (partNo) {
      var tx = x + w / 2;
      var ty = y + h / 2;
      svg += '<rect x="' + (tx - 28) + '" y="' + (ty - 9) + '" width="56" height="18" fill="' + PALETTE.partTextBg + '" stroke="#0284c7" stroke-width="1" rx="3" />';
      svg += '<text x="' + tx + '" y="' + (ty + 3.5) + '" text-anchor="middle" font-family="Segoe UI, -apple-system, sans-serif" font-size="9.5" font-weight="800" fill="' + PALETTE.partText + '">' + partNo + '</text>';
    }
    svg += '</g>';
    return svg;
  }

  /**
   * Renders 0.5m Narrow Panel (Half / Quarter column)
   */
  function drawNarrowPanel(x, y, w, h, partNo, roleKey, hGrade) {
    var pad = w * 0.15;
    var ix = x + pad;
    var iy = y + pad;
    var iw = w - pad * 2;
    var ih = h - pad * 2;

    var svg = '';
    svg += '<g class="svg-panel-cell" data-role-key="' + (roleKey || '') + '" data-h-grade="' + (hGrade || '') + '" style="cursor:pointer;" onclick="window.onSvgPanelClick && window.onSvgPanelClick(\'' + (roleKey || '') + '\', \'' + (hGrade || '') + '\')">';
    // Outer border
    svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#faf5ff" stroke="#7e22ce" stroke-width="1.2" rx="2" />';
    // Inner column groove
    svg += '<rect x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" fill="#f3e8ff" stroke="#a855f7" stroke-width="0.8" rx="1.5" />';
    // Center longitudinal rib
    svg += '<line x1="' + (x + w / 2) + '" y1="' + iy + '" x2="' + (x + w / 2) + '" y2="' + (iy + ih) + '" stroke="#c084fc" stroke-width="0.8" stroke-dasharray="2,2" />';

    // Part Label Overlay Badge
    if (partNo) {
      var tx = x + w / 2;
      var ty = y + h / 2;
      svg += '<rect x="' + (tx - 24) + '" y="' + (ty - 8) + '" width="48" height="16" fill="rgba(255,255,255,0.9)" stroke="#9333ea" stroke-width="0.8" rx="3" />';
      svg += '<text x="' + tx + '" y="' + (ty + 3.5) + '" text-anchor="middle" font-family="Segoe UI, -apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#6b21a8">' + partNo + '</text>';
    }
    svg += '</g>';
    return svg;
  }

  /**
   * Renders Dimension Line with Arrowheads and Text Label
   */
  function drawDimensionLine(x, y1, y2, labelText) {
    var svg = '';
    svg += '<g class="svg-dimension-line">';
    // Main vertical line
    svg += '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + PALETTE.dimLine + '" stroke-width="1.2" />';
    // Top and bottom tick marks
    svg += '<line x1="' + (x - 4) + '" y1="' + y1 + '" x2="' + (x + 4) + '" y2="' + y1 + '" stroke="' + PALETTE.dimLine + '" stroke-width="1.2" />';
    svg += '<line x1="' + (x - 4) + '" y1="' + y2 + '" x2="' + (x + 4) + '" y2="' + y2 + '" stroke="' + PALETTE.dimLine + '" stroke-width="1.2" />';
    // Arrowheads
    svg += '<polygon points="' + x + ',' + y1 + ' ' + (x - 2.5) + ',' + (y1 + 6) + ' ' + (x + 2.5) + ',' + (y1 + 6) + '" fill="' + PALETTE.dimLine + '" />';
    svg += '<polygon points="' + x + ',' + y2 + ' ' + (x - 2.5) + ',' + (y2 - 6) + ' ' + (x + 2.5) + ',' + (y2 - 6) + '" fill="' + PALETTE.dimLine + '" />';
    // Dimension text (rotated 90 deg or upright)
    var midY = (y1 + y2) / 2;
    svg += '<rect x="' + (x + 3) + '" y="' + (midY - 7) + '" width="28" height="14" fill="#ffffff" rx="2" />';
    svg += '<text x="' + (x + 17) + '" y="' + (midY + 3.5) + '" text-anchor="middle" font-family="Segoe UI, -apple-system, sans-serif" font-size="8.5" font-weight="800" fill="' + PALETTE.dimText + '">' + labelText + '</text>';
    svg += '</g>';
    return svg;
  }

  /**
   * Renders External Flange Bar (Orange Reinforcement Line)
   */
  function drawFlangeBar(x1, y1, x2, y2, label) {
    var svg = '';
    svg += '<g class="svg-flange-bar">';
    svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + PALETTE.flangeBar + '" stroke-width="4.5" stroke-linecap="round" />';
    svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#fed7aa" stroke-width="1.5" stroke-linecap="round" />';
    svg += '</g>';
    return svg;
  }

  /**
   * Generates Complete 2D Elevation Diagram for a single height grade (e.g. 1mH, 1.5mH, 2mH, ... 5mH)
   */
  PanelSvgDiagram.renderHeightElevationSvg = function (hGrade, matrixMap, opts) {
    opts = opts || {};
    var showDims = opts.showDimensions !== false;
    var showBars = opts.showFlangeBars !== false;
    var isMono15 = opts.half15Mode === 'monolithic';
    var isMono20 = opts.half20Mode === 'monolithic';

    var unitH = 50; // 1m height = 50px
    var unitW = 50; // 1m width = 50px
    var halfW = 25; // 0.5m width = 25px

    var hFloat = parseFloat(hGrade) || 1.0;
    var totalHeightPx = hFloat * unitH;

    var startX = 15;
    var startY = 15;
    var svgWidth = startX + unitW + halfW + unitW + 45; // 2.5m span + dim margin
    var svgHeight = startY + totalHeightPx + 25;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" width="100%" height="' + (svgHeight * 1.0) + 'px" style="display:block; margin:0 auto; overflow:visible;">';

    // Grid / Shadow frame background
    svg += '<rect x="' + startX + '" y="' + startY + '" width="' + (unitW + halfW + unitW) + '" height="' + totalHeightPx + '" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" rx="3" />';

    var curY = startY + totalHeightPx; // Draw from bottom to top

    // Helper to get partNo from matrix map
    function getPNo(roleKey) {
      if (!matrixMap) return '';
      var row = matrixMap[roleKey];
      if (!row || !row.heightGrades) return '';
      var v = row.heightGrades[hGrade] || '';
      return (v === '-- None --') ? '' : v;
    }

    // Height Course Stacking Breakdown
    if (hGrade === '1mH') {
      // 1단: 1m LOWER
      var py = startY;
      svg += draw1x1mPanel(startX, py, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, true);
      svg += drawNarrowPanel(startX + unitW, py, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, py, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, true);
      if (showDims) svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + unitH, '1000');
    }
    else if (hGrade === '1.5mH') {
      var py = startY;
      var topH = 1.5 * unitH;
      svg += drawPillowPanel(startX, py, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      if (isMono15) {
        svg += drawNarrowPanel(startX + unitW, py, halfW, topH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, py, halfW, unitH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
        svg += drawNarrowPanel(startX + unitW, py + unitH, halfW, unitH * 0.5, getPNo('side.TOP_15.qside'), 'side.TOP_15.qside', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, py, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      if (showDims) svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '1500');
      if (showBars) svg += drawFlangeBar(startX, startY + topH, startX + unitW * 2 + halfW, startY + topH);
    }
    else if (hGrade === '2mH') {
      var py = startY;
      var topH = 2.0 * unitH;
      svg += drawPillowPanel(startX, py, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      if (isMono20) {
        svg += drawNarrowPanel(startX + unitW, py, halfW, topH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, py, halfW, unitH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
        svg += drawNarrowPanel(startX + unitW, py + unitH, halfW, unitH, getPNo('side.TOP_20.hside_b'), 'side.TOP_20.hside_b', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, py, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      if (showDims) svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '2000');
      if (showBars) svg += drawFlangeBar(startX, startY + topH, startX + unitW * 2 + halfW, startY + topH);
    }
    else if (hGrade === '2.5mH') {
      // Top: 1.5m TOP_15, Bottom: 1m LOWER
      var topH = 1.5 * unitH;
      var botY = startY + topH;
      // TOP_15
      svg += drawPillowPanel(startX, startY, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      if (isMono15) {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, topH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, unitH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
        svg += drawNarrowPanel(startX + unitW, startY + unitH, halfW, unitH * 0.5, getPNo('side.TOP_15.qside'), 'side.TOP_15.qside', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, startY, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      // LOWER
      svg += draw1x1mPanel(startX, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, botY, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);

      if (showDims) {
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '1500');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, botY, botY + unitH, '1000');
      }
      if (showBars) svg += drawFlangeBar(startX, botY + unitH, startX + unitW * 2 + halfW, botY + unitH);
    }
    else if (hGrade === '3mH') {
      // Top: 2.0m TOP_20, Bottom: 1m LOWER
      var topH = 2.0 * unitH;
      var botY = startY + topH;
      // TOP_20
      svg += drawPillowPanel(startX, startY, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      if (isMono20) {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, topH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, unitH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
        svg += drawNarrowPanel(startX + unitW, startY + unitH, halfW, unitH, getPNo('side.TOP_20.hside_b'), 'side.TOP_20.hside_b', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, startY, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      // LOWER
      svg += draw1x1mPanel(startX, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, botY, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);

      if (showDims) {
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '2000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, botY, botY + unitH, '1000');
      }
      if (showBars) {
        svg += drawFlangeBar(startX, botY + unitH, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX, botY, startX, botY + unitH); // Vertical joint bar
        svg += drawFlangeBar(startX + unitW * 2 + halfW, botY, startX + unitW * 2 + halfW, botY + unitH);
      }
    }
    else if (hGrade === '3.5mH') {
      // Top: 1.5m TOP_15, Mid: 1m MID_LOWER, Bottom: 1m LOWER
      var topH = 1.5 * unitH;
      var midY = startY + topH;
      var botY = midY + unitH;
      // TOP_15
      svg += drawPillowPanel(startX, startY, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      if (isMono15) {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, topH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, unitH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
        svg += drawNarrowPanel(startX + unitW, startY + unitH, halfW, unitH * 0.5, getPNo('side.TOP_15.qside'), 'side.TOP_15.qside', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, startY, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      // MID_LOWER
      svg += draw1x1mPanel(startX, midY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, midY, halfW, unitH, getPNo('side.MID_LOWER.hside'), 'side.MID_LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, midY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      // LOWER
      svg += draw1x1mPanel(startX, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, botY, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);

      if (showDims) {
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '1500');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, midY, midY + unitH, '1000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, botY, botY + unitH, '1000');
      }
      if (showBars) {
        svg += drawFlangeBar(startX, botY + unitH, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX, midY + unitH, startX + unitW * 2 + halfW, midY + unitH);
        svg += drawFlangeBar(startX, botY, startX, botY + unitH);
        svg += drawFlangeBar(startX + unitW * 2 + halfW, botY, startX + unitW * 2 + halfW, botY + unitH);
      }
    }
    else if (hGrade === '4mH') {
      // Top: 2.0m TOP_20, Mid: 1m MID_LOWER, Bottom: 1m LOWER
      var topH = 2.0 * unitH;
      var midY = startY + topH;
      var botY = midY + unitH;
      // TOP_20
      svg += drawPillowPanel(startX, startY, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      if (isMono20) {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, topH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, unitH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
        svg += drawNarrowPanel(startX + unitW, startY + unitH, halfW, unitH, getPNo('side.TOP_20.hside_b'), 'side.TOP_20.hside_b', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, startY, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      // MID_LOWER
      svg += draw1x1mPanel(startX, midY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, midY, halfW, unitH, getPNo('side.MID_LOWER.hside'), 'side.MID_LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, midY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      // LOWER
      svg += draw1x1mPanel(startX, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, botY, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);

      if (showDims) {
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '2000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, midY, midY + unitH, '1000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, botY, botY + unitH, '1000');
      }
      if (showBars) {
        svg += drawFlangeBar(startX, botY + unitH, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX, midY + unitH, startX + unitW * 2 + halfW, midY + unitH);
        svg += drawFlangeBar(startX, botY, startX, botY + unitH);
        svg += drawFlangeBar(startX + unitW * 2 + halfW, botY, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX + unitW, botY, startX + unitW, botY + unitH);
      }
    }
    else if (hGrade === '4.5mH') {
      // Top: 1.5m TOP_15, Mid-Top: 1m MID_TOP, Mid-Lower: 1m MID_LOWER, Bottom: 1m LOWER
      var topH = 1.5 * unitH;
      var midTopY = startY + topH;
      var midLowY = midTopY + unitH;
      var botY = midLowY + unitH;
      // TOP_15
      svg += drawPillowPanel(startX, startY, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      if (isMono15) {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, topH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, unitH, getPNo('side.TOP_15.hside'), 'side.TOP_15.hside', hGrade);
        svg += drawNarrowPanel(startX + unitW, startY + unitH, halfW, unitH * 0.5, getPNo('side.TOP_15.qside'), 'side.TOP_15.qside', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, startY, unitW, topH, getPNo('side.TOP_15.side'), 'side.TOP_15.side', hGrade, false);
      // MID_TOP
      svg += draw1x1mPanel(startX, midTopY, unitW, unitH, getPNo('side.MID_TOP.side'), 'side.MID_TOP.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, midTopY, halfW, unitH, getPNo('side.MID_TOP.hside'), 'side.MID_TOP.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, midTopY, unitW, unitH, getPNo('side.MID_TOP.side'), 'side.MID_TOP.side', hGrade, false);
      // MID_LOWER
      svg += draw1x1mPanel(startX, midLowY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, midLowY, halfW, unitH, getPNo('side.MID_LOWER.hside'), 'side.MID_LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, midLowY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      // LOWER
      svg += draw1x1mPanel(startX, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, botY, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);

      if (showDims) {
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '1500');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, midTopY, midTopY + unitH, '1000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, midLowY, midLowY + unitH, '1000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, botY, botY + unitH, '1000');
      }
      if (showBars) {
        svg += drawFlangeBar(startX, botY + unitH, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX, midLowY + unitH, startX + unitW * 2 + halfW, midLowY + unitH);
        svg += drawFlangeBar(startX, midTopY + unitH, startX + unitW * 2 + halfW, midTopY + unitH);
        svg += drawFlangeBar(startX, botY, startX, botY + unitH);
        svg += drawFlangeBar(startX + unitW * 2 + halfW, botY, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX + unitW, botY, startX + unitW, botY + unitH);
      }
    }
    else if (hGrade === '5mH') {
      // Top: 2.0m TOP_20, Mid-Top: 1m MID_TOP, Mid-Lower: 1m MID_LOWER, Bottom: 1m LOWER
      var topH = 2.0 * unitH;
      var midTopY = startY + topH;
      var midLowY = midTopY + unitH;
      var botY = midLowY + unitH;
      // TOP_20
      svg += drawPillowPanel(startX, startY, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      if (isMono20) {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, topH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
      } else {
        svg += drawNarrowPanel(startX + unitW, startY, halfW, unitH, getPNo('side.TOP_20.hside_a'), 'side.TOP_20.hside_a', hGrade);
        svg += drawNarrowPanel(startX + unitW, startY + unitH, halfW, unitH, getPNo('side.TOP_20.hside_b'), 'side.TOP_20.hside_b', hGrade);
      }
      svg += drawPillowPanel(startX + unitW + halfW, startY, unitW, topH, getPNo('side.TOP_20.side'), 'side.TOP_20.side', hGrade, true);
      // MID_TOP
      svg += draw1x1mPanel(startX, midTopY, unitW, unitH, getPNo('side.MID_TOP.side'), 'side.MID_TOP.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, midTopY, halfW, unitH, getPNo('side.MID_TOP.hside'), 'side.MID_TOP.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, midTopY, unitW, unitH, getPNo('side.MID_TOP.side'), 'side.MID_TOP.side', hGrade, false);
      // MID_LOWER
      svg += draw1x1mPanel(startX, midLowY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, midLowY, halfW, unitH, getPNo('side.MID_LOWER.hside'), 'side.MID_LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, midLowY, unitW, unitH, getPNo('side.MID_LOWER.side'), 'side.MID_LOWER.side', hGrade, false);
      // LOWER
      svg += draw1x1mPanel(startX, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);
      svg += drawNarrowPanel(startX + unitW, botY, halfW, unitH, getPNo('side.LOWER.hside'), 'side.LOWER.hside', hGrade);
      svg += draw1x1mPanel(startX + unitW + halfW, botY, unitW, unitH, getPNo('side.LOWER.side'), 'side.LOWER.side', hGrade, false);

      if (showDims) {
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, startY, startY + topH, '2000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, midTopY, midTopY + unitH, '1000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, midLowY, midLowY + unitH, '1000');
        svg += drawDimensionLine(startX + unitW * 2 + halfW + 10, botY, botY + unitH, '1000');
      }
      if (showBars) {
        svg += drawFlangeBar(startX, botY + unitH, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX, midLowY + unitH, startX + unitW * 2 + halfW, midLowY + unitH);
        svg += drawFlangeBar(startX, midTopY + unitH, startX + unitW * 2 + halfW, midTopY + unitH);
        svg += drawFlangeBar(startX, botY, startX, botY + unitH);
        svg += drawFlangeBar(startX + unitW * 2 + halfW, botY, startX + unitW * 2 + halfW, botY + unitH);
        svg += drawFlangeBar(startX + unitW, botY, startX + unitW, botY + unitH);
      }
    }

    svg += '</svg>';
    return svg;
  };

  // Export module
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PanelSvgDiagram;
  }
  if (typeof window !== 'undefined') {
    window.PanelSvgDiagram = PanelSvgDiagram;
  }
})(typeof global !== 'undefined' ? global : this);
