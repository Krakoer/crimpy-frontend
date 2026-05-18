<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
	import { PointerActivationConstraints } from '@dnd-kit/dom';
	import SidePanelDraggable from '$lib/components/training/SidePanelDraggable.svelte';
	import DroppableCell from '$lib/components/program/DroppableCell.svelte';
	import DraggableSession from '$lib/components/program/DraggableSession.svelte';
	import type {
		Program,
		ProgramRequest,
		WeekSummary,
		WeekDetail,
		SessionRequest,
		CoachTrainingSummary,
		TrainingType
	} from '$lib/api/client';

	let { data } = $props();
	const userId = $derived(data.userId as string);
	const programId = $derived(data.programId as string);

	// --- Draft types ---
	type DaySession = { _id: string; training_id: string };
	type FreqSession = { _id: string; training_id: string; times_per_week: number };
	type WeekDraft = {
		notes: string;
		days: DaySession[][];
		freqSessions: FreqSession[];
		dirty: boolean;
		saving: boolean;
		saveError: string;
		deleteConfirm: boolean;
		deleting: boolean;
	};

	function emptyDraft(): WeekDraft {
		return {
			notes: '',
			days: Array.from({ length: 7 }, () => []),
			freqSessions: [],
			dirty: false,
			saving: false,
			saveError: '',
			deleteConfirm: false,
			deleting: false
		};
	}

	function weekDetailToDraft(detail: WeekDetail): WeekDraft {
		const days: DaySession[][] = Array.from({ length: 7 }, () => []);
		const freqSessions: FreqSession[] = [];
		for (const s of detail.sessions) {
			if (s.day_of_week !== undefined) {
				days[s.day_of_week].push({ _id: crypto.randomUUID(), training_id: s.training_id });
			} else if (s.times_per_week !== undefined) {
				freqSessions.push({
					_id: crypto.randomUUID(),
					training_id: s.training_id,
					times_per_week: s.times_per_week
				});
			}
		}
		return {
			notes: detail.notes ?? '',
			days,
			freqSessions,
			dirty: false,
			saving: false,
			saveError: '',
			deleteConfirm: false,
			deleting: false
		};
	}

	function draftToSessionRequests(draft: WeekDraft): SessionRequest[] {
		const reqs: SessionRequest[] = [];
		for (let day = 0; day < 7; day++) {
			for (const s of draft.days[day]) {
				reqs.push({ training_id: s.training_id, day_of_week: day, overrides: [] });
			}
		}
		for (const s of draft.freqSessions) {
			reqs.push({ training_id: s.training_id, times_per_week: s.times_per_week, overrides: [] });
		}
		return reqs;
	}

	// --- Program ---
	let program = $state<Program | null>(null);
	let loading = $state(true);
	let error = $state('');
	let editing = $state(false);
	let editName = $state('');
	let editObjective = $state('');
	let editStartDate = $state('');
	let editDurationWeeks = $state('');
	let saving = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);

	// --- Weeks ---
	let weeks = $state<WeekSummary[]>([]);
	let weekDrafts = $state<Record<number, WeekDraft>>({});
	let calendarVersion = $state(0);

	// Ensure drafts exist for all current week numbers whenever duration changes
	$effect(() => {
		for (const n of weekNumbers()) {
			if (!weekDrafts[n]) weekDrafts[n] = emptyDraft();
		}
	});

	// --- Trainings ---
	let trainings = $state<CoachTrainingSummary[]>([]);
	let trainingSearch = $state('');
	let filteredTrainings = $derived(
		trainingSearch.trim()
			? trainings.filter((t) =>
					t.title.toLowerCase().includes(trainingSearch.trim().toLowerCase())
				)
			: trainings
	);

	// --- DnD ---
	const dndSensors = [
		PointerSensor.configure({
			activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })]
		})
	];

	function findAndRemoveSession(sessionId: string): DaySession | FreqSession | null {
		for (const wnStr of Object.keys(weekDrafts)) {
			const wn = parseInt(wnStr);
			const draft = weekDrafts[wn];
			for (let day = 0; day < 7; day++) {
				const idx = draft.days[day].findIndex((s) => s._id === sessionId);
				if (idx !== -1) {
					const [session] = draft.days[day].splice(idx, 1);
					draft.dirty = true;
					return session;
				}
			}
			const idx = draft.freqSessions.findIndex((s) => s._id === sessionId);
			if (idx !== -1) {
				const [session] = draft.freqSessions.splice(idx, 1);
				draft.dirty = true;
				return session;
			}
		}
		return null;
	}

	function onDragEnd(event: {
		canceled: boolean;
		operation: { source: unknown; target: unknown };
	}) {
		if (event.canceled) return;
		const source = event.operation.source;
		const target = event.operation.target;
		if (!source || !target) return;

		const sourceId = String((source as { id: string }).id);
		const targetId = String((target as { id: string }).id);

		if (sourceId.startsWith('__new__:')) {
			const trainingId = sourceId.slice(8);
			if (targetId.startsWith('cell:')) {
				const [, wnStr, dayStr] = targetId.split(':');
				const wn = parseInt(wnStr);
				const day = parseInt(dayStr);
				if (!weekDrafts[wn]) weekDrafts[wn] = emptyDraft();
				weekDrafts[wn].days[day].push({ _id: crypto.randomUUID(), training_id: trainingId });
				weekDrafts[wn].dirty = true;
			} else if (targetId.startsWith('freq:')) {
				const wn = parseInt(targetId.slice(5));
				if (!weekDrafts[wn]) weekDrafts[wn] = emptyDraft();
				weekDrafts[wn].freqSessions.push({
					_id: crypto.randomUUID(),
					training_id: trainingId,
					times_per_week: 1
				});
				weekDrafts[wn].dirty = true;
			}
		} else {
			if (!targetId.startsWith('cell:') && !targetId.startsWith('freq:')) return;
			const session = findAndRemoveSession(sourceId);
			if (!session) return;
			if (targetId.startsWith('cell:')) {
				const [, wnStr, dayStr] = targetId.split(':');
				const wn = parseInt(wnStr);
				const day = parseInt(dayStr);
				if (!weekDrafts[wn]) weekDrafts[wn] = emptyDraft();
				weekDrafts[wn].days[day].push({ _id: session._id, training_id: session.training_id });
				weekDrafts[wn].dirty = true;
			} else if (targetId.startsWith('freq:')) {
				const wn = parseInt(targetId.slice(5));
				if (!weekDrafts[wn]) weekDrafts[wn] = emptyDraft();
				const times = 'times_per_week' in session ? (session as FreqSession).times_per_week : 1;
				weekDrafts[wn].freqSessions.push({ _id: session._id, training_id: session.training_id, times_per_week: times });
				weekDrafts[wn].dirty = true;
			}
		}
	}

	function removeSession(wn: number, sessionId: string) {
		const draft = weekDrafts[wn];
		if (!draft) return;
		for (let day = 0; day < 7; day++) {
			const idx = draft.days[day].findIndex((s) => s._id === sessionId);
			if (idx !== -1) {
				draft.days[day].splice(idx, 1);
				draft.dirty = true;
				return;
			}
		}
		const idx = draft.freqSessions.findIndex((s) => s._id === sessionId);
		if (idx !== -1) {
			draft.freqSessions.splice(idx, 1);
			draft.dirty = true;
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
				sessions: draftToSessionRequests(draft)
			});
			weekDrafts[wn] = weekDetailToDraft(detail);
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
			calendarVersion++;
			snackbar.show(`Week ${wn} saved`);
		} catch (e) {
			weekDrafts[wn].saving = false;
			weekDrafts[wn].saveError = e instanceof Error ? e.message : 'Failed to save.';
		}
	}

	async function handleDeleteWeek(wn: number) {
		weekDrafts[wn].deleting = true;
		try {
			await apiClient.deleteWeek(userId, programId, wn);
			const idx = weeks.findIndex((w) => w.week_number === wn);
			if (idx !== -1) weeks.splice(idx, 1);
			weekDrafts[wn] = emptyDraft();
			calendarVersion++;
			snackbar.show(`Week ${wn} deleted`);
		} catch (e) {
			weekDrafts[wn].deleting = false;
			weekDrafts[wn].saveError = e instanceof Error ? e.message : 'Failed to delete.';
		}
	}

	// --- Duplicate ---
	let dupSourceWn = $state<number | null>(null);
	let dupTargetStr = $state('');

	function executeDuplicate(sourceWn: number) {
		const target = parseInt(dupTargetStr);
		if (isNaN(target) || target < 1) return;
		const src = weekDrafts[sourceWn];
		if (!src) return;
		weekDrafts[target] = {
			notes: src.notes,
			days: src.days.map((d) => d.map((s) => ({ ...s, _id: crypto.randomUUID() }))),
			freqSessions: src.freqSessions.map((s) => ({ ...s, _id: crypto.randomUUID() })),
			dirty: true,
			saving: false,
			saveError: '',
			deleteConfirm: false,
			deleting: false
		};
		dupSourceWn = null;
		dupTargetStr = '';
		snackbar.show(`Week ${sourceWn} duplicated to week ${target}`);
	}

	// --- Helpers ---
	const TYPE_COLORS: Record<TrainingType, string> = {
		workout: '#C6613F',
		climbing: '#D4A644',
		stretching: '#5A8C5A'
	};

	const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	function trainingById(id: string): CoachTrainingSummary | undefined {
		return trainings.find((t) => t.id === id);
	}

	function trainingColor(id: string): string {
		return TYPE_COLORS[trainingById(id)?.training_type ?? 'workout'];
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

	function isWeekDefined(n: number): boolean {
		return weeks.some((w) => w.week_number === n);
	}

	// --- Metadata editing ---
	function startEdit() {
		if (!program) return;
		editName = program.name;
		editObjective = program.objective ?? '';
		editStartDate = program.start_date;
		editDurationWeeks = program.duration_weeks !== undefined ? String(program.duration_weeks) : '';
		editing = true;
	}

	async function saveEdit() {
		if (!program || !editName.trim() || !editStartDate) return;
		saving = true;
		try {
			const req: ProgramRequest = {
				name: editName.trim(),
				start_date: editStartDate,
				objective: editObjective.trim() || undefined,
				duration_weeks: editDurationWeeks ? parseInt(editDurationWeeks) : undefined
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
			goto(`/coachees/${userId}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete program.';
		} finally {
			deleting = false;
		}
	}

	// --- FullCalendar ---
	let calendarEl = $state<HTMLElement | undefined>(undefined);

	function calendarEvents(): { title: string; start: string; color: string }[] {
		if (!program) return [];
		const events: { title: string; start: string; color: string }[] = [];
		const startMs = new Date(program.start_date).getTime();
		for (const ws of weeks) {
			const draft = weekDrafts[ws.week_number];
			if (!draft) continue;
			const offset = (ws.week_number - 1) * 7;
			for (let day = 0; day < 7; day++) {
				for (const s of draft.days[day]) {
					const t = trainingById(s.training_id);
					events.push({
						title: t?.title ?? 'Training',
						start: new Date(startMs + (offset + day) * 86400000).toISOString().slice(0, 10),
						color: trainingColor(s.training_id)
					});
				}
			}
		}
		return events;
	}

	function buildCalendar() {
		if (!calendarEl || !program) return;
		let destroyed = false;
		let cal: import('@fullcalendar/core').Calendar;
		(async () => {
			const { Calendar } = await import('@fullcalendar/core');
			const { default: dayGridPlugin } = await import('@fullcalendar/daygrid');
			if (destroyed || !calendarEl) return;
			const startDate = program!.start_date;
			const endDate = program!.duration_weeks
				? new Date(
						new Date(startDate).getTime() + program!.duration_weeks * 7 * 86400000
					)
						.toISOString()
						.slice(0, 10)
				: undefined;
			cal = new Calendar(calendarEl, {
				plugins: [dayGridPlugin],
				initialView: 'dayGridMonth',
				initialDate: startDate,
				firstDay: 1,
				contentHeight: 200,
				validRange: endDate ? { start: startDate, end: endDate } : undefined,
				headerToolbar: { left: 'prev,next', center: 'title', right: '' },
				editable: false,
				selectable: false,
				eventDisplay: 'list-item',
				events: calendarEvents()
			} as any);
			cal.render();
		})();
		return () => {
			destroyed = true;
			cal?.destroy();
		};
	}

	$effect(() => {
		if (!calendarEl || !program) return;
		void calendarVersion;
		return buildCalendar();
	});

	// --- Mount ---
	onMount(async () => {
		authStore.initialize();
		loading = true;
		try {
			const [p, w, t] = await Promise.all([
				apiClient.getProgram(userId, programId),
				apiClient.listWeeks(userId, programId),
				apiClient.getCoachTrainings()
			]);
			program = p;
			weeks = w;
			trainings = t;

			const maxWn = p.duration_weeks ?? (w.length ? Math.max(...w.map((ws) => ws.week_number)) : 0);
			const allDrafts: Record<number, WeekDraft> = {};
			for (let n = 1; n <= maxWn; n++) allDrafts[n] = emptyDraft();

			if (w.length > 0) {
				const details = await Promise.all(
					w.map((ws) => apiClient.getWeek(userId, programId, ws.week_number))
				);
				for (const d of details) allDrafts[d.week_number] = weekDetailToDraft(d);
			}
			weekDrafts = allDrafts;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load program.';
		} finally {
			loading = false;
		}
	});
</script>

<div class="min-h-screen bg-white" style="padding: 24px;">

	<!-- Header -->
	<div style="max-width: 1400px; margin: 0 auto 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid black; padding-bottom: 16px;">
		<button
			onclick={() => goto(`/coachees/${userId}`)}
			class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
			style="font-family: monospace; font-size: 12px;"
		>BACK</button>
		{#if !confirmDelete}
			<button
				onclick={() => (confirmDelete = true)}
				class="border border-gray-300 px-3 py-1 text-gray-500 transition-colors hover:border-red-600 hover:text-red-600"
				style="font-family: monospace; font-size: 12px;"
			>DELETE PROGRAM</button>
		{:else}
			<div class="flex gap-2">
				<button
					onclick={handleDeleteProgram}
					disabled={deleting}
					class="border border-red-600 px-3 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
					style="font-family: monospace; font-size: 12px;"
				>{deleting ? '...' : 'CONFIRM DELETE'}</button>
				<button
					onclick={() => (confirmDelete = false)}
					class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 12px;"
				>CANCEL</button>
			</div>
		{/if}
	</div>

	{#if error}
		<div style="max-width: 1400px; margin: 0 auto 16px;" class="border border-red-600 bg-red-50 p-4" style:font-family="monospace" style:font-size="13px" style:color="#B85450">{error}</div>
	{/if}

	{#if loading}
		<div style="max-width: 1400px; margin: 0 auto;" class="flex items-center gap-3 py-12">
			<div class="animate-spin" style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"></div>
			<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
		</div>
	{:else if program}

		<!-- Metadata -->
		<div style="max-width: 1400px; margin: 0 auto 24px;">
			{#if editing}
				<div class="space-y-3">
					<input
						type="text"
						bind:value={editName}
						class="w-full border-b-2 border-black px-0 py-1 text-3xl font-black outline-none"
						style="font-family: monospace;"
					/>
					<textarea
						bind:value={editObjective}
						placeholder="Objective (optional)"
						rows="2"
						class="w-full resize-none border border-gray-300 px-3 py-2 outline-none focus:border-black"
						style="font-family: monospace; font-size: 13px;"
					></textarea>
					<div class="flex flex-wrap gap-4">
						<div>
							<label for="edit-start-date" style="font-family: monospace; font-size: 11px; color: #999; display: block; margin-bottom: 2px;">START DATE</label>
							<input id="edit-start-date" type="date" bind:value={editStartDate}
								class="border border-black px-2 py-1 outline-none"
								style="font-family: monospace; font-size: 13px;" />
						</div>
						<div>
							<label for="edit-duration-weeks" style="font-family: monospace; font-size: 11px; color: #999; display: block; margin-bottom: 2px;">DURATION (WEEKS)</label>
							<input id="edit-duration-weeks" type="number" bind:value={editDurationWeeks} min="1" placeholder="--"
								class="border border-gray-300 px-2 py-1 outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px; width: 80px;" />
						</div>
					</div>
					<div class="flex gap-2">
						<button onclick={saveEdit} disabled={saving}
							class="border border-black px-4 py-1.5 font-bold transition-colors hover:bg-black hover:text-white disabled:opacity-50"
							style="font-family: monospace; font-size: 12px;">{saving ? '...' : 'SAVE'}</button>
						<button onclick={() => (editing = false)}
							class="border border-gray-300 px-4 py-1.5 transition-colors hover:bg-gray-100"
							style="font-family: monospace; font-size: 12px;">CANCEL</button>
					</div>
				</div>
			{:else}
				<div class="flex items-start justify-between gap-4">
					<div>
						<h1 class="mb-1 text-3xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">{program.name}</h1>
						{#if program.objective}
							<p class="mb-1" style="font-family: monospace; font-size: 13px; color: #555;">{program.objective}</p>
						{/if}
						<p style="font-family: monospace; font-size: 12px; color: #999;">
							{formatDate(program.start_date)}{program.duration_weeks ? ` -- ${program.duration_weeks} weeks` : ''}
						</p>
					</div>
					<button onclick={startEdit}
						class="shrink-0 border border-gray-300 px-3 py-1 transition-colors hover:bg-gray-100"
						style="font-family: monospace; font-size: 12px;">EDIT</button>
				</div>
			{/if}
		</div>

		<!-- FullCalendar overview -->
		<div style="max-width: 1400px; margin: 0 auto 32px;" class="border border-gray-200 p-3">
			<div bind:this={calendarEl} class="fc-crimpy"></div>
		</div>

		<!-- DnD layout -->
		<DragDropProvider sensors={dndSensors} {onDragEnd}>
			<div style="max-width: 1400px; margin: 0 auto; display: flex; gap: 16px; align-items: flex-start;">

				<!-- Sidebar: training list -->
				<div style="width: 200px; flex-shrink: 0; position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
					<p style="font-family: monospace; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #999; text-transform: uppercase;">TRAININGS</p>
					<input
						type="text"
						bind:value={trainingSearch}
						placeholder="Search..."
						class="w-full border border-black px-2 py-1.5 outline-none focus:border-2"
						style="font-family: monospace; font-size: 12px;"
					/>
					<div style="display: flex; flex-direction: column; gap: 3px;">
						{#each filteredTrainings as t (t.id)}
							<SidePanelDraggable
								id="__new__:{t.id}"
								style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid #e5e7eb; font-family: monospace; font-size: 11px;"
								class="hover:border-black hover:bg-gray-50 transition-colors"
							>
								<span style="font-size: 9px; font-weight: 700; color: {TYPE_COLORS[t.training_type ?? 'workout']}; flex-shrink: 0;">{(t.training_type ?? 'WO').slice(0, 2).toUpperCase()}</span>
								<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{t.title}</span>
							</SidePanelDraggable>
						{/each}
						{#if filteredTrainings.length === 0}
							<p style="font-family: monospace; font-size: 11px; color: #aaa;">No trainings found.</p>
						{/if}
					</div>
				</div>

				<!-- Week rows -->
				<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px;">
					{#if weekNumbers().length === 0}
						<p style="font-family: monospace; font-size: 13px; color: #999; padding: 24px 0;">No weeks defined. Edit the program to set a duration.</p>
					{/if}

					{#each weekNumbers() as wn}
						{@const draft = weekDrafts[wn]}
						{#if draft}
							{@const defined = isWeekDefined(wn)}
							<div style="border: 1px solid {draft.dirty ? '#C6613F' : defined ? '#333' : '#e5e7eb'};">

								<!-- Week header -->
								<div style="display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-bottom: 1px solid #e5e7eb; background: #fafafa; flex-wrap: wrap;">
									<span style="font-family: monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; flex-shrink: 0;">
										WK {wn}{#if draft.dirty}<span style="color: #C6613F;"> *</span>{/if}
									</span>
									<input
										type="text"
										bind:value={draft.notes}
										oninput={() => (draft.dirty = true)}
										placeholder="Week notes..."
										style="font-family: monospace; font-size: 11px; border: none; border-bottom: 1px solid #e5e7eb; padding: 1px 4px; outline: none; flex: 1; min-width: 60px; background: transparent;"
									/>
									<div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0; margin-left: auto;">
										<!-- Duplicate -->
										{#if dupSourceWn === wn}
											<input
												type="number"
												bind:value={dupTargetStr}
												placeholder="#"
												min="1"
												onkeydown={(e) => { if (e.key === 'Enter') executeDuplicate(wn); }}
												style="font-family: monospace; font-size: 11px; border: 1px solid #333; padding: 2px 4px; width: 40px; outline: none;"
											/>
											<button
												onclick={() => executeDuplicate(wn)}
												class="border border-gray-700 px-2 py-0.5 transition-colors hover:bg-gray-100"
												style="font-family: monospace; font-size: 11px;"
											>COPY</button>
											<button
												onclick={() => { dupSourceWn = null; dupTargetStr = ''; }}
												class="border border-gray-300 px-2 py-0.5 text-gray-400 transition-colors hover:bg-gray-100"
												style="font-family: monospace; font-size: 11px;"
											>X</button>
										{:else}
											<button
												onclick={() => { dupSourceWn = wn; dupTargetStr = ''; }}
												class="border border-gray-300 px-2 py-0.5 text-gray-500 transition-colors hover:border-black hover:text-black"
												style="font-family: monospace; font-size: 11px;"
											>DUP</button>
										{/if}

										<!-- Delete defined week -->
										{#if defined}
											{#if draft.deleteConfirm}
												<button
													onclick={() => handleDeleteWeek(wn)}
													disabled={draft.deleting}
													class="border border-red-600 px-2 py-0.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
													style="font-family: monospace; font-size: 11px;"
												>{draft.deleting ? '...' : 'CONFIRM'}</button>
												<button
													onclick={() => (draft.deleteConfirm = false)}
													class="border border-gray-300 px-2 py-0.5 text-gray-400 transition-colors hover:bg-gray-100"
													style="font-family: monospace; font-size: 11px;"
												>X</button>
											{:else}
												<button
													onclick={() => (draft.deleteConfirm = true)}
													class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-500 hover:text-red-500"
													style="font-family: monospace; font-size: 11px;"
												>DEL</button>
											{/if}
										{/if}

										<!-- Save -->
										<button
											onclick={() => saveWeek(wn)}
											disabled={!draft.dirty || draft.saving}
											style="font-family: monospace; font-size: 11px; padding: 2px 10px; font-weight: 700; border: 1px solid {draft.dirty ? '#333' : '#e5e7eb'}; color: {draft.dirty ? 'white' : '#ccc'}; background: {draft.dirty ? '#333' : 'white'}; cursor: {draft.dirty ? 'pointer' : 'default'};"
											class="disabled:opacity-50"
										>{draft.saving ? '...' : 'SAVE'}</button>
									</div>
								</div>

								{#if draft.saveError}
									<p style="font-family: monospace; font-size: 11px; color: #B85450; padding: 4px 10px; background: #fef2f2;">{draft.saveError}</p>
								{/if}

								<!-- Day headers + droppable cells -->
								<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(70px, 0.8fr);">
									<!-- Headers -->
									{#each [...DAY_LABELS, '/wk'] as label, i}
										<div style="padding: 3px 6px; border-bottom: 1px solid #e5e7eb; {i < 8 ? 'border-right: 1px solid #f0f0f0;' : ''} font-family: monospace; font-size: 10px; color: #999; background: #fafafa; text-align: center; letter-spacing: 0.5px;">
											{label}
										</div>
									{/each}

									<!-- Day cells -->
									{#each [0, 1, 2, 3, 4, 5, 6] as dayIndex}
										<DroppableCell id="cell:{wn}:{dayIndex}">
											<div style="padding: 3px; min-height: 60px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid #f0f0f0;">
												{#each draft.days[dayIndex] as session (session._id)}
													{@const color = trainingColor(session.training_id)}
													<DraggableSession id={session._id}>
														<div style="display: flex; align-items: center; gap: 3px; border: 1px solid {color}44; padding: 2px 4px; background: white; font-family: monospace; font-size: 10px;">
															<span style="width: 6px; height: 6px; border-radius: 50%; background: {color}; flex-shrink: 0;"></span>
															<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333;">
																{trainingById(session.training_id)?.title ?? '?'}
															</span>
															<button
																onclick={() => removeSession(wn, session._id)}
																style="font-family: monospace; font-size: 9px; color: #ccc; background: none; border: none; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0;"
																class="hover:text-red-500"
															>x</button>
														</div>
													</DraggableSession>
												{/each}
											</div>
										</DroppableCell>
									{/each}

									<!-- Frequency cell -->
									<DroppableCell id="freq:{wn}">
										<div style="padding: 3px; min-height: 60px; display: flex; flex-direction: column; gap: 2px;">
											{#each draft.freqSessions as session (session._id)}
												{@const color = trainingColor(session.training_id)}
												<DraggableSession id={session._id}>
													<div style="display: flex; align-items: center; gap: 2px; border: 1px solid {color}44; padding: 2px 4px; background: white; font-family: monospace; font-size: 10px;">
														<span style="width: 6px; height: 6px; border-radius: 50%; background: {color}; flex-shrink: 0;"></span>
														<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; min-width: 0;">
															{trainingById(session.training_id)?.title ?? '?'}
														</span>
														<input
															type="number"
															value={session.times_per_week}
															oninput={(e) => { session.times_per_week = parseInt(e.currentTarget.value) || 1; draft.dirty = true; }}
															min="1"
															max="14"
															style="font-family: monospace; font-size: 10px; width: 22px; border: none; border-bottom: 1px solid #ccc; text-align: center; padding: 0; outline: none; background: transparent; flex-shrink: 0;"
														/>
														<span style="font-size: 9px; color: #999; flex-shrink: 0;">x</span>
														<button
															onclick={() => removeSession(wn, session._id)}
															style="font-family: monospace; font-size: 9px; color: #ccc; background: none; border: none; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0;"
															class="hover:text-red-500"
														>x</button>
													</div>
												</DraggableSession>
											{/each}
										</div>
									</DroppableCell>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</DragDropProvider>
	{/if}

</div>

<style>
	:global(.fc-crimpy) { font-family: monospace; font-size: 12px; }
	:global(.fc-crimpy .fc-toolbar-title) { font-size: 13px; font-weight: 700; letter-spacing: -0.5px; }
	:global(.fc-crimpy .fc-button) {
		background-color: white; border: 1px solid black; border-radius: 0;
		color: black; font-family: monospace; font-size: 11px; font-weight: 600;
		letter-spacing: 0.5px; text-transform: uppercase; padding: 3px 8px; box-shadow: none;
	}
	:global(.fc-crimpy .fc-button:hover) { background-color: #f5f5f5; border-color: black; color: black; }
	:global(.fc-crimpy .fc-button:focus) { box-shadow: none; }
	:global(.fc-crimpy .fc-button-active),
	:global(.fc-crimpy .fc-button-primary:not(:disabled):active) { background-color: black; border-color: black; color: white; }
	:global(.fc-crimpy .fc-col-header-cell) { border-color: #e5e7eb; padding: 4px 0; }
	:global(.fc-crimpy .fc-col-header-cell-cushion) { font-weight: 600; color: #333; text-decoration: none; }
	:global(.fc-crimpy .fc-daygrid-day-number) { font-size: 11px; color: #333; text-decoration: none; padding: 2px 4px; }
	:global(.fc-crimpy .fc-day-today) { background-color: transparent !important; }
	:global(.fc-crimpy .fc-day-today .fc-daygrid-day-number) { background-color: #C6613F; color: white; border-radius: 0; }
	:global(.fc-crimpy .fc-scrollgrid) { border-color: #e5e7eb; }
	:global(.fc-crimpy td, .fc-crimpy th) { border-color: #e5e7eb; }
	:global(.fc-crimpy .fc-event) { border-radius: 0; border: none; font-size: 10px; }
</style>
