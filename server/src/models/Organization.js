import mongoose from 'mongoose';

// The SaaS tenant. Each organization owns one or more clinics (branches).
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    plan: { type: String, enum: ['trial', 'standard', 'enterprise'], default: 'trial' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Organization = mongoose.model('Organization', organizationSchema);
