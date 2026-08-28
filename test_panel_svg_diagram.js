const assert = require('assert');

const PanelSvgDiagram = require('./panel_svg_diagram.js');

console.log('Testing PanelSvgDiagram module...');

const dummyMatrixMap = {
  'side.LOWER.side': { heightGrades: { '1mH': 'SF10SX', '1.5mH': 'SF10SX', '2mH': 'SF20SX', '2.5mH': 'SF30LX', '3mH': 'SF30LX', '3.5mH': 'SF40LX', '4mH': 'SF40LX', '4.5mH': 'SF50LX', '5mH': 'SF50LX' } },
  'side.LOWER.hside': { heightGrades: { '1mH': 'NH10SX', '2.5mH': 'NH25LX', '3mH': 'NH30LX', '3.5mH': 'NH35LX', '4mH': 'NH40LX', '4.5mH': 'KH45LX', '5mH': 'NH50LX' } },
  'side.TOP_15.side': { heightGrades: { '1.5mH': 'SL15SX', '2.5mH': 'SL15HX', '3.5mH': 'SL15HX', '4.5mH': 'SL15HX' } },
  'side.TOP_15.hside': { heightGrades: { '1.5mH': 'NH15LX', '2.5mH': 'NH15HX', '3.5mH': 'NH15HX', '4.5mH': 'NH15HX' } },
  'side.TOP_15.qside': { heightGrades: { '1.5mH': 'NQ10HX', '2.5mH': 'NQ10HX', '3.5mH': 'NQ10HX', '4.5mH': 'NQ10HX' } },
  'side.TOP_20.side': { heightGrades: { '2mH': 'ST20SX', '3mH': 'ST20HX', '4mH': 'ST20HX', '5mH': 'ST20HX' } },
  'side.TOP_20.hside_a': { heightGrades: { '2mH': 'NH10HX', '3mH': 'NH10HX', '4mH': 'NH10HX', '5mH': 'NH10HX' } },
  'side.TOP_20.hside_b': { heightGrades: { '2mH': 'NH20LX', '3mH': 'NH20MX', '4mH': 'NH20MX', '5mH': 'NH20MX' } },
  'side.MID_LOWER.side': { heightGrades: { '3.5mH': 'SF30MX', '4mH': 'SF30MX', '4.5mH': 'SF40MX', '5mH': 'SF40MX' } },
  'side.MID_LOWER.hside': { heightGrades: { '3.5mH': 'NH25MX', '4mH': 'NH30MX', '4.5mH': 'NH35MX', '5mH': 'NH40MX' } },
  'side.MID_TOP.side': { heightGrades: { '4.5mH': 'SF30MX', '5mH': 'SF30MX' } },
  'side.MID_TOP.hside': { heightGrades: { '4.5mH': 'NH25HX', '5mH': 'NH30HX' } },
};

['1mH', '1.5mH', '2mH', '2.5mH', '3mH', '3.5mH', '4mH', '4.5mH', '5mH'].forEach(hGrade => {
  const svg = PanelSvgDiagram.renderHeightElevationSvg(hGrade, dummyMatrixMap, { showDimensions: true, showFlangeBars: true });
  console.log(`Rendered ${hGrade} SVG (${svg.length} bytes)`);
  assert(svg.startsWith('<svg'), `SVG for ${hGrade} must start with <svg`);
  assert(svg.endsWith('</svg>'), `SVG for ${hGrade} must end with </svg>`);
});

console.log('Testing Option 2 (1x1m side panel) SVGs...');
['1mH', '1.5mH', '2mH', '2.5mH', '3mH', '3.5mH', '4mH', '4.5mH', '5mH'].forEach(hGrade => {
  const svg = PanelSvgDiagram.renderHeightElevationSvg(hGrade, dummyMatrixMap, { showDimensions: true, showFlangeBars: true, is1x1SideOption: true });
  console.log(`Rendered Option 2 ${hGrade} SVG (${svg.length} bytes)`);
  assert(svg.startsWith('<svg'), `SVG for ${hGrade} must start with <svg`);
  assert(svg.endsWith('</svg>'), `SVG for ${hGrade} must end with </svg>`);
});

console.log('Testing Option 4 (1x1m partition panel) SVGs...');
['1mH', '1.5mH', '2mH', '2.5mH', '3mH', '3.5mH', '4mH', '4.5mH', '5mH'].forEach(hGrade => {
  const svg = PanelSvgDiagram.renderHeightElevationSvg(hGrade, dummyMatrixMap, { showDimensions: true, showFlangeBars: true, sideMatrixOption: 4 });
  console.log(`Rendered Option 4 ${hGrade} SVG (${svg.length} bytes)`);
  assert(svg.startsWith('<svg'), `SVG for ${hGrade} must start with <svg`);
  assert(svg.endsWith('</svg>'), `SVG for ${hGrade} must end with </svg>`);
});

console.log('Testing Option 0 (Roof, Manhole, Bottom, Drain) SVGs...');
['1mH', '1.5mH', '2mH', '2.5mH', '3mH', '3.5mH', '4mH', '4.5mH', '5mH'].forEach(hGrade => {
  const svg = PanelSvgDiagram.renderHeightElevationSvg(hGrade, dummyMatrixMap, { showDimensions: true, showFlangeBars: true, sideMatrixOption: 0 });
  console.log(`Rendered Option 0 ${hGrade} SVG (${svg.length} bytes)`);
  assert(svg.startsWith('<svg'), `SVG for ${hGrade} must start with <svg`);
  assert(svg.endsWith('</svg>'), `SVG for ${hGrade} must end with </svg>`);
});

console.log('ALL PANEL SVG DIAGRAM TESTS PASSED!');
