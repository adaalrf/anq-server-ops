import type { FormEvent } from 'react';
import type { Session } from '../types.js';
import { Icon } from '../components/Icon.js';
import { Field } from '../components/Field.js';
export function SignIn({
  session,
  login,
  error,
  busy,
}: {
  session: Session;
  login: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  error: string;
  busy: boolean;
}) {
  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">
          <Icon name="server" size={30} />
          <strong>ANQ Server Ops</strong>
        </div>
        <h1>Your operations journal.</h1>
        <p>Sign in to manage inventory and record work.</p>
        <form onSubmit={login}>
          <Field label="Username">
            <input
              name="username"
              autoComplete="username"
              required
              defaultValue={session.username || ''}
              maxLength={80}
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
