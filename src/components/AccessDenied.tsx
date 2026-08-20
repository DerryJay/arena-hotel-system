import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  reason: string;
  logoutAction: () => Promise<void>;
}

export function AccessDenied({ reason, logoutAction }: AccessDeniedProps) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-lockup__mark">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p>3dHotels</p>
            <h1>Access denied</h1>
          </div>
        </div>

        <p className="form-message" role="alert">{reason}</p>

        <form action={logoutAction}>
          <button className="secondary-action" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
