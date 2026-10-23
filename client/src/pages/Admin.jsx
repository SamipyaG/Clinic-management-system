import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useLoad } from '../hooks.js';
import { fmtDateTime, label, toMinor } from '../format.js';
import { useAuth } from '../auth.jsx';
import { Badge, Card, ErrorMsg, Field, Loading, Table, Tabs, useFormState } from '../components/ui.jsx';
import { Branches, Platform, SystemHealth } from '../components/SystemPanels.jsx';

const ROLES = ['clinic_admin', 'receptionist', 'nurse', 'pharmacist', 'lab_staff', 'accountant'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Staff() {
  const users = useLoad(() => api('/admin/users'));
  const [f, set, reset] = useFormState({ name: '', email: '', password: '', role: 'receptionist' });
  const add = useAction(async (e) => {
    e.preventDefault();
    await api('/admin/users', { method: 'POST', body: f });
    reset(); users.reload();
  });
  const toggle = useAction(async (u) => {
    await api(`/admin/users/${u._id}`, { method: 'PATCH', body: { active: !u.active } });
    users.reload();
  });
  return (
    <div className="stack">
      <ErrorMsg error={toggle.error} />
      <Table rows={users.data} columns={[
        { h: 'Name', c: (u) => u.name }, { h: 'Email', c: (u) => u.email }, { h: 'Role', c: (u) => label(u.role) },
        { h: 'Last login', c: (u) => fmtDateTime(u.lastLoginAt) }, { h: 'Active', c: (u) => <Badge value={u.active ? 'ok' : 'cancelled'} /> },
        { h: '', c: (u) => <button className="secondary small" onClick={() => toggle.run(u)}>{u.active ? 'Deactivate' : 'Activate'}</button> },
      ]} />
      <Card title="Add staff account">
        <form onSubmit={add.run}>
          <div className="form-grid">
            <Field label="Name"><input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
            <Field label="Temporary password" hint="At least 8 characters"><input type="password" value={f.password} onChange={set('password')} minLength={8} required /></Field>
            <Field label="Role"><select value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></Field>
          </div>
          <p className="muted">Doctors are added in the Doctors tab because they need a schedule.</p>
          <ErrorMsg error={add.error} /><button disabled={add.busy}>Create account</button>
        </form>
      </Card>
    </div>
  );
}

function Departments({ reloadKey, onChanged }) {
  const depts = useLoad(() => api('/departments'), [reloadKey]);
  const [f, set, reset] = useFormState({ name: '', description: '' });
  const add = useAction(async (e) => {
    e.preventDefault();
    await api('/departments', { method: 'POST', body: { name: f.name, description: f.description || undefined } });
    reset(); depts.reload(); onChanged();
  });
  return (
    <div className="stack">
      <Table rows={depts.data} empty="No departments yet." columns={[{ h: 'Department', c: (d) => d.name }, { h: 'Description', c: (d) => d.description ?? '' }, { h: 'Services', c: (d) => (d.services ?? []).map((s) => s.name).join(', ') }]} />
      <Card title="Add department">
        <form onSubmit={add.run}>
          <div className="form-grid">
            <Field label="Name"><input value={f.name} onChange={set('name')} required placeholder="General Medicine" /></Field>
            <Field label="Description"><input value={f.description} onChange={set('description')} /></Field>
          </div>
          <ErrorMsg error={add.error} /><button disabled={add.busy}>Add department</button>
        </form>
      </Card>
    </div>
  );
}

function Doctors({ departments }) {
  const doctors = useLoad(() => api('/doctors'));
  const [f, set, reset] = useFormState({ name: '', email: '', password: '', department: '', qualification: '', specialization: '', fee: '', slotMinutes: 15, maxDaily: 0, start: '09:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00', days: [1, 2, 3, 4, 5] });
  const toggleDay = (d) => set('days')(f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d]);
  const add = useAction(async (e) => {
    e.preventDefault();
    await api('/doctors', { method: 'POST', body: {
      name: f.name, email: f.email, password: f.password, department: f.department,
      qualification: f.qualification || undefined, specialization: f.specialization || undefined,
      consultationFee: toMinor(f.fee || 0), slotMinutes: Number(f.slotMinutes), maxDailyAppointments: Number(f.maxDaily),
      schedule: f.days.map((day) => ({ day, start: f.start, end: f.end, breaks: f.breakStart && f.breakEnd ? [{ start: f.breakStart, end: f.breakEnd }] : [] })),
    } });
    reset(); doctors.reload();
  });
  const [leave, setLeave, resetLeave] = useFormState({ doctor: '', from: '', to: '', reason: '' });
  const addLeave = useAction(async (e) => {
    e.preventDefault();
    await api(`/doctors/${leave.doctor}/leaves`, { method: 'POST', body: { from: leave.from, to: leave.to, reason: leave.reason || undefined } });
    resetLeave(); doctors.reload();
  });
  return (
    <div className="stack">
      <Table rows={doctors.data} empty="No doctors yet." columns={[
        { h: 'Doctor', c: (d) => d.user?.name }, { h: 'Department', c: (d) => d.department?.name }, { h: 'Specialization', c: (d) => d.specialization ?? '' },
        { h: 'Days', c: (d) => d.schedule.map((s) => DAYS[s.day]).join(' ') }, { h: 'Slot', c: (d) => `${d.slotMinutes} min` },
        { h: 'Leave', c: (d) => d.leaves.map((l) => `${l.from}→${l.to}`).join(', ') },
      ]} />
      <Card title="Add doctor">
        <form onSubmit={add.run}>
          <div className="form-grid">
            <Field label="Name"><input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Email (login)"><input type="email" value={f.email} onChange={set('email')} required /></Field>
            <Field label="Temporary password"><input type="password" value={f.password} onChange={set('password')} minLength={8} required /></Field>
            <Field label="Department"><select value={f.department} onChange={set('department')} required><option value="">Select</option>{departments?.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></Field>
            <Field label="Qualification"><input value={f.qualification} onChange={set('qualification')} /></Field>
            <Field label="Specialization"><input value={f.specialization} onChange={set('specialization')} /></Field>
            <Field label="Consultation fee"><input type="number" step="0.01" min="0" value={f.fee} onChange={set('fee')} /></Field>
            <Field label="Appointment length (min)"><input type="number" min="5" value={f.slotMinutes} onChange={set('slotMinutes')} /></Field>
            <Field label="Max appointments / day" hint="0 = unlimited"><input type="number" min="0" value={f.maxDaily} onChange={set('maxDaily')} /></Field>
            <Field label="Work start"><input type="time" value={f.start} onChange={set('start')} /></Field>
            <Field label="Work end"><input type="time" value={f.end} onChange={set('end')} /></Field>
            <Field label="Break start"><input type="time" value={f.breakStart} onChange={set('breakStart')} /></Field>
            <Field label="Break end"><input type="time" value={f.breakEnd} onChange={set('breakEnd')} /></Field>
          </div>
          <div className="row" style={{ marginBottom: '.75rem' }}>{DAYS.map((d, i) => <label key={d} className="row"><input type="checkbox" checked={f.days.includes(i)} onChange={() => toggleDay(i)} /> {d}</label>)}</div>
          <ErrorMsg error={add.error} /><button disabled={add.busy || !f.days.length}>Add doctor</button>
        </form>
      </Card>
      <Card title="Record doctor leave">
        <form onSubmit={addLeave.run}>
          <div className="form-grid">
            <Field label="Doctor"><select value={leave.doctor} onChange={setLeave('doctor')} required><option value="">Select</option>{doctors.data?.map((d) => <option key={d._id} value={d._id}>{d.user?.name}</option>)}</select></Field>
            <Field label="From"><input type="date" value={leave.from} onChange={setLeave('from')} required /></Field>
            <Field label="To"><input type="date" value={leave.to} onChange={setLeave('to')} required /></Field>
            <Field label="Reason"><input value={leave.reason} onChange={setLeave('reason')} /></Field>
          </div>
          <ErrorMsg error={addLeave.error} /><button disabled={addLeave.busy}>Save leave</button>
        </form>
      </Card>
    </div>
  );
}

function Settings() {
  const clinic = useLoad(() => api('/admin/clinic'));
  const [f, set, , setAll] = useFormState({ name: '', address: '', phone: '', email: '', currency: 'NPR', taxPercent: 0, holidays: '', channels: ['email', 'sms', 'in_app'] });
  const [loaded, setLoaded] = useState(false);
  if (clinic.data && !loaded) {
    const c = clinic.data;
    setAll({ name: c.name ?? '', address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '', currency: c.currency ?? 'NPR', taxPercent: c.taxPercent ?? 0, holidays: (c.holidays ?? []).join(', '), channels: c.notificationChannels ?? [] });
    setLoaded(true);
  }
  const save = useAction(async (e) => {
    e.preventDefault();
    await api('/admin/clinic', { method: 'PATCH', body: {
      name: f.name, address: f.address, phone: f.phone, ...(f.email && { email: f.email }), currency: f.currency, taxPercent: Number(f.taxPercent),
      holidays: f.holidays.split(',').map((x) => x.trim()).filter(Boolean), notificationChannels: f.channels,
    } });
    clinic.reload();
  });
  const toggle = (ch) => set('channels')(f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch]);
  if (!loaded) return <Loading loading={clinic.loading} error={clinic.error} />;
  return (
    <Card title="Clinic settings">
      <form onSubmit={save.run}>
        <div className="form-grid">
          <Field label="Clinic name"><input value={f.name} onChange={set('name')} required /></Field>
          <Field label="Address"><input value={f.address} onChange={set('address')} /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Currency (3 letters)"><input value={f.currency} onChange={set('currency')} maxLength={3} minLength={3} /></Field>
          <Field label="Tax %"><input type="number" min="0" max="100" step="0.01" value={f.taxPercent} onChange={set('taxPercent')} /></Field>
        </div>
        <Field label="Holidays" hint="Dates as YYYY-MM-DD, comma separated"><input value={f.holidays} onChange={set('holidays')} /></Field>
        <Field label="Notification channels" group>
          <div className="row">{['email', 'sms', 'whatsapp', 'in_app'].map((c) => <label key={c} className="row"><input type="checkbox" checked={f.channels.includes(c)} onChange={() => toggle(c)} /> {label(c)}</label>)}</div>
        </Field>
        <ErrorMsg error={save.error} /><button disabled={save.busy}>Save settings</button>
      </form>
    </Card>
  );
}

