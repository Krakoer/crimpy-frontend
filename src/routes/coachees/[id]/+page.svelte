<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { mondayOf } from '$lib/date';
	import { goto } from '$app/navigation';
	import type {
		SessionResponse,
		EnrolledUser,
		AssessmentResponse,
		Program,
		ProgramRequest
	} from '$lib/api/client';
	import AssessmentChart from '$lib/components/AssessmentChart.svelte';
	import { ASSESSMENT_TYPES } from '$lib/assessments';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	let coachee = $state<EnrolledUser | null>(null);
	let sessions = $state<SessionResponse[]>([]);
	let assessments = $state<AssessmentResponse[]>([]);
	let loading = $state(false);
	let error = $state('');

	let activeTab = $state<'sessions' | 'programs' | 'assess' | 'notes'>('sessions');

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
			assessments.some((a) => a.Type === type && a.GripPosition === g)
		);
	}

	function historyForGrip(type: number, grip: number): AssessmentResponse[] {
		return assessments
			.filter((a) => a.Type === type && a.GripPosition === grip)
			.sort((a, b) => new Date(a.UpdatedAt).getTime() - new Date(b.UpdatedAt).getTime());
	}

	function latestForGrip(type: number, grip: number): AssessmentResponse | undefined {
		return historyForGrip(type, grip).at(-1);
	}

	function hasAnyAssessment(type: number): boolean {
		return assessments.some((a) => a.Type === type);
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

	const SESSION_TYPES: Record<number, { label: string; color: string; tint: string }> = {
		0: { label: 'CR', color: '#c2714f', tint: '#f5e2d7' },
		1: { label: 'CL', color: '#d4a15e', tint: '#faf0dc' },
		2: { label: 'ST', color: '#6b8f71', tint: '#e3ede4' },
		3: { label: 'WO', color: '#907b99', tint: '#ede8f0' }
	};

	function sessionType(type: number) {
		return SESSION_TYPES[type] ?? { label: '??', color: '#888', tint: '#eee' };
	}

	function isSameDay(a: Date, b: Date): boolean {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function getWeekStart(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay();
		const diff = day === 0 ? -6 : 1 - day;
		d.setDate(d.getDate() + diff);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	let weekOffset = $state(0);
	let selectedDay = $state<Date | null>(null);

	const weekStripDays = $derived.by(() => {
		const today = new Date();
		const baseStart = getWeekStart(today);
		const weekStart = new Date(baseStart);
		weekStart.setDate(baseStart.getDate() + weekOffset * 7);
		return Array.from({ length: 7 }, (_, i) => {
			const date = new Date(weekStart);
			date.setDate(weekStart.getDate() + i);
			const daySessions = sessions.filter((s) => isSameDay(new Date(s.Date), date));
			return {
				date,
				dayLabel: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
				day: date.getDate(),
				isToday: isSameDay(date, today),
				isSelected: selectedDay !== null && isSameDay(date, selectedDay),
				dots: daySessions.map((s) => SESSION_TYPES[s.SessionType]?.color ?? '#888')
			};
		});
	});

	const weekStripLabel = $derived.by(() => {
		const today = new Date();
		const baseStart = getWeekStart(today);
		const weekStart = new Date(baseStart);
		weekStart.setDate(baseStart.getDate() + weekOffset * 7);
		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 6);
		const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
		return `${fmt(weekStart)} - ${fmt(weekEnd)}`;
	});

	function toggleDayFilter(date: Date) {
		if (selectedDay !== null && isSameDay(date, selectedDay)) {
			selectedDay = null;
		} else {
			selectedDay = date;
		}
	}

	const displayedSessions = $derived(
		selectedDay ? sessions.filter((s) => isSameDay(new Date(s.Date), selectedDay!)) : sessions
	);

	type ProgramStatus = { state: 'upcoming' | 'active' | 'completed'; week: number };

	function programStatus(startDate: string, durationWeeks?: number): ProgramStatus {
		const diffMs = Date.now() - new Date(startDate).getTime();
		if (diffMs < 0) return { state: 'upcoming', week: 0 };
		const week = Math.max(1, Math.ceil(diffMs / (7 * 86400000)));
		if (durationWeeks && week > durationWeeks) return { state: 'completed', week: durationWeeks };
		return { state: 'active', week };
	}

	const activeProgram = $derived(
		programs.find((p) => programStatus(p.start_date, p.duration_weeks).state === 'active') ??
			programs.find((p) => programStatus(p.start_date, p.duration_weeks).state === 'upcoming') ??
			null
	);

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
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m`;
		return `${seconds}s`;
	}

	function formatProgramDate(date: string): string {
		return new Date(date).toLocaleDateString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatAssessmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
				start_date: mondayOf(newProgramStartDate),
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
			sessions = clientSessions;
			assessments = clientAssessments ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data.';
		} finally {
			loading = false;
		}
		loadPrograms();
	});

	const sessionGroups = $derived(groupSessionsByDate(displayedSessions));

	const coacheeName = $derived(
		coachee
			? `${coachee.user_firstname} ${coachee.user_lastname}`
			: loading
				? 'Loading...'
				: 'Coachee'
	);

	const coacheeInitials = $derived(
		coachee ? (coachee.user_firstname[0] + coachee.user_lastname[0]).toUpperCase() : '?'
	);

	const totalAssessmentCount = $derived(assessments.length);

	const assessmentHistory = $derived(
		[...assessments]
			.sort((a, b) => new Date(b.UpdatedAt).getTime() - new Date(a.UpdatedAt).getTime())
			.slice(0, 8)
	);
</script>

<AppShell
	title={coacheeName}
	breadcrumbs={[
		{ label: 'Studio' },
		{ label: 'Coachees', href: '/coachees' },
		{ label: coacheeName }
	]}
>
	{#snippet actions()}
		<button
			onclick={() => goto('/coachees')}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 6px 12px; border-radius: var(--rs);
				background: #fff; color: var(--tx); border: 1px solid var(--bd);
				font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
			"
		>
			<Icon name="arrow-left" size={14} color="var(--tx2)" />
			All coachees
		</button>
	{/snippet}

	<div style="padding: 24px 32px 40px;">
		{#if error}
			<div
				style="margin-bottom: 16px; padding: 14px 18px; border-radius: var(--rs);
					background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;
					font-size: 13px;"
			>
				{error}
			</div>
		{/if}

		{#if loading}
			<div style="display: flex; align-items: center; gap: 10px; padding: 40px 0;">
				<div
					class="animate-spin"
					style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%;"
				></div>
				<span style="font-size: 13px; color: var(--tx2);">Loading...</span>
			</div>
		{:else}
			<!-- Header card -->
			<div
				style="
			background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
			padding: 24px; box-shadow: var(--sh); margin-bottom: 20px;
			display: grid; grid-template-columns: auto 1fr auto; gap: 24px; align-items: center;
			background-image: linear-gradient(135deg, var(--pr-fog) 0%, transparent 40%);
		"
			>
				<div
					style="
				width: 64px; height: 64px; border-radius: 50%;
				background: var(--pr-lt); color: var(--pr);
				display: flex; align-items: center; justify-content: center;
				font-size: 22px; font-weight: 700; flex-shrink: 0;
			"
				>
					{coacheeInitials}
				</div>

				<div>
					<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
						<h2
							style="font-size: 22px; font-weight: 700; color: var(--tx); letter-spacing: -0.02em;"
						>
							{coacheeName}
						</h2>
						<span
							style="
						display: inline-flex; align-items: center; padding: 2px 8px;
						border-radius: 999px; font-size: 11px; font-weight: 600;
						background: var(--pr-fog); color: var(--pr);
					">Active</span
						>
					</div>
					<div style="display: flex; gap: 18px; font-size: 12.5px; color: var(--tx2);">
						{#if coachee?.user_email}
							<span>{coachee.user_email}</span>
						{/if}
						<span>{sessions.length} sessions logged</span>
					</div>
				</div>

				<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
					{#each [{ k: 'Sessions', v: String(sessions.length), c: 'var(--pr)' }, { k: 'Assessments', v: String(totalAssessmentCount), c: 'var(--gn)' }, { k: 'Programs', v: String(programs.length), c: 'var(--gd)' }] as stat (stat.k)}
						<div
							style="
						padding: 10px 14px; border: 1px solid var(--bd);
						border-radius: var(--rs); background: #fff; min-width: 80px; text-align: center;
					"
						>
							<div
								style="font-size: 10.5px; color: var(--tx3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;"
							>
								{stat.k}
							</div>
							<div style="font-size: 20px; font-weight: 700; color: {stat.c}; margin-top: 2px;">
								{stat.v}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Tabs -->
			<div
				style="display: flex; gap: 4px; border-bottom: 1px solid var(--bd); padding: 0 4px; margin-bottom: 20px;"
			>
				{#each [{ id: 'sessions', label: 'Sessions', n: sessions.length }, { id: 'programs', label: 'Programs', n: programs.length }, { id: 'assess', label: 'Assessments', n: totalAssessmentCount }, { id: 'notes', label: 'Notes', n: 0 }] as tab (tab.id)}
					<button
						onclick={() => (activeTab = tab.id as typeof activeTab)}
						style="
						padding: 12px 16px; font-size: 13.5px; font-weight: 600;
						border: none; background: transparent; cursor: pointer;
						color: {activeTab === tab.id ? 'var(--pr)' : 'var(--tx2)'};
						border-bottom: 2px solid {activeTab === tab.id ? 'var(--pr)' : 'transparent'};
						margin-bottom: -1px; font-family: var(--font);
						display: flex; align-items: center; gap: 7px;
					"
					>
						{tab.label}
						<span
							style="
						font-size: 11px; padding: 1px 7px; border-radius: 999px; font-weight: 600;
						background: {activeTab === tab.id ? 'var(--pr-fog)' : 'var(--bd2)'};
						color: {activeTab === tab.id ? 'var(--pr)' : 'var(--tx3)'};
					">{tab.n}</span
						>
					</button>
				{/each}
			</div>

			<!-- Sessions tab -->
			{#if activeTab === 'sessions'}
				<div
					style="display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; align-items: flex-start;"
				>
					<!-- Left column -->
					<div style="display: flex; flex-direction: column; gap: 16px;">
						<!-- Week strip -->
						<div
							style="
						background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
						padding: 16px; box-shadow: var(--sh);
					"
						>
							<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
								<button
									onclick={() => {
										weekOffset -= 1;
										selectedDay = null;
									}}
									style="width: 28px; height: 28px; border-radius: var(--rs); border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"
								>
									<Icon name="arrow-left" size={13} color="var(--tx2)" />
								</button>
								<div
									style="flex: 1; text-align: center; font-size: 13.5px; font-weight: 700; color: var(--tx);"
								>
									{weekStripLabel}
								</div>
								<button
									onclick={() => {
										weekOffset += 1;
										selectedDay = null;
									}}
									style="width: 28px; height: 28px; border-radius: var(--rs); border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transform: rotate(180deg);"
								>
									<Icon name="arrow-left" size={13} color="var(--tx2)" />
								</button>
								{#if weekOffset !== 0}
									<button
										onclick={() => {
											weekOffset = 0;
											selectedDay = null;
										}}
										style="font-size: 11.5px; color: var(--pr); font-weight: 600; background: none; border: none; cursor: pointer; font-family: var(--font); flex-shrink: 0;"
										>Today</button
									>
								{/if}
							</div>
							<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;">
								{#each weekStripDays as day (day.date.getTime())}
									<div
										role="button"
										tabindex="0"
										onclick={() => toggleDayFilter(day.date)}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												toggleDayFilter(day.date);
											}
										}}
										style="
										padding: 10px 4px; border-radius: var(--rs); text-align: center; cursor: pointer;
										background: {day.isSelected ? 'var(--pr)' : day.isToday ? 'var(--pr-fog)' : 'var(--panel2)'};
										border: 1px solid {day.isSelected ? 'var(--pr)' : day.isToday ? 'var(--pr-lt)' : 'transparent'};
										transition: background 0.1s;
									"
									>
										<div
											style="font-size: 10px; color: {day.isSelected
												? '#fff'
												: day.isToday
													? 'var(--pr)'
													: 'var(--tx3)'}; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;"
										>
											{day.dayLabel}
										</div>
										<div
											style="font-size: 16px; font-weight: 700; color: {day.isSelected
												? '#fff'
												: day.isToday
													? 'var(--pr)'
													: 'var(--tx)'}; margin-top: 2px;"
										>
											{day.day}
										</div>
										<div
											style="display: flex; justify-content: center; gap: 3px; margin-top: 6px; min-height: 8px;"
										>
											{#each day.dots as dotColor, i (i)}
												<div
													style="width: 5px; height: 5px; border-radius: 50%; background: {day.isSelected
														? 'rgba(255,255,255,0.7)'
														: dotColor};"
												></div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
							{#if selectedDay}
								<div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
									<span style="font-size: 12px; color: var(--pr); font-weight: 600;">
										Filtering: {selectedDay.toLocaleDateString('en-GB', {
											weekday: 'long',
											day: 'numeric',
											month: 'long'
										})}
									</span>
									<button
										onclick={() => (selectedDay = null)}
										style="font-size: 11.5px; color: var(--tx3); background: none; border: none; cursor: pointer; font-family: var(--font);"
										>Clear</button
									>
								</div>
							{/if}
						</div>

						<!-- Sessions list -->
						<div
							style="
						background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
						box-shadow: var(--sh); overflow: hidden;
					"
						>
							<div
								style="
							padding: 14px 20px; border-bottom: 1px solid var(--bd2);
							display: flex; align-items: center; justify-content: space-between;
						"
							>
								<h3 style="font-size: 14px; font-weight: 700; color: var(--tx);">
									{selectedDay ? 'Sessions on this day' : 'All sessions'}
								</h3>
								<span style="font-size: 12px; color: var(--tx3);"
									>{displayedSessions.length} session{displayedSessions.length !== 1
										? 's'
										: ''}</span
								>
							</div>

							{#if displayedSessions.length === 0}
								<div
									style="padding: 32px 20px; text-align: center; color: var(--tx3); font-size: 13px;"
								>
									{selectedDay ? 'No sessions on this day.' : 'No sessions recorded yet.'}
								</div>
							{:else}
								<div>
									{#each sessionGroups as group (group.label)}
										<div
											style="padding: 10px 20px 0; font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
										>
											{group.label}
										</div>
										{#each group.items as session (session.ID)}
											{@const type = sessionType(session.SessionType)}
											<div
												style="
											display: grid; grid-template-columns: 44px 1fr auto;
											padding: 12px 20px; align-items: center; gap: 12px;
											border-bottom: 1px solid var(--bd2);
										"
											>
												<div
													style="
												width: 44px; height: 44px; border-radius: var(--rs);
												background: {type.tint}; color: {type.color};
												display: flex; align-items: center; justify-content: center;
												font-size: 11px; font-weight: 700; flex-shrink: 0;
											"
												>
													{type.label}
												</div>
												<div style="min-width: 0;">
													<div
														style="font-size: 13.5px; font-weight: 600; color: var(--tx); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
													>
														{session.Name}
													</div>
													<div style="font-size: 12px; color: var(--tx2);">
														{formatTime(session.Date)} · {formatDuration(session.Duration)}
													</div>
													{#if session.Notes?.trim()}
														<div
															style="font-size: 11.5px; color: var(--tx3); margin-top: 3px; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
														>
															"{session.Notes}"
														</div>
													{/if}
												</div>
												<Icon name="chevron" size={16} color="var(--tx3)" />
											</div>
										{/each}
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Right column -->
					<div style="display: flex; flex-direction: column; gap: 12px;">
						<div
							style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px;"
						>
							<h3
								style="font-size: 12px; font-weight: 700; color: var(--tx2); letter-spacing: 0.06em; text-transform: uppercase;"
							>
								Assessments
							</h3>
							<button
								onclick={() => (activeTab = 'assess')}
								style="font-size: 12.5px; color: var(--pr); font-weight: 600; background: none; border: none; cursor: pointer; font-family: var(--font);"
								>View all</button
							>
						</div>

						{#each [0, 1, 2] as type (type)}
							{#if hasAnyAssessment(type)}
								{@const typeInfo = ASSESSMENT_TYPES[type]}
								{@const grip = selectedGrip[type]}
								{@const latest = latestForGrip(type, grip)}
								{@const grips = availableGrips(type)}
								<div
									style="
								background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
								padding: 16px; box-shadow: var(--sh);
							"
								>
									<div
										style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px;"
									>
										<div style="font-size: 12px; font-weight: 600; color: var(--tx);">
											{typeInfo.label}
										</div>
										<div style="font-size: 11px; color: var(--tx3);">{typeInfo.unit}</div>
									</div>
									{#if grips.length > 0}
										<div style="font-size: 11px; color: var(--tx3); margin-bottom: 10px;">
											{GRIP_POSITIONS[grip]}
										</div>
									{/if}
									<div style="display: flex; gap: 20px; align-items: center;">
										<div>
											<div
												style="font-size: 10px; color: var(--gn); font-weight: 600; letter-spacing: 0.06em;"
											>
												LEFT
											</div>
											<div
												style="font-size: 22px; font-weight: 700; color: var(--tx); line-height: 1;"
											>
												{formatVal(latest?.LeftValue, type)}
											</div>
										</div>
										<div>
											<div
												style="font-size: 10px; color: var(--pr); font-weight: 600; letter-spacing: 0.06em;"
											>
												RIGHT
											</div>
											<div
												style="font-size: 22px; font-weight: 700; color: var(--tx); line-height: 1;"
											>
												{formatVal(latest?.RightValue, type)}
											</div>
										</div>
									</div>
								</div>
							{/if}
						{/each}

						{#if totalAssessmentCount === 0}
							<div
								style="
							background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
							padding: 24px 16px; text-align: center; color: var(--tx3); font-size: 13px;
						"
							>
								No assessments yet.
							</div>
						{/if}

						<!-- Active/upcoming program card -->
						{#if activeProgram}
							{@const ps = programStatus(activeProgram.start_date, activeProgram.duration_weeks)}
							{@const totalWks = activeProgram.duration_weeks}
							{@const progress = totalWks ? Math.min(ps.week / totalWks, 1) : 0}
							<button
								onclick={() => goto(`/coachees/${data.id}/programs/${activeProgram.id}`)}
								style="
								background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
								padding: 16px; box-shadow: var(--sh); cursor: pointer; text-align: left;
								transition: border-color 0.15s; width: 100%; font-family: var(--font);
							"
								onmouseenter={(e) => (e.currentTarget.style.borderColor = 'var(--pr)')}
								onmouseleave={(e) => (e.currentTarget.style.borderColor = 'var(--bd)')}
							>
								<div
									style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;"
								>
									<div
										style="font-size: 11px; font-weight: 600; color: var(--tx); letter-spacing: 0.04em; text-transform: uppercase;"
									>
										{ps.state === 'upcoming' ? 'Upcoming program' : 'Active program'}
									</div>
									{#if ps.state === 'active'}
										<span
											style="
										display: inline-flex; padding: 2px 8px; border-radius: 999px;
										font-size: 11px; font-weight: 600;
										background: #e3ede4; color: var(--gn);
									">Week {ps.week}{totalWks ? ` / ${totalWks}` : ''}</span
										>
									{:else if ps.state === 'upcoming'}
										<span
											style="
										display: inline-flex; padding: 2px 8px; border-radius: 999px;
										font-size: 11px; font-weight: 600; background: var(--bd2); color: var(--tx3);
									">Starts soon</span
										>
									{/if}
								</div>
								<div
									style="font-size: 14.5px; font-weight: 600; color: var(--tx); margin-bottom: 4px;"
								>
									{activeProgram.name}
								</div>
								{#if activeProgram.objective}
									<div style="font-size: 12.5px; color: var(--tx2); margin-bottom: 12px;">
										{activeProgram.objective}
									</div>
								{/if}
								{#if totalWks && ps.state === 'active'}
									<div
										style="height: 5px; background: var(--bd2); border-radius: 3px; overflow: hidden; margin-bottom: 10px;"
									>
										<div
											style="width: {(progress * 100).toFixed(
												0
											)}%; height: 100%; background: var(--pr); border-radius: 3px;"
										></div>
									</div>
								{/if}
								<div
									style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--pr); font-weight: 600;"
								>
									Open program
									<Icon name="chevron" size={13} color="var(--pr)" />
								</div>
							</button>
						{/if}
					</div>
				</div>

				<!-- Programs tab -->
			{:else if activeTab === 'programs'}
				<div style="display: flex; flex-direction: column; gap: 14px;">
					<div style="display: flex; align-items: center; justify-content: space-between;">
						<div style="font-size: 13px; color: var(--tx2);">
							<span style="font-weight: 600; color: var(--tx);"
								>{programs.length} program{programs.length === 1 ? '' : 's'}</span
							>
						</div>
						<button
							onclick={() => {
								showNewProgramForm = true;
								newProgramError = '';
							}}
							style="
							display: inline-flex; align-items: center; gap: 6px;
							padding: 7px 14px; border-radius: var(--rs);
							background: var(--pr); color: #fff; border: none;
							font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
						"
						>
							<Icon name="plus" size={14} color="#fff" />
							New program
						</button>
					</div>

					{#if showNewProgramForm}
						<div
							style="
						background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
						box-shadow: var(--sh); overflow: hidden;
					"
						>
							<div
								style="height: 3px; background: linear-gradient(90deg, var(--pr), var(--gd));"
							></div>
							<div style="padding: 22px 24px;">
								<h3
									style="font-size: 16px; font-weight: 700; color: var(--tx); margin-bottom: 4px;"
								>
									New program
								</h3>
								<p style="font-size: 13px; color: var(--tx2); margin-bottom: 18px;">
									Create a multi-week training program for this coachee.
								</p>
								{#if newProgramError}
									<div
										style="margin-bottom: 12px; padding: 10px 14px; border-radius: var(--rs); background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; font-size: 13px;"
									>
										{newProgramError}
									</div>
								{/if}
								<div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px;">
									<div>
										<label
											for="new-program-name"
											style="font-size: 11.5px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 5px;"
											>Program name *</label
										>
										<input
											type="text"
											id="new-program-name"
											bind:value={newProgramName}
											placeholder="e.g. Summer Bouldering Block"
											style="width: 100%; padding: 10px 14px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 14px; color: var(--tx); outline: none; background: #fff;"
										/>
									</div>
									<div>
										<label
											for="new-program-objective"
											style="font-size: 11.5px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 5px;"
											>Objective</label
										>
										<textarea
											id="new-program-objective"
											bind:value={newProgramObjective}
											placeholder="What's the goal?"
											rows={2}
											style="width: 100%; padding: 10px 14px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; resize: none; background: #fff;"
										></textarea>
									</div>
									<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
										<div>
											<label
												for="new-program-start-date"
												style="font-size: 11.5px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 5px;"
												>Start date *</label
											>
											<input
												type="date"
												id="new-program-start-date"
												bind:value={newProgramStartDate}
												style="width: 100%; padding: 10px 14px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
											/>
											<span
												style="font-size: 11px; color: var(--tx3); display: block; margin-top: 4px;"
												>Snapped to the Monday of the chosen week.</span
											>
										</div>
										<div>
											<label
												for="new-program-duration"
												style="font-size: 11.5px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 5px;"
												>Duration</label
											>
											<div style="display: flex; align-items: center; gap: 8px;">
												<input
													type="number"
													id="new-program-duration"
													bind:value={newProgramDurationWeeks}
													min="1"
													max="52"
													placeholder="--"
													style="width: 80px; padding: 10px 14px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
												/>
												<span style="font-size: 13px; color: var(--tx2);">weeks</span>
											</div>
										</div>
									</div>
								</div>
								<div style="display: flex; justify-content: flex-end; gap: 8px;">
									<button
										onclick={() => {
											showNewProgramForm = false;
											newProgramName = '';
											newProgramStartDate = '';
											newProgramObjective = '';
											newProgramDurationWeeks = '';
											newProgramError = '';
										}}
										style="padding: 8px 16px; border-radius: var(--rs); border: 1px solid var(--bd); background: #fff; color: var(--tx); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);"
										>Cancel</button
									>
									<button
										onclick={handleCreateProgram}
										disabled={savingProgram}
										style="
										display: inline-flex; align-items: center; gap: 6px;
										padding: 8px 16px; border-radius: var(--rs);
										background: var(--pr); color: #fff; border: none;
										font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
										opacity: {savingProgram ? 0.7 : 1};
									"
									>
										<Icon name="plus" size={14} color="#fff" />
										{savingProgram ? 'Creating...' : 'Create program'}
									</button>
								</div>
							</div>
						</div>
					{/if}

					{#if programsLoading}
						<div style="display: flex; align-items: center; gap: 10px; padding: 24px 0;">
							<div
								class="animate-spin"
								style="width: 14px; height: 14px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%;"
							></div>
							<span style="font-size: 13px; color: var(--tx2);">Loading...</span>
						</div>
					{:else if programs.length === 0 && !showNewProgramForm}
						<div
							style="
						background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
						padding: 40px 24px; text-align: center;
					"
						>
							<div style="font-size: 13px; color: var(--tx3); margin-bottom: 12px;">
								No programs yet.
							</div>
							<button
								onclick={() => {
									showNewProgramForm = true;
									newProgramError = '';
								}}
								style="
								display: inline-flex; align-items: center; gap: 6px;
								padding: 8px 16px; border-radius: var(--rs);
								background: var(--pr); color: #fff; border: none;
								font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
							"
							>
								<Icon name="plus" size={14} color="#fff" />
								Create first program
							</button>
						</div>
					{:else}
						{#each programs as program (program.id)}
							{@const ps = programStatus(program.start_date, program.duration_weeks)}
							{@const totalWks = program.duration_weeks}
							<div
								role="button"
								tabindex="0"
								onclick={(e) => {
									if (!(e.target as HTMLElement).closest('button'))
										goto(`/coachees/${data.id}/programs/${program.id}`);
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter') goto(`/coachees/${data.id}/programs/${program.id}`);
								}}
								style="
								background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
								box-shadow: var(--sh); overflow: hidden; transition: border-color 0.15s; cursor: pointer;
							"
								onmouseenter={(e) => (e.currentTarget.style.borderColor = 'rgba(194,113,79,0.4)')}
								onmouseleave={(e) => (e.currentTarget.style.borderColor = 'var(--bd)')}
							>
								{#if ps.state === 'active'}
									<div
										style="height: 3px; background: linear-gradient(90deg, var(--pr), var(--gd));"
									></div>
								{/if}
								<div style="padding: 18px 22px; display: flex; gap: 20px; align-items: center;">
									<div style="flex: 1; min-width: 0;">
										<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
											<span
												style="font-size: 16px; font-weight: 700; color: var(--tx); letter-spacing: -0.01em;"
												>{program.name}</span
											>
											{#if ps.state === 'active'}
												<span
													style="
												display: inline-flex; padding: 2px 8px; border-radius: 999px;
												font-size: 11px; font-weight: 600; background: #e3ede4; color: var(--gn);
											">Active · Week {ps.week}</span
												>
											{:else if ps.state === 'upcoming'}
												<span
													style="
												display: inline-flex; padding: 2px 8px; border-radius: 999px;
												font-size: 11px; font-weight: 600; background: var(--pr-fog); color: var(--pr);
											">Upcoming</span
												>
											{:else}
												<span
													style="
												display: inline-flex; padding: 2px 8px; border-radius: 999px;
												font-size: 11px; font-weight: 600; background: var(--bd2); color: var(--tx3);
											">Completed</span
												>
											{/if}
										</div>
										{#if program.objective}
											<div style="font-size: 12.5px; color: var(--tx2); margin-bottom: 6px;">
												{program.objective}
											</div>
										{/if}
										<div style="display: flex; gap: 12px; font-size: 12px; color: var(--tx3);">
											<span>Started {formatProgramDate(program.start_date)}</span>
											{#if program.duration_weeks}
												<span>·</span>
												<span>{program.duration_weeks} weeks</span>
											{/if}
										</div>
									</div>

									<div style="display: flex; gap: 10px; align-items: center; flex-shrink: 0;">
										{#if ps.state === 'active' && totalWks}
											<div
												style="width: 60px; display: flex; flex-direction: column; align-items: center; gap: 4px;"
											>
												<div
													style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
												>
													PROGRESS
												</div>
												<div
													style="width: 100%; height: 5px; background: var(--bd2); border-radius: 3px; overflow: hidden;"
												>
													<div
														style="width: {Math.min((ps.week / totalWks) * 100, 100).toFixed(
															0
														)}%; height: 100%; background: var(--pr); border-radius: 3px;"
													></div>
												</div>
												<div style="font-size: 10px; color: var(--tx3);">{ps.week}/{totalWks}</div>
											</div>
										{/if}

										{#if confirmDeleteProgramId === program.id}
											<button
												onclick={() => handleDeleteProgram(program.id)}
												disabled={deletingProgram}
												style="padding: 6px 12px; border-radius: var(--rs); border: 1px solid var(--rd); color: var(--rd); background: #fff5f5; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);"
												>{deletingProgram ? '...' : 'Confirm'}</button
											>
											<button
												onclick={() => (confirmDeleteProgramId = null)}
												style="padding: 6px 12px; border-radius: var(--rs); border: 1px solid var(--bd); color: var(--tx); background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);"
												>Cancel</button
											>
										{:else}
											<button
												onclick={() => (confirmDeleteProgramId = program.id)}
												style="width: 32px; height: 32px; border-radius: var(--rs); border: 1px solid var(--bd); color: var(--tx3); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
												onmouseenter={(e) => {
													e.currentTarget.style.borderColor = 'var(--rd)';
													e.currentTarget.style.color = 'var(--rd)';
												}}
												onmouseleave={(e) => {
													e.currentTarget.style.borderColor = 'var(--bd)';
													e.currentTarget.style.color = 'var(--tx3)';
												}}
												title="Delete program"
											>
												<Icon name="trash" size={14} color="currentColor" />
											</button>
											<Icon name="chevron" size={16} color="var(--tx3)" />
										{/if}
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Assessments tab -->
			{:else if activeTab === 'assess'}
				<div style="display: flex; flex-direction: column; gap: 14px;">
					<div style="display: flex; align-items: center; justify-content: space-between;">
						<div style="font-size: 13px; color: var(--tx2);">
							<span style="font-weight: 600; color: var(--tx);">{totalAssessmentCount} records</span
							>
						</div>
					</div>

					{#if totalAssessmentCount === 0}
						<div
							style="
						background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
						padding: 40px 24px; text-align: center; color: var(--tx3); font-size: 13px;
					"
						>
							No assessment records yet. Assessments are recorded through the Crimpy mobile app.
						</div>
					{:else}
						<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
							{#each [0, 1, 2] as type (type)}
								{#if hasAnyAssessment(type)}
									{@const typeInfo = ASSESSMENT_TYPES[type]}
									{@const grips = availableGrips(type)}
									{@const grip = selectedGrip[type]}
									{@const latest = latestForGrip(type, grip)}
									{@const history = historyForGrip(type, grip)}
									<div
										style="
									background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
									padding: 20px; box-shadow: var(--sh);
								"
									>
										<div
											style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px;"
										>
											<div style="font-size: 13px; font-weight: 700; color: var(--tx);">
												{typeInfo.label}
											</div>
											<div style="font-size: 11px; color: var(--tx3);">{typeInfo.unit}</div>
										</div>

										{#if grips.length > 1}
											<div style="display: flex; gap: 4px; margin-bottom: 8px; overflow-x: auto;">
												{#each grips as g (g)}
													<button
														onclick={() => (selectedGrip[type] = g)}
														style="
														padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600;
														border: none; cursor: pointer; white-space: nowrap; font-family: var(--font);
														background: {g === grip ? 'var(--pr-fog)' : 'var(--bd2)'};
														color: {g === grip ? 'var(--pr)' : 'var(--tx3)'};
													">{GRIP_POSITIONS[g]}</button
													>
												{/each}
											</div>
										{:else if grips.length === 1}
											<div style="font-size: 11px; color: var(--tx3); margin-bottom: 10px;">
												{GRIP_POSITIONS[grips[0]]}
											</div>
										{/if}

										<div style="display: flex; gap: 20px; margin-bottom: 14px;">
											<div>
												<div
													style="font-size: 10px; color: var(--gn); font-weight: 600; letter-spacing: 0.06em;"
												>
													LEFT
												</div>
												<div
													style="font-size: 26px; font-weight: 700; color: var(--tx); line-height: 1;"
												>
													{formatVal(latest?.LeftValue, type)}
												</div>
											</div>
											<div>
												<div
													style="font-size: 10px; color: var(--pr); font-weight: 600; letter-spacing: 0.06em;"
												>
													RIGHT
												</div>
												<div
													style="font-size: 26px; font-weight: 700; color: var(--tx); line-height: 1;"
												>
													{formatVal(latest?.RightValue, type)}
												</div>
											</div>
										</div>

										{#if history.length >= 2}
											<button
												onclick={() => (showGraph[type] = !showGraph[type])}
												style="
												font-size: 11.5px; color: {showGraph[type] ? 'var(--pr)' : 'var(--tx3)'};
												background: none; border: none; cursor: pointer; padding: 0;
												font-family: var(--font); font-weight: 600; margin-bottom: 8px;
											">{showGraph[type] ? 'Hide chart' : 'Show chart'}</button
											>
										{/if}

										{#if showGraph[type] && history.length >= 2}
											<div style="border-top: 1px solid var(--bd2); padding-top: 8px;">
												<AssessmentChart
													{history}
													unit={typeInfo.unit}
													formatValue={typeInfo.format}
												/>
											</div>
										{/if}

										{#if history.length >= 2}
											{@const first =
												type === 0 ? (history[0].RightValue ?? 0) : (history[0].RightValue ?? 0)}
											{@const last =
												type === 0
													? (history[history.length - 1].RightValue ?? 0)
													: (history[history.length - 1].RightValue ?? 0)}
											{@const delta = last - first}
											<div
												style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--tx3); margin-top: 6px;"
											>
												<span>{history.length} records</span>
												<span>·</span>
												<span
													style="color: {delta >= 0 ? 'var(--gn)' : 'var(--rd)'}; font-weight: 600;"
												>
													{delta >= 0 ? '+' : ''}{typeInfo.format(delta)}
													{typeInfo.unit} overall
												</span>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						</div>

						<!-- Assessment history table -->
						<div
							style="
						background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
						box-shadow: var(--sh); overflow: hidden;
					"
						>
							<div
								style="
							padding: 14px 20px; border-bottom: 1px solid var(--bd2);
							display: flex; align-items: center; justify-content: space-between;
						"
							>
								<h3 style="font-size: 14px; font-weight: 700; color: var(--tx);">
									Assessment history
								</h3>
							</div>
							<div
								style="
							display: grid; grid-template-columns: 90px 1.4fr 1fr 0.7fr 0.7fr;
							padding: 10px 20px; border-bottom: 1px solid var(--bd2);
							font-size: 10.5px; color: var(--tx3); font-weight: 600;
							letter-spacing: 0.06em; text-transform: uppercase;
							background: var(--panel2);
						"
							>
								<div>Date</div>
								<div>Type</div>
								<div>Grip</div>
								<div style="text-align: right;">Left</div>
								<div style="text-align: right;">Right</div>
							</div>
							{#each assessmentHistory as a, i (a.ID)}
								{@const typeInfo = ASSESSMENT_TYPES[a.Type]}
								<div
									style="
								display: grid; grid-template-columns: 90px 1.4fr 1fr 0.7fr 0.7fr;
								padding: 11px 20px; align-items: center;
								border-bottom: {i < assessmentHistory.length - 1 ? '1px solid var(--bd2)' : 'none'};
								font-size: 13px;
							"
								>
									<div style="color: var(--tx2); font-size: 12px;">
										{formatAssessmentDate(a.UpdatedAt)}
									</div>
									<div style="font-weight: 600; color: var(--tx);">
										{typeInfo?.label ?? `Type ${a.Type}`}
									</div>
									<div style="color: var(--tx3); font-size: 12px;">
										{GRIP_POSITIONS[a.GripPosition] ?? `Grip ${a.GripPosition}`}
									</div>
									<div style="text-align: right; font-weight: 600;">
										{a.LeftValue !== null ? typeInfo?.format(a.LeftValue) : '--'}
									</div>
									<div style="text-align: right; font-weight: 600;">
										{a.RightValue !== null ? typeInfo?.format(a.RightValue) : '--'}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Notes tab -->
			{:else if activeTab === 'notes'}
				<div
					style="
				background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
				padding: 48px 24px; text-align: center; box-shadow: var(--sh);
			"
				>
					<div style="font-size: 32px; margin-bottom: 12px; opacity: 0.2;">
						<Icon name="edit" size={40} color="var(--tx)" />
					</div>
					<div style="font-size: 15px; font-weight: 600; color: var(--tx); margin-bottom: 6px;">
						Notes coming soon
					</div>
					<div style="font-size: 13px; color: var(--tx3);">
						Coach notes and annotations will appear here.
					</div>
				</div>
			{/if}
		{/if}
	</div>
</AppShell>
