-- Deactivate duplicate / overlapping units
UPDATE public.recipe_units
SET is_active = false, updated_at = now()
WHERE code IN ('liter_lit', 'package_bao', 'package_bich');

-- Set logical sort order for the kept approved units
UPDATE public.recipe_units SET sort_order = 10 WHERE code = 'kg_std';
UPDATE public.recipe_units SET sort_order = 20 WHERE code = 'gram';
UPDATE public.recipe_units SET sort_order = 30 WHERE code = 'lit';
UPDATE public.recipe_units SET sort_order = 40 WHERE code = 'bottle_chai';
UPDATE public.recipe_units SET sort_order = 50 WHERE code = 'jar_lo';
UPDATE public.recipe_units SET sort_order = 60 WHERE code = 'box_hop';
UPDATE public.recipe_units SET sort_order = 70 WHERE code = 'can_lon';
UPDATE public.recipe_units SET sort_order = 80 WHERE code = 'pack_goi';
UPDATE public.recipe_units SET sort_order = 90 WHERE code = 'pcs_cai';
UPDATE public.recipe_units SET sort_order = 100 WHERE code = 'pcs_qua';
UPDATE public.recipe_units SET sort_order = 110 WHERE code = 'tree_cay';