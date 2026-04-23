import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import EmptyState from '@/components/shared/EmptyState';

interface Props {
  titleKey: 'recipes' | 'categories' | 'units' | 'importExport' | 'settings' | 'moreModules';
}

export default function RecipesPlaceholder({ titleKey }: Props) {
  const { t } = useTranslation();
  return (
    <RecipesShell title={t(`recipes.nav.${titleKey}`)}>
      <EmptyState
        icon={Construction}
        title={t('recipes.placeholder.title')}
        description={t('recipes.placeholder.desc')}
      />
    </RecipesShell>
  );
}
