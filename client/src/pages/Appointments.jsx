import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad, useRealtime } from '../hooks.js';
import { fmtTime, todayStr } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Modal, Table, useFormState } from '../components/ui.jsx';
import { PatientPicker, SlotPicker, useDoctors } from '../components/pickers.jsx';

function BookForm({ onDone }) {
  const doctors = useDoctors();
  const [patient, setPatient] = useState(null);
  const [pick, setPick] = useState({});
  const [f, set] = useFormState({ type: 'new', reason: '', repeat: false, everyDays: 7, count: 4 });

  const save = useAction(async (e) => {
    e.preventDefault();
    const body = {
      patient: patient._id, doctor: pick.doctor, date: pick.date, time: pick.slot.startTime, type: f.type, reason: f.reason || undefined,
      recurrence: f.repeat ? { everyDays: Number(f.everyDays), count: Number(f.count) } : undefined,
    };
    const r = await api('/appointments', { method: 'POST', body });
    onDone(r.conflicts?.length ? `Booked ${r.booked.length}; skipped ${r.conflicts.length} unavailable date(s).` : 'Appointment booked.');
  });

  return (
    <form onSubmit={save.run}>
      <PatientPicker value={patient} onPick={setPatient} />
      <SlotPicker doctors={doctors.data} onChange={setPick} initialDate={todayStr()} />
      <div className="form-grid">
        <Field label="Type"><select value={f.type} onChange={set('type')}><option value="new">New</option><option value="followup">Follow-up</option></select></Field>
        <Field label="Reason"><input value={f.reason} onChange={set('reason')} /></Field>
      </div>
      <label className="row" style={{ marginBottom: '.75rem' }}><input type="checkbox" checked={f.repeat} onChange={set('repeat')} /> Repeat this appointment</label>
      {f.repeat && (
        <div className="form-grid">
          <Field label="Every (days)"><input type="number" min="1" value={f.everyDays} onChange={set('everyDays')} /></Field>
          <Field label="Number of visits"><input type="number" min="2" max="52" value={f.count} onChange={set('count')} /></Field>
        </div>
      )}
      <ErrorMsg error={save.error} />
      <button disabled={save.busy || !patient || !pick.slot}>{save.busy ? 'Booking...' : 'Book appointment'}</button>
    </form>
  );
}

function RescheduleForm({ appt, doctors, onDone }) {
  const [pick, setPick] = useState({});
  const save = useAction(async () => {
    await api(`/appointments/${appt._id}/reschedule`, { method: 'POST', body: { date: pick.date, time: pick.slot.startTime } });
    onDone();
  });
  return (
    <>
      <SlotPicker doctors={(doctors ?? []).filter((d) => d._id === appt.doctor?._id)} onChange={setPick} initialDate={appt.date} />
      <ErrorMsg error={save.error} />
      <button onClick={save.run} disabled={save.busy || !pick.slot || !pick.doctor}>Reschedule</button>
    </>
  );
}

export default function Appointments() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [booking, setBooking] = useState(false);
  const [resched, setResched] = useState(null);
  const [note, setNote] = useState('');
  const doctors = useDoctors();
  const list = useLoad(() => api(`/appointments?date=${date}`), [date]);
  useRealtime(['appointment:changed'], list.reload);
  const canEdit = ['receptionist', 'clinic_admin', 'super_admin'].includes(user.role);

  const act = useAction(async (id, action) => {
    await api(`/appointments/${id}/${action}`, { method: 'POST', body: action === 'cancel' ? {} : undefined });
    list.reload();
  });

  return (
    <div className="stack">
      <div className="row spread">
        <h1>Appointments</h1>
        {canEdit && <button onClick={() => { setNote(''); setBooking(true); }}>New appointment</button>}
      </div>
      {note && <p className="badge good">{note}</p>}
      <Card>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} /></Field>
        <Loading loading={list.loading && !list.data} error={list.error} />
        <ErrorMsg error={act.error} />
        {list.data && (
          <Table
            rows={list.data}
            empty="No appointments on this date."
            columns={[
              { h: 'Time', c: (a) => fmtTime(a.start) },
              { h: 'Patient', c: (a) => `${a.patient?.name ?? ''} (${a.patient?.patientId ?? ''})` },
              { h: 'Doctor', c: (a) => a.doctor?.user?.name ?? '' },
              { h: 'Type', c: (a) => a.type },
              { h: 'Status', c: (a) => <Badge value={a.status} /> },
              ...(canEdit ? [{ h: '', c: (a) => (
                ['booked', 'confirmed'].includes(a.status) ? (
                  <div className="row">
                    {a.status === 'booked' && <button className="secondary small" onClick={() => act.run(a._id, 'confirm')}>Confirm</button>}
                    <button className="secondary small" onClick={() => setResched(a)}>Reschedule</button>
                    <button className="danger small" onClick={() => window.confirm('Cancel this appointment?') && act.run(a._id, 'cancel')}>Cancel</button>
                  </div>
                ) : null) }] : []),
            ]}
          />
        )}
      </Card>
      {booking && (
        <Modal title="Book appointment" onClose={() => setBooking(false)} wide>
          <BookForm onDone={(msg) => { setBooking(false); setNote(msg); list.reload(); }} />
        </Modal>
      )}
      {resched && (
        <Modal title="Reschedule appointment" onClose={() => setResched(null)}>
          <RescheduleForm appt={resched} doctors={doctors.data} onDone={() => { setResched(null); list.reload(); }} />
        </Modal>
      )}
    </div>
  );
}
