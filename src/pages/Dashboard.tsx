import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import ModuleCard from '@/components/shared/ModuleCard';
import OverdueChecklistsSummary from '@/components/dashboard/OverdueChecklistsSummary';
import { Users, Building2, ClipboardCheck, GraduationCap, CookingPot, Package, Wrench, Settings } from 'lucide-react';

export default function Dashboard() {
  const { profile, roles, hasRole } = useAuth();

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const roleLabel = roles.length > 0 ? roles[0].charAt(0).toUpperCase() + roles[0].slice(1) : 'Staff';
  const isManagerOrOwner = hasRole('manager') || hasRole('owner');

  return (
    <AppShell>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`${roleLabel} · La Cala Restaurant Management`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Team Members" value={12} subtitle="3 on shift today" />
        <StatCard icon={ClipboardCheck} label="Open Checklists" value={4} subtitle="2 due today" />
        <StatCard icon={CookingPot} label="Active Recipes" value={48} subtitle="Updated this week" />
        <StatCard icon={Building2} label="Branches" value={2} subtitle="All operational" />
      </div>

      {/* Operational alerts — managers & owners only */}
      {isManagerOrOwner && (
        <div className="mb-8">
          <h2 className="text-lg font-heading font-semibold text-foreground mb-4">Operational Alerts</h2>
          <OverdueChecklistsSummary />
        </div>
      )}

      {/* Modules */}
      <h2 className="text-lg font-heading font-semibold text-foreground mb-4">Modules</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleCard to="/training" icon={GraduationCap} title="Training" description="Staff training & certifications" stat="3 pending" />
        <ModuleCard to="/checklists" icon={ClipboardCheck} title="Checklists" description="Daily opening & closing tasks" stat="4 active" />
        <ModuleCard to="/recipes" icon={CookingPot} title="Recipes" description="Recipe book & costings" stat="48 recipes" />
        <ModuleCard to="/inventory" icon={Package} title="Inventory" description="Stock levels & orders" stat="6 low stock" />
        <ModuleCard to="/maintenance" icon={Wrench} title="Maintenance" description="Equipment & repairs" stat="1 open ticket" />
        <ModuleCard to="/management" icon={Settings} title="Management" description="Team, branches & settings" stat="" />
      </div>
    </AppShell>
  );
}
