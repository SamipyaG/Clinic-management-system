import { useState } from 'react';
import { api, openFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAction, useLoad } from '../hooks.js';
import { fmtDate, money, toMinor } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Modal, Stat, Table, Tabs, useFormState } from '../components/ui.jsx';

function DispenseForm({ rx, medicines, onDone }) {
  const [lines, setLines] = useState(rx.items.map((i) => ({ label: `${i.medicine} ${i.dosage} · ${i.frequency} · ${i.duration}`, medicine: '', quantity: i.quantity ?? 1 })));
  const update = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = useAction(async () => {
    const items = lines.filter((l) => l.medicine).map((l) => ({ medicine: l.medicine, quantity: Number(l.quantity) }));
    await api(`/pharmacy/prescriptions/${rx._id}/dispense`, { method: 'POST', body: { items } });
    onDone();
  });
  return (
    <>
      {rx.patient?.allergies?.length > 0 && <div className="alert">Allergies: {rx.patient.allergies.join(', ')}</div>}
      {rx.notes && <p className="muted">Doctor note: {rx.notes}</p>}
      <button type="button" className="secondary small" onClick={() => openFile(`/clinical/prescriptions/${rx._id}/pdf`)}>Print prescription (PDF)</button>
      {lines.map((l, i) => (
        <div key={i} className="form-grid" style={{ borderBottom: '1px solid var(--line)', marginBottom: '.5rem' }}>
          <Field label="Prescribed" group><strong>{l.label}</strong></Field>
          <Field label="Dispense from stock">
            <select value={l.medicine} onChange={(e) => update(i, { medicine: e.target.value })}>
              <option value="">Skip this item</option>
              {medicines.map((m) => <option key={m._id} value={m._id}>{m.name} {m.strength ?? ''} (stock {m.stock})</option>)}
            </select>
          </Field>
          <Field label="Quantity"><input type="number" min="1" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} /></Field>
        </div>
      ))}
      <ErrorMsg error={save.error} />
      <button onClick={save.run} disabled={save.busy || !lines.some((l) => l.medicine)}>{save.busy ? 'Dispensing...' : 'Dispense & add to bill'}</button>
    </>
  );
}

function Dispensing() {
  const rxs = useLoad(() => api('/clinical/prescriptions'));
  const meds = useLoad(() => api('/pharmacy/medicines'));
  const [open, setOpen] = useState(null);
  return (
    <>
      <Loading loading={rxs.loading && !rxs.data} error={rxs.error} />
      <Table rows={rxs.data} empty="No prescriptions waiting." onRow={setOpen} columns={[
        { h: 'Issued', c: (r) => fmtDate(r.createdAt) },
        { h: 'Patient', c: (r) => `${r.patient?.name ?? ''} (${r.patient?.patientId ?? ''})` },
        { h: 'Medicines', c: (r) => r.items.map((i) => i.medicine).join(', ') },
        { h: 'Status', c: (r) => <Badge value={r.status} /> },
      ]} />
      {open && (
        <Modal title="Dispense prescription" wide onClose={() => setOpen(null)}>
          <DispenseForm rx={open} medicines={meds.data ?? []} onDone={() => { setOpen(null); rxs.reload(); meds.reload(); }} />
        </Modal>
      )}
    </>
  );
}

