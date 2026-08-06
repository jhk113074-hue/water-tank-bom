const fs = require('fs');
const layoutRaw = fs.readFileSync('steel_accessories_layout.json', 'utf8');
const layout = JSON.parse(layoutRaw);
const panelRulesCode = fs.readFileSync('panel_rules.js', 'utf8');

const globalObj = { window: {}, document: { addEventListener: () => {} } };
const prFn = new Function('global', panelRulesCode + '; return global.PanelRules;');
const PanelRules = prFn(globalObj);

function courseSeams(hStr) {
  const table = PanelRules && PanelRules.COURSE_TABLE;
  const courses = table && table[String(hStr)];
  const H = parseFloat(hStr);
  if (!Array.isArray(courses)) {
    const out = [];
    for (let y = 1; y < H - 0.001; y += 1) out.push(y);
    return out;
  }
  const bottomUp = courses.slice().reverse();
  const seams = [];
  let y = 0;
  for (let i = 0; i < bottomUp.length - 1; i++) {
    const c = bottomUp[i];
    let h = 1;
    if (c === 'TOP_15') h = 1.5;
    if (c === 'TOP_20') h = 2;
    y += h;
    seams.push(y);
  }
  return seams;
}

const targetHeights = ['1', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
const intSide = layout.diagrams.find(d => d.id === 'int_side');
if (!intSide.heightSpecs) intSide.heightSpecs = {};

targetHeights.forEach(hStr => {
  const H = parseFloat(hStr);
  const seams = courseSeams(hStr);
  const ys = [0, ...seams, H];
  
  const sections = [];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < ys.length - 1; i++) {
      sections.push({
        id: 'c' + c + '_y' + ys[i],
        x: c,
        y: ys[i],
        w: 1,
        h: ys[i+1] - ys[i]
      });
    }
  }
  
  const positions = {};
  let posCount = 1;
  const allYs = [0, ...seams, H];
  
  allYs.forEach(y => {
    // Basic positions: left(0), center(1.5), right(3)
    [0, 1.5, 3].forEach(x => {
      const pid = 'P' + posCount++;
      positions[pid] = {
        label: 'x:' + x + ' y:' + y,
        sections: [],
        x: x,
        y: y,
        instances: 1,
        note: 'Generated position'
      };
    });
  });

  if (!intSide.heightSpecs[hStr]) intSide.heightSpecs[hStr] = {};
  intSide.heightSpecs[hStr].panelStructure = { sections: sections };
  intSide.heightSpecs[hStr].positions = positions;
});

fs.writeFileSync('steel_accessories_layout.json', JSON.stringify(layout, null, 2));
console.log('V3 structures generated and saved to steel_accessories_layout.json');
