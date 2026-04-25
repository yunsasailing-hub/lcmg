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

// ─── Import preview types & parser (reads the clean export format) ───

export type ImportTaskPreview = {
  task_no: number | null;
  title: string;
  instruction: string;
  photo_required: boolean;
  note_required: boolean;
  row_number: number;
};

export type ImportTemplatePreview = {
  code: string;
  title: string;
  branch_name: string;
  branch_id: string | null;
  department: Department | '';
  checklist_type: ChecklistType | '';
  default_due_time: string;
  is_active: boolean;
  tasks: ImportTaskPreview[];
  action: 'create' | 'update';
  errors: string[];
};

export type ImportPreview = {
  templates: ImportTemplatePreview[];
  totals: {
    detected: number;
    toCreate: number;
    toUpdate: number;
    totalTaskRows: number;
    rowsWithMissingFields: number;
    blockingErrors: number;
  };
  globalErrors: string[];
};

const TEMPLATE_CODE_REGEX = /^[A-Z0-9]{2,4}-[A-Z]{2,4}-\d{3}$/;

const REQUIRED_HEADERS = [
  'Template Code',
  'Template Name',
  'Branch',
  'Department',
  'Checklist Type',
  'Default Due Time',
  'Task No',
  'Task Title',
] as const;

function asYesNo(v: any): boolean {
  if (v === true) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function normalizeTime(v: any): string {
  if (v == null || v === '') return '';
  // Excel may return time as a fractional day number.
  if (typeof v === 'number' && Number.isFinite(v)) {
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const s = String(v).trim();
  // Accept "HH:MM" or "HH:MM:SS"
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s;
}

export async function parseImportPreview(file: File): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  // Use the first sheet (export uses "Templates Review", but accept any).
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('The file has no sheets.');
  const sheet = wb.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const globalErrors: string[] = [];
  if (!rows.length) {
    return {
      templates: [],
      totals: { detected: 0, toCreate: 0, toUpdate: 0, totalTaskRows: 0, rowsWithMissingFields: 0, blockingErrors: 1 },
      globalErrors: ['The import file is empty.'],
    };
  }

  // Check headers exist on first row.
  const headerKeys = Object.keys(rows[0]);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerKeys.includes(h));
  if (missingHeaders.length) {
    globalErrors.push(`Missing required columns: ${missingHeaders.join(', ')}`);
  }

  // Load existing branches + templates to map names → ids and decide create/update.
  const [{ data: branches }, { data: existingTemplates }] = await Promise.all([
    supabase.from('branches').select('id, name'),
    supabase.from('checklist_templates').select('id, code'),
  ]);
  const branchByName = new Map<string, string>();
  (branches || []).forEach((b: any) => branchByName.set(String(b.name).trim().toLowerCase(), b.id));
  const existingCodes = new Set(
    (existingTemplates || []).map((t: any) => String(t.code || '').toUpperCase()).filter(Boolean),
  );

  // Group rows by Template Code.
  const groups = new Map<string, { rows: { row: any; rowNumber: number }[] }>();
  rows.forEach((row, i) => {
    const code = String(row['Template Code'] ?? '').trim().toUpperCase();
    if (!code) {
      // Skip completely empty rows silently; otherwise flag.
      const hasAnyValue = REQUIRED_HEADERS.some((h) => String(row[h] ?? '').trim() !== '');
      if (hasAnyValue) {
        globalErrors.push(`Row ${i + 2}: missing Template Code.`);
      }
      return;
    }
    if (!groups.has(code)) groups.set(code, { rows: [] });
    groups.get(code)!.rows.push({ row, rowNumber: i + 2 });
  });

  const templates: ImportTemplatePreview[] = [];
  let totalTaskRows = 0;
  let rowsWithMissingFields = 0;

  for (const [code, { rows: groupRows }] of groups) {
    const errors: string[] = [];
    if (!TEMPLATE_CODE_REGEX.test(code)) {
      errors.push(`Invalid Template Code format "${code}". Expected BRANCH-DEPT-### (e.g. LCL-PIZ-001).`);
    }

    // Take template-level info from the first row, but verify all rows agree.
    const first = groupRows[0].row;
    const title = String(first['Template Name'] ?? '').trim();
    const branchName = String(first['Branch'] ?? '').trim();
    const department = String(first['Department'] ?? '').trim().toLowerCase();
    const checklistType = String(first['Checklist Type'] ?? '').trim().toLowerCase();
    const defaultDueTime = normalizeTime(first['Default Due Time']);
    const isActive = first['Active'] === '' || first['Active'] == null
      ? true
      : asYesNo(first['Active']);

    if (!title) errors.push('Missing Template Name.');
    if (!branchName) errors.push('Missing Branch.');
    if (!department) errors.push('Missing Department.');
    else if (!validDepts.includes(department)) errors.push(`Invalid Department "${first['Department']}".`);
    if (!checklistType) errors.push('Missing Checklist Type.');
    else if (!validTypes.includes(checklistType)) errors.push(`Invalid Checklist Type "${first['Checklist Type']}".`);
    if (!defaultDueTime) errors.push('Missing Default Due Time.');

    const branchId = branchName ? branchByName.get(branchName.toLowerCase()) ?? null : null;
    if (branchName && !branchId) errors.push(`Branch "${branchName}" not found in the system.`);

    // Conflicting template-level info between rows of the same Template Code.
    groupRows.slice(1).forEach(({ row, rowNumber }) => {
      const checks: [string, string, string][] = [
        ['Template Name', String(row['Template Name'] ?? '').trim(), title],
        ['Branch', String(row['Branch'] ?? '').trim(), branchName],
        ['Department', String(row['Department'] ?? '').trim().toLowerCase(), department],
        ['Checklist Type', String(row['Checklist Type'] ?? '').trim().toLowerCase(), checklistType],
        ['Default Due Time', normalizeTime(row['Default Due Time']), defaultDueTime],
      ];
      for (const [label, val, expected] of checks) {
        if (val && val !== expected) {
          errors.push(`Row ${rowNumber}: ${label} "${val}" conflicts with first row "${expected}" for code ${code}.`);
        }
      }
    });

    // Tasks
    const seenTaskNos = new Set<number>();
    const tasks: ImportTaskPreview[] = [];
    for (const { row, rowNumber } of groupRows) {
      const taskTitle = String(row['Task Title'] ?? '').trim();
      const taskNoRaw = row['Task No'];
      const taskNo = taskNoRaw === '' || taskNoRaw == null ? null : Number(taskNoRaw);
      const instruction = String(row['Task Instruction / Notes'] ?? '').trim();
      const photoRequired = asYesNo(row['Photo Required']);
      const noteRequired = asYesNo(row['Note Required']);

      // A row with no task title at all is treated as a template-only row (skip task).
      if (!taskTitle && taskNo == null) continue;

      let rowHasMissing = false;
      if (!taskTitle) {
        errors.push(`Row ${rowNumber}: missing Task Title.`);
        rowHasMissing = true;
      }
      if (taskNo == null || Number.isNaN(taskNo)) {
        errors.push(`Row ${rowNumber}: missing or invalid Task No.`);
        rowHasMissing = true;
      } else {
        if (seenTaskNos.has(taskNo)) {
          errors.push(`Row ${rowNumber}: duplicate Task No ${taskNo} within template ${code}.`);
        }
        seenTaskNos.add(taskNo);
      }
      if (rowHasMissing) rowsWithMissingFields += 1;

      tasks.push({
        task_no: taskNo == null || Number.isNaN(taskNo) ? null : taskNo,
        title: taskTitle,
        instruction,
        photo_required: photoRequired,
        note_required: noteRequired,
        row_number: rowNumber,
      });
      totalTaskRows += 1;
    }

    if (!tasks.length) errors.push('No tasks found for this template.');

    const action: 'create' | 'update' = existingCodes.has(code) ? 'update' : 'create';

    templates.push({
      code,
      title,
      branch_name: branchName,
      branch_id: branchId,
      department: (validDepts.includes(department) ? department : '') as Department | '',
      checklist_type: (validTypes.includes(checklistType) ? checklistType : '') as ChecklistType | '',
      default_due_time: defaultDueTime,
      is_active: isActive,
      tasks: tasks.sort((a, b) => (a.task_no ?? 0) - (b.task_no ?? 0)),
      action,
      errors,
    });
  }

  const blockingErrors =
    globalErrors.length + templates.reduce((acc, t) => acc + t.errors.length, 0);

  return {
    templates,
    totals: {
      detected: templates.length,
      toCreate: templates.filter((t) => t.action === 'create' && t.errors.length === 0).length,
      toUpdate: templates.filter((t) => t.action === 'update' && t.errors.length === 0).length,
      totalTaskRows,
      rowsWithMissingFields,
      blockingErrors,
    },
    globalErrors,
  };
}