function Stock() {
  const meds = useLoad(() => api('/pharmacy/medicines'));
  const suppliers = useLoad(() => api('/pharmacy/suppliers'));
  const [m, setM, resetM] = useFormState({ name: '', strength: '', form: '', unitPrice: '', reorderLevel: 10 });
  const [b, setB, resetB] = useFormState({ medicine: '', batchNo: '', expiry: '', qty: '', costPrice: '', supplier: '' });
  const [s, setS, resetS] = useFormState({ name: '', phone: '' });
  const addMed = useAction(async (e) => {
    e.preventDefault();
    await api('/pharmacy/medicines', { method: 'POST', body: { name: m.name, strength: m.strength || undefined, form: m.form || undefined, unitPrice: toMinor(m.unitPrice || 0), reorderLevel: Number(m.reorderLevel) } });
    resetM(); meds.reload();
  });
  const addBatch = useAction(async (e) => {
    e.preventDefault();
    await api('/pharmacy/batches', { method: 'POST', body: { medicine: b.medicine, batchNo: b.batchNo, expiry: b.expiry, qty: Number(b.qty), costPrice: toMinor(b.costPrice || 0), supplier: b.supplier || undefined } });
    resetB(); meds.reload();
  });
  const addSup = useAction(async (e) => {
    e.preventDefault();
    await api('/pharmacy/suppliers', { method: 'POST', body: { name: s.name, phone: s.phone || undefined } });
    resetS(); suppliers.reload();
  });
  return (
    <div className="stack">
      <Table rows={meds.data} empty="No medicines yet." columns={[
        { h: 'Medicine', c: (x) => `${x.name} ${x.strength ?? ''}` }, { h: 'Form', c: (x) => x.form ?? '' },
        { h: 'Price', c: (x) => money(x.unitPrice), right: true },
        { h: 'In stock', c: (x) => <span className={x.stock <= x.reorderLevel ? 'error' : ''}>{x.stock}</span>, right: true },
        { h: 'Reorder at', c: (x) => x.reorderLevel, right: true },
      ]} />
      <div className="grid cols-3">
        <Card title="Add medicine">
          <form onSubmit={addMed.run}>
            <Field label="Name"><input value={m.name} onChange={setM('name')} required /></Field>
            <Field label="Strength"><input value={m.strength} onChange={setM('strength')} placeholder="500mg" /></Field>
            <Field label="Form"><input value={m.form} onChange={setM('form')} placeholder="tablet" /></Field>
            <Field label="Selling price (per unit)"><input type="number" step="0.01" min="0" value={m.unitPrice} onChange={setM('unitPrice')} /></Field>
            <Field label="Reorder level"><input type="number" min="0" value={m.reorderLevel} onChange={setM('reorderLevel')} /></Field>
            <ErrorMsg error={addMed.error} /><button disabled={addMed.busy}>Add</button>
          </form>
        </Card>
        <Card title="Receive stock (batch)">
          <form onSubmit={addBatch.run}>
            <Field label="Medicine"><select value={b.medicine} onChange={setB('medicine')} required><option value="">Select</option>{meds.data?.map((x) => <option key={x._id} value={x._id}>{x.name} {x.strength ?? ''}</option>)}</select></Field>
            <Field label="Batch no."><input value={b.batchNo} onChange={setB('batchNo')} required /></Field>
            <Field label="Expiry date"><input type="date" value={b.expiry} onChange={setB('expiry')} required /></Field>
            <Field label="Quantity"><input type="number" min="1" value={b.qty} onChange={setB('qty')} required /></Field>
            <Field label="Cost price (per unit)"><input type="number" step="0.01" min="0" value={b.costPrice} onChange={setB('costPrice')} /></Field>
            <Field label="Supplier"><select value={b.supplier} onChange={setB('supplier')}><option value="">-</option>{suppliers.data?.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></Field>
            <ErrorMsg error={addBatch.error} /><button disabled={addBatch.busy}>Receive</button>
          </form>
        </Card>
        <Card title="Suppliers">
          <ul>{suppliers.data?.map((x) => <li key={x._id}>{x.name} {x.phone ? `· ${x.phone}` : ''}</li>)}</ul>
          <form onSubmit={addSup.run}>
            <Field label="Name"><input value={s.name} onChange={setS('name')} required /></Field>
            <Field label="Phone"><input value={s.phone} onChange={setS('phone')} /></Field>
            <ErrorMsg error={addSup.error} /><button disabled={addSup.busy}>Add supplier</button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Alerts() {
  const a = useLoad(() => api('/pharmacy/alerts?days=60'));
  if (!a.data) return <Loading loading={a.loading} error={a.error} />;
  const batchCols = [{ h: 'Medicine', c: (b) => `${b.medicine?.name} ${b.medicine?.strength ?? ''}` }, { h: 'Batch', c: (b) => b.batchNo }, { h: 'Expiry', c: (b) => fmtDate(b.expiry) }, { h: 'Qty', c: (b) => b.qtyOnHand, right: true }];
  const stockCols = [{ h: 'Medicine', c: (x) => `${x.medicine.name} ${x.medicine.strength ?? ''}` }, { h: 'Usable stock', c: (x) => x.total, right: true }, { h: 'Reorder at', c: (x) => x.medicine.reorderLevel, right: true }];
  return (
    <div className="stack">
      <div className="grid cols-3">
        <Stat title="Expired batches" value={a.data.expired.length} tone={a.data.expired.length ? 'bad' : ''} />
        <Stat title="Expiring in 60 days" value={a.data.expiring.length} tone={a.data.expiring.length ? 'warn' : ''} />
        <Stat title="Low / out of stock" value={`${a.data.low.length} / ${a.data.outOfStock.length}`} tone={a.data.outOfStock.length ? 'bad' : a.data.low.length ? 'warn' : ''} />
      </div>
      <Card title="Expired (remove from shelf)"><Table rows={a.data.expired} empty="None." columns={batchCols} /></Card>
      <Card title="Expiring soon"><Table rows={a.data.expiring} empty="None." columns={batchCols} /></Card>
      <Card title="Low stock"><Table rows={a.data.low} empty="None." columns={stockCols} /></Card>
      <Card title="Out of stock"><Table rows={a.data.outOfStock} empty="None." columns={stockCols} /></Card>
    </div>
  );
}

function Inventory({ canManage }) {
  const items = useLoad(() => api('/inventory/items'));
  const [f, set, reset] = useFormState({ name: '', category: 'consumable', unit: 'pcs', reorderLevel: 0 });
  const add = useAction(async (e) => {
    e.preventDefault();
    await api('/inventory/items', { method: 'POST', body: { ...f, reorderLevel: Number(f.reorderLevel) } });
    reset(); items.reload();
  });
  const move = useAction(async (item, kind) => {
    const qty = Number(window.prompt(kind === 'purchase' ? `Add how many ${item.unit}?` : `Use how many ${item.unit}?`));
    if (!qty || qty < 1) return;
    await api(`/inventory/items/${item._id}/${kind}`, { method: 'POST', body: { qty: Math.floor(qty) } });
    items.reload();
  });
  return (
    <div className="stack">
      <ErrorMsg error={move.error} />
      <Table rows={items.data} empty="No items yet." columns={[
        { h: 'Item', c: (i) => i.name }, { h: 'Category', c: (i) => i.category },
        { h: 'Qty', c: (i) => `${i.qty} ${i.unit}`, right: true }, { h: 'Level', c: (i) => <Badge value={i.level} /> },
        { h: '', c: (i) => (
          <div className="row">
            <button className="secondary small" onClick={() => move.run(i, 'use')}>Use</button>
            {canManage && <button className="secondary small" onClick={() => move.run(i, 'purchase')}>Add stock</button>}
          </div>
        ) },
      ]} />
      {canManage && (
        <Card title="Add inventory item">
          <form onSubmit={add.run}>
            <div className="form-grid">
              <Field label="Name"><input value={f.name} onChange={set('name')} required placeholder="Gloves" /></Field>
              <Field label="Category"><select value={f.category} onChange={set('category')}><option>consumable</option><option>equipment</option><option>other</option></select></Field>
              <Field label="Unit"><input value={f.unit} onChange={set('unit')} /></Field>
              <Field label="Reorder level"><input type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
            </div>
            <ErrorMsg error={add.error} /><button disabled={add.busy}>Add item</button>
          </form>
        </Card>
      )}
    </div>
  );
}

export default function Pharmacy() {
  const { user } = useAuth();
  const manage = ['pharmacist', 'clinic_admin', 'super_admin'].includes(user.role);
  const tabs = manage
    ? [
        { id: 'dispense', title: 'Dispensing', render: () => <Card><Dispensing /></Card> },
        { id: 'stock', title: 'Medicines & stock', render: () => <Stock /> },
        { id: 'alerts', title: 'Expiry & stock alerts', render: () => <Alerts /> },
        { id: 'inventory', title: 'Inventory', render: () => <Inventory canManage /> },
      ]
    : [{ id: 'inventory', title: 'Inventory', render: () => <Inventory canManage={false} /> }];
  return (
    <div className="stack">
      <h1>Pharmacy & Stock</h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
