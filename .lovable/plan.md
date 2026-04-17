
Root cause identified

- The current “Delete Template” flow is not a real delete flow.
- In `src/hooks/useChecklists.tsx`, `useDeleteTemplate()` does `update({ is_active: false })` on `checklist_templates` instead of `delete()`.
- The database currently has no `DELETE` RLS policy on `checklist_templates`, so even a true delete request from an Owner would be blocked.
- The template has related data (`checklist_template_tasks`, `checklist_assignments`, `checklist_instances`) and the current delete flow does not handle those dependencies at all.
- There is also an unfinished DB-side delete lifecycle: `end_assignments_on_template_delete()` exists, but there are no triggers wired to it, so nothing runs automatically on template deletion.
- The UI currently hides the real cause by showing only a generic toast (`Failed to delete template`) instead of surfacing the actual backend/database error.

Implementation plan

1. Rebuild template deletion as a real owner-safe delete flow
- Replace the current soft-delete mutation with a dedicated delete operation.
- Make the frontend call a backend-controlled delete path instead of directly toggling `is_active`.
- Keep the confirmation dialog, but make it trigger the real delete workflow.

2. Fix backend/database authorization
- Add explicit Owner delete permission for `checklist_templates`.
- Recheck whether Manager should still be allowed too, based on the existing RBAC rules already used elsewhere.
- Ensure the delete path is enforced server-side, not just via button visibility.

3. Handle dependencies correctly
- Recheck the actual foreign-key behavior for:
  - `checklist_template_tasks.template_id`
  - `checklist_assignments.template_id`
  - `checklist_instances.template_id`
- Implement safe deletion logic so full deletion succeeds:
  - delete child template tasks first, or add cascade where appropriate
  - preserve historical checklist records by clearing/nulling template references where needed
  - end active/paused assignments if the template is being removed
- If any dependency still makes hard deletion unsafe, return a clear business error instead of failing silently.

4. Improve UI error handling and diagnostics
- Pass through the exact backend error message into the toast.
- Log the template id and returned error for easier debugging.
- Show meaningful reasons such as:
  - “This template cannot be deleted because linked checklist history must be preserved”
  - or “Failed to delete child tasks”
  - or “Owner permission missing”

5. Recheck the full owner flow end-to-end
- Verify delete button visibility for Owner
- Verify confirm dialog action fires
- Verify correct template id is passed
- Verify backend receives the delete request
- Verify DB/RLS allows Owner deletion
- Verify related tasks are removed
- Verify template disappears from the list after success
- Verify clear error feedback when deletion is intentionally blocked

Technical details

- Most likely implementation:
  - add a dedicated backend delete handler for templates
  - perform dependency cleanup and deletion in one controlled flow
  - update the React mutation to call that handler
- This is safer than relying on a raw client-side `.delete()` because the deletion has business rules and related-record cleanup.
- I will also clean up the current misleading wording so the UI matches the actual behavior.

Expected result after fix

- As Owner, clicking “Delete Template” and confirming will either:
  - fully remove the template successfully and remove it from the list, or
  - show a precise reason why deletion is blocked
- No more generic silent failure
- Owner will no longer be blocked by missing delete permission or incomplete dependency handling
