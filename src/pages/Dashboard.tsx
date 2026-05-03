import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import ModuleCard from '@/components/shared/ModuleCard';
import OverdueChecklistsSummary from '@/components/dashboard/OverdueChecklistsSummary';
import StaffActionDashboard from '@/components/dashboard/StaffActionDashboard';
import { Users, Building2, ClipboardCheck, GraduationCap, CookingPot, Package, Wrench, Settings, ChefHat } from 'lucide-react';

export default function Dashboard() {
  const { profile, roles, hasRole } = useAuth();
  const { t } = useTranslation();

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const primaryRole = roles[0];
  const roleLabel = primaryRole ? t(`roles.${primaryRole}`) : t('roles.staff');
  const isManagerOrOwner = hasRole('manager') || hasRole('owner');
  const isStaffOnly = !isManagerOrOwner;

  if (isStaffOnly) {
    return (
      <AppShell>
        <PageHeader
          title={t('dashboard.welcome', { name: firstName })}
          description="Your action items"
        />
        <StaffActionDashboard />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={t('dashboard.welcome', { name: firstName })}
        description={t('dashboard.subtitle', { role: roleLabel })}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label={t('dashboard.teamMembers')} value={12} subtitle={t('dashboard.onShiftToday', { count: 3 })} />
        <StatCard icon={ClipboardCheck} label={t('dashboard.openChecklists')} value={4} subtitle={t('dashboard.dueToday', { count: 2 })} />
        <StatCard icon={CookingPot} label={t('dashboard.activeRecipes')} value={48} subtitle={t('dashboard.updatedThisWeek')} />
        <StatCard icon={Building2} label={t('dashboard.branches')} value={2} subtitle={t('dashboard.allOperational')} />
      </div>

      {/* Operational alerts — managers & owners only */}
      {isManagerOrOwner && (
        <div className="mb-8">
          <h2 className="text-lg font-heading font-semibold text-foreground mb-4">{t('dashboard.operationalAlerts')}</h2>
          <OverdueChecklistsSummary />
        </div>
      )}

      {/* Modules */}
      <h2 className="text-lg font-heading font-semibold text-foreground mb-4">{t('dashboard.modules')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard to="/training" icon={GraduationCap} title={t('nav.training')} description={t('dashboard.moduleDescriptions.training')} stat={t('dashboard.moduleStats.pendingShort', { count: 3 })} />
        <ModuleCard to="/checklists" icon={ClipboardCheck} title={t('nav.checklists')} description={t('dashboard.moduleDescriptions.checklists')} stat={t('dashboard.moduleStats.activeShort', { count: 4 })} />
        <ModuleCard to="/recipes" icon={CookingPot} title={t('nav.recipes')} description={t('dashboard.moduleDescriptions.recipes')} stat={t('dashboard.moduleStats.recipesShort', { count: 48 })} />
        <ModuleCard to="/kitchen-production" icon={ChefHat} title={t('nav.kitchenProduction')} description={t('dashboard.moduleDescriptions.kitchenProduction')} stat={t('dashboard.moduleStats.kitchenProductionToday')} />
        <ModuleCard to="/inventory" icon={Package} title={t('nav.inventory')} description={t('dashboard.moduleDescriptions.inventory')} stat={t('dashboard.moduleStats.lowStockShort', { count: 6 })} />
        <ModuleCard to="/maintenance" icon={Wrench} title={t('nav.maintenance')} description={t('dashboard.moduleDescriptions.maintenance')} stat={t('dashboard.moduleStats.openTicketShort', { count: 1 })} />
        <ModuleCard to="/management" icon={Settings} title={t('nav.management')} description={t('dashboard.moduleDescriptions.management')} stat="" />
      </div>
    </AppShell>
  );
}
