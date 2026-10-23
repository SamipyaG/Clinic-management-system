import mongoose from 'mongoose';

// `organization` is the SaaS tenant; each Clinic is a branch of it.
const clinicSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, index: true },
    name: { type: String, required: true, trim: true },
    address: String,
    phone: String,
    email: String,
    currency: { type: String, default: 'NPR' },
    taxPercent: { type: Number, default: 0 },
    holidays: [{ type: String }], // 'YYYY-MM-DD'
    workingHours: { start: { type: String, default: '09:00' }, end: { type: String, default: '17:00' } },
  },
  { timestamps: true },
);

export const Clinic = mongoose.model('Clinic', clinicSchema);
