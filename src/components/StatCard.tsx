import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}

export function StatCard({ label, value, detail, icon: Icon }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className="stat-card__icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

