import { Router } from 'express';
import { z } from 'zod';
import { Expense } from '../models/Billing.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CATEGORIES = ['rent', 'electricity', 'internet', 'staff', 'equipment', 'medicines', 'maintenance', 'other'];

const expenseSchema = z.object({
  category: z.enum(CATEGORIES),
  amount: z.number().int().min(1),
  date,
  description: z.string().optional(),
});

router.get('/', authorize('expense:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) filter.date = { ...(req.query.from && { $gte: req.query.from }), ...(req.query.to && { $lte: req.query.to }) };
  const items = await Expense.find(filter).sort('-date').limit(500);
  res.json({ items, total: items.reduce((s, e) => s + e.amount, 0) });
}));

router.post('/', authorize('expense:write'), validate(expenseSchema), asyncHandler(async (req, res) => {
  const expense = await Expense.create({ ...req.body, clinic: req.user.clinic, recordedBy: req.user.id });
  audit(req, 'expense.create', 'Expense', expense.id, { amount: expense.amount });
  res.status(201).json(expense);
}));

router.patch('/:id', authorize('expense:write'), validate(expenseSchema.partial()), asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic }, req.body, { new: true, runValidators: true });
  if (!expense) throw notFound('Expense not found');
  audit(req, 'expense.update', 'Expense', expense.id, req.body);
  res.json(expense);
}));

router.delete('/:id', authorize('expense:write'), asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete({ _id: req.params.id, clinic: req.user.clinic });
  if (!expense) throw notFound('Expense not found');
  audit(req, 'expense.delete', 'Expense', expense.id, { amount: expense.amount, category: expense.category });
  res.status(204).end();
}));

export default router;
