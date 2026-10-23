# Clinic Management System: Plan

Stack: MERN (MongoDB + Mongoose, Express, React + Vite, Node 22). Realtime via Socket.IO. Jobs via a Mongo-backed scheduler (agenda/node-cron). PDFs via pdfkit, QR via qrcode.

## 1. System design

### 1.1 Architecture

Modular monolith. One deployable API, one module per business domain, strict layering:

```
React SPA (role-based portals)
   │  REST (JSON, JWT)      │  Socket.IO (queue, appointments, alerts)
Express API
   routes → controllers → services (business rules, algorithms) → models (Mongoose)
   cross-cutting: auth, RBAC, tenant scoping, validation, audit, error handler
MongoDB            File storage (local → S3)        Notification providers
```

A modular monolith is right for a clinic: one team, transactional workflows (consult → prescription → pharmacy → billing), and easy later extraction into services if SaaS scale demands it.

### 1.2 Multi-tenancy (SaaS + branches)

- `Organization` (tenant) → many `Clinic` (branches).
- Every business document carries `organization` and `clinic`. A Mongoose plugin and a request-scoped context add these to every query, so one tenant can never read another's data.
- Super Admin works across organizations. Clinic Admin works in one organization. Staff are pinned to a clinic.

### 1.3 Roles and permissions (RBAC)

