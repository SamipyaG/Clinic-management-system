import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad } from '../hooks.js';
import { fmtDate } from '../format.js';
import { Card, ErrorMsg, Field, Loading, Modal, Table, useFormState } from '../components/ui.jsx';

const EMPTY = { name: '', phone: '', email: '', gender: '', dob: '', bloodGroup: '', address: '', allergies: '', medicalHistory: '', ecName: '', ecPhone: '', ecRelation: '', notes: '' };
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function PatientForm({ onDone }) {
  const [f, set] = useFormState(EMPTY);
  const save = useAction(async (e) => {
    e.preventDefault();
    const body = {
      name: f.name, phone: f.phone, notes: f.notes || undefined, address: f.address || undefined,
      email: f.email || undefined, gender: f.gender || undefined, dob: f.dob || undefined, bloodGroup: f.bloodGroup || undefined,
      allergies: list(f.allergies), medicalHistory: list(f.medicalHistory),
      emergencyContact: f.ecName ? { name: f.ecName, phone: f.ecPhone, relation: f.ecRelation || undefined } : undefined,
    };
    onDone(await api('/patients', { method: 'POST', body }));
  });
  return (
    <form onSubmit={save.run}>
      <div className="form-grid">
        <Field label="Full name"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} required minLength={5} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Gender">
          <select value={f.gender} onChange={set('gender')}><option value="">-</option><option>male</option><option>female</option><option>other</option></select>
        </Field>
        <Field label="Date of birth"><input type="date" value={f.dob} onChange={set('dob')} /></Field>
        <Field label="Blood group">
          <select value={f.bloodGroup} onChange={set('bloodGroup')}><option value="">-</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => <option key={g}>{g}</option>)}</select>
        </Field>
        <Field label="Address"><input value={f.address} onChange={set('address')} /></Field>
        <Field label="Allergies" hint="Comma separated"><input value={f.allergies} onChange={set('allergies')} /></Field>
        <Field label="Medical history" hint="Comma separated"><input value={f.medicalHistory} onChange={set('medicalHistory')} /></Field>
        <Field label="Emergency contact name"><input value={f.ecName} onChange={set('ecName')} /></Field>
        <Field label="Emergency contact phone"><input value={f.ecPhone} onChange={set('ecPhone')} required={!!f.ecName} /></Field>
        <Field label="Relation"><input value={f.ecRelation} onChange={set('ecRelation')} /></Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={set('notes')} /></Field>
      <ErrorMsg error={save.error} />
      <button disabled={save.busy}>{save.busy ? 'Saving...' : 'Register patient'}</button>
    </form>
  );
}

export default function Patients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { data, error, loading } = useLoad(() => api(`/patients?page=${page}&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`), [q, page]);
  const canRegister = ['receptionist', 'clinic_admin', 'super_admin'].includes(user.role);

  return (
    <div className="stack">
      <div className="row spread">
        <h1>Patients</h1>
        {canRegister && <button onClick={() => setAdding(true)}>Register patient</button>}
      </div>
      <Card>
        <Field label="Search"><input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, phone or patient ID" /></Field>
        <Loading loading={loading && !data} error={error} />
        {data && (
          <>
            <Table
              rows={data.items}
              onRow={(p) => navigate(`/patients/${p._id}`)}
              columns={[
                { h: 'ID', c: (p) => p.patientId },
                { h: 'Name', c: (p) => p.name },
                { h: 'Phone', c: (p) => p.phone },
                { h: 'Gender', c: (p) => p.gender ?? '' },
                { h: 'Blood', c: (p) => p.bloodGroup ?? '' },
                { h: 'Registered', c: (p) => fmtDate(p.createdAt) },
              ]}
            />
            <div className="row spread" style={{ marginTop: '.75rem' }}>
              <span className="muted">{data.total} patients</span>
              <div className="row">
                <button className="secondary small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button className="secondary small" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </Card>
      {adding && (
        <Modal title="Register patient" onClose={() => setAdding(false)} wide>
          <PatientForm onDone={(p) => navigate(`/patients/${p._id}`)} />
        </Modal>
      )}
    </div>
  );
}
