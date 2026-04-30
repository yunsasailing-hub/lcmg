/**
 * Unified storage upload helper for the `app-files` bucket.
 *
 * PURPOSE
 * -------
 * Centralizes all *future* file uploads across modules (documents,
 * checklists, maintenance, recipes, staff certificates, ...) into a single
 * Supabase Storage bucket with a predictable folder structure and naming
 * convention.
 *
 * IMPORTANT
 * ---------
 * - This is a PREPARATION step. Existing checklist photo and recipe media
 *   upload code paths still use their original buckets
 *   (`checklist-photos`, `recipe-media`) and have NOT been migrated.
 * - New modules should call `uploadToAppFilesBucket(...)` instead of
 *   talking to `supabase.storage` directly.
 * - Old buckets remain untouched. No file migration is performed.
 *
 * USAGE EXAMPLE
 * -------------
 *   const result = await uploadToAppFilesBucket(file, 'maintenance', {
 *     branchName: 'La Cala',
 *     category: 'refrigeration',
 *     assetOrEquipment: 'walk-in-fridge-1',
 *   });
 *   // result.publicUrl -> use anywhere a public URL is needed
 */

import { supabase } from '@/integrations/supabase/client';

export const APP_FILES_BUCKET = 'app-files';

// ---------------------------------------------------------------------------
// Branch codes
// ---------------------------------------------------------------------------

/** Canonical branch code map. Extend here when new branches are added. */
const BRANCH_CODE_MAP: Record<string, string> = {
  bottega26: 'B26',
  'bottega 26': 'B26',
  lacala: 'LCL',
  'la cala': 'LCL',
  lacalamare: 'LCM',
  'la cala mare': 'LCM',
};

/**
 * Resolve a human branch name (e.g. "La Cala Mare") to its short code
 * (e.g. "LCM"). Falls back to a sanitized slug if the branch is unknown,
 * so uploads never fail just because a branch isn't in the map yet.
 */
export function getBranchCode(branchName: string | null | undefined): string {
  if (!branchName) return 'UNK';
  const key = branchName.trim().toLowerCase();
  if (BRANCH_CODE_MAP[key]) return BRANCH_CODE_MAP[key];
  // Fallback: take initials/letters, uppercase, max 6 chars.
  const fallback = key.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 6);
  return fallback || 'UNK';
}

// ---------------------------------------------------------------------------
// File name normalization
// ---------------------------------------------------------------------------

/**
 * Convert an arbitrary filename into a safe, lowercase, hyphen-separated
 * slug while preserving its original extension.
 *
 *   "Pizza Margherita (NEW!).JPG" -> "pizza-margherita-new.jpg"
 */
export function cleanFileName(originalFileName: string): string {
  const lastDot = originalFileName.lastIndexOf('.');
  const rawName = lastDot > 0 ? originalFileName.slice(0, lastDot) : originalFileName;
  const rawExt = lastDot > 0 ? originalFileName.slice(lastDot + 1) : '';

  const cleanName = rawName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .slice(0, 80) || 'file';

  const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return cleanExt ? `${cleanName}.${cleanExt}` : cleanName;
}

/** Random short uuid-like prefix (8 hex chars). Avoids collisions cheaply. */
function shortUuid(): string {
  // crypto.randomUUID is widely available in modern browsers / Node.
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  return uuid.replace(/-/g, '').slice(0, 8);
}

/**
 * Build the final stored filename:
 *   {uuid}_{clean-readable-file-name}.{extension}
 *
 * Example: `8f31c9a2_pizza-margherita.jpg`
 */
export function generateStorageFileName(originalFileName: string): string {
  return `${shortUuid()}_${cleanFileName(originalFileName)}`;
}

// ---------------------------------------------------------------------------
// Path building
// ---------------------------------------------------------------------------

export type AppFilesModuleType =
  | 'documents'
  | 'checklists'
  | 'maintenance'
  | 'recipes-images'
  | 'recipes-videos'
  | 'recipes-step-photos'
  | 'staff-certificates';

export interface BuildStoragePathOptions {
  /** Required for documents/checklists/maintenance. Human branch name. */
  branchName?: string;
  /** documents: e.g. "invoices", "contracts" */
  documentType?: string;
  /** checklists: defaults to current year */
  year?: number | string;
  /** checklists: defaults to current 1-12 month */
  month?: number | string;
  /** maintenance: e.g. "refrigeration", "electrical" */
  category?: string;
  /** maintenance: asset code or equipment slug */
  assetOrEquipment?: string;
}

/**
 * Build the folder prefix (no filename) for a given module.
 * Always returns a path WITHOUT leading or trailing slashes.
 *
 *   documents/{branchCode}/{documentType}/
 *   checklists/{branchCode}/{year}/{month}/
 *   maintenance/{branchCode}/{category}/{assetOrEquipment}/
 *   recipes/images/
 *   recipes/videos/
 *   recipes/step-photos/
 *   staff/certificates/
 */
export function buildStoragePath(
  moduleType: AppFilesModuleType,
  options: BuildStoragePathOptions = {},
): string {
  const branchCode = getBranchCode(options.branchName);
  const slug = (v: string | number | undefined, fallback = 'misc') =>
    String(v ?? fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;

  switch (moduleType) {
    case 'documents':
      return `documents/${branchCode}/${slug(options.documentType, 'general')}`;
    case 'checklists': {
      const now = new Date();
      const year = String(options.year ?? now.getUTCFullYear());
      const month = String(options.month ?? (now.getUTCMonth() + 1)).padStart(2, '0');
      return `checklists/${branchCode}/${year}/${month}`;
    }
    case 'maintenance':
      return `maintenance/${branchCode}/${slug(options.category, 'general')}/${slug(options.assetOrEquipment, 'unassigned')}`;
    case 'recipes-images':
      return 'recipes/images';
    case 'recipes-videos':
      return 'recipes/videos';
    case 'recipes-step-photos':
      return 'recipes/step-photos';
    case 'staff-certificates':
      return 'staff/certificates';
    default:
      return 'misc';
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface AppFilesUploadResult {
  bucket: string;
  path: string;          // full path inside the bucket
  publicUrl: string;
  originalFileName: string;
  storedFileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;    // ISO timestamp
}

/**
 * Upload a file to the unified `app-files` bucket.
 *
 * - Path is computed via `buildStoragePath(moduleType, options)`.
 * - Filename is computed via `generateStorageFileName(file.name)`.
 * - Never overwrites: `upsert` is forced to `false`. The UUID prefix makes
 *   collisions effectively impossible.
 *
 * Returns rich metadata so callers can persist what they need (e.g. into
 * a `documents` table or a maintenance record).
 */
export async function uploadToAppFilesBucket(
  file: File,
  moduleType: AppFilesModuleType,
  options: BuildStoragePathOptions = {},
): Promise<AppFilesUploadResult> {
  const folder = buildStoragePath(moduleType, options);
  const storedFileName = generateStorageFileName(file.name);
  const path = `${folder}/${storedFileName}`;

  const { error } = await supabase.storage
    .from(APP_FILES_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(APP_FILES_BUCKET).getPublicUrl(path);

  return {
    bucket: APP_FILES_BUCKET,
    path,
    publicUrl: data.publicUrl,
    originalFileName: file.name,
    storedFileName,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
}