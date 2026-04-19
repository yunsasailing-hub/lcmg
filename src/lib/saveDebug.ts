// Tiny pub/sub for the photo upload debug pipeline.
// Logs each step to console AND notifies subscribers (UI debug panel).

export type SaveDebugStep =
  // Capture
  | { step: 'captureStarted' }
  | { step: 'fileReceived'; name: string; mime: string; size: number }
  // Optimization
  | { step: 'optimizationStarted' }
  | { step: 'optimizationSuccess'; width: number; height: number; size: number; mime: string }
  | { step: 'optimizationFailed'; error: string }
  // Upload
  | { step: 'uploadStarted'; instanceId: string; taskId: string; userId: string }
  | { step: 'uploadSuccess'; url: string }
  | { step: 'uploadFailed'; error: string }
  // Local save
  | { step: 'localSaveStarted'; target: string; filename: string; method: string }
  | { step: 'localSaveSuccess'; method: string; uri?: string }
  | { step: 'localSaveFailed'; method: string; error: string }
  // Media scan
  | { step: 'mediaScanRequested'; note?: string }
  | { step: 'mediaScanSuccess' }
  | { step: 'mediaScanFailed'; error: string }
  // Final
  | { step: 'final'; outcome: 'uploaded+saved' | 'uploaded+saveFailed' | 'uploadFailed' | 'processingFailed' };

export interface SaveDebugEntry {
  at: number;
  data: SaveDebugStep;
}

type Listener = (entry: SaveDebugEntry) => void;
const listeners = new Set<Listener>();

export function subscribeSaveDebug(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function logSaveStep(data: SaveDebugStep): void {
  const entry: SaveDebugEntry = { at: Date.now(), data };
  // Console — easy to grep with "[checklist-save]"
  // eslint-disable-next-line no-console
  console.log('[checklist-save]', data.step, data);
  listeners.forEach((l) => {
    try { l(entry); } catch { /* ignore */ }
  });
}

export function clearSaveDebug(): void {
  // No-op — the panel manages its own buffer; kept for future use.
}
