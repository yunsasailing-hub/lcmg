import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useRecipeMedia,
  useAddRecipeMedia,
  useDeleteRecipeMedia,
  uploadRecipeMediaFile,
  type RecipeMediaRow,
} from '@/hooks/useRecipeMedia';
import { toast } from '@/hooks/use-toast';
import MediaFrame from './MediaFrame';

interface Props {
  recipeId: string | undefined;
  canManage: boolean;
}

/**
 * Inline "Main image" field used inside the Master Information section.
 * Reuses recipe_media (primary image record) so existing image data is
 * preserved automatically — no schema change required.
 *
 * When recipeId is undefined (creating a new recipe), the field is shown
 * as disabled; the user can add the main image after the recipe is saved.
 */
export default function RecipeMainImageField({ recipeId, canManage }: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: media = [] } = useRecipeMedia(recipeId);
  const add = useAddRecipeMedia();
  const del = useDeleteRecipeMedia();

  const images = media.filter((m: RecipeMediaRow) => m.media_type === 'image');
  const primary = images.find((m) => m.is_primary) ?? images[0];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !recipeId) return;
    try {
      const { path, publicUrl } = await uploadRecipeMediaFile(recipeId, file);
      await add.mutateAsync({
        recipe_id: recipeId,
        media_type: 'image',
        url: publicUrl,
        storage_path: path,
        title: file.name,
        is_primary: true,
        sort_order: 0,
      });
      toast({ title: t('recipes.media.uploaded') });
    } catch (err: any) {
      toast({ title: t('recipes.media.uploadFailed'), description: err?.message, variant: 'destructive' });
    }
  };

  const handleRemove = async () => {
    if (!primary || !recipeId) return;
    try {
      await del.mutateAsync({
        id: primary.id,
        recipe_id: recipeId,
        storage_path: primary.storage_path,
      });
      toast({ title: t('recipes.media.removed') });
    } catch (err: any) {
      toast({ title: t('recipes.media.removeFailed'), description: err?.message, variant: 'destructive' });
    }
  };

  const disabled = !recipeId;

  return (
    <div className="sm:col-span-2 space-y-2">
      <div className="text-sm font-medium text-foreground">{t('recipes.media.mainImage')}</div>
      <div className="flex flex-wrap items-start gap-3">
        <MediaFrame compact>
          {primary ? (
            <img src={primary.url} alt={primary.title ?? 'Main'} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </MediaFrame>
        {canManage && (
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || add.isPending}
            >
              <Upload className="h-4 w-4" />
              {primary ? t('recipes.media.replaceImage') : t('recipes.media.uploadImage')}
            </Button>
            {primary && (
              <Button
                type="button" size="sm" variant="ghost"
                onClick={handleRemove}
                disabled={del.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                {t('recipes.media.removeImage')}
              </Button>
            )}
            {disabled && (
              <p className="text-xs text-muted-foreground">
                {t('recipes.list.errors.saveFirstHint', 'Save the recipe first to add an image.')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
