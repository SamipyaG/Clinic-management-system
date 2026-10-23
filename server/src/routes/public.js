import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Doctor } from '../models/Doctor.js';
import { displayState } from '../services/queueService.js';
import { asyncHandler } from '../utils/errors.js';

// Unauthenticated waiting-room screen: token numbers and doctor names only, never patient data.
const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 120 }));

router.get('/queue-display/:clinicId', asyncHandler(async (req, res) => {
  const doctors = await Doctor.find({ clinic: req.params.clinicId, active: true }).populate('user', 'name');
  const boards = await Promise.all(
    doctors.map(async (d) => ({ ...(await displayState(d.clinic, d._id)), name: d.user?.name })),
  );
  res.json(boards);
}));

export default router;
