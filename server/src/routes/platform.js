import { Router } from 'express';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { Clinic } from '../models/Clinic.js';
import { User } from '../models/User.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { runBackup, listBackups } from '../services/backup.js';
import { systemHealth } from '../services/health.js';
import { asyncHandler, conflict, forbidden, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const requireSuper = (req, _res, next) => (req.user.role === 'super_admin' ? next() : next(forbidden('Platform administrators only')));

// ---------- Clinics a user can switch between ----------
router.get('/clinics', authorize('clinic:read'), asyncHandler(async (req, res) => {
  let filter = { _id: req.user.clinic };
  if (req.user.role === 'super_admin') filter = {};
  else if (req.user.role === 'clinic_admin' && req.user.organization) filter = { organization: req.user.organization };
  res.json(await Clinic.find(filter).sort('name').select('name organization address'));
}));

// A clinic admin adds a branch to their own organization.
const branchSchema = z.object({ name: z.string().min(1), address: z.string().optional(), phone: z.string().optional(), currency: z.string().length(3).optional(), taxPercent: z.number().min(0).max(100).optional() });

router.post('/branches', authorize('branch:create'), validate(branchSchema), asyncHandler(async (req, res) => {
  const organization = req.user.organization;
  if (!organization) throw conflict('This account is not part of an organization');
  const clinic = await Clinic.create({ ...req.body, organization });
  audit(req, 'branch.create', 'Clinic', clinic.id);
  res.status(201).json(clinic);
}));

// ---------- Platform (SaaS) administration ----------
const orgSchema = z.object({
  name: z.string().min(1),
  plan: z.enum(['trial', 'standard', 'enterprise']).default('trial'),
  clinicName: z.string().min(1),
  adminName: z.string().min(1),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

router.get('/organizations', requireSuper, asyncHandler(async (_req, res) => {
  const orgs = await Organization.find().sort('name').lean();
  const counts = await Clinic.aggregate([{ $group: { _id: '$organization', clinics: { $sum: 1 } } }]);
  const byOrg = new Map(counts.map((c) => [String(c._id), c.clinics]));
  res.json(orgs.map((o) => ({ ...o, clinics: byOrg.get(String(o._id)) ?? 0 })));
}));

/** Onboard a new clinic business: organization + first clinic + its admin account. */
router.post('/organizations', requireSuper, validate(orgSchema), asyncHandler(async (req, res) => {
  const { name, plan, clinicName, adminName, adminEmail, adminPassword } = req.body;
  if (await User.exists({ email: adminEmail.toLowerCase() })) throw conflict('That admin email is already in use');
  const organization = await Organization.create({ name, plan });
  const clinic = await Clinic.create({ name: clinicName, organization: organization._id });
  const admin = await User.create({ name: adminName, email: adminEmail, role: 'clinic_admin', clinic: clinic._id, organization: organization._id, passwordHash: await User.hashPassword(adminPassword) });
  audit(req, 'platform.organization.create', 'Organization', organization.id, { clinic: clinic.id });
  res.status(201).json({ organization, clinic, admin });
}));

router.patch('/organizations/:id', requireSuper, validate(z.object({ active: z.boolean().optional(), plan: z.enum(['trial', 'standard', 'enterprise']).optional() })), asyncHandler(async (req, res) => {
  const org = await Organization.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!org) throw notFound('Organization not found');
  audit(req, 'platform.organization.update', 'Organization', org.id, req.body);
  res.json(org);
}));

// ---------- Operations ----------
router.get('/system', authorize('system:read'), asyncHandler(async (_req, res) => {
  res.json(await systemHealth());
}));

router.get('/backups', requireSuper, asyncHandler(async (_req, res) => res.json(await listBackups())));

router.post('/backups', requireSuper, asyncHandler(async (req, res) => {
  const result = await runBackup();
  audit(req, 'system.backup', 'System', undefined, { documents: result.documents, files: result.files });
  res.status(201).json({ ...result, file: result.file.split('/').pop() });
}));

export default router;
