import mongoose from 'mongoose';

const vitalsSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bloodPressure: { systolic: Number, diastolic: Number }, // mmHg
    heartRate: Number, // bpm
    temperature: Number, // °C
    weight: Number, // kg
    height: Number, // cm
    spo2: Number, // %
    respiratoryRate: Number, // breaths/min
    bmi: Number, // derived
  },
  { timestamps: true },
);

vitalsSchema.index({ patient: 1, createdAt: -1 });
vitalsSchema.index({ visit: 1 });

export const Vitals = mongoose.model('Vitals', vitalsSchema);
