<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { SessionResponse, EnrolledUser } from '$lib/api/client';

	let { data } = $props();

	let coachee = $state<EnrolledUser | null>(null);
	let sessions = $state<SessionResponse[]>([]);
	let loading = $state(false);
	let error = $state('');

	let calendarEl = $state<HTMLElement | undefined>(undefined);

	const SESSION_TYPES: Record<number, { label: string; color: string }> = {
		0: { label: 'CR', color: '#C6613F' },
		1: { label: 'CL', color: '#D4A644' },
		2: { label: 'ST', color: '#5A8C5A' },
		3: { label: 'WO', color: '#8B6B9E' }
	};

	const SESSION_NAMES: Record<number, string> = {
		0: 'Crimpy Training',
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

	function sessionEndDate(session: SessionResponse): string {
		return new Date(new Date(session.Date).getTime() + session.Duration * 1000).toISOString();
	}

	onMount(async () => {
		authStore.initialize();
		loading = true;
		try {
			const [enrollments, clientSessions] = await Promise.all([
				apiClient.getEnrollments(),
				apiClient.getClientSessions(data.id!)
			]);
			coachee = enrollments.find((e) => e.user_id === data.id!) ?? null;
			sessions = clientSessions.filter((s) => s.DeletedAt === null);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data.';
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		if (!calendarEl || loading || sessions.length === undefined) return;

		let destroyed = false;
		let calendar: import('@fullcalendar/core').Calendar;

		(async () => {
			const { Calendar } = await import('@fullcalendar/core');
			const { default: timeGridPlugin } = await import('@fullcalendar/timegrid');

			if (destroyed || !calendarEl) return;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			calendar = new Calendar(calendarEl, {
				plugins: [timeGridPlugin],
				initialView: 'timeGridWeek',
				firstDay: 1,
				allDaySlot: false,
				headerToolbar: {
					left: 'prev,next today',
					center: 'title',
					right: ''
				},
				editable: false,
				selectable: false,
				eventStartEditable: false,
				events: sessions.map((s) => ({
					id: s.ID,
					title: SESSION_NAMES[s.SessionType] ?? s.Name,
					start: s.Date,
					end: sessionEndDate(s),
					backgroundColor: sessionType(s.SessionType).color,
					borderColor: sessionType(s.SessionType).color,
					textColor: '#ffffff'
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

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-5xl">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
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

		<!-- FullCalendar week view -->
		<div class="mb-8 border-2 border-black bg-white">
			{#if loading}
				<div class="flex items-center gap-3 p-6">
					<div
						class="animate-spin"
						style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
					></div>
					<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
				</div>
			{:else}
				<div bind:this={calendarEl} class="fc-crimpy"></div>
			{/if}
		</div>

		<!-- Session list -->
		{#if !loading}
			{#if sessions.length === 0}
				<p style="font-family: monospace; font-size: 13px; color: #666;">
					No sessions recorded yet.
				</p>
			{:else}
				<div class="space-y-6">
					{#each sessionGroups as group}
						<div>
							<p
								class="mb-3 font-medium"
								style="font-family: monospace; font-size: 11px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;"
							>
								{group.label}
							</p>
							<div class="space-y-2">
								{#each group.items as session (session.ID)}
									{@const type = sessionType(session.SessionType)}
									<div class="flex items-start gap-4 border border-gray-200 bg-white p-3">
										<!-- Type icon box -->
										<div
											class="flex shrink-0 items-center justify-center"
											style="width: 40px; height: 40px; background-color: {hexWithOpacity(type.color, 0.15)}; border: 1px solid {hexWithOpacity(type.color, 0.3)};"
										>
											<span
												style="font-family: monospace; font-size: 11px; font-weight: 700; color: {type.color}; letter-spacing: 0.5px;"
											>
												{type.label}
											</span>
										</div>

										<!-- Session details -->
										<div class="min-w-0 flex-1">
											<p class="mb-1 font-semibold" style="font-family: monospace; font-size: 14px;">
												{session.Name}
											</p>
											<div class="flex gap-4" style="font-family: monospace; font-size: 12px; color: #666;">
												<span>{formatTime(session.Date)}</span>
												<span>{formatDuration(session.Duration)}</span>
											</div>
											{#if session.Notes?.trim()}
												<p
													class="mt-1 line-clamp-2"
													style="font-family: monospace; font-size: 12px; color: #555;"
												>
													{session.Notes}
												</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* Override FullCalendar styles to match the app's sharp monospace aesthetic */
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

	:global(.fc-crimpy .fc-timegrid-slot) {
		height: 40px;
		border-color: #f0f0f0;
	}

	:global(.fc-crimpy .fc-timegrid-slot-label) {
		color: #999;
		font-size: 10px;
	}

	:global(.fc-crimpy .fc-event) {
		border-radius: 0;
		border-width: 0;
		font-family: monospace;
		font-size: 11px;
	}

	:global(.fc-crimpy .fc-event-title) {
		font-weight: 600;
	}

	:global(.fc-crimpy .fc-scrollgrid) {
		border-color: #e5e7eb;
	}

	:global(.fc-crimpy td, .fc-crimpy th) {
		border-color: #e5e7eb;
	}
</style>
