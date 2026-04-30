import { useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Apple, Hammer, ArrowLeft, Info, ClipboardList, ShieldCheck, ListChecks, FileSpreadsheet,
} from 'lucide-react';
import InventoryRequestList from '@/components/inventory/InventoryRequestList';
import InventoryOwnerReview from '@/components/inventory/InventoryOwnerReview';
import InventoryControlList from '@/components/inventory/InventoryControlList';
import InventoryWeeklySheet from '@/components/inventory/InventoryWeeklySheet';
import { useAuth } from '@/hooks/useAuth';

type View = 'dashboard' | 'consumable';

function FutureAutomationNote() {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3 flex gap-2 text-xs text-muted-foreground">
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        <span className="font-medium text-foreground">Future Inventory Automation:</span>{' '}
        Current version is manual and temporary. Future phases will connect sales data, recipes,
        production, supplier orders, and weekly stock count to calculate expected stock, real
        stock difference, waste, and cost control.
      </p>
    </div>
  );
}

function Dashboard({ onOpen }: { onOpen: (v: View) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => onOpen('consumable')}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-500/10 p-2"><Apple className="h-5 w-5 text-emerald-600" /></div>
              <CardTitle className="text-base">Consumable / Food Inventory</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manual stock update and purchase requests for food, beverages, and consumables.
            </p>
            <Button className="mt-3" size="sm">Open</Button>
          </CardContent>
        </Card>

        <Card className="opacity-70">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-500/10 p-2"><Hammer className="h-5 w-5 text-amber-600" /></div>
              <CardTitle className="text-base">Tools / Furniture / Equipment Inventory</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon.</p>
          </CardContent>
        </Card>
      </div>

      <FutureAutomationNote />
    </div>
  );
}

function ConsumableView({ onBack }: { onBack: () => void }) {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Inventory dashboard
        </Button>
      </div>

      <div>
        <h2 className="text-xl font-heading font-semibold">Manual Stock Update & Purchase Request</h2>
        <p className="text-sm text-muted-foreground">
          Create a request listing items, actual stock, and quantities to purchase.
        </p>
      </div>

      {isOwner ? (
        <Tabs defaultValue="sheet">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="sheet"><FileSpreadsheet className="h-4 w-4 mr-1" />Weekly sheet</TabsTrigger>
            <TabsTrigger value="requests"><ClipboardList className="h-4 w-4 mr-1" />All requests</TabsTrigger>
            <TabsTrigger value="review"><ShieldCheck className="h-4 w-4 mr-1" />Owner review</TabsTrigger>
            <TabsTrigger value="control"><ListChecks className="h-4 w-4 mr-1" />Control list</TabsTrigger>
          </TabsList>
          <TabsContent value="sheet" className="mt-3">
            <InventoryWeeklySheet />
          </TabsContent>
          <TabsContent value="requests" className="mt-3">
            <InventoryRequestList />
          </TabsContent>
          <TabsContent value="review" className="mt-3">
            <InventoryOwnerReview />
          </TabsContent>
          <TabsContent value="control" className="mt-3">
            <InventoryControlList />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="sheet">
          <TabsList>
            <TabsTrigger value="sheet"><FileSpreadsheet className="h-4 w-4 mr-1" />Weekly sheet</TabsTrigger>
            <TabsTrigger value="requests"><ClipboardList className="h-4 w-4 mr-1" />My requests</TabsTrigger>
          </TabsList>
          <TabsContent value="sheet" className="mt-3">
            <InventoryWeeklySheet />
          </TabsContent>
          <TabsContent value="requests" className="mt-3">
            <InventoryRequestList />
          </TabsContent>
        </Tabs>
      )}

      <FutureAutomationNote />
    </div>
  );
}

export default function Inventory() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <AppShell>
      <PageHeader
        title="Inventory"
        description="Manual stock update and purchase requests."
      />
      {view === 'dashboard' && <Dashboard onOpen={setView} />}
      {view === 'consumable' && <ConsumableView onBack={() => setView('dashboard')} />}
    </AppShell>
  );
}
