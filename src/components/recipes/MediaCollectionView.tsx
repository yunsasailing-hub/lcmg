import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import MediaFrame from './MediaFrame';
import VideoPreview from './VideoPreview';
import { parseVideo } from '@/lib/videoEmbed';
import type { MediaCollectionRow } from '@/hooks/useMediaCollection';

interface Props {
  items: MediaCollectionRow[];
  /** Optional legacy single fields auto-mapped as the first item if no rows exist. */
  legacyImageUrl?: string | null;
  legacyVideoUrl?: string | null;
  /**
   * Additional legacy URL candidates that may contain a video link
   * (e.g. recipes still using the `web_link` field for Google Drive videos).
   * Each one is rendered as a video preview only when it parses as a video
   * source AND no collection videos / explicit legacyVideoUrl exist.
   */
  legacyExtraVideoUrls?: (string | null | undefined)[];
  emptyHidden?: boolean;
}

/**
 * Read-only gallery view for a step / service-info media collection.
 * Renders ALL images in a 2x2 grid (up to 4) and ALL videos in stacked
 * MediaFrame previews — fixing the prior "first item only" bug.
 */
export default function MediaCollectionView({
  items, legacyImageUrl, legacyVideoUrl, legacyExtraVideoUrls, emptyHidden,
}: Props) {
  const { t } = useTranslation();
  const images = items.filter(i => i.kind === 'image');
  const videos = items.filter(i => i.kind === 'video');

  // Backward compatibility: if no collection rows exist but legacy single
  // fields are set, surface them so existing recipes keep working.
  const showLegacyImage = images.length === 0 && !!legacyImageUrl;
  const showLegacyVideo = videos.length === 0 && !!legacyVideoUrl?.trim();

  // Extra legacy URLs that actually parse as video sources (YouTube / Drive / etc.)
  const extraLegacyVideoUrls = (legacyExtraVideoUrls ?? [])
    .map(u => (u ?? '').trim())
    .filter(Boolean)
    .filter(u => {
      const p = parseVideo(u);
      return p.source === 'youtube' || p.source === 'google_drive' || p.source === 'private_cloud';
    });

  const showExtraLegacyVideos = videos.length === 0 && !showLegacyVideo && extraLegacyVideoUrls.length > 0;

  if (!images.length && !videos.length && !showLegacyImage && !showLegacyVideo && !showExtraLegacyVideos) {
    return emptyHidden ? null : null;
  }

  return (
    <div className="space-y-3">
      {(images.length > 0 || showLegacyImage) && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            {t('recipes.media.imagesLabel', 'Images')}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:max-w-[520px]">
            {showLegacyImage ? (
              <MediaFrame compact>
                <img src={legacyImageUrl!} alt="" />
              </MediaFrame>
            ) : (
              images.map(img => (
                <MediaFrame key={img.id} compact>
                  <img src={img.url} alt={img.title ?? ''} />
                </MediaFrame>
              ))
            )}
          </div>
        </div>
      )}

      {(videos.length > 0 || showLegacyVideo || showExtraLegacyVideos) && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <VideoIcon className="h-3.5 w-3.5" />
            {t('recipes.media.videosLabel', 'Videos')}
          </div>
          <div className="space-y-2">
            {showLegacyVideo ? (
              <VideoPreview url={legacyVideoUrl!} compact />
            ) : showExtraLegacyVideos ? (
              extraLegacyVideoUrls.map((u, i) => (
                <VideoPreview key={`legacy-extra-${i}`} url={u} compact />
              ))
            ) : (
              videos.map(v => (
                <VideoPreview key={v.id} url={v.url} title={v.title} compact />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
