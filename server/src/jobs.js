import { Clinic } from './models/Clinic.js';
import { processDue } from './services/notifications.js';
import { markNoShows } from './services/appointments.js';

// Lightweight in-process scheduler. Each task catches its own errors so one failure never stops the others.
const every = (ms, name, fn) => {
  const timer = setInterval(() => fn().catch((err) => console.error(`job ${name} failed:`, err.message)), ms);
  timer.unref();
  return timer;
};

export const startJobs = () => {
  const timers = [
    every(30_000, 'notifications', async () => {
      const stats = await processDue();
      if (stats.sent || stats.failed) console.log('notifications', stats);
    }),
    every(10 * 60_000, 'no-shows', async () => {
      for (const clinic of await Clinic.find().select('_id')) await markNoShows(clinic._id);
    }),
  ];
  return () => timers.forEach(clearInterval);
};
