import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const documentSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    patient: { type: ObjectId, ref: 'Patient', required: true },
    kind: { type: String, enum: ['medical_report', 'lab_report', 'prescription', 'referral', 'scan', 'other'], default: 'other' },
    name: { type: String, required: true }, // display name only
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true }, // server-generated path under the upload dir, never user input
    sharedWithPatient: { type: Boolean, default: false },
    uploadedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
documentSchema.index({ patient: 1, createdAt: -1 });

export const Document = mongoose.model('Document', documentSchema);
