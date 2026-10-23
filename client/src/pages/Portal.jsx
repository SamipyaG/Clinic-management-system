import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad, useRealtime } from '../hooks.js';
import { fmtDate, fmtDateTime, label, money, todayStr } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Table, Tabs } from '../components/ui.jsx';
import { SlotPicker } from '../components/pickers.jsx';

function Book({ doctors, onDone }) {
  const [pick, setPick] = useState({});
  const [reason, setReason] = useState('');
  const save = useAction(async (e) => {
    e.preventDefault();
    await api('/portal/appointments', { method: 'POST', body: { doctor: pick.doctor, date: pick.date, time: pick.slot.startTime, reason: reason || undefined } });
    onDone();
  });
  return (
    <Card title="Book an appointment">
      <form onSubmit={save.run}>
        <SlotPicker doctors={doctors} onChange={setPick} initialDate={todayStr(1)} slotsPath={(d, date) => `/portal/doctors/${d}/slots?date=${date}`} />
        <Field label="Reason for visit"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorMsg error={save.error} />
        <button disabled={save.busy || !pick.slot}>{save.busy ? 'Booking...' : 'Book appointment'}</button>
      </form>
    </Card>
  );
}

export default function Portal() {
  const { user } = useAuth();
  const me = useLoad(() => api('/portal/me'));
  const appts = useLoad(() => api('/portal/appointments'));
  const doctors = useLoad(() => api('/doctors'));
  const rx = useLoad(() => api('/portal/prescriptions'));
  const labs = useLoad(() => api('/portal/lab-reports'));
  const bills = useLoad(() => api('/portal/invoices'));
  const history = useLoad(() => api('/portal/history'));
  const timeline = useLoad(() => api('/portal/timeline'));
  useRealtime(['notification:new'], () => { appts.reload(); labs.reload(); bills.reload(); });

  const cancel = useAction(async (id) => {
    await api(`/portal/appointments/${id}/cancel`, { method: 'POST' });
    appts.reload();
  });

  if (!me.data) return <Loading loading={me.loading} error={me.error} />;
  const upcoming = (appts.data ?? []).filter((a) => ['booked', 'confirmed'].includes(a.status) && new Date(a.start) > new Date());

  return (
    <div className="stack">
      <h1>Welcome, {user.name}</h1>
      <p className="muted">Patient ID {me.data.patientId}</p>
      <Tabs tabs={[
        { id: 'appts', title: 'Appointments', render: () => (
          <div className="stack">
            <Card title="Upcoming">
              <ErrorMsg error={cancel.error} />
              <Table rows={upcoming} empty="No upcoming appointments." columns={[
                { h: 'When', c: (a) => fmtDateTime(a.start) }, { h: 'Doctor', c: (a) => a.doctor?.user?.name }, { h: 'Status', c: (a) => <Badge value={a.status} /> },
                { h: '', c: (a) => <button className="danger small" onClick={() => window.confirm('Cancel this appointment?') && cancel.run(a._id)}>Cancel</button> },
              ]} />
            </Card>
            <Book doctors={doctors.data} onDone={appts.reload} />
            <Card title="Past appointments">
              <Table rows={(appts.data ?? []).filter((a) => !upcoming.includes(a))} empty="None." columns={[{ h: 'When', c: (a) => fmtDateTime(a.start) }, { h: 'Doctor', c: (a) => a.doctor?.user?.name }, { h: 'Status', c: (a) => <Badge value={a.status} /> }]} />
            </Card>
          </div>
        ) },
        { id: 'rx', title: 'Prescriptions', render: () => (
          <div className="stack">
            {rx.data?.length ? rx.data.map((p) => (
              <Card key={p._id} title={fmtDate(p.createdAt)} actions={<Badge value={p.status} />}>
                <Table rows={p.items} columns={[{ h: 'Medicine', c: (i) => i.medicine }, { h: 'Dosage', c: (i) => i.dosage }, { h: 'Frequency', c: (i) => i.frequency }, { h: 'Duration', c: (i) => i.duration }, { h: 'Instructions', c: (i) => i.instructions ?? '' }]} />
              </Card>
            )) : <p className="muted">No prescriptions.</p>}
          </div>
        ) },
        { id: 'lab', title: 'Lab reports', render: () => (
          <div className="stack">
            {labs.data?.length ? labs.data.map((o) => (
              <Card key={o._id} title={fmtDate(o.createdAt)}>
                <Table rows={o.items} columns={[{ h: 'Test', c: (i) => i.name }, { h: 'Result', c: (i) => `${i.value ?? i.textResult ?? ''}${i.unit ? ` ${i.unit}` : ''}` }, { h: 'Reference', c: (i) => (i.range ? `${i.range.low} - ${i.range.high}` : '') }, { h: 'Flag', c: (i) => (i.flag ? <Badge value={i.flag} /> : '') }]} />
                {o.reviewNotes && <p className="muted">Doctor's note: {o.reviewNotes}</p>}
              </Card>
            )) : <p className="muted">No reviewed lab reports yet.</p>}
          </div>
        ) },
        { id: 'bills', title: 'Invoices & payments', render: () => (
          <div className="stack">
            <Card title="Invoices"><Table rows={bills.data?.invoices} empty="No invoices." columns={[{ h: 'Invoice', c: (i) => i.number }, { h: 'Date', c: (i) => fmtDate(i.createdAt) }, { h: 'Total', c: (i) => money(i.total), right: true }, { h: 'Balance', c: (i) => money(i.balance), right: true }, { h: 'Status', c: (i) => <Badge value={i.status} /> }]} /></Card>
            <Card title="Payments"><Table rows={bills.data?.payments} empty="No payments." columns={[{ h: 'Receipt', c: (p) => p.receiptNo }, { h: 'Date', c: (p) => fmtDate(p.createdAt) }, { h: 'Method', c: (p) => label(p.method) }, { h: 'Amount', c: (p) => money(p.amount), right: true }]} /></Card>
          </div>
        ) },
        { id: 'hist', title: 'Medical history', render: () => (
          <div className="stack">
            <Card title="Allergies & conditions">
              <p>Allergies: {history.data?.allergies?.length ? history.data.allergies.join(', ') : 'None recorded'}</p>
              <p>Conditions: {history.data?.medicalHistory?.length ? history.data.medicalHistory.join(', ') : 'None recorded'}</p>
            </Card>
            <Card title="Past consultations"><Table rows={history.data?.consultations} empty="None." columns={[{ h: 'Date', c: (c) => fmtDate(c.createdAt) }, { h: 'Diagnosis', c: (c) => (c.diagnosis ?? []).join(', ') }, { h: 'Treatment', c: (c) => c.treatment ?? '' }, { h: 'Follow-up', c: (c) => c.followUpDate ?? '' }]} /></Card>
            <Card title="Timeline"><Table rows={timeline.data} empty="Nothing yet." columns={[{ h: 'When', c: (e) => fmtDateTime(e.at) }, { h: 'Event', c: (e) => label(e.type) }, { h: 'Status', c: (e) => <Badge value={e.status} /> }]} /></Card>
          </div>
        ) },
      ]} />
    </div>
  );
}
