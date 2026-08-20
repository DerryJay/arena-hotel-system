import { FormEvent, useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AuthPanelProps {
  onDemo: () => void;
}

export function AuthPanel({ onDemo }: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage('Add Supabase environment variables to enable staff sign in.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Signed in successfully.');
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-lockup__mark">
            <KeyRound size={24} />
          </div>
          <div>
            <p>Arena Hotel</p>
            <h1>Staff operations console</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={isSubmitting || !isSupabaseConfigured}>
            <LogIn size={18} />
            {isSubmitting ? 'Signing in' : 'Sign in'}
          </button>
        </form>

        {message ? <p className="form-message">{message}</p> : null}

        <button className="secondary-action" type="button" onClick={onDemo}>
          Open dashboard preview
        </button>
      </section>
    </main>
  );
}

