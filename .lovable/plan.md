

# Multi-Language System: English + Vietnamese

## Overview
Implement app-wide internationalization (i18n) using `react-i18next`, the standard React translation library. Every piece of UI text across all pages and components will be translatable, with a simple EN/VI language switcher in the app shell.

## Architecture

```text
src/
├── i18n/
│   ├── index.ts              ← i18next config + init
│   ├── en.json               ← English translations
│   └── vi.json               ← Vietnamese translations
├── components/
│   └── layout/
│       └── AppShell.tsx       ← Language switcher added here
└── ... all pages/components   ← Replace hardcoded strings with t()
```

## Implementation Steps

### 1. Install & Configure i18next
- Add `react-i18next` and `i18next` packages
- Create `src/i18n/index.ts` — initialize i18next with:
  - Two language resources: `en` and `vi`
  - Default language: `en`
  - Language detection from `localStorage` (persists across sessions)
  - Fallback to `en`

### 2. Create Translation Files
- `src/i18n/en.json` — all English strings organized by namespace:
  - `nav` (Dashboard, Training, Checklists, Recipes, etc.)
  - `dashboard` (welcome, stats, module cards)
  - `checklists` (statuses, buttons, form labels, notes, templates)
  - `login` (form fields, errors, success messages)
  - `common` (Save, Cancel, Delete, Confirm, etc.)
  - `management`, `inventory`, `maintenance`, `training`, `recipes`
- `src/i18n/vi.json` — Vietnamese equivalents for all keys

### 3. Add Language Switcher
- In `AppShell.tsx`:
  - Desktop sidebar footer: add EN/VI toggle button
  - Mobile top bar: add EN/VI toggle button
  - On click: call `i18n.changeLanguage()`, which auto-saves to `localStorage`
- Also add a language toggle on the Login page (before user is authenticated)

### 4. Replace Hardcoded Strings Across All Pages
Every component with visible text will use `useTranslation()` hook and `t('key')`:
- **Login.tsx** — form labels, buttons, errors, department names
- **Dashboard.tsx** — welcome message, stat labels, module titles/descriptions
- **AppShell.tsx** — nav labels, sign out
- **Checklists.tsx** — all checklist UI (TemplateManager, StaffChecklistView, ManagerDashboard)
- **Recipes.tsx, Inventory.tsx, Maintenance.tsx, Training.tsx, Management.tsx** — page headers, empty states
- **Shared components** (PageHeader, EmptyState, StatCard, ModuleCard) — pass translated props
- **Toast messages** — all success/error toasts throughout hooks

### 5. Checklist Module (Special Attention)
- Status labels (Pending, Done, Verified, Rejected) → translated
- Template editor buttons (Save, Delete, Add Task) → translated
- Staff view (Submit, Notes placeholder, photo labels) → translated
- Manager dashboard (filters, counters, table headers) → translated

### 6. Persistence
- Language preference stored in `localStorage` under key `i18nextLng`
- Survives page refresh and re-login
- Future enhancement: save to user profile in database (optional, not in v1)

## Technical Details
- **Library**: `react-i18next` + `i18next` (industry standard, ~15KB)
- **No backend changes needed** — translations are bundled client-side
- **Extensible** — adding a third language = adding one JSON file + one line of config
- **~15 files modified** to replace hardcoded strings with `t()` calls

