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

Phases 1-2 done: auth + RBAC, patients, departments, doctors, appointments, queue, vitals, consultations, prescriptions, referrals and the lab workflow. See the phase table in the plan.
