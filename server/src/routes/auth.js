import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, unauthorized } from '../utils/errors.js';

const router = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
    // Same error for unknown user and wrong password: no account enumeration.
    if (!user || !user.active || !(await user.verifyPassword(req.body.password))) {
      throw unauthorized('Invalid email or password');
    }
    user.lastLoginAt = new Date();
    await user.save();
    req.user = user;
    audit(req, 'auth.login', 'User', user.id);
    res.json({ token: signToken(user), user });
  }),
);

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

export default router;
