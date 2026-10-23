import QRCode from 'qrcode';

// QR codes carry only an opaque reference ("CLN:RX:<id>"), never patient data. Scanning one resolves
// it server-side, where the usual login and permission checks apply.
const TYPES = new Set(['PAT', 'APT', 'RX', 'LAB']);

export const encodeRef = (type, ref) => {
  if (!TYPES.has(type)) throw new Error(`Unknown QR type ${type}`);
  return `CLN:${type}:${ref}`;
};

/** @returns {{type:string, ref:string}|null} */
export const decodeRef = (code) => {
  const m = /^CLN:([A-Z]+):([A-Za-z0-9._-]{1,64})$/.exec(String(code ?? '').trim());
  return m && TYPES.has(m[1]) ? { type: m[1], ref: m[2] } : null;
};

export const qrPng = (code, size = 240) => QRCode.toBuffer(code, { type: 'png', width: size, margin: 1, errorCorrectionLevel: 'M' });
