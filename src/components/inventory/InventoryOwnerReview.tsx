import { useMemo, useState } from 'react';
import { Check, X, FileSpreadsheet, Inbox, ListPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  useInventoryRequests, useReviewInventoryRequest,
  type InventoryRequestWithItems, type Department,
} from '@/hooks/useInventoryRequests';
import { useUpsertInventoryControlItem } from '@/hooks/useInventoryControlItems';
import { exportRequestsToXlsx } from './inventoryExport';
import { toast } from 'sonner';

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

export default function InventoryOwnerReview() {
  const { data: requests = [], isLoading } = useInventoryRequests();
  const review = useReviewInventoryRequest();
  const upsertControl = useUpsertInventoryControlItem();

  const [reviewing, setReviewing] = useState<InventoryRequestWithItems | null>(null);
  const [approvedMap, setApprovedMap] = useState<Record<string, string>>({});
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  // Convert-to-control-list dialog state
  const [convertItem, setConvertItem] = useState<any | null>(null);
  const [convertForm, setConvertForm] = useState({
    item_code: '', item_name: '', unit: '',
    remarks: '', min_stock: '', recommended_order: '',
  });

  const submitted = useMemo(
    () => requests.filter(r => r.status === 'Submitted'),
    [requests],
  );

  const openReview = (r: InventoryRequestWithItems) => {
    setReviewing(r);
    const m: Record<string, string> = {};
    r.items.forEach(it => {
      m[it.id] = (it.approved_qty ?? it.requested_qty ?? '').toString();
    });
    setApprovedMap(m);
    setRejectMode(false);
    setRejectNote('');
  };

  const openConvert = (it: any) => {
    setConvertItem({ ...it, _request: reviewing });
    setConvertForm({
      item_code: it.item_code ?? '',
      item_name: it.item_name ?? '',
      unit: it.unit ?? '',
      remarks: '',
      min_stock: '',
      recommended_order: '',
    });
  };

  const closeConvert = () => setConvertItem(null);

  const submitConvert = async () => {
    if (!convertItem) return;
    const req: InventoryRequestWithItems | undefined = convertItem._request;
    if (!convertForm.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }
    try {
      await upsertControl.mutateAsync({
        item_code: convertForm.item_code.trim() || null,
        item_name: convertForm.item_name.trim(),
        unit: convertForm.unit.trim() || null,
        source_type: 'manual',
        is_active: true,
        branch_id: req?.branch_id ?? null,
        department: (req?.department as Department) ?? null,
        remarks: convertForm.remarks.trim() || null,
        min_stock: convertForm.min_stock ? Number(convertForm.min_stock) : null,
        recommended_order: convertForm.recommended_order ? Number(convertForm.recommended_order) : null,
      });
      toast.success('Added to Control List');
      closeConvert();
    } catch (e: any) {
      toast.error(e?.message ?? 'Convert failed');
    }
  };

  const closeReview = () => { setReviewing(null); setApprovedMap({}); };

  const confirm = async () => {
    if (!reviewing) return;
    try {
      await review.mutateAsync({
        id: reviewing.id,
        status: 'Owner Confirmed',
        approved_items: reviewing.items.map(it => ({
          id: it.id,
          approved_qty: approvedMap[it.id] ? Number(approvedMap[it.id]) : null,
        })),
      });
      toast.success('Request confirmed');
      closeReview();
    } catch (e: any) {
      toast.error(e?.message ?? 'Confirm failed');
    }
  };

  const reject = async () => {
    if (!reviewing) return;
    try {
      await review.mutateAsync({
        id: reviewing.id,
        status: 'Rejected',
        rejection_note: rejectNote.trim() || null,
      });
      toast.success('Request rejected');
      closeReview();
    } catch (e: any) {
      toast.error(e?.message ?? 'Reject failed');
    }
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold">Pending owner review</h2>
        <Button variant="outline" onClick={exportConfirmed}>
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Export confirmed (XLS)
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : submitted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No requests waiting for review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {submitted.map(r => (
            <Card key={r.id}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.branch_name ?? '—'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="capitalize text-sm">{r.department}</span>
                      <Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(r.request_date)} · {r.staff_name || '—'} · {r.items.length} item(s)
                    </div>
                  </div>
                  <Button size="sm" onClick={() => openReview(r)}>Review</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(v) => !v && closeReview()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review purchase request</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <>
              <div className="text-sm text-muted-foreground">
                {reviewing.branch_name} · <span className="capitalize">{reviewing.department}</span>
                {' · '} {fmtDate(reviewing.request_date)} · by {reviewing.staff_name || '—'}
              </div>
              {reviewing.notes && (
                <div className="text-sm bg-muted/40 rounded p-2 mt-2">{reviewing.notes}</div>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs">
                    <tr className="text-left border-b">
                      <th className="py-1 pr-2">Code</th>
                      <th className="py-1 pr-2">Name</th>
                      <th className="py-1 pr-2">Unit</th>
                      <th className="py-1 pr-2 text-right">Actual</th>
                      <th className="py-1 pr-2 text-right">Requested</th>
                      <th className="py-1 pr-2 text-right">Approve qty</th>
                      <th className="py-1 pr-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewing.items.filter((it: any) => it.source_type !== 'extra').map(it => (
                      <tr key={it.id} className="border-b last:border-0 align-top">
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
                        <td className="py-1 pr-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="h-8 text-right"
                            value={approvedMap[it.id] ?? ''}
                            onChange={e => setApprovedMap(m => ({ ...m, [it.id]: e.target.value }))}
                          />
                        </td>
                        <td className="py-1 pr-2 text-muted-foreground text-xs">{it.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {reviewing.items.some((it: any) => it.source_type === 'extra') && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold">Additional requests</h4>
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                      Extra / Not coded
                    </Badge>
                  </div>
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground text-xs bg-muted/40">
                        <tr className="text-left">
                          <th className="py-1 px-2">Item name</th>
                          <th className="py-1 px-2">Unit</th>
                          <th className="py-1 px-2 text-right">Requested</th>
                          <th className="py-1 px-2 text-right">Approve qty</th>
                          <th className="py-1 px-2">Note</th>
                          <th className="py-1 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewing.items.filter((it: any) => it.source_type === 'extra').map(it => (
                          <tr key={it.id} className="border-t align-top">
                            <td className="py-1 px-2 font-medium">{it.item_name}</td>
                            <td className="py-1 px-2">{it.unit ?? '—'}</td>
                            <td className="py-1 px-2 text-right">{it.requested_qty ?? '—'}</td>
                            <td className="py-1 px-2">
                              <Input
                                type="number" inputMode="decimal"
                                className="h-8 text-right"
                                value={approvedMap[it.id] ?? ''}
                                onChange={e => setApprovedMap(m => ({ ...m, [it.id]: e.target.value }))}
                              />
                            </td>
                            <td className="py-1 px-2 text-muted-foreground text-xs">{it.note ?? ''}</td>
                            <td className="py-1 px-2 text-right">
                              <Button type="button" size="sm" variant="outline"
                                onClick={() => openConvert(it)}>
                                <ListPlus className="h-3.5 w-3.5 mr-1" />
                                Convert
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Set approve qty to confirm one-time. Leave blank to reject. Use “Convert” to add to the Control List.
                  </p>
                </div>
              )}

              {rejectMode && (
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">Rejection reason (optional)</label>
                  <Textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} />
                </div>
              )}
            </>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeReview}>Cancel</Button>
            {!rejectMode ? (
              <>
                <Button variant="destructive" onClick={() => setRejectMode(true)}>
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button onClick={confirm} disabled={review.isPending}>
                  <Check className="h-4 w-4 mr-1" /> Confirm
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRejectMode(false)}>Back</Button>
                <Button variant="destructive" onClick={reject} disabled={review.isPending}>
                  Confirm rejection
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertItem} onOpenChange={(v) => !v && closeConvert()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert to Control List item</DialogTitle>
          </DialogHeader>
          {convertItem && (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">
                Branch: <span className="text-foreground">{convertItem._request?.branch_name ?? '—'}</span>
                {' · '}
                Department: <span className="text-foreground capitalize">{convertItem._request?.department ?? '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Item name *</Label>
                  <Input value={convertForm.item_name}
                    onChange={e => setConvertForm(f => ({ ...f, item_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Item code</Label>
                  <Input value={convertForm.item_code}
                    onChange={e => setConvertForm(f => ({ ...f, item_code: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input value={convertForm.unit}
                    onChange={e => setConvertForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Min stock</Label>
                  <Input type="number" inputMode="decimal" value={convertForm.min_stock}
                    onChange={e => setConvertForm(f => ({ ...f, min_stock: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Recommended order</Label>
                  <Input type="number" inputMode="decimal" value={convertForm.recommended_order}
                    onChange={e => setConvertForm(f => ({ ...f, recommended_order: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Remarks</Label>
                  <Input value={convertForm.remarks}
                    onChange={e => setConvertForm(f => ({ ...f, remarks: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeConvert}>Cancel</Button>
            <Button onClick={submitConvert} disabled={upsertControl.isPending}>
              <ListPlus className="h-4 w-4 mr-1" /> Add to Control List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}