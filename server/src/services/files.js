// File-type detection from magic bytes (never trust the client's content-type or file name).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** @returns {{mime:string, ext:string}|null} null when the type is not allowed */
export const detectFile = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const hit = SIGNATURES.find((s) => s.test(buffer));
  if (hit) return { mime: hit.mime, ext: hit.ext };
  // Plain text notes: valid UTF-8 without NUL bytes.
  if (!buffer.includes(0)) {
    const text = buffer.toString('utf8');
    if (!text.includes('�')) return { mime: 'text/plain', ext: 'txt' };
  }
  return null;
};

/** Display name only: strip any path, control characters and overlong names. */
export const safeName = (name = 'document') => {
  const base = String(name).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (base || 'document').slice(0, 120);
};
