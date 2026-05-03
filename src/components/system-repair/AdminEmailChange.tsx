import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Fragment } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MailWarning, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { invokeManageRoles } from '@/lib/manageRoles';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_PHRASE = 'CHANGE EMAIL';

interface MemberRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
  branch_id: string | null;
  roles?: string[];
}

export default function AdminEmailChange() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [memberId, setMemberId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const { data } = useQuery({
    queryKey: ['admin-email-change-members'],
    queryFn: () => invokeManageRoles('list_full'),
  });

  const members: MemberRow[] = data?.profiles || [];
  const branches: { id: string; name: string }[] = data?.branches || [];
  const branchMap = useMemo(() => {
    const m: Record<string, string> = {};
    branches.forEach(b => { m[b.id] = b.name; });
    return m;
  }, [branches]);

  const selected = members.find(m => m.user_id === memberId) || null;

  const { data: logs } = useQuery({
    queryKey: ['admin-email-change-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_email_change_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await supabase.functions.invoke('admin-change-email', {
        body: { member_id: memberId, new_email: newEmail.trim().toLowerCase(), reason: reason.trim() },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.error) throw new Error(res.error.message || 'Request failed');
      if (res.data?.ok === false) throw new Error(res.data.error || 'Change failed');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email changed successfully');
      setMemberId('');
      setNewEmail('');
      setReason('');
      setAck(false);
      setConfirmText('');
      queryClient.invalidateQueries({ queryKey: ['admin-email-change-log'] });
      queryClient.invalidateQueries({ queryKey: ['admin-email-change-members'] });
      queryClient.invalidateQueries({ queryKey: ['user-management'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailValid = EMAIL_REGEX.test(newEmail.trim());
  const isDifferent = selected ? newEmail.trim().toLowerCase() !== (selected.email || '').toLowerCase() : false;
  const canSubmit =
    !!selected &&
    emailValid &&
    isDifferent &&
    reason.trim().length > 0 &&
    ack &&
    confirmText === CONFIRM_PHRASE &&
    !mutation.isPending;

  return (
    <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <MailWarning className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <h3 className="font-heading font-semibold leading-tight">Admin Email Change</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Change a user login email only when correction or migration is required.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen(o => !o)}
            className="shrink-0 w-full sm:w-auto"
          >
            {open ? 'Close Tool' : 'Open Tool'}
          </Button>
        </div>

        <Collapsible open={open}>
          <CollapsibleContent>
            <div className="border-t p-5 space-y-6">
              {/* Step 1 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Select member</h4>
                <div>
                  <Label>Select Member</Label>
                  <Select value={memberId} onValueChange={setMemberId}>
                    <SelectTrigger><SelectValue placeholder="Choose a member..." /></SelectTrigger>
                    <SelectContent>
                      {members.map(m => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {(m.full_name || 'Unnamed')} — {m.email || 'no email'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selected && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Name: </span>{selected.full_name || '—'}</div>
                    <div><span className="text-muted-foreground">Position: </span>{selected.position || '—'}</div>
                    <div><span className="text-muted-foreground">Role: </span>{(selected.roles && selected.roles[0]) || 'staff'}</div>
                    <div><span className="text-muted-foreground">Department: </span>{selected.department || '—'}</div>
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Branch: </span>{selected.branch_id ? (branchMap[selected.branch_id] || selected.branch_id) : 'No branch'}</div>
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Email change</h4>
                <div>
                  <Label>Current Email</Label>
                  <Input value={selected?.email || ''} readOnly disabled className="bg-muted cursor-not-allowed" />
                </div>
                <div>
                  <Label>New Email *</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="new.email@example.com"
                  />
                  {newEmail && !emailValid && (
                    <p className="text-xs text-destructive mt-1">Invalid email format</p>
                  )}
                  {emailValid && selected && !isDifferent && (
                    <p className="text-xs text-destructive mt-1">New email must differ from current email</p>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Step 3 — Reason</h4>
                <div>
                  <Label>Reason for Change *</Label>
                  <Textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Why this email must be changed..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Step 4 — Confirmation</h4>
                <div className="flex items-start gap-2">
                  <Checkbox id="ack" checked={ack} onCheckedChange={v => setAck(v === true)} />
                  <Label htmlFor="ack" className="text-sm font-normal leading-snug cursor-pointer">
                    I understand this changes the user login identity and may affect login.
                  </Label>
                </div>
                <div>
                  <Label>Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm</Label>
                  <Input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={CONFIRM_PHRASE}
                  />
                </div>
              </div>

              <div className="pt-2 border-t">
                <Button
                  variant="destructive"
                  disabled={!canSubmit}
                  onClick={() => mutation.mutate()}
                  className="w-full"
                >
                  {mutation.isPending ? 'Changing…' : 'Change Email'}
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

      <div className="border-t px-4 py-3 sm:px-5 sm:py-4 bg-card/50 rounded-b-lg">
        <h3 className="text-sm font-heading font-semibold text-muted-foreground mb-2">Email Change History</h3>
        {!logs || logs.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">No email changes recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Old Email</TableHead>
                  <TableHead>New Email</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l: any) => (
                  <Fragment key={l.id}>
                    <TableRow key={l.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(l.changed_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{l.member_name || l.member_id}</TableCell>
                      <TableCell className="text-xs">{l.old_email || '—'}</TableCell>
                      <TableCell className="text-xs">{l.new_email}</TableCell>
                      <TableCell className="text-sm">{l.changed_by_name || '—'}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            l.status === 'success' ? 'bg-green-600 text-white'
                            : l.status === 'partial_failed' ? 'bg-orange-600 text-white'
                            : 'bg-red-600 text-white'
                          }
                        >
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpandedLog(expandedLog === l.id ? null : l.id)}
                          aria-label="Toggle reason"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedLog === l.id ? 'rotate-180' : ''}`} />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedLog === l.id && (
                      <TableRow key={`${l.id}-reason`}>
                        <TableCell colSpan={7} className="bg-muted/30 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Reason: </span>{l.reason || '—'}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}