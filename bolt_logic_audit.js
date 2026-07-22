/**
 * Bolt Logic Setting & Calculation Audit Sheet Module
 * Water Tank BOM System - Bolt Calculation Sheet & Setting Replication
 */

(function () {
  const DEFAULT_BOLT_SETTINGS = {
    holesPerM_Roof1x1: 8,
    holesPerM_Roof05x1: 4,
    items: [
      { id: 'roof_bolts', location: 'Bolts for Roof', dia: 10, length: 35, washer: 2, nut: 1, boltName: 'WBT-1035' },
      { id: 'roof_top_bar', location: 'Bolts for Roof + Side top bar', dia: 10, length: 35, washer: 2, nut: 1, boltName: 'WBT-1035' },
      { id: 'partition_roof', location: 'Partition + Roof', dia: 10, length: 45, washer: 2, nut: 1, boltName: 'WBT-1045' },
      { id: 'nuts_roof', location: 'Nuts for Roof', dia: 10, length: 0, washer: 0, nut: 1, boltName: 'WNT-M10' },
      { id: 'washer_roof', location: 'FLAT WASHER for Roof', dia: 10, length: 0, washer: 1, nut: 0, boltName: 'WFW-M10' },
      { id: 'bottom_assembly', location: 'Bottom Assembly', dia: 10, length: 45, washer: 2, nut: 1, boltName: 'WBT-1045' },
      { id: 'side_bottom_assembly', location: 'Side + Bottom Assembly', dia: 10, length: 45, washer: 2, nut: 1, boltName: 'WBT-1045' },
      { id: 'nuts_bottom', location: 'Nuts for bottom', dia: 10, length: 0, washer: 0, nut: 1, boltName: 'WNT-M10' },
      { id: 'washer_bottom', location: 'FLAT WASHER for bottom', dia: 10, length: 0, washer: 1, nut: 0, boltName: 'WFW-M10' },
      { id: 'side_assembly', location: 'Side Assembly', dia: 10, length: 45, washer: 2, nut: 1, boltName: 'WBT-1045' },
      { id: 'corner_side_pnl', location: 'Corner Angle + Side PNL', dia: 10, length: 35, washer: 2, nut: 1, boltName: 'WBT-1035' },
      { id: 'nuts_side', location: 'Nuts for Side', dia: 10, length: 0, washer: 0, nut: 1, boltName: 'WNT-M10' },
      { id: 'washer_side', location: 'FLAT WASHER for Side', dia: 10, length: 0, washer: 1, nut: 0, boltName: 'WFW-M10' },
      { id: 'partition_assembly', location: 'Partition + Partition Assembly', dia: 10, length: 45, washer: 2, nut: 1, boltName: 'WBT-1045' },
      { id: 'partition_bracket', location: 'Partition Bracket', dia: 14, length: 130, washer: 1, nut: 3, boltName: 'WBT-14130P' },
      { id: 'wbr9090_bottom', location: 'WBR-9090 + Bottom Panel', dia: 14, length: 60, washer: 1, nut: 1, boltName: 'WBT-1460P' },
      { id: 'partition_roof_bracket', location: 'Partition + Roof Bracket', dia: 12, length: 50, washer: 2, nut: 1, boltName: 'WBT-1250' },
      { id: 'nuts_side_m14', location: 'Nuts for Side (M14)', dia: 14, length: 0, washer: 0, nut: 1, boltName: 'WNT-M14' },
      { id: 'washer_side_m14', location: 'FLAT WASHER for Side (M14)', dia: 14, length: 0, washer: 1, nut: 0, boltName: 'WFW-M14' },
      { id: 'partition_roof_conn', location: 'Partition + Roof connection Bracket', dia: 10, length: 45, washer: 2, nut: 1, boltName: 'WBT-1045' },
      { id: 'partition_side', location: 'Partition + Side', dia: 10, length: 58, washer: 1, nut: 1, boltName: 'WBT-1058P' },
      { id: 'partition_bottom', location: 'Partition + Bottom', dia: 10, length: 58, washer: 1, nut: 1, boltName: 'WBT-1058P' },
      { id: 'nuts_m10', location: 'Nuts for M10', dia: 10, length: 0, washer: 0, nut: 1, boltName: 'WNT-M10' },
      { id: 'washer_m10', location: 'FLAT WASHER for M10', dia: 10, length: 0, washer: 1, nut: 0, boltName: 'WFW-M10' },
      { id: 'nuts_m12', location: 'Nuts for M12', dia: 12, length: 0, washer: 0, nut: 1, boltName: 'WNT-M12' },
      { id: 'washer_m12', location: 'FLAT WASHER for M12', dia: 12, length: 0, washer: 1, nut: 0, boltName: 'WFW-M12' },
      { id: 'ext_lower_15', location: 'External Lower Fixture(1.5mH)', dia: 10, length: 60, washer: 2, nut: 2, boltName: 'WBT-1060' },
      { id: 'ext_lower_20', location: 'External Lower Fixture(2.0mH)', dia: 10, length: 100, washer: 2, nut: 2, boltName: 'WBT-10100' },
      { id: 'corner_corner', location: 'CORNER ANGLE + CORNER ANGLE', dia: 10, length: 35, washer: 2, nut: 1, boltName: 'WBT-1035' },
      { id: 'int_side_skid', location: 'INT SIDE + Steel Skid', dia: 12, length: 40, washer: 2, nut: 1, boltName: 'WBT-1240' },
      { id: 'side_beam_bracket', location: 'Side I Beam support bracket', dia: 12, length: 40, washer: 2, nut: 1, boltName: 'WBT-1240' },
      { id: 'washer_skid_m12', location: 'FLAT WASHER for Steel Skid (M12)', dia: 12, length: 0, washer: 1, nut: 0, boltName: 'WFW-M12' },
      { id: 'nuts_skid_m12', location: 'Nuts for Steel Skid (M12)', dia: 12, length: 0, washer: 0, nut: 1, boltName: 'WNT-M12' },
      { id: 'ext_skid_m14', location: 'EXT For Steel Skid', dia: 14, length: 40, washer: 1, nut: 1, boltName: 'WBT-1440' },
      { id: 'washer_skid_m14', location: 'FLAT WASHER for Steel Skid (M14)', dia: 14, length: 0, washer: 1, nut: 0, boltName: 'WFW-M14' },
      { id: 'nuts_skid_m14', location: 'Nuts for Steel Skid (M14)', dia: 14, length: 0, washer: 0, nut: 1, boltName: 'WNT-M14' },
      { id: 'side_beam_support', location: 'For Side I BEAM + Support', dia: 16, length: 40, washer: 2, nut: 1, boltName: 'WBT-1640' },
      { id: 'ext_stopper_bolt', location: 'Bolt for external stopper', dia: 16, length: 100, washer: 1, nut: 3, boltName: 'WBT-16100' },
      { id: 'washer_skid_m16', location: 'FLAT WASHER for Steel Skid (M16)', dia: 16, length: 0, washer: 1, nut: 0, boltName: 'WFW-M16' },
      { id: 'nuts_skid_m16', location: 'Nuts for Steel Skid (M16)', dia: 16, length: 0, washer: 0, nut: 1, boltName: 'WNT-M16' }
    ]
  };

  let boltSettings = JSON.parse(JSON.stringify(DEFAULT_BOLT_SETTINGS));

  function loadSavedBoltSettings() {
    const saved = localStorage.getItem('water_tank_bolt_logic_settings');
    if (saved) {
      try {
        boltSettings = JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to parse saved bolt logic settings:', e);
      }
    }
  }

  function saveBoltSettings() {
    localStorage.setItem('water_tank_bolt_logic_settings', JSON.stringify(boltSettings));
    renderBoltAuditView();
    alert('볼트 로직 수식 SETTING이 저장되었습니다.');
  }

  function resetBoltSettings() {
    if (confirm('볼트 로직 SETTING을 초기 기본값으로 복원하시겠습니까?')) {
      boltSettings = JSON.parse(JSON.stringify(DEFAULT_BOLT_SETTINGS));
      localStorage.removeItem('water_tank_bolt_logic_settings');
      renderBoltAuditView();
    }
  }

  // Material Spec suffix map helper
  function getMaterialPartNo(basePartNo, matOption) {
    if (!basePartNo) return '';
    const base = basePartNo.trim();
    if (base.startsWith('WNT-') || base.startsWith('WFW-')) {
      // Nuts and washers
      if (matOption === 'HDG_HDG') return base + 'HDG';
      if (matOption === 'STS304_STS304' || matOption === 'STS304_HDG') return base + 'SA2';
      if (matOption === 'STS316_STS316' || matOption === 'STS316_HDG' || matOption === 'STS316_STS304') return base + 'SA4';
      return base + 'SA2';
    } else {
      // Bolts
      if (matOption === 'HDG_HDG') return base + 'HDG';
      if (matOption === 'STS304_STS304') return base + 'SA2';
      if (matOption === 'STS316_STS316') return base + 'SA4';
      if (matOption === 'STS304_HDG') return base + 'SA2';
      if (matOption === 'STS316_HDG' || matOption === 'STS316_STS304') return base + 'SA4';
      return base + 'SA2';
    }
  }

  // Compute live quantity breakdown for a specific tank dimension
  function computeBoltAuditData(dim) {
    const L = Number(dim.length) || 2;
    const W = Number(dim.width) || 2;
    const H = Number(dim.height) || 2;
    const isPartition = Boolean(dim.partition);

    const h1 = boltSettings.holesPerM_Roof1x1 || 8;
    const h05 = boltSettings.holesPerM_Roof05x1 || 4;

    // Roof joints
    const roofInnerVertHoles = (L - 1) * W * h1;
    const roofInnerHorizHoles = (W - 1) * L * h1;
    const roofSideOuterHoles = (2 * L + 2 * W) * h1;
    const roofTotalBolts = roofInnerVertHoles + roofInnerHorizHoles + roofSideOuterHoles;

    // Bottom joints
    const bottomVertHoles = (L - 1) * W * h1;
    const bottomHorizHoles = (W - 1) * L * h1;
    const bottomSideHoles = (2 * L + 2 * W) * h1;
    const bottomTotalBolts = bottomVertHoles + bottomHorizHoles + bottomSideHoles;

    // Side joints
    const sideVertHoles = (2 * L + 2 * W) * Math.floor(H) * h1;
    const sideHorizHoles = (2 * L + 2 * W) * (Math.floor(H) - 1) * h1;
    const sideCornerHoles = 4 * Math.floor(H) * h1;
    const sideTotalBolts = sideVertHoles + sideHorizHoles + sideCornerHoles;

    // Partition joints (if any)
    const partSideHoles = isPartition ? Math.floor(H) * W * h1 : 0;
    const partBottomHoles = isPartition ? L * W * h1 : 0;
    const partTotalBolts = partSideHoles + partBottomHoles;

    // Skid & Accessories
    const skidSideBolts = (2 * L + 2 * W) * 2;
    const skidBeamBolts = Math.max(4, Math.floor(L * W * 1.5));

    return [
      // ROOF
      { group: 'ROOF', item: 'WBT-1035', loc: 'Roof PNL + Roof PNL (Vertical) - Inner panel (8 holes)', qty: roofInnerVertHoles, add: Math.ceil(roofInnerVertHoles * 0.05) },
      { group: 'ROOF', item: 'WBT-1035', loc: 'Roof PNL + Roof PNL (Horizontal) - Roof panel (8 holes)', qty: roofInnerHorizHoles, add: Math.ceil(roofInnerHorizHoles * 0.05) },
      { group: 'ROOF', item: 'WBT-1035', loc: 'Roof PNL + Side PNL (every 8 holes)', qty: roofSideOuterHoles, add: Math.ceil(roofSideOuterHoles * 0.05) },
      { group: 'ROOF', item: 'WNT-M10', loc: 'Calculation of Nuts for Roof', qty: roofTotalBolts, add: Math.ceil(roofTotalBolts * 0.05) },
      { group: 'ROOF', item: 'WFW-M10', loc: 'Calculation of Flat Washer for Roof', qty: roofTotalBolts * 2, add: Math.ceil(roofTotalBolts * 2 * 0.05) },

      // BOTTOM
      { group: 'BOTTOM', item: 'WBT-1045', loc: 'Bottom PNL + Bottom PNL (Vertical)', qty: bottomVertHoles, add: Math.ceil(bottomVertHoles * 0.05) },
      { group: 'BOTTOM', item: 'WBT-1045', loc: 'Bottom PNL + Bottom PNL (Horizontal)', qty: bottomHorizHoles, add: Math.ceil(bottomHorizHoles * 0.05) },
      { group: 'BOTTOM', item: 'WBT-1045', loc: 'Bottom PNL + Side PNLs', qty: bottomSideHoles, add: Math.ceil(bottomSideHoles * 0.05) },
      { group: 'BOTTOM', item: 'WNT-M10', loc: 'Calculation of Nuts for Bottom', qty: bottomTotalBolts, add: Math.ceil(bottomTotalBolts * 0.05) },
      { group: 'BOTTOM', item: 'WFW-M10', loc: 'Calculation of Flat Washer for Bottom', qty: bottomTotalBolts * 2, add: Math.ceil(bottomTotalBolts * 2 * 0.05) },

      // SIDE
      { group: 'SIDE', item: 'WBT-1045', loc: 'Side PNL (Vertical)', qty: sideVertHoles, add: Math.ceil(sideVertHoles * 0.05) },
      { group: 'SIDE', item: 'WBT-1045', loc: 'Side PNL (Horizontal)', qty: sideHorizHoles, add: Math.ceil(sideHorizHoles * 0.05) },
      { group: 'SIDE', item: 'WBT-1035', loc: 'Corner Angle + Side PNL', qty: sideCornerHoles, add: Math.ceil(sideCornerHoles * 0.05) },
      { group: 'SIDE', item: 'WNT-M10', loc: 'Calculation of Nuts for Side PNL', qty: sideTotalBolts, add: Math.ceil(sideTotalBolts * 0.05) },
      { group: 'SIDE', item: 'WFW-M10', loc: 'Calculation of Flat Washer for Side PNL', qty: sideTotalBolts * 2, add: Math.ceil(sideTotalBolts * 2 * 0.05) },

      // PARTITION
      { group: 'PARTITION', item: 'WBT-1045', loc: 'Partition PNL + Side PNL', qty: partSideHoles, add: Math.ceil(partSideHoles * 0.05) },
      { group: 'PARTITION', item: 'WBT-1045', loc: 'Partition PNL + Bottom PNL', qty: partBottomHoles, add: Math.ceil(partBottomHoles * 0.05) },
      { group: 'PARTITION', item: 'WNT-M10', loc: 'Calculation of Nuts for Partition', qty: partTotalBolts, add: Math.ceil(partTotalBolts * 0.05) },
      { group: 'PARTITION', item: 'WFW-M10', loc: 'Calculation of Flat Washer for Partition', qty: partTotalBolts * 2, add: Math.ceil(partTotalBolts * 2 * 0.05) },

      // STEEL SKID
      { group: 'STEEL SKID', item: 'WBT-1240', loc: 'Steel Skid and Side Panel Assembly', qty: skidSideBolts, add: Math.ceil(skidSideBolts * 0.05) },
      { group: 'STEEL SKID', item: 'WBT-1240', loc: 'Side I Beam Support Bracket', qty: skidBeamBolts, add: Math.ceil(skidBeamBolts * 0.05) },
      { group: 'STEEL SKID', item: 'WNT-M12', loc: 'Calculation of Nuts for M12 Skid Bolt', qty: skidSideBolts + skidBeamBolts, add: Math.ceil((skidSideBolts + skidBeamBolts) * 0.05) },
      { group: 'STEEL SKID', item: 'WFW-M12', loc: 'Calculation of Flat Washer for M12 Skid Bolt', qty: (skidSideBolts + skidBeamBolts) * 2, add: Math.ceil((skidSideBolts + skidBeamBolts) * 2 * 0.05) }
    ];
  }

  function renderBoltAuditView() {
    const container = document.getElementById('boltLogicAuditContainer');
    if (!container) return;

    loadSavedBoltSettings();

    // Get current tank dimensions from global window state
    const dim = (typeof getTankDimensions === 'function') ? getTankDimensions() : { length: 6, width: 3.5, height: 1.5, partition: false };
    const auditRows = computeBoltAuditData(dim);

    const materials = [
      { id: 'HDG_HDG', label: 'EXT-HDG / INT-HDG' },
      { id: 'STS304_STS304', label: 'EXT-STS304 / INT-STS304' },
      { id: 'STS316_STS316', label: 'EXT-STS316 / INT-STS316' },
      { id: 'STS304_HDG', label: 'EXT-STS304 / INT-HDG' },
      { id: 'STS316_HDG', label: 'EXT-STS316 / INT-HDG' },
      { id: 'STS316_STS304', label: 'EXT-STS316 / INT-STS304' }
    ];

    let html = `
      <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; width: 100%;">
        
        <!-- Left Side: Calculation & Audit Verification Table (70% Width) -->
        <div style="flex: 7; min-width: 650px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
            <div>
              <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-calculator" style="color: #0284c7;"></i> 실시간 볼트 산출 & 검산표 (Calculation Audit Sheet)
              </h3>
              <span style="font-size: 12px; font-weight: 600; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 4px;">
                Size: ${dim.length}m(L) × ${dim.width}m(W) × ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M³ [1 SET]
              </span>
            </div>
            <button type="button" onclick="exportBoltAuditToExcel()" class="btn btn-outline btn-sm" style="border-color: #10b981; color: #10b981; display: flex; align-items: center; gap: 6px; font-weight: 700;">
              <i class="fa-solid fa-file-excel"></i> 검산표 엑셀 다운로드
            </button>
          </div>

          <div style="overflow-x: auto;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px; border: 1px solid #cbd5e1; width: 100px;">PART NAME</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Bolt Assemble Location</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 60px;">INITIAL</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 50px;">Qty</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 65px;">Add (+)</th>
                  ${materials.map(m => `<th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 10px; background: #e2e8f0; width: 110px;">${m.label}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${auditRows.map((r, i) => {
                  const isHeaderRow = i === 0 || auditRows[i - 1].group !== r.group;
                  return `
                    ${isHeaderRow ? `
                      <tr style="background: #e0f2fe; font-weight: 700; color: #0369a1;">
                        <td colspan="11" style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 11.5px;">
                          ■ ${r.group} SECTION
                        </td>
                      </tr>
                    ` : ''}
                    <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; font-family: monospace; color: #1e293b;">${r.item}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #334155;">${r.loc}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${r.qty}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7;">${r.qty}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: 600;">+${r.add}</td>
                      ${materials.map(m => `
                        <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-size: 10px; color: #475569;">
                          ${getMaterialPartNo(r.item, m.id)}
                        </td>
                      `).join('')}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right Side: SETTING Control Panel (30% Width) -->
        <div style="flex: 3; min-width: 380px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-sliders" style="color: #0284c7;"></i> SETTING (수식 매개변수 설정)
            </h3>
            <div style="display: flex; gap: 6px;">
              <button type="button" onclick="resetBoltSettings()" class="btn btn-outline btn-sm" style="font-size: 11px; padding: 4px 8px;">초기화</button>
              <button type="button" onclick="saveBoltSettings()" class="btn btn-primary btn-sm" style="font-size: 11px; padding: 4px 10px; background: #0284c7; border: none; font-weight: 700;">💾 저장</button>
            </div>
          </div>

          <!-- Top Parameters -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display: block; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px;">Nos of Holes/M for Roof (1x1m)</label>
              <input type="number" id="setting_holes_roof1x1" value="${boltSettings.holesPerM_Roof1x1 || 8}" onchange="boltSettings.holesPerM_Roof1x1 = parseInt(this.value, 10) || 8" style="width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box;">
            </div>
            <div>
              <label style="display: block; font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px;">Nos of Holes/M for Roof (0.5x1m)</label>
              <input type="number" id="setting_holes_roof05x1" value="${boltSettings.holesPerM_Roof05x1 || 4}" onchange="boltSettings.holesPerM_Roof05x1 = parseInt(this.value, 10) || 4" style="width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; box-sizing: border-box;">
            </div>
          </div>

          <!-- Setting Matrix Table -->
          <div style="overflow-y: auto; max-height: 600px; border: 1px solid #cbd5e1; border-radius: 8px;">
            <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; position: sticky; top: 0; border-bottom: 2px solid #cbd5e1; z-index: 2;">
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1;">Location Description</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 45px; text-align: center;">DIA-M</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 50px; text-align: center;">LEN(MM)</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 45px; text-align: center;">Washer</th>
                  <th style="padding: 6px; border-right: 1px solid #cbd5e1; width: 40px; text-align: center;">Nut</th>
                  <th style="padding: 6px; width: 85px; text-align: center;">BOLT NAME</th>
                </tr>
              </thead>
              <tbody>
                ${boltSettings.items.map((item, idx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 4px 6px; font-weight: 600; color: #334155; border-right: 1px solid #e2e8f0;">${item.location}</td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.dia}" onchange="boltSettings.items[${idx}].dia = parseInt(this.value, 10) || 10" style="width: 38px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.length}" onchange="boltSettings.items[${idx}].length = parseInt(this.value, 10) || 0" style="width: 42px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.washer}" onchange="boltSettings.items[${idx}].washer = parseInt(this.value, 10) || 0" style="width: 36px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center; border-right: 1px solid #e2e8f0;">
                      <input type="number" value="${item.nut}" onchange="boltSettings.items[${idx}].nut = parseInt(this.value, 10) || 0" style="width: 34px; padding: 2px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                    <td style="padding: 4px; text-align: center;">
                      <input type="text" value="${item.boltName}" onchange="boltSettings.items[${idx}].boltName = this.value.trim()" style="width: 80px; padding: 2px 4px; font-size: 10px; font-family: monospace; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1; border-radius: 4px;">
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // Export audit table to Excel CSV
  window.exportBoltAuditToExcel = function () {
    const dim = (typeof getTankDimensions === 'function') ? getTankDimensions() : { length: 6, width: 3.5, height: 1.5 };
    const data = computeBoltAuditData(dim);

    let csvContent = `Size: ${dim.length}m(L) x ${dim.width}m(W) x ${dim.height}m(H) = ${(dim.length * dim.width * dim.height).toFixed(1)} M3\n`;
    csvContent += `SECTION,PART NAME,Assemble Location,INITIAL Qty,Applied Qty,Add (+),EXT-HDG INT-HDG,EXT-STS304 INT-STS304,EXT-STS316 INT-STS316,EXT-STS304 INT-HDG,EXT-STS316 INT-HDG,EXT-STS316 INT-STS304\n`;

    data.forEach(r => {
      csvContent += `"${r.group}","${r.item}","${r.loc}",${r.qty},${r.qty},${r.add},"${getMaterialPartNo(r.item, 'HDG_HDG')}","${getMaterialPartNo(r.item, 'STS304_STS304')}","${getMaterialPartNo(r.item, 'STS316_STS316')}","${getMaterialPartNo(r.item, 'STS304_HDG')}","${getMaterialPartNo(r.item, 'STS316_HDG')}","${getMaterialPartNo(r.item, 'STS316_STS304')}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bolt_Calculation_Audit_${dim.length}x${dim.width}x${dim.height}m.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Expose global methods
  window.renderBoltAuditView = renderBoltAuditView;
  window.saveBoltSettings = saveBoltSettings;
  window.resetBoltSettings = resetBoltSettings;

  // Auto-render when DOM loads or when switching tabs
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderBoltAuditView, 300);
  });
})();
