-- =========================================================================
-- Document Module — Initial schema
-- =========================================================================

-- Main document records table
CREATE TABLE public.document_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_code TEXT NOT NULL UNIQUE,
  document_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  department TEXT,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  issue_date DATE,
  expiry_date DATE,
  reminder_days_before_expiry INTEGER DEFAULT 30,
  responsible_person TEXT,
  file_path TEXT,
  file_name TEXT,
  file_type TEXT,
  notes TEXT,
  linked_module TEXT,
  linked_record_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Value constraints (kept as CHECK on text — these lists are stable)
  CONSTRAINT document_records_branch_check
    CHECK (branch IN ('La Cala', 'La Cala Mare', 'Bottega26')),
  CONSTRAINT document_records_department_check
    CHECK (department IS NULL OR department IN (
      'Management', 'Office', 'Kitchen', 'Pizza',
      'Service', 'Bar', 'Maintenance', 'Staff'
    )),
  CONSTRAINT document_records_document_type_check
    CHECK (document_type IN (
      'License / Permit', 'Contract', 'Equipment Document',
      'Staff Document', 'Internal Document', 'Supplier Document', 'Other'
    )),
  CONSTRAINT document_records_status_check
    CHECK (status IN ('Active', 'Expiring Soon', 'Expired', 'Archived', 'Replaced'))
);

-- Indexes for common filters
CREATE INDEX idx_document_records_branch          ON public.document_records (branch);
CREATE INDEX idx_document_records_department      ON public.document_records (department);
CREATE INDEX idx_document_records_document_type   ON public.document_records (document_type);
CREATE INDEX idx_document_records_status          ON public.document_records (status);
CREATE INDEX idx_document_records_expiry_date     ON public.document_records (expiry_date);
CREATE INDEX idx_document_records_document_code   ON public.document_records (document_code);
CREATE INDEX idx_document_records_linked          ON public.document_records (linked_module, linked_record_id);

-- Auto-update updated_at via existing helper
CREATE TRIGGER trg_document_records_updated_at
BEFORE UPDATE ON public.document_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- Document history (audit log)
-- =========================================================================
CREATE TABLE public.document_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.document_records(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  old_file_path TEXT,
  new_file_path TEXT,
  notes TEXT,
  action_by UUID,
  action_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT document_history_action_type_check
    CHECK (action_type IN (
      'Created', 'Updated', 'File Uploaded',
      'Renewed', 'Archived', 'Replaced'
    ))
);

CREATE INDEX idx_document_history_document_id ON public.document_history (document_id);
CREATE INDEX idx_document_history_action_at   ON public.document_history (action_at DESC);

-- =========================================================================
-- Row Level Security
-- =========================================================================
ALTER TABLE public.document_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;

-- ---- document_records policies ----

-- Owners: full access
CREATE POLICY "Owners can read all documents"
ON public.document_records FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can insert documents"
ON public.document_records FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can update documents"
ON public.document_records FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can delete documents"
ON public.document_records FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));

-- Managers: read/insert/update (no delete) — branch/department scoping added later
CREATE POLICY "Managers can read documents"
ON public.document_records FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert documents"
ON public.document_records FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update documents"
ON public.document_records FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- Staff: intentionally no policies yet.

-- ---- document_history policies ----

CREATE POLICY "Owners can read document history"
ON public.document_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can insert document history"
ON public.document_history FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners can delete document history"
ON public.document_history FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Managers can read document history"
ON public.document_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert document history"
ON public.document_history FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));