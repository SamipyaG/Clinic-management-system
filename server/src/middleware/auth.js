import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { can } from '../config/permissions.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { User } from '../models/User.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw unauthorized();
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const authorize = (permission) => (req, _res, next) =>
  can(req.user?.role, permission) ? next() : next(forbidden(`Missing permission ${permission}`));
