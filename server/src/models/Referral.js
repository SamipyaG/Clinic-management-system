import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    fromDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    toDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }, // internal referral
    externalFacility: String, // external referral
    reason: { type: String, required: true },
    notes: String,
    status: { type: String, enum: ['pending', 'accepted', 'completed'], default: 'pending' },
  },
  { timestamps: true },
);

referralSchema.index({ patient: 1, createdAt: -1 });

export const Referral = mongoose.model('Referral', referralSchema);
