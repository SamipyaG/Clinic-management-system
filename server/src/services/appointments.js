import { randomUUID } from 'node:crypto';
import { Appointment } from '../models/Appointment.js';
import { getDoctorSlots, slotToDates } from './availability.js';
import { expandRecurrence } from './recurrence.js';
import { conflict, notFound } from '../utils/errors.js';

const TERMINAL = ['completed', 'cancelled', 'no_show', 'rescheduled'];

/** Book one appointment at an exact start time (HH:mm-aligned to an available slot). */
export const bookAppointment = async ({ clinic, patient, doctor, date, startMinutes, ...rest }) => {
  const { doctor: doc, slots } = await getDoctorSlots(doctor, clinic, date);
  const slot = slots.find((s) => s.start === startMinutes);
  if (!slot) throw conflict('Selected time is not available');

  try {
    return await Appointment.create({
      clinic,
      patient,
      doctor: doc._id,
      department: doc.department,
      date,
      ...slotToDates(date, slot),
      ...rest,
    });
  } catch (err) {
    // The unique partial index is the real guard against concurrent double booking.
    if (err.code === 11000) throw conflict('Selected time was just booked by someone else');
    throw err;
  }
};

/** Book a recurring series; conflicting dates are reported, not silently dropped. */
export const bookRecurring = async ({ rule, startDate, startMinutes, ...base }) => {
  const seriesId = randomUUID();
  const booked = [];
  const conflicts = [];
  for (const date of expandRecurrence(startDate, rule)) {
    try {
      booked.push(await bookAppointment({ ...base, date, startMinutes, type: 'recurring', seriesId }));
    } catch (err) {
      if (err.status !== 409) throw err;
      conflicts.push({ date, reason: err.message });
    }
  }
  return { seriesId, booked, conflicts };
};

export const rescheduleAppointment = async (id, clinic, { date, startMinutes }) => {
  const old = await Appointment.findOne({ _id: id, clinic });
  if (!old) throw notFound('Appointment not found');
  if (TERMINAL.includes(old.status)) throw conflict(`Cannot reschedule a ${old.status} appointment`);

  const next = await bookAppointment({
    clinic,
    patient: old.patient,
    doctor: old.doctor,
    date,
    startMinutes,
    type: old.type,
    seriesId: old.seriesId,
    reason: old.reason,
    rescheduledFrom: old._id,
  });
  old.status = 'rescheduled';
  await old.save();
  return next;
};

export const cancelAppointment = async (id, clinic, reason) => {
  const appt = await Appointment.findOne({ _id: id, clinic });
  if (!appt) throw notFound('Appointment not found');
  if (TERMINAL.includes(appt.status)) throw conflict(`Appointment already ${appt.status}`);
  appt.status = 'cancelled';
  appt.cancelReason = reason;
  return appt.save();
};

/** Mark booked/confirmed appointments whose time has passed as no-shows (run by a scheduled job). */
export const markNoShows = (clinic, now = new Date()) =>
  Appointment.updateMany(
    { clinic, status: { $in: ['booked', 'confirmed'] }, end: { $lt: now } },
    { $set: { status: 'no_show' } },
  );

