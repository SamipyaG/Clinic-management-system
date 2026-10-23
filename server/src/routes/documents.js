import express, { Router } from 'express';
import { z } from 'zod';
import { Document } from '../models/Document.js';
import { Patient } from '../models/Patient.js';
import { audit } from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { detectFile, MAX_UPLOAD_BYTES, safeName } from '../services/files.js';
import { readFile, removeFile, saveFile } from '../services/storage.js';
import { asyncHandler, badRequest, notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

const KINDS = ['medical_report', 'lab_report', 'prescription', 'referral', 'scan', 'other'];
const querySchema = z.object({
  patient: z.string().min(1),
  kind: z.enum(KINDS).default('other'),
  name: z.string().optional(),
  shared: z.enum(['true', 'false']).default('false'),
});

/** Upload: raw file bytes as the request body, details in the query string. */
router.post('/', authorize('document:write'), express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), asyncHandler(async (req, res) => {
  const q = querySchema.safeParse(req.query);
  if (!q.success) throw badRequest('Validation failed', q.error.flatten().fieldErrors);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest('Empty file');

  const patient = await Patient.findOne({ _id: q.data.patient, clinic: req.user.clinic });
  if (!patient) throw notFound('Patient not found');
  const type = detectFile(req.body);
  if (!type) throw badRequest('Unsupported file type. Use PDF, PNG, JPEG, WebP or plain text.');

  const doc = await Document.create({
    clinic: req.user.clinic,
    patient: patient._id,
    kind: q.data.kind,
    name: safeName(q.data.name),
    mime: type.mime,
    size: req.body.length,
    storageKey: await saveFile(req.user.clinic, type.ext, req.body),
    sharedWithPatient: q.data.shared === 'true',
    uploadedBy: req.user.id,
  });
  audit(req, 'document.upload', 'Document', doc.id, { patient: patient.id, kind: doc.kind, size: doc.size });
  res.status(201).json(doc);
}));

router.get('/', authorize('document:read'), asyncHandler(async (req, res) => {
  const filter = { clinic: req.user.clinic };
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.kind) filter.kind = req.query.kind;
  res.json(await Document.find(filter).sort('-createdAt').limit(200).select('-storageKey'));
}));

export const sendDocument = async (res, doc) => {
  const bytes = await readFile(doc.storageKey);
  res.set({
    'Content-Type': doc.mime,
    'Content-Length': bytes.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.end(bytes);
};

router.get('/:id/download', authorize('document:read'), asyncHandler(async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, clinic: req.user.clinic });
  if (!doc) throw notFound('Document not found');
  audit(req, 'document.download', 'Document', doc.id);
  await sendDocument(res, doc);
}));

router.patch('/:id', authorize('document:write'), express.json(), asyncHandler(async (req, res) => {
  const body = z.object({ sharedWithPatient: z.boolean() }).safeParse(req.body);
  if (!body.success) throw badRequest('Validation failed');
  const doc = await Document.findOneAndUpdate({ _id: req.params.id, clinic: req.user.clinic }, body.data, { new: true }).select('-storageKey');
  if (!doc) throw notFound('Document not found');
  audit(req, 'document.share', 'Document', doc.id, body.data);
  res.json(doc);
}));

router.delete('/:id', authorize('document:delete'), asyncHandler(async (req, res) => {
  const doc = await Document.findOneAndDelete({ _id: req.params.id, clinic: req.user.clinic });
  if (!doc) throw notFound('Document not found');
  await removeFile(doc.storageKey);
  audit(req, 'document.delete', 'Document', doc.id, { name: doc.name });
  res.status(204).end();
}));

export default router;
