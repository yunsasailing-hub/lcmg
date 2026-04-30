import { useMemo, useState } from 'react';
import { Pencil, Trash2, FileSpreadsheet, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useDeleteInventoryRequest, useInventoryRequests,
  type InventoryRequestStatus, type InventoryRequestWithItems,
} from '@/hooks/useInventoryRequests';
import { useAuth } from '@/hooks/useAuth';
import InventoryWeeklySheet from './InventoryWeeklySheet';
import { exportRequestsToXlsx } from './inventoryExport';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const STATUS_BADGE: Record<InventoryRequestStatus, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Submitted: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  'Owner Confirmed': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

export default function InventoryRequestList({ ownerView = false }: { ownerView?: boolean }) {
  const { hasRole, user } = useAuth();
  const { data: requests = [], isLoading } = useInventoryRequests();
  const del = useDeleteInventoryRequest();
  const isManagerOrOwner = hasRole('owner') || hasRole('manager');
  const isOwner = hasRole('owner');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<InventoryRequestWithItems | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (ownerView && r.status === 'Draft') return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const hit = (r.staff_name ?? '').toLowerCase().includes(s)
          || (r.branch_name ?? '').toLowerCase().includes(s)
          || r.department.toLowerCase().includes(s)
          || r.items.some(it =>
            (it.item_name ?? '').toLowerCase().includes(s)
            || (it.item_code ?? '').toLowerCase().includes(s));
        if (!hit) return false;
      }
      return true;
    });
  }, [requests, search, statusFilter, ownerView]);

  const canEdit = (r: InventoryRequestWithItems) => {
    if (isManagerOrOwner) return true;
    return r.created_by === user?.id && (r.status === 'Draft' || r.status === 'Submitted');
  };

  const exportConfirmed = () => {
    const confirmed = requests.filter(r => r.status === 'Owner Confirmed');
    if (!confirmed.length) {
      toast.error('No confirmed requests to export');
      return;
    }
    exportRequestsToXlsx(confirmed);
    toast.success(`Exported ${confirmed.length} confirmed request(s)`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search items, staff, branch…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="max-w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {!ownerView && <SelectItem value="Draft">Draft</SelectItem>}
            <SelectItem value="Submitted">Submitted</SelectItem>
            <SelectItem value="Owner Confirmed">Owner Confirmed</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {ownerView && (
          <Button variant="outline" onClick={exportConfirmed}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export confirmed (XLS)
          </Button>
        )}
        {!ownerView && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            New request
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.branch_name ?? '—'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="capitalize text-sm">{r.department}</span>
                      <Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(r.request_date)} · {r.staff_name || '—'} · {r.items.length} item(s)
                    </div>
                    {r.rejection_note && (
                      <div className="text-xs text-rose-600 mt-1">Reason: {r.rejection_note}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit(r) && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isOwner && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Items preview */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left border-b">
                        <th className="py-1 pr-2">Code</th>
                        <th className="py-1 pr-2">Name</th>
                        <th className="py-1 pr-2">Unit</th>
                        <th className="py-1 pr-2 text-right">Actual</th>
                        <th className="py-1 pr-2 text-right">Requested</th>
                        <th className="py-1 pr-2 text-right">Approved</th>
                        <th className="py-1 pr-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.map(it => (
                        <tr key={it.id} className="border-b last:border-0">
                          <td className="py-1 pr-2">{it.item_code ?? '—'}</td>
                          <td className="py-1 pr-2">
                            <span>{it.item_name}</span>
                            {(it as any).source_type === 'manual' && (
                              <Badge variant="outline" className="ml-2 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] px-1 py-0">
                                Manual
                              </Badge>
                            )}
                          </td>
                          <td className="py-1 pr-2">{it.unit ?? '—'}</td>
                          <td className="py-1 pr-2 text-right">{it.actual_stock ?? '—'}</td>
                          <td className="py-1 pr-2 text-right">{it.requested_qty ?? '—'}</td>
                          <td className="py-1 pr-2 text-right font-medium">{it.approved_qty ?? '—'}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{it.note ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit weekly inventory' : 'New weekly inventory'}
            </DialogTitle>
          </DialogHeader>
          <InventoryWeeklySheet
            key={editing?.id ?? 'new'}
            initial={editing}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this request?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try { await del.mutateAsync(confirmDelete); toast.success('Deleted'); }
                catch (e: any) { toast.error(e?.message ?? 'Delete failed'); }
                setConfirmDelete(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}