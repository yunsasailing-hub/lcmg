// Automatic checklist image optimization.
// Spec:
//  - Output: JPEG, max 1280x1280 (aspect preserved)
//  - Quality ladder: 0.75 → 0.70 → 0.65 → 0.60 (target ≤ 300 KB)
//  - If still > 500 KB hard max: retry at 1024x1024 @ 0.60
//  - If still > 500 KB: throw ImageTooLargeError → caller blocks upload

export class ImageTooLargeError extends Error {
  constructor(message = 'Image is too large. Please retake the photo.') {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

export interface OptimizedImage {
  file: File;
  width: number;
  height: number;
  size: number; // bytes
}

const TARGET_BYTES = 300 * 1024;
const HARD_MAX_BYTES = 500 * 1024;
const PRIMARY_DIM = 1280;
const FALLBACK_DIM = 1024;
const QUALITY_LADDER = [0.75, 0.7, 0.65, 0.6];
const MIME = 'image/jpeg';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, MIME, quality));
}

function drawToCanvas(img: HTMLImageElement, maxDim: number): { canvas: HTMLCanvasElement; width: number; height: number } {
  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // White background in case source has alpha (JPEG has no alpha).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, width, height };
}

function toJpegFile(blob: Blob, originalName: string): File {
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: MIME });
}

/**
 * Optimize a checklist photo per spec. Always returns a JPEG.
 * Throws ImageTooLargeError if the image cannot be brought under the hard 500 KB cap.
 */
export async function optimizeChecklistImage(file: File): Promise<OptimizedImage> {
  const img = await loadImage(file);

  // Pass 1: 1280px, walk the quality ladder. Accept first result ≤ 300 KB.
  const pass1 = drawToCanvas(img, PRIMARY_DIM);
  let lastBlob: Blob | null = null;
  let lastDims = { width: pass1.width, height: pass1.height };

  for (const q of QUALITY_LADDER) {
    const blob = await canvasToBlob(pass1.canvas, q);
    if (!blob) continue;
    lastBlob = blob;
    if (blob.size <= TARGET_BYTES) {
      return { file: toJpegFile(blob, file.name), width: pass1.width, height: pass1.height, size: blob.size };
    }
  }

  // Pass 1 done. If best result is within hard max, accept it.
  if (lastBlob && lastBlob.size <= HARD_MAX_BYTES) {
    return { file: toJpegFile(lastBlob, file.name), width: lastDims.width, height: lastDims.height, size: lastBlob.size };
  }

  // Pass 2: 1024px @ 0.60.
  const pass2 = drawToCanvas(img, FALLBACK_DIM);
  const blob2 = await canvasToBlob(pass2.canvas, 0.6);
  if (blob2 && blob2.size <= HARD_MAX_BYTES) {
    return { file: toJpegFile(blob2, file.name), width: pass2.width, height: pass2.height, size: blob2.size };
  }

  throw new ImageTooLargeError();
}
