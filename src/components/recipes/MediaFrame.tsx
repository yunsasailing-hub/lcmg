import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MediaFrameProps {
  /** Compact step-level frame uses a smaller max-width but same 4:3 ratio. */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Shared media preview frame used across recipe media (images, YouTube, Drive,
 * step-level previews, and PDF export). Locks aspect ratio to 4:3 for clean
 * A4 print alignment, scales responsively, and contains content (no cropping).
 */
export default function MediaFrame({ compact = false, className, children }: MediaFrameProps) {
  return (
    <div
      className={cn(
        'media-frame relative w-full overflow-hidden rounded-md border bg-muted',
        compact ? 'max-w-sm' : 'max-w-[480px]',
        className,
      )}
      style={{ aspectRatio: '4 / 3' }}
    >
      <div className="absolute inset-0 flex items-center justify-center [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>iframe]:h-full [&>iframe]:w-full">
        {children}
      </div>
    </div>
  );
}
