<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import type {
		Program,
		ProgramRequest,
		WeekSummary,
		WeekDetail,
		WeekSession,
		SessionRequest,
		CoachTrainingSummary,
		TrainingType
	} from '$lib/api/client';

	let { data } = $props();

	const userId = data.userId as string;
	const programId = data.programId as string;

	// --- Program state ---
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

	// --- Weeks state ---
	let weeks = $state<WeekSummary[]>([]);
	let expandedWeek = $state<number | null>(null);
	let weekDetails = $state<Record<number, WeekDetail>>({});
	let weekLoading = $state<Record<number, boolean>>({});

	// --- Week editor state ---
	let weekNotes = $state('');
	let weekSessions = $state<SessionRequest[]>([]);
	let savingWeek = $state(false);
	let weekError = $state('');
	let confirmDeleteWeek = $state(false);
	let deletingWeek = $state(false);

	let showAddSession = $state(false);
	let addTrainingId = $state('');
	let addScheduleMode = $state<'day' | 'frequency'>('day');
	let addDayOfWeek = $state<number | null>(null);
	let addTimesPerWeek = $state('');

	// --- Trainings (for session picker) ---
	let trainings = $state<CoachTrainingSummary[]>([]);
	let trainingSearch = $state('');
	let filteredTrainings = $derived(
		trainingSearch.trim()
			? trainings.filter((t) =>
					t.title.toLowerCase().includes(trainingSearch.trim().toLowerCase())
				)
			: trainings
	);

	// --- FullCalendar ---
	let calendarEl = $state<HTMLElement | undefined>(undefined);

	const TYPE_COLORS: Record<TrainingType, string> = {
		workout: '#C6613F',
		climbing: '#D4A644',
		stretching: '#5A8C5A'
	};

	const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	function calendarEvents(): { title: string; start: string; color: string }[] {
		if (!program) return [];
		const events: { title: string; start: string; color: string }[] = [];
		const startMs = new Date(program.start_date).getTime();

		for (const [wn, detail] of Object.entries(weekDetails)) {
			const weekOffset = (parseInt(wn) - 1) * 7;
			for (const session of detail.sessions) {
				if (session.day_of_week !== undefined) {
					const date = new Date(startMs + (weekOffset + session.day_of_week) * 86400000);
					events.push({
						title: session.training_title,
						start: date.toISOString().slice(0, 10),
						color: TYPE_COLORS[session.training_type] ?? '#888'
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
		// Depend on weekDetails so calendar rebuilds when weeks are saved
		void Object.keys(weekDetails).length;
		return buildCalendar();
	});

	// --- Helpers ---
	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function weekNumbers(): number[] {
		if (program?.duration_weeks) {
			return Array.from({ length: program.duration_weeks }, (_, i) => i + 1);
		}
		const defined = weeks.map((w) => w.week_number).sort((a, b) => a - b);
		const max = defined.length ? defined[defined.length - 1] : 0;
		return Array.from({ length: max + 1 }, (_, i) => i + 1);
	}

	function isWeekDefined(n: number): boolean {
		return weeks.some((w) => w.week_number === n);
	}

	function sessionCountForWeek(n: number): number {
		return weekDetails[n]?.sessions.length ?? 0;
	}

	async function expandWeek(n: number) {
		if (expandedWeek === n) {
			expandedWeek = null;
			return;
		}
		expandedWeek = n;
		weekError = '';
		showAddSession = false;
		addTrainingId = '';
		addScheduleMode = 'day';
		addDayOfWeek = null;
		addTimesPerWeek = '';

		if (!weekDetails[n]) {
			if (!isWeekDefined(n)) {
				weekNotes = '';
				weekSessions = [];
				return;
			}
			weekLoading = { ...weekLoading, [n]: true };
			try {
				const detail = await apiClient.getWeek(userId, programId, n);
				weekDetails = { ...weekDetails, [n]: detail };
				weekNotes = detail.notes ?? '';
				weekSessions = detail.sessions.map((s) => ({
					training_id: s.training_id,
					day_of_week: s.day_of_week,
					times_per_week: s.times_per_week,
					notes: s.notes,
					overrides: []
				}));
			} catch {
				weekError = 'Failed to load week.';
			} finally {
				weekLoading = { ...weekLoading, [n]: false };
			}
		} else {
			const detail = weekDetails[n];
			weekNotes = detail.notes ?? '';
			weekSessions = detail.sessions.map((s) => ({
				training_id: s.training_id,
				day_of_week: s.day_of_week,
				times_per_week: s.times_per_week,
				notes: s.notes,
				overrides: []
			}));
		}
	}

	function addSession() {
		if (!addTrainingId) return;
		if (addScheduleMode === 'day' && addDayOfWeek === null) return;
		if (addScheduleMode === 'frequency' && (!addTimesPerWeek || parseInt(addTimesPerWeek) < 1)) return;

		const req: SessionRequest = {
			training_id: addTrainingId,
			overrides: []
		};
		if (addScheduleMode === 'day') {
			req.day_of_week = addDayOfWeek!;
		} else {
			req.times_per_week = parseInt(addTimesPerWeek);
		}
		weekSessions = [...weekSessions, req];
		showAddSession = false;
		addTrainingId = '';
		trainingSearch = '';
		addDayOfWeek = null;
		addTimesPerWeek = '';
		addScheduleMode = 'day';
	}

	function removeSession(index: number) {
		weekSessions = weekSessions.filter((_, i) => i !== index);
	}

	async function saveWeek(n: number) {
		savingWeek = true;
		weekError = '';
		try {
			const detail = await apiClient.upsertWeek(userId, programId, n, {
				notes: weekNotes.trim() || undefined,
				sessions: weekSessions
			});
			weekDetails = { ...weekDetails, [n]: detail };
			if (!weeks.some((w) => w.week_number === n)) {
				weeks = [
					...weeks,
					{
						id: detail.id,
						program_id: detail.program_id,
						week_number: n,
						notes: detail.notes,
						created_at: detail.created_at,
						updated_at: detail.updated_at
					}
				];
			}
			snackbar.show(`Week ${n} saved`);
		} catch (e) {
			weekError = e instanceof Error ? e.message : 'Failed to save week.';
		} finally {
			savingWeek = false;
		}
	}

	async function handleDeleteWeek(n: number) {
		deletingWeek = true;
		try {
			await apiClient.deleteWeek(userId, programId, n);
			weeks = weeks.filter((w) => w.week_number !== n);
			const updated = { ...weekDetails };
			delete updated[n];
			weekDetails = updated;
			expandedWeek = null;
			confirmDeleteWeek = false;
			snackbar.show(`Week ${n} deleted`);
		} catch (e) {
			weekError = e instanceof Error ? e.message : 'Failed to delete week.';
		} finally {
			deletingWeek = false;
		}
	}

	function trainingLabel(id: string): string {
		return trainings.find((t) => t.id === id)?.title ?? id;
	}

	function scheduleLabel(s: SessionRequest): string {
		if (s.day_of_week !== undefined) return DAY_LABELS[s.day_of_week] ?? '?';
		if (s.times_per_week !== undefined) return `${s.times_per_week}x/week`;
		return '?';
	}

	function sessionTrainingType(id: string): TrainingType {
		return trainings.find((t) => t.id === id)?.training_type ?? 'workout';
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
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load program.';
		} finally {
			loading = false;
		}
	});
</script>

<div class="min-h-screen bg-white" style="padding: 24px;">
	<div class="mx-auto" style="max-width: 900px;">

		<!-- Header -->
		<div class="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
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
			<div class="mb-6 border border-red-600 bg-red-50 p-4" style="font-family: monospace; font-size: 13px; color: #B85450;">{error}</div>
		{/if}

		{#if loading}
			<div class="flex items-center gap-3 py-12">
				<div class="animate-spin" style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"></div>
				<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
			</div>
		{:else if program}

			<!-- Program metadata -->
			{#if editing}
				<div class="mb-6 space-y-3">
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
						class="w-full border border-gray-300 px-3 py-2 outline-none focus:border-black resize-none"
						style="font-family: monospace; font-size: 13px;"
					></textarea>
					<div class="flex gap-3 flex-wrap">
						<div>
							<label style="font-family: monospace; font-size: 11px; color: #999; display: block; margin-bottom: 2px;">START DATE</label>
							<input
								type="date"
								bind:value={editStartDate}
								class="border border-black px-2 py-1 outline-none"
								style="font-family: monospace; font-size: 13px;"
							/>
						</div>
						<div>
							<label style="font-family: monospace; font-size: 11px; color: #999; display: block; margin-bottom: 2px;">DURATION (WEEKS)</label>
							<input
								type="number"
								bind:value={editDurationWeeks}
								min="1"
								placeholder="--"
								class="border border-gray-300 px-2 py-1 outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px; width: 80px;"
							/>
						</div>
					</div>
					<div class="flex gap-2">
						<button
							onclick={saveEdit}
							disabled={saving}
							class="border border-black px-4 py-1.5 font-bold transition-colors hover:bg-black hover:text-white disabled:opacity-50"
							style="font-family: monospace; font-size: 12px;"
						>{saving ? '...' : 'SAVE'}</button>
						<button
							onclick={() => (editing = false)}
							class="border border-gray-300 px-4 py-1.5 transition-colors hover:bg-gray-100"
							style="font-family: monospace; font-size: 12px;"
						>CANCEL</button>
					</div>
				</div>
			{:else}
				<div class="mb-6">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h1 class="text-3xl font-black mb-1" style="font-family: monospace; letter-spacing: -0.5px;">{program.name}</h1>
							{#if program.objective}
								<p class="mb-2" style="font-family: monospace; font-size: 13px; color: #555;">{program.objective}</p>
							{/if}
							<p style="font-family: monospace; font-size: 12px; color: #999;">
								{formatDate(program.start_date)}{program.duration_weeks ? ` -- ${program.duration_weeks} weeks` : ''}
							</p>
						</div>
						<button
							onclick={startEdit}
							class="shrink-0 border border-gray-300 px-3 py-1 transition-colors hover:bg-gray-100"
							style="font-family: monospace; font-size: 12px;"
						>EDIT</button>
					</div>
				</div>
			{/if}

			<!-- FullCalendar overview -->
			<div class="mb-8 border border-gray-200 p-3">
				<div bind:this={calendarEl} class="fc-crimpy"></div>
			</div>

			<!-- Week schedule -->
			<p class="mb-3 font-bold" style="font-family: monospace; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
				WEEK SCHEDULE
			</p>

			<!-- Week grid -->
			<div class="mb-4 flex flex-wrap gap-2">
				{#each weekNumbers() as n}
					{@const defined = isWeekDefined(n)}
					{@const active = expandedWeek === n}
					<button
						onclick={() => expandWeek(n)}
						style="font-family: monospace; font-size: 11px; padding: 6px 12px; border: 1px solid {active ? '#C6613F' : defined ? '#333' : '#ccc'}; background: {active ? '#C6613F' : 'white'}; color: {active ? 'white' : defined ? '#333' : '#aaa'}; cursor: pointer; position: relative;"
					>
						WK {n}
						{#if defined && weekDetails[n]?.sessions.length}
							<span style="font-family: monospace; font-size: 9px; color: {active ? 'rgba(255,255,255,0.8)' : '#C6613F'}; margin-left: 4px;">{sessionCountForWeek(n)}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Inline week editor -->
			{#if expandedWeek !== null}
				{@const wn = expandedWeek}
				<div class="border border-black p-4 space-y-4">
					<div class="flex items-center justify-between">
						<p style="font-family: monospace; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">WEEK {wn}</p>
						<button onclick={() => (expandedWeek = null)} style="font-family: monospace; font-size: 11px; color: #999; background: none; border: none; cursor: pointer;">CLOSE</button>
					</div>

					{#if weekLoading[wn]}
						<div class="flex items-center gap-2">
							<div class="animate-spin" style="width: 12px; height: 12px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"></div>
							<span style="font-family: monospace; font-size: 12px; color: #666;">Loading...</span>
						</div>
					{:else}
						{#if weekError}
							<p style="font-family: monospace; font-size: 12px; color: #B85450;">{weekError}</p>
						{/if}

						<!-- Notes -->
						<div>
							<label style="font-family: monospace; font-size: 11px; color: #999; display: block; margin-bottom: 4px;">NOTES</label>
							<input
								type="text"
								bind:value={weekNotes}
								placeholder="Optional week notes..."
								class="w-full border border-gray-300 px-3 py-1.5 outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px;"
							/>
						</div>

						<!-- Sessions list -->
						<div>
							<p style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; margin-bottom: 8px;">SESSIONS</p>
							{#if weekSessions.length === 0}
								<p style="font-family: monospace; font-size: 12px; color: #aaa;">No sessions yet.</p>
							{:else}
								<div class="space-y-2 mb-3">
									{#each weekSessions as s, i}
										{@const type = sessionTrainingType(s.training_id)}
										<div class="flex items-center gap-3 border border-gray-200 p-2">
											<div class="flex items-center justify-center shrink-0" style="width: 28px; height: 28px; background-color: {TYPE_COLORS[type]}22; border: 1px solid {TYPE_COLORS[type]}44;">
												<span style="font-family: monospace; font-size: 9px; font-weight: 700; color: {TYPE_COLORS[type]};">{type.slice(0, 2).toUpperCase()}</span>
											</div>
											<div class="flex-1 min-w-0">
												<p style="font-family: monospace; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{trainingLabel(s.training_id)}</p>
												<p style="font-family: monospace; font-size: 11px; color: #888;">{scheduleLabel(s)}</p>
											</div>
											<button
												onclick={() => removeSession(i)}
												class="shrink-0 border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-400 hover:text-red-500"
												style="font-family: monospace; font-size: 11px;"
											>X</button>
										</div>
									{/each}
								</div>
							{/if}

							{#if !showAddSession}
								<button
									onclick={() => (showAddSession = true)}
									class="border border-dashed border-gray-300 px-3 py-1.5 text-gray-500 transition-colors hover:border-black hover:text-black"
									style="font-family: monospace; font-size: 12px;"
								>+ ADD SESSION</button>
							{:else}
								<!-- Add session form -->
								<div class="border border-gray-300 p-3 space-y-3 mt-2">
									<p style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px;">ADD SESSION</p>

									<!-- Training picker -->
									<div>
										<input
											type="text"
											bind:value={trainingSearch}
											placeholder="Search training..."
											class="w-full border border-gray-300 px-2 py-1 outline-none focus:border-black mb-1"
											style="font-family: monospace; font-size: 12px;"
										/>
										<div style="max-height: 140px; overflow-y: auto; border: 1px solid #e5e7eb;">
											{#each filteredTrainings as t (t.id)}
												<button
													onclick={() => { addTrainingId = t.id; trainingSearch = t.title; }}
													class="w-full text-left px-3 py-1.5 transition-colors hover:bg-gray-50"
													style="font-family: monospace; font-size: 12px; background: {addTrainingId === t.id ? '#f5f5f5' : 'white'}; border: none; border-bottom: 1px solid #f0f0f0; cursor: pointer; display: flex; align-items: center; gap: 8px;"
												>
													<span style="color: {TYPE_COLORS[t.training_type ?? 'workout']}; font-size: 10px;">[{t.training_type ?? 'workout'}]</span>
													{t.title}
												</button>
											{/each}
											{#if filteredTrainings.length === 0}
												<p style="font-family: monospace; font-size: 12px; color: #aaa; padding: 8px 12px;">No trainings found.</p>
											{/if}
										</div>
									</div>

									<!-- Schedule toggle -->
									<div>
										<div class="flex gap-0 mb-2">
											<button
												onclick={() => (addScheduleMode = 'day')}
												style="font-family: monospace; font-size: 11px; padding: 4px 10px; border: 1px solid {addScheduleMode === 'day' ? '#333' : '#ccc'}; background: {addScheduleMode === 'day' ? '#333' : 'white'}; color: {addScheduleMode === 'day' ? 'white' : '#999'}; cursor: pointer;"
											>FIXED DAY</button>
											<button
												onclick={() => (addScheduleMode = 'frequency')}
												style="font-family: monospace; font-size: 11px; padding: 4px 10px; border: 1px solid {addScheduleMode === 'frequency' ? '#333' : '#ccc'}; border-left: none; background: {addScheduleMode === 'frequency' ? '#333' : 'white'}; color: {addScheduleMode === 'frequency' ? 'white' : '#999'}; cursor: pointer;"
											>FREQUENCY</button>
										</div>
										{#if addScheduleMode === 'day'}
											<div class="flex gap-1 flex-wrap">
												{#each DAY_LABELS as day, i}
													<button
														onclick={() => (addDayOfWeek = i)}
														style="font-family: monospace; font-size: 11px; padding: 4px 8px; border: 1px solid {addDayOfWeek === i ? '#C6613F' : '#ccc'}; background: {addDayOfWeek === i ? '#C6613F' : 'white'}; color: {addDayOfWeek === i ? 'white' : '#666'}; cursor: pointer;"
													>{day}</button>
												{/each}
											</div>
										{:else}
											<div class="flex items-center gap-2">
												<input
													type="number"
													bind:value={addTimesPerWeek}
													min="1"
													max="7"
													placeholder="1"
													class="border border-black px-2 py-1 outline-none"
													style="font-family: monospace; font-size: 13px; width: 60px;"
												/>
												<span style="font-family: monospace; font-size: 12px; color: #666;">times / week</span>
											</div>
										{/if}
									</div>

									<div class="flex gap-2">
										<button
											onclick={addSession}
											class="border border-black px-3 py-1 font-bold transition-colors hover:bg-black hover:text-white"
											style="font-family: monospace; font-size: 12px;"
										>ADD</button>
										<button
											onclick={() => { showAddSession = false; addTrainingId = ''; trainingSearch = ''; addDayOfWeek = null; addTimesPerWeek = ''; addScheduleMode = 'day'; }}
											class="border border-gray-300 px-3 py-1 transition-colors hover:bg-gray-100"
											style="font-family: monospace; font-size: 12px;"
										>CANCEL</button>
									</div>
								</div>
							{/if}
						</div>

						<!-- Save / delete week -->
						<div class="flex items-center gap-3 pt-2 border-t border-gray-100">
							<button
								onclick={() => saveWeek(wn)}
								disabled={savingWeek}
								class="border border-black px-4 py-1.5 font-bold transition-colors hover:bg-black hover:text-white disabled:opacity-50"
								style="font-family: monospace; font-size: 12px;"
							>{savingWeek ? '...' : 'SAVE WEEK'}</button>
							{#if isWeekDefined(wn)}
								{#if confirmDeleteWeek}
									<button
										onclick={() => handleDeleteWeek(wn)}
										disabled={deletingWeek}
										class="border border-red-600 px-3 py-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
										style="font-family: monospace; font-size: 12px;"
									>{deletingWeek ? '...' : 'CONFIRM'}</button>
									<button
										onclick={() => (confirmDeleteWeek = false)}
										class="border border-gray-300 px-3 py-1.5 transition-colors hover:bg-gray-100"
										style="font-family: monospace; font-size: 12px;"
									>CANCEL</button>
								{:else}
									<button
										onclick={() => (confirmDeleteWeek = true)}
										class="border border-gray-200 px-3 py-1.5 text-gray-400 transition-colors hover:border-red-500 hover:text-red-500"
										style="font-family: monospace; font-size: 12px;"
									>DELETE WEEK</button>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/if}

	</div>
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
