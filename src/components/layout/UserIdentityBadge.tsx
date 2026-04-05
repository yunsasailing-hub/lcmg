import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_STYLES: Record<string, { bg: string; label: string }> = {
  owner: { bg: 'bg-red-600', label: 'Owner' },
  manager: { bg: 'bg-orange-500', label: 'Manager' },
  staff: { bg: 'bg-gray-500', label: 'Staff' },
};

export default function UserIdentityBadge({ compact = false }: { compact?: boolean }) {
  const { profile, roles, isLoading, isAuthenticated } = useAuth();

  // Show skeleton while auth is loading
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 truncate', compact ? 'px-4' : 'px-3')}>
        <Skeleton className="h-3 w-20" style={{ background: 'var(--nav-active)' }} />
        <Skeleton className="h-4 w-14 rounded-full" style={{ background: 'var(--nav-active)' }} />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) return null;

  const topRole = roles.includes('owner')
    ? 'owner'
    : roles.includes('manager')
      ? 'manager'
      : 'staff';

  const style = ROLE_STYLES[topRole] ?? ROLE_STYLES.staff;

  // Use full_name, fall back to email, then to 'User'
  const displayName = profile?.full_name || profile?.email || 'User';

  return (
    <div className={cn('flex items-center gap-2 truncate', compact ? 'px-4' : 'px-3')}>
      <span
        className="truncate text-xs font-medium"
        style={{ color: 'var(--nav-muted)' }}
      >
        {displayName}
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
