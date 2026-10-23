import { Invoice, Payment } from '../models/Billing.js';
import { Clinic } from '../models/Clinic.js';
import { Doctor } from '../models/Doctor.js';
import { LabOrder } from '../models/Lab.js';
import { nextSeq } from '../models/Counter.js';
import { computeInvoice, invoiceStatus, netPaid } from './billing.js';
import { notFound } from '../utils/errors.js';

const yymm = (d = new Date()) => `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Gap-free document numbers per clinic and month, e.g. INV-2611-00007. */
export const nextNumber = async (prefix, clinic) => {
  const key = yymm();
  const seq = await nextSeq(`${prefix}:${clinic}:${key}`);
  return `${prefix}-${key}-${String(seq).padStart(5, '0')}`;
};

/** Recompute totals, paid, balance and status from the lines and the payment ledger. */
export const refreshInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw notFound('Invoice not found');
  const payments = await Payment.find({ invoice: invoice._id }).select('amount kind');

  const { lineTotals, subtotal, discount, tax, total } = computeInvoice(
    invoice.lines,
    invoice.discountRule?.type ? invoice.discountRule : null,
    invoice.taxPercent,
  );
  invoice.lines.forEach((l, i) => {
    l.total = lineTotals[i];
  });
  const paid = netPaid(payments);
  Object.assign(invoice, {
    subtotal,
    discount,
    tax,
    total,
    paid,
    balance: total - paid,
    status: invoiceStatus(total, paid, payments.some((p) => p.kind === 'refund')),
  });
  return invoice.save();
};

export const getOrCreateInvoice = async (visit) => {
  const existing = await Invoice.findOne({ visit: visit._id });
  if (existing) return existing;
  const clinic = await Clinic.findById(visit.clinic);
  try {
    return await Invoice.create({
      clinic: visit.clinic,
      number: await nextNumber('INV', visit.clinic),
      visit: visit._id,
      patient: visit.patient,
      taxPercent: clinic?.taxPercent ?? 0,
    });
  } catch (err) {
    if (err.code === 11000) return Invoice.findOne({ visit: visit._id }); // lost a creation race
    throw err;
  }
};

/** Add lines that are not already on the invoice (matched by type + ref). */
export const addLines = async (invoice, lines) => {
  const have = new Set(invoice.lines.filter((l) => l.ref).map((l) => `${l.type}:${l.ref}`));
  const fresh = lines.filter((l) => !l.ref || !have.has(`${l.type}:${l.ref}`));
  if (fresh.length === 0) return invoice;
  await Invoice.updateOne({ _id: invoice._id }, { $push: { lines: { $each: fresh.map((l) => ({ ...l, total: 0 })) } } });
  return refreshInvoice(invoice._id);
};

/** Pull the consultation fee and ordered lab tests for a visit onto its invoice. */
export const syncVisitCharges = async (visit) => {
  const invoice = await getOrCreateInvoice(visit);
  const doctor = await Doctor.findById(visit.doctor);
  const orders = await LabOrder.find({ visit: visit._id });

  const lines = [];
  if (doctor?.consultationFee > 0) {
    lines.push({ type: 'consultation', ref: String(visit._id), description: 'Doctor consultation', qty: 1, unit: doctor.consultationFee });
  }
  for (const order of orders) {
    for (const item of order.items) {
      lines.push({ type: 'lab', ref: String(item._id), description: item.name, qty: 1, unit: item.price ?? 0 });
    }
  }
  return addLines(invoice, lines);
};
