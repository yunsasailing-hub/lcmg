import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  LayoutDashboard, GraduationCap, ClipboardCheck, CookingPot,
  Package, Wrench, Settings, ChevronLeft, Menu, LogOut, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/training', icon: GraduationCap, label: 'Training' },
  { to: '/checklists', icon: ClipboardCheck, label: 'Checklists' },
  { to: '/recipes', icon: CookingPot, label: 'Recipes' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/management', icon: Settings, label: 'Management' },
];

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-red-500/20 text-red-300' },
  manager: { label: 'Manager', color: 'bg-orange-500/20 text-orange-300' },
  staff: { label: 'Staff', color: 'bg-gray-500/20 text-gray-300' },
};

function UserIdentity({ collapsed }: { collapsed?: boolean }) {
  const { profile, roles } = useAuth();
  const primaryRole = roles[0];
  const badge = primaryRole ? ROLE_BADGE[primaryRole] : null;

  if (collapsed || !profile?.full_name) return null;

  return (
    <div className="px-3 pb-2">
      <p className="text-xs font-medium truncate" style={{ color: 'var(--primary-foreground)' }}>
        {profile.full_name}
      </p>
      {badge && (
        <span className={cn('inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.color)}>
          {badge.label}
        </span>
      )}
    </div>
  );
}

function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { signOut } = useAuth();

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
      <div className="border-t px-2 py-3" style={{ borderColor: 'var(--sidebar-border)' }}>
        <button
          onClick={() => signOut()}
          className={cn('nav-item w-full', collapsed && 'justify-center px-0')}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const { signOut, profile, roles } = useAuth();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const visibleItems = NAV_ITEMS.slice(0, 5);
  const overflowItems = NAV_ITEMS.slice(5);
  const primaryRole = roles[0];
  const badge = primaryRole ? ROLE_BADGE[primaryRole] : null;

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
          <span className="text-lg font-heading font-bold text-primary-foreground shrink-0">La Cala</span>
          {profile?.full_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs truncate" style={{ color: 'var(--nav-muted)' }}>{profile.full_name}</span>
              {badge && (
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.color)}>
                  {badge.label}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => signOut()}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-nav-active"
          style={{ color: 'var(--nav-foreground)' }}
        >
          <LogOut className="h-5 w-5" />
        </button>
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
              <span className="text-[10px] font-medium">More</span>
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pt-14 pb-20">
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
