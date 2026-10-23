import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAction, useLoad, useRealtime } from '../hooks.js';
import { fmtDate, fmtDateTime, fmtTime } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Table, Tabs, useFormState } from '../components/ui.jsx';

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function ConsultationForm({ visit }) {
  const existing = useLoad(() => api(`/clinical/visits/${visit._id}/consultation`).catch((e) => (e.status === 404 ? null : Promise.reject(e))), [visit._id]);
  const [f, set, , setAll] = useFormState({ chiefComplaints: '', symptoms: '', diagnosis: '', treatment: '', notes: '', followUpDate: '' });
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const c = existing.data;
    if (c) setAll({ chiefComplaints: c.chiefComplaints ?? '', symptoms: (c.symptoms ?? []).join(', '), diagnosis: (c.diagnosis ?? []).join(', '), treatment: c.treatment ?? '', notes: c.notes ?? '', followUpDate: c.followUpDate ?? '' });
  }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(async (e) => {
    e.preventDefault();
    await api(`/clinical/visits/${visit._id}/consultation`, {
      method: 'PUT',
      body: { chiefComplaints: f.chiefComplaints, symptoms: csv(f.symptoms), diagnosis: csv(f.diagnosis), treatment: f.treatment, notes: f.notes, ...(f.followUpDate && { followUpDate: f.followUpDate }) },
    });
    setSaved(`Saved at ${new Date().toLocaleTimeString()}`);
  });

  return (
    <form onSubmit={save.run}>
      <Field label="Chief complaints"><textarea value={f.chiefComplaints} onChange={set('chiefComplaints')} /></Field>
      <div className="form-grid">
        <Field label="Symptoms" hint="Comma separated"><input value={f.symptoms} onChange={set('symptoms')} /></Field>
        <Field label="Diagnosis" hint="Comma separated"><input value={f.diagnosis} onChange={set('diagnosis')} /></Field>
        <Field label="Follow-up date"><input type="date" value={f.followUpDate} onChange={set('followUpDate')} /></Field>
      </div>
      <Field label="Treatment"><textarea value={f.treatment} onChange={set('treatment')} /></Field>
      <Field label="Doctor notes"><textarea value={f.notes} onChange={set('notes')} /></Field>
      <ErrorMsg error={save.error} />
      <div className="row"><button disabled={save.busy}>Save consultation</button><span className="muted">{saved}</span></div>
    </form>
  );
}

const BLANK_ITEM = { medicine: '', dosage: '', frequency: '', duration: '', route: 'oral', instructions: '' };

function PrescriptionForm({ visit, onSaved }) {
  const [items, setItems] = useState([{ ...BLANK_ITEM }]);
  const [notes, setNotes] = useState('');
  const update = (i, key, value) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [key]: value } : x)));
  const save = useAction(async (e) => {
    e.preventDefault();
    await api(`/clinical/visits/${visit._id}/prescriptions`, { method: 'POST', body: { items: items.map((i) => ({ ...i, instructions: i.instructions || undefined })), notes: notes || undefined } });
    setItems([{ ...BLANK_ITEM }]); setNotes('');
    onSaved();
  });
  return (
    <form onSubmit={save.run}>
      {visit.patient.allergies?.length > 0 && <div className="alert">Patient allergies: {visit.patient.allergies.join(', ')}</div>}
      {items.map((it, i) => (
        <div key={i} className="form-grid" style={{ borderBottom: '1px solid var(--line)', marginBottom: '.5rem' }}>
          <Field label="Medicine"><input value={it.medicine} onChange={(e) => update(i, 'medicine', e.target.value)} required /></Field>
          <Field label="Dosage"><input value={it.dosage} onChange={(e) => update(i, 'dosage', e.target.value)} placeholder="500 mg" required /></Field>
          <Field label="Frequency"><input value={it.frequency} onChange={(e) => update(i, 'frequency', e.target.value)} placeholder="3 times a day" required /></Field>
          <Field label="Duration"><input value={it.duration} onChange={(e) => update(i, 'duration', e.target.value)} placeholder="5 days" required /></Field>
          <Field label="Route"><input value={it.route} onChange={(e) => update(i, 'route', e.target.value)} /></Field>
          <Field label="Instructions"><input value={it.instructions} onChange={(e) => update(i, 'instructions', e.target.value)} placeholder="After meals" /></Field>
          {items.length > 1 && <button type="button" className="secondary small" style={{ alignSelf: 'center' }} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>Remove</button>}
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => setItems((xs) => [...xs, { ...BLANK_ITEM }])}>Add medicine</button>
      <Field label="Notes to pharmacist"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <ErrorMsg error={save.error} />
      <button disabled={save.busy}>Issue prescription</button>
    </form>
  );
}

function LabOrderForm({ visit, onSaved }) {
  const tests = useLoad(() => api('/lab/tests'));
  const [chosen, setChosen] = useState([]);
  const save = useAction(async () => {
    await api('/lab/orders', { method: 'POST', body: { visit: visit._id, tests: chosen } });
    setChosen([]);
    onSaved();
  });
  const toggle = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <>
      <Loading loading={tests.loading} error={tests.error} />
      {tests.data?.length === 0 && <p className="muted">No tests in the catalog yet. Ask the admin or lab to add some.</p>}
      <div className="stack">
        {tests.data?.map((t) => (
          <label key={t._id} className="row"><input type="checkbox" checked={chosen.includes(t._id)} onChange={() => toggle(t._id)} /> {t.name} <span className="muted">({t.code})</span></label>
        ))}
      </div>
      <ErrorMsg error={save.error} />
      <button style={{ marginTop: '.75rem' }} disabled={!chosen.length || save.busy} onClick={save.run}>Order selected tests</button>
    </>
  );
}

