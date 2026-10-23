export const money = (minor = 0, currency = '') => `${currency ? `${currency} ` : ''}${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const toMinor = (major) => Math.round(Number(major) * 100);
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '');

export const todayStr = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const label = (s = '') => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
