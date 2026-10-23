// Pure notification logic: message templates, channel selection, reminder times, retry backoff.

export const MAX_ATTEMPTS = 3;
const HOUR = 3_600_000;

const TEMPLATES = {
  appointment_confirmed: (d) => ({
    subject: 'Appointment confirmed',
    body: `Hello ${d.name}, your appointment with Dr ${d.doctor} is booked for ${d.when}.`,
  }),
  appointment_cancelled: (d) => ({
    subject: 'Appointment cancelled',
    body: `Hello ${d.name}, your appointment with Dr ${d.doctor} on ${d.when} has been cancelled.`,
  }),
  appointment_rescheduled: (d) => ({
    subject: 'Appointment rescheduled',
    body: `Hello ${d.name}, your appointment with Dr ${d.doctor} is now on ${d.when}.`,
  }),
  appointment_reminder: (d) => ({
    subject: 'Appointment reminder',
    body: `Reminder: ${d.name}, you have an appointment with Dr ${d.doctor} on ${d.when}.`,
  }),
  followup_reminder: (d) => ({
    subject: 'Follow-up reminder',
    body: `Hello ${d.name}, you are due for a follow-up with Dr ${d.doctor} on ${d.when}. Please book a time.`,
  }),
  payment_received: (d) => ({
    subject: 'Payment received',
    body: `Hello ${d.name}, we received your payment of ${d.amount}. Receipt ${d.receiptNo}.`,
  }),
  lab_report_ready: (d) => ({
    subject: 'Lab report ready',
    body: `Hello ${d.name}, your laboratory report is ready. You can view it in the patient portal.`,
  }),
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export const render = (template, data) => {
  const fn = TEMPLATES[template];
  if (!fn) throw new Error(`Unknown notification template: ${template}`);
  return fn(data);
};

/**
 * Where to send: one entry per enabled channel the patient can actually receive.
 * @param {{email?:string, phone?:string, user?:any}} patient
 * @param {string[]} enabled channels enabled for the clinic
 */
export const channelsFor = (patient, enabled) => {
  const out = [];
  for (const channel of enabled) {
    if (channel === 'email' && patient.email) out.push({ channel, to: patient.email });
    else if ((channel === 'sms' || channel === 'whatsapp') && patient.phone) out.push({ channel, to: patient.phone });
    else if (channel === 'in_app' && patient.user) out.push({ channel, to: String(patient.user) });
  }
  return out;
};

/** Reminder send times (24h and 2h before) that are still in the future. */
export const reminderTimes = (start, now = new Date()) =>
  [24 * HOUR, 2 * HOUR].map((ms) => new Date(start.getTime() - ms)).filter((t) => t > now);

/** Exponential backoff: 1 min, 2 min, 4 min... capped at 1 hour. */
export const retryDelayMs = (attempts) => Math.min(2 ** (attempts - 1) * 60_000, HOUR);
