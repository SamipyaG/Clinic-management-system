import { Router } from 'express';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Prescription } from '../models/Prescription.js';
import { LabOrder } from '../models/Lab.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { decodeRef, encodeRef, qrPng } from '../services/qr.js';
import { can } from '../config/permissions.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

/** QR image for a patient card: encodes the patient ID reference only. */
router.get('/patients/:id/qr.png', authorize('patient:read'), asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!patient) throw notFound('Patient not found');
  res.type('png').set('Cache-Control', 'private, max-age=3600').send(await qrPng(encodeRef('PAT', patient.patientId)));
}));

router.get('/appointments/:id/qr.png', authorize('appointment:read'), asyncHandler(async (req, res) => {
  if (!(await Appointment.exists({ _id: req.params.id, clinic: req.user.clinic }))) throw notFound('Appointment not found');
  res.type('png').send(await qrPng(encodeRef('APT', req.params.id)));
}));

/** Resolve a scanned code to the record it points to, within the user's own clinic. */
router.get('/resolve', asyncHandler(async (req, res) => {
  const decoded = decodeRef(req.query.code);
  if (!decoded) throw badRequest('Not a valid clinic QR code');
  const clinic = req.user.clinic;
  const need = (permission) => authorizeInline(req, permission);

  let result;
  if (decoded.type === 'PAT') {
    need('patient:read');
    const p = await Patient.findOne({ clinic, patientId: decoded.ref });
    if (p) result = { type: 'patient', id: p.id, label: `${p.name} (${p.patientId})`, patient: p.id, path: `/patients/${p.id}` };
  } else if (decoded.type === 'APT') {
    need('appointment:read');
    const a = await Appointment.findOne({ _id: decoded.ref, clinic }).populate('patient', 'name patientId');
    if (a) result = { type: 'appointment', id: a.id, label: `${a.patient?.name} · ${a.start.toISOString()}`, patient: a.patient?.id, status: a.status, path: '/appointments' };
  } else if (decoded.type === 'RX') {
    need('prescription:read');
    const r = await Prescription.findOne({ _id: decoded.ref, clinic }).populate('patient', 'name patientId');
    if (r) result = { type: 'prescription', id: r.id, label: `Prescription for ${r.patient?.name}`, patient: r.patient?.id, status: r.status, path: '/pharmacy' };
  } else if (decoded.type === 'LAB') {
    need('lab:read');
    const l = await LabOrder.findOne({ _id: decoded.ref, clinic }).populate('patient', 'name patientId');
    if (l) result = { type: 'lab_order', id: l.id, label: `Lab order for ${l.patient?.name}`, patient: l.patient?.id, status: l.status, path: '/lab' };
  }
  if (!result) throw notFound('Nothing found for this code');
  audit(req, 'qr.resolve', result.type, result.id);
  res.json(result);
}));

function authorizeInline(req, permission) {
  if (!can(req.user.role, permission)) throw forbidden(`Missing permission ${permission}`);
}

export default router;
