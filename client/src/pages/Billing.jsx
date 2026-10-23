import { useState } from 'react';
import { api, openFile, openHtml } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad } from '../hooks.js';
import { fmtDate, fmtDateTime, label, money, toMinor, todayStr } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Modal, Table, Tabs, useFormState } from '../components/ui.jsx';

function InvoiceDetail({ id, onChanged }) {
  const { user } = useAuth();
  const inv = useLoad(() => api(`/billing/invoices/${id}`), [id]);
  const [pay, setPay, resetPay] = useFormState({ method: 'cash', amount: '', reference: '' });
  const [line, setLine, resetLine] = useFormState({ type: 'service', description: '', qty: 1, unit: '' });
  const [disc, setDisc] = useFormState({ type: 'percent', value: '' });
  const refresh = () => { inv.reload(); onChanged(); };

  const addPayment = useAction(async (e, refund = false) => {
    e?.preventDefault?.();
    await api(`/billing/invoices/${id}/${refund ? 'refunds' : 'payments'}`, { method: 'POST', body: { method: pay.method, amount: toMinor(pay.amount), reference: pay.reference || undefined } });
    resetPay(); refresh();
  });
  const addLine = useAction(async (e) => {
    e.preventDefault();
    await api(`/billing/invoices/${id}/lines`, { method: 'POST', body: { type: line.type, description: line.description, qty: Number(line.qty), unit: toMinor(line.unit) } });
    resetLine(); refresh();
  });
  const setDiscount = useAction(async (e) => {
    e.preventDefault();
    await api(`/billing/invoices/${id}/discount`, { method: 'PUT', body: { type: disc.type, value: disc.type === 'fixed' ? toMinor(disc.value) : Number(disc.value) } });
    refresh();
  });
  const receipt = useAction((paymentId) => openHtml(`/billing/payments/${paymentId}/receipt?format=html`));

  if (!inv.data) return <Loading loading={inv.loading} error={inv.error} />;
  const { invoice: i, payments } = inv.data;
  const canDiscount = ['accountant', 'clinic_admin', 'super_admin'].includes(user.role);
  const canRefund = canDiscount;

  return (
    <div className="stack">
      <div className="row spread"><strong>{i.number} · {i.patient?.name}</strong><div className="row"><button className="secondary small" onClick={() => openFile(`/billing/invoices/${id}/pdf`)}>Invoice PDF</button><Badge value={i.status} /></div></div>
      <Table rows={i.lines} empty="No charges yet." columns={[
        { h: 'Item', c: (l) => `${l.description} (${l.type})` }, { h: 'Qty', c: (l) => l.qty, right: true },
        { h: 'Price', c: (l) => money(l.unit), right: true }, { h: 'Total', c: (l) => money(l.total), right: true },
      ]} />
      <div style={{ textAlign: 'right' }}>
        <div>Subtotal {money(i.subtotal)}</div>
        <div>Discount -{money(i.discount)}</div>
        <div>Tax ({i.taxPercent}%) {money(i.tax)}</div>
        <div><strong>Total {money(i.total)}</strong></div>
        <div>Paid {money(i.paid)} · <strong>Balance {money(i.balance)}</strong></div>
      </div>
      <Card title="Payments">
        <Table rows={payments} empty="No payments yet." columns={[
          { h: 'Receipt', c: (p) => p.receiptNo }, { h: 'When', c: (p) => fmtDateTime(p.createdAt) }, { h: 'Method', c: (p) => label(p.method) },
          { h: 'Amount', c: (p) => <span className={p.kind === 'refund' ? 'error' : ''}>{p.kind === 'refund' ? '-' : ''}{money(p.amount)}</span>, right: true },
          { h: '', c: (p) => <div className="row"><button className="secondary small" onClick={() => receipt.run(p._id)}>Receipt</button><button className="secondary small" onClick={() => openFile(`/billing/payments/${p._id}/receipt?format=pdf`)}>PDF</button></div> },
        ]} />
        <ErrorMsg error={receipt.error} />
        <form onSubmit={addPayment.run} style={{ marginTop: '.75rem' }}>
          <div className="form-grid">
            <Field label="Method"><select value={pay.method} onChange={setPay('method')}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="online">Online</option><option value="wallet">Digital wallet</option></select></Field>
            <Field label={`Amount (balance ${money(i.balance)})`}><input type="number" step="0.01" min="0.01" value={pay.amount} onChange={setPay('amount')} required /></Field>
            <Field label="Reference"><input value={pay.reference} onChange={setPay('reference')} /></Field>
          </div>
          <ErrorMsg error={addPayment.error} />
          <div className="row">
            <button disabled={addPayment.busy || !pay.amount}>Record payment</button>
            {canRefund && <button type="button" className="danger" disabled={addPayment.busy || !pay.amount} onClick={() => window.confirm('Refund this amount?') && addPayment.run(null, true)}>Refund</button>}
          </div>
        </form>
      </Card>
      <div className="grid cols-2">
        <Card title="Add charge">
          <form onSubmit={addLine.run}>
            <div className="form-grid">
              <Field label="Type"><select value={line.type} onChange={setLine('type')}><option value="service">Service</option><option value="procedure">Procedure</option></select></Field>
              <Field label="Description"><input value={line.description} onChange={setLine('description')} required /></Field>
              <Field label="Qty"><input type="number" min="0.01" step="any" value={line.qty} onChange={setLine('qty')} /></Field>
              <Field label="Unit price"><input type="number" min="0" step="0.01" value={line.unit} onChange={setLine('unit')} required /></Field>
            </div>
            <ErrorMsg error={addLine.error} /><button disabled={addLine.busy}>Add charge</button>
          </form>
        </Card>
        {canDiscount && (
          <Card title="Discount">
            <form onSubmit={setDiscount.run}>
              <div className="form-grid">
                <Field label="Type"><select value={disc.type} onChange={setDisc('type')}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></Field>
                <Field label="Value"><input type="number" min="0" step="0.01" value={disc.value} onChange={setDisc('value')} required /></Field>
              </div>
              <ErrorMsg error={setDiscount.error} /><button disabled={setDiscount.busy}>Apply discount</button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

function Invoices() {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const list = useLoad(() => api(`/billing/invoices${status ? `?status=${status}` : ''}`), [status]);
  const visits = useLoad(() => api('/queue/today'));
  const make = useAction(async (visitId) => {
    const inv = await api(`/billing/visits/${visitId}/invoice`, { method: 'POST' });
    list.reload();
    setOpen(inv._id);
  });
  return (
    <div className="stack">
      <Card title="Today's visits">
        <ErrorMsg error={make.error} />
        <Table rows={visits.data} empty="No visits today." columns={[
          { h: 'Token', c: (v) => v.token }, { h: 'Patient', c: (v) => v.patient?.name }, { h: 'Doctor', c: (v) => v.doctor?.user?.name },
          { h: 'Status', c: (v) => <Badge value={v.status} /> },
          { h: '', c: (v) => <button className="secondary small" disabled={make.busy} onClick={() => make.run(v._id)}>Create / update invoice</button> },
        ]} />
      </Card>
      <Card title="Invoices">
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }}><option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select></Field>
        <Loading loading={list.loading && !list.data} error={list.error} />
        <Table rows={list.data} onRow={(i) => setOpen(i._id)} empty="No invoices." columns={[
          { h: 'Invoice', c: (i) => i.number }, { h: 'Date', c: (i) => fmtDate(i.createdAt) }, { h: 'Patient', c: (i) => i.patient?.name },
          { h: 'Total', c: (i) => money(i.total), right: true }, { h: 'Balance', c: (i) => money(i.balance), right: true }, { h: 'Status', c: (i) => <Badge value={i.status} /> },
        ]} />
      </Card>
      {open && <Modal title="Invoice" wide onClose={() => setOpen(null)}><InvoiceDetail id={open} onChanged={list.reload} /></Modal>}
    </div>
  );
}

const CATEGORIES = ['rent', 'electricity', 'internet', 'staff', 'equipment', 'medicines', 'maintenance', 'other'];

function Expenses() {
  const { user } = useAuth();
  const list = useLoad(() => api('/expenses'));
  const [f, set, reset] = useFormState({ category: 'rent', amount: '', date: todayStr(), description: '' });
  const canWrite = ['accountant', 'clinic_admin', 'super_admin'].includes(user.role);
  const add = useAction(async (e) => {
    e.preventDefault();
    await api('/expenses', { method: 'POST', body: { category: f.category, amount: toMinor(f.amount), date: f.date, description: f.description || undefined } });
    reset(); list.reload();
  });
  const remove = useAction(async (id) => {
    await api(`/expenses/${id}`, { method: 'DELETE' });
    list.reload();
  });
  return (
    <div className="stack">
      {canWrite && (
        <Card title="Record expense">
          <form onSubmit={add.run}>
            <div className="form-grid">
              <Field label="Category"><select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Amount"><input type="number" step="0.01" min="0.01" value={f.amount} onChange={set('amount')} required /></Field>
              <Field label="Date"><input type="date" value={f.date} onChange={set('date')} required /></Field>
              <Field label="Description"><input value={f.description} onChange={set('description')} /></Field>
            </div>
            <ErrorMsg error={add.error} /><button disabled={add.busy}>Save expense</button>
          </form>
        </Card>
      )}
      <Card title={`Expenses · total ${money(list.data?.total ?? 0)}`}>
        <ErrorMsg error={remove.error} />
        <Table rows={list.data?.items} empty="No expenses." columns={[
          { h: 'Date', c: (e) => e.date }, { h: 'Category', c: (e) => label(e.category) }, { h: 'Description', c: (e) => e.description ?? '' },
          { h: 'Amount', c: (e) => money(e.amount), right: true },
          ...(canWrite ? [{ h: '', c: (e) => <button className="secondary small" onClick={() => window.confirm('Delete this expense?') && remove.run(e._id)}>Delete</button> }] : []),
        ]} />
      </Card>
    </div>
  );
}

export default function Billing() {
  const { user } = useAuth();
  const tabs = [
    { id: 'inv', title: 'Invoices & payments', render: () => <Invoices /> },
    ...(user.role !== 'receptionist' ? [{ id: 'exp', title: 'Expenses', render: () => <Expenses /> }] : []),
  ];
  return (
    <div className="stack">
      <h1>Billing</h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