Roles: `super_admin, clinic_admin, doctor, receptionist, nurse, pharmacist, lab_staff, accountant, patient`.
A permission map `resource:action` (for example `appointment:create`, `invoice:refund`) is assigned per role. Middleware `authorize('appointment:create')` checks it. Doctors and patients also get row-level checks (a doctor sees only their patients' visits, a patient sees only their own records).

### 1.4 Core workflow (the "visit" spine)

```
Register patient → Book appointment / Walk-in → Check-in (token) → Nurse vitals
→ Doctor consultation → Prescription + Lab orders + Follow-up/Referral
→ Lab (collect → process → result → doctor review) ┐
→ Pharmacy (dispense, FEFO stock deduction)         ├→ Invoice → Payment → Receipt
→ Notifications at every step                       ┘
```

A `Visit` is the spine that ties the appointment, queue token, vitals, consultation, orders and invoice together. It drives the patient history timeline.

### 1.5 Modules (mapped to the 30 features)

| Module | Features |
|---|---|
| auth, users, roles | 26, 27 |
| clinics (branches/settings), departments | 4, Additional |
| patients (profile, history, documents) | 2, 28, 23 |
| doctors (schedule, leave) | 3, 6 |
| appointments (booking, recurring, no-show) | 5, 29 |
| queue (check-in, tokens, walk-in) | 7, 30 |
| clinical (vitals, consultation, prescription, referral) | 8, 9, 10, 29 |
| lab | 11 |
| pharmacy + inventory + alerts | 12, 13, 14 |
| billing, payments, receipts, expenses | 15, 16, 17, 18 |
| reports + dashboard | 1, 19, 20 |
| notifications + reminders | 21, 22 |
| audit | 27 |
| portals (patient, doctor, reception) | 23, 24, 25 |

### 1.6 Realtime

Socket.IO rooms: `clinic:{id}` (dashboard, queue display), `doctor:{id}`, `user:{id}`. Events: `queue:updated`, `appointment:changed`, `alert:stock`, `notification:new`.

### 1.7 Security

bcrypt password hashing, short-lived access JWT + rotating refresh token, helmet, rate limiting, input validation (zod), field-level audit for patient/billing/prescription changes, login activity log, soft delete for clinical records, daily `mongodump` backup job, `/health` endpoint for monitoring.

## 2. Data model (collections)

Every collection also has `organization, clinic, createdAt, updatedAt, createdBy`.

| Collection | Key fields | Important indexes |
|---|---|---|
| Organization | name, plan, settings | |
| Clinic | name, address, workingHours, holidays[], taxRate, currency | |
| User | name, email, passwordHash, role, clinic, active, lastLoginAt | `email` unique |
| Department | name, services[] | `(clinic, name)` unique |
| Doctor | user, department, specialization, qualification, consultationFee, slotMinutes, maxDailyAppointments, schedule[{day, start, end, breaks[]}], leaves[{from, to, reason}] | `(clinic, department)` |
| Patient | patientId (unique `P-YYMM-00001`), name, dob, gender, phone, email, address, emergencyContact, bloodGroup, allergies[], medicalHistory[], notes | text on name/phone, `patientId` unique |
| Appointment | patient, doctor, department, start, end, status, type(`new/followup/walkin/recurring`), seriesId, rescheduledFrom, reason | **unique partial** `(doctor, start)` on active status; `(clinic, start)` |
| Visit | patient, appointment?, doctor, token, status, checkedInAt, calledAt, completedAt | `(clinic, date, status)` |
| QueueCounter | clinic, doctor, date, seq | `(doctor, date)` unique |
| Vitals | visit, patient, bp, heartRate, temp, weight, height, spo2, respRate, bmi | `(patient, recordedAt)` |
| Consultation | visit, complaints, symptoms, diagnosis, treatment, notes, followUpDate, referral | |
| Prescription | visit, patient, doctor, items[{medicine, dosage, frequency, duration, route, instructions}], status | |
| Referral | patient, from, toDoctor/external, notes | |
| LabTest (catalog) | name, code, price, sampleType, referenceRanges[{gender, ageMin, ageMax, low, high, unit}] | |
| LabOrder | visit, patient, tests[{test, status, result, flag}], status | `(clinic, status)` |
| Medicine | name, generic, form, strength, unitPrice, reorderLevel, supplier | text |
| StockBatch | medicine, batchNo, expiry, qtyOnHand, costPrice, supplier | `(medicine, expiry)` |
| StockMovement | item, batch, type(`purchase/dispense/adjust/expired/return`), qty, ref | `(item, createdAt)` |
| InventoryItem | name, category, qty, reorderLevel, supplier | |
| Supplier, PurchaseOrder | | |
| Invoice | number, patient, visit, lines[{type, ref, desc, qty, unit}], subtotal, discount, tax, total, paid, balance, status | `number` unique |
| Payment | invoice, method, amount, status, refundOf | `(invoice)` |
| Expense | category, amount, date, notes | `(clinic, date)` |
| Notification | to, channel, template, payload, status, sendAt, attempts | `(status, sendAt)` |
| AuditLog | actor, action, entity, entityId, before, after, ip | `(entity, entityId)` |
| Document | patient, kind, fileUrl, mime | |

Money is stored as integer minor units (paisa/cents) to avoid float errors.

## 3. Key data structures

- **Interval list per doctor per day** (sorted array of `[start, end)`): working windows minus breaks, leave and booked appointments. All time math is on minutes-since-midnight integers.
- **Min-heap / priority queue** for the waiting list, ordered by `(priority, arrivalTime)`. Priority: emergency > appointment-on-time > walk-in. Backed by Mongo, rebuilt by a sorted query on `(clinic, doctor, date, status=waiting)`.
- **Atomic counters** (`QueueCounter`, `Counter` for patientId and invoice number) using `findOneAndUpdate({$inc})` for gap-free unique numbers under concurrency.
- **Batch list sorted by expiry** per medicine for stock deduction.
- **Hash map** (permission → roles) for O(1) authorization checks.
- **Timeline**: one query per source collection merged by timestamp (k-way merge of sorted lists).

## 4. Algorithms

1. **Slot generation** (smart scheduling). For doctor D on date X:
   1. If X is a clinic holiday or inside a leave range → no slots.
   2. Take D's working window for that weekday, subtract breaks → free intervals.
   3. Subtract booked appointments (interval subtraction on sorted lists).
   4. Cut each free interval into slots of `slotMinutes`, keeping only full slots.
   5. If booked count ≥ `maxDailyAppointments` → no slots. Past slots are dropped for today.
   Complexity O(n log n) in the number of appointments.
2. **Double-booking prevention.** The slot check is advisory. The real guarantee is a unique partial index on `(doctor, start)` for active appointments, so a race produces a duplicate-key error mapped to HTTP 409.
3. **Recurring appointments.** Expand a rule (`weekly`, `every N days`, `count`/`until`) into dates, run the slot check for each and book all in a transaction (report conflicts, with an option to skip them).
4. **Queue and token.** Token = atomic per-doctor per-day counter. Next patient = `min` by `(priority, arrivalTime)`. Estimated wait = `position × average consultation duration`, where the average is an exponential moving average of the doctor's last completed consultations.
5. **Billing.** Per-line `qty × unit`, then discount (percent or fixed, applied before tax), then tax on the discounted amount, with integer rounding per line (money in minor units). Balance = total − Σpayments + Σrefunds. Status derived: `unpaid / partial / paid / refunded`.
6. **FEFO stock deduction.** First-expiry-first-out: sort non-expired batches by expiry, take from each until the quantity is met, in a transaction. Fail with a clear shortage error if total stock is insufficient. Expired batches are never dispensed.
7. **Alerts.** A daily job flags batches expiring within N days (30/60/90), expired batches, and medicines where `Σqty ≤ reorderLevel` or `= 0`.
8. **Lab flagging.** Compare the result with the reference range chosen by patient age and gender, then label `low/normal/high/critical`.
9. **Reminders.** A scheduler polls `Notification(status=pending, sendAt ≤ now)` every minute, with retry and exponential backoff. Appointments create reminders at T−24h and T−2h.
10. **No-show tracking.** A job marks past-due `booked/confirmed` appointments as `no_show`. A patient's no-show rate feeds the reports.
11. **Reporting.** MongoDB aggregation pipelines (`$match → $group → $sort`) by day, month, doctor, service.
12. **Patient ID and invoice numbers.** Prefix + date + atomic sequence, so there are no duplicates under concurrency.

## 5. API surface (REST, `/api/v1`)

`/auth` · `/users` · `/clinics` · `/departments` · `/doctors` (+`/:id/slots?date=`) · `/patients` · `/appointments` · `/queue` · `/visits` · `/vitals` · `/consultations` · `/prescriptions` · `/lab` · `/pharmacy` · `/inventory` · `/invoices` · `/payments` · `/expenses` · `/reports` · `/notifications` · `/documents` · `/audit` · `/health`

## 6. Frontend plan

React + Vite + React Router + TanStack Query + Tailwind. One shell with role-aware navigation, and these portals: Admin/Reception, Doctor, Nurse, Pharmacy, Lab, Accounts, Patient. A public Queue Display screen uses Socket.IO. Layout is responsive and mobile-first.

## 7. Build phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Plan, repo, tooling | done |
| 1 | Server foundation: config, auth, RBAC, tenant scoping, audit, error handling, core models, **scheduling, queue, billing and FEFO algorithms with tests**, patient/doctor/department/appointment/queue APIs | done |
| 2 | Clinical: vitals, consultation, prescription, referral, follow-up, lab | done |
| 3 | Pharmacy, inventory, alerts, billing/payments/receipts (PDF, QR), expenses | done |
| 4 | Reports and dashboard, notifications and reminders, realtime | |
| 5 | React client: reception, doctor, patient portals | |
| 6 | Documents, backups, health monitoring, AI summary, polish | |

## 8. Testing

`node:test` unit tests for the pure algorithm modules (slots, queue, billing, FEFO, lab flags), which have no DB dependency. Integration tests with `mongodb-memory-server` from Phase 2.
