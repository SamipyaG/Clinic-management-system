// Lab reference-range selection and result flagging.

/**
 * Pick the reference range matching patient age and gender.
 * Ranges may omit gender ('any') or age bounds.
 */
export const pickRange = (ranges, { age, gender }) =>
  ranges.find(
    (r) =>
      (!r.gender || r.gender === 'any' || r.gender === gender) &&
      (r.ageMin == null || age >= r.ageMin) &&
      (r.ageMax == null || age <= r.ageMax),
  ) ?? null;

export const ageInYears = (dob, now = new Date()) => {
  if (!dob) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const birthdayPassed =
    now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!birthdayPassed) age -= 1;
  return age;
};

/** Order status derived from its items: ordered → in_progress → completed (reviewed is set by a doctor). */
export const deriveOrderStatus = (itemStatuses) => {
  if (itemStatuses.every((s) => s === 'resulted')) return 'completed';
  if (itemStatuses.every((s) => s === 'ordered')) return 'ordered';
  return 'in_progress';
};

/** @returns {'low'|'normal'|'high'|'critical_low'|'critical_high'|'unknown'} */
export const flagResult = (value, range) => {
  if (!range || typeof value !== 'number') return 'unknown';
  if (range.criticalLow != null && value <= range.criticalLow) return 'critical_low';
  if (range.criticalHigh != null && value >= range.criticalHigh) return 'critical_high';
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
};
