import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const ROLE_STYLES: Record<string, { bg: string; label: string }> = {
  owner: { bg: 'bg-red-600', label: 'Owner' },
  manager: { bg: 'bg-orange-500', label: 'Manager' },
  staff: { bg: 'bg-gray-500', label: 'Staff' },
};

export default function UserIdentityBadge({ compact = false }: { compact?: boolean }) {
  const { profile, roles } = useAuth();
  const { t } = useTranslation();

  if (!profile?.full_name) return null;

  const topRole = roles.includes('owner')
    ? 'owner'
    : roles.includes('manager')
      ? 'manager'
      : 'staff';

  const style = ROLE_STYLES[topRole] ?? ROLE_STYLES.staff;

  return (
    <div className={cn('flex items-center gap-2 truncate', compact ? 'px-4' : 'px-3')}>
      <span
        className="truncate text-xs font-medium"
        style={{ color: 'var(--nav-muted)' }}
      >
        {profile.full_name}
      </span>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-white',
          style.bg,
        )}
      >
        {style.label}
      </span>
    </div>
  );
}
