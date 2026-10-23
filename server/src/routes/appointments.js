import { Router } from 'express';
import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  bookAppointment,
  bookRecurring,
  cancelAppointment,
  rescheduleAppointment,
} from '../services/appointments.js';
import { toMinutes } from '../utils/time.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bookSchema = z.object({
  patient: z.string(),
  doctor: z.string(),
  date,
  time: hhmm,
  type: z.enum(['new', 'followup']).default('new'),
  followUpOf: z.string().optional(),
  reason: z.string().optional(),
  recurrence: z
    .object({ everyDays: z.number().int().min(1), count: z.number().int().min(2).max(52).optional(), until: date.optional() })
    .refine((r) => r.count || r.until, 'Provide count or until')
    .optional(),
});

router.get('/', authorize('appointment:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  for (const key of ['date', 'doctor', 'patient', 'status']) {
    if (req.query[key]) filter[key] = req.query[key];
  }
  res.json(
    await Appointment.find(filter)
      .sort('start')
      .populate('patient', 'name patientId phone')
      .populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }),
  );
}));

router.post('/', authorize('appointment:create'), validate(bookSchema), asyncHandler(async (req, res) => {
  const { time, recurrence, date: day, ...rest } = req.body;
  const base = { ...rest, clinic: req.user.clinic, startMinutes: toMinutes(time) };

  if (recurrence) {
    const result = await bookRecurring({ ...base, startDate: day, rule: recurrence });
    audit(req, 'appointment.create_series', 'Appointment', result.seriesId, { count: result.booked.length });
    return res.status(201).json(result);
  }
  const appt = await bookAppointment({ ...base, date: day });
  audit(req, 'appointment.create', 'Appointment', appt.id);
  res.status(201).json(appt);
}));

router.post(
  '/:id/reschedule',
  authorize('appointment:update'),
  validate(z.object({ date, time: hhmm })),
  asyncHandler(async (req, res) => {
    const appt = await rescheduleAppointment(req.params.id, req.user.clinic, {
      date: req.body.date,
      startMinutes: toMinutes(req.body.time),
    });
    audit(req, 'appointment.reschedule', 'Appointment', appt.id, { from: req.params.id });
    res.json(appt);
  }),
);

router.post(
  '/:id/cancel',
  authorize('appointment:update'),
  validate(z.object({ reason: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const appt = await cancelAppointment(req.params.id, req.user.clinic, req.body.reason);
    audit(req, 'appointment.cancel', 'Appointment', appt.id);
    res.json(appt);
  }),
);

router.post('/:id/confirm', authorize('appointment:update'), asyncHandler(async (req, res) => {
  const appt = await Appointment.findOneAndUpdate(
    { _id: req.params.id, clinic: req.user.clinic, status: 'booked' },
    { status: 'confirmed' },
    { new: true },
  );
  if (!appt) throw notFound('Booked appointment not found');
  audit(req, 'appointment.confirm', 'Appointment', appt.id);
  res.json(appt);
}));

export default router;
