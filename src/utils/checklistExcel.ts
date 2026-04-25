import * as XLSX from 'xlsx';
import { Constants } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
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

export async function exportTemplatesToXlsx(templates: any[]) {
  // Safety: ensure we have a valid session before doing any privileged reads.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    throw new Error('Your session expired. Please sign in again.');
  }

  // Fetch lookups for branches + users so we can show names instead of UUIDs.
  const [branchesRes, profilesRes] = await Promise.all([
    supabase.from('branches').select('id, name'),
    supabase.from('profiles').select('user_id, full_name, email'),
  ]);
  const branchMap = new Map<string, string>();
  (branchesRes.data || []).forEach((b: any) => branchMap.set(b.id, b.name));
  const userMap = new Map<string, string>();
  (profilesRes.data || []).forEach((p: any) =>
    userMap.set(p.user_id, p.full_name || p.email || p.user_id),
  );

  const lookupUsers = (ids: any) =>
    Array.isArray(ids) && ids.length
      ? ids.map((id: string) => userMap.get(id) || id).join(', ')
      : '';

  type Row = Record<string, any>;
  const rows: Row[] = [];

  // Sort templates: Branch → Department → Template Code → Task No.
  // Rows missing Branch / Department / Code go to the bottom.
  const sorted = [...templates].sort((a, b) => {
    const ab = branchMap.get(a.branch_id) || '';
    const bb = branchMap.get(b.branch_id) || '';
    if (!ab && bb) return 1;
    if (ab && !bb) return -1;
    if (ab !== bb) return ab.localeCompare(bb);
    const ad = a.department || '';
    const bd = b.department || '';
    if (!ad && bd) return 1;
    if (ad && !bd) return -1;
    if (ad !== bd) return ad.localeCompare(bd);
    const ac = a.code || '';
    const bc = b.code || '';
    if (!ac && bc) return 1;
    if (ac && !bc) return -1;
    if (ac !== bc) return ac.localeCompare(bc);
    return (a.title || '').localeCompare(b.title || '');
  });

  sorted.forEach((t: any) => {
    const branchName = t.branch_id ? branchMap.get(t.branch_id) || '' : '';
    const assignedStaff = t.default_assigned_to ? userMap.get(t.default_assigned_to) || '' : '';
    const warningRecipients = lookupUsers(t.warning_recipient_user_ids);

    const tasks = ((t.tasks as any[]) || []).slice().sort(
      (x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0),
    );

    // Build one row per task with all template info repeated.
    const buildRow = (task: any | null, taskNo: number | '') => {
      const taskTitle = task?.title || '';
      const photoReq =
        task?.photo_requirement === 'mandatory'
          ? 'YES'
          : task?.photo_requirement === 'optional'
          ? 'OPTIONAL'
          : task?.photo_requirement === 'none'
          ? 'NO'
          : '';

      const needsReview =
        !t.code ||
        !branchName ||
        !t.department ||
        !t.title ||
        !t.frequency ||
        !t.default_due_time ||
        !taskTitle
          ? 'YES'
          : 'NO';

      return {
        'Template Code': t.code || '',
        'Template Name': t.title || '',
        Branch: branchName,
        Department: t.department || '',
        'Checklist Type': t.checklist_type || '',
        Frequency: t.frequency || '',
        'Due Time': t.default_due_time || '',
        'Assigned Staff': assignedStaff,
        'Warning Recipient / Manager': warningRecipients,
        'Task No': taskNo,
        'Task Title': taskTitle,
        'Task Instruction / Notes': task?.instruction || task?.notes || '',
        'Photo Required': photoReq,
        Active: t.is_active ? 'YES' : 'NO',
        'Needs Review': needsReview,
      };
    };

    if (!tasks.length) {
      rows.push(buildRow(null, ''));
      return;
    }
    tasks.forEach((task: any, idx: number) => rows.push(buildRow(task, idx + 1)));
  });

  const wb = XLSX.utils.book_new();
  const headerOrder = [
    'Template Code',
    'Template Name',
    'Branch',
    'Department',
    'Checklist Type',
    'Frequency',
    'Due Time',
    'Assigned Staff',
    'Warning Recipient / Manager',
    'Task No',
    'Task Title',
    'Task Instruction / Notes',
    'Photo Required',
    'Active',
    'Needs Review',
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { header: headerOrder }),
    'Templates Review',
  );

  const today = new Date();
  const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  XLSX.writeFile(wb, `checklist_template_export_review_${yyyymmdd}.xlsx`);
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
