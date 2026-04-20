import { Routes, Route } from 'react-router-dom';
import RecipesDashboard from './recipes/RecipesDashboard';
import RecipesIngredients from './recipes/RecipesIngredients';
import IngredientDetail from './recipes/IngredientDetail';
import RecipesPlaceholder from './recipes/RecipesPlaceholder';
import RecipesSettings from './recipes/RecipesSettings';

export default function Recipes() {
  return (
    <Routes>
      <Route index element={<RecipesDashboard />} />
      <Route path="ingredients" element={<RecipesIngredients />} />
      <Route path="ingredients/:id" element={<IngredientDetail />} />
      <Route path="list" element={<RecipesPlaceholder titleKey="recipes" />} />
      <Route path="categories" element={<RecipesPlaceholder titleKey="categories" />} />
      <Route path="units" element={<RecipesPlaceholder titleKey="units" />} />
      <Route path="import-export" element={<RecipesPlaceholder titleKey="importExport" />} />
      <Route path="settings" element={<RecipesPlaceholder titleKey="settings" />} />
    </Routes>
  );
}
