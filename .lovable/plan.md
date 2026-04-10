

## Fix "Opening" Button and Checklist Code Review

### Problem identified
In `TemplateManager.tsx`, the right side of each template card (containing the "opening"/"afternoon"/"closing" badge and the "Assign Today" button) has `onClick={e => e.stopPropagation()}` on line 324. This prevents the card from expanding when clicking anywhere near the badge or assign button area. When the user clicks the "Opening" badge, the click is swallowed and nothing happens.

### Additional issues found
1. **ModuleCard ref warning** — Console shows "Function components cannot be given refs" for `ModuleCard` and `MobileNav`. These need `React.forwardRef`.
2. **Unused variable in `useAuth.tsx`** — Line 40 has an unused `data` variable in `fetchRoles`.

### Fix plan

**1. `src/components/checklists/TemplateManager.tsx`**
- Move `stopPropagation` from the wrapper div to only the `AssignDialog` button itself, so clicking the badge area still triggers card expansion
- The AssignDialog already has `stopPropagation` on its trigger button (line 215), so the wrapper div's `stopPropagation` is redundant — just remove it from the wrapper

**2. `src/components/shared/ModuleCard.tsx`**
- Wrap with `React.forwardRef` to fix the console warning

**3. `src/components/layout/AppShell.tsx`**
- Wrap `MobileNav` with `React.forwardRef` to fix the console warning

These are small targeted fixes — no structural changes needed.

