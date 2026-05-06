<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { CoachSessionSummary } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';

	let sessions = $state<CoachSessionSummary[]>([]);
	let loading = $state(false);
	let confirmDeleteId = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state('');

	onMount(() => {
		authStore.initialize();

		if (!authStore.isAuthenticated) {
			goto('/');
			return;
		}
		if (!authStore.isEmailVerified) {
			goto('/verify-email');
			return;
		}
		if (!authStore.isValidatedCoach) {
			goto('/dashboard');
			return;
		}

		loadSessions();
	});

	async function loadSessions() {
		loading = true;
		try {
			sessions = await apiClient.getCoachSessions();
		} finally {
			loading = false;
		}
	}

	async function handleDelete(id: string) {
		deleting = true;
		deleteError = '';
		try {
			await apiClient.deleteCoachSession(id);
			sessions = sessions.filter((s) => s.id !== id);
			confirmDeleteId = null;
			snackbar.show('Session deleted');
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Failed to delete session.';
		} finally {
			deleting = false;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-4xl p-6">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<div>
				<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
					SESSIONS
				</h1>
				<button
					onclick={() => goto('/dashboard')}
					style="font-family: monospace; font-size: 12px; color: #666;"
					class="transition-colors hover:text-black"
				>
					&larr; Dashboard
				</button>
			</div>
			<button
				onclick={() => goto('/sessions/new')}
				class="border-2 px-4 py-2 font-bold transition-colors"
				style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
			>
				+ NEW SESSION
			</button>
		</div>

		{#if deleteError}
			<div
				class="mb-4 border border-red-600 bg-red-50 p-3"
				style="font-family: monospace; font-size: 12px; color: #B85450;"
			>
				{deleteError}
			</div>
		{/if}

		{#if loading}
			<div class="flex items-center gap-3 py-12">
				<div
					class="animate-spin"
					style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
				></div>
				<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
			</div>
		{:else if sessions.length === 0}
			<div class="py-12 text-center">
				<p style="font-family: monospace; font-size: 13px; color: #666;">
					No sessions yet. Create your first one.
				</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-200 border border-black">
				{#each sessions as session (session.id)}
					<div class="p-4">
						<div class="flex items-start justify-between gap-4">
							<button
								onclick={() => goto(`/sessions/${session.id}`)}
								class="min-w-0 flex-1 text-left transition-colors hover:text-gray-600"
							>
								<p class="font-bold" style="font-family: monospace; font-size: 14px;">
									{session.title}
								</p>
								{#if session.description}
									<p
										class="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
										style="font-family: monospace; font-size: 12px; color: #666; max-width: 60ch;"
									>
										{session.description}
									</p>
								{/if}
								<p class="mt-1" style="font-family: monospace; font-size: 11px; color: #999;">
									Created {formatDate(session.created_at)}
								</p>
							</button>
							<div class="flex shrink-0 gap-2">
								{#if confirmDeleteId === session.id}
									<button
										onclick={() => handleDelete(session.id)}
										disabled={deleting}
										class="border border-red-600 px-3 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
										style="font-family: monospace; font-size: 12px;"
									>
										{deleting ? '...' : 'CONFIRM'}
									</button>
									<button
										onclick={() => (confirmDeleteId = null)}
										class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
										style="font-family: monospace; font-size: 12px;"
									>
										CANCEL
									</button>
								{:else}
									<button
										onclick={() => (confirmDeleteId = session.id)}
										class="border border-gray-300 px-3 py-1 text-gray-500 transition-colors hover:border-red-600 hover:text-red-600"
										style="font-family: monospace; font-size: 12px;"
									>
										DELETE
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
