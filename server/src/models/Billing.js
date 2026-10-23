import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const lineSchema = new mongoose.Schema({
  type: { type: String, enum: ['consultation', 'lab', 'medicine', 'procedure', 'service'], required: true },
  ref: String, // source id (lab item, medicine...) used to avoid billing the same thing twice
  description: { type: String, required: true },
  qty: { type: Number, required: true, min: 0 },
  unit: { type: Number, required: true, min: 0 }, // minor units
  total: { type: Number, required: true, min: 0 },
});

// One invoice per visit; totals are always recomputed from lines (see services/invoicing.js).
const invoiceSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    number: { type: String, required: true, unique: true }, // INV-YYMM-00001
    visit: { type: ObjectId, ref: 'Visit', required: true, unique: true },
    patient: { type: ObjectId, ref: 'Patient', required: true },
    lines: [lineSchema],
    discountRule: { type: { type: String, enum: ['percent', 'fixed'] }, value: Number },
    taxPercent: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'refunded'], default: 'unpaid' },
  },
  { timestamps: true },
);
invoiceSchema.index({ clinic: 1, createdAt: -1 });
invoiceSchema.index({ patient: 1, createdAt: -1 });
export const Invoice = mongoose.model('Invoice', invoiceSchema);

const paymentSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    invoice: { type: ObjectId, ref: 'Invoice', required: true },
    receiptNo: { type: String, required: true, unique: true }, // RCP-YYMM-00001
    kind: { type: String, enum: ['payment', 'refund'], default: 'payment' },
    method: { type: String, enum: ['cash', 'card', 'bank_transfer', 'online', 'wallet'], required: true },
    amount: { type: Number, required: true, min: 1 },
    reference: String, // card slip, transaction id...
    note: String,
    receivedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
paymentSchema.index({ invoice: 1 });
paymentSchema.index({ clinic: 1, createdAt: -1 });
export const Payment = mongoose.model('Payment', paymentSchema);

const expenseSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    category: {
      type: String,
      enum: ['rent', 'electricity', 'internet', 'staff', 'equipment', 'medicines', 'maintenance', 'other'],
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    description: String,
    recordedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
expenseSchema.index({ clinic: 1, date: 1 });
export const Expense = mongoose.model('Expense', expenseSchema);
