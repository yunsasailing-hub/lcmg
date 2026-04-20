import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Carrot, CookingPot, Tags,
  Ruler, FileSpreadsheet, Settings,
} from 'lucide-react';

const TABS = [
  { to: '/recipes', end: true, icon: LayoutDashboard, key: 'dashboard' },
  { to: '/recipes/ingredients', icon: Carrot, key: 'ingredients' },
  { to: '/recipes/list', icon: CookingPot, key: 'recipes' },
  { to: '/recipes/categories', icon: Tags, key: 'categories' },
  { to: '/recipes/units', icon: Ruler, key: 'units' },
  { to: '/recipes/import-export', icon: FileSpreadsheet, key: 'importExport' },
  { to: '/recipes/settings', icon: Settings, key: 'settings' },
] as const;

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
          {TABS.map(tab => (
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
