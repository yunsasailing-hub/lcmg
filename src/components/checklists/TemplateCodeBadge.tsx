import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Small badge that always shows the template code, or "No Template Code" as a
 * destructive fallback. Use anywhere a checklist or template is displayed so
 * staff can disambiguate similarly-named checklists.
 */
export function TemplateCodeBadge({
  code,
  className,
}: {
  code?: string | null;
  className?: string;
}) {
  const hasCode = !!code && code.trim().length > 0;
  return (
    <Badge
      variant={hasCode ? 'outline' : 'destructive'}
      className={cn('font-mono text-[10px] px-1.5 py-0 normal-case tracking-tight', className)}
    >
      {hasCode ? `Template Code: ${code}` : 'No Template Code'}
    </Badge>
  );
}

/**
 * Returns "CODE · Title" when a code exists, or just the title otherwise.
 * Use as a string-friendly inline title prefix.
 */
export function formatChecklistTitle(code: string | null | undefined, title: string | null | undefined): string {
  const t = title ?? '';
  if (code && code.trim()) return `${code} · ${t}`;
  return t;
}