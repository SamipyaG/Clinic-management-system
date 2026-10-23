import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSlots, subtractIntervals } from '../src/services/slots.js';
import { WaitingQueue, estimateWaitMinutes, updateAverageDuration, PRIORITY } from '../src/services/queue.js';
import { computeInvoice, netPaid, invoiceStatus } from '../src/services/billing.js';
import { allocateFEFO, InsufficientStockError, expiryStatus, stockLevel } from '../src/services/fefo.js';
import { flagResult, pickRange } from '../src/services/lab.js';
import { expandRecurrence } from '../src/services/recurrence.js';
import { toMinutes } from '../src/utils/time.js';

test('subtractIntervals splits and trims', () => {
  assert.deepEqual(subtractIntervals([[540, 720]], [[600, 630]]), [[540, 600], [630, 720]]);
  assert.deepEqual(subtractIntervals([[540, 600]], [[500, 700]]), []);
});

const base = {
  date: '2026-11-02',
  workWindows: [[toMinutes('09:00'), toMinutes('12:00')]],
  breaks: [[toMinutes('10:00'), toMinutes('10:30')]],
  slotMinutes: 30,
};

test('slots skip breaks and booked appointments', () => {
  const slots = generateSlots({ ...base, booked: [[540, 570]] });
  assert.deepEqual(slots.map((s) => s.start), [570, 630, 660, 690]);
});

test('no slots on holiday, leave, or when daily cap reached', () => {
  assert.equal(generateSlots({ ...base, holidays: ['2026-11-02'] }).length, 0);
  assert.equal(generateSlots({ ...base, leaves: [{ from: '2026-11-01', to: '2026-11-03' }] }).length, 0);
  assert.equal(generateSlots({ ...base, booked: [[540, 570]], maxDaily: 1 }).length, 0);
});

test('slots respect remaining capacity and current time', () => {
  assert.equal(generateSlots({ ...base, maxDaily: 2 }).length, 2);
  const slots = generateSlots({ ...base, nowMinutes: 600 });
  assert.ok(slots.every((s) => s.start >= 600));
});

test('waiting queue orders by priority then arrival', () => {
  const q = new WaitingQueue();
  q.push({ id: 'walk1', priority: PRIORITY.walkin, arrivedAt: 1 });
  q.push({ id: 'appt', priority: PRIORITY.appointment, arrivedAt: 5 });
  q.push({ id: 'walk2', priority: PRIORITY.walkin, arrivedAt: 2 });
  q.push({ id: 'emerg', priority: PRIORITY.emergency, arrivedAt: 9 });
  assert.deepEqual(q.toSortedArray().map((x) => x.id), ['emerg', 'appt', 'walk1', 'walk2']);
  assert.equal(q.pop().id, 'emerg');
  assert.equal(q.size, 3);
});

test('wait estimate and moving average', () => {
  assert.equal(estimateWaitMinutes(1, 10), 0);
  assert.equal(estimateWaitMinutes(4, 10), 30);
  assert.equal(updateAverageDuration(null, 12), 12);
  assert.equal(updateAverageDuration(10, 20, 0.5), 15);
});

test('invoice: discount applied before tax, integer amounts', () => {
  const r = computeInvoice(
    [{ qty: 1, unit: 50000 }, { qty: 2, unit: 12500 }],
    { type: 'percent', value: 10 },
    13,
  );
  assert.equal(r.subtotal, 75000);
  assert.equal(r.discount, 7500);
  assert.equal(r.tax, Math.round(67500 * 0.13));
  assert.equal(r.total, 67500 + r.tax);
});

test('discount never exceeds subtotal; payment status', () => {
  assert.equal(computeInvoice([{ qty: 1, unit: 100 }], { type: 'fixed', value: 500 }).total, 0);
  const paid = netPaid([{ amount: 300 }, { amount: 100, kind: 'refund' }]);
  assert.equal(paid, 200);
  assert.equal(invoiceStatus(500, paid), 'partial');
  assert.equal(invoiceStatus(500, 500), 'paid');
  assert.equal(invoiceStatus(500, 0), 'unpaid');
});

