// =============================================================================
// WATANI GRP Water Tank -- "0.5/1M Side Panel only" alternate CATALOG data
// =============================================================================
// Extracted from the original workbook's Panel sheet ("Side Panel" diagram,
// rows 140-155), which lists TWO side-wall build methods per height side by
// side ("Method 1" / "Method 2"): the DEFAULT combo scheme (1.5m/2.0m
// panels -- what panel_catalog.js already encodes) and this alternate,
// which builds the wall from ONLY 1m-tall and 0.5m-tall panels stacked
// bottom to top. Which physical column is which was NOT consistent by
// label across heights in the source sheet (e.g. for H=3 and H=5, "Method
// 1" is this alternate, but for every other height "Method 2" is) -- each
// height below was individually cross-checked against panel_catalog.js's
// already-verified defaults to identify the correct column.
//
// SCOPE: side wall panels only, tanks WITHOUT partitions (N_PA===0). The
// source diagram's "Side Panel for Partition" section uses an irregular,
// unmerged cell layout that could not be reliably parsed -- partitioned
// tanks fall back to the default catalog until that data is captured
// properly. See panel_engine.js's computeSide1x1Items().
//
// Each height maps to an ordered list of slices, bottom to top. "wide" is
// the main run-of-wall panel for that slice; "narrow" is its companion
// covering the remaining (sub-1m) width, same role as panel_catalog.js's
// "hside". A slice with narrow=null means the source diagram did not
// document a companion part for it (found for H=3 and H=5 only) -- flagged
// with NEEDS_REVIEW below; verify against the workbook before relying on it.
// =============================================================================
(function (global) {
  "use strict";

  const NEEDS_REVIEW = []; // heights with at least one undocumented "narrow" part

  const SIDE_1X1_BY_HEIGHT = {
    "1": [
      // No Method 1/2 split exists for H=1mH in the source sheet -- it's
      // already a single 1m panel, identical to panel_catalog.js's default.
      { sizeM: 1, wide: "SF10SX", narrow: "NH10SX" },
    ],
    "1.5": [
      { sizeM: 1, wide: "SF20LX", narrow: "NH15LX" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX" },
    ],
    "2": [
      { sizeM: 1, wide: "SF20LX", narrow: "NH20LX" },
      { sizeM: 1, wide: "SF10HX", narrow: "NH10HX" },
    ],
    "2.5": [
      { sizeM: 1, wide: "SF30LX", narrow: "NH25LX" },
      { sizeM: 1, wide: "SF20MX", narrow: "NH15MX" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX" },
    ],
    "3": [
      // NEEDS_REVIEW: source diagram only showed the wide/main part for
      // H=3's alternate column -- no narrow-companion part was documented.
      { sizeM: 1, wide: "SF30LX", narrow: null },
      { sizeM: 1, wide: "SF20MX", narrow: null },
      { sizeM: 1, wide: "SF10HX", narrow: null },
    ],
    "3.5": [
      { sizeM: 1, wide: "SF40LX", narrow: "NH35MX" },
      { sizeM: 1, wide: "SF30MX", narrow: "NH25MX" },
      { sizeM: 1, wide: "SF15MX", narrow: "NH15MX" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX" },
    ],
    "4": [
      { sizeM: 1, wide: "SF40LX", narrow: "NH40MX" },
      { sizeM: 1, wide: "SF30MX", narrow: "NH30MX" },
      { sizeM: 1, wide: "SF20MX", narrow: "NH20MX" },
      { sizeM: 1, wide: "SF10HX", narrow: "NH10HX" },
    ],
    "4.5": [
      { sizeM: 1, wide: "SF50LX", narrow: "KH45LX" },
      { sizeM: 1, wide: "SF40MX", narrow: "NH35MX" },
      { sizeM: 1, wide: "SF30MX", narrow: "NH25MX" },
      { sizeM: 1, wide: "SF15MX", narrow: "NH15MX" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX" },
    ],
    "5": [
      // NEEDS_REVIEW: same gap as H=3 -- no narrow-companion part documented.
      { sizeM: 1, wide: "SF50LX", narrow: null },
      { sizeM: 1, wide: "SF40MX", narrow: null },
      { sizeM: 1, wide: "SF30MX", narrow: null },
      { sizeM: 1, wide: "SF20MX", narrow: null },
      { sizeM: 1, wide: "SF10HX", narrow: null },
    ],
  };

  Object.keys(SIDE_1X1_BY_HEIGHT).forEach(function (h) {
    if (SIDE_1X1_BY_HEIGHT[h].some(function (s) { return s.narrow === null; })) {
      NEEDS_REVIEW.push(h);
    }
  });

  const PanelCatalog1x1 = { SIDE_1X1_BY_HEIGHT, NEEDS_REVIEW };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PanelCatalog1x1;
  } else {
    global.PanelCatalog1x1 = PanelCatalog1x1;
  }
})(typeof window !== "undefined" ? window : globalThis);
