---
name: DFQ Labs OS — staff names vs data keys
description: How specialist/assignedTo values are stored and displayed; what to do when staff change.
---

# DFQ Labs OS — Staff Names as Data Keys

## Rule
`assignedTo` now stores the person's **full real name** as the data value — not a role label or intern key. The displayed name IS the stored key.

Current staff:
- **"Sa'adatu Mohammed"** — colour `#F59E0B` (amber), role key `saadatu`, password `Saadatu_2607`
- **"Abigail Dixon"** — colour `#8B5CF6` (purple), role key `abigail`, password `Abigail_2607`

**Why:** Previously the system used "Intern A" / "Intern B" as data keys with a separate display-label map (SPECIALIST_DISPLAY). This was confusing because the keys didn't match the people. After renaming to real names the display = stored = login are all consistent.

## How to apply
- `SPECIALISTS` array in `constants.tsx` — edit this when staff change.
- `SPECIALIST_COLOR` — add the new name with a colour; keep legacy keys commented for old data.
- `ROLE_ACCESS` — add/remove role keys and passwords here.
- `autoAssignSpecialist` in `constants.tsx` — hardcoded to the two current names; update when staff change.
- `TeamTab.tsx` bulk-assign — also hardcoded to current names; update together.
- `App.tsx` routing — `role === "saadatu"` / `role === "abigail"` → `staffName` map; add new elif when staff change.
- `LEGACY_ASSIGNEE_MAP` in `constants.tsx` — map any old stored values (Intern A, Intern B, Outreach, Client Relationships) to current names; always extend, never shrink, so old exports still load correctly.

## Adding a new staff member
1. Add their name to `SPECIALISTS`.
2. Add a colour to `SPECIALIST_COLOR`.
3. Add a password constant and a `ROLE_ACCESS` entry.
4. Add a `RoleCard` in `RoleSelect` in `App.tsx`.
5. Add a routing branch in `App.tsx` (staff routing block).
6. Update `autoAssignSpecialist` and `TeamTab.tsx` bulk-assign if they should receive auto-assigned leads.
