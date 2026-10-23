import { HttpError } from '../utils/errors.js';

export const notFoundHandler = (_req, _res, next) => next(new HttpError(404, 'Route not found'));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', details: err.keyValue });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'File or request body is too large' });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  }
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
