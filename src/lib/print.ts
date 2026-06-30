/**
 * Opens a clean, isolated print window with the given title and inner HTML,
 * then triggers the browser print dialog. Keeps print styling out of the app shell.
 */
export function openPrintWindow(title: string, innerHtml: string): void {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    alert('Please allow pop-ups for this site to print.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
  <style>
    * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 28px; color: #111; }
    h1, h2, h3 { margin: 0; }
    .doc-title { text-align: center; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
    .city { text-align: center; font-size: 20px; font-weight: 700; margin-top: 6px; color: #1d4ed8; text-transform: uppercase; letter-spacing: 1px; }
    .rule { border: none; border-top: 2px solid #111; margin: 14px 0; }
    .meta { display: flex; justify-content: space-between; gap: 24px; margin: 14px 0; font-size: 13px; }
    .meta div p { margin: 2px 0; }
    .label { color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #999; padding: 7px 9px; text-align: left; }
    th { background: #f1f1f1; font-weight: 700; }
    td.num, th.num { text-align: right; }
    .total-row td { font-weight: 700; background: #fafafa; }
    .remarks { margin-top: 16px; font-size: 12px; }
    .footer { margin-top: 56px; display: flex; justify-content: space-between; font-size: 12px; }
    .sign { border-top: 1px solid #555; padding-top: 4px; min-width: 200px; text-align: center; }
    @page { margin: 14mm; }
    @media print { body { padding: 0; } }
  </style></head><body>${innerHtml}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
  </body></html>`);
  w.document.close();
  w.focus();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export const esc = escapeHtml;
