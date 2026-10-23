import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from './socket.js';

/** Load data on mount / when deps change. `reload` re-fetches without clearing what is on screen. */
export const useLoad = (fn, deps = []) => {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload };
};

/** Run `handler` whenever one of the socket events fires. */
export const useRealtime = (events, handler) => {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const socket = getSocket();
    const fn = (payload) => ref.current(payload);
    events.forEach((e) => socket.on(e, fn));
    return () => events.forEach((e) => socket.off(e, fn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join('|')]);
};

/** Wrap an async action with busy/error state for buttons and forms. */
export const useAction = (fn) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (...args) => {
    setBusy(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, clear: () => setError(null) };
};
