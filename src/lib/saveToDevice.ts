// Save an already-optimized checklist photo to the local device.
//
// Strategy by platform:
//  1. Web Share API with files (mobile Safari/Chrome) → user picks "Save to Photos / Files".
//  2. Fallback: anchor download with object URL → browser saves to Downloads.
//
// All attempts use the SAME optimized JPEG produced by optimizeChecklistImage.
// We never touch original raw files.

const STORAGE_KEY = 'checklist:saveToDevice';

export type SaveToDeviceResult =
  | { ok: true; method: 'share' | 'download' }
  | { ok: false; reason: 'disabled' | 'permission' | 'unsupported' | 'error'; message?: string };

export interface SaveContext {
  branch?: string | null;
  department?: string | null;
  checklistType?: string | null;
  // ISO date or Date — used to build timestamp segment.
  capturedAt?: Date | string;
}

// Per-device toggle (default ON).
export function getSaveToDeviceEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export function setSaveToDeviceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function safeSegment(input: string | null | undefined, fallback: string): string {
  const s = (input ?? '').toString().trim();
  if (!s) return fallback;
  // Capitalize first letter, strip unsafe chars, collapse whitespace.
  const cleaned = s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function buildChecklistFilename(ctx: SaveContext): string {
  const branch = safeSegment(ctx.branch, 'Branch');
  const dept = safeSegment(ctx.department, 'Dept');
  const type = safeSegment(ctx.checklistType, 'Checklist');
  const d = ctx.capturedAt ? new Date(ctx.capturedAt) : new Date();
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `checklist_${branch}_${dept}_${type}_${stamp}.jpg`;
}

function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
}

async function tryShareSave(file: File): Promise<SaveToDeviceResult> {
  try {
    await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
      files: [file],
      title: file.name,
    });
    return { ok: true, method: 'share' };
  } catch (err: any) {
    // User cancelled the share sheet — treat as permission denied (silent).
    if (err?.name === 'AbortError') {
      return { ok: false, reason: 'permission', message: 'Save cancelled.' };
    }
    return { ok: false, reason: 'error', message: err?.message ?? 'Share failed' };
  }
}

function tryDownloadSave(file: File): SaveToDeviceResult {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, method: 'download' };
  } catch (err: any) {
    return { ok: false, reason: 'error', message: err?.message ?? 'Download failed' };
  }
}

/**
 * Save the optimized checklist photo to the user's device.
 * Renames the file to the canonical checklist_{branch}_{dept}_{type}_{ts}.jpg before saving.
 * Respects the per-device toggle (returns { ok:false, reason:'disabled' } if off).
 */
export async function saveOptimizedPhotoToDevice(
  optimized: File,
  ctx: SaveContext,
): Promise<SaveToDeviceResult> {
  if (!getSaveToDeviceEnabled()) {
    return { ok: false, reason: 'disabled' };
  }

  const filename = buildChecklistFilename(ctx);
  const renamed = new File([optimized], filename, { type: 'image/jpeg' });

  // Mobile (iOS/Android): Web Share with files → device gallery / Files app.
  if (canShareFile(renamed)) {
    const r = await tryShareSave(renamed);
    if (r.ok) return r;
    // If user cancelled or share failed, fall back to download.
    const dl = tryDownloadSave(renamed);
    if (dl.ok) return dl;
    return r;
  }

  // Desktop / unsupported: trigger a download.
  return tryDownloadSave(renamed);
}
