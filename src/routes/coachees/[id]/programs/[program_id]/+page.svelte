<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { mondayOf } from '$lib/date';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
	import { isSortable } from '@dnd-kit/svelte/sortable';
	import { PointerActivationConstraints } from '@dnd-kit/dom';
	import SidePanelDraggable from '$lib/components/training/SidePanelDraggable.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import DroppableCell from '$lib/components/program/DroppableCell.svelte';
	import SortableSession from '$lib/components/program/SortableSession.svelte';
	import PlayedSessionMarker from '$lib/components/program/PlayedSessionMarker.svelte';
	import WeekPerformedSessions from '$lib/components/program/WeekPerformedSessions.svelte';
	import SessionDetailModal from '$lib/components/session/SessionDetailModal.svelte';
	import AssessmentsModal from '$lib/components/assessment/AssessmentsModal.svelte';
	import type {
		AssessmentResponse,
		Program,
		ProgramRequest,
		SessionResponse,
		WeekSummary,
		WeekDetail,
		SessionRequest,
		TrainingItem,
		TrainingSummary
	} from '$lib/api/client';
	import {
		cellID,
		cellSessions,
		draftSessions,
		duplicatedDraftSession,
		emptyDraft,
		moveSession,
		parseCell,
		restoreWeekSessions,
		sessionForCell,
		snapshotWeekSessions,
		type DaySession,
		type DraftSession,
		type EverydaySession,
		type FreqSession,
		type SessionDrop,
		type WeekDraft,
		type WeekDrafts,
		type WeekSessionsSnapshot
	} from '$lib/program-draft';
	import { sessionsByProgramSession, sessionsOfWeek } from '$lib/program-performance';
	import { withCoachReply } from '$lib/sessions';
	import { assessmentLabel, missingAssessments } from '$lib/assessments';
	import { assessmentCatalog } from '$lib/stores/assessmentCatalog.svelte';
	import { TRAINING_TYPES, TRAINING_TYPE_INFO, trainingTypeInfo } from '$lib/trainingTypes';

	let { data } = $props();
	const userId = $derived(data.userId as string);
	const programId = $derived(data.programId as string);

	// Only used when a training is dropped onto the program, so this is where the
	// coach is told about assessments the coachee is missing.
	function newDraftSession(trainingId: string): DraftSession {
		warnAboutMissingAssessments(trainingId);
		return { _id: crypto.randomUUID(), training_id: trainingId, overrides: [] };
	}

	// A training can prescribe loads or durations as a percentage of an
	// assessment result. The coachee only gets the coach fallback until they have
	// done that assessment, which is worth saying out loud when the training
	// lands on their program.
	async function warnAboutMissingAssessments(trainingId: string) {
		let items = trainingItemsById.get(trainingId);
		if (!items) {
			try {
				items = (await apiClient.getTraining(trainingId)).items ?? [];
			} catch {
				return;
			}
			trainingItemsById.set(trainingId, items);
		}
		const missing = missingAssessments(items, coacheeAssessments);
		if (missing.length === 0) return;
		const names = missing.map((id) => assessmentLabel(id, assessmentCatalog.catalog)).join(', ');
		snackbar.show(
			`${coacheeName} has not done ${names} yet, so the fallback values of this training will be used.`,
			'warning'
		);
	}

	function weekDetailToDraft(detail: WeekDetail, wn: number): WeekDraft {
		const days: DaySession[][] = Array.from({ length: 7 }, () => []);
		const freqSessions: FreqSession[] = [];
		const everydaySessions: EverydaySession[] = [];
		// Sorted rather than taken as they arrive: position is what the server
		// stores the order in, and reading it here keeps the cells in the order the
		// coach arranged them whatever order the rows come back in.
		const ordered = [...detail.sessions].sort((a, b) => a.position - b.position);
		for (const s of ordered) {
			const preserved = {
				_id: crypto.randomUUID(),
				id: s.id,
				originWn: wn,
				training_id: s.training_id,
				notes: s.notes,
				locked: s.is_locked,
				overrides: s.overrides ?? []
			};
			if (s.is_everyday) {
				everydaySessions.push(preserved);
			} else if (s.day_of_week !== undefined) {
				days[s.day_of_week].push(preserved);
			} else if (s.times_per_week !== undefined) {
				freqSessions.push({ ...preserved, times_per_week: s.times_per_week });
			}
		}
		return {
			notes: detail.notes ?? '',
			days,
			freqSessions,
			everydaySessions,
			dirty: false,
			saving: false,
			saveError: '',
			deleteConfirm: false,
			deleting: false
		};
	}

	// A session only carries its id back when it is being saved into the week that
	// row belongs to. Anywhere else it is a new row, and sending the id would ask
	// the server to move a row between weeks, which it refuses.
	function savedID(session: DraftSession, wn: number): string | undefined {
		return session.originWn === wn ? session.id : undefined;
	}

	function draftToSessionRequests(draft: WeekDraft, wn: number): SessionRequest[] {
		const reqs: SessionRequest[] = [];
		for (let day = 0; day < 7; day++) {
			for (const s of draft.days[day]) {
				reqs.push({
					id: savedID(s, wn),
					training_id: s.training_id,
					day_of_week: day,
					notes: s.notes,
					overrides: s.overrides
				});
			}
		}
		for (const s of draft.freqSessions) {
			reqs.push({
				id: savedID(s, wn),
				training_id: s.training_id,
				times_per_week: s.times_per_week,
				notes: s.notes,
				overrides: s.overrides
			});
		}
		for (const s of draft.everydaySessions) {
			reqs.push({
				id: savedID(s, wn),
				training_id: s.training_id,
				is_everyday: true,
				notes: s.notes,
				overrides: s.overrides
			});
		}
		return reqs;
	}

	let program = $state<Program | null>(null);
	let coacheeName = $state('Coachee');
	let loading = $state(true);
	let error = $state('');
	let editMode = $state(false);
	let editing = $state(false);
	let editName = $state('');
	let editObjective = $state('');
	let editStartDate = $state('');
	let editDurationWeeks = $state<number | null>(null);
	let saving = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);

	let weeks = $state<WeekSummary[]>([]);
	let weekDrafts = $state<WeekDrafts>({});

	let expandedWeeks = $state<Set<number>>(new Set());

	$effect(() => {
		for (const n of weekNumbers()) {
			if (!weekDrafts[n]) weekDrafts[n] = emptyDraft();
		}
	});

	let trainings = $state<TrainingSummary[]>([]);
	let coacheeAssessments = $state<AssessmentResponse[]>([]);
	let showAssessments = $state(false);

	// What the coachee actually did, so the coach editing the weeks ahead can
	// read the load that was missed and the note left after a painful run
	// without leaving the program.
	let playedSessions = $state<SessionResponse[]>([]);
	let openedSession = $state<SessionResponse | null>(null);
	const playedByProgramSession = $derived(sessionsByProgramSession(playedSessions));

	function playedFor(session: DraftSession): SessionResponse[] {
		return session.id ? (playedByProgramSession.get(session.id) ?? []) : [];
	}

	function applyReply(updated: SessionResponse) {
		playedSessions = withCoachReply(playedSessions, updated);
		if (openedSession?.id === updated.id) {
			openedSession = playedSessions.find((s) => s.id === updated.id) ?? openedSession;
		}
	}

	const trainingItemsById = new Map<string, TrainingItem[]>();
	let trainingSearch = $state('');
	let trainingTypeFilter = $state<string>('all');
	let filteredTrainings = $derived(
		trainings.filter((t) => {
			if (trainingTypeFilter !== 'all' && t.training_type !== trainingTypeFilter) return false;
			if (!trainingSearch.trim()) return true;
			return t.title.toLowerCase().includes(trainingSearch.trim().toLowerCase());
		})
	);

	const isDirty = $derived(Object.values(weekDrafts).some((d) => d.dirty));
	const isSaving = $derived(Object.values(weekDrafts).some((d) => d.saving));

	let leavingAfterDelete = $state(false);

	const detailsDirty = $derived(
		editing &&
			program !== null &&
			(editName !== program.name ||
				editObjective !== (program.objective ?? '') ||
				editStartDate !== program.start_date ||
				editDurationWeeks !== (program.duration_weeks ?? null))
	);

	const guardDirty = $derived(!leavingAfterDelete && (isDirty || detailsDirty));

	let dupModalSourceWn = $state<number | null>(null);

	const dndSensors = [
		PointerSensor.configure({
			activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })]
		})
	];

	// The cell a drop lands in and the index inside it. A sortable target is one
	// of the sessions, so the drop takes its place; anything else is the cell
	// itself and the session goes to the end.
	function dropTarget(target: unknown): SessionDrop | null {
		const id = String((target as { id: string }).id);
		if (isSortable(target as never)) {
			const sortable = target as { id: string; group?: string; index: number };
			const cell = parseCell(String(sortable.group ?? ''));
			return cell ? { cell, overSessionID: id, index: sortable.index } : null;
		}
		const cell = parseCell(id);
		return cell ? { cell, overSessionID: null, index: Infinity } : null;
	}

	// The week holding this session when it is locked, null when it is free to move.
	function lockedSessionWeek(sessionId: string): number | null {
		for (const wnStr of Object.keys(weekDrafts)) {
			const wn = parseInt(wnStr);
			const session = draftSessions(weekDrafts[wn]).find((s) => s._id === sessionId);
			if (session) return session.locked ? wn : null;
		}
		return null;
	}

	// Reordering happens while the pointer moves, so the cells show the result
	// before the drop. The cooldown stops a hovered pair from swapping back and
	// forth every frame once the move has put the pointer over the other one.
	const SWAP_COOLDOWN_MS = 200;
	let lastSwapKey = '';
	let lastSwapTime = 0;
	let sessionsSnapshot: WeekSessionsSnapshot | null = null;

	function onDragStart() {
		lastSwapKey = '';
		lastSwapTime = 0;
		sessionsSnapshot = snapshotWeekSessions(
			weekDrafts,
			(value) => $state.snapshot(value) as typeof value
		);
	}

	function onDragOver(event: { operation: { source: unknown; target: unknown } }) {
		const { source, target } = event.operation;
		if (!editMode || !source || !target) return;
		// A training dragged out of the library has nothing to move yet: it is
		// created on drop.
		if (!isSortable(source as never)) return;

		const sourceId = String((source as { id: string }).id);
		const drop = dropTarget(target);
		if (!drop) return;

		// Rescheduling a played session is fine, moving it to another week is not:
		// it would drop the row out of the week it was prescribed in.
		const lockedWn = lockedSessionWeek(sourceId);
		if (lockedWn !== null && lockedWn !== drop.cell.wn) return;

		const swapKey = `${sourceId}:${drop.overSessionID ?? cellID(drop.cell)}`;
		const now = Date.now();
		if (swapKey === lastSwapKey && now - lastSwapTime < SWAP_COOLDOWN_MS) return;
		moveSession(weekDrafts, sourceId, drop);
		lastSwapKey = swapKey;
		lastSwapTime = now;
	}

	function onDragEnd(event: {
		canceled: boolean;
		operation: { source: unknown; target: unknown };
	}) {
		const snapshot = sessionsSnapshot;
		sessionsSnapshot = null;

		const source = event.operation.source;
		const target = event.operation.target;
		if (event.canceled || !editMode) {
			if (snapshot) restoreWeekSessions(weekDrafts, snapshot);
			return;
		}
		if (!source || !target) return;

		const sourceId = String((source as { id: string }).id);
		const drop = dropTarget(target);
		if (!drop) return;

		if (sourceId.startsWith('__new__:')) {
			const trainingId = sourceId.slice(8);
			const sessions = cellSessions(weekDrafts, drop.cell);
			sessions.splice(
				Math.min(drop.index, sessions.length),
				0,
				sessionForCell(newDraftSession(trainingId), drop.cell)
			);
			weekDrafts[drop.cell.wn].dirty = true;
			return;
		}

		// The move itself already happened on drag over. What is left is telling
		// the coach why a played session refused to follow the pointer.
		const lockedWn = lockedSessionWeek(sourceId);
		if (lockedWn !== null && lockedWn !== drop.cell.wn) {
			snackbar.show(LOCKED_SESSION_MOVE_REASON, 'warning');
		}
	}

	function hasLockedSessions(draft: WeekDraft | undefined): boolean {
		return draft ? draftSessions(draft).some((s) => s.locked) : false;
	}

	const LOCKED_SESSION_REASON =
		'This session has already been played, so its training and its overrides cannot be changed and it cannot be removed from the week.';

	// Its day, its frequency and its order say when it happens, not what was
	// prescribed, so those stay editable. Leaving the week does not: that drops
	// the row the played session points at.
	const LOCKED_SESSION_MOVE_REASON =
		'This session has already been played, so it can only be moved inside its own week.';

	function removeSession(wn: number, sessionId: string) {
		const draft = weekDrafts[wn];
		if (!draft) return;
		if (draftSessions(draft).some((s) => s._id === sessionId && s.locked)) {
			snackbar.show(LOCKED_SESSION_REASON, 'warning');
			return;
		}
		for (let day = 0; day < 7; day++) {
			const idx = draft.days[day].findIndex((s) => s._id === sessionId);
			if (idx !== -1) {
				draft.days[day].splice(idx, 1);
				draft.dirty = true;
				return;
			}
		}
		const freqIdx = draft.freqSessions.findIndex((s) => s._id === sessionId);
		if (freqIdx !== -1) {
			draft.freqSessions.splice(freqIdx, 1);
			draft.dirty = true;
			return;
		}
		const everydayIdx = draft.everydaySessions.findIndex((s) => s._id === sessionId);
		if (everydayIdx !== -1) {
			draft.everydaySessions.splice(everydayIdx, 1);
			draft.dirty = true;
		}
	}

	// The server refuses an id it no longer holds, which happens when the week was
	// rebuilt somewhere else while this draft was open. Dropping the stale ids
	// lets the coach save the edits they still have on screen as new rows,
	// instead of retrying the same rejected payload until they reload the page.
	// A played session keeps its id: resending it without one reads as a removal
	// to the server, which refuses it and leaves the week unsaveable.
	function forgetSessionIDs(draft: WeekDraft) {
		for (const session of [
			...draft.days.flat(),
			...draft.freqSessions,
			...draft.everydaySessions
		]) {
			if (session.locked) continue;
			session.id = undefined;
			session.originWn = undefined;
		}
	}

	async function saveWeek(wn: number) {
		const draft = weekDrafts[wn];
		if (!draft) return;
		draft.saving = true;
		draft.saveError = '';
		try {
			const detail = await apiClient.upsertWeek(userId, programId, wn, {
				notes: draft.notes.trim() || undefined,
				sessions: draftToSessionRequests(draft, wn)
			});
			weekDrafts[wn] = weekDetailToDraft(detail, wn);
			// Ctrl+S fires during a drag, and what comes back carries fresh local
			// keys and the ids the server just assigned. Cancelling the drag after
			// that must not put the pre-save arrays back on top of them.
			sessionsSnapshot = null;
			if (!weeks.some((w) => w.week_number === wn)) {
				weeks.push({
					id: detail.id,
					program_id: detail.program_id,
					week_number: wn,
					notes: detail.notes,
					created_at: detail.created_at,
					updated_at: detail.updated_at
				});
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to save.';
			weekDrafts[wn].saving = false;
			if (message.includes('does not belong to this week')) {
				forgetSessionIDs(weekDrafts[wn]);
				weekDrafts[wn].saveError =
					'This week was changed somewhere else. Your edits are still here, save again to apply them.';
				snackbar.show(
					'This week was changed somewhere else, so it could not be saved on top. Save again to apply your edits as new sessions.',
					'warning'
				);
			} else {
				weekDrafts[wn].saveError = message;
			}
			throw e;
		}
	}

	async function saveAllProgram() {
		const dirtyWns = Object.entries(weekDrafts)
			.filter(([, d]) => d.dirty)
			.map(([n]) => parseInt(n));
		if (dirtyWns.length === 0) return;
		try {
			await Promise.all(dirtyWns.map((n) => saveWeek(n)));
			snackbar.show('Program saved');
		} catch {
			snackbar.show('Some weeks failed to save', 'error');
		}
	}

	// A duplicate replaces the target week with id-less copies, so a played
	// session in that week would lose its row.
	function executeDuplicate(sourceWn: number, targetWn: number) {
		const src = weekDrafts[sourceWn];
		if (!src) return;
		if (hasLockedSessions(weekDrafts[targetWn])) {
			snackbar.show(
				`Week ${targetWn} holds sessions already played, so it cannot be replaced.`,
				'warning'
			);
			return;
		}
		if (!weekDrafts[targetWn]) weekDrafts[targetWn] = emptyDraft();
		weekDrafts[targetWn] = {
			...weekDrafts[targetWn],
			notes: src.notes,
			days: src.days.map((d) => d.map(duplicatedDraftSession)),
			freqSessions: src.freqSessions.map(duplicatedDraftSession),
			everydaySessions: src.everydaySessions.map(duplicatedDraftSession),
			dirty: true
		};
		dupModalSourceWn = null;
		snackbar.show(`Week ${sourceWn} duplicated to week ${targetWn}`);
	}

	const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const TRAINING_FILTERS: { id: string; label: string }[] = [
		{ id: 'all', label: 'All' },
		...TRAINING_TYPES.map((type) => ({ id: type as string, label: TRAINING_TYPE_INFO[type].label }))
	];

	function trainingById(id: string): TrainingSummary | undefined {
		return trainings.find((t) => t.id === id);
	}

	function trainingColor(id: string): string {
		return trainingTypeInfo(trainingById(id)?.training_type).color;
	}

	function trainingTint(id: string): string {
		return trainingTypeInfo(trainingById(id)?.training_type).tint;
	}

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function weekNumbers(): number[] {
		if (program?.duration_weeks) {
			return Array.from({ length: program.duration_weeks }, (_, i) => i + 1);
		}
		const max = weeks.length ? Math.max(...weeks.map((w) => w.week_number)) : 0;
		return Array.from({ length: max + 1 }, (_, i) => i + 1);
	}

	function weekDateRange(weekNum: number): string {
		if (!program) return '';
		const start = new Date(program.start_date);
		start.setDate(start.getDate() + (weekNum - 1) * 7);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
		return `${fmt(start)} - ${fmt(end)}`;
	}

	function startEdit() {
		if (!program) return;
		editName = program.name;
		editObjective = program.objective ?? '';
		editStartDate = program.start_date;
		editDurationWeeks = program.duration_weeks ?? null;
		editing = true;
	}

	async function saveEdit() {
		if (!program || !editName.trim() || !editStartDate) return;
		saving = true;
		try {
			const req: ProgramRequest = {
				name: editName.trim(),
				start_date: mondayOf(editStartDate),
				objective: editObjective.trim() || undefined,
				duration_weeks: editDurationWeeks || undefined
			};
			program = await apiClient.updateProgram(userId, programId, req);
			editing = false;
			snackbar.show('Program saved');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save.';
		} finally {
			saving = false;
		}
	}

	async function handleDeleteProgram() {
		deleting = true;
		try {
			await apiClient.deleteProgram(userId, programId);
			snackbar.show('Program deleted');
			leavingAfterDelete = true;
			goto(`/coachees/${userId}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete program.';
		} finally {
			deleting = false;
		}
	}

	function toggleWeek(wn: number) {
		const next = new Set(expandedWeeks);
		if (next.has(wn)) next.delete(wn);
		else next.add(wn);
		expandedWeeks = next;
	}

	function expandAll() {
		expandedWeeks = new Set(weekNumbers());
	}

	function collapseAll() {
		expandedWeeks = new Set();
	}

	// Played sessions survive a clear: dropping them would null the link they
	// carry, which is exactly what the freeze is there to prevent.
	function clearWeek(wn: number) {
		const draft = weekDrafts[wn];
		if (!draft) return;
		const kept = hasLockedSessions(draft);
		weekDrafts[wn] = {
			...draft,
			days: draft.days.map((day) => day.filter((s) => s.locked)),
			freqSessions: draft.freqSessions.filter((s) => s.locked),
			everydaySessions: draft.everydaySessions.filter((s) => s.locked),
			notes: '',
			dirty: true,
			deleteConfirm: false
		};
		if (kept) {
			snackbar.show('Sessions already played were kept, they can no longer be removed.', 'warning');
		}
	}

	const computedCurrentWeek = $derived.by(() => {
		if (!program) return 1;
		const diffMs = Date.now() - new Date(program.start_date).getTime();
		if (diffMs < 0) return 1;
		const week = Math.max(1, Math.ceil(diffMs / (7 * 86400000)));
		return program.duration_weeks ? Math.min(week, program.duration_weeks) : week;
	});

	const isProgramUpcoming = $derived(
		program ? Date.now() < new Date(program.start_date).getTime() : false
	);

	const isProgramCompleted = $derived(
		program?.duration_weeks
			? computedCurrentWeek >= program.duration_weeks &&
					Date.now() > new Date(program.start_date).getTime()
			: false
	);

	const totalSessions = $derived(
		Object.values(weekDrafts).reduce(
			(sum, d) =>
				sum +
				d.days.reduce((s, day) => s + day.length, 0) +
				d.freqSessions.reduce((s, f) => s + f.times_per_week, 0) +
				d.everydaySessions.length * 7,
			0
		)
	);

	onMount(async () => {
		authStore.initialize();
		apiClient
			.getEnrollments()
			.then((enrollments) => {
				const found = enrollments.find((e) => e.user_id === userId);
				if (found) coacheeName = `${found.user_firstname} ${found.user_lastname}`;
			})
			.catch(() => {});
		apiClient
			.getClientAssessments(userId)
			.then((a) => (coacheeAssessments = a ?? []))
			.catch(() => {});
		// Beside the program rather than in it: a run played off program still
		// says how the week went, and a week the coach never opens costs nothing.
		apiClient
			.getClientSessions(userId)
			.then((sessions) => (playedSessions = sessions ?? []))
			.catch(() => {});
		// The catalog names an assessment the coachee has never done, which has no
		// result row to take a label from.
		assessmentCatalog.load();
		loading = true;
		try {
			const [p, w, t] = await Promise.all([
				apiClient.getProgram(userId, programId),
				apiClient.listWeeks(userId, programId),
				apiClient.getTrainings()
			]);
			program = p;
			weeks = w;
			trainings = t;

			const maxWn = p.duration_weeks ?? (w.length ? Math.max(...w.map((ws) => ws.week_number)) : 0);
			const allDrafts: WeekDrafts = {};
			for (let n = 1; n <= maxWn; n++) allDrafts[n] = emptyDraft();

			if (w.length > 0) {
				const details = await Promise.all(
					w.map((ws) => apiClient.getWeek(userId, programId, ws.week_number))
				);
				for (const d of details) allDrafts[d.week_number] = weekDetailToDraft(d, d.week_number);
			}
			weekDrafts = allDrafts;

			// Open the current week by default
			const currentWn = Math.max(
				1,
				Math.min(
					Math.ceil((Date.now() - new Date(p.start_date).getTime()) / (7 * 86400000)),
					p.duration_weeks ?? 999
				)
			);
			expandedWeeks = new Set([currentWn]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load program.';
		} finally {
			loading = false;
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === 's' && editMode && isDirty && !isSaving) {
			e.preventDefault();
			saveAllProgram();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<AppShell
	title={program?.name ?? 'Program'}
	breadcrumbs={[
		{ label: 'Studio' },
		{ label: 'Coachees', href: '/coachees' },
		{ label: coacheeName, href: `/coachees/${userId}` },
		{ label: program?.name ?? 'Program' }
	]}
>
	{#snippet actions()}
		<button
			onclick={() => goto(`/coachees/${userId}`)}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 6px 12px; border-radius: var(--rs);
				background: #fff; color: var(--tx); border: 1px solid var(--bd);
				font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
			"
		>
			<Icon name="arrow-left" size={14} color="var(--tx2)" />
			Back to coachee
		</button>
		<button
			onclick={() => (showAssessments = true)}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 6px 12px; border-radius: var(--rs);
				background: #fff; color: var(--tx); border: 1px solid var(--bd);
				font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
			"
		>
			<Icon name="spark" size={14} color="var(--pl)" />
			Assessments
			{#if coacheeAssessments.length > 0}
				<span style="font-size: 11px; color: var(--tx3); font-weight: 600;"
					>{coacheeAssessments.length}</span
				>
			{/if}
		</button>
		{#if editMode}
			{#if !confirmDelete}
				<button
					onclick={() => (confirmDelete = true)}
					style="
						display: inline-flex; align-items: center; gap: 6px;
						padding: 6px 12px; border-radius: var(--rs);
						background: #fff; color: var(--rd); border: 1px solid rgba(194,107,107,0.3);
						font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
					"
				>
					<Icon name="trash" size={13} color="var(--rd)" />
					Delete
				</button>
			{:else}
				<button
					onclick={handleDeleteProgram}
					disabled={deleting}
					style="
						padding: 6px 12px; border-radius: var(--rs);
						border: 1px solid var(--rd); color: var(--rd);
						background: #fff5f5; font-size: 12.5px; font-weight: 600;
						cursor: pointer; font-family: var(--font);
					">{deleting ? '...' : 'Confirm delete'}</button
				>
				<button
					onclick={() => (confirmDelete = false)}
					style="
						padding: 6px 12px; border-radius: var(--rs);
						border: 1px solid var(--bd); color: var(--tx);
						background: #fff; font-size: 12.5px; font-weight: 600;
						cursor: pointer; font-family: var(--font);
					">Cancel</button
				>
			{/if}
			<button
				onclick={saveAllProgram}
				disabled={!isDirty || isSaving}
				style="
					display: inline-flex; align-items: center; gap: 6px;
					padding: 6px 14px; border-radius: var(--rs);
					background: {isDirty ? 'var(--pr)' : '#fff'};
					color: {isDirty ? '#fff' : 'var(--tx3)'};
					border: 1px solid {isDirty ? 'var(--pr)' : 'var(--bd)'};
					font-size: 12.5px; font-weight: 600; cursor: {isDirty ? 'pointer' : 'default'};
					font-family: var(--font); transition: all 0.15s;
				"
			>
				<Icon name="check" size={13} color={isDirty ? '#fff' : 'var(--tx3)'} />
				{isSaving ? 'Saving...' : isDirty ? 'Save program' : 'Saved'}
			</button>
		{:else}
			<button
				onclick={() => (editMode = true)}
				style="
					display: inline-flex; align-items: center; gap: 6px;
					padding: 6px 14px; border-radius: var(--rs);
					background: var(--pr); color: #fff; border: 1px solid var(--pr);
					font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
				"
			>
				<Icon name="edit" size={13} color="#fff" />
				Edit
			</button>
		{/if}
	{/snippet}

	{#if error}
		<div style="padding: 16px 24px;">
			<div
				style="padding: 14px 18px; border-radius: var(--rs); background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; font-size: 13px;"
			>
				{error}
			</div>
		</div>
	{/if}

	{#if loading}
		<div style="display: flex; align-items: center; gap: 10px; padding: 40px 24px;">
			<div
				class="animate-spin"
				style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%;"
			></div>
			<span style="font-size: 13px; color: var(--tx2);">Loading...</span>
		</div>
	{:else if program}
		<!-- Compact meta bar -->
		<div style="padding: 0 24px;">
			{#if editing}
				<div
					style="
					background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
					box-shadow: var(--sh); padding: 18px 20px; margin-bottom: 14px;
				"
				>
					<div
						style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 12px;"
					>
						Edit program
					</div>
					<div
						style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 0.7fr; gap: 12px; margin-bottom: 14px;"
					>
						<div>
							<label
								for="edit-program-name"
								style="font-size: 11px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 4px;"
								>Name</label
							>
							<input
								id="edit-program-name"
								bind:value={editName}
								style="width: 100%; padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 14px; font-weight: 600; color: var(--tx); outline: none; background: #fff;"
							/>
						</div>
						<div>
							<label
								for="edit-program-objective"
								style="font-size: 11px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 4px;"
								>Objective</label
							>
							<input
								id="edit-program-objective"
								bind:value={editObjective}
								placeholder="Goal..."
								style="width: 100%; padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
							/>
						</div>
						<div>
							<label
								for="edit-program-start-date"
								style="font-size: 11px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 4px;"
								>Start date</label
							>
							<input
								type="date"
								id="edit-program-start-date"
								bind:value={editStartDate}
								style="width: 100%; padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
							/>
						</div>
						<div>
							<label
								for="edit-program-weeks"
								style="font-size: 11px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 4px;"
								>Weeks</label
							>
							<input
								type="number"
								id="edit-program-weeks"
								bind:value={editDurationWeeks}
								min="1"
								style="width: 100%; padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
							/>
						</div>
					</div>
					<div style="display: flex; gap: 8px;">
						<button
							onclick={saveEdit}
							disabled={saving}
							style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: var(--rs); background: var(--pr); color: #fff; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font); opacity: {saving
								? 0.7
								: 1};"
						>
							<Icon name="check" size={13} color="#fff" />
							{saving ? 'Saving...' : 'Done'}
						</button>
						<button
							onclick={() => (editing = false)}
							style="padding: 7px 14px; border-radius: var(--rs); border: 1px solid var(--bd); background: #fff; color: var(--tx); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);"
							>Cancel</button
						>
					</div>
				</div>
			{:else}
				<div
					style="display: flex; align-items: center; gap: 12px; padding: 8px 0; margin-bottom: 10px;"
				>
					{#if isProgramUpcoming}
						<span
							style="
							display: inline-flex; padding: 2px 9px; border-radius: 999px;
							font-size: 11.5px; font-weight: 600; background: var(--pr-fog); color: var(--pr);
						">Upcoming</span
						>
					{:else if isProgramCompleted}
						<span
							style="
							display: inline-flex; padding: 2px 9px; border-radius: 999px;
							font-size: 11.5px; font-weight: 600; background: var(--bd2); color: var(--tx3);
						">Completed · {program.duration_weeks} weeks</span
						>
					{:else}
						<span
							style="
							display: inline-flex; padding: 2px 9px; border-radius: 999px;
							font-size: 11.5px; font-weight: 600; background: #e3ede4; color: var(--gn);
						">Week {computedCurrentWeek}{program.duration_weeks ? ` of ${program.duration_weeks}` : ''}</span
						>
					{/if}
					{#if program.objective}
						<span style="font-size: 12.5px; color: var(--tx2);">{program.objective}</span>
						<span style="font-size: 12px; color: var(--tx3);">·</span>
					{/if}
					<span style="font-size: 12px; color: var(--tx3);"
						>Started {formatDate(program.start_date)}</span
					>
					<div style="flex: 1;"></div>
					{#if editMode}
						<button
							onclick={startEdit}
							style="font-size: 12px; color: var(--pr); font-weight: 600; background: none; border: none; cursor: pointer; font-family: var(--font);"
							>Edit details</button
						>
					{/if}
				</div>
			{/if}
		</div>

		<!-- DragDropProvider wraps week grid + right rail so SidePanelDraggable has context -->
		<DragDropProvider sensors={dndSensors} {onDragStart} {onDragOver} {onDragEnd}>
			<div style="display: flex; align-items: flex-start;">
				<div style="flex: 1; min-width: 0; padding: 16px 24px 40px;">
					<div style="display: flex; flex-direction: column; gap: 6px;">
						<!-- Sticky column headers -->
						<div
							style="
						display: grid; grid-template-columns: 128px repeat(7, 1fr) 130px 130px;
						position: sticky; top: 0; z-index: 10;
						background: var(--bg); padding-bottom: 2px;
					"
						>
							<div
								style="font-size: 11px; color: var(--tx3); font-weight: 600; padding: 8px 10px; display: flex; align-items: center; gap: 8px;"
							>
								WEEK
								<span style="display: flex; gap: 4px;">
									<button
										onclick={expandAll}
										title="Expand all"
										style="background: none; border: none; cursor: pointer; font-size: 10px; color: var(--pr); padding: 0;"
										>+</button
									>
									<button
										onclick={collapseAll}
										title="Collapse all"
										style="background: none; border: none; cursor: pointer; font-size: 10px; color: var(--tx3); padding: 0;"
										>-</button
									>
								</span>
							</div>
							{#each DAY_LABELS as d (d)}
								<div
									style="font-size: 10.5px; color: var(--tx3); font-weight: 600; text-align: center; padding: 8px 0; letter-spacing: 0.06em;"
								>
									{d}
								</div>
							{/each}
							<div
								style="font-size: 10.5px; color: var(--tx3); font-weight: 600; text-align: center; padding: 8px 0; letter-spacing: 0.06em;"
								title="Flexible -- assigned per week, not pinned to a day"
							>
								/WK
							</div>
							<div
								style="font-size: 10.5px; color: var(--pl); font-weight: 600; text-align: center; padding: 8px 0; letter-spacing: 0.06em;"
								title="Every day of the week"
							>
								DAILY
							</div>
						</div>

						<!-- Week rows -->
						{#each weekNumbers() as wn (wn)}
							{@const draft = weekDrafts[wn]}
							{#if draft}
								{@const isCurrent = wn === computedCurrentWeek}
								{@const expanded = expandedWeeks.has(wn)}
								{@const sessCount =
									draft.days.reduce((s, d) => s + d.length, 0) +
									draft.freqSessions.reduce((s, f) => s + f.times_per_week, 0) +
									draft.everydaySessions.length * 7}
								<div
									style="
								background: var(--panel); border-radius: var(--rl);
								border: 1px solid {isCurrent ? 'rgba(194,113,79,0.4)' : 'var(--bd)'};
								box-shadow: {expanded ? 'var(--sh)' : 'none'}; overflow: hidden;
								transition: all 0.15s;
							"
								>
									<!-- Row header (always visible) -->
									<button
										onclick={() => toggleWeek(wn)}
										style="
										display: grid; grid-template-columns: 128px repeat(7, 1fr) 130px 130px;
										width: 100%; align-items: center; cursor: pointer;
										background: {isCurrent && !expanded
											? 'var(--pr-fog)'
											: expanded
												? 'var(--panel2)'
												: 'var(--panel)'};
										border: none; font-family: var(--font); text-align: left;
										min-height: {expanded ? '40px' : '48px'}; transition: background 0.1s;
									"
									>
										<div
											style="padding: 8px 12px; display: flex; flex-direction: column; gap: 1px;"
										>
											<div style="display: flex; align-items: center; gap: 6px;">
												<span
													style="
												display: inline-block; width: 12px;
												transform: {expanded ? 'rotate(90deg)' : 'rotate(0)'};
												transition: transform 0.15s; flex-shrink: 0; color: {isCurrent ? 'var(--pr)' : 'var(--tx3)'};
												font-size: 10px;
											">&#9654;</span
												>
												<span
													style="font-size: 13px; font-weight: 700; color: {isCurrent
														? 'var(--pr)'
														: 'var(--tx)'};">Wk {wn}</span
												>
												{#if isCurrent}
													<span
														style="font-size: 8.5px; font-weight: 700; color: #fff; background: var(--pr); padding: 1px 5px; border-radius: 3px; line-height: 14px;"
														>NOW</span
													>
												{/if}
												{#if draft.dirty}
													<span style="font-size: 9px; color: var(--pr);">*</span>
												{/if}
											</div>
											<div style="font-size: 10px; color: var(--tx3); padding-left: 18px;">
												{weekDateRange(wn)}
											</div>
										</div>

										<!-- Collapsed preview: abbreviated training pills -->
										{#if !expanded}
											{#each DAY_LABELS as _, di (di)}
												<div
													style="padding: 4px 2px; display: flex; flex-direction: column; gap: 2px; align-items: center;"
												>
													{#each draft.days[di] as s (s._id)}
														{@const t = trainingById(s.training_id)}
														<div
															style="
														padding: 2px 5px; border-radius: 4px;
														background: {trainingTint(s.training_id)};
														font-size: 9px; color: {trainingColor(s.training_id)};
														font-weight: 600; max-width: 100%;
														overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
													"
														>
															{t?.title?.split(' ')[0] ?? '?'}
														</div>
													{/each}
													{#if draft.days[di].length === 0}
														<span style="font-size: 10px; color: var(--bd);">-</span>
													{/if}
												</div>
											{/each}
											<!-- /WK column placeholder in collapsed row -->
											<div></div>
											<!-- DAILY collapsed preview -->
											<div
												style="padding: 4px 2px; display: flex; flex-direction: column; gap: 2px; align-items: center;"
											>
												{#each draft.everydaySessions as s (s._id)}
													{@const t = trainingById(s.training_id)}
													<div
														style="
													padding: 2px 5px; border-radius: 4px;
													background: #ede8f5; font-size: 9px; color: var(--pl);
													font-weight: 600; max-width: 100%;
													overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
												"
													>
														{t?.title?.split(' ')[0] ?? '?'}
													</div>
												{/each}
												{#if draft.everydaySessions.length === 0}
													<span style="font-size: 10px; color: var(--bd);">-</span>
												{/if}
											</div>
										{:else}
											{#each DAY_LABELS as _, i (i)}<div></div>{/each}
											<div></div>
											<div></div>
										{/if}

										<div
											style="padding: 8px 12px; display: flex; align-items: center; justify-content: flex-end; gap: 6px;"
										>
											{#if sessCount > 0}
												<span
													style="
												font-size: 11px; color: var(--tx3); font-weight: 500;
												background: var(--panel2); padding: 2px 7px; border-radius: 999px;
											">{sessCount}</span
												>
											{/if}
										</div>
									</button>

									<!-- Expanded body -->
									{#if expanded}
										<!-- Actions bar with notes -->
										<div
											style="
										display: flex; align-items: center; gap: 10px;
										padding: 8px 12px; border-top: 1px solid var(--bd2); border-bottom: 1px solid var(--bd2);
										background: var(--panel);
									"
										>
											<Icon name="edit" size={12} color="var(--tx3)" />
											{#if editMode}
												<input
													value={draft.notes}
													onclick={(e) => e.stopPropagation()}
													oninput={(e) => {
														draft.notes = e.currentTarget.value;
														draft.dirty = true;
													}}
													placeholder="Week notes..."
													style="
												flex: 1; border: none; outline: none; background: transparent;
												font-family: var(--font); font-size: 12px; color: var(--tx);
												font-style: {draft.notes ? 'normal' : 'italic'};
											"
												/>
											{:else}
												<span
													style="flex: 1; font-family: var(--font); font-size: 12px; color: {draft.notes
														? 'var(--tx)'
														: 'var(--tx3)'}; font-style: {draft.notes ? 'normal' : 'italic'};"
												>
													{draft.notes || 'No notes'}
												</span>
											{/if}
											{#if editMode}
												<div style="display: flex; gap: 4px; flex-shrink: 0;">
													<button
														onclick={(e) => {
															e.stopPropagation();
															dupModalSourceWn = wn;
														}}
														style="
													display: inline-flex; align-items: center; gap: 5px;
													padding: 4px 10px; border-radius: var(--rs);
													border: 1px solid var(--bd); background: #fff; color: var(--tx2);
													font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
												"
													>
														<Icon name="copy" size={11} color="var(--tx2)" />
														Duplicate
													</button>

													{#if draft.deleteConfirm}
														<button
															onclick={(e) => {
																e.stopPropagation();
																clearWeek(wn);
																draft.deleteConfirm = false;
															}}
															style="padding: 4px 10px; border-radius: var(--rs); border: 1px solid var(--rd); color: var(--rd); background: #fff5f5; font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: var(--font);"
															>Confirm clear</button
														>
														<button
															onclick={(e) => {
																e.stopPropagation();
																draft.deleteConfirm = false;
															}}
															style="padding: 4px 10px; border-radius: var(--rs); border: 1px solid var(--bd); background: #fff; color: var(--tx); font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: var(--font);"
															>Cancel</button
														>
													{:else}
														<button
															onclick={(e) => {
																e.stopPropagation();
																draft.deleteConfirm = true;
															}}
															style="
														display: inline-flex; align-items: center; gap: 5px;
														padding: 4px 10px; border-radius: var(--rs);
														border: 1px solid var(--bd); background: #fff; color: var(--tx3);
														font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
													"
														>
															<Icon name="trash" size={11} color="var(--tx3)" />
															Clear
														</button>
													{/if}
												</div>
											{/if}
										</div>

										{#if draft.saveError}
											<div
												style="padding: 6px 12px; background: #fef2f2; color: #b91c1c; font-size: 12px; border-bottom: 1px solid #fca5a5;"
											>
												{draft.saveError}
											</div>
										{/if}

										{#if editMode && hasLockedSessions(draft)}
											<div
												style="padding: 6px 12px; background: var(--pr-fog); color: var(--tx2); font-size: 11.5px; border-bottom: 1px solid var(--bd2); display: flex; align-items: center; gap: 6px;"
											>
												<Icon name="lock" size={11} color="var(--tx3)" />
												Sessions already played are locked: their training and their overrides cannot
												be changed and they cannot leave the week. Rescheduling them inside it is still
												fine.
											</div>
										{/if}

										<!-- Day grid -->
										<div
											style="display: grid; grid-template-columns: 128px repeat(7, 1fr) 130px 130px; min-height: 72px;"
										>
											<!-- Left info -->
											<div
												style="padding: 8px 12px; display: flex; flex-direction: column; gap: 3px;"
											>
												<div style="display: flex; align-items: baseline; gap: 4px;">
													<span style="font-size: 20px; font-weight: 700; color: var(--tx);"
														>{sessCount}</span
													>
													<span style="font-size: 11px; color: var(--tx3);">sessions</span>
												</div>
												{#if draft.notes}
													<div
														style="font-size: 10.5px; color: var(--tx2); font-style: italic; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;"
													>
														{draft.notes}
													</div>
												{/if}
											</div>

											<!-- Day cells -->
											{#each [0, 1, 2, 3, 4, 5, 6] as dayIndex (dayIndex)}
												<DroppableCell id="cell:{wn}:{dayIndex}" disabled={!editMode}>
													<div
														style="
													padding: 5px 3px; min-height: 72px;
													display: flex; flex-direction: column; gap: 3px;
													border-left: 1px solid var(--bd2);
												"
													>
														{#each draft.days[dayIndex] as session, sessionIndex (session._id)}
															{@const color = trainingColor(session.training_id)}
															{@const tint = trainingTint(session.training_id)}
															{@const played = playedFor(session)}
															<SortableSession
																id={session._id}
																group="cell:{wn}:{dayIndex}"
																index={sessionIndex}
																disabled={!editMode}
															>
																<div
																	style="
																display: flex; align-items: center; gap: 4px;
																padding: 4px 5px; border-radius: 5px;
																background: {tint}; border: 1px solid {color}30;
																cursor: {editMode ? 'grab' : 'default'}; font-size: 10.5px;
															"
																>
																	<div
																		style="width: 5px; height: 5px; border-radius: 50%; background: {color}; flex-shrink: 0;"
																	></div>
																	{#if trainingById(session.training_id)?.assessment}
																		<div title="Assessment" style="display: flex; flex-shrink: 0;">
																			<Icon name="spark" size={9} color="var(--pl)" />
																		</div>
																	{/if}
																	<span
																		style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx); font-weight: 500;"
																	>
																		{trainingById(session.training_id)?.title ?? '?'}
																	</span>
																	{#if played.length > 0}
																		<PlayedSessionMarker
																			{played}
																			onOpen={(session) => (openedSession = session)}
																		/>
																	{/if}
																	{#if session.locked}
																		<div
																			title={LOCKED_SESSION_REASON}
																			style="display: flex; flex-shrink: 0; pointer-events: auto;"
																		>
																			<Icon name="lock" size={10} color="var(--tx3)" />
																		</div>
																	{:else if editMode}
																		<button
																			onclick={() => removeSession(wn, session._id)}
																			aria-label="Remove session"
																			onpointerdown={(e) => e.stopPropagation()}
																			style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: var(--tx3); background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; border-radius: 3px; opacity: 0.6;"
																			onmouseenter={(e) => {
																				e.currentTarget.style.opacity = '1';
																				e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
																			}}
																			onmouseleave={(e) => {
																				e.currentTarget.style.opacity = '0.6';
																				e.currentTarget.style.background = 'none';
																			}}
																		>
																			<Icon name="x" size={10} color="var(--tx3)" />
																		</button>
																	{/if}
																</div>
															</SortableSession>
														{/each}
														{#if draft.days[dayIndex].length === 0}
															{#if editMode}
																<div
																	role="button"
																	tabindex="-1"
																	style="
															flex: 1; display: flex; align-items: center; justify-content: center;
															border-radius: 5px; border: 1px dashed var(--bd);
															color: var(--tx3); margin: 2px; min-height: 40px;
															transition: border-color 0.15s, color 0.15s;
														"
																	onmouseenter={(e) => {
																		e.currentTarget.style.borderColor = 'var(--pr)';
																		e.currentTarget.style.color = 'var(--pr)';
																	}}
																	onmouseleave={(e) => {
																		e.currentTarget.style.borderColor = 'var(--bd)';
																		e.currentTarget.style.color = 'var(--tx3)';
																	}}
																>
																	<Icon name="plus" size={14} color="currentColor" />
																</div>
															{:else}
																<div
																	style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--bd); margin: 2px; min-height: 40px; font-size: 16px;"
																>
																	-
																</div>
															{/if}
														{/if}
													</div>
												</DroppableCell>
											{/each}

											<!-- Frequency cell -->
											<DroppableCell id="freq:{wn}" disabled={!editMode}>
												<div
													style="
												padding: 5px 4px; min-height: 72px;
												display: flex; flex-direction: column; gap: 3px;
												border-left: 1px solid var(--bd2);
												background: var(--panel2);
											"
												>
													{#each draft.freqSessions as session, sessionIndex (session._id)}
														{@const color = trainingColor(session.training_id)}
														{@const tint = trainingTint(session.training_id)}
														{@const played = playedFor(session)}
														<SortableSession
															id={session._id}
															group="freq:{wn}"
															index={sessionIndex}
															disabled={!editMode}
														>
															<div
																style="
															padding: 4px 5px; border-radius: 5px;
															background: {tint}; border: 1px solid {color}30;
														"
															>
																<div
																	style="display: flex; align-items: center; gap: 3px; margin-bottom: 2px;"
																>
																	<div
																		style="width: 5px; height: 5px; border-radius: 50%; background: {color}; flex-shrink: 0;"
																	></div>
																	{#if trainingById(session.training_id)?.assessment}
																		<div title="Assessment" style="display: flex; flex-shrink: 0;">
																			<Icon name="spark" size={9} color="var(--pl)" />
																		</div>
																	{/if}
																	<span
																		style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx); font-weight: 600; min-width: 0; font-size: 10.5px;"
																	>
																		{trainingById(session.training_id)?.title ?? '?'}
																	</span>
																</div>
																<div
																	style="display: flex; align-items: center; gap: 3px; padding-left: 8px;"
																>
																	<input
																		type="number"
																		value={session.times_per_week}
																		oninput={(e) => {
																			session.times_per_week = parseInt(e.currentTarget.value) || 1;
																			draft.dirty = true;
																		}}
																		min="1"
																		max="14"
																		style="width: 30px; border: none; border-bottom: 1px solid var(--bd); text-align: center; padding: 0 2px; outline: none; background: transparent; font-family: var(--font); font-size: 11px; color: {color}; font-weight: 700;"
																	/>
																	<span style="font-size: 10px; color: {color}; font-weight: 600;"
																		>x/wk</span
																	>
																	<div style="flex: 1;"></div>
																	{#if played.length > 0}
																		<PlayedSessionMarker
																			{played}
																			onOpen={(session) => (openedSession = session)}
																		/>
																	{/if}
																	{#if session.locked}
																		<div
																			title={LOCKED_SESSION_REASON}
																			style="display: flex; flex-shrink: 0; pointer-events: auto;"
																		>
																			<Icon name="lock" size={10} color="var(--tx3)" />
																		</div>
																	{:else if editMode}
																		<button
																			onclick={() => removeSession(wn, session._id)}
																			aria-label="Remove session"
																			onpointerdown={(e) => e.stopPropagation()}
																			style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: var(--tx3); background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; border-radius: 3px; opacity: 0.6;"
																			onmouseenter={(e) => {
																				e.currentTarget.style.opacity = '1';
																				e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
																			}}
																			onmouseleave={(e) => {
																				e.currentTarget.style.opacity = '0.6';
																				e.currentTarget.style.background = 'none';
																			}}
																		>
																			<Icon name="x" size={10} color="var(--tx3)" />
																		</button>
																	{/if}
																</div>
															</div>
														</SortableSession>
													{/each}
												</div>
											</DroppableCell>

											<!-- Everyday cell -->
											<DroppableCell id="everyday:{wn}" disabled={!editMode}>
												<div
													style="
												padding: 5px 4px; min-height: 72px;
												display: flex; flex-direction: column; gap: 3px;
												border-left: 1px solid var(--bd2);
												background: #faf7fe;
											"
												>
													{#each draft.everydaySessions as session, sessionIndex (session._id)}
														{@const color = trainingColor(session.training_id)}
														{@const tint = trainingTint(session.training_id)}
														{@const played = playedFor(session)}
														<SortableSession
															id={session._id}
															group="everyday:{wn}"
															index={sessionIndex}
															disabled={!editMode}
														>
															<div
																style="
															display: flex; align-items: center; gap: 4px;
															padding: 4px 5px; border-radius: 5px;
															background: {tint}; border: 1px solid {color}30;
															cursor: {editMode ? 'grab' : 'default'}; font-size: 10.5px;
														"
															>
																<div
																	style="width: 5px; height: 5px; border-radius: 50%; background: {color}; flex-shrink: 0;"
																></div>
																{#if trainingById(session.training_id)?.assessment}
																	<div title="Assessment" style="display: flex; flex-shrink: 0;">
																		<Icon name="spark" size={9} color="var(--pl)" />
																	</div>
																{/if}
																<span
																	style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx); font-weight: 500;"
																>
																	{trainingById(session.training_id)?.title ?? '?'}
																</span>
																{#if played.length > 0}
																	<PlayedSessionMarker
																		{played}
																		onOpen={(session) => (openedSession = session)}
																	/>
																{/if}
																{#if session.locked}
																	<div
																		title={LOCKED_SESSION_REASON}
																		style="display: flex; flex-shrink: 0; pointer-events: auto;"
																	>
																		<Icon name="lock" size={10} color="var(--tx3)" />
																	</div>
																{:else if editMode}
																	<button
																		onclick={() => removeSession(wn, session._id)}
																		aria-label="Remove session"
																		onpointerdown={(e) => e.stopPropagation()}
																		style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: var(--tx3); background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; border-radius: 3px; opacity: 0.6;"
																		onmouseenter={(e) => {
																			e.currentTarget.style.opacity = '1';
																			e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
																		}}
																		onmouseleave={(e) => {
																			e.currentTarget.style.opacity = '0.6';
																			e.currentTarget.style.background = 'none';
																		}}
																	>
																		<Icon name="x" size={10} color="var(--tx3)" />
																	</button>
																{/if}
															</div>
														</SortableSession>
													{/each}
													{#if draft.everydaySessions.length === 0 && editMode}
														<div
															role="button"
															tabindex="-1"
															style="
														flex: 1; display: flex; align-items: center; justify-content: center;
														border-radius: 5px; border: 1px dashed rgba(144,123,153,0.4);
														color: var(--pl); margin: 2px; min-height: 40px; opacity: 0.6;
														transition: opacity 0.15s;
													"
															onmouseenter={(e) => {
																e.currentTarget.style.opacity = '1';
															}}
															onmouseleave={(e) => {
																e.currentTarget.style.opacity = '0.6';
															}}
														>
															<Icon name="plus" size={14} color="currentColor" />
														</div>
													{:else if draft.everydaySessions.length === 0}
														<div
															style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--bd); margin: 2px; min-height: 40px; font-size: 16px;"
														>
															-
														</div>
													{/if}
												</div>
											</DroppableCell>
										</div>

										<WeekPerformedSessions
											weekNumber={wn}
											sessions={sessionsOfWeek(playedSessions, program.start_date, wn)}
											onOpen={(session) => (openedSession = session)}
										/>
									{/if}
								</div>
							{/if}
						{/each}

						{#if weekNumbers().length === 0}
							<div
								style="
							background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
							padding: 32px 24px; text-align: center; color: var(--tx3); font-size: 13px;
						"
							>
								No weeks defined. Use "Edit details" to set a duration.
							</div>
						{/if}
					</div>
				</div>

				<!-- Right rail: Training library (inside DragDropProvider) -->
				{#if editMode}
					<div
						style="
				width: 240px; flex-shrink: 0;
				border-left: 1px solid var(--bd);
				background: var(--panel);
				display: flex; flex-direction: column;
				position: sticky; top: 0; align-self: flex-start;
				max-height: calc(100vh - 65px); overflow: hidden;
			"
					>
						<div style="padding: 16px 14px 10px; border-bottom: 1px solid var(--bd2);">
							<div
								style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;"
							>
								<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">Trainings</h3>
								<span style="font-size: 11px; color: var(--tx3);">{trainings.length}</span>
							</div>
							<div
								style="
						display: flex; align-items: center; gap: 7px;
						background: var(--panel2); border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 7px 10px; margin-bottom: 8px;
					"
							>
								<Icon name="search" size={13} color="var(--tx3)" />
								<input
									bind:value={trainingSearch}
									placeholder="Find training..."
									style="flex: 1; border: none; outline: none; background: transparent; font-family: var(--font); font-size: 12.5px; color: var(--tx);"
								/>
							</div>
							<div style="display: flex; gap: 3px; flex-wrap: wrap;">
								{#each TRAINING_FILTERS as f (f.id)}
									<button
										onclick={() => (trainingTypeFilter = f.id)}
										style="
									padding: 3px 9px; font-size: 10.5px; font-weight: 600;
									border-radius: 999px; border: none; cursor: pointer;
									background: {trainingTypeFilter === f.id ? 'var(--pr-fog)' : 'transparent'};
									color: {trainingTypeFilter === f.id ? 'var(--pr)' : 'var(--tx3)'};
									font-family: var(--font);
								">{f.label}</button
									>
								{/each}
							</div>
						</div>

						<div
							style="flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;"
						>
							{#each filteredTrainings as t (t.id)}
								{@const info = trainingTypeInfo(t.training_type)}
								<SidePanelDraggable
									id="__new__:{t.id}"
									style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--rs); background: var(--panel); border: 1px solid var(--bd); cursor: grab; font-size: 12px; color: var(--tx); width: 100%; text-align: left;"
								>
									<div
										style="
								width: 24px; height: 24px; border-radius: 5px;
								background: {info.tint}; color: {info.color};
								display: flex; align-items: center; justify-content: center;
								font-size: 8.5px; font-weight: 700; flex-shrink: 0;
							"
									>
										{info.short}
									</div>
									<div style="flex: 1; min-width: 0;">
										<div
											style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;"
										>
											{t.title}
										</div>
										{#if t.assessment}
											<div
												style="font-size: 10px; font-weight: 700; color: var(--pl); letter-spacing: 0.04em;"
											>
												ASSESSMENT
											</div>
										{/if}
									</div>
								</SidePanelDraggable>
							{/each}
							{#if filteredTrainings.length === 0}
								<div style="padding: 16px; text-align: center; color: var(--tx3); font-size: 12px;">
									No trainings found.
								</div>
							{/if}
						</div>

						<div
							style="padding: 12px 14px; border-top: 1px solid var(--bd2); display: flex; gap: 10px;"
						>
							<div style="flex: 1;">
								<div
									style="font-size: 10px; color: var(--tx3); letter-spacing: 0.04em; font-weight: 600;"
								>
									TOTAL
								</div>
								<div style="font-size: 16px; font-weight: 700; color: var(--tx);">
									{totalSessions}
									<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">sessions</span
									>
								</div>
							</div>
							<div>
								<div
									style="font-size: 10px; color: var(--tx3); letter-spacing: 0.04em; font-weight: 600;"
								>
									WEEKS
								</div>
								<div style="font-size: 16px; font-weight: 700; color: var(--tx);">
									{weekNumbers().length}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div></DragDropProvider
		>
	{/if}

	<!-- Duplicate week modal -->
	{#if dupModalSourceWn !== null}
		{@const sourceWn = dupModalSourceWn}
		<div
			style="position: fixed; inset: 0; z-index: 1000; background: rgba(45,36,29,0.2); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center;"
			role="button"
			tabindex="0"
			aria-label="Close dialog"
			onclick={(e) => {
				if (e.target === e.currentTarget) dupModalSourceWn = null;
			}}
			onkeydown={(e) => {
				if (e.key === 'Escape' || e.key === 'Enter') dupModalSourceWn = null;
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				style="background: #fff; border-radius: var(--rl); box-shadow: 0 8px 32px rgba(45,36,29,0.18); padding: 22px 26px; width: 380px;"
			>
				<h3 style="font-size: 16px; font-weight: 700; color: var(--tx); margin-bottom: 4px;">
					Duplicate Week {sourceWn}
				</h3>
				<p style="font-size: 12.5px; color: var(--tx2); margin-bottom: 16px;">
					Choose which week to copy this schedule into. Existing sessions will be replaced.
				</p>
				<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px;">
					{#each weekNumbers() as wn (wn)}
						{@const isSource = wn === sourceWn}
						{@const hasDraft = weekDrafts[wn]?.days.some((d) => d.length > 0)}
						{@const isPlayed = hasLockedSessions(weekDrafts[wn])}
						{@const isBlocked = isSource || isPlayed}
						<button
							onclick={() => !isBlocked && executeDuplicate(sourceWn, wn)}
							disabled={isBlocked}
							title={isPlayed
								? 'This week holds sessions already played, so it cannot be replaced.'
								: undefined}
							style="
								width: 52px; height: 44px; border-radius: var(--rs);
								border: 1.5px solid {isBlocked ? 'var(--bd)' : hasDraft ? 'rgba(212,161,94,0.4)' : 'var(--bd)'};
								background: {isBlocked ? 'var(--panel2)' : '#fff'};
								cursor: {isBlocked ? 'default' : 'pointer'};
								opacity: {isBlocked ? 0.5 : 1};
								display: flex; flex-direction: column; align-items: center; justify-content: center;
								gap: 2px; font-family: var(--font); transition: border-color 0.15s;
							"
							onmouseenter={(e) => {
								if (!isBlocked) e.currentTarget.style.borderColor = 'var(--pr)';
							}}
							onmouseleave={(e) => {
								if (!isBlocked)
									e.currentTarget.style.borderColor = hasDraft
										? 'rgba(212,161,94,0.4)'
										: 'var(--bd)';
							}}
						>
							<span
								style="font-size: 13px; font-weight: 700; color: {isBlocked
									? 'var(--tx3)'
									: 'var(--tx)'};">{wn}</span
							>
							{#if isSource}
								<span style="font-size: 8px; color: var(--tx3);">source</span>
							{:else if isPlayed}
								<span style="font-size: 8px; color: var(--tx3);">played</span>
							{:else if hasDraft}
								<span style="font-size: 8px; color: var(--gd); font-weight: 600;">data</span>
							{/if}
						</button>
					{/each}
				</div>
				<div style="display: flex; justify-content: flex-end;">
					<button
						onclick={() => (dupModalSourceWn = null)}
						style="padding: 7px 14px; border-radius: var(--rs); border: 1px solid var(--bd); background: #fff; color: var(--tx); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);"
						>Cancel</button
					>
				</div>
			</div>
		</div>
	{/if}
</AppShell>

{#if openedSession}
	<SessionDetailModal
		{userId}
		session={openedSession}
		onClose={() => (openedSession = null)}
		onReplied={applyReply}
	/>
{/if}

{#if showAssessments}
	<AssessmentsModal
		athleteName={coacheeName}
		records={coacheeAssessments}
		onClose={() => (showAssessments = false)}
	/>
{/if}

<UnsavedChangesGuard dirty={guardDirty} />
