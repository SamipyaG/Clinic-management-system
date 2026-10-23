import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad } from '../hooks.js';
import { fmtDateTime, money, toMinor } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Modal, Table, Tabs, useFormState } from '../components/ui.jsx';

function ResultInput({ order, item, onDone }) {
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const save = useAction(async () => {
    const body = value !== '' ? { value: Number(value) } : { textResult: text };
    await api(`/lab/orders/${order._id}/items/${item._id}/result`, { method: 'POST', body });
    onDone();
  });
  return (
    <div className="row">
      <input style={{ width: 110 }} type="number" step="any" placeholder={item.unit ?? 'value'} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Numeric result" />
      <input style={{ width: 160 }} placeholder="or text result" value={text} onChange={(e) => setText(e.target.value)} aria-label="Text result" />
      <button className="small" disabled={save.busy || (value === '' && !text)} onClick={save.run}>Save</button>
      <ErrorMsg error={save.error} />
    </div>
  );
}

function OrderDetail({ id, role, onChanged }) {
  const order = useLoad(() => api(`/lab/orders/${id}`), [id]);
  const step = useAction(async (path) => {
    await api(path, { method: 'POST' });
    await order.reload();
    onChanged();
  });
  const [notes, setNotes] = useState('');
  const review = useAction(async () => {
    await api(`/lab/orders/${id}/review`, { method: 'POST', body: { notes: notes || undefined } });
    await order.reload();
    onChanged();
  });
  if (!order.data) return <Loading loading={order.loading} error={order.error} />;
  const o = order.data;
  const canProcess = ['lab_staff', 'clinic_admin', 'super_admin'].includes(role);
  const canReview = ['doctor', 'clinic_admin', 'super_admin'].includes(role);

  return (
    <>
      <p>{o.patient?.name} · {o.patient?.patientId} · <Badge value={o.status} /></p>
      <ErrorMsg error={step.error} />
      <Table rows={o.items} columns={[
        { h: 'Test', c: (i) => i.name },
        { h: 'Status', c: (i) => <Badge value={i.status} /> },
        { h: 'Result', c: (i) => {
          if (i.status === 'resulted') return `${i.value ?? i.textResult}${i.unit ? ` ${i.unit}` : ''}${i.range ? ` (ref ${i.range.low}-${i.range.high})` : ''}`;
          if (i.status === 'processing' && canProcess) return <ResultInput order={o} item={i} onDone={() => { order.reload(); onChanged(); }} />;
          return '';
        } },
        { h: 'Flag', c: (i) => (i.flag ? <Badge value={i.flag} /> : '') },
        { h: '', c: (i) => {
          if (!canProcess) return null;
          if (i.status === 'ordered') return <button className="secondary small" disabled={step.busy} onClick={() => step.run(`/lab/orders/${o._id}/items/${i._id}/collect`)}>Sample collected</button>;
          if (i.status === 'collected') return <button className="secondary small" disabled={step.busy} onClick={() => step.run(`/lab/orders/${o._id}/items/${i._id}/process`)}>Start processing</button>;
          return null;
        } },
      ]} />
      {o.status === 'completed' && canReview && (
        <div style={{ marginTop: '1rem' }}>
          <Field label="Review notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <ErrorMsg error={review.error} />
          <button disabled={review.busy} onClick={review.run}>Mark reviewed</button>
        </div>
      )}
      {o.reviewNotes && <p className="muted">Review: {o.reviewNotes}</p>}
    </>
  );
}

function Catalog() {
  const { user } = useAuth();
  const tests = useLoad(() => api('/lab/tests'));
  const [f, set, reset] = useFormState({ code: '', name: '', unit: '', sampleType: '', price: '', low: '', high: '' });
  const save = useAction(async (e) => {
    e.preventDefault();
    await api('/lab/tests', { method: 'POST', body: {
      code: f.code, name: f.name, unit: f.unit || undefined, sampleType: f.sampleType || undefined, price: toMinor(f.price || 0),
      referenceRanges: f.low !== '' && f.high !== '' ? [{ gender: 'any', low: Number(f.low), high: Number(f.high) }] : [],
    } });
    reset();
    tests.reload();
  });
  const canManage = ['clinic_admin', 'super_admin'].includes(user.role);
  return (
    <div className="stack">
      <Table rows={tests.data} empty="No tests yet." columns={[
        { h: 'Code', c: (t) => t.code }, { h: 'Name', c: (t) => t.name }, { h: 'Sample', c: (t) => t.sampleType ?? '' },
        { h: 'Range', c: (t) => t.referenceRanges.map((r) => `${r.low}-${r.high}${t.unit ? ` ${t.unit}` : ''}`).join(', ') },
        { h: 'Price', c: (t) => money(t.price), right: true },
      ]} />
      {canManage && (
        <Card title="Add test">
          <form onSubmit={save.run}>
            <div className="form-grid">
              <Field label="Code"><input value={f.code} onChange={set('code')} required /></Field>
              <Field label="Name"><input value={f.name} onChange={set('name')} required /></Field>
              <Field label="Unit"><input value={f.unit} onChange={set('unit')} /></Field>
              <Field label="Sample type"><input value={f.sampleType} onChange={set('sampleType')} /></Field>
              <Field label="Price"><input type="number" step="0.01" min="0" value={f.price} onChange={set('price')} /></Field>
              <Field label="Normal low"><input type="number" step="any" value={f.low} onChange={set('low')} /></Field>
              <Field label="Normal high"><input type="number" step="any" value={f.high} onChange={set('high')} /></Field>
            </div>
            <ErrorMsg error={save.error} />
            <button disabled={save.busy}>Add test</button>
          </form>
        </Card>
      )}
    </div>
  );
}

export default function Lab() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const orders = useLoad(() => api(`/lab/orders${status ? `?status=${status}` : ''}`), [status]);

  return (
    <div className="stack">
      <h1>Laboratory</h1>
      <Tabs tabs={[
        { id: 'orders', title: 'Orders', render: () => (
          <Card>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">All</option><option value="ordered">Ordered</option><option value="in_progress">In progress</option><option value="completed">Completed (needs review)</option><option value="reviewed">Reviewed</option>
              </select>
            </Field>
            <Loading loading={orders.loading && !orders.data} error={orders.error} />
            <Table rows={orders.data} empty="No lab orders." onRow={(o) => setOpen(o._id)} columns={[
              { h: 'Ordered', c: (o) => fmtDateTime(o.createdAt) },
              { h: 'Patient', c: (o) => o.patient?.name },
              { h: 'Tests', c: (o) => o.items.map((i) => i.name).join(', ') },
              { h: 'Status', c: (o) => <Badge value={o.status} /> },
            ]} />
          </Card>
        ) },
        { id: 'catalog', title: 'Test catalog', render: () => <Catalog /> },
      ]} />
      {open && <Modal title="Lab order" wide onClose={() => setOpen(null)}><OrderDetail id={open} role={user.role} onChanged={orders.reload} /></Modal>}
    </div>
  );
}
