import { useEffect, useState } from 'react';
import { label } from '../format.js';

export const Card = ({ title, actions, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || actions) && (
      <header className="card-head">
        <h3>{title}</h3>
        <div className="row">{actions}</div>
      </header>
    )}
    {children}
  </section>
);

export const ErrorMsg = ({ error }) => (error ? <p className="error" role="alert">{error.message ?? String(error)}</p> : null);

export const Loading = ({ loading, error }) => (loading ? <p className="muted">Loading...</p> : error ? <ErrorMsg error={error} /> : null);

/** `group` is for content that is not one input (buttons, checkboxes): a labelled group, not a <label>. */
export const Field = ({ label: text, children, hint, group }) =>
  group ? (
    <div className="field" role="group" aria-label={text}>
      <span>{text}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </div>
  ) : (
    <label className="field">
      <span>{text}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );

const TONES = {
  paid: 'good', completed: 'good', reviewed: 'good', sent: 'good', normal: 'good', ok: 'good', dispensed: 'good', resulted: 'good',
  partial: 'warn', waiting: 'warn', booked: 'warn', pending: 'warn', in_progress: 'warn', low: 'warn', high: 'warn', expiring: 'warn', issued: 'warn', ordered: 'warn',
  unpaid: 'bad', cancelled: 'bad', no_show: 'bad', failed: 'bad', expired: 'bad', critical_low: 'bad', critical_high: 'bad', out_of_stock: 'bad',
};
export const Badge = ({ value }) => <span className={`badge ${TONES[value] ?? ''}`}>{label(String(value ?? ''))}</span>;

export function Table({ columns, rows, empty = 'Nothing here yet.', onRow }) {
  if (!rows?.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.h} className={c.right ? 'right' : ''}>{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row._id ?? row.id ?? i} onClick={onRow ? () => onRow(row) : undefined} className={onRow ? 'clickable' : ''}>
              {columns.map((c) => <td key={c.h} className={c.right ? 'right' : ''}>{c.c(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-head">
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose} aria-label="Close">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, initial }) {
  const [active, setActive] = useState(initial ?? tabs[0].id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === current.id} className={t.id === current.id ? 'active' : ''} onClick={() => setActive(t.id)}>
            {t.title}
          </button>
        ))}
      </div>
      {current.render()}
    </>
  );
}

export const Stat = ({ title, value, hint, tone }) => (
  <div className={`stat ${tone ?? ''}`}>
    <span className="muted">{title}</span>
    <strong>{value}</strong>
    {hint && <small className="muted">{hint}</small>}
  </div>
);

/** Controlled form state helper: const [f, set, reset] = useFormState({...}) */
export const useFormState = (initial) => {
  const [value, setValue] = useState(initial);
  const set = (key) => (e) => setValue((v) => ({ ...v, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return [value, set, () => setValue(initial), setValue];
};
