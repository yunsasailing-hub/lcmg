import { Routes, Route } from 'react-router-dom';
import RecipesDashboard from './recipes/RecipesDashboard';
import RecipesIngredients from './recipes/RecipesIngredients';
import IngredientDetail from './recipes/IngredientDetail';
import RecipesList from './recipes/RecipesList';
import RecipeDetail from './recipes/RecipeDetail';
import RecipesPlaceholder from './recipes/RecipesPlaceholder';
import RecipesSettings from './recipes/RecipesSettings';
import RecipesImportExport from './recipes/RecipesImportExport';

export default function Recipes() {
  return (
    <Routes>
      <Route index element={<RecipesDashboard />} />
      <Route path="ingredients" element={<RecipesIngredients />} />
      <Route path="ingredients/:id" element={<IngredientDetail />} />
      <Route path="list" element={<RecipesList />} />
      <Route path="list/:id" element={<RecipeDetail />} />
      <Route path="categories" element={<RecipesPlaceholder titleKey="categories" />} />
      <Route path="units" element={<RecipesPlaceholder titleKey="units" />} />
      <Route path="import-export" element={<RecipesImportExport />} />
      <Route path="settings" element={<RecipesSettings />} />
    </Routes>
  );
}
