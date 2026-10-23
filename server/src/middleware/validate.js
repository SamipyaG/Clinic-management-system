import { badRequest } from '../utils/errors.js';

/** Validate req[source] with a zod schema and replace it with the parsed value. */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(badRequest('Validation failed', result.error.flatten().fieldErrors));
    }
    req[source] = result.data;
    next();
  };
