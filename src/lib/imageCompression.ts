// Client-side image compression for checklist photo uploads.
// Targets a max file size (default 500KB) by resizing + iteratively lowering JPEG quality.

export interface CompressOptions {
  maxSizeKB?: number;      // target max size in KB
  maxDimension?: number;   // max width/height in px on longest edge
  mimeType?: string;       // output mime
}

const DEFAULTS: Required<CompressOptions> = {
  maxSizeKB: 500,
  maxDimension: 1600,
  mimeType: 'image/jpeg',
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function drawToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
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
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Compress an image File so its final size is <= maxSizeKB.
 * Returns a JPEG File. Falls back to original file on failure.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxSizeKB, maxDimension, mimeType } = { ...DEFAULTS, ...opts };
  const targetBytes = maxSizeKB * 1024;

  // Skip very small images already under target.
  if (file.size <= targetBytes && file.type.startsWith('image/')) {
    return file;
  }

  try {
    const img = await loadImage(file);

    // Try progressively smaller dimensions + qualities until we fit under target.
    const dimensionSteps = [maxDimension, 1280, 1024, 800, 640];
    const qualitySteps = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

    let bestBlob: Blob | null = null;

    for (const dim of dimensionSteps) {
      const canvas = drawToCanvas(img, dim);
      for (const q of qualitySteps) {
        const blob = await canvasToBlob(canvas, mimeType, q);
        if (!blob) continue;
        bestBlob = blob;
        if (blob.size <= targetBytes) {
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
          return new File([blob], `${baseName}.jpg`, { type: mimeType });
        }
      }
    }

    // Couldn't get under target; return smallest blob produced.
    if (bestBlob) {
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([bestBlob], `${baseName}.jpg`, { type: mimeType });
    }
  } catch (err) {
    console.warn('[compressImage] Falling back to original file:', err);
  }

  return file;
}
