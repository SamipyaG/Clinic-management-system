import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    medicine: { type: String, required: true, trim: true }, // free text until linked to the pharmacy catalog
    medicineRef: { type: mongoose.Schema.Types.ObjectId }, // set in the pharmacy phase
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String, required: true },
    route: { type: String, default: 'oral' },
    quantity: Number,
    instructions: String,
  },
  { _id: false },
);

const prescriptionSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    status: { type: String, enum: ['issued', 'dispensed', 'cancelled'], default: 'issued' },
    notes: String,
  },
  { timestamps: true },
);

prescriptionSchema.index({ patient: 1, createdAt: -1 });
prescriptionSchema.index({ clinic: 1, status: 1 });

export const Prescription = mongoose.model('Prescription', prescriptionSchema);
