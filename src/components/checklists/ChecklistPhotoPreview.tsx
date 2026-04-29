import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Simple in-place viewer for checklist photos.
 *
 * - Local React state only — does NOT navigate routes.
 * - ESC closes. "Back to checklist" button closes.
 * - No zoom, no pan, no drag, no wheel handling.
 */
function PhotoLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
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
        padding: 16,
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
        draggable={false}
        style={{
          maxWidth: '96vw',
          maxHeight: '86vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: 6,
          userSelect: 'none',
          cursor: 'default',
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

  // Do not remove checklist photo click handler. Required for new and archived photos.
  // The button below + the image onClick BOTH open the full-screen viewer.
  // Removing either will break click-to-enlarge for newly uploaded or archived checklist photos.
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'block w-full overflow-hidden rounded-md border bg-muted cursor-pointer transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring',
          className,
        )}
        aria-label="Open checklist photo"
      >
        <img
          src={imageUrl}
          alt={altText ?? 'Task photo'}
          loading="lazy"
          className="w-full max-h-[220px] md:max-h-[260px] object-contain bg-muted cursor-pointer"
          draggable={false}
          // Do not remove. Ensures click works for both new uploads and archived photos.
          onClick={handleOpen}
        />
      </button>
      {open && <PhotoLightbox src={imageUrl} alt={altText} onClose={() => setOpen(false)} />}
    </>
  );
}

export default ChecklistPhotoPreview;