test('FEFO takes earliest expiry first and skips expired', () => {
  const now = new Date('2026-06-01');
  const batches = [
    { id: 'late', expiry: new Date('2027-06-01'), qtyOnHand: 50 },
    { id: 'soon', expiry: new Date('2026-07-01'), qtyOnHand: 10 },
    { id: 'dead', expiry: new Date('2026-05-01'), qtyOnHand: 99 },
  ];
  assert.deepEqual(allocateFEFO(batches, 25, now), [{ id: 'soon', qty: 10 }, { id: 'late', qty: 15 }]);
  assert.throws(() => allocateFEFO(batches, 61, now), InsufficientStockError);
});

test('expiry and stock level classification', () => {
  const now = new Date('2026-06-01');
  assert.equal(expiryStatus(new Date('2026-05-01'), 30, now), 'expired');
  assert.equal(expiryStatus(new Date('2026-06-15'), 30, now), 'expiring');
  assert.equal(expiryStatus(new Date('2027-01-01'), 30, now), 'ok');
  assert.equal(stockLevel(0, 10), 'out_of_stock');
  assert.equal(stockLevel(10, 10), 'low');
  assert.equal(stockLevel(11, 10), 'ok');
});

test('lab range selection and flags', () => {
  const ranges = [
    { gender: 'male', low: 13, high: 17, criticalLow: 7 },
    { gender: 'female', low: 12, high: 15, criticalLow: 7 },
  ];
  const r = pickRange(ranges, { age: 30, gender: 'female' });
  assert.equal(flagResult(13, r), 'normal');
  assert.equal(flagResult(11, r), 'low');
  assert.equal(flagResult(16, r), 'high');
  assert.equal(flagResult(6, r), 'critical_low');
  assert.equal(flagResult(5, null), 'unknown');
});

test('recurrence by count and until', () => {
  assert.deepEqual(expandRecurrence('2026-11-01', { everyDays: 7, count: 3 }), ['2026-11-01', '2026-11-08', '2026-11-15']);
  assert.deepEqual(expandRecurrence('2026-11-01', { everyDays: 14, until: '2026-11-30' }), ['2026-11-01', '2026-11-15', '2026-11-29']);
  assert.throws(() => expandRecurrence('2026-11-01', { everyDays: 7 }));
});

test('bmi and vitals flags', async () => {
  const { computeBmi, flagVitals } = await import('../src/services/vitals.js');
  assert.equal(computeBmi(70, 175), 22.9);
  assert.equal(computeBmi(null, 175), undefined);
  assert.deepEqual(
    flagVitals({ bloodPressure: { systolic: 150, diastolic: 85 }, heartRate: 55, spo2: 97, temperature: 38.2 }),
    { systolic: 'high', heartRate: 'low', temperature: 'high' },
  );
  assert.deepEqual(flagVitals({}), {});
});

test('age and lab order status', async () => {
  const { ageInYears, deriveOrderStatus } = await import('../src/services/lab.js');
  assert.equal(ageInYears(new Date('2000-06-15'), new Date('2026-06-14')), 25);
  assert.equal(ageInYears(new Date('2000-06-15'), new Date('2026-06-15')), 26);
  assert.equal(ageInYears(null), null);
  assert.equal(deriveOrderStatus(['ordered', 'ordered']), 'ordered');
  assert.equal(deriveOrderStatus(['resulted', 'ordered']), 'in_progress');
  assert.equal(deriveOrderStatus(['resulted', 'resulted']), 'completed');
});

test('notification templates, channels, reminders, backoff', async () => {
  const core = await import('../src/services/notifyCore.js');
  assert.match(core.render('appointment_confirmed', { name: 'Ana', doctor: 'Who', when: 'Mon' }).body, /Ana.*Who.*Mon/);
  assert.throws(() => core.render('nope', {}));

  const patient = { email: 'a@x.com', phone: '98', user: 'u1' };
  assert.deepEqual(
    core.channelsFor(patient, ['email', 'sms', 'whatsapp', 'in_app']).map((c) => c.channel),
    ['email', 'sms', 'whatsapp', 'in_app'],
  );
  assert.deepEqual(core.channelsFor({ phone: '98' }, ['email', 'sms', 'in_app']).map((c) => c.channel), ['sms']);

  const now = new Date('2026-06-01T10:00:00Z');
  assert.equal(core.reminderTimes(new Date('2026-06-03T10:00:00Z'), now).length, 2);
  assert.equal(core.reminderTimes(new Date('2026-06-01T20:00:00Z'), now).length, 1); // only the 2h one is still ahead
  assert.equal(core.reminderTimes(new Date('2026-06-01T11:00:00Z'), now).length, 0);

  assert.equal(core.retryDelayMs(1), 60_000);
  assert.equal(core.retryDelayMs(3), 240_000);
  assert.equal(core.retryDelayMs(30), 3_600_000);
});

