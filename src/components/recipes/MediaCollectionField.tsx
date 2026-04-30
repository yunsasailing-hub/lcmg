import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Video as VideoIcon, Trash2, Upload, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import MediaFrame from './MediaFrame';
import VideoPreview from './VideoPreview';
import { getImageFromClipboard } from '@/lib/clipboardImage';
import {
  MEDIA_MAX_PER_KIND,
  useAddMediaImage,
  useAddMediaVideo,
  useDeleteMedia,
  type MediaCollectionRow,
} from '@/hooks/useMediaCollection';
import { parseVideo } from '@/lib/videoEmbed';

interface Props {
  /** Recipe ID — used as storage prefix for uploaded images. */
  recipeIdForBucket: string;
  /** The DB config: which table + which parent column the rows belong to. */
  config: {
    table: 'recipe_procedure_media' | 'recipe_service_media';
    parentColumn: 'procedure_id' | 'recipe_id';
    parentId: string | null | undefined;
  };
  items: MediaCollectionRow[];
  disabled?: boolean;
  /**
   * Readable suffix for stored filenames (e.g. "pizza-margherita-step-03").
   * Optional — falls back to the original filename when omitted.
   */
  readableName?: string | null;
}

/**
 * Shared edit-mode editor for an images[] + videos[] collection.
 * Hard cap of 4 per kind, paste support for images, link input for videos.
 */
export default function MediaCollectionField({
  recipeIdForBucket, config, items, disabled, readableName,
}: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [videoDraft, setVideoDraft] = useState('');

  const addImage = useAddMediaImage(config);
  const addVideo = useAddMediaVideo(config);
  const del = useDeleteMedia(config);

  const images = items.filter(i => i.kind === 'image');
  const videos = items.filter(i => i.kind === 'video');
  const imagesFull = images.length >= MEDIA_MAX_PER_KIND;
  const videosFull = videos.length >= MEDIA_MAX_PER_KIND;

  const noParent = !config.parentId;

  const handlePickFile = async (file: File) => {
    if (imagesFull) {
      toast({ title: t('recipes.media.maxImagesReached'), variant: 'destructive' });
      return;
    }
    try {
      await addImage.mutateAsync({
        recipeIdForBucket,
        file,
        existingCount: images.length,
        readableName: readableName ?? null,
      });
    } catch (e: any) {
      toast({
        title: t('recipes.media.uploadFailed'),
        description: e?.message === 'LIMIT_REACHED' ? t('recipes.media.maxImagesReached') : e?.message,
        variant: 'destructive',
      });
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled || noParent) return;
    const file = getImageFromClipboard(e);
    if (!file) return;
    e.preventDefault();
    toast({ title: t('recipes.media.pasted') });
    await handlePickFile(file);
  };

  const handleAddVideo = async () => {
    const url = videoDraft.trim();
    if (!url) return;
    if (videosFull) {
      toast({ title: t('recipes.media.maxVideosReached'), variant: 'destructive' });
      return;
    }
    // Light validation — accept any URL that parses; videoEmbed will surface
    // the source type and gracefully fall back if non-embeddable.
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      new URL(url);
    } catch {
      toast({ title: t('recipes.media.invalidUrl'), variant: 'destructive' });
      return;
    }
    parseVideo(url); // ensure parser doesn't throw
    try {
      await addVideo.mutateAsync({ url, existingCount: videos.length });
      setVideoDraft('');
    } catch (e: any) {
      toast({
        title: t('recipes.media.addFailed'),
        description: e?.message === 'LIMIT_REACHED' ? t('recipes.media.maxVideosReached') : e?.message,
        variant: 'destructive',
      });
    }
  };

  if (noParent) {
    return (
      <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        {t('recipes.media.saveFirst', 'Save first to attach media.')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* IMAGES */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            {t('recipes.media.imagesLabel', 'Images')} ({images.length}/{MEDIA_MAX_PER_KIND})
          </label>
        </div>
        <div
          className="rounded-md outline-none focus-within:ring-2 focus-within:ring-ring/40"
          tabIndex={0}
          onPaste={handlePaste}
        >
          {images.length > 0 && (
            <div className="mb-2 grid grid-cols-2 gap-2 sm:max-w-[520px]">
              {images.map(img => (
                <div key={img.id} className="relative">
                  <MediaFrame compact>
                    <img src={img.url} alt="" />
                  </MediaFrame>
                  <Button
                    type="button" size="icon" variant="destructive"
                    className="absolute right-1 top-1 h-7 w-7"
                    onClick={() => del.mutate({ id: img.id, storage_path: img.storage_path })}
                    aria-label={t('recipes.media.removeImage')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || imagesFull || addImage.isPending}
            >
              <Upload className="h-4 w-4" />
              {addImage.isPending ? t('recipes.media.uploading') : t('recipes.media.addImage')}
            </Button>
            {imagesFull ? (
              <span className="text-[11px] text-destructive">{t('recipes.media.maxImagesReached')}</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{t('recipes.media.pasteHint')}</span>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) handlePickFile(f);
            }}
          />
        </div>
      </div>

      {/* VIDEOS */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <VideoIcon className="h-3.5 w-3.5" />
            {t('recipes.media.videosLabel', 'Videos')} ({videos.length}/{MEDIA_MAX_PER_KIND})
          </label>
        </div>
        {videos.length > 0 && (
          <div className="mb-2 grid grid-cols-2 gap-2 sm:max-w-[520px]">
            {videos.map(v => (
              <div key={v.id} className="relative">
                <VideoPreview url={v.url} title={v.title} compact />
                <Button
                  type="button" size="icon" variant="destructive"
                  className="absolute right-1 top-1 h-7 w-7"
                  onClick={() => del.mutate({ id: v.id, storage_path: null })}
                  aria-label={t('recipes.media.removeVideo', 'Remove video')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {videosFull ? (
          <span className="text-[11px] text-destructive">{t('recipes.media.maxVideosReached')}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={videoDraft}
              onChange={e => setVideoDraft(e.target.value)}
              placeholder={t('recipes.media.videoUrl') as string}
              disabled={disabled}
              className="max-w-md"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddVideo(); } }}
            />
            <Button
              type="button" size="sm" variant="outline"
              onClick={handleAddVideo}
              disabled={disabled || addVideo.isPending || !videoDraft.trim()}
            >
              <Plus className="h-4 w-4" /> {t('recipes.media.addVideo')}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {t('recipes.media.videoSlotHint', { current: videos.length + 1, max: MEDIA_MAX_PER_KIND, defaultValue: `Video ${videos.length + 1} of ${MEDIA_MAX_PER_KIND}` })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
