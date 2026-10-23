const BASE = '/api/v1';
const KEY = 'clinic.token';

export const getToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const parse = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};

export const api = async (path, { method = 'GET', body } = {}) => {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parse(res);
  if (res.status === 401 && token && !path.startsWith('/auth/login')) {
    setToken(null);
    window.location.assign('/login');
  }
  if (!res.ok) {
    const detail = data?.details && typeof data.details === 'object' ? Object.entries(data.details).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
    throw new ApiError(res.status, [data?.error ?? res.statusText, detail].filter(Boolean).join(' - '), data?.details);
  }
  return data;
};

/** Fetch an HTML document with the auth header and open it in a new tab (for printable receipts). */
export const openHtml = async (path) => {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Could not load document');
  const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
