# Component specs

One block per component from `recon.md`. Every state the recon saw, plus the
ones every component needs (focus-visible, disabled, loading, error, empty).
Keyboard and screen-reader behaviour is part of the spec, not an afterthought.
All colours are token roles (`accent`, `text-muted`...), never raw hex.

Focus ring is global: `2px solid var(--color-focus)` with a `2px` offset,
shown on `:focus-visible` only.

---

Button
  variants  primary, secondary, ghost, danger
  sizes     sm 32px, md 40px, lg 48px (height); padding 0 var(--space-4)
  states    default, hover (accent-hover / surface), active, focus-visible (2px ring),
            disabled (60% opacity, no pointer), loading (spinner, label kept)
  tokens    primary: bg accent / text on-accent; secondary: bg surface / text text /
            border border; ghost: transparent / text text; danger: bg danger / text on-accent;
            radius md, font sm/600
  a11y      real <button>; loading sets aria-busy and keeps the label for SRs; icon-only
            needs aria-label
  used on   all

Field control (text/email/phone/number/currency/short_text)
  sizes     height 40px; padding 0 var(--space-3)
  states    default, focus (ring + border-input darkens), filled, required-empty,
            error (border danger + message), disabled, readonly
  tokens    bg bg; border border-input; text text; placeholder text-muted; radius md;
            error text danger, font sm
  a11y      <label for> or wrapping label; aria-invalid + aria-describedby on error;
            required via required + visible marker (not colour alone)
  used on   S06, S07, S08, S10, S11, S14, S15

Textarea (long_text)
  as Field control, min-height 96px, vertical resize, same states/a11y

Select / Dropdown (select, label_select, assignee_select)
  states    closed, open, focus, selected, multi (chips), empty ("No options"),
            loading, disabled, error
  tokens    trigger like Field control; menu bg surface-raised, shadow pop, radius md;
            option hover surface, selected accent tint
  a11y      listbox/combobox roles, arrow-key navigation, type-ahead, Esc closes,
            selection announced; build on Radix/React Aria, not a div soup
  used on   S06, S07, S11, S14

Radio / Checkbox (radio, checkbox, checklist_*)
  states    unchecked, checked, focus-visible, disabled, error
  tokens    control border-input; checked bg accent / mark on-accent; radius sm (checkbox),
            pill (radio); label text, gap var(--space-2)
  a11y      native inputs or ARIA with roving focus; group wrapped in fieldset+legend

Date / Datetime / Due date picker
  states    empty, focus, open calendar, selected, invalid, disabled, range (due)
  tokens    input like Field control; calendar popover bg surface-raised shadow pop;
            today ring accent; selected bg accent/on-accent
  a11y      text input editable + calendar; grid roles; store/compare in UTC (see architecture)

Attachment field
  states    empty (drop zone), dragover, uploading (progress), uploaded (file chip),
            error (too big / rejected type), disabled
  tokens    dashed border border-input; chip bg surface radius md; progress accent
  a11y      <input type=file> reachable; announce upload success/failure; show size limit

Card tile (kanban)
  variants  normal, overdue (danger accent strip), blocked
  states    default, hover (shadow-card lifts), dragging (opacity, cursor grab),
            selected, focus-visible
  tokens    bg surface-raised; radius md; shadow card; title text sm/600; meta text-muted xs;
            labels as pills; assignee avatars
  a11y      keyboard-draggable alternative (move via menu / arrow keys); role + aria-grabbed
  used on   S03

Phase column
  variants  normal, start, end-of-process
  states    empty ("No cards"), filled, over-WIP (count warning), drop-target (highlight)
  tokens    header text sm/600 + count text-muted; column bg surface; add-card (+) ghost button;
            width var(--layout-kanban-column)
  a11y      column is a labelled list; header is a heading; drop target announced
  used on   S03, S11

Modal / Drawer (card detail, record)
  states    opening, open, closing; scroll inside; dirty-close confirm
  tokens    panel bg bg, width var(--layout-card-modal), radius lg, shadow pop;
            overlay rgba scrim; header sticky
  a11y      role dialog, aria-modal, focus trap, Esc closes, focus returns to opener,
            labelled by its title
  used on   S06, S15

Data grid / Table (list view, database, report)
  states    empty, loading (skeleton rows), filled, sorting, inline-edit, row-hover,
            row-selected, error
  tokens    header bg surface text-muted xs/600; row border-bottom border; zebra optional;
            cell padding var(--space-2) var(--space-3)
  a11y      real <table> semantics; sortable headers are buttons with aria-sort;
            inline edit announces mode; sticky header
  used on   S04, S14, S16, S17

Form builder (start/phase/public)
  states    editing, drag-reorder, field selected, conditional-logic rule, preview
  tokens    field palette surface; canvas bg; drag handle text-muted; selected ring accent
  a11y      keyboard reorder (not drag-only); each field row labelled; preview reachable
  used on   S11

Automation rule row
  states    configured, editing (event → condition → action), invalid (missing target),
            disabled/active toggle, metered-usage warning
  tokens    row bg surface-raised; segment chips; warning text warning; toggle accent
  a11y      each segment a labelled control; invalid state has text, not colour alone
  used on   S12

Chart widget (dashboard)
  variants  line, bar, area, table, calendar, number
  states    empty (configure prompt), loading, configured, error
  tokens    use the `label` categorical palette for series; axis/grid border; title text lg
  a11y      chart has a text summary + data table fallback; colour never the only encoding
  used on   S18
  note      follow the dataviz skill when implementing — colour-by-series rules live there

Connection chip (connector)
  states    linked, create-new, broken (target deleted), loading
  tokens    chip bg surface, border border, icon text-muted, radius pill
  a11y      links to the connected item; broken state labelled in text
  used on   S06, S15

Nav sidebar
  states    collapsed, expanded, item active, item hover, nested group
  tokens    bg surface; active item bg accent tint + text text; width var(--layout-sidebar)
  a11y      <nav> landmark, current page aria-current, collapsible via button
  used on   all

Header bar
  tokens    height var(--layout-header); bg bg; border-bottom border; search + user menu
  a11y      banner landmark; search is a labelled input
  used on   all

Filter / Search bar
  states    empty, typing, active filters (chips), no-results
  tokens    input like Field control; filter chips removable; clear-all ghost button
  a11y      results count announced (aria-live); each chip removable by keyboard
  used on   S03, S04, S14, S16

Avatar / Assignee
  variants  single, group (stacked, +N overflow)
  tokens    circle radius pill; initials on label swatch; ring on hover
  a11y      alt/aria-label with the person's name; group announces count
  used on   S03, S06

Label / Tag (pill)
  tokens    bg label-* tint; text text (on tint) or on-accent (on 500); radius pill; xs/500
  a11y      text label present; colour never the only meaning
  used on   S03, S06, S11

Toast / Alert
  variants  success, error, info, warning
  states    enter, visible (auto-dismiss), manual-dismiss, stacked
  tokens    bg surface-raised; left accent by variant (success/danger/accent/warning);
            shadow pop; radius md
  a11y      role status (info/success) or alert (error); dismiss button labelled;
            auto-dismiss pauses on hover/focus
  used on   all

Activity log / Comments
  states    empty, loading, filled, posting, failed-to-post
  tokens    system event text-muted xs; user comment bg surface radius md; author sm/600
  a11y      list semantics; new items announced via aria-live polite; timestamps have title
  used on   S06
