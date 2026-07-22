// =============================================================================
// WATANI GRP Water Tank -- "0.5/1M Partition only" alternate CATALOG data
// =============================================================================
// Extracted from the original workbook's Panel sheet ("Partition Panel" /
// "Wall Panel Arrangement" diagram, rows 206-223), which -- like the Side
// Panel diagram -- lists TWO partition-wall build methods side by side per
// height. Comparing both columns against panel_catalog.js's already-verified
// defaults (partition.<course>.*) shows the RIGHT-hand column is an exact,
// row-for-row match to that default for every height (TOP_15/TOP_20 through
// LOWER/MID_LOWER/MID_TOP) -- confirming it's simply the default scheme drawn
// twice. The LEFT-hand column is the genuine alternate: it ONLY changes the
// topmost course of each height (TOP_15 for half-metre heights, TOP_20 for
// whole-metre heights) -- every lower course (MID_TOP/MID_LOWER/LOWER) is
// identical between the two columns, part-for-part, at every height checked.
//
// For that top course, the alternate:
//   - "partition" role: ONE panel spanning the course's full height,
//     replacing the default's two stacked pieces (partition + partition_2).
//   - "vert" role: still two pieces (same as default), just different part
//     numbers for one or both tiers.
//
// Because the alternate merges two default parts into one, it cannot be
// expressed as a same-key part-number swap on panel_catalog.js's existing
// partition.<course>.partition_2 slot (that slot's quantity is independent
// and would double-order). panel_engine.js's computePartitionAltItems()
// therefore emits its own "partition1x1.<course>.*" catalog keys for the
// affected top course only, at HALF the item count of the default
// (partition + vert + vert_2, no partition_2); every lower course keeps
// using the default partition.<course>.* keys unchanged, since the source
// data shows those are identical either way.
//
// H=1 has no split at all in the source sheet (single LOWER course, one
// value in both columns) -- there is no alternate for H=1.
// =============================================================================
(function (global) {
  "use strict";

  const PARTITION_ALT_BY_HEIGHT = {
    "1": null,
    "1.5": { course: "TOP_15", partition: "SL15HU85", vert: "NH15MX", vert_2: "NQ10HU15" },
    "2": { course: "TOP_20", partition: "ST20HU85", vert: "NH10HU85", vert_2: "NH20MX" },
    "2.5": { course: "TOP_15", partition: "SL15HU15", vert: "NH10MX", vert_2: "NQ15HU15" },
    "3": { course: "TOP_20", partition: "ST20HUB15", vert: "PH10HU15", vert_2: "NH20MX" },
    "3.5": { course: "TOP_15", partition: "SL15HU15", vert: "NH10MX", vert_2: "NQ15HU15" },
    "4": { course: "TOP_20", partition: "ST20HUB15", vert: "PH10HU15", vert_2: "NH20MX" },
    "4.5": { course: "TOP_15", partition: "SL15HU15", vert: "NH10MX", vert_2: "NQ15HU15" },
    "5": { course: "TOP_20", partition: "ST20HUB15", vert: "PH10HU15", vert_2: "NH20MX" },
  };

  const PanelCatalogPartitionAlt = { PARTITION_ALT_BY_HEIGHT };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PanelCatalogPartitionAlt;
  } else {
    global.PanelCatalogPartitionAlt = PanelCatalogPartitionAlt;
  }
})(typeof window !== "undefined" ? window : globalThis);
