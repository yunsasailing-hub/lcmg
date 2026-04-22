/**
 * Extract a single image File from a ClipboardEvent, if present.
 * Returns null if the clipboard has no image item.
 *
 * This helper is shared by every recipe image field that supports
 * Ctrl+V / ⌘V paste (Master image, procedure step image, service image),
 * so paste behavior stays consistent across the app.
 */
export function getImageFromClipboard(e: ClipboardEvent | React.ClipboardEvent): File | null {
  const items = (e as ClipboardEvent).clipboardData?.items
    ?? (e as React.ClipboardEvent).clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (file) {
        // Give it a friendly name if the OS didn't provide one (common on paste).
        if (!file.name || file.name === 'image.png') {
          const ext = (file.type.split('/')[1] || 'png').toLowerCase();
          return new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
        }
        return file;
      }
    }
  }
  return null;
}

/** True if the clipboard event carries any image payload. */
export function clipboardHasImage(e: ClipboardEvent | React.ClipboardEvent): boolean {
  const items = (e as ClipboardEvent).clipboardData?.items
    ?? (e as React.ClipboardEvent).clipboardData?.items;
  if (!items) return false;
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && items[i].type.startsWith('image/')) return true;
  }
  return false;
}