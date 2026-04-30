import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Plus, Loader2, Upload } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  APP_FILES_BUCKET, generateStoragePath, type StorageBranchInput,
} from '@/lib/appFilesStorage';

// ---------------------------------------------------------------------------
// Static option lists (mirrors document_records CHECK constraints)
// ---------------------------------------------------------------------------

const BRANCHES: { code: 'LCL' | 'LCM' | 'B26'; label: string }[] = [
  { code: 'LCL', label: 'La Cala (LCL)' },
  { code: 'LCM', label: 'La Cala Mare (LCM)' },
  { code: 'B26', label: 'Bottega26 (B26)' },
];

const DEPARTMENTS = [
  'Kitchen', 'Pizza', 'Bar', 'Service', 'Office', 'Management', 'Bakery',
] as const;

const DOCUMENT_TYPES = [
  'License', 'Contract', 'Insurance', 'Invoice', 'Receipt',
  'Certification', 'Permit', 'Report', 'Manual', 'Internal', 'Supplier', 'Other',
] as const;

// Map document type → folder sub-type used in the storage path.
function typeToSubType(documentType: string): string {
  const t = documentType.toLowerCase();
  if (t === 'license' || t === 'permit') return 'licenses';
  if (t === 'contract') return 'contracts';
  if (t === 'supplier') return 'supplier';
  if (t === 'internal') return 'internal';
  return t.replace(/[^a-z0-9]+/g, '-');
}

// ---------------------------------------------------------------------------
// Form types & defaults
// ---------------------------------------------------------------------------

interface FormState {
  document_name: string;
  document_code: string;
  branch: '' | 'LCL' | 'LCM' | 'B26';
  department: string;
  document_type: string;
  issue_date: string;
  expiry_date: string;
  responsible_person: string;
  notes: string;
  file: File | null;
}

const EMPTY_FORM: FormState = {
  document_name: '',
  document_code: '',
  branch: '',
  department: '',
  document_type: '',
  issue_date: '',
  expiry_date: '',
  responsible_person: '',
  notes: '',
  file: null,
};

