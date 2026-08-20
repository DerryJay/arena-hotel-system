import { CircleAlert } from 'lucide-react';

interface DashboardLoadErrorProps {
  message: string;
  logoutAction: () => Promise<void>;
}

export function DashboardLoadError({ message, logoutAction }: DashboardLoadErrorProps) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-lockup__mark">
            <CircleAlert size={24} />
          </div>
          <div>
            <p>3dHotels</p>
            <h1>Dashboard unavailable</h1>
          </div>
        </div>

        <p className="form-message" role="alert">{message}</p>

        <form action={logoutAction}>
          <button className="secondary-action" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
