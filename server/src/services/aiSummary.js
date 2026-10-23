import { env } from '../config/env.js';
import { Patient } from '../models/Patient.js';
import { Consultation } from '../models/Consultation.js';
import { Vitals } from '../models/Vitals.js';
import { Prescription } from '../models/Prescription.js';
import { LabOrder } from '../models/Lab.js';
import { Invoice } from '../models/Billing.js';
import { flagVitals } from './vitals.js';
import { ageInYears } from './lab.js';
import { notFound } from '../utils/errors.js';

/** De-identified clinical context: no name, phone, email, address or IDs leave the server. */
export const buildContext = async (patientId, clinic) => {
  const patient = await Patient.findOne({ _id: patientId, clinic });
  if (!patient) throw notFound('Patient not found');
  const [consultations, vitals, prescriptions, labs, invoices] = await Promise.all([
    Consultation.find({ patient: patient._id }).sort('-createdAt').limit(5),
    Vitals.find({ patient: patient._id }).sort('-createdAt').limit(2),
    Prescription.find({ patient: patient._id, status: { $ne: 'cancelled' } }).sort('-createdAt').limit(3),
    LabOrder.find({ patient: patient._id, status: { $in: ['completed', 'reviewed'] } }).sort('-createdAt').limit(3),
    Invoice.find({ patient: patient._id, balance: { $gt: 0 } }),
  ]);

  return {
    age: ageInYears(patient.dob),
    gender: patient.gender ?? null,
    bloodGroup: patient.bloodGroup ?? null,
    allergies: patient.allergies,
    conditions: patient.medicalHistory,
    recentConsultations: consultations.map((c) => ({ date: c.createdAt.toISOString().slice(0, 10), complaints: c.chiefComplaints, diagnosis: c.diagnosis, treatment: c.treatment, followUpDate: c.followUpDate ?? null })),
    latestVitals: vitals.map((v) => ({ date: v.createdAt.toISOString().slice(0, 10), bloodPressure: v.bloodPressure, heartRate: v.heartRate, temperature: v.temperature, spo2: v.spo2, bmi: v.bmi, flags: flagVitals(v) })),
    recentPrescriptions: prescriptions.map((p) => ({ date: p.createdAt.toISOString().slice(0, 10), items: p.items.map((i) => `${i.medicine} ${i.dosage} ${i.frequency} x ${i.duration}`) })),
    recentLabs: labs.flatMap((o) => o.items.filter((i) => i.status === 'resulted').map((i) => ({ test: i.name, value: i.value ?? i.textResult, unit: i.unit, flag: i.flag }))),
    outstandingBalance: invoices.reduce((s, i) => s + i.balance, 0),
  };
};

/** Deterministic summary from the structured context. Always available, never leaves the server. */
export const ruleSummary = (ctx, today = new Date().toISOString().slice(0, 10)) => {
  const lines = [];
  const who = [ctx.age != null && `${ctx.age}-year-old`, ctx.gender].filter(Boolean).join(' ');
  lines.push(`${who || 'Patient'}${ctx.bloodGroup ? `, blood group ${ctx.bloodGroup}` : ''}.`);
  if (ctx.allergies.length) lines.push(`ALLERGIES: ${ctx.allergies.join(', ')}.`);
  if (ctx.conditions.length) lines.push(`Known conditions: ${ctx.conditions.join(', ')}.`);

  const last = ctx.recentConsultations[0];
  if (last) {
    lines.push(`Last consultation ${last.date}: ${last.complaints ?? 'no complaint recorded'}${last.diagnosis?.length ? `; diagnosis ${last.diagnosis.join(', ')}` : ''}${last.treatment ? `; treatment ${last.treatment}` : ''}.`);
    if (last.followUpDate) lines.push(last.followUpDate < today ? `Follow-up was due on ${last.followUpDate} (overdue).` : `Follow-up planned for ${last.followUpDate}.`);
  } else lines.push('No previous consultations on record.');

  const v = ctx.latestVitals[0];
  if (v) {
    const parts = [v.bloodPressure && `BP ${v.bloodPressure.systolic}/${v.bloodPressure.diastolic}`, v.heartRate && `HR ${v.heartRate}`, v.temperature && `temp ${v.temperature}`, v.spo2 && `SpO2 ${v.spo2}%`, v.bmi && `BMI ${v.bmi}`].filter(Boolean);
    const abnormal = Object.entries(v.flags).map(([k, f]) => `${k} ${f}`);
    lines.push(`Latest vitals (${v.date}): ${parts.join(', ')}.${abnormal.length ? ` Outside normal range: ${abnormal.join(', ')}.` : ''}`);
  }
  const rx = ctx.recentPrescriptions[0];
  if (rx) lines.push(`Most recent prescription (${rx.date}): ${rx.items.join('; ')}.`);
  const bad = ctx.recentLabs.filter((l) => l.flag && !['normal', 'unknown'].includes(l.flag));
  if (bad.length) lines.push(`Abnormal lab results: ${bad.map((l) => `${l.test} ${l.value}${l.unit ? ` ${l.unit}` : ''} (${l.flag.replace('_', ' ')})`).join(', ')}.`);
  if (ctx.outstandingBalance > 0) lines.push('Has an outstanding balance on file.');
  return lines.join('\n');
};

const SYSTEM = 'You help clinicians by summarising a patient record. Use ONLY the JSON provided. Do not diagnose, do not invent facts, and say when information is missing. Write at most 8 short bullet points, safety-critical items (allergies, abnormal results, overdue follow-ups) first.';

const callAnthropic = async (ctx) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.aiModel, max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(ctx) }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`AI service responded ${res.status}`);
  const data = await res.json();
  const text = data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) throw new Error('AI service returned no text');
  return text;
};

export const aiEnabled = () => env.aiProvider === 'anthropic' && !!env.anthropicKey;

/** Narrative summary. Falls back to the rule-based one if the AI provider is off or fails. */
export const summarisePatient = async (patientId, clinic) => {
  const ctx = await buildContext(patientId, clinic);
  const fallback = ruleSummary(ctx);
  if (!aiEnabled()) return { source: 'rules', summary: fallback, facts: fallback };
  try {
    return { source: 'ai', model: env.aiModel, summary: await callAnthropic(ctx), facts: fallback };
  } catch (err) {
    return { source: 'rules', summary: fallback, facts: fallback, note: `AI unavailable (${err.message}); showing rule-based summary.` };
  }
};
