import { Router } from 'express';
import { z } from 'zod';
import { Department } from '../models/Department.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  services: z.array(z.object({ name: z.string().min(1), price: z.number().int().min(0) })).default([]),
  active: z.boolean().optional(),
});

router.get('/', authorize('department:read'), asyncHandler(async (req, res) => {
  res.json(await Department.find({ clinic: req.user.clinic }).sort('name'));
}));

router.post('/', authorize('department:create'), validate(schema), asyncHandler(async (req, res) => {
  const dept = await Department.create({ ...req.body, clinic: req.user.clinic });
  audit(req, 'department.create', 'Department', dept.id);
  res.status(201).json(dept);
}));

router.patch('/:id', authorize('department:update'), validate(schema.partial()), asyncHandler(async (req, res) => {
  const dept = await Department.findOneAndUpdate(
    { _id: req.params.id, clinic: req.user.clinic },
    req.body,
    { new: true, runValidators: true },
  );
  if (!dept) throw notFound('Department not found');
  audit(req, 'department.update', 'Department', dept.id);
  res.json(dept);
}));

export default router;
