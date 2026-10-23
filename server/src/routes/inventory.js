import { Router } from 'express';
import { z } from 'zod';
import { InventoryItem, StockMovement } from '../models/Pharmacy.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { stockLevel } from '../services/fefo.js';
import { asyncHandler, conflict, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['equipment', 'consumable', 'other']).default('consumable'),
  unit: z.string().default('pcs'),
  reorderLevel: z.number().int().min(0).default(0),
  supplier: z.string().optional(),
});

router.get('/items', authorize('inventory:read'), asyncHandler(async (req, res) => {
  const items = await InventoryItem.find({ clinic: req.user.clinic }).sort('name').lean();
  res.json(items.map((i) => ({ ...i, level: stockLevel(i.qty, i.reorderLevel) })));
}));

router.post('/items', authorize('inventory:manage'), validate(itemSchema), asyncHandler(async (req, res) => {
  const item = await InventoryItem.create({ ...req.body, clinic: req.user.clinic });
  audit(req, 'inventory.create', 'InventoryItem', item.id);
  res.status(201).json(item);
}));

/** Signed quantity change with a conditional update so stock can never go negative. */
const move = (type, sign, permission) =>
  [
    authorize(permission),
    validate(z.object({ qty: z.number().int().min(1), note: z.string().optional() })),
    asyncHandler(async (req, res) => {
      const delta = sign * req.body.qty;
      const filter = { _id: req.params.id, clinic: req.user.clinic };
      if (delta < 0) filter.qty = { $gte: -delta };
      const item = await InventoryItem.findOneAndUpdate(filter, { $inc: { qty: delta } }, { new: true });
      if (!item) {
        if (!(await InventoryItem.exists({ _id: req.params.id, clinic: req.user.clinic }))) throw notFound('Item not found');
        throw conflict('Not enough stock');
      }
      await StockMovement.create({ clinic: req.user.clinic, item: item._id, type, qty: delta, ref: req.body.note, by: req.user.id });
      audit(req, `inventory.${type}`, 'InventoryItem', item.id, { qty: delta });
      res.json({ ...item.toObject(), level: stockLevel(item.qty, item.reorderLevel) });
    }),
  ];

router.post('/items/:id/purchase', ...move('purchase', 1, 'inventory:manage'));
router.post('/items/:id/use', ...move('usage', -1, 'inventory:use'));

router.get('/items/:id/movements', authorize('inventory:read'), asyncHandler(async (req, res) => {
  res.json(await StockMovement.find({ clinic: req.user.clinic, item: req.params.id }).sort('-createdAt').limit(200));
}));

export default router;
