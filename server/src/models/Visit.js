import mongoose from 'mongoose';

// A Visit is the spine of a clinic encounter: check-in → vitals → consultation → billing.
const visitSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    date: { type: String, required: true },
    token: { type: Number, required: true },
    source: { type: String, enum: ['appointment', 'walkin', 'emergency'], required: true },
    priority: { type: Number, required: true }, // see PRIORITY in services/queue.js
    status: {
      type: String,
      enum: ['waiting', 'in_consultation', 'completed', 'cancelled'],
      default: 'waiting',
    },
    checkedInAt: { type: Date, default: Date.now },
    calledAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

visitSchema.index({ doctor: 1, date: 1, token: 1 }, { unique: true });
visitSchema.index({ clinic: 1, date: 1, status: 1 });

export const Visit = mongoose.model('Visit', visitSchema);
