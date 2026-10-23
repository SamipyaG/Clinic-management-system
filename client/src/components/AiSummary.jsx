import { useState } from 'react';
import { api } from '../api.js';
import { useAction } from '../hooks.js';
import { Card, ErrorMsg } from './ui.jsx';

/** Assistive chart summary. Always shows the source so nobody mistakes a rule-based note for AI text. */
export default function AiSummary({ patientId }) {
  const [result, setResult] = useState(null);
  const run = useAction(async () => setResult(await api(`/ai/patient-summary/${patientId}`, { method: 'POST' })));
  return (
    <Card title="Chart summary" actions={<button className="secondary small" disabled={run.busy} onClick={run.run}>{run.busy ? 'Working...' : result ? 'Refresh' : 'Summarise chart'}</button>}>
      <ErrorMsg error={run.error} />
      {result ? (
        <>
          <p className="muted">{result.source === 'ai' ? `AI-generated (${result.model})` : 'Generated from recorded data (rule-based)'} · {result.disclaimer}</p>
          {result.note && <p className="alert">{result.note}</p>}
          <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>{result.summary}</pre>
        </>
      ) : <p className="muted">Creates a short overview of allergies, history, latest vitals and results.</p>}
    </Card>
  );
}
