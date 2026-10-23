# Clinic Management System

MERN clinic platform: patients, doctors, scheduling, queue, consultations, lab, pharmacy, billing and reports.

- Design, data model and algorithms: [docs/PLAN.md](docs/PLAN.md)

## Run the server

```bash
cd server
cp .env.example .env        # set JWT_SECRET
npm install
ADMIN_PASSWORD='choose-a-password' npm run seed   # creates clinic + admin@clinic.local
npm run dev
npm test                    # algorithm unit tests (no DB needed)
```

API base: `http://localhost:5000/api/v1`, health check: `/health`.

## Status

Phases 1-4 done: auth + RBAC, patients, departments, doctors, appointments, queue, clinical workflow, lab, pharmacy, inventory, billing, payments, expenses, dashboard and financial/performance reports, notifications with automatic reminders, realtime updates (Socket.IO), patient portal API, staff/clinic settings and audit trail. See the phase table in the plan.
