import { useState } from 'react';
import { FileSpreadsheet, Upload, ShieldCheck } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import RecipeMasterImportDialog from '@/components/recipes/RecipeMasterImportDialog';
import RecipeImportValidatorDialog from '@/components/recipes/RecipeImportValidatorDialog';

export default function RecipesImportExport() {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);
  const [importOpen, setImportOpen] = useState(false);
  const [validatorOpen, setValidatorOpen] = useState(false);

  return (
    <RecipesShell title="Import / Export" description="Bulk import recipe master data from Excel.">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle>Recipe Master — Bulk Import</CardTitle>
            </div>
            <CardDescription>
              Upload an .xlsx file with sheet <code className="rounded bg-muted px-1">RECIPES_MASTER_IMPORT</code>.
              Imports recipe master records only. Ingredient lines and procedures are not included in this step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setImportOpen(true)} disabled={!canManage}>
              <Upload className="h-4 w-4" /> Open import
            </Button>
            {!canManage && (
              <p className="mt-2 text-xs text-muted-foreground">Owners and managers only.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Recipe Import — Step 1 Validation</CardTitle>
            </div>
            <CardDescription>
              Validate an .xlsx workbook structure before importing: required sheets, columns,
              and the APPROVED_UNITS list. No database changes are performed in this step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setValidatorOpen(true)} disabled={!canManage} variant="outline">
              <ShieldCheck className="h-4 w-4" /> Open validator
            </Button>
            {!canManage && (
              <p className="mt-2 text-xs text-muted-foreground">Owners and managers only.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <RecipeMasterImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <RecipeImportValidatorDialog open={validatorOpen} onOpenChange={setValidatorOpen} />
    </RecipesShell>
  );
}