import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const medicineSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    generic: String,
    form: String, // tablet, syrup, injection...
    strength: String,
    unitPrice: { type: Number, default: 0, min: 0 }, // selling price per unit, minor units
    reorderLevel: { type: Number, default: 10, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
medicineSchema.index({ clinic: 1, name: 1, strength: 1 }, { unique: true });
export const Medicine = mongoose.model('Medicine', medicineSchema);

const supplierSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    email: String,
    address: String,
  },
  { timestamps: true },
);
supplierSchema.index({ clinic: 1, name: 1 }, { unique: true });
export const Supplier = mongoose.model('Supplier', supplierSchema);

const batchSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    medicine: { type: ObjectId, ref: 'Medicine', required: true },
    batchNo: { type: String, required: true, trim: true },
    expiry: { type: Date, required: true },
    qtyOnHand: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    supplier: { type: ObjectId, ref: 'Supplier' },
  },
  { timestamps: true },
);
batchSchema.index({ medicine: 1, batchNo: 1 }, { unique: true });
batchSchema.index({ clinic: 1, expiry: 1 });
export const StockBatch = mongoose.model('StockBatch', batchSchema);

// Non-drug consumables and equipment (gloves, syringes, masks...).
const inventoryItemSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ['equipment', 'consumable', 'other'], default: 'consumable' },
    unit: { type: String, default: 'pcs' },
    qty: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    supplier: { type: ObjectId, ref: 'Supplier' },
  },
  { timestamps: true },
);
inventoryItemSchema.index({ clinic: 1, name: 1 }, { unique: true });
export const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);

// Append-only ledger of every stock change, for stock-movement reports and audit.
const movementSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    medicine: { type: ObjectId, ref: 'Medicine' },
    batch: { type: ObjectId, ref: 'StockBatch' },
    item: { type: ObjectId, ref: 'InventoryItem' },
    type: { type: String, enum: ['purchase', 'dispense', 'adjust', 'usage', 'expired', 'return'], required: true },
    qty: { type: Number, required: true }, // signed: + in, - out
    ref: String, // prescription id, note, etc.
    by: { type: ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ medicine: 1, createdAt: -1 });
movementSchema.index({ item: 1, createdAt: -1 });
export const StockMovement = mongoose.model('StockMovement', movementSchema);
