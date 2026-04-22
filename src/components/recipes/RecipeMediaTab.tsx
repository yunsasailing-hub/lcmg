import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image as ImageIcon, Video, Link as LinkIcon, FileText, Upload, Trash2, Star, ExternalLink, Plus, Pencil, Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useRecipeMedia, useAddRecipeMedia, useDeleteRecipeMedia, useUpdateRecipeMedia,
  uploadRecipeMediaFile, type RecipeMediaRow,
} from '@/hooks/useRecipeMedia';
import { toast } from '@/hooks/use-toast';
import VideoPreview from './VideoPreview';
import { normalizeStoredVideoUrl } from '@/lib/videoEmbed';

interface Props {
  recipeId: string;
  canManage: boolean;
}

const isValidUrl = (s: string) => {
  try { new URL(s); return true; } catch { return false; }
};

export default function RecipeMediaTab({ recipeId, canManage }: Props) {
  const { t } = useTranslation();
  const { data: media = [], isLoading } = useRecipeMedia(recipeId);
  const add = useAddRecipeMedia();
  const update = useUpdateRecipeMedia();
  const del = useDeleteRecipeMedia();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webTitle, setWebTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<RecipeMediaRow | null>(null);
  const [editing, setEditing] = useState(false);

  const images = media.filter(m => m.media_type === 'image');
  const primary = images.find(m => m.is_primary) ?? images[0];
  const additional = images.filter(m => m.id !== primary?.id);
  const videos = media.filter(m => m.media_type === 'video_link');
  const webs = media.filter(m => m.media_type === 'web_link');
  const files = media.filter(m => m.media_type === 'file');

  useEffect(() => {
    // Debug: confirm videos refetch after save
    // eslint-disable-next-line no-console
    console.log('[RecipeMedia] videos count:', videos.length, videos.map(v => v.url));
  }, [videos.length]);

  const getYouTubeEmbed = (url: string): string | null => {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com')) {
        // Already an embed URL
        if (u.pathname.startsWith('/embed/')) {
          const id = u.pathname.split('/')[2];
          if (id) return `https://www.youtube.com/embed/${id}`;
        }
        // Shorts: /shorts/{id}
        if (u.pathname.startsWith('/shorts/')) {
          const id = u.pathname.split('/')[2];
          if (id) return `https://www.youtube.com/embed/${id}`;
        }
        // Standard watch URL
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.slice(1);
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (u.hostname.includes('vimeo.com')) {
        const id = u.pathname.split('/').filter(Boolean)[0];
        if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
      }
    } catch {}
    return null;
  };

  // In consultation (read) mode we hide editing chrome; managers click Edit to add/remove.
  const isReadMode = !editing;
  const totalMedia = media.length;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { path, publicUrl } = await uploadRecipeMediaFile(recipeId, file);
      await add.mutateAsync({
        recipe_id: recipeId,
        media_type: 'image',
        url: publicUrl,
        storage_path: path,
        title: file.name,
        is_primary: images.length === 0,
        sort_order: images.length,
      });
      toast({ title: t('recipes.media.uploaded') });
    } catch (err: any) {
      toast({ title: t('recipes.media.uploadFailed'), description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { path, publicUrl } = await uploadRecipeMediaFile(recipeId, file);
      await add.mutateAsync({
        recipe_id: recipeId,
        media_type: 'file',
        url: publicUrl,
        storage_path: path,
        title: file.name,
        sort_order: files.length,
      });
      toast({ title: t('recipes.media.uploaded') });
    } catch (err: any) {
      toast({ title: t('recipes.media.uploadFailed'), description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const addLink = async (type: 'video_link' | 'web_link', url: string, title: string) => {
    if (!isValidUrl(url)) {
      toast({ title: t('recipes.media.invalidUrl'), variant: 'destructive' });
      return;
    }
    try {
      const finalUrl = type === 'video_link' ? normalizeStoredVideoUrl(url) : url.trim();
      await add.mutateAsync({
        recipe_id: recipeId,
        media_type: type,
        url: finalUrl,
        title: title.trim() || null,
        sort_order: type === 'video_link' ? videos.length : webs.length,
      });
      toast({ title: t('recipes.media.added') });
      if (type === 'video_link') { setVideoUrl(''); setVideoTitle(''); }
      else { setWebUrl(''); setWebTitle(''); }
    } catch (err: any) {
      toast({ title: t('recipes.media.addFailed'), description: err?.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (m: RecipeMediaRow) => {
    try {
      await del.mutateAsync({ id: m.id, recipe_id: recipeId, storage_path: m.storage_path });
      toast({ title: t('recipes.media.removed') });
    } catch (err: any) {
      toast({ title: t('recipes.media.removeFailed'), description: err?.message, variant: 'destructive' });
    } finally {
      setConfirmDelete(null);
    }
  };

  const setPrimary = async (m: RecipeMediaRow) => {
    try {
      await update.mutateAsync({ id: m.id, recipe_id: recipeId, patch: { is_primary: true } });
    } catch (err: any) {
      toast({ title: err?.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-xl font-semibold">{t('recipes.media.title')}</h3>
            {editing && (
              <p className="mt-1 text-xs text-muted-foreground">{t('recipes.media.hint')}</p>
            )}
          </div>
          {canManage && (
            <Button
              size="sm"
              variant={editing ? 'default' : 'outline'}
              onClick={() => setEditing(v => !v)}
            >
              {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editing ? t('common.done') : t('common.edit')}
            </Button>
          )}
        </div>

        {/* Compact empty state when nothing exists and we're not editing */}
        {!isLoading && isReadMode && totalMedia === 0 && (
          <p className="text-sm text-muted-foreground">{t('recipes.media.empty')}</p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (isReadMode && totalMedia === 0) ? null : (
          <>
            {/* Main image */}
            {(editing || primary) && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('recipes.media.mainImage')}
              </h4>
              <div className="flex flex-wrap items-start gap-4">
                <div className={`aspect-square overflow-hidden rounded-md border bg-muted ${primary ? 'w-56 sm:w-64' : 'w-40'}`}>
                  {primary ? (
                    <img src={primary.url} alt={primary.title ?? 'Main'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                {canManage && editing && (
                  <div className="space-y-2">
                    <input
                      ref={imageInputRef}
                      type="file" accept="image/*" hidden
                      onChange={handleImageUpload}
                    />
                    <Button size="sm" variant="outline" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                      <Upload className="h-4 w-4" /> {uploading ? t('recipes.media.uploading') : t('recipes.media.uploadImage')}
                    </Button>
                  </div>
                )}
              </div>
            </section>
            )}

            {/* Additional images */}
            {additional.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('recipes.media.additionalImages')}
                </h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {additional.map(m => (
                    <div key={m.id} className="group relative overflow-hidden rounded-md border bg-muted">
                      <img src={m.url} alt={m.title ?? ''} className="aspect-square w-full object-cover" />
                      {canManage && editing && (
                        <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-background/80 p-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPrimary(m)} title={t('recipes.media.makePrimary') as string}>
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmDelete(m)} title={t('recipes.media.delete') as string}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Video links */}
            {(editing || videos.length > 0) && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('recipes.media.videoLinks')}
              </h4>
              <ul className="space-y-3">
                {videos.map(m => (
                  <li key={m.id} className="relative">
                    <VideoPreview url={m.url} title={m.title} />
                    {canManage && editing && (
                      <Button
                        size="icon" variant="ghost"
                        className="absolute right-1 top-1"
                        onClick={() => setConfirmDelete(m)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                ))}
                {videos.length === 0 && editing && <p className="text-xs text-muted-foreground">{t('recipes.media.empty')}</p>}
              </ul>
              {canManage && editing && (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input placeholder={t('recipes.media.videoUrl') as string} value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
                  <Input placeholder={t('recipes.media.titlePlaceholder') as string} value={videoTitle} onChange={e => setVideoTitle(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => addLink('video_link', videoUrl, videoTitle)} disabled={!videoUrl.trim()}>
                    <Plus className="h-4 w-4" /> {t('recipes.media.addVideo')}
                  </Button>
                </div>
              )}
            </section>
            )}

            {/* Web links */}
            {(editing || webs.length > 0) && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('recipes.media.webLinks')}
              </h4>
              <ul className="space-y-2">
                {webs.map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <a href={m.url} target="_blank" rel="noreferrer" className="truncate text-sm hover:underline">
                        {m.title || m.url}
                      </a>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" asChild><a href={m.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                      {canManage && editing && (
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(m)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {webs.length === 0 && editing && <p className="text-xs text-muted-foreground">{t('recipes.media.empty')}</p>}
              </ul>
              {canManage && editing && (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input placeholder={t('recipes.media.webUrl') as string} value={webUrl} onChange={e => setWebUrl(e.target.value)} />
                  <Input placeholder={t('recipes.media.titlePlaceholder') as string} value={webTitle} onChange={e => setWebTitle(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => addLink('web_link', webUrl, webTitle)} disabled={!webUrl.trim()}>
                    <Plus className="h-4 w-4" /> {t('recipes.media.addLink')}
                  </Button>
                </div>
              )}
            </section>
            )}

            {/* Files */}
            {(editing || files.length > 0) && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('recipes.media.files')}
              </h4>
              <ul className="space-y-2">
                {files.map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <a href={m.url} target="_blank" rel="noreferrer" className="truncate text-sm hover:underline">
                        {m.title || m.url}
                      </a>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" asChild><a href={m.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                      {canManage && editing && (
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(m)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {files.length === 0 && editing && <p className="text-xs text-muted-foreground">{t('recipes.media.empty')}</p>}
              </ul>
              {canManage && editing && (
                <>
                  <input ref={fileInputRef} type="file" hidden onChange={handleFileUpload} />
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4" /> {uploading ? t('recipes.media.uploading') : t('recipes.media.uploadFile')}
                  </Button>
                </>
              )}
            </section>
            )}
          </>
        )}

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('recipes.media.deleteConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDelete?.title || confirmDelete?.url}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmDelete && handleDelete(confirmDelete)}>
                {t('recipes.media.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
