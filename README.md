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
npm test                    # unit tests (no DB needed)
```

API base: `http://localhost:5000/api/v1`, health check: `/health`.

## Run the web app

```bash
cd client
npm install
npm run dev      # http://localhost:5173, proxies /api and /socket.io to the server on :5000
npm run build    # production bundle in client/dist
```

Sign in as the seeded admin, then create departments, doctors and staff under **Administration**.
Staff see only the areas their role allows. Patients get a portal login from their patient page.
The public waiting-room screen is at `/display/<clinicId>` (token numbers only, no sign-in).

## Status

All six phases are built: auth and roles, patients, doctors and scheduling, appointments and queue, clinical workflow, laboratory, pharmacy and inventory, billing, payments and receipts, expenses, reports, notifications and reminders, realtime updates, patient portal, documents, PDFs and QR codes, backups, system health, optional AI chart summaries and multi-clinic support, with a React web app on top. See docs/PLAN.md for design notes and limits.
