import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    description: String,
    services: [{ name: String, price: { type: Number, min: 0 } }], // price in minor units
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

departmentSchema.index({ clinic: 1, name: 1 }, { unique: true });

export const Department = mongoose.model('Department', departmentSchema);
