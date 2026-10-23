import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    start: { type: String, required: true }, // 'HH:mm'
    end: { type: String, required: true },
    breaks: [{ start: String, end: String }],
  },
  { _id: false },
);

const doctorSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    qualification: String,
    specialization: String,
    phone: String,
    consultationFee: { type: Number, default: 0, min: 0 }, // minor units
    slotMinutes: { type: Number, default: 15, min: 5 },
    maxDailyAppointments: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    schedule: [scheduleSchema],
    leaves: [{ from: String, to: String, reason: String }], // 'YYYY-MM-DD' inclusive
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

doctorSchema.index({ clinic: 1, department: 1 });

export const Doctor = mongoose.model('Doctor', doctorSchema);
