import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLoad, useRealtime } from '../hooks.js';
import { money } from '../format.js';
import { Card, Loading, Stat } from '../components/ui.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, error, loading, reload } = useLoad(() => api('/reports/dashboard'));
  useRealtime(['queue:updated', 'appointment:changed'], reload);

  if (!d) return <Loading loading={loading} error={error} />;
  const alerts = d.pharmacy.expiring + d.pharmacy.expired + d.pharmacy.lowStock + d.pharmacy.outOfStock;
  const showMoney = ['clinic_admin', 'super_admin', 'accountant', 'receptionist'].includes(user.role);

  return (
    <div className="stack">
      <div className="row spread">
        <h1>Today · {d.date}</h1>
        <button className="secondary" onClick={reload}>Refresh</button>
      </div>
      <div className="grid cols-3">
        <Stat title="Total patients" value={d.patients.total} hint={`${d.patients.newToday} new today`} />
        <Stat title="Appointments today" value={d.appointments.total} hint={`${d.appointments.completed} completed · ${d.appointments.pending} pending`} />
        <Stat title="Waiting now" value={d.queue.waiting} hint={`${d.queue.inConsultation} in consultation`} tone={d.queue.waiting > 5 ? 'warn' : ''} />
        <Stat title="Cancelled / no-show" value={`${d.appointments.cancelled} / ${d.appointments.noShow}`} />
        <Stat title="Doctors available" value={d.availableDoctors.length} hint={d.availableDoctors.map((x) => x.name).join(', ')} />
        {showMoney && <Stat title="Collected today" value={money(d.revenueToday.collected)} hint={`${d.revenueToday.payments} payments`} tone="good" />}
        <Stat title="Pending lab orders" value={d.laboratory.pendingOrders} />
        <Stat title="Pharmacy alerts" value={alerts} tone={alerts ? 'bad' : ''} hint={`${d.pharmacy.expiring} expiring · ${d.pharmacy.expired} expired · ${d.pharmacy.lowStock} low · ${d.pharmacy.outOfStock} out`} />
      </div>
      <Card title="Appointments by status">
        {Object.keys(d.appointments.byStatus).length ? (
          <div className="row">
            {Object.entries(d.appointments.byStatus).map(([s, n]) => <span key={s} className="badge">{s.replace('_', ' ')}: {n}</span>)}
          </div>
        ) : <p className="muted">No appointments today.</p>}
      </Card>
    </div>
  );
}
