// All scheduling math uses integer minutes since midnight; dates are 'YYYY-MM-DD'.

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes();

export const dateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const atMinutes = (dateStr, min) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMinutes(min);
  return d;
};

export const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00`).getDay(); // 0 = Sunday

export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
