import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ModuleCardProps {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  stat?: string;
}

export default function ModuleCard({ to, icon: Icon, title, description, stat }: ModuleCardProps) {
  return (
    <Link to={to} className="module-card flex items-center gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
        {stat && <p className="text-xs text-muted-foreground mt-0.5">{stat}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
