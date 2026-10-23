// Billing math. All amounts are integers in minor units (e.g. paisa/cents).

/**
 * @param {Array<{qty:number, unit:number}>} lines
 * @param {{type:'percent'|'fixed', value:number}} [discount]  percent value is basis points-free (10 = 10%)
 * @param {number} [taxPercent]
 */
export const computeInvoice = (lines, discount = null, taxPercent = 0) => {
  const lineTotals = lines.map((l) => Math.round(l.qty * l.unit));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);

  let discountAmount = 0;
  if (discount) {
    discountAmount =
      discount.type === 'percent' ? Math.round((subtotal * discount.value) / 100) : discount.value;
    discountAmount = Math.min(Math.max(discountAmount, 0), subtotal);
  }

  const taxable = subtotal - discountAmount;
  const tax = Math.round((taxable * taxPercent) / 100);
  return { lineTotals, subtotal, discount: discountAmount, tax, total: taxable + tax };
};

/** Net paid = completed payments minus refunds. */
export const netPaid = (payments) =>
  payments.reduce((sum, p) => (p.kind === 'refund' ? sum - p.amount : sum + p.amount), 0);

export const invoiceStatus = (total, paid, hadRefund = false) => {
  if (paid <= 0) return hadRefund ? 'refunded' : 'unpaid';
  if (paid < total) return 'partial';
  return 'paid';
};
