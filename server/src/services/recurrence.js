import { addDays } from '../utils/time.js';

/**
 * Expand a recurrence rule into dates.
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {{everyDays:number, count?:number, until?:string}} rule
 */
export const expandRecurrence = (startDate, { everyDays, count, until }) => {
  if (!everyDays || everyDays < 1) throw new Error('everyDays must be >= 1');
  if (!count && !until) throw new Error('Provide count or until');

  const max = 366;
  const dates = [];
  for (let d = startDate; dates.length < max; d = addDays(d, everyDays)) {
    if (until && d > until) break;
    if (count && dates.length >= count) break;
    dates.push(d);
  }
  return dates;
};
