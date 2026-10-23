import { Visit } from '../models/Visit.js';
import { nextSeq } from '../models/Counter.js';
import { WaitingQueue, PRIORITY, estimateWaitMinutes } from './queue.js';
import { conflict, notFound } from '../utils/errors.js';
import { dateKey } from '../utils/time.js';

const DEFAULT_AVG_MINUTES = 10;

/** Check a patient in (appointment, walk-in or emergency) and issue a token. */
export const checkIn = async ({ clinic, patient, doctor, appointment, source }) => {
  const date = dateKey(new Date());
  const already = await Visit.findOne({
    patient,
    doctor,
    date,
    status: { $in: ['waiting', 'in_consultation'] },
  });
  if (already) throw conflict('Patient is already checked in for this doctor today');

  const token = await nextSeq(`token:${doctor}:${date}`);
  return Visit.create({
    clinic,
    patient,
    doctor,
    appointment,
    date,
    token,
    source,
    priority: PRIORITY[source] ?? PRIORITY.walkin,
  });
};

/** Waiting list in service order, with position and wait estimate. */
export const getQueue = async (clinic, doctor, avgMinutes = DEFAULT_AVG_MINUTES) => {
  const date = dateKey(new Date());
  const waiting = await Visit.find({ clinic, doctor, date, status: 'waiting' }).populate('patient', 'name patientId');
  const heap = new WaitingQueue();
  waiting.forEach((v) => heap.push({ visit: v, priority: v.priority, arrivedAt: v.checkedInAt.getTime() }));
  return heap.toSortedArray().map(({ visit }, i) => ({
    visit,
    position: i + 1,
    estimatedWaitMinutes: estimateWaitMinutes(i + 1, avgMinutes),
  }));
};

/** Call the next waiting patient for a doctor. */
export const callNext = async (clinic, doctor) => {
  const [next] = await getQueue(clinic, doctor);
  if (!next) throw notFound('No patients waiting');
  const visit = await Visit.findOneAndUpdate(
    { _id: next.visit._id, status: 'waiting' },
    { $set: { status: 'in_consultation', calledAt: new Date() } },
    { new: true },
  );
  if (!visit) throw conflict('Patient was already called');
  return visit;
};

export const completeVisit = async (id, clinic) => {
  const visit = await Visit.findOneAndUpdate(
    { _id: id, clinic, status: 'in_consultation' },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true },
  );
  if (!visit) throw notFound('Visit not found or not in consultation');
  return visit;
};
