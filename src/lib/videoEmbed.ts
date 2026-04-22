/**
 * Video URL parsing and embed helpers used by recipe-level media and per-step
 * procedure media. URL/reference based — we never upload video files.
 *
 * Source types:
 *  - youtube       (youtube.com / youtu.be / youtube shorts)
 *  - private_cloud (vimeo, drive, dropbox, s3-style links we can't iframe-embed
 *                   reliably — Vimeo is the only one we attempt to embed)
 *  - external_url  (anything else)
 */

export type VideoSource = 'youtube' | 'private_cloud' | 'external_url';

export interface ParsedVideo {
  source: VideoSource;
  /** Original URL (trimmed). Stored as-is in the DB. */
  url: string;
  /** Embeddable iframe URL when we can render an inline preview. */
  embedUrl: string | null;
  /** Best-effort thumbnail (currently YouTube only). */
  thumbnailUrl: string | null;
}

const PRIVATE_HOSTS = [
  'vimeo.com',
  'player.vimeo.com',
  'drive.google.com',
  'dropbox.com',
  'www.dropbox.com',
  'onedrive.live.com',
  '1drv.ms',
];

function safeUrl(raw: string): URL | null {
  try { return new URL(raw.trim()); } catch { return null; }
}

function youTubeId(u: URL): string | null {
  if (u.hostname.includes('youtube.com')) {
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    return u.searchParams.get('v');
  }
  if (u.hostname === 'youtu.be') {
    return u.pathname.slice(1) || null;
  }
  return null;
}

function vimeoId(u: URL): string | null {
  if (!u.hostname.includes('vimeo.com')) return null;
  const seg = u.pathname.split('/').filter(Boolean)[0];
  return seg && /^\d+$/.test(seg) ? seg : null;
}

export function parseVideo(raw: string): ParsedVideo {
  const trimmed = (raw || '').trim();
  const u = safeUrl(trimmed);
  if (!u) {
    return { source: 'external_url', url: trimmed, embedUrl: null, thumbnailUrl: null };
  }

  const yt = youTubeId(u);
  if (yt) {
    return {
      source: 'youtube',
      url: trimmed,
      embedUrl: `https://www.youtube.com/embed/${yt}`,
      thumbnailUrl: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`,
    };
  }

  const vm = vimeoId(u);
  if (vm) {
    return {
      source: 'private_cloud',
      url: trimmed,
      embedUrl: `https://player.vimeo.com/video/${vm}`,
      thumbnailUrl: null,
    };
  }

  if (PRIVATE_HOSTS.some(h => u.hostname.endsWith(h))) {
    return { source: 'private_cloud', url: trimmed, embedUrl: null, thumbnailUrl: null };
  }

  return { source: 'external_url', url: trimmed, embedUrl: null, thumbnailUrl: null };
}

/** Convenience for storage: keep original URL (do not coerce to embed). */
export function normalizeStoredVideoUrl(raw: string): string {
  return (raw || '').trim();
}

export function videoSourceLabel(source: VideoSource): string {
  switch (source) {
    case 'youtube': return 'YouTube';
    case 'private_cloud': return 'Private cloud';
    default: return 'External link';
  }
}