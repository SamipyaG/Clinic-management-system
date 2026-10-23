import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const notificationSchema = new mongoose.Schema(
  {
    clinic: { type: ObjectId, ref: 'Clinic', required: true },
    patient: { type: ObjectId, ref: 'Patient' },
    user: { type: ObjectId, ref: 'User' }, // recipient of in-app notifications
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'in_app'], required: true },
    template: { type: String, required: true },
    to: { type: String, required: true },
    subject: String,
    body: { type: String, required: true },
    ref: String, // e.g. appointment id, so pending reminders can be cancelled with it
    status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'], default: 'pending' },
    sendAt: { type: Date, default: Date.now },
    sentAt: Date,
    attempts: { type: Number, default: 0 },
    error: String,
    readAt: Date,
  },
  { timestamps: true },
);

notificationSchema.index({ status: 1, sendAt: 1 });
notificationSchema.index({ user: 1, channel: 1, createdAt: -1 });
notificationSchema.index({ ref: 1, status: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
