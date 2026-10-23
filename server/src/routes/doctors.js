import { Router } from 'express';
import { z } from 'zod';
import { Doctor } from '../models/Doctor.js';
import { User } from '../models/User.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getDoctorSlots } from '../services/availability.js';
import { toHHMM } from '../utils/time.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const scheduleItem = z.object({
  day: z.number().int().min(0).max(6),
  start: hhmm,
  end: hhmm,
  breaks: z.array(z.object({ start: hhmm, end: hhmm })).default([]),
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  department: z.string(),
  qualification: z.string().optional(),
  specialization: z.string().optional(),
  consultationFee: z.number().int().min(0).default(0),
  slotMinutes: z.number().int().min(5).default(15),
  maxDailyAppointments: z.number().int().min(0).default(0),
  schedule: z.array(scheduleItem).default([]),
});

const updateSchema = createSchema
  .omit({ name: true, email: true, password: true })
  .partial()
  .extend({ active: z.boolean().optional() });

router.get('/', authorize('doctor:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic, active: true };
  if (req.query.department) filter.department = req.query.department;
  res.json(await Doctor.find(filter).populate('user', 'name email').populate('department', 'name'));
}));

router.post('/', authorize('doctor:create'), validate(createSchema), asyncHandler(async (req, res) => {
  const { name, email, password, ...profile } = req.body;
  const user = await User.create({
    clinic: req.user.clinic,
    name,
    email,
    phone: profile.phone,
    role: 'doctor',
    passwordHash: await User.hashPassword(password),
  });
  const doctor = await Doctor.create({ ...profile, clinic: req.user.clinic, user: user.id });
  audit(req, 'doctor.create', 'Doctor', doctor.id);
  res.status(201).json(doctor);
}));

router.patch('/:id', authorize('doctor:update'), validate(updateSchema), asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic }, req.body, {
    new: true,
    runValidators: true,
  });
  if (!doctor) throw notFound('Doctor not found');
  audit(req, 'doctor.update', 'Doctor', doctor.id);
  res.json(doctor);
}));

const leaveSchema = z.object({ from: date, to: date, reason: z.string().optional() });

router.post('/:id/leaves', authorize('doctor:update'), validate(leaveSchema), asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOneAndUpdate(
    { _id: req.params.id, clinic: req.user.clinic },
    { $push: { leaves: req.body } },
    { new: true },
  );
  if (!doctor) throw notFound('Doctor not found');
  audit(req, 'doctor.leave', 'Doctor', doctor.id, req.body);
  res.status(201).json(doctor.leaves);
}));

router.get('/:id/slots', authorize('doctor:read'), validate(z.object({ date }), 'query'), asyncHandler(async (req, res) => {
  const { slots } = await getDoctorSlots(req.params.id, req.user.clinic, req.query.date);
  res.json(slots.map((s) => ({ ...s, startTime: toHHMM(s.start), endTime: toHHMM(s.end) })));
}));

export default router;
