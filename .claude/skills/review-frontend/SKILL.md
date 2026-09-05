---
name: review-frontend
description: Architecture, design system and style knowledge for crimpy-frontend (SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind 4). Use when reviewing a PR, branch or diff in crimpy-frontend, and when opening or updating one.
---

# Working on crimpy-frontend

SvelteKit 2 + Svelte 5 in runes mode, TypeScript, Tailwind 4, Vite, node adapter.
This is the coach web portal. **SSR is disabled on every route**: it is a pure
client-side SPA. Read `crimpy-frontend/.claude/CLAUDE.md` for commands; this file
is what to check in a diff, and what a PR out of this repo owes its reviewer.

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

- `<DragDropProvider sensors={dndSensors} {onDragStart} {onDragOver} {onDragEnd}>`,
  with `dndSensors` imported from `$lib/dnd-sensors`. A route that builds its own
  sensor list is a finding, on the grounds of three copies drifting apart, not on
  correctness: `DragDropProvider` constructs its manager with dnd-kit's defaults
  before assigning the prop, so the keyboard sensor is bound either way. Do not
  report a missing `KeyboardSensor` as switching keyboard dragging off. It does
  not.
- Source items: `createDraggable({ id })` with `{@attach draggable.attach}`; ids
  built with `newItemId()` from `$lib/dnd-new-item` mean "create new" on drop. A
  hand written `'__new__:'` literal or a `slice(8)` is a finding.
- Sortable items: `createSortable({ id, group, index })`, group is `'root'` or
  `'container:<parentId>'`.
- `onDragOver` moves, guarded by `createDragOverLatch()`; `onDragEnd` commits or
  reverts from a snapshot. Use `isSortable(source)` to tell the two source kinds
  apart. Handlers live in `*-drag-handlers.svelte.ts`, not inline in a route.
- Because the move runs on drag over, a week or a list the pointer merely crossed
  has already been changed and flagged by the time the drag ends. Whatever
  decides "was this really edited" has to be settled against the drag-start
  snapshot, not accumulated per move.
- **`tabindex` on a drag activator is a finding.** dnd-kit sets `tabindex="0"`, a
  role and `aria-roledescription` on any activator that carries none, and that is
  what puts a drag within reach of a keyboard. A hand written `tabindex="-1"` on
  a drag handle stops it doing so and quietly makes the drag pointer-only, which
  no test using `.focus()` will catch: focus works on a `tabindex="-1"` element,
  tabbing to it does not. A keyboard drag spec has to reach the handle by Tab.
- Enter and Space on a drag source belong to the keyboard sensor, which binds on
  the element, while Svelte delegates plain `onkeydown` to the root. A source
  that also acts on click has to take them back with `onkeydowncapture` and
  `preventDefault`, or its own key handler is dead code.
- Turning a target off means the `disabled` option of `createSortable` or
  `createDroppable`. A `pointer-events: none` on a wrapper is a finding: it takes
  down every control inside the card, and dnd-kit already refuses to start a drag
  from a disabled source. A prop named `disabled` that only reaches the styles is
  the same finding.
- What a container accepts lives in `container-rules.ts` and nowhere else. A drag
  rule that restates the click rule in its own vocabulary is a finding: the two
  drift, and then the palette refuses what a drop allows.
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

## Screenshots on every PR

Every PR that changes something a coach can see ships a screenshot, posted as a
comment on the PR. A reviewer should not have to check the branch out to see what
it looks like, and the Alpine rules above are visual: a hardcoded colour or a
broken card is far easier to catch in an image than in a diff. A PR that changes
the UI and shows no screenshot is itself a finding.

Drive the real app with the Playwright MCP. Do not hand-draw a mockup, and do not
screenshot a page you assembled only out of stubs when a backend could have served
it.

**Point the app at the local backend.** `devapi.crimpy.app` runs behind `dev` and
has repeatedly lacked the columns a branch depends on, which makes it useless for
screenshotting new work. Check what it actually returns before trusting it. The
local API on `:3000` is the one that runs current `dev`:

    PUBLIC_API_URL=http://127.0.0.1:3000 npm run dev

`/config.json` is served by `src/routes/config.json/+server.ts` out of
`$env/dynamic/public`, so that variable wins over `.env` and nothing in the
working tree has to be edited. The seeded local accounts are `coach@local.com`
and `local@local.com`, both with password `coucou`.

**Create the data the feature needs, through the API.** The local database is
seeded from before most features existed, so the row that shows a change off
usually is not there. POST it with curl as the account that would really own it,
the way the app does, rather than editing Postgres by hand: the write path is
what fills in the derived columns the screen reads, and going around it produces
a screenshot of something the app cannot actually produce.

**Only when no backend can serve it**, stub the API the way `tests/fixtures.ts`
does: `page.route()` on the API origin, plus an `addInitScript` seeding
`auth_token`, `refresh_token` and `user` into localStorage. Say in the comment
that the data is stubbed, so nobody reads it as real.

**Capturing.** A modal, or any panel with its own `overflow-y: auto`, clips an
element screenshot at its scroll box. Unclip it in the page before shooting:

    panel.style.maxHeight = 'none';
    scroller.style.overflow = 'visible';

and say so in the comment, since the real screen still scrolls there.

**Hosting.** GitHub has no API that attaches an image to a comment. The repo is
public, so push the file to a branch of its own and link the raw URL. Keep it off
the PR branch, or the screenshot merges into `dev`:

    BLOB=$(git hash-object -w shot.png)
    TREE=$(printf '100644 blob %s\tshot.png\n' "$BLOB" | git mktree)
    COMMIT=$(git commit-tree "$TREE" -m "Screenshot for card NN")
    REF='refs/heads/assets/NN-screenshot'
    git push origin "$COMMIT":"$REF"

Plumbing rather than a checkout, so the working tree is never touched. Keep the
refspec in its own variable: in zsh `"$COMMIT:refs/heads/..."` silently loses the
`:r` to modifier syntax and the push fails. Then link
`https://raw.githubusercontent.com/Krakoer/crimpy-frontend/<branch>/<file>` from
the comment. That branch has to stay: deleting it breaks the image.

## Style

Self-documenting names over comments. No unicode anywhere in code or docs: no
long dashes, ellipsis characters, arrows or emojis. Unitary commits with concise
messages, no co-author or Claude trailer.
