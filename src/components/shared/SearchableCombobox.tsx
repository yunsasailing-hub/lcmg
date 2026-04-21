import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface ComboOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  noneLabel?: string;
  allowNone?: boolean;
  disabled?: boolean;
  className?: string;
  autoOpen?: boolean;
}

export function SearchableCombobox({
  value, onChange, options, placeholder, searchPlaceholder, emptyText,
  noneLabel, allowNone = false, disabled, className, autoOpen = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    if (autoOpen) setOpen(true);
    // run only on mount when autoOpen is set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <Command className="overflow-hidden rounded-md">
          <CommandInput placeholder={searchPlaceholder} className="h-10" />
          <CommandList className="max-h-64 overflow-y-auto overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem
                  value="__none__"
                  onSelect={() => { onChange(''); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                  {noneLabel ?? '—'}
                </CommandItem>
              )}
              {options.map(o => (
                <CommandItem
                  key={o.id}
                  value={`${o.label} ${o.sublabel ?? ''}`}
                  onSelect={() => { onChange(o.id); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.sublabel && <span className="truncate text-xs text-muted-foreground">{o.sublabel}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
