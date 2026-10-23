import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setActiveClinic, setToken } from './api.js';
import { closeSocket } from './socket.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const login = async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setActiveClinic(null); // a new session always starts in the user's own clinic
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const logout = () => {
    setToken(null);
    setActiveClinic(null);
    closeSocket();
    setUser(null);
  };

  if (!ready) return <p className="center muted">Loading...</p>;
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}
