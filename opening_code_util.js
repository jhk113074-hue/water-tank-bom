// =============================================================================
// Opening Code Utility (opening_code_util.js)
// Separates a panel's base identity code (used for BOM/costing lookups) from
// its opening/cutout spec code (used only for opening-spec-diagram & packing
// display). Two customer-spec styles are supported:
//   - codeEmbedsOpening: true  -> opening code is the trailing 2 chars of the
//     existing panel code string (e.g. "SF10SX" -> base "SF10", opening "SX").
//     No stored data changes; the code string keeps being used exactly as
//     today for BOM/costing/packing-dimension lookups.
//   - codeEmbedsOpening: false -> the panel code carries no opening info
//     (e.g. HAYOUNG's "GW-1010-D"). Opening code is read from a sibling
//     `openingGrades[hGrade]` field on the matrix row instead.
// =============================================================================
(function (global) {
  "use strict";

  function splitEmbeddedOpeningCode(fullCode, partyId) {
    if (!fullCode || typeof fullCode !== 'string') {
      return { code: fullCode || '', openingCode: null };
    }
    const str = fullCode.trim();
    if (!str) return { code: '', openingCode: null };

    if (str.includes('+')) {
      const parts = str.split('+');
      return { code: parts[0].trim(), openingCode: parts[1] ? parts[1].trim() : null };
    }

    const pid = String(partyId || '').toLowerCase();

    // Hayoung: never split
    if (pid.includes('hayoung') || str.startsWith('GW-') || str.startsWith('GF-') || str.startsWith('GP-') || str.startsWith('KM-')) {
      return { code: str, openingCode: null };
    }

    // Almuftah: KB100, KL100, KF100, LM150, TM200, KH100, KQ100, LP100, LPH100
    if (pid.includes('almuftah') || str.startsWith('KB') || str.startsWith('KF') || str.startsWith('KL') || str.startsWith('LM') || str.startsWith('TM') || str.startsWith('LP')) {
      const m = str.match(/^([A-Za-z]{2,3}\d{2,3}(?:-\d{3})?)(425PPX-T|-425\s*PPX-T|PPX-T|PPX-B|TXBX|TX|BX|BP|BBP|BPS|BPL|SX|SL|SR|LX|LR|LL|MX|MR|ML|HX|HR|HL|HN|HNR|HNL)$/i);
      if (m) return { code: m[1].toUpperCase(), openingCode: m[2].toUpperCase() };
      return { code: str.toUpperCase(), openingCode: null };
    }

    // MNT:
    if (pid.includes('mnt')) {
      const mBaseWithM = str.match(/^([A-Za-z]{2,3}\d{2,3}M)(BPL|BPS|PL|PS|BP|BX|SX|SL|SR|LX|LR|LL|MX|MR|ML|HX|HR|HL|TX|TL|TR|P|T|L|M|H|S)$/i);
      if (mBaseWithM) {
        return { code: mBaseWithM[1].toUpperCase(), openingCode: mBaseWithM[2].toUpperCase() };
      }
      const mSide = str.match(/^([A-Za-z]{2}\d{2,4})(SL|SR|SX|TL|TR|TX|TN|LL|LR|LX|ML|MR|MX|HL|HR|HX|HU15|HU85|BPL|BPS|PL|PS|BP|BX|S|T|L|M|H|P)$/i);
      if (mSide) {
        return { code: mSide[1].toUpperCase(), openingCode: mSide[2].toUpperCase() };
      }
      return { code: str.toUpperCase(), openingCode: null };
    }

    // YSACC / Default
    const m = str.match(/^([A-Za-z]{2,4}\d{2,4})(425PPX-T|PPX-T|PPX-B|TXBX|TX|BX|BP|BBP|BPS|BPL|SX|SL|SR|LX|LR|LL|MX|MR|ML|HX|HR|HL|HN|HNR|HNL|HU15|HU85|HUB15|SU15)$/i);
    if (m) return { code: m[1].toUpperCase(), openingCode: m[2].toUpperCase() };

    return { code: str, openingCode: null };
  }

  // presetConfig: the active customer preset object (from getMatrixCustomerPresetList()).
  // row: a matrix row object (may have heightGrades / openingGrades maps).
  // hGrade: e.g. "1mH", "2mH".
  function getOpeningInfo(row, hGrade, presetConfig) {
    const fullCode = row && row.heightGrades ? (row.heightGrades[hGrade] || '') : '';
    const pid = presetConfig ? (presetConfig.id || presetConfig.key || '') : '';
    const split = splitEmbeddedOpeningCode(fullCode, pid);
    const rowOpening = (row && row.openingGrades && row.openingGrades[hGrade]) ? String(row.openingGrades[hGrade]).trim() : null;
    const openingCode = rowOpening || split.openingCode || null;
    const baseCode = split.code || fullCode;
    return { code: baseCode, openingCode: openingCode, fullCode: fullCode, source: rowOpening ? 'matrix_opening' : (split.openingCode ? 'embedded' : 'none') };
  }

  global.OpeningCodeUtil = {
    splitEmbeddedOpeningCode,
    getOpeningInfo
  };
})(typeof window !== 'undefined' ? window : this);
