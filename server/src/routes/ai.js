import { Router } from 'express';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { aiEnabled, summarisePatient } from '../services/aiSummary.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

router.get('/status', authorize('ai:use'), (_req, res) => res.json({ provider: aiEnabled() ? 'anthropic' : 'rules', model: aiEnabled() ? env.aiModel : null }));

// Assistive only: the summary is generated from the chart and must be checked by the clinician.
router.post('/patient-summary/:patientId', authorize('ai:use'), asyncHandler(async (req, res) => {
  const result = await summarisePatient(req.params.patientId, req.user.clinic);
  audit(req, 'ai.patient_summary', 'Patient', req.params.patientId, { source: result.source });
  res.json({ ...result, disclaimer: 'Generated from the recorded chart. Verify before clinical use.' });
}));

export default router;
