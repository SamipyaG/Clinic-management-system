import { Router } from 'express';
import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { audit } from '../models/AuditLog.js';
import { Visit } from '../models/Visit.js';
import { dateKey } from '../utils/time.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { callNext, checkIn, completeVisit, displayState, getQueue } from '../services/queueService.js';
import { emitClinic, emitDisplay } from '../services/realtime.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

/** Tell staff screens and the public display that a doctor's queue changed. */
const broadcast = async (clinic, doctor) => {
  emitClinic(clinic, 'queue:updated', { doctor: String(doctor) });
  emitDisplay(clinic, 'queue:display', await displayState(clinic, doctor));
};

const checkInSchema = z.object({
  patient: z.string(),
  doctor: z.string(),
  appointment: z.string().optional(), // omit for walk-in
  emergency: z.boolean().default(false),
});

router.post('/check-in', authorize('queue:create'), validate(checkInSchema), asyncHandler(async (req, res) => {
  const { appointment, emergency, ...rest } = req.body;
  const source = emergency ? 'emergency' : appointment ? 'appointment' : 'walkin';

  if (appointment) {
    const appt = await Appointment.findOneAndUpdate(
      { _id: appointment, clinic: req.user.clinic, status: { $in: ['booked', 'confirmed'] } },
      { status: 'checked_in' },
      { new: true },
    );
    if (!appt) throw notFound('Active appointment not found');
  }
  const visit = await checkIn({ ...rest, appointment, clinic: req.user.clinic, source });
  audit(req, 'queue.check_in', 'Visit', visit.id, { source });
  await broadcast(req.user.clinic, visit.doctor);
  res.status(201).json(visit);
}));

/** Everything checked in today across doctors (nurse and reception boards). */
router.get('/today', authorize('queue:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic, date: dateKey(new Date()) };
  if (req.query.status) filter.status = req.query.status;
  res.json(
    await Visit.find(filter)
      .sort('checkedInAt')
      .populate('patient', 'name patientId allergies bloodGroup')
      .populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }),
  );
}));

router.get('/visits/:id', authorize('queue:read'), asyncHandler(async (req, res) => {
  const visit = await Visit.findOne({ _id: req.params.id, clinic: req.user.clinic })
    .populate('patient', 'name patientId allergies bloodGroup medicalHistory dob gender phone')
    .populate({ path: 'doctor', populate: { path: 'user', select: 'name' } });
  if (!visit) throw notFound('Visit not found');
  res.json(visit);
}));

router.get('/doctor/:doctorId', authorize('queue:read'), asyncHandler(async (req, res) => {
  res.json(await getQueue(req.user.clinic, req.params.doctorId));
}));

router.post('/doctor/:doctorId/call-next', authorize('queue:update'), asyncHandler(async (req, res) => {
  const visit = await callNext(req.user.clinic, req.params.doctorId);
  audit(req, 'queue.call_next', 'Visit', visit.id);
  await broadcast(req.user.clinic, visit.doctor);
  res.json(visit);
}));

router.post('/visits/:id/complete', authorize('queue:update'), asyncHandler(async (req, res) => {
  const visit = await completeVisit(req.params.id, req.user.clinic);
  if (visit.appointment) {
    await Appointment.updateOne({ _id: visit.appointment }, { status: 'completed' });
  }
  audit(req, 'queue.complete', 'Visit', visit.id);
  await broadcast(req.user.clinic, visit.doctor);
  res.json(visit);
}));

export default router;
