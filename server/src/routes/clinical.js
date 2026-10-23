import { Router } from 'express';
import { z } from 'zod';
import { Visit } from '../models/Visit.js';
import { Doctor } from '../models/Doctor.js';
import { Vitals } from '../models/Vitals.js';
import { Consultation } from '../models/Consultation.js';
import { Prescription } from '../models/Prescription.js';
import { Referral } from '../models/Referral.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { computeBmi, flagVitals } from '../services/vitals.js';
import { asyncHandler, forbidden, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

/** Load a visit in the user's clinic; a doctor may only touch their own visits. */
const loadVisit = async (req, { ownDoctorOnly = false } = {}) => {
  const visit = await Visit.findOne({ _id: req.params.visitId, clinic: req.user.clinic });
  if (!visit) throw notFound('Visit not found');
  if (ownDoctorOnly && req.user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: req.user.id });
    if (!doctor || !doctor._id.equals(visit.doctor)) throw forbidden('This visit belongs to another doctor');
  }
  return visit;
};

// ---------- Vitals ----------
const vitalsSchema = z
  .object({
    bloodPressure: z.object({ systolic: z.number().min(40).max(300), diastolic: z.number().min(20).max(200) }).optional(),
    heartRate: z.number().min(20).max(300).optional(),
    temperature: z.number().min(30).max(45).optional(),
    weight: z.number().min(0.5).max(500).optional(),
    height: z.number().min(20).max(260).optional(),
    spo2: z.number().min(50).max(100).optional(),
    respiratoryRate: z.number().min(4).max(80).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one reading');

router.post('/visits/:visitId/vitals', authorize('vitals:write'), validate(vitalsSchema), asyncHandler(async (req, res) => {
  const visit = await loadVisit(req);
  const vitals = await Vitals.create({
    ...req.body,
    clinic: req.user.clinic,
    visit: visit._id,
    patient: visit.patient,
    recordedBy: req.user.id,
    bmi: computeBmi(req.body.weight, req.body.height),
  });
  audit(req, 'vitals.create', 'Vitals', vitals.id);
  res.status(201).json({ vitals, flags: flagVitals(vitals) });
}));

/** Newest first, so the UI can compare the latest reading with earlier ones. */
router.get('/patients/:patientId/vitals', authorize('vitals:read'), asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const items = await Vitals.find({ clinic: req.user.clinic, patient: req.params.patientId }).sort('-createdAt').limit(limit);
  res.json(items.map((v) => ({ vitals: v, flags: flagVitals(v) })));
}));

// ---------- Consultation ----------
const consultationSchema = z.object({
  chiefComplaints: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  diagnosis: z.array(z.string()).optional(),
  treatment: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Create or update (autosave-friendly) the consultation for a visit. */
router.put('/visits/:visitId/consultation', authorize('consultation:write'), validate(consultationSchema), asyncHandler(async (req, res) => {
  const visit = await loadVisit(req, { ownDoctorOnly: true });
  const consultation = await Consultation.findOneAndUpdate(
    { visit: visit._id },
    {
      $set: req.body,
      $setOnInsert: { clinic: req.user.clinic, visit: visit._id, patient: visit.patient, doctor: visit.doctor },
    },
    { new: true, upsert: true, runValidators: true },
  );
  audit(req, 'consultation.save', 'Consultation', consultation.id);
  res.json(consultation);
}));

router.get('/visits/:visitId/consultation', authorize('consultation:read'), asyncHandler(async (req, res) => {
  const visit = await loadVisit(req);
  const consultation = await Consultation.findOne({ visit: visit._id });
  if (!consultation) throw notFound('No consultation yet');
  res.json(consultation);
}));

router.get('/patients/:patientId/consultations', authorize('consultation:read'), asyncHandler(async (req, res) => {
  res.json(await Consultation.find({ clinic: req.user.clinic, patient: req.params.patientId }).sort('-createdAt').limit(50));
}));

// ---------- Prescription ----------
const prescriptionSchema = z.object({
  items: z
    .array(
      z.object({
        medicine: z.string().min(1),
        dosage: z.string().min(1),
        frequency: z.string().min(1),
        duration: z.string().min(1),
        route: z.string().default('oral'),
        quantity: z.number().int().min(1).optional(),
        instructions: z.string().optional(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

router.post('/visits/:visitId/prescriptions', authorize('prescription:write'), validate(prescriptionSchema), asyncHandler(async (req, res) => {
  const visit = await loadVisit(req, { ownDoctorOnly: true });
  const rx = await Prescription.create({
    ...req.body,
    clinic: req.user.clinic,
    visit: visit._id,
    patient: visit.patient,
    doctor: visit.doctor,
  });
  audit(req, 'prescription.create', 'Prescription', rx.id);
  res.status(201).json(rx);
}));

router.get('/patients/:patientId/prescriptions', authorize('prescription:read'), asyncHandler(async (req, res) => {
  res.json(await Prescription.find({ clinic: req.user.clinic, patient: req.params.patientId }).sort('-createdAt').limit(50));
}));

router.get('/prescriptions/:id', authorize('prescription:read'), asyncHandler(async (req, res) => {
  const rx = await Prescription.findOne({ _id: req.params.id, clinic: req.user.clinic })
    .populate('patient', 'name patientId allergies')
    .populate({ path: 'doctor', populate: { path: 'user', select: 'name' } });
  if (!rx) throw notFound('Prescription not found');
  res.json(rx);
}));

router.post('/prescriptions/:id/cancel', authorize('prescription:write'), asyncHandler(async (req, res) => {
  const rx = await Prescription.findOneAndUpdate(
    { _id: req.params.id, clinic: req.user.clinic, status: 'issued' },
    { status: 'cancelled' },
    { new: true },
  );
  if (!rx) throw notFound('Issued prescription not found');
  audit(req, 'prescription.cancel', 'Prescription', rx.id);
  res.json(rx);
}));

// ---------- Referral ----------
const referralSchema = z
  .object({
    toDoctor: z.string().optional(),
    externalFacility: z.string().optional(),
    reason: z.string().min(1),
    notes: z.string().optional(),
  })
  .refine((r) => r.toDoctor || r.externalFacility, 'Provide toDoctor or externalFacility');

router.post('/visits/:visitId/referrals', authorize('referral:write'), validate(referralSchema), asyncHandler(async (req, res) => {
  const visit = await loadVisit(req, { ownDoctorOnly: true });
  const referral = await Referral.create({
    ...req.body,
    clinic: req.user.clinic,
    visit: visit._id,
    patient: visit.patient,
    fromDoctor: visit.doctor,
  });
  audit(req, 'referral.create', 'Referral', referral.id);
  res.status(201).json(referral);
}));

router.get('/patients/:patientId/referrals', authorize('referral:read'), asyncHandler(async (req, res) => {
  res.json(await Referral.find({ clinic: req.user.clinic, patient: req.params.patientId }).sort('-createdAt'));
}));

export default router;
