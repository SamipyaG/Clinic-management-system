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
