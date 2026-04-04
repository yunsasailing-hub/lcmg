import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import ModuleCard from '@/components/shared/ModuleCard';
import { Users, Building2, ClipboardCheck, GraduationCap, CookingPot, Package, Wrench, Settings } from 'lucide-react';

export default function Dashboard() {
  const { profile, roles } = useAuth();
  const { t } = useTranslation();

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const roleLabel = roles.length > 0 ? roles[0].charAt(0).toUpperCase() + roles[0].slice(1) : 'Staff';

  return (
    <AppShell>
      <PageHeader
        title={t('dashboard.welcome', { name: firstName })}
        description={t('dashboard.roleLabel', { role: roleLabel })}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label={t('dashboard.teamMembers')} value={12} subtitle={t('dashboard.onShift')} />
        <StatCard icon={ClipboardCheck} label={t('dashboard.openChecklists')} value={4} subtitle={t('dashboard.dueToday')} />
        <StatCard icon={CookingPot} label={t('dashboard.activeRecipes')} value={48} subtitle={t('dashboard.updatedWeek')} />
        <StatCard icon={Building2} label={t('dashboard.branches')} value={2} subtitle={t('dashboard.allOperational')} />
      </div>

      <h2 className="text-lg font-heading font-semibold text-foreground mb-4">{t('dashboard.modules')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard to="/training" icon={GraduationCap} title={t('nav.training')} description={t('dashboard.trainingDesc')} stat={t('dashboard.pending', { count: 3 })} />
        <ModuleCard to="/checklists" icon={ClipboardCheck} title={t('nav.checklists')} description={t('dashboard.checklistsDesc')} stat={t('dashboard.active', { count: 4 })} />
        <ModuleCard to="/recipes" icon={CookingPot} title={t('nav.recipes')} description={t('dashboard.recipesDesc')} stat={t('dashboard.recipesCount', { count: 48 })} />
        <ModuleCard to="/inventory" icon={Package} title={t('nav.inventory')} description={t('dashboard.inventoryDesc')} stat={t('dashboard.lowStock', { count: 6 })} />
        <ModuleCard to="/maintenance" icon={Wrench} title={t('nav.maintenance')} description={t('dashboard.maintenanceDesc')} stat={t('dashboard.openTicket', { count: 1 })} />
        <ModuleCard to="/management" icon={Settings} title={t('nav.management')} description={t('dashboard.managementDesc')} stat="" />
      </div>
    </AppShell>
  );
}
