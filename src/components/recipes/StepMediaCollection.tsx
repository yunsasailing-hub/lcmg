import { useTranslation } from 'react-i18next';
import { useMediaCollection } from '@/hooks/useMediaCollection';
import MediaCollectionField from './MediaCollectionField';
import MediaCollectionView from './MediaCollectionView';

interface Props {
  recipeId: string;
  procedureId: string | null | undefined;
  legacyImageUrl?: string | null;
  legacyVideoUrl?: string | null;
  /** Optional legacy web_link — surfaced as a video preview if it parses as one. */
  legacyWebLink?: string | null;
  mode: 'view' | 'edit';
}

/**
 * Per-step media wrapper. We give each step its own collection query so the
 * cache is keyed by procedure_id and items refresh independently.
 */
export default function StepMediaCollection({
  recipeId, procedureId, legacyImageUrl, legacyVideoUrl, legacyWebLink, mode,
}: Props) {
  const { t } = useTranslation();
  const config = {
    table: 'recipe_procedure_media' as const,
    parentColumn: 'procedure_id' as const,
    parentId: procedureId ?? null,
  };
  const { data: items = [] } = useMediaCollection(config);

  if (mode === 'edit') {
    if (!procedureId) {
      return (
        <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          {t('recipes.media.saveFirst', 'Save first to attach media.')}
        </p>
      );
    }
    return (
      <MediaCollectionField
        recipeIdForBucket={recipeId}
        config={config}
        items={items}
      />
    );
  }

  return (
    <MediaCollectionView
      items={items}
      legacyImageUrl={legacyImageUrl}
      legacyVideoUrl={legacyVideoUrl}
      legacyExtraVideoUrls={[legacyWebLink]}
    />
  );
}
