import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useAction } from '../hooks.js';
import { Card, ErrorMsg, Field } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = useAction(async (e) => {
    e.preventDefault();
    const user = await login(email, password);
    navigate(user.role === 'patient' ? '/portal' : user.role === 'doctor' ? '/doctor' : '/');
  });

  return (
    <div className="login">
      <Card title="Clinic Manager - Sign in">
        <form onSubmit={submit.run}>
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></Field>
          <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          <ErrorMsg error={submit.error} />
          <button disabled={submit.busy} style={{ width: '100%' }}>{submit.busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </Card>
    </div>
  );
}
