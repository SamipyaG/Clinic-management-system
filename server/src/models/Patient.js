import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set when the patient has portal access
    patientId: { type: String, required: true, unique: true }, // P-YYMM-00001
    name: { type: String, required: true, trim: true },
    dob: Date,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: String,
    emergencyContact: { name: String, relation: String, phone: String },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    allergies: [String],
    medicalHistory: [String],
    notes: String,
  },
  { timestamps: true },
);

patientSchema.index({ clinic: 1, phone: 1 });
patientSchema.index({ name: 'text', phone: 'text', patientId: 'text' });

export const Patient = mongoose.model('Patient', patientSchema);
