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

/** @returns {'low'|'normal'|'high'|'critical_low'|'critical_high'|'unknown'} */
export const flagResult = (value, range) => {
  if (!range || typeof value !== 'number') return 'unknown';
  if (range.criticalLow != null && value <= range.criticalLow) return 'critical_low';
  if (range.criticalHigh != null && value >= range.criticalHigh) return 'critical_high';
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
};
