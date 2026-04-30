// Checklist image optimization — low-definition proof photo.
// Spec:
//  - Output: JPEG, max 1024x1024 (aspect preserved)
//  - Quality: 0.60 (single pass — small file size suitable for proof only)
//  - On any failure, the caller falls back to uploading the original file.

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

const MAX_DIM = 1024;
const QUALITY = 0.6;
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
  const pass = drawToCanvas(img, MAX_DIM);
  const blob = await canvasToBlob(pass.canvas, QUALITY);
  if (!blob) {
    throw new ImageTooLargeError('Could not encode photo.');
  }
  return {
    file: toJpegFile(blob, file.name),
    width: pass.width,
    height: pass.height,
    size: blob.size,
  };
}
