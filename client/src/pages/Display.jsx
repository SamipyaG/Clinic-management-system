import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';

// Public waiting-room screen: no sign-in, token numbers only.
export default function Display() {
  const { clinicId } = useParams();
  const [boards, setBoards] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/v1/public/queue-display/${clinicId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Display unavailable'))))
        .then((data) => { if (alive) { setBoards(data); setError(''); } })
        .catch((e) => alive && setError(e.message));
    load();

    const socket = io({ auth: { displayClinic: clinicId } });
    socket.on('queue:display', (state) =>
      setBoards((bs) => bs.map((b) => (b.doctor === state.doctor ? { ...b, ...state } : b))),
    );
    const poll = setInterval(load, 30_000); // safety net if the socket drops
    return () => { alive = false; socket.close(); clearInterval(poll); };
  }, [clinicId]);

  return (
    <div className="display">
      <h1>Now serving</h1>
      {error && <p>{error}</p>}
      <div className="board">
        {boards.map((b) => (
          <div className="lane" key={b.doctor}>
            <h2>Dr {b.name}</h2>
            <div className="now" aria-live="polite">{b.serving.length ? b.serving.join(', ') : '-'}</div>
            <div className="next">Next: {b.waiting.slice(0, 5).join('  ·  ') || 'no one waiting'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
