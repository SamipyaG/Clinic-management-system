import { Router } from 'express';
import { z } from 'zod';
import { Medicine, Supplier, StockBatch, StockMovement } from '../models/Pharmacy.js';
import { Prescription } from '../models/Prescription.js';
import { Visit } from '../models/Visit.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { buildAlerts, dispenseMedicine } from '../services/stock.js';
import { InsufficientStockError } from '../services/fefo.js';
import { addLines, getOrCreateInvoice } from '../services/invoicing.js';
import { asyncHandler, conflict, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Medicines ----------
const medicineSchema = z.object({
  name: z.string().min(1),
  generic: z.string().optional(),
  form: z.string().optional(),
  strength: z.string().optional(),
  unitPrice: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(10),
  active: z.boolean().optional(),
});

router.get('/medicines', authorize('pharmacy:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic, active: true };
  if (req.query.q) filter.name = new RegExp(escapeRegex(String(req.query.q)), 'i');
  const medicines = await Medicine.find(filter).sort('name').limit(200).lean();
  const totals = await StockBatch.aggregate([
    { $match: { clinic: req.user.clinic, expiry: { $gt: new Date() } } },
    { $group: { _id: '$medicine', stock: { $sum: '$qtyOnHand' } } },
  ]);
  const stock = new Map(totals.map((t) => [String(t._id), t.stock]));
  res.json(medicines.map((m) => ({ ...m, stock: stock.get(String(m._id)) ?? 0 })));
}));

router.post('/medicines', authorize('pharmacy:manage'), validate(medicineSchema), asyncHandler(async (req, res) => {
  const medicine = await Medicine.create({ ...req.body, clinic: req.user.clinic });
  audit(req, 'medicine.create', 'Medicine', medicine.id);
  res.status(201).json(medicine);
}));

router.patch('/medicines/:id', authorize('pharmacy:manage'), validate(medicineSchema.partial()), asyncHandler(async (req, res) => {
  const medicine = await Medicine.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic }, req.body, { new: true, runValidators: true });
  if (!medicine) throw notFound('Medicine not found');
  audit(req, 'medicine.update', 'Medicine', medicine.id);
  res.json(medicine);
}));

// ---------- Suppliers ----------
const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

router.get('/suppliers', authorize('pharmacy:read'), asyncHandler(async (req, res) => {
  res.json(await Supplier.find({ clinic: req.user.clinic }).sort('name'));
}));

router.post('/suppliers', authorize('pharmacy:manage'), validate(supplierSchema), asyncHandler(async (req, res) => {
  const supplier = await Supplier.create({ ...req.body, clinic: req.user.clinic });
  audit(req, 'supplier.create', 'Supplier', supplier.id);
  res.status(201).json(supplier);
}));

// ---------- Stock: receive batches ----------
const batchSchema = z.object({
  medicine: z.string(),
  batchNo: z.string().min(1),
  expiry: z.coerce.date(),
  qty: z.number().int().min(1),
  costPrice: z.number().int().min(0).default(0),
  supplier: z.string().optional(),
});

router.post('/batches', authorize('pharmacy:manage'), validate(batchSchema), asyncHandler(async (req, res) => {
  const { qty, ...rest } = req.body;
  if (!(await Medicine.exists({ _id: rest.medicine, clinic: req.user.clinic }))) throw notFound('Medicine not found');
  if (rest.expiry <= new Date()) throw conflict('Cannot receive an already expired batch');

  // Receiving the same batch number again adds to it instead of failing on the unique index.
  const batch = await StockBatch.findOneAndUpdate(
    { medicine: rest.medicine, batchNo: rest.batchNo },
    { $inc: { qtyOnHand: qty }, $setOnInsert: { ...rest, clinic: req.user.clinic } },
    { new: true, upsert: true },
  );
  await StockMovement.create({ clinic: req.user.clinic, medicine: rest.medicine, batch: batch._id, type: 'purchase', qty, by: req.user.id });
  audit(req, 'stock.receive', 'StockBatch', batch.id, { qty });
  res.status(201).json(batch);
}));

router.get('/batches', authorize('pharmacy:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.medicine) filter.medicine = req.query.medicine;
  res.json(await StockBatch.find(filter).sort('expiry').populate('medicine', 'name strength').limit(300));
}));

router.get('/movements', authorize('pharmacy:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.medicine) filter.medicine = req.query.medicine;
  res.json(await StockMovement.find(filter).sort('-createdAt').limit(200).populate('medicine', 'name'));
}));

// ---------- Alerts ----------
router.get('/alerts', authorize('pharmacy:read'), asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  res.json(await buildAlerts(req.user.clinic, { days }));
}));

// ---------- Dispensing ----------
const dispenseSchema = z.object({
  items: z.array(z.object({ medicine: z.string(), quantity: z.number().int().min(1) })).min(1),
});

router.post('/prescriptions/:id/dispense', authorize('pharmacy:dispense'), validate(dispenseSchema), asyncHandler(async (req, res) => {
  // Claim the prescription first so a double click cannot dispense twice.
  const rx = await Prescription.findOneAndUpdate(
    { _id: req.params.id, clinic: req.user.clinic, status: 'issued' },
    { status: 'dispensed' },
    { new: true },
  );
  if (!rx) throw conflict('Prescription not found or already processed');

  const dispensed = [];
  const byId = new Map();
  try {
    const medicines = await Medicine.find({ _id: { $in: req.body.items.map((i) => i.medicine) }, clinic: req.user.clinic });
    medicines.forEach((m) => byId.set(String(m._id), m));
    if (byId.size !== new Set(req.body.items.map((i) => i.medicine)).size) throw notFound('Medicine not found');

    for (const { medicine, quantity } of req.body.items) {
      const batches = await dispenseMedicine({ clinic: req.user.clinic, medicine, qty: quantity, ref: String(rx._id), by: req.user.id });
      dispensed.push({ medicine, quantity, batches });
    }
  } catch (err) {
    // Put back whatever was already taken, then reopen the prescription.
    for (const d of dispensed) {
      for (const b of d.batches) {
        await StockBatch.updateOne({ _id: b.id }, { $inc: { qtyOnHand: b.qty } });
      }
      await StockMovement.deleteMany({ ref: String(rx._id), medicine: d.medicine, type: 'dispense' });
    }
    await Prescription.updateOne({ _id: rx._id }, { status: 'issued' });
    if (err instanceof InsufficientStockError) throw conflict(err.message);
    throw err;
  }

  const visit = await Visit.findById(rx.visit);
  const invoice = await getOrCreateInvoice(visit);
  const updated = await addLines(
    invoice,
    req.body.items.map(({ medicine, quantity }) => {
      const m = byId.get(medicine);
      return {
        type: 'medicine',
        ref: `${rx._id}:${medicine}`,
        description: [m.name, m.strength].filter(Boolean).join(' '),
        qty: quantity,
        unit: m.unitPrice,
      };
    }),
  );
  audit(req, 'prescription.dispense', 'Prescription', rx.id);
  res.json({ prescription: rx, dispensed, invoice: updated });
}));

export default router;