function ReferralForm({ visit, doctors, onSaved }) {
  const [f, set, reset] = useFormState({ toDoctor: '', externalFacility: '', reason: '', notes: '' });
  const save = useAction(async (e) => {
    e.preventDefault();
    await api(`/clinical/visits/${visit._id}/referrals`, { method: 'POST', body: { toDoctor: f.toDoctor || undefined, externalFacility: f.externalFacility || undefined, reason: f.reason, notes: f.notes || undefined } });
    reset();
    onSaved();
  });
  return (
    <form onSubmit={save.run}>
      <div className="form-grid">
        <Field label="Refer to doctor (internal)">
          <select value={f.toDoctor} onChange={set('toDoctor')}><option value="">-</option>{doctors?.map((d) => <option key={d._id} value={d._id}>{d.user?.name} · {d.department?.name}</option>)}</select>
        </Field>
        <Field label="Or external facility"><input value={f.externalFacility} onChange={set('externalFacility')} /></Field>
      </div>
      <Field label="Reason"><input value={f.reason} onChange={set('reason')} required /></Field>
      <Field label="Notes"><textarea value={f.notes} onChange={set('notes')} /></Field>
      <ErrorMsg error={save.error} />
      <button disabled={save.busy}>Create referral</button>
    </form>
  );
}

function History({ patientId, refreshKey }) {
  const vitals = useLoad(() => api(`/clinical/patients/${patientId}/vitals?limit=5`), [patientId, refreshKey]);
  const consults = useLoad(() => api(`/clinical/patients/${patientId}/consultations`), [patientId, refreshKey]);
  const rx = useLoad(() => api(`/clinical/patients/${patientId}/prescriptions`), [patientId, refreshKey]);
  const labs = useLoad(() => api(`/lab/orders?patient=${patientId}`), [patientId, refreshKey]);
  return (
    <Tabs tabs={[
      { id: 'v', title: 'Vitals', render: () => <Table rows={vitals.data} empty="No vitals." columns={[{ h: 'When', c: (r) => fmtDateTime(r.vitals.createdAt) }, { h: 'BP', c: (r) => (r.vitals.bloodPressure ? `${r.vitals.bloodPressure.systolic}/${r.vitals.bloodPressure.diastolic}` : '') }, { h: 'HR', c: (r) => r.vitals.heartRate ?? '' }, { h: 'Temp', c: (r) => r.vitals.temperature ?? '' }, { h: 'SpO2', c: (r) => r.vitals.spo2 ?? '' }]} /> },
      { id: 'c', title: 'Past consultations', render: () => <Table rows={consults.data} empty="None." columns={[{ h: 'Date', c: (c) => fmtDate(c.createdAt) }, { h: 'Diagnosis', c: (c) => (c.diagnosis ?? []).join(', ') }, { h: 'Treatment', c: (c) => c.treatment ?? '' }]} /> },
      { id: 'r', title: 'Past prescriptions', render: () => <Table rows={rx.data} empty="None." columns={[{ h: 'Date', c: (r) => fmtDate(r.createdAt) }, { h: 'Medicines', c: (r) => r.items.map((i) => `${i.medicine} ${i.dosage}`).join('; ') }, { h: 'Status', c: (r) => <Badge value={r.status} /> }]} /> },
      { id: 'l', title: 'Lab reports', render: () => (
        <Table rows={labs.data} empty="No lab orders." columns={[
          { h: 'Date', c: (o) => fmtDate(o.createdAt) },
          { h: 'Tests', c: (o) => o.items.map((i) => `${i.name}${i.value != null ? `: ${i.value}${i.unit ? ` ${i.unit}` : ''}` : ''}`).join('; ') },
          { h: 'Flags', c: (o) => o.items.filter((i) => i.flag && i.flag !== 'normal').map((i) => <Badge key={i._id} value={i.flag} />) },
          { h: 'Status', c: (o) => <Badge value={o.status} /> },
        ]} />
      ) },
    ]} />
  );
}

