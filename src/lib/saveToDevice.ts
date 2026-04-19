// Save an already-optimized checklist photo to the local device.
//
// Strategy by platform:
//  1. Capacitor native (Android): write JPEG via Filesystem plugin into
//     ExternalStorage/Pictures/LCMG_Checklists → appears in Gallery & File Manager
//     (Android MediaStore auto-indexes files inside Pictures/).
//  2. Capacitor native (iOS): write into Documents (visible in Files app).
//  3. Web Share API with files (mobile Safari/Chrome) → user picks "Save to Photos / Files".
//  4. Fallback: anchor download with object URL → browser saves to Downloads.
//
// All attempts use the SAME optimized JPEG produced by optimizeChecklistImage.
// We never touch original raw files.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { logSaveStep, type SaveDebugStep } from './saveDebug';

const STORAGE_KEY = 'checklist:saveToDevice';
const ANDROID_PUBLIC_SUBDIR = 'Pictures/LCMG_Checklists';

export type SaveMethod = 'capacitor-android' | 'capacitor-ios' | 'share' | 'download';

export type SaveToDeviceResult =
  | { ok: true; method: SaveMethod; uri?: string }
  | { ok: false; reason: 'disabled' | 'permission' | 'unsupported' | 'error'; message?: string };

export interface SaveContext {
  branch?: string | null;
  department?: string | null;
  checklistType?: string | null;
  capturedAt?: Date | string;
}

// ─── Per-device toggle (default ON) ───
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

// ─── Filename helpers ───
function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function safeSegment(input: string | null | undefined, fallback: string): string {
  const s = (input ?? '').toString().trim();
  if (!s) return fallback;
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

// ─── File → base64 (without data: prefix) ───
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 'base64,'.length) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

// ─── Native Android save (public Pictures folder) ───
async function tryCapacitorAndroidSave(file: File, filename: string): Promise<SaveToDeviceResult> {
  const target = `${ANDROID_PUBLIC_SUBDIR}/${filename}`;
  logSaveStep({ step: 'localSaveStarted', target, filename, method: 'capacitor-android' });
  try {
    const data = await fileToBase64(file);
    const written = await Filesystem.writeFile({
      path: target,
      data,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
    logSaveStep({ step: 'localSaveSuccess', uri: written.uri, method: 'capacitor-android' });
    // Android MediaStore auto-scans files placed under /Pictures.
    logSaveStep({ step: 'mediaScanRequested', note: 'implicit via Pictures/ path' });
    logSaveStep({ step: 'mediaScanSuccess' });
    return { ok: true, method: 'capacitor-android', uri: written.uri };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    logSaveStep({ step: 'localSaveFailed', method: 'capacitor-android', error: message });
    // Permission denial is the most common failure here.
    if (/permission/i.test(message)) {
      return { ok: false, reason: 'permission', message };
    }
    return { ok: false, reason: 'error', message };
  }
}

// ─── Native iOS save (Documents → visible in Files app) ───
async function tryCapacitorIosSave(file: File, filename: string): Promise<SaveToDeviceResult> {
  const target = `LCMG_Checklists/${filename}`;
  logSaveStep({ step: 'localSaveStarted', target, filename, method: 'capacitor-ios' });
  try {
    const data = await fileToBase64(file);
    const written = await Filesystem.writeFile({
      path: target,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    logSaveStep({ step: 'localSaveSuccess', uri: written.uri, method: 'capacitor-ios' });
    return { ok: true, method: 'capacitor-ios', uri: written.uri };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    logSaveStep({ step: 'localSaveFailed', method: 'capacitor-ios', error: message });
    return { ok: false, reason: 'error', message };
  }
}

// ─── Web Share API fallback ───
function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
}

async function tryShareSave(file: File): Promise<SaveToDeviceResult> {
  logSaveStep({ step: 'localSaveStarted', target: 'Web Share API', filename: file.name, method: 'share' });
  try {
    await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
      files: [file],
      title: file.name,
    });
    logSaveStep({ step: 'localSaveSuccess', method: 'share' });
    return { ok: true, method: 'share' };
  } catch (err: any) {
    const message = err?.message ?? 'Share failed';
    logSaveStep({ step: 'localSaveFailed', method: 'share', error: message });
    if (err?.name === 'AbortError') return { ok: false, reason: 'permission', message: 'Save cancelled.' };
    return { ok: false, reason: 'error', message };
  }
}

function tryDownloadSave(file: File): SaveToDeviceResult {
  logSaveStep({ step: 'localSaveStarted', target: 'Browser download', filename: file.name, method: 'download' });
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
    logSaveStep({ step: 'localSaveSuccess', method: 'download' });
    return { ok: true, method: 'download' };
  } catch (err: any) {
    const message = err?.message ?? 'Download failed';
    logSaveStep({ step: 'localSaveFailed', method: 'download', error: message });
    return { ok: false, reason: 'error', message };
  }
}

/**
 * Save the optimized checklist photo to the user's device.
 * Renames the file to checklist_{branch}_{dept}_{type}_{ts}.jpg.
 * Respects the per-device toggle (returns { ok:false, reason:'disabled' }).
 */
export async function saveOptimizedPhotoToDevice(
  optimized: File,
  ctx: SaveContext,
): Promise<SaveToDeviceResult> {
  if (!getSaveToDeviceEnabled()) {
    logSaveStep({ step: 'localSaveFailed', method: 'download', error: 'disabled (toggle off)' });
    return { ok: false, reason: 'disabled' };
  }

  const filename = buildChecklistFilename(ctx);
  const renamed = new File([optimized], filename, { type: 'image/jpeg' });

  const isNative = Capacitor.isNativePlatform?.() === true;
  const platform = Capacitor.getPlatform?.() ?? 'web';

  if (isNative && platform === 'android') {
    return tryCapacitorAndroidSave(renamed, filename);
  }
  if (isNative && platform === 'ios') {
    return tryCapacitorIosSave(renamed, filename);
  }

  // Web / PWA — best effort.
  if (canShareFile(renamed)) {
    const r = await tryShareSave(renamed);
    if (r.ok) return r;
    const dl = tryDownloadSave(renamed);
    if (dl.ok) return dl;
    return r;
  }
  return tryDownloadSave(renamed);
}

// Re-export so callers can subscribe to the debug stream.
export type { SaveDebugStep };
