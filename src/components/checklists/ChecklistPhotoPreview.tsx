import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
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
    // Soft mobile back-button intercept: push a sentinel history entry so the
    // device "back" gesture closes ONLY the lightbox and keeps the underlying
    // checklist detail open.
    const stateMarker = { __checklistPhotoLightbox: true, ts: Date.now() };
    window.history.pushState(stateMarker, '');
    let closedViaPop = false;
    const onPop = () => { closedViaPop = true; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // If the user closed via Back button / ESC (not via device-back), pop
      // the sentinel so we don't leave a stale history entry behind.
      if (!closedViaPop && window.history.state && (window.history.state as any).__checklistPhotoLightbox) {
        window.history.back();
      }
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Back to checklist"
        style={{ position: 'fixed', top: 16, left: 16, zIndex: 100000 }}
        className="inline-flex items-center gap-2 rounded-full bg-background/90 text-foreground px-4 py-2 text-sm font-medium shadow-lg hover:bg-background"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to checklist
      </button>
      <img
        src={src}
        alt={alt ?? 'Checklist photo enlarged'}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        style={{
          maxWidth: '96vw',
          maxHeight: '86vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: 6,
          userSelect: 'none',
        }}
      />
    </div>,
    document.body,
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
        aria-label="Open checklist photo"
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