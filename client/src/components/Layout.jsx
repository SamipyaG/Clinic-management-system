import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api, getActiveClinic, setActiveClinic } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ACCESS } from '../access.js';
import { useLoad, useRealtime } from '../hooks.js';
import { label } from '../format.js';
import { Modal } from './ui.jsx';

const NAV = [
  { to: '/', text: 'Dashboard', area: 'dashboard', end: true },
  { to: '/patients', text: 'Patients', area: 'patients' },
  { to: '/appointments', text: 'Appointments', area: 'appointments' },
  { to: '/queue', text: 'Check-in & Queue', area: 'queue' },
  { to: '/doctor', text: 'My Consultations', area: 'doctor' },
  { to: '/nurse', text: 'Vitals', area: 'nurse' },
  { to: '/lab', text: 'Laboratory', area: 'lab' },
  { to: '/pharmacy', text: 'Pharmacy & Stock', area: 'pharmacy' },
  { to: '/billing', text: 'Billing', area: 'billing' },
  { to: '/reports', text: 'Reports', area: 'reports' },
  { to: '/admin', text: 'Administration', area: 'admin' },
];

/** Admins with more than one clinic can pick which one they are working in. */
function ClinicSwitcher({ user }) {
  const clinics = useLoad(() => (['clinic_admin', 'super_admin'].includes(user.role) ? api('/platform/clinics') : Promise.resolve([])));
  if (!clinics.data || clinics.data.length < 2) return null;
  const current = getActiveClinic() ?? user.clinic;
  const change = (e) => {
    setActiveClinic(e.target.value === user.clinic ? null : e.target.value);
    window.location.assign('/'); // reload so every screen refetches for the chosen clinic
  };
  return (
    <select value={current} onChange={change} aria-label="Active clinic" style={{ width: 'auto', maxWidth: 220 }}>
      {clinics.data.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
    </select>
  );
}

/** Paste or scan (a USB scanner types the code and presses Enter) a clinic QR code to jump to the record. */
function CodeLookup() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const go = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api(`/lookup/resolve?code=${encodeURIComponent(code.trim())}`);
      setCode('');
      navigate(r.path);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={go} className="row" role="search">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan QR code" aria-label="Scan or enter a QR code" style={{ width: 150 }} />
      {error && <span className="error" role="alert">{error}</span>}
    </form>
  );
}

function Bell() {
  const [open, setOpen] = useState(false);
  const inbox = useLoad(() => api('/notifications'));
  useRealtime(['notification:new'], inbox.reload);
  const unread = inbox.data?.unread ?? 0;

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    inbox.reload();
  };

  return (
    <>
      <button className="bell" onClick={() => setOpen(true)} aria-label={`Notifications, ${unread} unread`}>
        Alerts{unread > 0 && <span className="dot">{unread}</span>}
      </button>
      {open && (
        <Modal title="Notifications" onClose={() => setOpen(false)}>
          <div className="row spread" style={{ marginBottom: '.5rem' }}>
            <span className="muted">{unread} unread</span>
            <button className="secondary small" onClick={markAll} disabled={!unread}>Mark all read</button>
          </div>
          {inbox.data?.items.length ? (
            inbox.data.items.map((n) => (
              <div key={n._id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--line)', opacity: n.readAt ? 0.6 : 1 }}>
                <strong>{n.subject}</strong>
                <div>{n.body}</div>
              </div>
            ))
          ) : (
            <p className="muted">No notifications.</p>
          )}
        </Modal>
      )}
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = user.role === 'patient' ? [{ to: '/portal', text: 'My Health', area: 'portal' }] : NAV.filter((n) => ACCESS[n.area].includes(user.role));

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">Clinic Manager</div>
        <nav aria-label="Main">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.text}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="secondary menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">Menu</button>
          <span className="muted">{user.name} · {label(user.role)}</span>
          <div className="row">
            {user.role !== 'patient' && ['clinic_admin', 'super_admin', 'receptionist', 'doctor', 'nurse', 'pharmacist', 'lab_staff'].includes(user.role) && <CodeLookup />}
            <ClinicSwitcher user={user} />
            <Bell />
            <button className="secondary" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
