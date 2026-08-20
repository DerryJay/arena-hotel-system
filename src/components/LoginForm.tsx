'use client';

import { useActionState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { loginAction, type LoginActionState } from '../lib/auth/actions';

const initialState: LoginActionState = { message: '' };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-lockup__mark">
            <KeyRound size={24} />
          </div>
          <div>
            <p>3dHotels</p>
            <h1>Owner sign in</h1>
          </div>
        </div>

        <form className="auth-form" action={formAction}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />

          <button type="submit" disabled={isPending}>
            <LogIn size={18} />
            {isPending ? 'Signing in' : 'Sign in'}
          </button>
        </form>

        {state.message ? <p className="form-message" role="alert">{state.message}</p> : null}
      </section>
    </main>
  );
}
