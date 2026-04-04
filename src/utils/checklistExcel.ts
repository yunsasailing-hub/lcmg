import * as XLSX from 'xlsx';
import { Constants } from '@/integrations/supabase/types';
import type { ChecklistType, Department, PhotoRequirement } from '@/hooks/useChecklists';

export interface ParsedTemplate {
  title: string;
  checklist_type: ChecklistType;
  department: Department;
  tasks: { title: string; sort_order: number; photo_requirement: PhotoRequirement }[];
}

const validTypes = Constants.public.Enums.checklist_type as readonly string[];
const validDepts = Constants.public.Enums.department as readonly string[];
const validPhoto = Constants.public.Enums.photo_requirement as readonly string[];

export function exportTemplatesToXlsx(templates: any[]) {
  const templatesData = templates.map(t => ({
    Title: t.title,
    Type: t.checklist_type,
    Department: t.department,
    Active: t.is_active ? 'Yes' : 'No',
  }));

  const tasksData: any[] = [];
  templates.forEach(t => {
    ((t as any).tasks || []).forEach((task: any) => {
      tasksData.push({
        'Template Title': t.title,
        'Task Title': task.title,
        'Sort Order': task.sort_order,
        'Photo Requirement': task.photo_requirement,
      });
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(templatesData), 'Templates');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasksData.length ? tasksData : [{}]), 'Tasks');
  XLSX.writeFile(wb, `checklist-templates-${new Date().toISOString().split('T')[0]}.xlsx`);
}

export async function parseTemplatesFromXlsx(file: File): Promise<ParsedTemplate[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const templatesSheet = wb.Sheets['Templates'];
  const tasksSheet = wb.Sheets['Tasks'];
  if (!templatesSheet) throw new Error('Missing "Templates" sheet');

  const rawTemplates: any[] = XLSX.utils.sheet_to_json(templatesSheet);
  const rawTasks: any[] = tasksSheet ? XLSX.utils.sheet_to_json(tasksSheet) : [];

  if (!rawTemplates.length) throw new Error('No templates found in file');

  const errors: string[] = [];
  const parsed: ParsedTemplate[] = [];

  rawTemplates.forEach((row, i) => {
    const rowNum = i + 2;
    if (!row.Title?.toString().trim()) { errors.push(`Row ${rowNum}: missing Title`); return; }
    const type = row.Type?.toString().toLowerCase().trim();
    if (!validTypes.includes(type)) { errors.push(`Row ${rowNum}: invalid Type "${row.Type}"`); return; }
    const dept = row.Department?.toString().toLowerCase().trim();
    if (!validDepts.includes(dept)) { errors.push(`Row ${rowNum}: invalid Department "${row.Department}"`); return; }

    const templateTasks = rawTasks
      .filter(t => t['Template Title']?.toString().trim() === row.Title.toString().trim())
      .map((t, idx) => {
        const photo = (t['Photo Requirement'] || 'none').toString().toLowerCase().trim();
        if (!validPhoto.includes(photo)) {
          errors.push(`Tasks row: invalid Photo Requirement "${t['Photo Requirement']}" for task "${t['Task Title']}"`);
        }
        return {
          title: t['Task Title']?.toString().trim() || `Task ${idx + 1}`,
          sort_order: Number(t['Sort Order']) || idx,
          photo_requirement: (validPhoto.includes(photo) ? photo : 'none') as PhotoRequirement,
        };
      });

    parsed.push({
      title: row.Title.toString().trim(),
      checklist_type: type as ChecklistType,
      department: dept as Department,
      tasks: templateTasks.length ? templateTasks : [{ title: 'Default task', sort_order: 0, photo_requirement: 'none' as PhotoRequirement }],
    });
  });

  if (errors.length) throw new Error(errors.join('\n'));
  return parsed;
}
