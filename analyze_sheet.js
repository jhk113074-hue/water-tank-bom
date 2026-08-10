const fs = require('fs');
const XLSX = require('xlsx');

const workbook = XLSX.readFile('SPT BOM Nov 24th 2023_R4.xlsm', { cellFormulas: true });
const sheet = workbook.Sheets['Steel_Skid'];
const range = XLSX.utils.decode_range(sheet['!ref']);

console.log('=== Steel_Skid Sheet Analysis ===');

// Let's inspect rows 1 to 150 across columns A to AZ
for (let r = 0; r <= 150; r++) {
  let rowStr = [];
  for (let c = 0; c <= 40; c++) {
    const ref = XLSX.utils.encode_cell({ r: r, c: c });
    const cell = sheet[ref];
    if (cell && cell.v !== undefined && cell.v !== '') {
      rowStr.push(`${ref}: ${cell.f ? ('=' + cell.f) : cell.v}`);
    }
  }
  if (rowStr.length > 0) {
    console.log(`[Row ${r + 1}] ${rowStr.join(' | ')}`);
  }
}
