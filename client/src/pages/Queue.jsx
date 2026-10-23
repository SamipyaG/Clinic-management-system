import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad, useRealtime } from '../hooks.js';
import { fmtTime, todayStr } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Table } from '../components/ui.jsx';
import { PatientPicker, useDoctors } from '../components/pickers.jsx';

function CheckIn({ doctors, onDone }) {
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [appointment, setAppointment] = useState('');
  const appts = useLoad(
    () => (patient ? api(`/appointments?date=${todayStr()}&patient=${patient._id}`) : Promise.resolve([])),
    [patient?._id],
  );
  const eligible = (appts.data ?? []).filter((a) => ['booked', 'confirmed'].includes(a.status));

  const save = useAction(async (e) => {
    e.preventDefault();
    await api('/queue/check-in', { method: 'POST', body: { patient: patient._id, doctor, appointment: appointment || undefined, emergency } });
    setPatient(null); setAppointment(''); setEmergency(false);
    onDone();
  });

  const chooseAppt = (id) => {
    setAppointment(id);
    const a = eligible.find((x) => x._id === id);
    if (a) setDoctor(a.doctor?._id ?? doctor);
  };

  return (
    <Card title="Check in a patient">
      <form onSubmit={save.run}>
        <PatientPicker value={patient} onPick={(p) => { setPatient(p); setAppointment(''); }} />
        {patient && eligible.length > 0 && (
          <Field label="Today's appointment">
            <select value={appointment} onChange={(e) => chooseAppt(e.target.value)}>
              <option value="">Walk-in (no appointment)</option>
              {eligible.map((a) => <option key={a._id} value={a._id}>{fmtTime(a.start)} · {a.doctor?.user?.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Doctor">
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)} required disabled={!!appointment}>
            <option value="">Select doctor</option>
            {(doctors ?? []).map((d) => <option key={d._id} value={d._id}>{d.user?.name} · {d.department?.name}</option>)}
          </select>
        </Field>
        <label className="row" style={{ marginBottom: '.75rem' }}><input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} /> Emergency (goes to the front)</label>
        <ErrorMsg error={save.error} />
        <button disabled={save.busy || !patient || !doctor}>{save.busy ? 'Checking in...' : 'Check in & issue token'}</button>
      </form>
    </Card>
  );
}

export default function Queue() {
  const { user } = useAuth();
  const doctors = useDoctors();
  const today = useLoad(() => api('/queue/today'));
  useRealtime(['queue:updated'], today.reload);

  const act = useAction(async (path) => {
    await api(path, { method: 'POST' });
    today.reload();
  });

  const byDoctor = new Map();
  (today.data ?? []).forEach((v) => {
    const key = v.doctor?._id;
    byDoctor.set(key, [...(byDoctor.get(key) ?? []), v]);
  });

  return (
    <div className="stack">
      <h1>Check-in & Queue</h1>
      <div className="grid cols-2">
        <CheckIn doctors={doctors.data} onDone={today.reload} />
        <Card title="Public queue display">
          <p className="muted">Show this on the waiting-room TV. It shows token numbers only.</p>
          <a className="btn" href={`/display/${user.clinic}`} target="_blank" rel="noreferrer">Open display screen</a>
        </Card>
      </div>
      <ErrorMsg error={act.error} />
      <Loading loading={today.loading && !today.data} error={today.error} />
      {[...byDoctor.entries()].map(([id, visits]) => {
        const waiting = visits.filter((v) => v.status === 'waiting').sort((a, b) => a.priority - b.priority || new Date(a.checkedInAt) - new Date(b.checkedInAt));
        const current = visits.filter((v) => v.status === 'in_consultation');
        return (
          <Card key={id} title={`Dr ${visits[0].doctor?.user?.name ?? ''}`} actions={<button disabled={!waiting.length || act.busy} onClick={() => act.run(`/queue/doctor/${id}/call-next`)}>Call next</button>}>
            <Table
              rows={[...current, ...waiting, ...visits.filter((v) => v.status === 'completed')]}
              columns={[
                { h: 'Token', c: (v) => <span className="token">{v.token}</span> },
                { h: 'Patient', c: (v) => `${v.patient?.name ?? ''}${v.patient?.allergies?.length ? ' ⚠' : ''}` },
                { h: 'Type', c: (v) => (v.source === 'emergency' ? <Badge value="cancelled" /> : v.source) },
                { h: 'Checked in', c: (v) => fmtTime(v.checkedInAt) },
                { h: 'Status', c: (v) => <Badge value={v.status} /> },
                { h: '', c: (v) => (v.status === 'in_consultation' ? <button className="secondary small" onClick={() => act.run(`/queue/visits/${v._id}/complete`)}>Complete</button> : null) },
              ]}
            />
          </Card>
        );
      })}
    </div>
  );
}
