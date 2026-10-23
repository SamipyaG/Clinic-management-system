import { Router } from 'express';
import { Notification } from '../models/Notification.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

// In-app inbox of the signed-in user (staff or patient).
router.get('/', asyncHandler(async (req, res) => {
  const filter = { user: req.user.id, channel: 'in_app', status: 'sent' };
  if (req.query.unread === 'true') filter.readAt = null;
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort('-createdAt').limit(50),
    Notification.countDocuments({ user: req.user.id, channel: 'in_app', status: 'sent', readAt: null }),
  ]);
  res.json({ items, unread });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { readAt: new Date() }, { new: true });
  if (!n) throw notFound('Notification not found');
  res.json(n);
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const r = await Notification.updateMany({ user: req.user.id, channel: 'in_app', readAt: null }, { readAt: new Date() });
  res.json({ updated: r.modifiedCount });
}));

// Delivery log for admins: what was sent, what failed.
router.get('/log', authorize('notification:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  for (const key of ['status', 'channel', 'template']) if (req.query[key]) filter[key] = req.query[key];
  res.json(await Notification.find(filter).sort('-createdAt').limit(200));
}));

export default router;
