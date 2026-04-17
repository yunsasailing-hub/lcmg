-- One-time backfill: previously stored due_datetime values were tagged as UTC
-- but actually represented Vietnam local times (Asia/Ho_Chi_Minh, UTC+7).
-- Subtract 7 hours so they correctly represent the intended VN local moment.
UPDATE public.checklist_instances
SET due_datetime = due_datetime - interval '7 hours'
WHERE due_datetime IS NOT NULL;