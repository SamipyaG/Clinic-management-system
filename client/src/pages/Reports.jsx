import { useState } from 'react';
import { api } from '../api.js';
import { useLoad } from '../hooks.js';
import { fmtDate, label, money, todayStr } from '../format.js';
import { Badge, Card, ErrorMsg, Field, Loading, Stat, Table, Tabs } from '../components/ui.jsx';

function Revenue({ range }) {
  const [groupBy, setGroupBy] = useState('day');
  const r = useLoad(() => api(`/reports/revenue?from=${range.from}&to=${range.to}&groupBy=${groupBy}`), [range.from, range.to, groupBy]);
  if (!r.data) return <Loading loading={r.loading} error={r.error} />;
  const d = r.data;
  return (
    <div className="stack">
      <div className="grid cols-3">
        <Stat title="Collected" value={money(d.totalCollected)} tone="good" />
        <Stat title="Expenses" value={money(d.expenses.total)} tone="warn" />
        <Stat title="Net income" value={money(d.netIncome)} tone={d.netIncome < 0 ? 'bad' : 'good'} />
        <Stat title="Pharmacy revenue (billed)" value={money(d.pharmacyRevenue)} />
        <Stat title="Laboratory revenue (billed)" value={money(d.laboratoryRevenue)} />
      </div>
      <Card title="Collected over time" actions={<select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label="Group by"><option value="day">By day</option><option value="month">By month</option></select>}>
        <Table rows={d.collected} empty="No payments in this period." columns={[{ h: 'Period', c: (c) => c.period }, { h: 'Payments', c: (c) => c.payments, right: true }, { h: 'Collected', c: (c) => money(c.collected), right: true }]} />
      </Card>
      <div className="grid cols-2">
        <Card title="Service-wise (billed)"><Table rows={d.serviceWise} empty="None." columns={[{ h: 'Service', c: (s) => label(s.type) }, { h: 'Items', c: (s) => s.items, right: true }, { h: 'Billed', c: (s) => money(s.billed), right: true }]} /></Card>
        <Card title="Doctor-wise (billed)"><Table rows={d.doctorWise} empty="None." columns={[{ h: 'Doctor', c: (x) => x.name ?? '-' }, { h: 'Invoices', c: (x) => x.invoices, right: true }, { h: 'Billed', c: (x) => money(x.billed), right: true }]} /></Card>
        <Card title="Payment methods"><Table rows={d.byMethod} empty="None." columns={[{ h: 'Method', c: (m) => label(m.method) }, { h: 'Collected', c: (m) => money(m.collected), right: true }]} /></Card>
        <Card title="Expenses by category"><Table rows={d.expenses.byCategory} empty="None." columns={[{ h: 'Category', c: (e) => label(e.category) }, { h: 'Amount', c: (e) => money(e.amount), right: true }]} /></Card>
      </div>
    </div>
  );
}

function Outstanding() {
  const r = useLoad(() => api('/reports/outstanding'));
  if (!r.data) return <Loading loading={r.loading} error={r.error} />;
  return (
    <Card title={`Outstanding payments · ${money(r.data.total)}`}>
      <Table rows={r.data.items} empty="Nothing outstanding." columns={[
        { h: 'Invoice', c: (i) => i.number }, { h: 'Date', c: (i) => fmtDate(i.createdAt) }, { h: 'Patient', c: (i) => `${i.patient?.name ?? ''} · ${i.patient?.phone ?? ''}` },
        { h: 'Total', c: (i) => money(i.total), right: true }, { h: 'Balance', c: (i) => money(i.balance), right: true }, { h: 'Status', c: (i) => <Badge value={i.status} /> },
      ]} />
    </Card>
  );
}

function Payments({ range }) {
  const r = useLoad(() => api(`/reports/payments?from=${range.from}&to=${range.to}`), [range.from, range.to]);
  return (
    <Card title="Payment history">
      <Loading loading={r.loading && !r.data} error={r.error} />
      <Table rows={r.data} empty="No payments in this period." columns={[
        { h: 'Receipt', c: (p) => p.receiptNo }, { h: 'Invoice', c: (p) => p.invoice?.number }, { h: 'Date', c: (p) => fmtDate(p.createdAt) }, { h: 'Method', c: (p) => label(p.method) },
        { h: 'Amount', c: (p) => <span className={p.kind === 'refund' ? 'error' : ''}>{p.kind === 'refund' ? '-' : ''}{money(p.amount)}</span>, right: true },
      ]} />
    </Card>
  );
}

function Performance({ range }) {
  const r = useLoad(() => api(`/reports/performance?from=${range.from}&to=${range.to}`), [range.from, range.to]);
  if (!r.data) return <Loading loading={r.loading} error={r.error} />;
  const d = r.data;
  return (
    <div className="stack">
      <div className="grid cols-3">
        <Stat title="Appointments" value={d.appointments.total} />
        <Stat title="No-show rate" value={`${d.appointments.noShowRate}%`} tone={d.appointments.noShowRate > 15 ? 'bad' : ''} />
        <Stat title="Completed consultations" value={d.completedConsultations} />
        <Stat title="Pharmacy sales" value={money(d.pharmacySales.revenue)} hint={`${d.pharmacySales.units} units`} />
      </div>
      <Card title="Appointments by status"><div className="row">{Object.entries(d.appointments.byStatus).map(([s, n]) => <span key={s} className="badge">{label(s)}: {n}</span>)}{!d.appointments.total && <span className="muted">No appointments in this period.</span>}</div></Card>
      <div className="grid cols-2">
        <Card title="Doctor performance"><Table rows={d.doctorPerformance} empty="None." columns={[{ h: 'Doctor', c: (x) => x.name ?? '-' }, { h: 'Total', c: (x) => x.total, right: true }, { h: 'Done', c: (x) => x.completed, right: true }, { h: 'Cancelled', c: (x) => x.cancelled, right: true }, { h: 'No-show', c: (x) => x.noShow, right: true }]} /></Card>
        <Card title="Department performance"><Table rows={d.departmentPerformance} empty="None." columns={[{ h: 'Department', c: (x) => x.name ?? '-' }, { h: 'Total', c: (x) => x.total, right: true }, { h: 'Done', c: (x) => x.completed, right: true }]} /></Card>
        <Card title="Patient growth"><Table rows={d.patientGrowth} empty="None." columns={[{ h: 'Month', c: (x) => x.month }, { h: 'New patients', c: (x) => x.newPatients, right: true }]} /></Card>
        <Card title="Laboratory activity (tests)"><div className="row">{Object.entries(d.laboratoryActivity).map(([s, n]) => <span key={s} className="badge">{label(s)}: {n}</span>)}{!Object.keys(d.laboratoryActivity).length && <span className="muted">None.</span>}</div></Card>
      </div>
    </div>
  );
}

export default function Reports() {
  const [range, setRange] = useState({ from: `${todayStr().slice(0, 8)}01`, to: todayStr() });
  const valid = range.from && range.to && range.from <= range.to;
  return (
    <div className="stack">
      <h1>Reports</h1>
      <Card>
        <div className="row">
          <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
        {!valid && <ErrorMsg error={{ message: 'Choose a valid date range.' }} />}
      </Card>
      {valid && (
        <Tabs tabs={[
          { id: 'rev', title: 'Revenue & expenses', render: () => <Revenue range={range} /> },
          { id: 'out', title: 'Outstanding', render: () => <Outstanding /> },
          { id: 'pay', title: 'Payment history', render: () => <Payments range={range} /> },
          { id: 'perf', title: 'Clinic performance', render: () => <Performance range={range} /> },
        ]} />
      )}
    </div>
  );
}
