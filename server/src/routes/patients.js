import { Router } from 'express';
import { z } from 'zod';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Visit } from '../models/Visit.js';
import { nextSeq } from '../models/Counter.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1),
  dob: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string().min(5),
  email: z.string().email().optional(),
  address: z.string().optional(),
  emergencyContact: z.object({ name: z.string(), relation: z.string().optional(), phone: z.string() }).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.array(z.string()).default([]),
  medicalHistory: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

/** P-YYMM-00001, sequence reset monthly per clinic. */
const generatePatientId = async (clinic) => {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = await nextSeq(`patient:${clinic}:${yymm}`);
  return `P-${yymm}-${String(seq).padStart(5, '0')}`;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', authorize('patient:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q)), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { patientId: rx }];
  }
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [items, total] = await Promise.all([
    Patient.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    Patient.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
}));

router.post('/', authorize('patient:create'), validate(createSchema), asyncHandler(async (req, res) => {
  const patient = await Patient.create({
    ...req.body,
    clinic: req.user.clinic,
    patientId: await generatePatientId(req.user.clinic),
  });
  audit(req, 'patient.create', 'Patient', patient.id);
  res.status(201).json(patient);
}));

router.get('/:id', authorize('patient:read'), asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!patient) throw notFound('Patient not found');
  res.json(patient);
}));

router.patch('/:id', authorize('patient:update'), validate(createSchema.partial()), asyncHandler(async (req, res) => {
  const patient = await Patient.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic }, req.body, {
    new: true,
    runValidators: true,
  });
  if (!patient) throw notFound('Patient not found');
  audit(req, 'patient.update', 'Patient', patient.id, { fields: Object.keys(req.body) });
  res.json(patient);
}));

/** Chronological history: appointments and visits merged by time (more sources join in later phases). */
router.get('/:id/timeline', authorize('patient:read'), asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!patient) throw notFound('Patient not found');
  const [appointments, visits] = await Promise.all([
    Appointment.find({ patient: patient._id }).lean(),
    Visit.find({ patient: patient._id }).lean(),
  ]);
  const events = [
    ...appointments.map((a) => ({ type: 'appointment', at: a.start, status: a.status, ref: a._id })),
    ...visits.map((v) => ({ type: 'visit', at: v.checkedInAt, status: v.status, ref: v._id })),
  ].sort((a, b) => b.at - a.at);
  res.json(events);
}));

export default router;
