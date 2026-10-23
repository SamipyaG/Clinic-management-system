import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useLoad, useRealtime } from '../hooks.js';
import { fmtDateTime, fmtTime } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Table, useFormState } from '../components/ui.jsx';

const EMPTY = { systolic: '', diastolic: '', heartRate: '', temperature: '', weight: '', height: '', spo2: '', respiratoryRate: '' };
const num = (v) => (v === '' ? undefined : Number(v));

function VitalsForm({ visit, onSaved }) {
  const [f, set, reset] = useFormState(EMPTY);
  const history = useLoad(() => api(`/clinical/patients/${visit.patient._id}/vitals?limit=5`), [visit._id]);
  const [flags, setFlags] = useState(null);

  const save = useAction(async (e) => {
    e.preventDefault();
    const body = {
      bloodPressure: f.systolic && f.diastolic ? { systolic: num(f.systolic), diastolic: num(f.diastolic) } : undefined,
      heartRate: num(f.heartRate), temperature: num(f.temperature), weight: num(f.weight), height: num(f.height), spo2: num(f.spo2), respiratoryRate: num(f.respiratoryRate),
    };
    const r = await api(`/clinical/visits/${visit._id}/vitals`, { method: 'POST', body });
    setFlags(r.flags);
    reset();
    history.reload();
    onSaved();
  });

  const abnormal = flags && Object.keys(flags).length > 0;
  return (
    <Card title={`Vitals · ${visit.patient.name} (token ${visit.token})`}>
      {visit.patient.allergies?.length > 0 && <div className="alert">Allergies: {visit.patient.allergies.join(', ')}</div>}
      <form onSubmit={save.run}>
        <div className="form-grid">
          <Field label="BP systolic (mmHg)"><input type="number" value={f.systolic} onChange={set('systolic')} /></Field>
          <Field label="BP diastolic (mmHg)"><input type="number" value={f.diastolic} onChange={set('diastolic')} /></Field>
          <Field label="Heart rate (bpm)"><input type="number" value={f.heartRate} onChange={set('heartRate')} /></Field>
          <Field label="Temperature (°C)"><input type="number" step="0.1" value={f.temperature} onChange={set('temperature')} /></Field>
          <Field label="SpO2 (%)"><input type="number" value={f.spo2} onChange={set('spo2')} /></Field>
          <Field label="Respiratory rate"><input type="number" value={f.respiratoryRate} onChange={set('respiratoryRate')} /></Field>
          <Field label="Weight (kg)"><input type="number" step="0.1" value={f.weight} onChange={set('weight')} /></Field>
          <Field label="Height (cm)"><input type="number" step="0.1" value={f.height} onChange={set('height')} /></Field>
        </div>
        <ErrorMsg error={save.error} />
        {flags && <p className={abnormal ? 'alert' : 'badge good'}>{abnormal ? `Outside normal range: ${Object.entries(flags).map(([k, v]) => `${k} ${v}`).join(', ')}` : 'Saved. All readings in range.'}</p>}
        <button disabled={save.busy}>{save.busy ? 'Saving...' : 'Save vitals'}</button>
      </form>
      <h3 style={{ margin: '1rem 0 .5rem' }}>Previous readings</h3>
      <Table rows={history.data} empty="No earlier readings." columns={[
        { h: 'When', c: (r) => fmtDateTime(r.vitals.createdAt) },
        { h: 'BP', c: (r) => (r.vitals.bloodPressure ? `${r.vitals.bloodPressure.systolic}/${r.vitals.bloodPressure.diastolic}` : '') },
        { h: 'HR', c: (r) => r.vitals.heartRate ?? '' },
        { h: 'Temp', c: (r) => r.vitals.temperature ?? '' },
        { h: 'SpO2', c: (r) => r.vitals.spo2 ?? '' },
        { h: 'Wt', c: (r) => r.vitals.weight ?? '' },
        { h: 'BMI', c: (r) => r.vitals.bmi ?? '' },
      ]} />
    </Card>
  );
}

export default function Nurse() {
  const [selected, setSelected] = useState(null);
  const waiting = useLoad(() => api('/queue/today?status=waiting'));
  useRealtime(['queue:updated'], waiting.reload);

  return (
    <div className="stack">
      <h1>Vitals</h1>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <Card title="Waiting patients">
          <Loading loading={waiting.loading && !waiting.data} error={waiting.error} />
          <Table rows={waiting.data} empty="Nobody is waiting." onRow={setSelected} columns={[
            { h: 'Token', c: (v) => <span className="token">{v.token}</span> },
            { h: 'Patient', c: (v) => v.patient?.name },
            { h: 'Doctor', c: (v) => v.doctor?.user?.name },
            { h: 'Since', c: (v) => fmtTime(v.checkedInAt) },
            { h: '', c: (v) => (selected?._id === v._id ? <Badge value="in_progress" /> : null) },
          ]} />
        </Card>
        {selected ? <VitalsForm key={selected._id} visit={selected} onSaved={() => {}} /> : <Card><p className="muted">Select a waiting patient to record vitals.</p></Card>}
      </div>
    </div>
  );
}
