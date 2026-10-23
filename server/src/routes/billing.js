import { Router } from 'express';
import { z } from 'zod';
import { Invoice, Payment } from '../models/Billing.js';
import { Visit } from '../models/Visit.js';
import { Clinic } from '../models/Clinic.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addLines, nextNumber, refreshInvoice, syncVisitCharges } from '../services/invoicing.js';
import { receiptHtml } from '../services/receipt.js';
import { asyncHandler, badRequest, conflict, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const loadInvoice = async (req) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!invoice) throw notFound('Invoice not found');
  return invoice;
};

router.get('/invoices', authorize('billing:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.patient) filter.patient = req.query.patient;
  res.json(await Invoice.find(filter).sort('-createdAt').limit(100).populate('patient', 'name patientId'));
}));

router.get('/invoices/:id', authorize('billing:read'), asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, clinic: req.user.clinic }).populate('patient', 'name patientId phone');
  if (!invoice) throw notFound('Invoice not found');
  const payments = await Payment.find({ invoice: invoice._id }).sort('createdAt');
  res.json({ invoice, payments });
}));

/** Create (or refresh) the invoice for a visit: pulls the consultation fee and lab tests onto it. */
router.post('/visits/:visitId/invoice', authorize('billing:write'), asyncHandler(async (req, res) => {
  const visit = await Visit.findOne({ _id: req.params.visitId, clinic: req.user.clinic });
  if (!visit) throw notFound('Visit not found');
  const invoice = await syncVisitCharges(visit);
  audit(req, 'invoice.sync', 'Invoice', invoice.id);
  res.status(201).json(invoice);
}));

const lineSchema = z.object({
  type: z.enum(['procedure', 'service']),
  description: z.string().min(1),
  qty: z.number().positive().default(1),
  unit: z.number().int().min(0),
});

router.post('/invoices/:id/lines', authorize('billing:write'), validate(lineSchema), asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req);
  const updated = await addLines(invoice, [req.body]);
  audit(req, 'invoice.add_line', 'Invoice', invoice.id, req.body);
  res.json(updated);
}));

router.delete('/invoices/:id/lines/:lineId', authorize('billing:write'), asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req);
  const line = invoice.lines.id(req.params.lineId);
  if (!line) throw notFound('Line not found');
  if (!['procedure', 'service'].includes(line.type)) throw badRequest('Only manually added lines can be removed');
  line.deleteOne();
  await invoice.save();
  audit(req, 'invoice.remove_line', 'Invoice', invoice.id, { line: req.params.lineId });
  res.json(await refreshInvoice(invoice._id));
}));

const discountSchema = z.object({ type: z.enum(['percent', 'fixed']), value: z.number().min(0) }).refine(
  (d) => d.type !== 'percent' || d.value <= 100,
  'Percent discount cannot exceed 100',
);

router.put('/invoices/:id/discount', authorize('billing:discount'), validate(discountSchema), asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req);
  invoice.discountRule = req.body;
  await invoice.save();
  audit(req, 'invoice.discount', 'Invoice', invoice.id, req.body);
  res.json(await refreshInvoice(invoice._id));
}));

// ---------- Payments ----------
const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'bank_transfer', 'online', 'wallet']),
  amount: z.number().int().min(1),
  reference: z.string().optional(),
  note: z.string().optional(),
});

router.post('/invoices/:id/payments', authorize('payment:create'), validate(paymentSchema), asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req);
  if (req.body.amount > invoice.balance) throw conflict(`Payment exceeds the outstanding balance of ${invoice.balance}`);
  const payment = await Payment.create({
    ...req.body,
    clinic: req.user.clinic,
    invoice: invoice._id,
    receiptNo: await nextNumber('RCP', req.user.clinic),
    receivedBy: req.user.id,
  });
  const updated = await refreshInvoice(invoice._id);
  audit(req, 'payment.create', 'Payment', payment.id, { amount: payment.amount, method: payment.method });
  res.status(201).json({ payment, invoice: updated });
}));

router.post('/invoices/:id/refunds', authorize('payment:refund'), validate(paymentSchema), asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req);
  if (req.body.amount > invoice.paid) throw conflict(`Refund exceeds the amount paid (${invoice.paid})`);
  const refund = await Payment.create({
    ...req.body,
    kind: 'refund',
    clinic: req.user.clinic,
    invoice: invoice._id,
    receiptNo: await nextNumber('RCP', req.user.clinic),
    receivedBy: req.user.id,
  });
  const updated = await refreshInvoice(invoice._id);
  audit(req, 'payment.refund', 'Payment', refund.id, { amount: refund.amount });
  res.status(201).json({ payment: refund, invoice: updated });
}));

// ---------- Receipts ----------
router.get('/payments/:id/receipt', authorize('billing:read'), asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!payment) throw notFound('Payment not found');
  const invoice = await Invoice.findById(payment.invoice).populate('patient', 'name patientId phone');
  const clinic = await Clinic.findById(req.user.clinic);

  if (req.query.format === 'html') return res.type('html').send(receiptHtml({ clinic, invoice, payment }));
  res.json({ clinic: { name: clinic.name, address: clinic.address, phone: clinic.phone, currency: clinic.currency }, invoice, payment });
}));

export default router;
