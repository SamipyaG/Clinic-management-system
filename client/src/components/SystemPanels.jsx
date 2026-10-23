import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useLoad } from '../hooks.js';
import { fmtDateTime, label } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Stat, Table, useFormState } from './ui.jsx';

const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function SystemHealth({ isSuper }) {
  const h = useLoad(() => api('/platform/system'));
  const backups = useLoad(() => (isSuper ? api('/platform/backups') : Promise.resolve([])));
  const run = useAction(async () => {
    await api('/platform/backups', { method: 'POST' });
    backups.reload();
    h.reload();
  });
  const d = h.data;
  return (
    <div className="stack">
      <ErrorMsg error={h.error} />
      {d && (
        <>
          <div className="grid cols-3">
            <Stat title="Status" value={label(d.status)} tone={d.status === 'ok' ? 'good' : d.status === 'down' ? 'bad' : 'warn'} />
            <Stat title="Database" value={d.database.up ? 'Connected' : 'Down'} hint={`${d.database.pingMs} ms`} tone={d.database.up ? 'good' : 'bad'} />
            <Stat title="Uptime" value={`${Math.floor(d.process.uptimeSeconds / 3600)}h ${Math.floor((d.process.uptimeSeconds % 3600) / 60)}m`} hint={`Node ${d.process.node}`} />
            <Stat title="Memory" value={`${d.process.rssMB} MB`} hint={`heap ${d.process.heapUsedMB} MB`} />
            <Stat title="Event loop lag" value={`${d.process.eventLoopLagMs} ms`} tone={d.process.eventLoopLagMs > 200 ? 'warn' : ''} />
            <Stat title="Notifications" value={`${d.notifications.overduePending} overdue / ${d.notifications.failed} failed`} tone={d.notifications.failed || d.notifications.overduePending ? 'warn' : ''} />
            <Stat title="Last backup" value={d.backups.lastBackupAt ? `${d.backups.ageHours} h ago` : 'Never'} hint={`${d.backups.count} kept`} tone={d.backups.lastBackupAt ? '' : 'warn'} />
          </div>
          {d.issues.length > 0 && <Card title="Needs attention"><ul>{d.issues.map((i) => <li key={i}>{i}</li>)}</ul></Card>}
        </>
      )}
      <div className="row"><button className="secondary" onClick={h.reload}>Refresh</button></div>
      {isSuper && (
        <Card title="Backups" actions={<button disabled={run.busy} onClick={run.run}>{run.busy ? 'Backing up...' : 'Back up now'}</button>}>
          <p className="muted">A full backup (all data and uploaded files) is also taken automatically once a day.</p>
          <ErrorMsg error={run.error} />
          <Table rows={backups.data} empty="No backups yet." columns={[{ h: 'File', c: (b) => b.name }, { h: 'Created', c: (b) => fmtDateTime(b.createdAt) }, { h: 'Size', c: (b) => kb(b.bytes), right: true }]} />
        </Card>
      )}
    </div>
  );
}

export function Branches({ onChanged }) {
  const clinics = useLoad(() => api('/platform/clinics'));
  const [f, set, reset] = useFormState({ name: '', address: '', phone: '' });
  const add = useAction(async (e) => {
    e.preventDefault();
    await api('/platform/branches', { method: 'POST', body: { name: f.name, address: f.address || undefined, phone: f.phone || undefined } });
    reset(); clinics.reload(); onChanged?.();
  });
  return (
    <div className="stack">
      <Table rows={clinics.data} empty="No clinics." columns={[{ h: 'Clinic / branch', c: (c) => c.name }, { h: 'Address', c: (c) => c.address ?? '' }]} />
      <Card title="Add a branch">
        <form onSubmit={add.run}>
          <div className="form-grid">
            <Field label="Branch name"><input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Address"><input value={f.address} onChange={set('address')} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
          </div>
          <ErrorMsg error={add.error} /><button disabled={add.busy}>Add branch</button>
          <p className="muted">After adding a branch, use the clinic switcher at the top to work inside it, then create its doctors, staff and departments.</p>
        </form>
      </Card>
    </div>
  );
}

export function Platform() {
  const orgs = useLoad(() => api('/platform/organizations'));
  const [f, set, reset] = useFormState({ name: '', plan: 'trial', clinicName: '', adminName: '', adminEmail: '', adminPassword: '' });
  const [created, setCreated] = useState('');
  const add = useAction(async (e) => {
    e.preventDefault();
    const r = await api('/platform/organizations', { method: 'POST', body: f });
    setCreated(`Created ${r.organization.name} with admin ${r.admin.email}.`);
    reset(); orgs.reload();
  });
  const toggle = useAction(async (o) => {
    await api(`/platform/organizations/${o._id}`, { method: 'PATCH', body: { active: !o.active } });
    orgs.reload();
  });
  return (
    <div className="stack">
      <ErrorMsg error={toggle.error} />
      <Table rows={orgs.data} empty="No organizations." columns={[
        { h: 'Organization', c: (o) => o.name }, { h: 'Plan', c: (o) => label(o.plan) }, { h: 'Clinics', c: (o) => o.clinics, right: true },
        { h: 'Active', c: (o) => <Badge value={o.active ? 'ok' : 'cancelled'} /> },
        { h: '', c: (o) => <button className="secondary small" onClick={() => toggle.run(o)}>{o.active ? 'Suspend' : 'Reactivate'}</button> },
      ]} />
      <Card title="Onboard a new organization">
        <form onSubmit={add.run}>
          <div className="form-grid">
            <Field label="Organization name"><input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Plan"><select value={f.plan} onChange={set('plan')}><option value="trial">Trial</option><option value="standard">Standard</option><option value="enterprise">Enterprise</option></select></Field>
            <Field label="First clinic name"><input value={f.clinicName} onChange={set('clinicName')} required /></Field>
            <Field label="Admin name"><input value={f.adminName} onChange={set('adminName')} required /></Field>
            <Field label="Admin email"><input type="email" value={f.adminEmail} onChange={set('adminEmail')} required /></Field>
            <Field label="Admin temporary password"><input type="password" value={f.adminPassword} onChange={set('adminPassword')} minLength={8} required /></Field>
          </div>
          <ErrorMsg error={add.error} />{created && <p className="badge good">{created}</p>}
          <div><button disabled={add.busy}>Create organization</button></div>
        </form>
      </Card>
    </div>
  );
}
