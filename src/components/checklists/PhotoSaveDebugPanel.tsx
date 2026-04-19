import { useEffect, useRef, useState } from 'react';
import { Bug, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { subscribeSaveDebug, type SaveDebugEntry } from '@/lib/saveDebug';

const MAX_ENTRIES = 80;

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function entryColor(step: string): string {
  if (step.endsWith('Failed')) return 'text-destructive';
  if (step.endsWith('Success') || step === 'final') return 'text-emerald-600';
  return 'text-foreground';
}

export default function PhotoSaveDebugPanel() {
  const [entries, setEntries] = useState<SaveDebugEntry[]>([]);
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeSaveDebug((e) => {
      setEntries((prev) => {
        const next = [...prev, e];
        return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
      });
    });
  }, []);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, open]);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card text-xs overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <Bug className="h-3.5 w-3.5" />
          <span className="font-medium">Photo save debug ({entries.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setEntries([])}
            aria-label="Clear debug log"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto px-3 py-2 space-y-1 font-mono">
          {entries.map((e, i) => {
            const { step, ...rest } = e.data as any;
            const detail = Object.entries(rest)
              .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join(' ');
            return (
              <div key={i} className="flex gap-2 leading-snug">
                <span className="text-muted-foreground shrink-0">{fmtTime(e.at)}</span>
                <span className={`shrink-0 ${entryColor(step)}`}>{step}</span>
                {detail && <span className="text-muted-foreground break-all">{detail}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