function Consultation({ visitId, doctors, onFinish }) {
  const visit = useLoad(() => api(`/queue/visits/${visitId}`), [visitId]);
  const [key, setKey] = useState(0);
  const bump = () => setKey((k) => k + 1);
  const finish = useAction(async () => {
    await api(`/queue/visits/${visitId}/complete`, { method: 'POST' });
    onFinish();
  });
  if (!visit.data) return <Loading loading={visit.loading} error={visit.error} />;
  const v = visit.data;
  return (
    <div className="stack">
      <Card title={`${v.patient.name} · token ${v.token}`} actions={<button className="danger" disabled={finish.busy} onClick={() => window.confirm('Finish this consultation?') && finish.run()}>Finish consultation</button>}>
        <p className="muted">{v.patient.patientId} · {v.patient.gender ?? ''} {v.patient.dob ? `· born ${fmtDate(v.patient.dob)}` : ''} · Blood group {v.patient.bloodGroup ?? '-'}</p>
        {v.patient.allergies?.length > 0 && <div className="alert">Allergies: {v.patient.allergies.join(', ')}</div>}
        {v.patient.medicalHistory?.length > 0 && <p>History: {v.patient.medicalHistory.join(', ')}</p>}
        <ErrorMsg error={finish.error} />
      </Card>
      <Card>
        <Tabs tabs={[
          { id: 'c', title: 'Consultation', render: () => <ConsultationForm visit={v} /> },
          { id: 'rx', title: 'Prescription', render: () => <PrescriptionForm visit={v} onSaved={bump} /> },
          { id: 'lab', title: 'Lab tests', render: () => <LabOrderForm visit={v} onSaved={bump} /> },
          { id: 'ref', title: 'Referral', render: () => <ReferralForm visit={v} doctors={doctors} onSaved={bump} /> },
        ]} />
      </Card>
      <Card title="Patient history"><History patientId={v.patient._id} refreshKey={key} /></Card>
    </div>
  );
}

export default function DoctorWorkspace() {
  const me = useLoad(() => api('/doctors/me'));
  const doctors = useLoad(() => api('/doctors'));
  const doctorId = me.data?._id;
  const queue = useLoad(() => (doctorId ? api(`/queue/doctor/${doctorId}`) : Promise.resolve([])), [doctorId]);
  const today = useLoad(() => api('/queue/today?status=in_consultation'), []);
  const [active, setActive] = useState(null);
  useRealtime(['queue:updated'], () => { queue.reload(); today.reload(); });

  const call = useAction(async () => {
    const v = await api(`/queue/doctor/${doctorId}/call-next`, { method: 'POST' });
    setActive(v._id);
    queue.reload();
    today.reload();
  });

  if (!me.data) return <Loading loading={me.loading} error={me.error} />;
  const mine = (today.data ?? []).filter((v) => v.doctor?._id === doctorId);

  return (
    <div className="stack">
      <div className="row spread">
        <h1>My consultations</h1>
        <button onClick={call.run} disabled={call.busy || !queue.data?.length}>Call next patient</button>
      </div>
      <ErrorMsg error={call.error} />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <Card title={`Waiting (${queue.data?.length ?? 0})`}>
          <Table rows={queue.data} empty="Nobody is waiting." columns={[
            { h: '#', c: (q) => q.position },
            { h: 'Token', c: (q) => <span className="token">{q.visit.token}</span> },
            { h: 'Patient', c: (q) => `${q.visit.patient?.name ?? ''}${q.visit.source === 'emergency' ? ' (EMERGENCY)' : ''}` },
            { h: 'Wait', c: (q) => `~${q.estimatedWaitMinutes} min` },
            { h: 'Since', c: (q) => fmtTime(q.visit.checkedInAt) },
          ]} />
        </Card>
        <Card title="In consultation">
          <Table rows={mine} empty="No active consultation." onRow={(v) => setActive(v._id)} columns={[
            { h: 'Token', c: (v) => <span className="token">{v.token}</span> },
            { h: 'Patient', c: (v) => v.patient?.name },
            { h: '', c: (v) => (active === v._id ? <Badge value="in_progress" /> : <span className="muted">Open</span>) },
          ]} />
        </Card>
      </div>
      {active && <Consultation key={active} visitId={active} doctors={doctors.data} onFinish={() => { setActive(null); queue.reload(); today.reload(); }} />}
    </div>
  );
}
