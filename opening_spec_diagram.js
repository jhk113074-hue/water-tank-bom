// =============================================================================
// Opening Spec Sheet (opening_spec_diagram.js) -- 개공사양도 / 개공작업지시서
// Production-instruction view built purely from window.bomItems[*].openingCode
// (see opening_code_util.js). Read-only, display-only: never writes back into
// BOM/costing state, so it cannot affect price or part-number lookups.
// =============================================================================
(function (global) {
  "use strict";

  function collectOpeningLines() {
    const sourceBom = Array.isArray(global.bomItems) ? global.bomItems : [];
    const map = {};
    const lines = [];
    sourceBom.forEach(item => {
      if (!item || !item.openingCode) return;
      const key = `${item.partNo}::${item.openingCode}`;
      if (map[key]) {
        map[key].qty += Number(item.qty) || 0;
      } else {
        map[key] = {
          partNo: item.partNo,
          partName: item.partName || '',
          openingCode: item.openingCode,
          qty: Number(item.qty) || 0
        };
        lines.push(map[key]);
      }
    });
    lines.sort((a, b) => a.openingCode.localeCompare(b.openingCode) || String(a.partNo).localeCompare(String(b.partNo)));
    return lines;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    const container = document.getElementById('openingSpecSheetContainer');
    if (!container) return;

    const lines = collectOpeningLines();
    if (lines.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8; font-size:13px; font-weight:600;">
        현재 활성 스펙/BOM에는 개공코드가 지정된 패널이 없습니다.<br>
        <span style="font-size:11px; font-weight:400;">HAYOUNG Spec처럼 코드에 개공이 내장되지 않은 프리셋에서는 BOM INPUT 매트릭스 셀 아래 "개공" 입력칸에 값을 넣어 주세요.</span>
      </div>`;
      return;
    }

    const byOpeningCode = {};
    lines.forEach(l => {
      if (!byOpeningCode[l.openingCode]) byOpeningCode[l.openingCode] = [];
      byOpeningCode[l.openingCode].push(l);
    });

    let html = `<table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#f1f5f9; border-bottom:2px solid #334155;">
          <th style="padding:8px 10px; text-align:left;">개공코드</th>
          <th style="padding:8px 10px; text-align:left;">Part No.</th>
          <th style="padding:8px 10px; text-align:left;">Part Name</th>
          <th style="padding:8px 10px; text-align:right;">Q'TY</th>
        </tr>
      </thead>
      <tbody>`;

    Object.keys(byOpeningCode).sort().forEach(code => {
      const group = byOpeningCode[code];
      const groupTotal = group.reduce((s, l) => s + l.qty, 0);
      group.forEach((l, idx) => {
        html += `<tr style="border-bottom:1px solid #e2e8f0;">
          ${idx === 0 ? `<td rowspan="${group.length}" style="padding:8px 10px; vertical-align:top; font-weight:800; color:#a21caf; border-right:1px dashed #d946ef;">${escapeHtml(code)}</td>` : ''}
          <td style="padding:8px 10px; font-family:monospace; font-weight:700; color:#0284c7;">${escapeHtml(l.partNo)}</td>
          <td style="padding:8px 10px;">${escapeHtml(l.partName)}</td>
          <td style="padding:8px 10px; text-align:right; font-weight:700;">${l.qty}</td>
        </tr>`;
      });
      html += `<tr style="background:#fdf4ff; border-bottom:2px solid #d946ef;">
        <td colspan="3" style="padding:6px 10px; text-align:right; font-weight:800; font-size:11px; color:#a21caf;">개공코드 [${escapeHtml(code)}] 소계</td>
        <td style="padding:6px 10px; text-align:right; font-weight:800; color:#a21caf;">${groupTotal}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  function printSheet() {
    const container = document.getElementById('openingSpecSheetContainer');
    if (!container) return;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>개공작업지시서</title></head><body>${container.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  global.OpeningSpecSheet = { render, printSheet, collectOpeningLines };
})(typeof window !== 'undefined' ? window : this);
