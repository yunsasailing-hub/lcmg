import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * In-place lightbox for checklist photos.
 *
 * - Local React state only — does NOT navigate routes.
 * - Pushes a sentinel history entry so the mobile back button closes
 *   the lightbox first instead of leaving the checklist screen.
 * - ESC and outside-click close.
 */
function PhotoLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const stateMarker = { __lightbox: true, ts: Date.now() };
    window.history.pushState(stateMarker, '');
    let closedViaPop = false;

    const onPop = () => {
      closedViaPop = true;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (!closedViaPop && window.history.state && (window.history.state as any).__lightbox) {
        window.history.back();
      }
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-8 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image preview"
        className="absolute top-3 right-3 sm:top-5 sm:right-5 rounded-full bg-background/90 text-foreground p-2 shadow-lg hover:bg-background"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt ?? 'Checklist photo enlarged'}
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-md select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

interface ChecklistPhotoPreviewProps {
  imageUrl: string;
  altText?: string;
  /** Override the preview thumbnail wrapper class. */
  className?: string;
}

/**
 * Reusable thumbnail + click-to-enlarge for checklist photos.
 * No route navigation — lightbox state is local.
 */
export function ChecklistPhotoPreview({ imageUrl, altText, className }: ChecklistPhotoPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          'block w-full overflow-hidden rounded-md border bg-muted cursor-zoom-in transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring',
          className,
        )}
        aria-label="Open photo preview"
      >
        <img
          src={imageUrl}
          alt={altText ?? 'Task photo'}
          loading="lazy"
          className="w-full max-h-[220px] md:max-h-[260px] object-contain bg-muted"
          draggable={false}
        />
      </button>
      {open && <PhotoLightbox src={imageUrl} alt={altText} onClose={() => setOpen(false)} />}
    </>
  );
}

export default ChecklistPhotoPreview;