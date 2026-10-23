const BASE = '/api/v1';
const KEY = 'clinic.token';
const CLINIC_KEY = 'clinic.active';

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

/** Admins can work inside another branch; the choice is sent with every request. */
export const getActiveClinic = () => {
  try {
    return localStorage.getItem(CLINIC_KEY);
  } catch {
    return null;
  }
};
export const setActiveClinic = (id) => {
  try {
    if (id) localStorage.setItem(CLINIC_KEY, id);
    else localStorage.removeItem(CLINIC_KEY);
  } catch {
    /* ignore */
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

const authHeaders = (extra = {}) => {
  const token = getToken();
  const clinic = getActiveClinic();
  return { ...extra, ...(token && { authorization: `Bearer ${token}` }), ...(clinic && { 'x-clinic-id': clinic }) };
};

export const api = async (path, { method = 'GET', body } = {}) => {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders({ ...(body && { 'content-type': 'application/json' }) }),
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
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, 'Could not load document');
  const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const fetchBlob = async (path) => {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, (await parse(res))?.error ?? 'Could not load file');
  return res.blob();
};

/** Open a PDF (or any file the browser can show) in a new tab using the signed-in session. */
export const openFile = async (path) => {
  const url = URL.createObjectURL(await fetchBlob(path));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** Save a file to disk under the given name. */
export const downloadFile = async (path, filename) => {
  const url = URL.createObjectURL(await fetchBlob(path));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Object URL for showing an image behind authentication (e.g. a QR code). Caller revokes it. */
export const imageUrl = async (path) => URL.createObjectURL(await fetchBlob(path));

/** Upload raw file bytes; details travel in the query string. */
export const uploadFile = async (path, file) => {
  const res = await fetch(BASE + path, { method: 'POST', headers: authHeaders({ 'content-type': 'application/octet-stream' }), body: file });
  const data = await parse(res);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  return data;
};
