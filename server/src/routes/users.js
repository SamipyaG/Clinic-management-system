import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { Clinic } from '../models/Clinic.js';
import { AuditLog, audit } from '../models/AuditLog.js';
import { ROLES } from '../config/permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, conflict, forbidden, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const STAFF_ROLES = ROLES.filter((r) => !['super_admin', 'patient'].includes(r));

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(STAFF_ROLES),
  phone: z.string().optional(),
});

// ---------- Staff accounts ----------
router.get('/users', authorize('user:read'), asyncHandler(async (req, res) => {
  res.json(await User.find({ clinic: req.user.clinic, role: { $ne: 'patient' } }).sort('name'));
}));

router.post('/users', authorize('user:manage'), validate(userSchema), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  // Doctors need schedule/department data, so they are created through /doctors.
  if (rest.role === 'doctor') throw conflict('Create doctors through POST /doctors');
  const user = await User.create({ ...rest, clinic: req.user.clinic, organization: req.user.organization, passwordHash: await User.hashPassword(password) });
  audit(req, 'user.create', 'User', user.id, { role: user.role });
  res.status(201).json(user);
}));

router.patch('/users/:id', authorize('user:manage'), validate(z.object({ active: z.boolean().optional(), role: z.enum(STAFF_ROLES).optional(), name: z.string().optional(), phone: z.string().optional() })), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id && req.body.active === false) throw forbidden('You cannot deactivate yourself');
  const user = await User.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic, role: { $ne: 'patient' } }, req.body, { new: true });
  if (!user) throw notFound('User not found');
  audit(req, 'user.update', 'User', user.id, req.body);
  res.json(user);
}));

// ---------- Patient portal accounts ----------
router.post('/patients/:id/portal-account', authorize('patient:update'), validate(z.object({ email: z.string().email(), password: z.string().min(8) })), asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!patient) throw notFound('Patient not found');
  if (patient.user) throw conflict('Patient already has a portal account');
  const user = await User.create({
    clinic: req.user.clinic,
    name: patient.name,
    email: req.body.email,
    role: 'patient',
    passwordHash: await User.hashPassword(req.body.password),
  });
  patient.user = user._id;
  await patient.save();
  audit(req, 'patient.portal_account', 'Patient', patient.id);
  res.status(201).json(user);
}));

// ---------- Clinic settings ----------
router.get('/clinic', authorize('clinic:read'), asyncHandler(async (req, res) => {
  res.json(await Clinic.findById(req.user.clinic));
}));

const clinicSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  phone: z.string(),
  email: z.string().email(),
  currency: z.string().length(3),
  taxPercent: z.number().min(0).max(100),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notificationChannels: z.array(z.enum(['email', 'sms', 'whatsapp', 'in_app'])),
  workingHours: z.object({ start: z.string(), end: z.string() }),
}).partial();

router.patch('/clinic', authorize('clinic:manage'), validate(clinicSchema), asyncHandler(async (req, res) => {
  const clinic = await Clinic.findByIdAndUpdate(req.user.clinic, req.body, { new: true });
  audit(req, 'clinic.update', 'Clinic', clinic.id, { fields: Object.keys(req.body) });
  res.json(clinic);
}));

// ---------- Audit trail ----------
router.get('/audit', authorize('audit:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  for (const key of ['entity', 'entityId', 'action', 'actor']) if (req.query[key]) filter[key] = req.query[key];
  res.json(await AuditLog.find(filter).sort('-createdAt').limit(Math.min(Number(req.query.limit) || 100, 500)).populate('actor', 'name role'));
}));

export default router;
