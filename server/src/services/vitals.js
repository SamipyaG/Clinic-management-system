// Vitals helpers: BMI and abnormal-reading flags (adult reference limits).

export const computeBmi = (weightKg, heightCm) => {
  if (!weightKg || !heightCm) return undefined;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
};

const LIMITS = {
  systolic: [90, 140],
  diastolic: [60, 90],
  heartRate: [60, 100],
  temperature: [36.1, 37.5],
  spo2: [95, 100],
  respiratoryRate: [12, 20],
};

/** @returns {Record<string,'low'|'high'>} only the readings outside the adult range */
export const flagVitals = (v) => {
  const readings = {
    systolic: v.bloodPressure?.systolic,
    diastolic: v.bloodPressure?.diastolic,
    heartRate: v.heartRate,
    temperature: v.temperature,
    spo2: v.spo2,
    respiratoryRate: v.respiratoryRate,
  };
  const flags = {};
  for (const [key, value] of Object.entries(readings)) {
    if (value == null) continue;
    const [lo, hi] = LIMITS[key];
    if (value < lo) flags[key] = 'low';
    else if (value > hi) flags[key] = 'high';
  }
  return flags;
};
