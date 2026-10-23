import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Visit } from '../models/Visit.js';
import { Doctor } from '../models/Doctor.js';
import { Department } from '../models/Department.js';
import { Clinic } from '../models/Clinic.js';
import { Consultation } from '../models/Consultation.js';
import { LabOrder } from '../models/Lab.js';
import { Invoice, Payment, Expense } from '../models/Billing.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { buildAlerts } from '../services/stock.js';
import { addDays, dateKey, weekdayOf } from '../utils/time.js';
import { asyncHandler } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z.object({ from: date.optional(), to: date.optional(), groupBy: z.enum(['day', 'month']).default('day') });

/** Inclusive date strings → [start, endExclusive) Dates. Defaults to the current month. */
const toRange = ({ from, to }) => {
  const today = dateKey(new Date());
  const f = from ?? `${today.slice(0, 8)}01`;
  const t = to ?? today;
  return { from: f, to: t, start: new Date(`${f}T00:00:00`), end: new Date(`${addDays(t, 1)}T00:00:00`) };
};

const signedAmount = { $cond: [{ $eq: ['$kind', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] };

// ---------- Dashboard (today) ----------
router.get('/dashboard', authorize('dashboard:read'), asyncHandler(async (req, res) => {
  const clinic = req.user.clinic;
  const today = dateKey(new Date());
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${addDays(today, 1)}T00:00:00`);

  const [totalPatients, newPatients, apptByStatus, waiting, inConsultation, doctors, clinicDoc, revenue, labPending, alerts] =
    await Promise.all([
      Patient.countDocuments({ clinic }),
      Patient.countDocuments({ clinic, createdAt: { $gte: start, $lt: end } }),
      Appointment.aggregate([{ $match: { clinic, date: today } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Visit.countDocuments({ clinic, date: today, status: 'waiting' }),
      Visit.countDocuments({ clinic, date: today, status: 'in_consultation' }),
      Doctor.find({ clinic, active: true }).populate('user', 'name'),
      Clinic.findById(clinic),
      Payment.aggregate([{ $match: { clinic, createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: signedAmount }, count: { $sum: 1 } } }]),
      LabOrder.countDocuments({ clinic, status: { $in: ['ordered', 'in_progress'] } }),
      buildAlerts(clinic),
    ]);

  const status = Object.fromEntries(apptByStatus.map((s) => [s._id, s.n]));
  const pending = (status.booked ?? 0) + (status.confirmed ?? 0);
  const onHoliday = clinicDoc?.holidays?.includes(today);
  const availableDoctors = onHoliday
    ? []
    : doctors
        .filter((d) => d.schedule.some((s) => s.day === weekdayOf(today)) && !d.leaves.some((l) => today >= l.from && today <= l.to))
        .map((d) => ({ id: d.id, name: d.user?.name }));

  res.json({
    date: today,
    patients: { total: totalPatients, newToday: newPatients },
    appointments: {
      total: Object.values(status).reduce((a, b) => a + b, 0),
      completed: status.completed ?? 0,
      pending,
      cancelled: status.cancelled ?? 0,
      noShow: status.no_show ?? 0,
      byStatus: status,
    },
    queue: { waiting, inConsultation },
    availableDoctors,
    revenueToday: { collected: revenue[0]?.total ?? 0, payments: revenue[0]?.count ?? 0 },
    laboratory: { pendingOrders: labPending },
    pharmacy: {
      expiring: alerts.expiring.length,
      expired: alerts.expired.length,
      lowStock: alerts.low.length,
      outOfStock: alerts.outOfStock.length,
    },
  });
}));

// ---------- Financial ----------
router.get('/revenue', authorize('report:read'), validate(rangeSchema, 'query'), asyncHandler(async (req, res) => {
  const clinic = req.user.clinic;
  const { from, to, start, end } = toRange(req.query);
  const format = req.query.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const invoiceMatch = { clinic, createdAt: { $gte: start, $lt: end } };

  const [collected, byMethod, billedByType, billedByDoctor, expenses] = await Promise.all([
    Payment.aggregate([
      { $match: { clinic, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { $dateToString: { format, date: '$createdAt', timezone: env.timezone } }, collected: { $sum: signedAmount }, payments: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: { clinic, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$method', collected: { $sum: signedAmount } } },
      { $sort: { collected: -1 } },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.type', billed: { $sum: '$lines.total' }, items: { $sum: 1 } } },
      { $sort: { billed: -1 } },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $lookup: { from: Visit.collection.name, localField: 'visit', foreignField: '_id', as: 'v' } },
      { $unwind: '$v' },
      { $group: { _id: '$v.doctor', billed: { $sum: '$total' }, invoices: { $sum: 1 } } },
      { $sort: { billed: -1 } },
    ]),
    Expense.aggregate([{ $match: { clinic, date: { $gte: from, $lte: to } } }, { $group: { _id: '$category', amount: { $sum: '$amount' } } }, { $sort: { amount: -1 } }]),
  ]);

  const doctors = await Doctor.find({ _id: { $in: billedByDoctor.map((d) => d._id) } }).populate('user', 'name');
  const names = new Map(doctors.map((d) => [String(d._id), d.user?.name]));

  const totalCollected = collected.reduce((s, c) => s + c.collected, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const typeRevenue = (t) => billedByType.find((b) => b._id === t)?.billed ?? 0;

  res.json({
    range: { from, to },
    collected: collected.map((c) => ({ period: c._id, collected: c.collected, payments: c.payments })),
    totalCollected,
    byMethod: byMethod.map((m) => ({ method: m._id, collected: m.collected })),
    serviceWise: billedByType.map((b) => ({ type: b._id, billed: b.billed, items: b.items })),
    pharmacyRevenue: typeRevenue('medicine'),
    laboratoryRevenue: typeRevenue('lab'),
    doctorWise: billedByDoctor.map((d) => ({ doctor: d._id, name: names.get(String(d._id)), billed: d.billed, invoices: d.invoices })),
    expenses: { total: totalExpenses, byCategory: expenses.map((e) => ({ category: e._id, amount: e.amount })) },
    netIncome: totalCollected - totalExpenses,
  });
}));

router.get('/outstanding', authorize('report:read'), asyncHandler(async (req, res) => {
  const items = await Invoice.find({ clinic: req.user.clinic, balance: { $gt: 0 } })
    .sort('-createdAt')
    .limit(500)
    .populate('patient', 'name patientId phone');
  res.json({ items, total: items.reduce((s, i) => s + i.balance, 0) });
}));

router.get('/payments', authorize('report:read'), validate(rangeSchema, 'query'), asyncHandler(async (req, res) => {
  const { start, end } = toRange(req.query);
  res.json(await Payment.find({ clinic: req.user.clinic, createdAt: { $gte: start, $lt: end } }).sort('-createdAt').limit(500).populate('invoice', 'number'));
}));

// ---------- Clinic performance ----------
router.get('/performance', authorize('report:read'), validate(rangeSchema, 'query'), asyncHandler(async (req, res) => {
  const clinic = req.user.clinic;
  const { from, to, start, end } = toRange(req.query);
  const apptMatch = { clinic, date: { $gte: from, $lte: to } };

  const [byStatus, byDoctor, byDepartment, growth, consultations, labByStatus, pharmacy] = await Promise.all([
    Appointment.aggregate([{ $match: apptMatch }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Appointment.aggregate([
      { $match: apptMatch },
      { $group: { _id: '$doctor', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
      { $sort: { total: -1 } },
    ]),
    Appointment.aggregate([{ $match: apptMatch }, { $group: { _id: '$department', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }, { $sort: { total: -1 } }]),
    Patient.aggregate([
      { $match: { clinic, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: env.timezone } }, newPatients: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Consultation.countDocuments({ clinic, createdAt: { $gte: start, $lt: end } }),
    LabOrder.aggregate([{ $match: { clinic, createdAt: { $gte: start, $lt: end } } }, { $unwind: '$items' }, { $group: { _id: '$items.status', n: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { clinic, createdAt: { $gte: start, $lt: end } } }, { $unwind: '$lines' }, { $match: { 'lines.type': 'medicine' } }, { $group: { _id: null, sales: { $sum: '$lines.total' }, units: { $sum: '$lines.qty' } } }]),
  ]);

  const doctors = await Doctor.find({ _id: { $in: byDoctor.map((d) => d._id) } }).populate('user', 'name');
  const dname = new Map(doctors.map((d) => [String(d._id), d.user?.name]));
  const departments = await Department.find({ _id: { $in: byDepartment.map((d) => d._id).filter(Boolean) } });
  const depname = new Map(departments.map((d) => [String(d._id), d.name]));

  const status = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  const noShowRate = total ? Math.round(((status.no_show ?? 0) / total) * 1000) / 10 : 0;

  res.json({
    range: { from, to },
    appointments: { total, byStatus: status, noShowRate },
    doctorPerformance: byDoctor.map((d) => ({ doctor: d._id, name: dname.get(String(d._id)), total: d.total, completed: d.completed, cancelled: d.cancelled, noShow: d.noShow })),
    departmentPerformance: byDepartment.map((d) => ({ department: d._id, name: depname.get(String(d._id)), total: d.total, completed: d.completed })),
    patientGrowth: growth.map((g) => ({ month: g._id, newPatients: g.newPatients })),
    completedConsultations: consultations,
    laboratoryActivity: Object.fromEntries(labByStatus.map((s) => [s._id, s.n])),
    pharmacySales: { revenue: pharmacy[0]?.sales ?? 0, units: pharmacy[0]?.units ?? 0 },
  });
}));

export default router;
