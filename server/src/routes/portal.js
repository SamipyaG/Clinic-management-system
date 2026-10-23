import { Router } from 'express';
import { z } from 'zod';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Visit } from '../models/Visit.js';
import { Consultation } from '../models/Consultation.js';
import { Prescription } from '../models/Prescription.js';
import { LabOrder } from '../models/Lab.js';
import { Invoice, Payment } from '../models/Billing.js';
import { audit } from '../models/AuditLog.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bookAppointment, cancelAppointment } from '../services/appointments.js';
import { getDoctorSlots } from '../services/availability.js';
import { cancelPending, notifyAppointment, onAppointmentBooked } from '../services/notifications.js';
import { emitClinic } from '../services/realtime.js';
import { toHHMM, toMinutes } from '../utils/time.js';
import { asyncHandler, forbidden, notFound } from '../utils/errors.js';

// Patient self-service. Every query is pinned to the patient linked to the signed-in account,
// so one patient can never read another's records.
const router = Router();
router.use(authenticate, async (req, _res, next) => {
  try {
    if (req.user.role !== 'patient') throw forbidden('Patient portal only');
    req.patient = await Patient.findOne({ user: req.user.id });
    if (!req.patient) throw notFound('No patient record linked to this account');
    next();
  } catch (err) {
    next(err);
  }
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get('/me', (req, res) => res.json(req.patient));

router.get('/appointments', asyncHandler(async (req, res) => {
  res.json(
    await Appointment.find({ patient: req.patient._id })
      .sort('-start')
      .limit(100)
      .populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }),
  );
}));

router.get('/doctors/:id/slots', asyncHandler(async (req, res) => {
  const { slots } = await getDoctorSlots(req.params.id, req.patient.clinic, date.parse(req.query.date));
  res.json(slots.map((s) => ({ ...s, startTime: toHHMM(s.start), endTime: toHHMM(s.end) })));
}));

router.post('/appointments', validate(z.object({ doctor: z.string(), date, time: hhmm, reason: z.string().optional() })), asyncHandler(async (req, res) => {
  const appt = await bookAppointment({
    clinic: req.patient.clinic,
    patient: req.patient._id,
    doctor: req.body.doctor,
    date: req.body.date,
    startMinutes: toMinutes(req.body.time),
    reason: req.body.reason,
  });
  audit(req, 'portal.appointment.create', 'Appointment', appt.id);
  await onAppointmentBooked(appt);
  emitClinic(req.patient.clinic, 'appointment:changed', { action: 'created', id: appt.id });
  res.status(201).json(appt);
}));

router.post('/appointments/:id/cancel', asyncHandler(async (req, res) => {
  const own = await Appointment.exists({ _id: req.params.id, patient: req.patient._id });
  if (!own) throw notFound('Appointment not found');
  const appt = await cancelAppointment(req.params.id, req.patient.clinic, 'Cancelled by patient');
  audit(req, 'portal.appointment.cancel', 'Appointment', appt.id);
  await cancelPending(appt.id);
  await notifyAppointment(appt, 'appointment_cancelled');
  emitClinic(req.patient.clinic, 'appointment:changed', { action: 'cancelled', id: appt.id });
  res.json(appt);
}));

router.get('/prescriptions', asyncHandler(async (req, res) => {
  res.json(await Prescription.find({ patient: req.patient._id, status: { $ne: 'cancelled' } }).sort('-createdAt').limit(50));
}));

// Only doctor-reviewed lab reports are visible to the patient.
router.get('/lab-reports', asyncHandler(async (req, res) => {
  res.json(await LabOrder.find({ patient: req.patient._id, status: 'reviewed' }).sort('-createdAt').limit(50));
}));

router.get('/history', asyncHandler(async (req, res) => {
  res.json({
    medicalHistory: req.patient.medicalHistory,
    allergies: req.patient.allergies,
    consultations: await Consultation.find({ patient: req.patient._id }).sort('-createdAt').limit(50).select('-doctor -clinic'),
  });
}));

router.get('/invoices', asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({ patient: req.patient._id }).sort('-createdAt').limit(50);
  const payments = await Payment.find({ invoice: { $in: invoices.map((i) => i._id) } }).sort('-createdAt');
  res.json({ invoices, payments });
}));

router.get('/timeline', asyncHandler(async (req, res) => {
  const [appointments, visits, prescriptions, labs, invoices] = await Promise.all([
    Appointment.find({ patient: req.patient._id }).lean(),
    Visit.find({ patient: req.patient._id }).lean(),
    Prescription.find({ patient: req.patient._id }).lean(),
    LabOrder.find({ patient: req.patient._id, status: 'reviewed' }).lean(),
    Invoice.find({ patient: req.patient._id }).lean(),
  ]);
  const events = [
    ...appointments.map((a) => ({ type: 'appointment', at: a.start, status: a.status, ref: a._id })),
    ...visits.map((v) => ({ type: 'visit', at: v.checkedInAt, status: v.status, ref: v._id })),
    ...prescriptions.map((p) => ({ type: 'prescription', at: p.createdAt, status: p.status, ref: p._id })),
    ...labs.map((l) => ({ type: 'lab_report', at: l.reviewedAt ?? l.createdAt, status: l.status, ref: l._id })),
    ...invoices.map((i) => ({ type: 'invoice', at: i.createdAt, status: i.status, ref: i._id })),
  ].sort((a, b) => b.at - a.at);
  res.json(events);
}));

export default router;
