import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Carrot, CookingPot, Wine,
  MoreHorizontal, Settings,
} from 'lucide-react';

const TABS: ReadonlyArray<{ to: string; end?: boolean; icon: typeof LayoutDashboard; key: string; disabled?: boolean }> = [
  { to: '/recipes', end: true, icon: LayoutDashboard, key: 'dashboard' },
  { to: '/recipes/ingredients', icon: Carrot, key: 'ingredients' },
  { to: '/recipes/food', icon: CookingPot, key: 'foodRecipes' },
  { to: '/recipes/drinks', icon: Wine, key: 'drinkRecipes' },
  { to: '/recipes/more', icon: MoreHorizontal, key: 'moreModules', disabled: true },
  { to: '/recipes/settings', icon: Settings, key: 'settings' },
];

interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function RecipesShell({ title, description, actions, children }: Props) {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={title} description={description ?? t('recipes.subtitle')}>
        {actions}
      </PageHeader>
      <div className="mb-6 -mx-4 sm:mx-0 overflow-x-auto">
        <nav className="flex gap-1 px-4 sm:px-0 min-w-max">
          {TABS.map(tab => tab.disabled ? (
            <span
              key={tab.to}
              aria-disabled="true"
              title={t('recipes.nav.moreModulesHint') as string}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground/60 cursor-not-allowed"
            >
              <tab.icon className="h-4 w-4" />
              <span>{t(`recipes.nav.${tab.key}`)}</span>
            </span>
          ) : (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <tab.icon className="h-4 w-4" />
              <span>{t(`recipes.nav.${tab.key}`)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {children}
    </AppShell>
  );
}
