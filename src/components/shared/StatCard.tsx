import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
}

export default function StatCard({ icon: Icon, label, value, subtitle }: StatCardProps) {
  return (
    <div className="stat-card flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