export async function exportTemplatesToXlsx(templates: any[]) {
  // Safety: ensure we have a valid session before doing any privileged reads.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    throw new Error('Your session expired. Please sign in again.');
  }

  // Fetch branches lookup so we can show names instead of UUIDs.
  const branchesRes = await supabase.from('branches').select('id, name');
  const branchMap = new Map<string, string>();
  (branchesRes.data || []).forEach((b: any) => branchMap.set(b.id, b.name));

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

    const tasks = ((t.tasks as any[]) || []).slice().sort(
      (x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0),
    );

    // Build one row per task with all template info repeated.
    const buildRow = (task: any | null, taskNo: number | '') => {
      // Template tasks store title as "title\ninstruction" combined.
      // Split safely so the export shows the real title and instruction separately.
      const rawTitle = typeof task?.title === 'string' ? task.title : '';
      const [splitTitle, ...instructionParts] = rawTitle.split('\n');
      const taskTitle = (splitTitle || rawTitle).trim();
      const splitInstruction = instructionParts.join('\n').trim();

      const photoReq =
        task?.photo_requirement === 'mandatory' || task?.photo_requirement === true
          ? 'YES'
          : 'NO';
      const noteReq =
        task?.note_requirement === 'mandatory' || task?.note_requirement === true
          ? 'YES'
          : 'NO';
      // Only accept real string instruction fields. Never coerce numbers/ids.
      const explicitInstruction =
        typeof task?.instruction === 'string' ? task.instruction.trim() : '';
      const taskInstruction = explicitInstruction || splitInstruction || '';

      const needsReview =
        !t.code ||
        !branchName ||
        !t.department ||
        !t.title ||
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
        'Default Due Time': t.default_due_time || '',
        'Task No': taskNo,
        'Task Title': taskTitle,
        'Task Instruction / Notes': taskInstruction,
        'Photo Required': photoReq,
        'Note Required': noteReq,
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
    'Default Due Time',
    'Task No',
    'Task Title',
    'Task Instruction / Notes',
    'Photo Required',
    'Note Required',
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
