import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLoad } from '../hooks.js';
import { Field, ErrorMsg } from './ui.jsx';

/** Search-as-you-type patient selector. Calls onPick(patient). */
export function PatientPicker({ value, onPick, label: text = 'Patient' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api(`/patients?q=${encodeURIComponent(q.trim())}&limit=8`).then((r) => setResults(r.items)).catch(setError);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <Field label={text} group>
        <div className="row">
          <strong>{value.name}</strong>
          <span className="muted">{value.patientId}</span>
          <button type="button" className="secondary small" onClick={() => onPick(null)}>Change</button>
        </div>
      </Field>
    );
  }
  return (
    <>
      <Field label={text} hint="Type a name, phone or patient ID">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients" />
      </Field>
      <ErrorMsg error={error} />
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 .75rem' }} aria-label="Matching patients">
          {results.map((p) => (
            <li key={p._id} style={{ marginBottom: 4 }}>
              <button type="button" className="secondary small" style={{ textAlign: 'left' }} onClick={() => { onPick(p); setQ(''); setResults([]); }}>
                {p.name} · {p.patientId} · {p.phone}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export const useDoctors = () => useLoad(() => api('/doctors'));

/** Doctor select + date + slot buttons. Calls onChange({doctor, date, slot}). */
export function SlotPicker({ onChange, slotsPath = (doctor, date) => `/doctors/${doctor}/slots?date=${date}`, doctors, initialDate }) {
  const [doctor, setDoctor] = useState('');
  const [date, setDate] = useState(initialDate ?? '');
  const [slot, setSlot] = useState(null);
  const slots = useLoad(() => (doctor && date ? api(slotsPath(doctor, date)) : Promise.resolve([])), [doctor, date]);

  useEffect(() => { setSlot(null); }, [doctor, date]);
  useEffect(() => { onChange({ doctor, date, slot }); }, [doctor, date, slot]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="form-grid">
        <Field label="Doctor">
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">Select doctor</option>
            {(doctors ?? []).map((d) => (
              <option key={d._id} value={d._id}>{d.user?.name} · {d.department?.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {doctor && date && (
        <Field label="Available times" group>
          {slots.loading ? <span className="muted">Loading...</span> : slots.data?.length ? (
            <div className="slots">
              {slots.data.map((s) => (
                <button type="button" key={s.start} className={slot?.start === s.start ? 'selected' : ''} onClick={() => setSlot(s)}>{s.startTime}</button>
              ))}
            </div>
          ) : <span className="muted">No free slots on this day.</span>}
          <ErrorMsg error={slots.error} />
        </Field>
      )}
    </>
  );
}
