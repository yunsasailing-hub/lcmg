import { Routes, Route, Navigate } from 'react-router-dom';
import RecipesDashboard from './recipes/RecipesDashboard';
import RecipesIngredients from './recipes/RecipesIngredients';
import IngredientDetail from './recipes/IngredientDetail';
import RecipesList from './recipes/RecipesList';
import RecipeDetail from './recipes/RecipeDetail';
import RecipesPlaceholder from './recipes/RecipesPlaceholder';
import RecipesSettings from './recipes/RecipesSettings';

export default function Recipes() {
  return (
    <Routes>
      <Route index element={<RecipesDashboard />} />
      <Route path="ingredients" element={<RecipesIngredients />} />
      <Route path="ingredients/:id" element={<IngredientDetail />} />
      <Route path="list" element={<Navigate to="/recipes/food" replace />} />
      <Route path="list/:id" element={<RecipeDetail />} />
      <Route path="food" element={<RecipesList kind="food" />} />
      <Route path="drinks" element={<RecipesList kind="drink" />} />
      <Route path="more" element={<RecipesPlaceholder titleKey="moreModules" />} />
      <Route path="settings" element={<RecipesSettings />} />
    </Routes>
  );
}
