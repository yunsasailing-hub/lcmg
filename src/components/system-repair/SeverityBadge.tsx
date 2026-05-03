import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type Severity = 'low' | 'medium' | 'critical';

const STYLES: Record<Severity, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
};

const TOOLTIPS: Record<Severity, string> = {
  low: 'Safe utility. Minimal risk.',
  medium: 'Changes operational records. Review before running.',
  critical: 'Changes login, permission, or system identity. Use only when absolutely necessary.',
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase cursor-help',
              STYLES[severity],
            )}
          >
            {severity}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {TOOLTIPS[severity]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}