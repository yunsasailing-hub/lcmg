UPDATE public.recipe_categories
SET is_active = false, updated_at = now()
WHERE is_active = true
  AND name_en NOT IN (
    'Pizza','Pasta','Salad','Main Course','Appetizer','Dessert','Panini',
    'Breakfast','Cocktail','Mocktail','Coffee','Gelato','Dough','Sauce','Prep Item','Other'
  );