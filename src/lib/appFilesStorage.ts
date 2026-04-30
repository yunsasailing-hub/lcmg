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
// Centralized path generator (spec: generateStoragePath)
// ---------------------------------------------------------------------------

/**
 * Modules supported by `generateStoragePath`. Mirrors the folder layout
 * inside the `app-files` bucket.
 */
export type StoragePathModule =
  | 'documents'
  | 'checklists'
  | 'maintenance'
  | 'recipes'
  | 'staff';

/**
 * Branch identifier accepted by `generateStoragePath`. Either a canonical
 * short code (LCL/LCM/B26) or a human branch name — both are normalized
 * via `getBranchCode`.
 */
export type StorageBranchInput = string | null | undefined;

/**
 * Options for `generateStoragePath`. Different modules use different
 * combinations of these fields; see the per-module rules below.
 */
export interface GenerateStoragePathOptions {
  /** Required for documents/checklists/maintenance. */
  branch?: StorageBranchInput;
  /**
   * Module sub-type:
   *  - documents: licenses | contracts | supplier | internal | ...
   *  - recipes:   images | videos | step-photos
   *  - staff:     certificates | contracts | training | ...
   *  - maintenance: equipment slug (e.g. "coffee-machine")
   */
  subType?: string;
  /** Original filename (will be cleaned). Required for most modules. */
  fileName?: string;
  /** checklists: human/business checklist code (e.g. CHK-001). */
  checklistId?: string;
  /** checklists: defaults to current UTC year. */
  year?: number | string;
  /** checklists: defaults to current UTC month (01-12). */
  month?: number | string;
  /** recipes: required for images/videos/step-photos. */
  recipeId?: string;
  /** recipes (step-photos): step number, formatted as 2-digit string. */
  stepNumber?: number | string;
  /** staff: e.g. STF-001. */
  staffId?: string;
}

/** Lowercase + replace spaces with underscores + strip path separators. */
function sanitizeFileName(name: string | undefined | null): string {
  if (!name) return 'file';
  const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const base = lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
  return base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '') || 'file';
}

/** Lowercase slug used for sub-type segments (no underscores; hyphens). */
function sanitizeSegment(value: string | number | undefined | null, fallback = 'general'): string {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

/**
 * Centralized storage path generator for the `app-files` bucket.
 *
 * All modules MUST route their `app-files` uploads through this function so
 * the folder structure stays consistent. UI code must never accept a manual
 * path — pass module + metadata only.
 *
 * Layouts:
 *   documents/{BRANCH}/{subType}/{fileName}
 *   checklists/{BRANCH}/{year}/{month}/{checklistId}_{fileName}
 *   maintenance/{BRANCH}/{equipment}/{fileName}
 *   recipes/images/{recipeId}.{ext}
 *   recipes/videos/{recipeId}.{ext}
 *   recipes/step-photos/{recipeId}_{stepNumber}.{ext}
 *   staff/{subType}/{staffId}_{fileName}
 */
export function generateStoragePath(
  module: StoragePathModule,
  options: GenerateStoragePathOptions = {},
): string {
  const branchCode = getBranchCode(options.branch ?? undefined);
  const cleanName = sanitizeFileName(options.fileName);
  const ext = (() => {
    const dot = cleanName.lastIndexOf('.');
    return dot > 0 ? cleanName.slice(dot + 1) : '';
  })();

  switch (module) {
    case 'documents': {
      const sub = sanitizeSegment(options.subType, 'general');
      return `documents/${branchCode}/${sub}/${cleanName}`;
    }
    case 'checklists': {
      const now = new Date();
      const year = String(options.year ?? now.getUTCFullYear());
      const month = String(options.month ?? (now.getUTCMonth() + 1)).padStart(2, '0');
      const cid = sanitizeSegment(options.checklistId, 'CHK').toUpperCase();
      return `checklists/${branchCode}/${year}/${month}/${cid}_${cleanName}`;
    }
    case 'maintenance': {
      const equipment = sanitizeSegment(options.subType, 'general');
      return `maintenance/${branchCode}/${equipment}/${cleanName}`;
    }
    case 'recipes': {
      const sub = sanitizeSegment(options.subType, 'images');
      const rid = sanitizeSegment(options.recipeId, 'recipe');
      const safeExt = ext || (sub === 'videos' ? 'mp4' : 'jpg');
      if (sub === 'step-photos') {
        const step = String(options.stepNumber ?? 1).padStart(2, '0');
        return `recipes/step-photos/${rid}_${step}.${safeExt}`;
      }
      // images | videos
      return `recipes/${sub}/${rid}.${safeExt}`;
    }
    case 'staff': {
      const sub = sanitizeSegment(options.subType, 'certificates');
      const sid = sanitizeSegment(options.staffId, 'STF').toUpperCase();
      return `staff/${sub}/${sid}_${cleanName}`;
    }
    default:
      return `misc/${cleanName}`;
  }
}

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

/**
 * Slugify an arbitrary readable name (e.g. an asset, recipe, or task title)
 * into a filesystem-safe suffix:
 *
 *   - lowercase
 *   - diacritics stripped
 *   - non-alphanumerics collapsed to single hyphens
 *   - leading/trailing hyphens trimmed
 *   - max 60 characters
 *
 * Returns an empty string when the input is empty/blank — callers should
 * fall back to the original filename in that case.
 */
export function cleanReadableName(readableName: string | null | undefined): string {
  if (!readableName) return '';
  return readableName
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
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
 *
 * When `readableName` is provided, it is used as the readable suffix
 * instead of the original file name (the original extension is still
 * preserved). When omitted, behaviour falls back to the previous
 * "clean original filename" suffix.
 */
export function generateStorageFileName(
  originalFileName: string,
  readableName?: string | null,
): string {
  const slug = cleanReadableName(readableName);
  if (!slug) {
    return `${shortUuid()}_${cleanFileName(originalFileName)}`;
  }
  // Preserve the original file extension when present.
  const lastDot = originalFileName.lastIndexOf('.');
  const rawExt = lastDot > 0 ? originalFileName.slice(lastDot + 1) : '';
  const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return cleanExt ? `${shortUuid()}_${slug}.${cleanExt}` : `${shortUuid()}_${slug}`;
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
 *   maintenance/{branchCode}/{category}/
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
      // Asset/equipment name is intentionally NOT part of the folder path —
      // callers should encode it into the filename instead. This keeps the
      // folder tree shallow and grouped by category only.
      return `maintenance/${branchCode}/${slug(options.category, 'general')}`;
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
  readableName?: string | null,
): Promise<AppFilesUploadResult> {
  const folder = buildStoragePath(moduleType, options);
  const storedFileName = generateStorageFileName(file.name, readableName);
  const path = `${folder}/${storedFileName}`;

  // Verification log requested by spec — covers every module's uploads.
  // eslint-disable-next-line no-console
  console.log('[storage.filename]', {
    readableName: readableName ?? null,
    finalFileName: storedFileName,
    fullPath: path,
  });

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