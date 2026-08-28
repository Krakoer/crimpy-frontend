# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Shell Usage

Always source `~/.zshrc` before running commands.

## Commands

```bash
npm run dev          # dev server (default port 5173, tries next if occupied)
npm run build        # production build
npm run check        # svelte-check type checking (use this instead of tsc --noEmit for .svelte files)
npm run lint         # prettier + eslint check
npm run format       # auto-format with prettier
npm run test:unit    # vitest unit tests for the plain logic modules under src/lib
npm run test:e2e     # playwright e2e tests
```

## Code Style and Documentation

We value code that explains itself through clear class, method, and variable names. Comments may be used when necessary to explain tricky logic, but should otherwise be avoided. Write self-documenting code with descriptive names rather than relying on comments.

Use unitary commits with concise and comprehensive commit messages to make the review easier.

Never use unicode characters such as long dashes, triple dots, arrows or emojis, in the code or in the doc.

## Project Overview

Crimpy is a climbing training platform composed of a flutter app that connects to a BLE force sensor, a Golang backend and a coach web portal. This project is the frontend for the coaching part of the app, which will allow a coach to invite trainees, manage their plannings, see their trainings, give feedback, etc.

## Design

**Alpine design system** — warm, friendly, desktop-first.

Font: Figtree (Google Fonts, loaded in `app.html`). CSS variables defined in `layout.css`:

- Canvas: `--bg: #f5efe6`, panels: `--panel: #fff`, `--panel2: #faf6ef`
- Borders: `--bd: #e8e0d6`, `--bd2: #f0eadf`
- Text: `--tx: #2d241d`, `--tx2: #7a6e62`, `--tx3: #b0a496`
- Primary (terracotta): `--pr: #c2714f`, light: `--pr-lt: #f5e2d7`, fog: `--pr-fog: #fbf1ea`
- Accent: sage `--gn: #6b8f71`, gold `--gd: #d4a15e`, plum `--pl: #907b99`, blue `--bl: #5b7fa6`
- Hangboard editor accent: `--hb: #4a7c8c` (hangboard blocks only, not the training type)
- Radii: `--r: 10px`, `--rs: 8px`, `--rl: 14px`; Shadow: `--sh`

Training type and session activity colors (pill + icon), shared with the app: hangboard `--pr`, climbing `--gd`, stretching `--gn`, workout `--pl`, other `--bl`. The one map is `src/lib/trainingTypes.ts` for trainings and `src/lib/sessions.ts` for logged sessions; do not redeclare it in a page.

Use Tailwind for structural layout (flex, grid, overflow). Use `style` attributes with CSS variables for colors, borders, shadows. No monospace font; no black borders.

**Layout pattern**: all coach-portal pages use `<AppShell title breadcrumbs>` with an optional `{#snippet actions()}` for topbar buttons. AppShell renders the left sidebar + topbar + scrollable content area.

Shared components: `Icon.svelte` (stroke SVG icons), `Sidebar.svelte`, `AppShell.svelte`.

The design guidelines should align with the Crimpy flutter app theme at /home/krakoer/Documents/code/crimpy/crimpy-app/lib/theme/crimpy_theme.dart.

## API

The API swagger is available at https://api.crimpy.app/swagger/doc.json. In dev, the backend runs at `http://127.0.0.1:3000`.

## Architecture

### Stack

SvelteKit 2 + Svelte 5 (runes mode), TypeScript, Tailwind CSS 4, Vite. SSR is disabled (`ssr = false`) on all routes — this is a fully client-side SPA with a node adapter.

### API client (`src/lib/api/client.ts`)

Single `ApiClient` class exported as `apiClient`. All HTTP calls go through the private `request<T>()` method which injects the Bearer token from `localStorage`. All types (interfaces) live in this same file. Add new endpoint methods and their types here.

### Auth

`authStore` (`src/lib/stores/auth.svelte.ts`) is a Svelte 5 runes class with `$state`/`$derived`. Two usage patterns:

- **Pages**: call `authStore.initialize()` in `onMount` to hydrate from localStorage (fast, no network).
- **+page.ts load functions**: call `await authStore.verifyUser()` to validate the token with the server and redirect if invalid. Every protected route's `+page.ts` follows this pattern and returns params through `data`.

### Routing

File-based SvelteKit routing. Every route pair:

- `+page.ts` -- `ssr = false`, auth guard via `authStore.verifyUser()`, returns typed params
- `+page.svelte` -- receives `data` via `$props()`, calls `authStore.initialize()` in `onMount`

Navigation uses `goto()` from `$app/navigation`. Protected pages wrap their content in `AppShell` (from `$lib/components/AppShell.svelte`). The root layout only mounts auth and renders the `<Snackbar>`.

### Snackbar

`snackbar.show(message, type?)` from `src/lib/stores/snackbar.svelte.ts`. Type defaults to `'success'`, pass `'error'` for errors.

### Drag-and-drop (`@dnd-kit/svelte`)

Used in the training editor. Key patterns:

- Wrap the interactive area in `<DragDropProvider sensors={dndSensors} {onDragStart} {onDragOver} {onDragEnd}>`.
- `PointerSensor.configure({ activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })] })` prevents accidental drags on clicks.
- **Source items** (sidebar): `createDraggable({ id })` with `{@attach draggable.attach}`. IDs prefixed with `__new__:<type>:<extraData>` signal "create new" in `onDragEnd`.
- **Sortable items** (reorderable list): `createSortable({ id, group, index })` with `{@attach sortable.attach}`. The `group` field identifies the container (e.g. `'root'` or `'container:<parentId>'`).
- `onDragOver` runs the move with a 200ms debounce timer; `onDragEnd` commits or reverts via snapshot. Check `isSortable(source)` to distinguish sortable vs. draggable sources.
- Existing reusable components: `SidePanelDraggable.svelte` (draggable button), `SortableWrapper.svelte` (sortable div).

### FullCalendar

Lazy-imported inside a `$effect` to avoid SSR issues. Always use the `.fc-crimpy` CSS class on the container div and apply the matching `<style>` overrides (sharp monospace aesthetic). Destroy the calendar instance on cleanup via the effect's return function. See `src/routes/coachees/[id]/+page.svelte` for the canonical pattern.
