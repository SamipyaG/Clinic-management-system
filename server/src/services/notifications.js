import { Notification } from '../models/Notification.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { Clinic } from '../models/Clinic.js';
import { MAX_ATTEMPTS, channelsFor, reminderTimes, render, retryDelayMs } from './notifyCore.js';
import { deliver } from './providers.js';
import { emitUser } from './realtime.js';

const DEFAULT_CHANNELS = ['email', 'sms', 'in_app'];

const markSent = async (n) => {
  n.status = 'sent';
  n.sentAt = new Date();
  await n.save();
  if (n.channel === 'in_app' && n.user) emitUser(n.user, 'notification:new', { id: n.id, subject: n.subject, body: n.body });
};

/** Queue a message on every channel the patient can receive. In-app messages that are due go out at once. */
export const enqueue = async ({ clinic, patient, template, data, ref, sendAt = new Date() }) => {
  const clinicDoc = await Clinic.findById(clinic).select('notificationChannels');
  const enabled = clinicDoc?.notificationChannels?.length ? clinicDoc.notificationChannels : DEFAULT_CHANNELS;
  const { subject, body } = render(template, { name: patient.name, ...data });

  const created = [];
  for (const { channel, to } of channelsFor(patient, enabled)) {
    const n = await Notification.create({
      clinic,
      patient: patient._id,
      user: channel === 'in_app' ? patient.user : undefined,
      channel,
      template,
      to,
      subject,
      body,
      ref,
      sendAt,
    });
    if (channel === 'in_app' && sendAt <= new Date()) await markSent(n);
    created.push(n);
  }
  return created;
};

const fmt = (d) => d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Appointment-related message; never throws, because a notification problem must not fail a booking. */
export const notifyAppointment = async (appt, template, { sendAt } = {}) => {
  try {
    const [patient, doctor] = await Promise.all([
      Patient.findById(appt.patient),
      Doctor.findById(appt.doctor).populate('user', 'name'),
    ]);
    if (!patient) return [];
    return await enqueue({
      clinic: appt.clinic,
      patient,
      template,
      data: { doctor: doctor?.user?.name ?? 'your doctor', when: fmt(appt.start) },
      ref: String(appt._id),
      sendAt,
    });
  } catch (err) {
    console.error('notify failed', err.message);
    return [];
  }
};

/** Confirmation now plus 24h and 2h reminders. */
export const scheduleReminders = async (appt) => {
  for (const sendAt of reminderTimes(appt.start)) await notifyAppointment(appt, 'appointment_reminder', { sendAt });
};

export const onAppointmentBooked = async (appt) => {
  await notifyAppointment(appt, 'appointment_confirmed');
  await scheduleReminders(appt);
};

/** Reminder for a follow-up date: 09:00 the day before, if that is still ahead. */
export const scheduleFollowUp = async (consultation) => {
  const ref = `followup:${consultation._id}`;
  await cancelPending(ref, 'followup_reminder');
  if (!consultation.followUpDate) return;
  const sendAt = new Date(`${consultation.followUpDate}T09:00:00`);
  sendAt.setDate(sendAt.getDate() - 1);
  if (sendAt <= new Date()) return;
  try {
    const [patient, doctor] = await Promise.all([
      Patient.findById(consultation.patient),
      Doctor.findById(consultation.doctor).populate('user', 'name'),
    ]);
    if (patient) {
      await enqueue({
        clinic: consultation.clinic,
        patient,
        template: 'followup_reminder',
        data: { doctor: doctor?.user?.name ?? 'your doctor', when: consultation.followUpDate },
        ref,
        sendAt,
      });
    }
  } catch (err) {
    console.error('follow-up reminder failed', err.message);
  }
};

/** Drop reminders that have not been sent yet (cancel / reschedule). */
export const cancelPending = (ref, template = 'appointment_reminder') =>
  Notification.updateMany({ ref: String(ref), status: 'pending', template }, { status: 'cancelled' });

export const notifyPatient = async (clinic, patientId, template, data, ref) => {
  try {
    const patient = await Patient.findById(patientId);
    if (patient) await enqueue({ clinic, patient, template, data, ref });
  } catch (err) {
    console.error('notify failed', err.message);
  }
};

/** Worker: send everything that is due. Claims each row atomically so two workers never double-send. */
export const processDue = async (now = new Date(), limit = 100) => {
  const stats = { sent: 0, retried: 0, failed: 0 };
  for (let i = 0; i < limit; i += 1) {
    const n = await Notification.findOneAndUpdate(
      { status: 'pending', sendAt: { $lte: now } },
      { $set: { status: 'sending' }, $inc: { attempts: 1 } },
      { new: true, sort: { sendAt: 1 } },
    );
    if (!n) break;
    try {
      await deliver(n);
      await markSent(n);
      stats.sent += 1;
    } catch (err) {
      n.error = err.message;
      if (n.attempts >= MAX_ATTEMPTS) {
        n.status = 'failed';
        stats.failed += 1;
      } else {
        n.status = 'pending';
        n.sendAt = new Date(now.getTime() + retryDelayMs(n.attempts));
        stats.retried += 1;
      }
      await n.save();
    }
  }
  return stats;
};
