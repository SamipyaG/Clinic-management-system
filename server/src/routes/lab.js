import { Router } from 'express';
import { z } from 'zod';
import { LabTest, LabOrder } from '../models/Lab.js';
import { Visit } from '../models/Visit.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ageInYears, deriveOrderStatus, flagResult, pickRange } from '../services/lab.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

// ---------- Catalog ----------
const rangeSchema = z.object({
  gender: z.enum(['male', 'female', 'any']).default('any'),
  ageMin: z.number().optional(),
  ageMax: z.number().optional(),
  low: z.number(),
  high: z.number(),
  criticalLow: z.number().optional(),
  criticalHigh: z.number().optional(),
});

const testSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  sampleType: z.string().optional(),
  unit: z.string().optional(),
  price: z.number().int().min(0).default(0),
  referenceRanges: z.array(rangeSchema).default([]),
  active: z.boolean().optional(),
});

router.get('/tests', authorize('lab:read'), asyncHandler(async (req, res) => {
  res.json(await LabTest.find({ clinic: req.user.clinic, active: true }).sort('name'));
}));

router.post('/tests', authorize('lab:manage'), validate(testSchema), asyncHandler(async (req, res) => {
  const test = await LabTest.create({ ...req.body, clinic: req.user.clinic });
  audit(req, 'lab.test.create', 'LabTest', test.id);
  res.status(201).json(test);
}));

router.patch('/tests/:id', authorize('lab:manage'), validate(testSchema.partial()), asyncHandler(async (req, res) => {
  const test = await LabTest.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic }, req.body, { new: true, runValidators: true });
  if (!test) throw notFound('Test not found');
  audit(req, 'lab.test.update', 'LabTest', test.id);
  res.json(test);
}));

// ---------- Orders ----------
const orderSchema = z.object({ visit: z.string(), tests: z.array(z.string()).min(1) });

router.post('/orders', authorize('lab:order'), validate(orderSchema), asyncHandler(async (req, res) => {
  const visit = await Visit.findOne({ _id: req.body.visit, clinic: req.user.clinic });
  if (!visit) throw notFound('Visit not found');
  if (req.user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: req.user.id });
    if (!doctor || !doctor._id.equals(visit.doctor)) throw forbidden('This visit belongs to another doctor');
  }

  const ids = [...new Set(req.body.tests)];
  const tests = await LabTest.find({ _id: { $in: ids }, clinic: req.user.clinic, active: true });
  if (tests.length !== ids.length) throw badRequest('One or more tests not found');

  const order = await LabOrder.create({
    clinic: req.user.clinic,
    visit: visit._id,
    patient: visit.patient,
    orderedBy: visit.doctor,
    items: tests.map((t) => ({ test: t._id, name: t.name, price: t.price, unit: t.unit })),
  });
  audit(req, 'lab.order.create', 'LabOrder', order.id);
  res.status(201).json(order);
}));

router.get('/orders', authorize('lab:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.patient) filter.patient = req.query.patient;
  res.json(await LabOrder.find(filter).sort('-createdAt').limit(100).populate('patient', 'name patientId'));
}));

router.get('/orders/:id', authorize('lab:read'), asyncHandler(async (req, res) => {
  const order = await LabOrder.findOne({ _id: req.params.id, clinic: req.user.clinic }).populate('patient', 'name patientId');
  if (!order) throw notFound('Order not found');
  res.json(order);
}));

const loadOrder = async (req) => {
  const order = await LabOrder.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!order) throw notFound('Order not found');
  return order;
};

const loadItem = (order, itemId) => {
  const item = order.items.id(itemId);
  if (!item) throw notFound('Test not found in this order');
  return item;
};

/** Move one test along ordered → collected → processing. */
const advance = (from, to) =>
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req);
    const item = loadItem(order, req.params.itemId);
    if (item.status !== from) throw conflict(`Test is ${item.status}, expected ${from}`);
    item.status = to;
    order.status = deriveOrderStatus(order.items.map((i) => i.status));
    await order.save();
    audit(req, `lab.item.${to}`, 'LabOrder', order.id, { item: item.id });
    res.json(order);
  });

router.post('/orders/:id/items/:itemId/collect', authorize('lab:process'), advance('ordered', 'collected'));
router.post('/orders/:id/items/:itemId/process', authorize('lab:process'), advance('collected', 'processing'));

const resultSchema = z
  .object({ value: z.number().optional(), textResult: z.string().optional() })
  .refine((r) => r.value != null || r.textResult, 'Provide value or textResult');

router.post('/orders/:id/items/:itemId/result', authorize('lab:process'), validate(resultSchema), asyncHandler(async (req, res) => {
  const order = await loadOrder(req);
  const item = loadItem(order, req.params.itemId);
  if (item.status !== 'processing') throw conflict(`Test is ${item.status}, expected processing`);

  const [test, patient] = await Promise.all([LabTest.findById(item.test), Patient.findById(order.patient)]);
  const range = pickRange(test?.referenceRanges ?? [], { age: ageInYears(patient.dob), gender: patient.gender });

  Object.assign(item, {
    status: 'resulted',
    value: req.body.value,
    textResult: req.body.textResult,
    range: range ? { low: range.low, high: range.high } : undefined,
    flag: flagResult(req.body.value, range),
    resultedAt: new Date(),
    resultedBy: req.user.id,
  });
  order.status = deriveOrderStatus(order.items.map((i) => i.status));
  await order.save();
  audit(req, 'lab.item.resulted', 'LabOrder', order.id, { item: item.id, flag: item.flag });
  res.json(order);
}));

router.post('/orders/:id/review', authorize('lab:review'), validate(z.object({ notes: z.string().optional() })), asyncHandler(async (req, res) => {
  const order = await loadOrder(req);
  if (order.status !== 'completed') throw conflict('Only completed orders can be reviewed');
  const doctor = await Doctor.findOne({ user: req.user.id });
  order.status = 'reviewed';
  order.reviewedBy = doctor?._id;
  order.reviewedAt = new Date();
  order.reviewNotes = req.body.notes;
  await order.save();
  audit(req, 'lab.order.review', 'LabOrder', order.id);
  res.json(order);
}));

export default router;