// ---------------------------------------------------------------------------
// Documents page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  // Live preview of the generated storage path while filling the form.
  useEffect(() => {
    if (!form.file || !form.branch || !form.document_type) {
      setPreviewPath(null);
      return;
    }
    const path = generateStoragePath('documents', {
      branch: form.branch as StorageBranchInput,
      subType: typeToSubType(form.document_type),
      fileName: form.file.name,
    });
    setPreviewPath(path);
  }, [form.file, form.branch, form.document_type]);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['document_records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_records')
        .select('id,document_code,document_name,branch,department,document_type,status,issue_date,expiry_date,file_path,file_name,created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  function reset() {
    setForm(EMPTY_FORM);
    setPreviewPath(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!form.document_name.trim()) return toast.error('Document name is required');
    if (!form.document_code.trim()) return toast.error('Document code is required');
    if (!form.branch) return toast.error('Branch is required');
    if (!form.document_type) return toast.error('Document type is required');
    if (!form.file) return toast.error('Please select a file to upload');

    setSubmitting(true);
    try {
      // 1. Uniqueness pre-check on document_code
      const { data: existing, error: checkErr } = await supabase
        .from('document_records')
        .select('id')
        .eq('document_code', form.document_code.trim())
        .maybeSingle();
      if (checkErr) throw checkErr;
      if (existing) {
        toast.error('Document code already exists. Please use a unique code.');
        setSubmitting(false);
        return;
      }

      // 2. Build storage path via the centralized helper
      const filePath = generateStoragePath('documents', {
        branch: form.branch,
        subType: typeToSubType(form.document_type),
        fileName: form.file.name,
      });

      // 3. Upload to app-files bucket
      const { error: upErr } = await supabase.storage
        .from(APP_FILES_BUCKET)
        .upload(filePath, form.file, {
          upsert: false,
          contentType: form.file.type || undefined,
        });
      if (upErr) throw upErr;

      // 4. Insert DB record
      const { data: userRes } = await supabase.auth.getUser();
      const insertPayload = {
        document_name: form.document_name.trim(),
        document_code: form.document_code.trim(),
        branch: branchCodeToLabel(form.branch),
        department: form.department || null,
        document_type: form.document_type,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        responsible_person: form.responsible_person.trim() || null,
        notes: form.notes.trim() || null,
        file_path: filePath,
        file_name: form.file.name,
        file_type: form.file.type || null,
        status: 'Active',
        created_by: userRes?.user?.id ?? null,
      };

      const { error: insErr } = await supabase
        .from('document_records')
        .insert(insertPayload);
      if (insErr) {
        // Roll back uploaded file so we don't leak orphan storage objects.
        await supabase.storage.from(APP_FILES_BUCKET).remove([filePath]);
        throw insErr;
      }

      toast.success('Document uploaded successfully');
      reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['document_records'] });
    } catch (err: any) {
      // Friendly message for unique-violation if the race-condition path triggers.
      const msg = err?.message || 'Failed to upload document';
      if (/duplicate key|unique/i.test(msg)) {
        toast.error('Document code already exists. Please use a unique code.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Documents"
        description="Upload, track and manage operational documents."
      >
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Document
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading documents…
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Click “Add Document” to upload your first file."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.document_name}</p>
                    <p className="text-xs text-muted-foreground">{r.document_code}</p>
                  </div>
                  <Badge variant="secondary">{r.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge variant="outline">{r.branch}</Badge>
                  <Badge variant="outline">{r.document_type}</Badge>
                  {r.department && <Badge variant="outline">{r.department}</Badge>}
                </div>
                {(r.issue_date || r.expiry_date) && (
                  <p className="text-xs text-muted-foreground">
                    {r.issue_date ? `Issued ${r.issue_date}` : ''}
                    {r.issue_date && r.expiry_date ? ' · ' : ''}
                    {r.expiry_date ? `Expires ${r.expiry_date}` : ''}
                  </p>
                )}
                {r.file_name && (
                  <p className="text-xs truncate text-muted-foreground" title={r.file_path ?? ''}>
                    {r.file_name}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!submitting) { setOpen(o); if (!o) reset(); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="doc-name">Document Name *</Label>
                <Input
                  id="doc-name"
                  value={form.document_name}
                  onChange={(e) => update('document_name', e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div>
                <Label htmlFor="doc-code">Document Code *</Label>
                <Input
                  id="doc-code"
                  value={form.document_code}
                  onChange={(e) => update('document_code', e.target.value)}
                  placeholder="DOC-B26-LIC-001"
                  maxLength={80}
                  required
                />
              </div>

              <div>
                <Label>Branch *</Label>
                <Select value={form.branch} onValueChange={(v) => update('branch', v as FormState['branch'])}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b.code} value={b.code}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Department</Label>
                <Select value={form.department} onValueChange={(v) => update('department', v)}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Document Type *</Label>
                <Select value={form.document_type} onValueChange={(v) => update('document_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="issue-date">Issue Date</Label>
                <Input
                  id="issue-date"
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => update('issue_date', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="expiry-date">Expiry Date</Label>
                <Input
                  id="expiry-date"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => update('expiry_date', e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="resp">Responsible Person</Label>
                <Input
                  id="resp"
                  value={form.responsible_person}
                  onChange={(e) => update('responsible_person', e.target.value)}
                  maxLength={120}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="file">File *</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => update('file', e.target.files?.[0] ?? null)}
                  required
                />
                {previewPath && (
                  <p className="mt-1 text-[11px] text-muted-foreground break-all">
                    Will save to: <span className="font-mono">{APP_FILES_BUCKET}/{previewPath}</span>
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setOpen(false); reset(); }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-4 w-4 mr-1.5" /> Upload Document</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// Branches in document_records use the human label (per CHECK constraint).
function branchCodeToLabel(code: 'LCL' | 'LCM' | 'B26'): string {
  switch (code) {
    case 'LCL': return 'La Cala';
    case 'LCM': return 'La Cala Mare';
    case 'B26': return 'Bottega26';
  }
}