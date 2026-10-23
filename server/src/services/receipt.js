// Printable HTML receipt (browser print → PDF). Every interpolated value is escaped.

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const money = (minor, currency = '') => `${currency} ${(minor / 100).toFixed(2)}`.trim();

export const receiptHtml = ({ clinic, invoice, payment }) => {
  const cur = clinic.currency;
  const rows = invoice.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.description)}</td><td class="n">${esc(l.qty)}</td><td class="n">${esc(money(l.unit))}</td><td class="n">${esc(money(l.total))}</td></tr>`,
    )
    .join('');
  const label = payment.kind === 'refund' ? 'Refund' : 'Payment';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(payment.receiptNo)}</title>
<style>body{font:14px system-ui,sans-serif;max-width:520px;margin:24px auto;color:#111}h1{font-size:18px;margin:0}
table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:4px 0;border-bottom:1px solid #ddd;text-align:left}
.n{text-align:right}.tot td{font-weight:600}.muted{color:#666}</style></head><body>
<h1>${esc(clinic.name)}</h1><div class="muted">${esc(clinic.address)} ${esc(clinic.phone)}</div><hr>
<div>Receipt <b>${esc(payment.receiptNo)}</b> · ${esc(payment.createdAt.toISOString().slice(0, 10))}</div>
<div>Invoice ${esc(invoice.number)} · ${esc(invoice.patient?.name)} (${esc(invoice.patient?.patientId)})</div>
<table><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr>${rows}
<tr class="tot"><td colspan="3">Subtotal</td><td class="n">${esc(money(invoice.subtotal))}</td></tr>
<tr><td colspan="3">Discount</td><td class="n">-${esc(money(invoice.discount))}</td></tr>
<tr><td colspan="3">Tax</td><td class="n">${esc(money(invoice.tax))}</td></tr>
<tr class="tot"><td colspan="3">Total (${esc(cur)})</td><td class="n">${esc(money(invoice.total))}</td></tr></table>
<div>${label} (${esc(payment.method)}): <b>${esc(money(payment.amount))}</b></div>
<div>Paid to date: ${esc(money(invoice.paid))} · Balance: <b>${esc(money(invoice.balance))}</b></div>
</body></html>`;
};
