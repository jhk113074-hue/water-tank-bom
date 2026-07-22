// =============================================================================
// WATANI GRP Water Tank -- "0.5/1M Side Panel only" alternate CATALOG data
// =============================================================================
// Extracted from the original workbook's Panel sheet ("Side Panel" and
// "Side Panel for Partition" diagrams, rows 140-174), which list TWO
// side-wall build methods per height side by side ("Method 1" / "Method
// 2"): the DEFAULT combo scheme (1.5m/2.0m panels -- what panel_catalog.js
// already encodes) and this alternate, which builds the wall from ONLY
// 1m-tall and 0.5m-tall panels stacked bottom to top. Which physical
// column is which was NOT consistent by label across heights in the
// source sheet (e.g. for H=3 and H=5, "Method 1" is this alternate, but
// for every other height "Method 2" is) -- each height below was
// individually cross-checked against panel_catalog.js's already-verified
// defaults to identify the correct column.
//
// Each height maps to an ordered list of slices, bottom to top:
//   wide / narrow           -- the slice's normal run-of-wall panels
//                               (same roles as panel_catalog.js's
//                               "side"/"hside"), used when the tank has
//                               no partitions, or for slices away from a
//                               partition boundary.
//   parRT / parLT           -- the "wide" panel's replacement when this
//                               slice sits at a partition boundary (same
//                               idea as panel_catalog.js's
//                               side_parRT/side_parLT).
//   narrowParRT / narrowParLT -- same, for the "narrow" companion panel.
//
// RT vs LT was assigned by each part's own name suffix (...R = RT, ...L =
// LT), not by its row position in the sheet -- the row position turned
// out to be inconsistent (verified: panel_catalog.js's own H=3
// side.LOWER.side_parRT="SF30LR"/side_parLT="SF30LL" only matches the
// suffix rule, not a fixed row convention).
//
// A null field means the source diagram did not document a part there --
// left blank rather than guessed. Two distinct gaps show up:
//   - H=3 and H=5: no narrow/narrowParRT/narrowParLT at all (their
//     alternate column never showed a companion part, partition or not).
//   - Every half-metre height (1.5/2.5/3.5/4.5)'s topmost 0.5m finishing
//     slice: no parRT/parLT/narrowParRT/narrowParLT (the sheet only
//     placed "A"/"B" legend labels there, not real part numbers).
// NEEDS_REVIEW below lists every height with at least one such gap.
// =============================================================================
(function (global) {
  "use strict";

  const NEEDS_REVIEW = [];

  const SIDE_1X1_BY_HEIGHT = {
    "1": [
      // No Method 1/2 split exists for H=1mH in the source sheet -- it's
      // already a single 1m panel, identical to panel_catalog.js's default.
      // No partition-adjacent (Side Panel for Partition) data exists for
      // H=1mH either, for the same reason.
      { sizeM: 1, wide: "SF10SX", narrow: "NH10SX", parRT: null, parLT: null, narrowParRT: null, narrowParLT: null },
    ],
    "1.5": [
      { sizeM: 1, wide: "SF20LX", narrow: "NH15LX", parRT: "SF15LR", parLT: "SF15LL", narrowParRT: "NH20LR", narrowParLT: "NH20LL" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX", parRT: null, parLT: null, narrowParRT: null, narrowParLT: null },
    ],
    "2": [
      { sizeM: 1, wide: "SF20LX", narrow: "NH20LX", parRT: "SF20LR", parLT: "SF20LL", narrowParRT: "NH20LR", narrowParLT: "NH20LL" },
      { sizeM: 1, wide: "SF10HX", narrow: "NH10HX", parRT: "SF10HR", parLT: "SF10HL", narrowParRT: "NH10HR", narrowParLT: "NH10HL" },
    ],
    "2.5": [
      { sizeM: 1, wide: "SF30LX", narrow: "NH25LX", parRT: "SF30LR", parLT: "SF30LL", narrowParRT: "NH25LR", narrowParLT: "NH25LL" },
      { sizeM: 1, wide: "SF20MX", narrow: "NH15MX", parRT: "SF20MR", parLT: "SF20ML", narrowParRT: "NH15MR", narrowParLT: "NH15ML" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX", parRT: null, parLT: null, narrowParRT: null, narrowParLT: null },
    ],
    "3": [
      { sizeM: 1, wide: "SF30LX", narrow: null, parRT: "SF30LR", parLT: "SF30LL", narrowParRT: null, narrowParLT: null },
      { sizeM: 1, wide: "SF20MX", narrow: null, parRT: "SF20MR", parLT: "SF20ML", narrowParRT: null, narrowParLT: null },
      { sizeM: 1, wide: "SF10HX", narrow: null, parRT: "SF10HR", parLT: "SF10HL", narrowParRT: null, narrowParLT: null },
    ],
    "3.5": [
      { sizeM: 1, wide: "SF40LX", narrow: "NH35MX", parRT: "SF35LR", parLT: "SF35LL", narrowParRT: "NH35LR", narrowParLT: "NH35LL" },
      { sizeM: 1, wide: "SF30MX", narrow: "NH25MX", parRT: "SF25MR", parLT: "SF25ML", narrowParRT: "NH25MR", narrowParLT: "NH25ML" },
      { sizeM: 1, wide: "SF15MX", narrow: "NH15MX", parRT: "SF15MR", parLT: "SF15ML", narrowParRT: "NH15MR", narrowParLT: "NH15ML" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX", parRT: null, parLT: null, narrowParRT: null, narrowParLT: null },
    ],
    "4": [
      { sizeM: 1, wide: "SF40LX", narrow: "NH40MX", parRT: "SF40LR", parLT: "SF40LL", narrowParRT: "NH40LR", narrowParLT: "NH40LL" },
      { sizeM: 1, wide: "SF30MX", narrow: "NH30MX", parRT: "SF30MR", parLT: "SF30ML", narrowParRT: "NH30MR", narrowParLT: "NH30ML" },
      { sizeM: 1, wide: "SF20MX", narrow: "NH20MX", parRT: "SF20MR", parLT: "SF20ML", narrowParRT: "NH20MR", narrowParLT: "NH20ML" },
      { sizeM: 1, wide: "SF10HX", narrow: "NH10HX", parRT: "SF10HR", parLT: "SF10HL", narrowParRT: "NH10HR", narrowParLT: "NH10HL" },
    ],
    "4.5": [
      { sizeM: 1, wide: "SF50LX", narrow: "KH45LX", parRT: "SF50LR", parLT: "SF50LL", narrowParRT: "NH45LR", narrowParLT: "NH45LL" },
      { sizeM: 1, wide: "SF40MX", narrow: "NH35MX", parRT: "SF40MR", parLT: "SF40ML", narrowParRT: "NH35MR", narrowParLT: "NH35ML" },
      { sizeM: 1, wide: "SF30MX", narrow: "NH25MX", parRT: "SF30MR", parLT: "SF30ML", narrowParRT: "KH25MR", narrowParLT: "KH25ML" },
      { sizeM: 1, wide: "SF15MX", narrow: "NH15MX", parRT: "SF15MR", parLT: "SF15ML", narrowParRT: "NH15MR", narrowParLT: "NH15ML" },
      { sizeM: 0.5, wide: "NH10HN", narrow: "NQ10HX", parRT: null, parLT: null, narrowParRT: null, narrowParLT: null },
    ],
    "5": [
      { sizeM: 1, wide: "SF50LX", narrow: null, parRT: "SF50LR", parLT: "SF50LL", narrowParRT: null, narrowParLT: null },
      { sizeM: 1, wide: "SF40MX", narrow: null, parRT: "SF40MR", parLT: "SF40ML", narrowParRT: null, narrowParLT: null },
      { sizeM: 1, wide: "SF30MX", narrow: null, parRT: "SF30MR", parLT: "SF30ML", narrowParRT: null, narrowParLT: null },
      { sizeM: 1, wide: "SF20MX", narrow: null, parRT: "SF20MR", parLT: "SF20ML", narrowParRT: null, narrowParLT: null },
      { sizeM: 1, wide: "SF10HX", narrow: null, parRT: "SF10HR", parLT: "SF10HL", narrowParRT: null, narrowParLT: null },
    ],
  };

  Object.keys(SIDE_1X1_BY_HEIGHT).forEach(function (h) {
    const hasGap = SIDE_1X1_BY_HEIGHT[h].some(function (s) {
      return s.narrow === null || s.parRT === null || s.parLT === null;
    });
    if (hasGap) NEEDS_REVIEW.push(h);
  });

  const PanelCatalog1x1 = { SIDE_1X1_BY_HEIGHT, NEEDS_REVIEW };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PanelCatalog1x1;
  } else {
    global.PanelCatalog1x1 = PanelCatalog1x1;
  }
})(typeof window !== "undefined" ? window : globalThis);
