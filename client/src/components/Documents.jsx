import { useRef, useState } from 'react';
import { api, downloadFile, uploadFile } from '../api.js';
import { useAction, useLoad } from '../hooks.js';
import { fmtDateTime, label } from '../format.js';
import { Badge, ErrorMsg, Field, Table } from './ui.jsx';

const KINDS = ['medical_report', 'lab_report', 'prescription', 'referral', 'scan', 'other'];
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Patient document list with upload/download. `canWrite`/`canDelete` only hide buttons; the API enforces. */
export default function Documents({ patientId, canWrite, canDelete }) {
  const docs = useLoad(() => api(`/documents?patient=${patientId}`), [patientId]);
  const [kind, setKind] = useState('medical_report');
  const [share, setShare] = useState(false);
  const input = useRef(null);

  const upload = useAction(async (e) => {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB.');
    await uploadFile(`/documents?patient=${patientId}&kind=${kind}&shared=${share}&name=${encodeURIComponent(file.name)}`, file);
    input.current.value = '';
    docs.reload();
  });
  const act = useAction(async (fn) => {
    await fn();
    docs.reload();
  });

  return (
    <div className="stack">
      <Table rows={docs.data} empty="No documents yet." columns={[
        { h: 'Name', c: (d) => d.name }, { h: 'Type', c: (d) => label(d.kind) }, { h: 'Size', c: (d) => size(d.size) },
        { h: 'Uploaded', c: (d) => fmtDateTime(d.createdAt) }, { h: 'Patient can see', c: (d) => (d.sharedWithPatient ? <Badge value="ok" /> : <span className="muted">No</span>) },
        { h: '', c: (d) => (
          <div className="row">
            <button className="secondary small" onClick={() => act.run(() => downloadFile(`/documents/${d._id}/download`, d.name))}>Download</button>
            {canWrite && <button className="secondary small" onClick={() => act.run(() => api(`/documents/${d._id}`, { method: 'PATCH', body: { sharedWithPatient: !d.sharedWithPatient } }))}>{d.sharedWithPatient ? 'Unshare' : 'Share'}</button>}
            {canDelete && <button className="danger small" onClick={() => window.confirm(`Delete ${d.name}?`) && act.run(() => api(`/documents/${d._id}`, { method: 'DELETE' }))}>Delete</button>}
          </div>
        ) },
      ]} />
      <ErrorMsg error={act.error} />
      {canWrite && (
        <form onSubmit={upload.run}>
          <div className="form-grid">
            <Field label="File (PDF, image or text, max 10 MB)"><input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/*,text/plain" required /></Field>
            <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
          </div>
          <label className="row" style={{ marginBottom: '.75rem' }}><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share with the patient in their portal</label>
          <ErrorMsg error={upload.error} />
          <button disabled={upload.busy}>{upload.busy ? 'Uploading...' : 'Upload document'}</button>
        </form>
      )}
    </div>
  );
}
