

## Checklist Template Excel Import/Export

### Overview
Add Export and Import buttons to the Template Manager so owners/managers can bulk-manage checklist templates via `.xlsx` files.

### What will be built

**1. Install `xlsx` package** (SheetJS) for client-side Excel processing.

**2. Create `src/utils/checklistExcel.ts`**
- `exportTemplatesToXlsx(templates)` — builds a workbook with two sheets:
  - **Templates**: title, type, department, branch name
  - **Tasks**: template title (ref), task title, sort order, photo requirement
  - Triggers browser download
- `parseTemplatesFromXlsx(file): Promise<ParsedTemplate[]>` — reads uploaded file, validates fields (type must be valid enum, photo_requirement must be none/optional/mandatory), returns array of template+tasks objects or throws with validation errors

**3. Update `src/components/checklists/TemplateManager.tsx`**
- Add "Export" button (downloads all templates as .xlsx)
- Add "Import" button (hidden file input, accepts .xlsx)
- On import: parse file → show count confirmation toast → call `useCreateTemplate` for each → refetch
- Error handling: show toast with validation errors if file is malformed

### Technical details
- `xlsx` library works entirely client-side, no backend changes needed
- Export uses data already loaded by `useTemplates()` hook
- Import validates against `Constants.public.Enums.checklist_type` and `Constants.public.Enums.department`
- Photo requirement validated against: `none`, `optional`, `mandatory`

