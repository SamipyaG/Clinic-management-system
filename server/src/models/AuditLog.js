import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true }, // e.g. 'patient.create', 'auth.login'
    entity: String,
    entityId: String,
    meta: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ entity: 1, entityId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditSchema);

/** Fire-and-forget: audit failures must never break the request. */
export const audit = (req, action, entity, entityId, meta) =>
  AuditLog.create({
    clinic: req.user?.clinic,
    actor: req.user?.id,
    action,
    entity,
    entityId: entityId?.toString(),
    meta,
    ip: req.ip,
  }).catch((err) => console.error('audit failed', err.message));
