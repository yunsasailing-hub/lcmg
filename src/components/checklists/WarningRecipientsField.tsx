import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useActiveUsersForAssignment, type ActiveUser } from '@/hooks/useChecklists';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  preferredBranchId?: string | null;
  label?: string;
  helperText?: string;
}

/**
 * Multi-select for choosing escalation recipients.
 * Filters to users with role 'manager' or 'owner'.
 * Sorts users from preferredBranchId first.
 */
export default function WarningRecipientsField({
  value,
  onChange,
  preferredBranchId,
  label = 'Warning Recipients',
  helperText = 'Managers/Owners who receive escalation warnings if this checklist is overdue. If empty, falls back to branch managers, then owners.',
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: users, isLoading } = useActiveUsersForAssignment({ enabled: open });

  const eligible = useMemo<ActiveUser[]>(() => {
    const list = (users || []).filter(u =>
      (u.roles || []).some(r => r === 'manager' || r === 'owner')
    );
    return list.sort((a, b) => {
      if (preferredBranchId) {
        const aB = a.branch_id === preferredBranchId ? 0 : 1;
        const bB = b.branch_id === preferredBranchId ? 0 : 1;
        if (aB !== bB) return aB - bB;
      }
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
  }, [users, preferredBranchId]);

  const selectedUsers = eligible.filter(u => value.includes(u.user_id));

  const toggle = (uid: string) => {
    if (value.includes(uid)) onChange(value.filter(v => v !== uid));
    else onChange([...value, uid]);
  };

  const userLabel = (u: ActiveUser) => {
    const name = u.full_name || u.email || 'Unknown';
    const role = (u.roles || []).find(r => r === 'owner') ? 'Owner' : 'Manager';
    return `${name} – ${role}`;
  };

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
            disabled={isLoading}
          >
            <span className="truncate text-sm">
              {selectedUsers.length === 0
                ? (isLoading ? 'Loading…' : 'Select managers/owners…')
                : `${selectedUsers.length} recipient${selectedUsers.length !== 1 ? 's' : ''} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60]" align="start">
          <Command>
            <CommandInput placeholder="Search managers/owners…" />
            <CommandList>
              <CommandEmpty>No managers or owners found.</CommandEmpty>
              <CommandGroup>
                {eligible.map(u => {
                  const checked = value.includes(u.user_id);
                  const sameBranch = preferredBranchId && u.branch_id === preferredBranchId;
                  return (
                    <CommandItem
                      key={u.user_id}
                      value={`${u.full_name || ''} ${u.email || ''}`}
                      onSelect={() => toggle(u.user_id)}
                    >
                      <Check className={cn('mr-2 h-4 w-4', checked ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 truncate">{userLabel(u)}</span>
                      {sameBranch && (
                        <Badge variant="secondary" className="text-[10px] ml-2">same branch</Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedUsers.map(u => (
            <Badge key={u.user_id} variant="secondary" className="gap-1 pr-1">
              <span className="text-xs">{u.full_name || u.email}</span>
              <button
                type="button"
                onClick={() => toggle(u.user_id)}
                className="hover:bg-background/50 rounded-sm p-0.5"
                aria-label="Remove recipient"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{helperText}</p>
    </div>
  );
}