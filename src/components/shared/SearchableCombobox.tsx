import { useState } from 'react';
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
}

export function SearchableCombobox({
  value, onChange, options, placeholder, searchPlaceholder, emptyText,
  noneLabel, allowNone = false, disabled, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
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
                  <div className="flex flex-col">
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
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
