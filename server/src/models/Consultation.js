import mongoose from 'mongoose';

const consultationSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    chiefComplaints: String,
    symptoms: [String],
    diagnosis: [String],
    treatment: String,
    notes: String,
    followUpDate: String, // 'YYYY-MM-DD'
    followUpAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  },
  { timestamps: true },
);

consultationSchema.index({ patient: 1, createdAt: -1 });

export const Consultation = mongoose.model('Consultation', consultationSchema);
