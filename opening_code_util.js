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

  const EMBEDDED_CODE_RE = /^([A-Za-z]{2,4}\d{2,4})([A-Za-z0-9]{2,5})$/;

  function splitEmbeddedOpeningCode(fullCode) {
    if (!fullCode || typeof fullCode !== 'string') {
      return { code: fullCode || '', openingCode: null };
    }
    const m = fullCode.match(EMBEDDED_CODE_RE);
    if (!m) return { code: fullCode, openingCode: null };
    return { code: m[1], openingCode: m[2] };
  }

  // presetConfig: the active customer preset object (from getMatrixCustomerPresetList()).
  // row: a matrix row object (may have heightGrades / openingGrades maps).
  // hGrade: e.g. "1mH", "2mH".
  function getOpeningInfo(row, hGrade, presetConfig) {
    const fullCode = row && row.heightGrades ? (row.heightGrades[hGrade] || '') : '';
    const split = splitEmbeddedOpeningCode(fullCode);
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
