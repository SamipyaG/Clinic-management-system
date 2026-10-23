import mongoose from 'mongoose';

export const ACTIVE_STATUSES = ['booked', 'confirmed', 'checked_in', 'in_consultation'];

const appointmentSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: {
      type: String,
      enum: [...ACTIVE_STATUSES, 'completed', 'cancelled', 'no_show', 'rescheduled'],
      default: 'booked',
    },
    type: { type: String, enum: ['new', 'followup', 'walkin', 'recurring'], default: 'new' },
    seriesId: String, // groups recurring appointments
    rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    followUpOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    reason: String,
    cancelReason: String,
  },
  { timestamps: true },
);

// Hard guarantee against double booking: one active appointment per doctor per start time.
appointmentSchema.index(
  { doctor: 1, start: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } } },
);
appointmentSchema.index({ clinic: 1, date: 1 });
appointmentSchema.index({ patient: 1, start: -1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