test('file type detection uses content, not names', async () => {
  const { detectFile, safeName } = await import('../src/services/files.js');
  assert.equal(detectFile(Buffer.from('%PDF-1.7\n...')).mime, 'application/pdf');
  assert.equal(detectFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])).ext, 'png');
  assert.equal(detectFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])).mime, 'image/jpeg');
  assert.equal(detectFile(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')).ext, 'webp');
  assert.equal(detectFile(Buffer.from('plain note')).mime, 'text/plain');
  assert.equal(detectFile(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])), null); // Windows executable
  assert.equal(detectFile(Buffer.from('<?php echo 1;\0')), null);
  assert.equal(detectFile(Buffer.alloc(0)), null);
  assert.equal(safeName('../../etc/pass"wd.pdf'), 'passwd.pdf');
  assert.equal(safeName('   '), 'document');
  assert.equal(safeName('a'.repeat(300)).length, 120);
});

test('qr references encode and decode safely', async () => {
  const { encodeRef, decodeRef, qrPng } = await import('../src/services/qr.js');
  assert.equal(encodeRef('PAT', 'P-2611-00001'), 'CLN:PAT:P-2611-00001');
  assert.deepEqual(decodeRef('CLN:RX:64f0a1b2c3d4e5f607182930'), { type: 'RX', ref: '64f0a1b2c3d4e5f607182930' });
  assert.equal(decodeRef('CLN:HACK:1'), null);
  assert.equal(decodeRef('CLN:PAT:../../etc'), null);
  assert.equal(decodeRef('https://evil.example'), null);
  assert.equal(decodeRef(undefined), null);
  assert.throws(() => encodeRef('XXX', '1'));
  const png = await qrPng('CLN:PAT:P-1');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('rule-based patient summary highlights safety items first', async () => {
  const { ruleSummary } = await import('../src/services/aiSummary.js');
  const text = ruleSummary(
    {
      age: 34, gender: 'female', bloodGroup: 'O+', allergies: ['Penicillin'], conditions: ['Asthma'],
      recentConsultations: [{ date: '2026-05-01', complaints: 'Cough', diagnosis: ['Bronchitis'], treatment: 'Rest', followUpDate: '2026-05-15' }],
      latestVitals: [{ date: '2026-05-01', bloodPressure: { systolic: 150, diastolic: 95 }, heartRate: 80, flags: { systolic: 'high' } }],
      recentPrescriptions: [{ date: '2026-05-01', items: ['Salbutamol 2 puffs PRN x 30d'] }],
      recentLabs: [{ test: 'Hemoglobin', value: 6, unit: 'g/dL', flag: 'critical_low' }, { test: 'WBC', value: 7, flag: 'normal' }],
      outstandingBalance: 500,
    },
    '2026-06-01',
  );
  const lines = text.split('\n');
  assert.match(lines[0], /34-year-old female, blood group O\+/);
  assert.match(lines[1], /^ALLERGIES: Penicillin/);
  assert.match(text, /Follow-up was due on 2026-05-15 \(overdue\)/);
  assert.match(text, /Outside normal range: systolic high/);
  assert.match(text, /Hemoglobin 6 g\/dL \(critical low\)/);
  assert.doesNotMatch(text, /WBC/);
  assert.match(text, /outstanding balance/);
  assert.match(ruleSummary({ age: null, gender: null, bloodGroup: null, allergies: [], conditions: [], recentConsultations: [], latestVitals: [], recentPrescriptions: [], recentLabs: [], outstandingBalance: 0 }), /No previous consultations/);
});
