import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  LayoutDashboard, GraduationCap, ClipboardCheck, CookingPot,
  Package, Wrench, Settings, ChevronLeft, Menu, LogOut, MoreHorizontal, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LanguagePill, LanguageToggle } from '@/components/layout/LanguageSwitcher';
import UserIdentityBadge from '@/components/layout/UserIdentityBadge';

const NAV_KEYS = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/training', icon: GraduationCap, labelKey: 'nav.training' },
  { to: '/checklists', icon: ClipboardCheck, labelKey: 'nav.checklists' },
  { to: '/recipes', icon: CookingPot, labelKey: 'nav.recipes' },
  { to: '/inventory', icon: Package, labelKey: 'nav.inventory' },
  { to: '/maintenance', icon: Wrench, labelKey: 'nav.maintenance' },
  { to: '/management', icon: Settings, labelKey: 'nav.management' },
];

function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { signOut, profile } = useAuth();
  const { t } = useTranslation();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col border-r transition-all duration-300"
      style={{
        width: collapsed ? 68 : 220,
        background: 'var(--nav)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      <div className="flex flex-col">
        <div className="flex h-16 items-center justify-between px-4">
          {!collapsed && (
            <span className="text-lg font-heading font-bold text-primary-foreground">La Cala</span>
          )}
          <button
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-nav-active"
            style={{ color: 'var(--nav-foreground)' }}
          >
            {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>
        {!collapsed && <UserIdentityBadge />}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_KEYS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn('nav-item', isActive && 'nav-item-active', collapsed && 'justify-center px-0')
            }
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t px-2 py-3 space-y-1" style={{ borderColor: 'var(--sidebar-border)' }}>
        {!collapsed && profile?.full_name && (
          <p className="mb-2 truncate px-3 text-xs" style={{ color: 'var(--nav-muted)' }}>
            {profile.full_name}
          </p>
        )}
        <LanguageToggle collapsed={collapsed} />
        <button
          onClick={() => signOut()}
          className={cn('nav-item w-full', collapsed && 'justify-center px-0')}
          title={collapsed ? t('nav.signOut') : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">{t('nav.signOut')}</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const visibleItems = NAV_KEYS.slice(0, 5);
  const overflowItems = NAV_KEYS.slice(5);

  useEffect(() => setShowMore(false), [location.pathname]);

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-40 border-b"
        style={{
          background: 'var(--nav)',
          borderColor: 'var(--sidebar-border)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <header className="flex h-14 items-center justify-between px-4">
          <span className="text-lg font-heading font-bold text-primary-foreground">La Cala</span>
          <div className="flex items-center gap-2 pl-3">
            <LanguagePill compact />
            <button
              onClick={() => signOut()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-nav-active"
              style={{
                color: 'var(--nav-foreground)',
                borderColor: 'var(--sidebar-border)',
              }}
              aria-label={t('nav.signOut')}
              title={t('nav.signOut')}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t px-1 pb-[env(safe-area-inset-bottom)]"
        style={{ background: 'var(--nav)', borderColor: 'var(--sidebar-border)', height: 64 }}
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
              <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
            </NavLink>
          );
        })}

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
                className="absolute bottom-full right-0 z-40 mb-2 w-56 max-w-[calc(100vw-1rem)] rounded-lg border p-2 shadow-lg"
                style={{ background: 'var(--nav)', borderColor: 'var(--sidebar-border)' }}
              >
                <div className="mb-2">
                  <LanguagePill inMenu />
                </div>

                {overflowItems.map(item => {
                  const isActive = location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={cn('nav-item text-sm', isActive && 'nav-item-active')}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.labelKey)}</span>
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  if (isMobile) {
    return (
      <div
        className="min-h-screen bg-background pb-20"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 7.75rem)' }}
      >
        <MobileNav />
        <main className="px-4 py-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className="transition-all duration-300 p-6"
        style={{ marginLeft: collapsed ? 68 : 220 }}
      >
        {children}
      </main>
    </div>
  );
}
