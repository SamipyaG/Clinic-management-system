import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { can } from '../config/permissions.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Clinic } from '../models/Clinic.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

/**
 * Branch switching: admins may act inside another clinic via the X-Clinic-Id header.
 * super_admin: any clinic. clinic_admin: only clinics of their own organization. The switch is
 * applied to this request's in-memory user only and is never saved.
 */
const applyClinicSwitch = async (req, user) => {
  const wanted = req.headers['x-clinic-id'];
  if (!wanted || String(user.clinic) === wanted) return;
  if (!['super_admin', 'clinic_admin'].includes(user.role)) throw forbidden('You cannot switch clinics');
  if (!mongoose.isValidObjectId(wanted)) throw forbidden('Invalid clinic');
  const clinic = await Clinic.findById(wanted);
  const sameOrg = clinic?.organization && user.organization && String(clinic.organization) === String(user.organization);
  if (!clinic || (user.role !== 'super_admin' && !sameOrg)) throw forbidden('You do not have access to that clinic');
  user.clinic = clinic._id;
};

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
    await applyClinicSwitch(req, user);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const authorize = (permission) => (req, _res, next) =>
  can(req.user?.role, permission) ? next() : next(forbidden(`Missing permission ${permission}`));
