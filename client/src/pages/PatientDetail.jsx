import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad } from '../hooks.js';
import { fmtDateTime, fmtDate, label } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Modal, Table, Tabs, useFormState } from '../components/ui.jsx';
import { useState } from 'react';

function PortalAccount({ patient, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, set] = useFormState({ email: patient.email ?? '', password: '' });
  const save = useAction(async (e) => {
    e.preventDefault();
    await api(`/admin/patients/${patient._id}/portal-account`, { method: 'POST', body: f });
    setOpen(false);
    onDone();
  });
  if (patient.user) return <span className="badge good">Portal access</span>;
  return (
    <>
      <button className="secondary small" onClick={() => setOpen(true)}>Create portal login</button>
      {open && (
        <Modal title="Create patient portal login" onClose={() => setOpen(false)}>
          <form onSubmit={save.run}>
            <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
            <Field label="Temporary password" hint="At least 8 characters"><input type="password" value={f.password} onChange={set('password')} minLength={8} required /></Field>
            <ErrorMsg error={save.error} />
            <button disabled={save.busy}>Create</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const p = useLoad(() => api(`/patients/${id}`), [id]);
  const timeline = useLoad(() => api(`/patients/${id}/timeline`), [id]);
  const clinical = ['doctor', 'nurse', 'clinic_admin', 'super_admin'].includes(user.role);
  const doctorLike = ['doctor', 'clinic_admin', 'super_admin'].includes(user.role);
  const vitals = useLoad(() => (clinical ? api(`/clinical/patients/${id}/vitals`) : Promise.resolve([])), [id]);
  const consults = useLoad(() => (doctorLike ? api(`/clinical/patients/${id}/consultations`) : Promise.resolve([])), [id]);
  const rx = useLoad(() => (doctorLike ? api(`/clinical/patients/${id}/prescriptions`) : Promise.resolve([])), [id]);

  if (!p.data) return <Loading loading={p.loading} error={p.error} />;
  const x = p.data;

  const tabs = [
    { id: 'timeline', title: 'Timeline', render: () => <Table rows={timeline.data} empty="No history yet." columns={[{ h: 'When', c: (e) => fmtDateTime(e.at) }, { h: 'Type', c: (e) => label(e.type) }, { h: 'Status', c: (e) => <Badge value={e.status} /> }]} /> },
    ...(clinical ? [{ id: 'vitals', title: 'Vitals', render: () => (
      <Table rows={vitals.data} empty="No vitals recorded." columns={[
        { h: 'When', c: (r) => fmtDateTime(r.vitals.createdAt) },
        { h: 'BP', c: (r) => (r.vitals.bloodPressure ? <span className={r.flags.systolic || r.flags.diastolic ? 'error' : ''}>{r.vitals.bloodPressure.systolic}/{r.vitals.bloodPressure.diastolic}</span> : '') },
        { h: 'HR', c: (r) => r.vitals.heartRate ?? '' },
        { h: 'Temp', c: (r) => r.vitals.temperature ?? '' },
        { h: 'SpO2', c: (r) => r.vitals.spo2 ?? '' },
        { h: 'Weight', c: (r) => r.vitals.weight ?? '' },
        { h: 'BMI', c: (r) => r.vitals.bmi ?? '' },
      ]} />
    ) }] : []),
    ...(doctorLike ? [
      { id: 'consults', title: 'Consultations', render: () => (
        <Table rows={consults.data} empty="No consultations." columns={[{ h: 'Date', c: (c) => fmtDate(c.createdAt) }, { h: 'Complaint', c: (c) => c.chiefComplaints ?? '' }, { h: 'Diagnosis', c: (c) => (c.diagnosis ?? []).join(', ') }, { h: 'Follow-up', c: (c) => c.followUpDate ?? '' }]} />
      ) },
      { id: 'rx', title: 'Prescriptions', render: () => (
        <Table rows={rx.data} empty="No prescriptions." columns={[{ h: 'Date', c: (r) => fmtDate(r.createdAt) }, { h: 'Medicines', c: (r) => r.items.map((i) => `${i.medicine} ${i.dosage} ${i.frequency} x ${i.duration}`).join('; ') }, { h: 'Status', c: (r) => <Badge value={r.status} /> }]} />
      ) },
    ] : []),
  ];

  return (
    <div className="stack">
      <div className="row spread">
        <h1>{x.name} <small className="muted">{x.patientId}</small></h1>
        {['receptionist', 'clinic_admin', 'super_admin'].includes(user.role) && <PortalAccount patient={x} onDone={p.reload} />}
      </div>
      <div className="grid cols-2">
        <Card title="Profile">
          <p>Phone: {x.phone}{x.email ? ` · ${x.email}` : ''}</p>
          <p>Gender: {x.gender ?? '-'} · DOB: {fmtDate(x.dob) || '-'} · Blood group: {x.bloodGroup ?? '-'}</p>
          <p>Address: {x.address ?? '-'}</p>
          {x.emergencyContact?.name && <p>Emergency: {x.emergencyContact.name} ({x.emergencyContact.relation ?? 'contact'}) {x.emergencyContact.phone}</p>}
          {x.notes && <p>Notes: {x.notes}</p>}
        </Card>
        <Card title="Medical">
          {x.allergies?.length ? <div className="alert">Allergies: {x.allergies.join(', ')}</div> : <p className="muted">No known allergies.</p>}
          <p>History: {x.medicalHistory?.length ? x.medicalHistory.join(', ') : '-'}</p>
        </Card>
      </div>
      <Card><Tabs tabs={tabs} /></Card>
    </div>
  );
}
