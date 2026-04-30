import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  LayoutDashboard, GraduationCap, ClipboardCheck, CookingPot,
  Package, Wrench, Settings, ChevronLeft, Menu, LogOut, MoreHorizontal, ChefHat, LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/notifications/NotificationBell';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import {
  NotificationPanelProvider,
  useNotificationPanel,
} from '@/components/notifications/NotificationPanelContext';
import NotificationCenter from '@/components/notifications/NotificationCenter';

const useNavItems = () => {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const items = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/training', icon: GraduationCap, label: t('nav.training') },
    { to: '/checklists', icon: ClipboardCheck, label: t('nav.checklists') },
    { to: '/recipes', icon: CookingPot, label: t('nav.recipes') },
    { to: '/kitchen-production', icon: ChefHat, label: t('nav.kitchenProduction') },
    { to: '/inventory', icon: Package, label: t('nav.inventory') },
    { to: '/maintenance', icon: Wrench, label: t('nav.maintenance') },
    { to: '/management', icon: Settings, label: t('nav.management') },
  ];
  if (hasRole('owner')) {
    items.push({ to: '/system-repair', icon: LifeBuoy, label: t('nav.systemRepair') });
  }
  return items;
};

// Mobile bottom nav: prioritize main shortcuts; keep Production visible.
const useMobileNavItems = () => {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const primary = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/checklists', icon: ClipboardCheck, label: t('nav.checklists') },
    { to: '/recipes', icon: CookingPot, label: t('nav.recipes') },
    { to: '/kitchen-production', icon: ChefHat, label: t('nav.kitchenProductionShort') },
  ];
  const overflow = [
    { to: '/training', icon: GraduationCap, label: t('nav.training') },
    { to: '/inventory', icon: Package, label: t('nav.inventory') },
    { to: '/maintenance', icon: Wrench, label: t('nav.maintenance') },
    { to: '/management', icon: Settings, label: t('nav.management') },
  ];
  if (hasRole('owner')) {
    overflow.push({ to: '/system-repair', icon: LifeBuoy, label: t('nav.systemRepair') });
  }
  return { primary, overflow };
};

const ROLE_BADGE: Record<string, { color: string }> = {
  owner: { color: 'bg-red-600 text-white' },
  manager: { color: 'bg-orange-500 text-white' },
  staff: { color: 'bg-gray-500 text-white' },
};

