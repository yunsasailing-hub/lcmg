import { useState } from 'react';
import { ExternalLink, Video as VideoIcon, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { parseVideo, videoSourceLabel } from '@/lib/videoEmbed';

interface Props {
  url: string;
  title?: string | null;
  /** Optional short note shown below the title. */
  note?: string | null;
  /** Compact mode for per-step usage (smaller preview, denser layout). */
  compact?: boolean;
  /** Optional thumbnail override. */
  thumbnailUrl?: string | null;
  className?: string;
}

/**
 * Renders a video reference safely:
 *  - If embeddable and the iframe loads, show inline preview.
 *  - If not embeddable, OR the iframe fails, show title + Open button.
 *  - Never throws — invalid URLs degrade to a plain external link row.
 */
export default function VideoPreview({
  url, title, note, compact = false, thumbnailUrl, className,
}: Props) {
  const parsed = parseVideo(url);
  const [embedFailed, setEmbedFailed] = useState(false);
  const canEmbed = !!parsed.embedUrl && !embedFailed;
  const thumb = thumbnailUrl ?? parsed.thumbnailUrl;
  const display = (title?.trim() || parsed.url || 'Video').toString();

  return (
    <div className={`space-y-2 rounded-md border bg-card p-2 ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <VideoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{display}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {videoSourceLabel(parsed.source)}
              </Badge>
              {!parsed.embedUrl && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" /> No inline preview
                </Badge>
              )}
            </div>
            {note && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{note}</p>
            )}
          </div>
        </div>
        {parsed.url && (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={parsed.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </Button>
        )}
      </div>

      {canEmbed ? (
        <div className={`w-full overflow-hidden rounded-md bg-muted ${compact ? 'aspect-video max-w-md' : 'aspect-video'}`}>
          <iframe
            src={parsed.embedUrl!}
            title={display}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onError={() => setEmbedFailed(true)}
          />
        </div>
      ) : thumb ? (
        <a
          href={parsed.url}
          target="_blank"
          rel="noreferrer"
          className={`block overflow-hidden rounded-md border bg-muted ${compact ? 'max-w-xs' : 'max-w-md'}`}
        >
          <img src={thumb} alt={display} className="aspect-video w-full object-cover" />
        </a>
      ) : null}
    </div>
  );
}