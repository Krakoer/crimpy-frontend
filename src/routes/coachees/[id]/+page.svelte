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

	const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

	function getWeekDays(): Date[] {
		const today = new Date();
		const dayOfWeek = today.getDay();
		const monday = new Date(today);
		monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date(monday);
			d.setDate(monday.getDate() + i);
			return d;
		});
	}

	function isSameDay(a: Date, b: Date): boolean {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function hasSessionOnDay(day: Date): boolean {
		return sessions.some((s) => isSameDay(new Date(s.Date), day));
	}

	function groupSessionsByDate(sessions: SessionResponse[]): { label: string; items: SessionResponse[] }[] {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);

		const sorted = [...sessions].sort(
			(a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()
		);

		const groups = new Map<string, SessionResponse[]>();
		for (const session of sorted) {
			const d = new Date(session.Date);
			let key: string;
			if (isSameDay(d, today)) {
				key = 'Today';
			} else if (isSameDay(d, yesterday)) {
				key = 'Yesterday';
			} else {
				key = d.toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' });
			}
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(session);
		}

		return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		const h = d.getHours().toString().padStart(2, '0');
		const m = d.getMinutes().toString().padStart(2, '0');
		return `${h}h${m}`;
	}

	function formatDuration(seconds: number): string {
		return `${Math.round(seconds / 60)}mn`;
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

	let weekDays = $derived(getWeekDays());
	let sessionGroups = $derived(groupSessionsByDate(sessions));

	function handleLogout() {
		authStore.logout();
		goto('/');
	}
</script>

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-3xl">
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

		<!-- Week calendar -->
		<div class="mb-6 border-2 border-black bg-white p-4">
			<div class="grid grid-cols-7 gap-1">
				{#each weekDays as day, i}
					{@const isToday = isSameDay(day, new Date())}
					{@const hasSessions = hasSessionOnDay(day)}
					<div class="flex flex-col items-center gap-1 py-2">
						<span
							style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px;"
						>
							{DAY_LETTERS[i]}
						</span>
						<span
							class="flex h-7 w-7 items-center justify-center font-medium"
							style="font-family: monospace; font-size: 13px; {isToday
								? 'background-color: #C6613F; color: white;'
								: 'color: #333;'}"
						>
							{day.getDate()}
						</span>
						<span
							style="width: 6px; height: 6px; border-radius: 50%; background-color: {hasSessions
								? '#333'
								: 'transparent'};"
						></span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Sessions list -->
		{#if loading}
			<div class="flex items-center gap-3 py-6">
				<div
					class="animate-spin"
					style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
				></div>
				<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
			</div>
		{:else if sessions.length === 0}
			<p style="font-family: monospace; font-size: 13px; color: #666;">No sessions recorded yet.</p>
		{:else}
			<div class="space-y-6">
				{#each sessionGroups as group}
					<div>
						<p
							class="mb-2 font-medium"
							style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
						>
							{group.label}
						</p>
						<div class="space-y-2">
							{#each group.items as session (session.ID)}
								<div class="flex items-center justify-between border border-gray-300 bg-gray-50 px-4 py-3">
									<span class="font-medium" style="font-family: monospace; font-size: 13px;">
										{session.Name}
									</span>
									<div class="flex gap-4" style="font-family: monospace; font-size: 12px; color: #666;">
										<span>{formatTime(session.Date)}</span>
										<span>{formatDuration(session.Duration)}</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
