<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { SessionResponse, EnrolledUser, AssessmentResponse, Program, ProgramRequest } from '$lib/api/client';
	import AssessmentChart from '$lib/components/AssessmentChart.svelte';
	import { snackbar } from '$lib/stores/snackbar.svelte';

	let { data } = $props();

	let coachee = $state<EnrolledUser | null>(null);
	let sessions = $state<SessionResponse[]>([]);
	let assessments = $state<AssessmentResponse[]>([]);
	let loading = $state(false);
	let error = $state('');

	let activeTab = $state<'sessions' | 'programs'>('sessions');

	let programs = $state<Program[]>([]);
	let programsLoading = $state(false);
	let confirmDeleteProgramId = $state<string | null>(null);
	let deletingProgram = $state(false);

	let showNewProgramForm = $state(false);
	let newProgramName = $state('');
	let newProgramStartDate = $state('');
	let newProgramObjective = $state('');
	let newProgramDurationWeeks = $state('');
	let savingProgram = $state(false);
	let newProgramError = $state('');

	const ASSESSMENT_TYPES: Record<number, { label: string; unit: string; format: (v: number) => string }> = {
		0: { label: 'CRITICAL FORCE', unit: 'kg', format: (v) => v.toFixed(1) },
		1: { label: 'MAX FORCE', unit: 'kg', format: (v) => v.toFixed(1) },
		2: { label: '60% ENDURANCE', unit: 's', format: (v) => v.toFixed(0) }
	};

	const GRIP_POSITIONS: Record<number, string> = {
		0: 'Half Crimp',
		1: '3-Finger',
		2: 'Full Crimp',
		3: 'Open Hand'
	};

	function formatVal(v: number | null | undefined, type: number): string {
		if (v === null || v === undefined) return '--';
		return ASSESSMENT_TYPES[type]?.format(v) ?? '--';
	}

	function availableGrips(type: number): number[] {
		return [0, 1, 2, 3].filter((g) =>
			assessments.some((a) => a.DeletedAt === null && a.Type === type && a.GripPosition === g)
		);
	}

	function historyForGrip(type: number, grip: number): AssessmentResponse[] {
		return assessments
			.filter((a) => a.DeletedAt === null && a.Type === type && a.GripPosition === grip)
			.sort((a, b) => new Date(a.UpdatedAt).getTime() - new Date(b.UpdatedAt).getTime());
	}

	function latestForGrip(type: number, grip: number): AssessmentResponse | undefined {
		const history = historyForGrip(type, grip);
		return history.at(-1);
	}

	function hasAnyAssessment(type: number): boolean {
		return assessments.some((a) => a.DeletedAt === null && a.Type === type);
	}

	let selectedGrip = $state<Record<number, number>>({ 0: 0, 1: 0, 2: 0 });
	let showGraph = $state<Record<number, boolean>>({ 0: false, 1: false, 2: false });

	$effect(() => {
		for (const type of [0, 1, 2]) {
			const grips = availableGrips(type);
			if (grips.length > 0 && !grips.includes(selectedGrip[type])) {
				selectedGrip[type] = grips[0];
			}
		}
	});

	let calendarEl = $state<HTMLElement | undefined>(undefined);

	const SESSION_TYPES: Record<number, { label: string; color: string }> = {
		0: { label: 'CR', color: '#C6613F' },
		1: { label: 'CL', color: '#D4A644' },
		2: { label: 'ST', color: '#5A8C5A' },
		3: { label: 'WO', color: '#8B6B9E' }
	};

	const SESSION_NAMES: Record<number, string> = {
		0: 'Crimpy Session',
		1: 'Climbing',
		2: 'Stretching',
		3: 'Workout'
	};

	function sessionType(type: number) {
		return SESSION_TYPES[type] ?? { label: '??', color: '#888' };
	}

	function hexWithOpacity(hex: string, opacity: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r},${g},${b},${opacity})`;
	}

	function isSameDay(a: Date, b: Date): boolean {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function groupSessionsByDate(
		items: SessionResponse[]
	): { label: string; items: SessionResponse[] }[] {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);

		const sorted = [...items].sort(
			(a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()
		);

		const groups = new Map<string, SessionResponse[]>();
		for (const session of sorted) {
			const d = new Date(session.Date);
			let key: string;
			if (isSameDay(d, today)) key = 'Today';
			else if (isSameDay(d, yesterday)) key = 'Yesterday';
			else
				key = d.toLocaleDateString('en-GB', {
					weekday: 'long',
					month: 'long',
					day: 'numeric'
				});
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(session);
		}

		return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDuration(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}

	async function loadPrograms() {
		programsLoading = true;
		try {
			programs = await apiClient.listPrograms(data.id!);
		} catch {
			// non-fatal
		} finally {
			programsLoading = false;
		}
	}

	async function handleCreateProgram() {
		if (!newProgramName.trim() || !newProgramStartDate) {
			newProgramError = 'Name and start date are required.';
			return;
		}
		savingProgram = true;
		newProgramError = '';
		try {
			const req: ProgramRequest = {
				name: newProgramName.trim(),
				start_date: newProgramStartDate,
				objective: newProgramObjective.trim() || undefined,
				duration_weeks: newProgramDurationWeeks ? parseInt(newProgramDurationWeeks) : undefined
			};
			const created = await apiClient.createProgram(data.id!, req);
			goto(`/coachees/${data.id}/programs/${created.id}`);
		} catch (e) {
			newProgramError = e instanceof Error ? e.message : 'Failed to create program.';
		} finally {
			savingProgram = false;
		}
	}

	async function handleDeleteProgram(programId: string) {
		deletingProgram = true;
		try {
			await apiClient.deleteProgram(data.id!, programId);
			programs = programs.filter((p) => p.id !== programId);
			confirmDeleteProgramId = null;
			snackbar.show('Program deleted');
		} catch (e) {
			snackbar.show(e instanceof Error ? e.message : 'Failed to delete program.', 'error');
		} finally {
			deletingProgram = false;
		}
	}

	function formatProgramDate(date: string): string {
		return new Date(date).toLocaleDateString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	onMount(async () => {
		authStore.initialize();
		loading = true;
		try {
			const [enrollments, clientSessions, clientAssessments] = await Promise.all([
				apiClient.getEnrollments(),
				apiClient.getClientSessions(data.id!),
				apiClient.getClientAssessments(data.id!)
			]);
			coachee = enrollments.find((e) => e.user_id === data.id!) ?? null;
			sessions = clientSessions.filter((s) => s.DeletedAt === null);
			assessments = clientAssessments ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data.';
		} finally {
			loading = false;
		}
		loadPrograms();
	});

	$effect(() => {
		if (!calendarEl || loading || sessions.length === undefined) return;

		let destroyed = false;
		let calendar: import('@fullcalendar/core').Calendar;

		(async () => {
			const { Calendar } = await import('@fullcalendar/core');
			const { default: dayGridPlugin } = await import('@fullcalendar/daygrid');

			if (destroyed || !calendarEl) return;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			calendar = new Calendar(calendarEl, {
				plugins: [dayGridPlugin],
				initialView: 'dayGridWeek',
				firstDay: 1,
				contentHeight: 150,
				headerToolbar: {
					left: 'prev,next today',
					center: 'title',
					right: ''
				},
				editable: false,
				selectable: false,
				eventStartEditable: false,
				dayMaxEvents: false,
				eventContent: (arg: any) => {
					const color = arg.event.extendedProps.color as string;
					const dot = document.createElement('span');
					dot.style.cssText = `display:inline-block;width:15px;height:15px;border-radius:50%;background-color:${color};`;
					return { domNodes: [dot] };
				},
				events: sessions.map((s) => ({
					id: s.ID,
					title: s.Name,
					start: s.Date,
					extendedProps: { color: sessionType(s.SessionType).color }
				}))
			} as any);

			calendar.render();
		})();

		return () => {
			destroyed = true;
			calendar?.destroy();
		};
	});

	let sessionGroups = $derived(groupSessionsByDate(sessions));

	function handleLogout() {
		authStore.logout();
		goto('/');
	}
</script>

<div class="min-h-screen bg-white" style="padding: 24px;">
	<div class="mx-auto" style="max-width: 1200px;">

		<!-- Header -->
		<div class="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
			<div class="flex items-center gap-4">
				<button
					onclick={() => goto('/coachees')}
					class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 12px;"
				>
					BACK
				</button>
				<h1 class="text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
					{#if coachee}
						{coachee.user_firstname}
						{coachee.user_lastname}
					{:else if loading}
						...
					{:else}
						COACHEE
					{/if}
				</h1>
			</div>
			<button
				onclick={handleLogout}
				class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
				style="font-family: monospace; font-size: 13px;"
			>
				LOGOUT
			</button>
		</div>

		{#if error}
			<div
				class="mb-6 border border-red-600 bg-red-50 p-4"
				style="font-family: monospace; font-size: 13px; color: #B85450;"
			>
				{error}
			</div>
		{/if}

		{#if loading}
			<div class="flex items-center gap-3 p-6">
				<div
					class="animate-spin"
					style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
				></div>
				<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
			</div>
		{:else}
			<!-- Tab switcher -->
			<div class="mb-6 flex gap-0 border-b border-gray-200">
				{#each (['sessions', 'programs'] as const) as tab}
					<button
						onclick={() => (activeTab = tab)}
						style="font-family: monospace; font-size: 12px; letter-spacing: 1px; padding: 8px 16px; background: none; border: none; border-bottom: 2px solid {activeTab === tab ? '#C6613F' : 'transparent'}; color: {activeTab === tab ? '#C6613F' : '#999'}; font-weight: {activeTab === tab ? '700' : '400'}; cursor: pointer; text-transform: uppercase;"
					>{tab}</button>
				{/each}
			</div>

			<!-- Two-column layout -->
			<div style="display: flex; gap: 24px; align-items: flex-start;">

				<!-- Left: tab content -->
				<div style="flex: 1; min-width: 0;">
					{#if activeTab === 'sessions'}
					<!-- Calendar -->
					<div class="mb-6 border border-gray-200 p-3">
						<div bind:this={calendarEl} class="fc-crimpy"></div>
					</div>

					<!-- Session list -->
					<p
						class="mb-3 font-bold"
						style="font-family: monospace; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;"
					>
						SESSIONS
					</p>
					{#if sessions.length === 0}
						<p style="font-family: monospace; font-size: 13px; color: #666;">
							No sessions recorded yet.
						</p>
					{:else}
						<div class="space-y-6">
							{#each sessionGroups as group}
								<div>
									<p
										class="mb-2"
										style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase;"
									>
										{group.label}
									</p>
									<div class="space-y-2">
										{#each group.items as session (session.ID)}
											{@const type = sessionType(session.SessionType)}
											<div class="flex items-center gap-3 border border-gray-200 bg-white p-3">
												<div
													class="flex shrink-0 items-center justify-center"
													style="width: 36px; height: 36px; background-color: {hexWithOpacity(type.color, 0.12)}; border: 1px solid {hexWithOpacity(type.color, 0.25)};"
												>
													<span style="font-family: monospace; font-size: 10px; font-weight: 700; color: {type.color}; letter-spacing: 0.5px;">
														{type.label}
													</span>
												</div>
												<div class="min-w-0 flex-1">
													<p class="font-semibold" style="font-family: monospace; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
														{session.Name}
													</p>
													<div class="flex gap-3" style="font-family: monospace; font-size: 11px; color: #888;">
														<span>{formatTime(session.Date)}</span>
														<span>{formatDuration(session.Duration)}</span>
													</div>
												</div>
												{#if session.Notes?.trim()}
													<p
														class="line-clamp-1 shrink-0"
														style="font-family: monospace; font-size: 11px; color: #999; max-width: 200px;"
													>
														{session.Notes}
													</p>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
					{:else}
					<!-- Programs tab -->
					<div class="mb-4 flex items-center justify-between" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
						<p class="font-bold" style="font-family: monospace; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #333;">
							PROGRAMS
						</p>
						{#if !showNewProgramForm}
							<button
								onclick={() => { showNewProgramForm = true; newProgramError = ''; }}
								class="border px-3 py-1 transition-colors hover:bg-gray-100"
								style="font-family: monospace; font-size: 12px; border-color: #C6613F; color: #C6613F;"
							>+ NEW PROGRAM</button>
						{/if}
					</div>

					{#if showNewProgramForm}
						<div class="mb-6 border border-black p-4 space-y-3">
							<p style="font-family: monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">NEW PROGRAM</p>
							{#if newProgramError}
								<p style="font-family: monospace; font-size: 12px; color: #B85450;">{newProgramError}</p>
							{/if}
							<div class="space-y-2">
								<input
									type="text"
									bind:value={newProgramName}
									placeholder="Name *"
									class="w-full border border-black px-3 py-1.5 outline-none focus:border-2"
									style="font-family: monospace; font-size: 13px;"
								/>
								<input
									type="date"
									bind:value={newProgramStartDate}
									class="w-full border border-black px-3 py-1.5 outline-none focus:border-2"
									style="font-family: monospace; font-size: 13px;"
								/>
								<textarea
									bind:value={newProgramObjective}
									placeholder="Objective (optional)"
									rows="2"
									class="w-full border border-gray-300 px-3 py-1.5 outline-none focus:border-black resize-none"
									style="font-family: monospace; font-size: 13px;"
								></textarea>
								<input
									type="number"
									bind:value={newProgramDurationWeeks}
									placeholder="Duration (weeks, optional)"
									min="1"
									class="w-full border border-gray-300 px-3 py-1.5 outline-none focus:border-black"
									style="font-family: monospace; font-size: 13px;"
								/>
							</div>
							<div class="flex gap-2">
								<button
									onclick={handleCreateProgram}
									disabled={savingProgram}
									class="border border-black px-4 py-1.5 font-bold transition-colors hover:bg-black hover:text-white disabled:opacity-50"
									style="font-family: monospace; font-size: 12px;"
								>{savingProgram ? '...' : 'SAVE'}</button>
								<button
									onclick={() => { showNewProgramForm = false; newProgramName = ''; newProgramStartDate = ''; newProgramObjective = ''; newProgramDurationWeeks = ''; newProgramError = ''; }}
									class="border border-gray-300 px-4 py-1.5 transition-colors hover:bg-gray-100"
									style="font-family: monospace; font-size: 12px;"
								>CANCEL</button>
							</div>
						</div>
					{/if}

					{#if programsLoading}
						<div class="flex items-center gap-3 py-6">
							<div class="animate-spin" style="width: 14px; height: 14px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"></div>
							<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
						</div>
					{:else if programs.length === 0}
						<p style="font-family: monospace; font-size: 13px; color: #666;">No programs yet.</p>
					{:else}
						<div class="divide-y divide-gray-200 border border-black">
							{#each programs as program (program.id)}
								<div class="p-4">
									<div class="flex items-start justify-between gap-4">
										<button
											onclick={() => goto(`/coachees/${data.id}/programs/${program.id}`)}
											class="min-w-0 flex-1 text-left transition-colors hover:text-gray-600"
										>
											<p class="font-bold" style="font-family: monospace; font-size: 14px;">{program.name}</p>
											{#if program.objective}
												<p class="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap" style="font-family: monospace; font-size: 12px; color: #666; max-width: 60ch;">{program.objective}</p>
											{/if}
											<p class="mt-1" style="font-family: monospace; font-size: 11px; color: #999;">
												{formatProgramDate(program.start_date)}{program.duration_weeks ? ` -- ${program.duration_weeks} weeks` : ''}
											</p>
										</button>
										<div class="flex shrink-0 gap-2">
											{#if confirmDeleteProgramId === program.id}
												<button
													onclick={() => handleDeleteProgram(program.id)}
													disabled={deletingProgram}
													class="border border-red-600 px-3 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
													style="font-family: monospace; font-size: 12px;"
												>{deletingProgram ? '...' : 'CONFIRM'}</button>
												<button
													onclick={() => (confirmDeleteProgramId = null)}
													class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
													style="font-family: monospace; font-size: 12px;"
												>CANCEL</button>
											{:else}
												<button
													onclick={() => (confirmDeleteProgramId = program.id)}
													class="border border-gray-300 px-3 py-1 text-gray-500 transition-colors hover:border-red-600 hover:text-red-600"
													style="font-family: monospace; font-size: 12px;"
												>DELETE</button>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					{/if}
				</div>

				<!-- Right: assessments sidebar (sticky) -->
				<div style="width: 300px; flex-shrink: 0; position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
					<p
						class="font-bold"
						style="font-family: monospace; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;"
					>
						ASSESSMENTS
					</p>

					{#each [0, 1, 2] as type}
						{@const typeInfo = ASSESSMENT_TYPES[type]}
						{@const grips = availableGrips(type)}
						{@const grip = selectedGrip[type]}
						{@const latest = latestForGrip(type, grip)}
						{@const history = historyForGrip(type, grip)}
						{@const graphOpen = showGraph[type]}
						<div class="border border-gray-200 bg-white">
							<!-- Card header -->
							<div class="border-b border-gray-200 px-3 py-2 flex items-center justify-between" style="background-color: #fafafa;">
								<div class="flex items-baseline gap-2">
									<span style="font-family: monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: #C6613F;">{typeInfo.label}</span>
									<span style="font-family: monospace; font-size: 10px; color: #bbb;">{typeInfo.unit}</span>
								</div>
								{#if history.length >= 2}
									<button
										onclick={() => (showGraph[type] = !showGraph[type])}
										style="font-family: monospace; font-size: 10px; letter-spacing: 0.5px; color: {graphOpen ? '#C6613F' : '#bbb'}; background: none; border: none; cursor: pointer; padding: 0;"
									>
										{graphOpen ? 'HIDE' : 'GRAPH'}
									</button>
								{/if}
							</div>

							<!-- Grip tabs -->
							{#if grips.length > 1}
								<div class="flex border-b border-gray-200" style="overflow-x: auto;">
									{#each grips as g}
										<button
											onclick={() => (selectedGrip[type] = g)}
											style="font-family: monospace; font-size: 10px; padding: 4px 8px; background: none; border: none; border-bottom: 2px solid {g === grip ? '#C6613F' : 'transparent'}; color: {g === grip ? '#C6613F' : '#aaa'}; cursor: pointer; white-space: nowrap; font-weight: {g === grip ? '700' : '400'};"
										>
											{GRIP_POSITIONS[g]}
										</button>
									{/each}
								</div>
							{:else if grips.length === 1}
								<div class="px-3 pt-2" style="font-family: monospace; font-size: 10px; color: #aaa;">
									{GRIP_POSITIONS[grips[0]]}
								</div>
							{/if}

							<!-- Values -->
							<div class="flex px-3 py-2 gap-3">
								<div style="flex: 1; text-align: center;">
									<div style="font-family: monospace; font-size: 9px; letter-spacing: 0.5px; color: #5A8C5A; margin-bottom: 2px;">LEFT</div>
									<div style="font-family: monospace; font-size: 20px; font-weight: 700; color: {latest ? '#222' : '#ccc'}; line-height: 1;">
										{formatVal(latest?.LeftValue, type)}
									</div>
								</div>
								<div style="width: 1px; background: #e5e7eb;"></div>
								<div style="flex: 1; text-align: center;">
									<div style="font-family: monospace; font-size: 9px; letter-spacing: 0.5px; color: #C6613F; margin-bottom: 2px;">RIGHT</div>
									<div style="font-family: monospace; font-size: 20px; font-weight: 700; color: {latest ? '#222' : '#ccc'}; line-height: 1;">
										{formatVal(latest?.RightValue, type)}
									</div>
								</div>
							</div>

							<!-- Graph -->
							{#if graphOpen && history.length >= 2}
								<div class="border-t border-gray-200 px-1 py-1">
									<AssessmentChart
										{history}
										unit={typeInfo.unit}
										formatValue={typeInfo.format}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>

			</div>
		{/if}

	</div>
</div>

<style>
	/* FullCalendar overrides — sharp monospace aesthetic */
	:global(.fc-crimpy) {
		font-family: monospace;
		font-size: 12px;
	}

	:global(.fc-crimpy .fc-toolbar-title) {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}

	:global(.fc-crimpy .fc-button) {
		background-color: white;
		border: 1px solid black;
		border-radius: 0;
		color: black;
		font-family: monospace;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		padding: 4px 10px;
		box-shadow: none;
	}

	:global(.fc-crimpy .fc-button:hover) {
		background-color: #f5f5f5;
		border-color: black;
		color: black;
	}

	:global(.fc-crimpy .fc-button:focus) {
		box-shadow: none;
	}

	:global(.fc-crimpy .fc-button-active),
	:global(.fc-crimpy .fc-button-primary:not(:disabled):active) {
		background-color: black;
		border-color: black;
		color: white;
	}

	:global(.fc-crimpy .fc-col-header-cell) {
		border-color: #e5e7eb;
		padding: 6px 0;
	}

	:global(.fc-crimpy .fc-col-header-cell-cushion) {
		font-weight: 600;
		color: #333;
		text-decoration: none;
	}

	:global(.fc-crimpy .fc-daygrid-day) {
		min-height: 0;
	}

	:global(.fc-crimpy .fc-daygrid-day-number) {
		font-size: 12px;
		color: #333;
		text-decoration: none;
		padding: 4px 6px;
	}

	:global(.fc-crimpy .fc-day-today) {
		background-color: transparent !important;
	}

	:global(.fc-crimpy .fc-day-today .fc-daygrid-day-number) {
		background-color: #C6613F;
		color: white;
		border-radius: 0;
	}

	:global(.fc-crimpy .fc-daygrid-event) {
		background: transparent;
		border: none;
		margin: 1px 2px;
	}

	:global(.fc-crimpy .fc-daygrid-event-dot) {
		display: none;
	}

	:global(.fc-crimpy .fc-event-title) {
		display: none;
	}

	:global(.fc-crimpy .fc-scrollgrid) {
		border-color: #e5e7eb;
	}

	:global(.fc-crimpy td, .fc-crimpy th) {
		border-color: #e5e7eb;
	}
</style>
