// Derived classification from the first 2 digits of the ingredient `code` (visible ID).
// 10 → Food, 20 → Drinks, otherwise → Unclassified.
// Pure utility — no DB column. Used for filtering and display only.

export type IngredientPrefixClass = 'food' | 'drinks' | 'unclassified';

export function classifyByPrefix(code?: string | null): IngredientPrefixClass {
  const trimmed = (code ?? '').trim();
  if (trimmed.startsWith('10')) return 'food';
  if (trimmed.startsWith('20')) return 'drinks';
  return 'unclassified';
}

export const PREFIX_CLASS_LABEL: Record<IngredientPrefixClass, string> = {
  food: 'Food',
  drinks: 'Drinks',
  unclassified: 'Unclassified',
};
