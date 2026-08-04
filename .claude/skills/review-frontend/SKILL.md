---
name: review-frontend
description: Architecture, design system and style knowledge for reviewing changes in crimpy-frontend (SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind 4). Use when reviewing a PR, branch or diff in crimpy-frontend.
---

# Reviewing crimpy-frontend

SvelteKit 2 + Svelte 5 in runes mode, TypeScript, Tailwind 4, Vite, node adapter.
This is the coach web portal. **SSR is disabled on every route**: it is a pure
client-side SPA. Read `crimpy-frontend/.claude/CLAUDE.md` for commands; this file
is what to check in a diff.

## Layering

    src/lib/api/client.ts        the ONLY place that talks HTTP, plus all API types
    src/lib/stores/*.svelte.ts   runes-based stores (auth, snackbar)
    src/lib/components/          shared components (AppShell, Sidebar, Icon, ...)
    src/lib/components/training/ training editor building blocks
    src/lib/components/program/  program calendar building blocks
    src/routes/                  file-based routes, +page.ts guard + +page.svelte view
    tests/*.e2e.ts               Playwright end-to-end tests

## Non-negotiables

**All HTTP goes through `apiClient`.** A bare `fetch()` in a component or route is
a finding. `request<T>()` in `client.ts` centralises the base URL, the Bearer
header, and the 401-triggered refresh-and-retry. Code that handles 401 or refresh
by hand duplicates that and will diverge. New endpoints get a method on
`ApiClient` and their interfaces in the same file.

**Every protected route is a pair.** New route under `src/routes/` needs:

- `+page.ts` with `export const ssr = false`, an `await authStore.verifyUser()`
  guard, and typed params returned through `data`.
- `+page.svelte` taking `data` via `$props()`, calling `authStore.initialize()`
  in `onMount`, and wrapping content in `<AppShell title breadcrumbs>` (optional
  `{#snippet actions()}` for topbar buttons).

A page missing the `+page.ts` guard is an auth hole. A page not wrapped in
`AppShell` breaks the sidebar/topbar layout.

**Svelte 5 runes only.** `$state`, `$derived`, `$props`, `$effect`, `{@attach}`.
Legacy Svelte 4 patterns are findings: `export let`, `$:` reactive statements,
`writable()`/`readable()` stores, `on:click` instead of `onclick`, slots instead
of snippets. Stores are classes with `$state`/`$derived` in a `.svelte.ts` file,
exported as a singleton, like `authStore` and `snackbar`.

## Design system: Alpine

Warm, friendly, desktop-first. Font Figtree. CSS variables defined in `layout.css`.

    --bg #f5efe6   --panel #fff    --panel2 #faf6ef
    --bd #e8e0d6   --bd2 #f0eadf
    --tx #2d241d   --tx2 #7a6e62   --tx3 #b0a496
    --pr #c2714f (terracotta)      --pr-lt #f5e2d7   --pr-fog #fbf1ea
    --gn #6b8f71 (sage)   --gd #d4a15e (gold)   --pl #907b99 (plum)
    --r 10px  --rs 8px  --rl 14px  --sh (shadow)

Type colors: workout `--pr`, climbing `--gd`, stretching `--gn`, crimpy `--pl`.

Rules to enforce in review:

- Tailwind is for **structure only**: flex, grid, spacing, overflow, sizing.
- Colors, borders, radii and shadows come from the CSS variables via `style`
  attributes. A hardcoded hex or a Tailwind color class (`bg-orange-500`,
  `text-gray-700`, `border-black`) is a finding.
- No monospace font. No black borders.
- Keep parity with the Flutter app theme in
  `crimpy-app/lib/theme/crimpy_theme.dart`. A new semantic color on one side
  without the other is worth flagging.
- User feedback goes through `snackbar.show(message)` / `snackbar.show(message,
'error')`, not `alert()` and not ad-hoc inline banners.
- Icons come from `Icon.svelte` (stroke SVG), not inline one-off SVG.

## Drag and drop (`@dnd-kit/svelte`)

Used by the training editor and program calendar. Check new DnD code follows the
established pattern rather than reinventing it:

- `<DragDropProvider sensors={dndSensors} {onDragStart} {onDragOver} {onDragEnd}>`.
- `PointerActivationConstraints.Distance({ value: 8 })` so clicks are not drags.
- Source items: `createDraggable({ id })` with `{@attach draggable.attach}`; the
  `__new__:<type>:<extraData>` id prefix means "create new" in `onDragEnd`.
- Sortable items: `createSortable({ id, group, index })`, group is `'root'` or
  `'container:<parentId>'`.
- `onDragOver` moves with a 200ms debounce; `onDragEnd` commits or reverts from a
  snapshot. Use `isSortable(source)` to tell the two source kinds apart.
- Reuse `SidePanelDraggable.svelte` and `SortableWrapper.svelte`.

## FullCalendar

Lazy-imported inside a `$effect` (SSR safety), container gets `.fc-crimpy`, and
the effect's cleanup function must destroy the instance. A `$effect` that creates
a calendar without a teardown return is a leak. Canonical example:
`src/routes/coachees/[id]/+page.svelte`.

## File size

Several route files are already very large (the program detail page is over
50KB, the coachee detail page nearly 50KB). Growth in those files is a real
maintainability finding: push reusable markup into `$lib/components/` rather than
appending. Call it out when a diff adds substantial inline markup to an
already-oversized page.

## Tests

Playwright specs in `tests/*.e2e.ts`, shared helpers in `tests/fixtures.ts`. A new
user-visible flow with no e2e coverage is a finding. Run `npm run check` (use
this, not `tsc --noEmit`, for `.svelte` files) and `npm run lint`.

## Style

Self-documenting names over comments. No unicode anywhere in code or docs: no
long dashes, ellipsis characters, arrows or emojis. Unitary commits with concise
messages, no co-author or Claude trailer.
