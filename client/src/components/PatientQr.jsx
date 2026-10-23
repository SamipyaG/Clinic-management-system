import { useEffect, useState } from 'react';
import { imageUrl } from '../api.js';
import { Card } from './ui.jsx';

/** Patient ID QR for cards and wristbands. It carries only the patient ID, not any medical data. */
export default function PatientQr({ patientId, name }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    let alive = true;
    imageUrl(`/lookup/patients/${patientId}/qr.png`).then((u) => { url = u; if (alive) setSrc(u); }).catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [patientId]);
  return (
    <Card title="Patient QR code">
      {src ? <img src={src} alt={`QR code identifying ${name}`} width="160" height="160" style={{ background: '#fff', padding: 6, borderRadius: 8 }} /> : <p className="muted">Loading...</p>}
      <p className="muted">Scan at reception to open this record.</p>
    </Card>
  );
}
