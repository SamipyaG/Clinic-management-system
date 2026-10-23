import mongoose from 'mongoose';

const rangeSchema = new mongoose.Schema(
  {
    gender: { type: String, enum: ['male', 'female', 'any'], default: 'any' },
    ageMin: Number,
    ageMax: Number,
    low: { type: Number, required: true },
    high: { type: Number, required: true },
    criticalLow: Number,
    criticalHigh: Number,
  },
  { _id: false },
);

const labTestSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    sampleType: String,
    unit: String,
    price: { type: Number, default: 0, min: 0 }, // minor units
    referenceRanges: [rangeSchema],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

labTestSchema.index({ clinic: 1, code: 1 }, { unique: true });

export const LabTest = mongoose.model('LabTest', labTestSchema);

const orderItemSchema = new mongoose.Schema({
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest', required: true },
  name: String, // snapshot, so later catalog edits do not rewrite history
  price: Number,
  status: { type: String, enum: ['ordered', 'collected', 'processing', 'resulted'], default: 'ordered' },
  value: Number,
  textResult: String,
  unit: String,
  range: { low: Number, high: Number },
  flag: { type: String, enum: ['low', 'normal', 'high', 'critical_low', 'critical_high', 'unknown'] },
  resultedAt: Date,
  resultedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const labOrderSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    status: { type: String, enum: ['ordered', 'in_progress', 'completed', 'reviewed'], default: 'ordered' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    reviewedAt: Date,
    reviewNotes: String,
  },
  { timestamps: true },
);

labOrderSchema.index({ clinic: 1, status: 1 });
labOrderSchema.index({ patient: 1, createdAt: -1 });

export const LabOrder = mongoose.model('LabOrder', labOrderSchema);