function UserIdentity({ collapsed }: { collapsed?: boolean }) {
  const { profile, roles, user } = useAuth();
  const { t } = useTranslation();
  const primaryRole = roles[0];
  const badge = primaryRole ? ROLE_BADGE[primaryRole] : null;
  const displayName = profile?.full_name || profile?.email || user?.email || 'User';

  if (collapsed) return null;

  return (
    <div className="px-3 pb-2">
      <p className="text-xs font-medium truncate" style={{ color: 'var(--primary-foreground)' }}>
        {displayName}
      </p>
      {badge && primaryRole && (
        <span className={cn('inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.color)}>
          {t(`roles.${primaryRole}`)}
        </span>
      )}
    </div>
  );
}

function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const NAV_ITEMS = useNavItems();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col border-r transition-all duration-300"
      style={{
        width: collapsed ? 68 : 220,
        background: 'var(--nav)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <span className="text-lg font-heading font-bold text-primary-foreground">{t('common.appName')}</span>
        )}
        <div className="flex items-center gap-1">
          <NotificationBell collapsed={collapsed} />
          <button
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-nav-active"
            style={{ color: 'var(--nav-foreground)' }}
          >
            {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* User identity */}
      <UserIdentity collapsed={collapsed} />

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'nav-item',
                isActive && 'nav-item-active',
                collapsed && 'justify-center px-0',
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-2 py-3 space-y-2" style={{ borderColor: 'var(--sidebar-border)' }}>
        {!collapsed && (
          <div className="px-2">
            <LanguageSwitcher />
          </div>
        )}
        <button
          onClick={() => signOut()}
          className={cn('nav-item w-full', collapsed && 'justify-center px-0')}
          title={collapsed ? t('common.signOut') : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">{t('common.signOut')}</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const { signOut, profile, roles, user } = useAuth();
  const { t } = useTranslation();
  const { primary: visibleItems, overflow: overflowItems } = useMobileNavItems();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const primaryRole = roles[0];
  const badge = primaryRole ? ROLE_BADGE[primaryRole] : null;
  const displayName = profile?.full_name || profile?.email || user?.email || 'User';

  // Close "more" menu on route change
  useEffect(() => setShowMore(false), [location.pathname]);

  return (
    <>
      {/* Top bar */}
      <header
        className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-4"
        style={{ background: 'var(--nav)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg font-heading font-bold text-primary-foreground shrink-0">{t('common.appName')}</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs truncate" style={{ color: 'var(--nav-muted)' }}>{displayName}</span>
            {badge && primaryRole && (
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.color)}>
                {t(`roles.${primaryRole}`)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <NotificationBell />
          <button
            onClick={() => signOut()}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-nav-active"
            style={{ color: 'var(--nav-foreground)' }}
            aria-label={t('common.signOut')}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t px-1 pb-[env(safe-area-inset-bottom)]"
        style={{
          background: 'var(--nav)',
          borderColor: 'var(--sidebar-border)',
          height: 64,
        }}
      >
        {visibleItems.map(item => {
          const isActive = item.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-0.5 py-1.5 px-2"
              style={{ color: isActive ? 'var(--primary-foreground)' : 'var(--nav-muted)' }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={isActive ? { background: 'var(--nav-active)' } : {}}
              >
                <item.icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {/* More button */}
        {overflowItems.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMore(!showMore)}
              className="flex flex-col items-center gap-0.5 py-1.5 px-2"
              style={{ color: showMore ? 'var(--primary-foreground)' : 'var(--nav-muted)' }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={showMore ? { background: 'var(--nav-active)' } : {}}
              >
                <MoreHorizontal className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">{t('nav.more')}</span>
            </button>

            {showMore && (
              <div
                className="absolute bottom-full right-0 mb-2 w-44 rounded-lg border p-1 shadow-lg"
                style={{
                  background: 'var(--nav)',
                  borderColor: 'var(--sidebar-border)',
                }}
              >
                {overflowItems.map(item => {
                  const isActive = location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={cn('nav-item text-sm', isActive && 'nav-item-active')}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );
}

const NOTIFICATION_PANEL_WIDTH = 380;

function DesktopNotificationPanel() {
  const { open, setOpen } = useNotificationPanel();
  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'fixed inset-y-0 right-0 z-40 border-l bg-background shadow-xl',
        'transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      )}
      style={{ width: NOTIFICATION_PANEL_WIDTH }}
    >
      {open && (
        <div className="h-full overflow-hidden">
          <NotificationCenter onClose={() => setOpen(false)} />
        </div>
      )}
    </aside>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const { open: notifOpen, setOpen: setNotifOpen } = useNotificationPanel();
  const location = useLocation();

  // Auto-close on navigation (mobile only)
  useEffect(() => {
    if (isMobile && notifOpen) setNotifOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isMobile]);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pt-14 pb-20">
        <MobileNav />
        <main className="px-4 py-4">{children}</main>
      </div>
    );
  }

  const sidebarWidth = collapsed ? 68 : 220;
  const rightOffset = notifOpen ? NOTIFICATION_PANEL_WIDTH : 0;

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className="transition-all duration-200 ease-out p-6"
        style={{ marginLeft: sidebarWidth, marginRight: rightOffset }}
      >
        {children}
      </main>
      <DesktopNotificationPanel />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationPanelProvider>
      <ShellInner>{children}</ShellInner>
    </NotificationPanelProvider>
  );
}
