import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranches } from '@/hooks/useChecklists';

interface BranchSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Standard branch dropdown used across the Checklist module.
 * Reads from the `branches` table so it stays in sync with master data.
 * No free-text input is allowed.
 */
export default function BranchSelect({
  value,
  onChange,
  placeholder = 'Select branch…',
  allowEmpty = false,
  disabled,
  className,
}: BranchSelectProps) {
  const { data: branches, isLoading } = useBranches();

  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? 'Loading branches…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__none__">— No branch —</SelectItem>}
        {branches?.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}