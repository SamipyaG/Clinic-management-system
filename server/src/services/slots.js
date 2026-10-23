// Smart doctor scheduling: pure functions, minutes-since-midnight intervals [start, end).

/** Subtract `busy` intervals from `free` intervals. Both may be unsorted. */
export const subtractIntervals = (free, busy) => {
  const sortedBusy = [...busy].sort((a, b) => a[0] - b[0]);
  let result = [...free].sort((a, b) => a[0] - b[0]);
  for (const [bs, be] of sortedBusy) {
    const next = [];
    for (const [fs, fe] of result) {
      if (be <= fs || bs >= fe) {
        next.push([fs, fe]);
        continue;
      }
      if (bs > fs) next.push([fs, bs]);
      if (be < fe) next.push([be, fe]);
    }
    result = next;
  }
  return result;
};

const inRange = (date, from, to) => date >= from && date <= to;

/**
 * Generate bookable slots for one doctor on one date.
 * @param {object} p
 * @param {string} p.date               'YYYY-MM-DD'
 * @param {Array}  p.workWindows        [[startMin, endMin], ...] for that weekday
 * @param {Array}  p.breaks             [[startMin, endMin], ...]
 * @param {Array}  p.leaves             [{from, to}] date strings, inclusive
 * @param {Array}  p.holidays           ['YYYY-MM-DD', ...]
 * @param {Array}  p.booked             [[startMin, endMin], ...] active appointments
 * @param {number} p.slotMinutes
 * @param {number} p.maxDaily           max appointments per day (0/undefined = unlimited)
 * @param {number} [p.nowMinutes]       if date is today, drop slots starting before this
 */
export const generateSlots = ({
  date,
  workWindows,
  breaks = [],
  leaves = [],
  holidays = [],
  booked = [],
  slotMinutes,
  maxDaily = 0,
  nowMinutes = null,
}) => {
  if (holidays.includes(date)) return [];
  if (leaves.some((l) => inRange(date, l.from, l.to))) return [];
  if (maxDaily > 0 && booked.length >= maxDaily) return [];

  let free = subtractIntervals(workWindows, breaks);
  free = subtractIntervals(free, booked);

  const slots = [];
  for (const [fs, fe] of free) {
    for (let s = fs; s + slotMinutes <= fe; s += slotMinutes) {
      if (nowMinutes !== null && s < nowMinutes) continue;
      slots.push({ start: s, end: s + slotMinutes });
    }
  }

  if (maxDaily > 0) return slots.slice(0, maxDaily - booked.length);
  return slots;
};
