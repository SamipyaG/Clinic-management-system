// First-Expiry-First-Out stock allocation. Expired batches are never dispensed.

export class InsufficientStockError extends Error {
  constructor(requested, available) {
    super(`Insufficient stock: requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
    this.requested = requested;
    this.available = available;
  }
}

/**
 * @param {Array<{id:any, expiry:Date, qtyOnHand:number}>} batches
 * @param {number} qty
 * @param {Date} [now]
 * @returns {Array<{id:any, qty:number}>} allocation per batch
 */
export const allocateFEFO = (batches, qty, now = new Date()) => {
  const usable = batches
    .filter((b) => b.qtyOnHand > 0 && b.expiry > now)
    .sort((a, b) => a.expiry - b.expiry);

  const available = usable.reduce((s, b) => s + b.qtyOnHand, 0);
  if (available < qty) throw new InsufficientStockError(qty, available);

  const out = [];
  let remaining = qty;
  for (const b of usable) {
    if (remaining === 0) break;
    const take = Math.min(b.qtyOnHand, remaining);
    out.push({ id: b.id, qty: take });
    remaining -= take;
  }
  return out;
};

/** Classify a batch: 'expired' | 'expiring' (within `days`) | 'ok'. */
export const expiryStatus = (expiry, days = 30, now = new Date()) => {
  if (expiry <= now) return 'expired';
  return expiry - now <= days * 86_400_000 ? 'expiring' : 'ok';
};

/** Classify total stock against a reorder level. */
export const stockLevel = (total, reorderLevel) => {
  if (total <= 0) return 'out_of_stock';
  return total <= reorderLevel ? 'low' : 'ok';
};