function Audit() {
  const log = useLoad(() => api('/admin/audit?limit=200'));
  const sent = useLoad(() => api('/notifications/log'));
  return (
    <div className="stack">
      <Card title="Activity & audit history">
        <Loading loading={log.loading && !log.data} error={log.error} />
        <Table rows={log.data} empty="No activity yet." columns={[{ h: 'When', c: (a) => fmtDateTime(a.createdAt) }, { h: 'User', c: (a) => `${a.actor?.name ?? '-'} (${a.actor?.role ?? ''})` }, { h: 'Action', c: (a) => a.action }, { h: 'Record', c: (a) => `${a.entity ?? ''} ${a.entityId?.slice(-6) ?? ''}` }, { h: 'IP', c: (a) => a.ip ?? '' }]} />
      </Card>
      <Card title="Notification log">
        <Table rows={sent.data} empty="Nothing sent yet." columns={[{ h: 'When', c: (n) => fmtDateTime(n.createdAt) }, { h: 'Channel', c: (n) => label(n.channel) }, { h: 'To', c: (n) => n.to }, { h: 'Type', c: (n) => label(n.template) }, { h: 'Status', c: (n) => <Badge value={n.status} /> }]} />
      </Card>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const isSuper = user.role === 'super_admin';
  const [key, setKey] = useState(0);
  const depts = useLoad(() => api('/departments'), [key]);
  return (
    <div className="stack">
      <h1>Administration</h1>
      <Tabs tabs={[
        { id: 'staff', title: 'Staff', render: () => <Staff /> },
        { id: 'dept', title: 'Departments', render: () => <Departments reloadKey={key} onChanged={() => setKey((k) => k + 1)} /> },
        { id: 'doc', title: 'Doctors', render: () => <Doctors departments={depts.data} /> },
        { id: 'set', title: 'Clinic settings', render: () => <Settings /> },
        { id: 'audit', title: 'Audit & notifications', render: () => <Audit /> },
        { id: 'branches', title: 'Branches', render: () => <Branches /> },
        { id: 'system', title: 'System health & backups', render: () => <SystemHealth isSuper={isSuper} /> },
        ...(isSuper ? [{ id: 'platform', title: 'Organizations', render: () => <Platform /> }] : []),
      ]} />
    </div>
  );
}
