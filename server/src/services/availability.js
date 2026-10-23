import { Doctor } from '../models/Doctor.js';
import { Clinic } from '../models/Clinic.js';
import { Appointment, ACTIVE_STATUSES } from '../models/Appointment.js';
import { generateSlots } from './slots.js';
import { atMinutes, minutesOfDay, toMinutes, weekdayOf, dateKey } from '../utils/time.js';
import { notFound } from '../utils/errors.js';

/** Load a doctor's free slots for a date, combining schedule, leave, holidays and bookings. */
export const getDoctorSlots = async (doctorId, clinicId, date, { excludeAppointment } = {}) => {
  const doctor = await Doctor.findOne({ _id: doctorId, clinic: clinicId, active: true });
  if (!doctor) throw notFound('Doctor not found');
  const clinic = await Clinic.findById(clinicId);

  const day = weekdayOf(date);
  const windows = doctor.schedule.filter((s) => s.day === day);
  const workWindows = windows.map((s) => [toMinutes(s.start), toMinutes(s.end)]);
  const breaks = windows.flatMap((s) => s.breaks.map((b) => [toMinutes(b.start), toMinutes(b.end)]));

  const query = { doctor: doctor._id, date, status: { $in: ACTIVE_STATUSES } };
  if (excludeAppointment) query._id = { $ne: excludeAppointment };
  const appts = await Appointment.find(query).select('start end');
  const booked = appts.map((a) => [minutesOfDay(a.start), minutesOfDay(a.end)]);

  const now = new Date();
  const nowMinutes = dateKey(now) === date ? minutesOfDay(now) : null;
  if (dateKey(now) > date) return { doctor, slots: [] };

  const slots = generateSlots({
    date,
    workWindows,
    breaks,
    leaves: doctor.leaves,
    holidays: clinic?.holidays ?? [],
    booked,
    slotMinutes: doctor.slotMinutes,
    maxDaily: doctor.maxDailyAppointments,
    nowMinutes,
  });
  return { doctor, slots };
};

export const slotToDates = (date, slot) => ({ start: atMinutes(date, slot.start), end: atMinutes(date, slot.end) });
