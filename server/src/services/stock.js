import { StockBatch, StockMovement } from '../models/Pharmacy.js';
import { allocateFEFO, expiryStatus, stockLevel } from './fefo.js';
import { Medicine } from '../models/Pharmacy.js';
import { conflict } from '../utils/errors.js';

/**
 * Deduct `qty` of a medicine using FEFO. MongoDB has no multi-doc transaction on a standalone server,
 * so each batch is decremented with a conditional update and earlier decrements are undone on failure.
 */
export const dispenseMedicine = async ({ clinic, medicine, qty, ref, by }) => {
  const batches = await StockBatch.find({ clinic, medicine, qtyOnHand: { $gt: 0 } });
  const plan = allocateFEFO(
    batches.map((b) => ({ id: b._id, expiry: b.expiry, qtyOnHand: b.qtyOnHand })),
    qty,
  );

  const done = [];
  for (const { id, qty: take } of plan) {
    const res = await StockBatch.updateOne({ _id: id, qtyOnHand: { $gte: take } }, { $inc: { qtyOnHand: -take } });
    if (res.modifiedCount !== 1) {
      await Promise.all(done.map((d) => StockBatch.updateOne({ _id: d.id }, { $inc: { qtyOnHand: d.qty } })));
      throw conflict('Stock changed while dispensing, please retry');
    }
    done.push({ id, qty: take });
  }

  await StockMovement.insertMany(
    done.map((d) => ({ clinic, medicine, batch: d.id, type: 'dispense', qty: -d.qty, ref, by })),
  );
  return done;
};

/** Stock health per medicine: usable stock excludes expired batches. */
export const buildAlerts = async (clinic, { days = 30, now = new Date() } = {}) => {
  const [medicines, batches] = await Promise.all([
    Medicine.find({ clinic, active: true }),
    StockBatch.find({ clinic, qtyOnHand: { $gt: 0 } }).populate('medicine', 'name strength'),
  ]);

  const expired = [];
  const expiring = [];
  const usable = new Map();
  for (const b of batches) {
    const status = expiryStatus(b.expiry, days, now);
    if (status === 'expired') expired.push(b);
    else {
      if (status === 'expiring') expiring.push(b);
      usable.set(String(b.medicine._id), (usable.get(String(b.medicine._id)) ?? 0) + b.qtyOnHand);
    }
  }

  const low = [];
  const outOfStock = [];
  for (const m of medicines) {
    const total = usable.get(String(m._id)) ?? 0;
    const level = stockLevel(total, m.reorderLevel);
    if (level === 'out_of_stock') outOfStock.push({ medicine: m, total });
    else if (level === 'low') low.push({ medicine: m, total });
  }
  return { expired, expiring, low, outOfStock };
};
