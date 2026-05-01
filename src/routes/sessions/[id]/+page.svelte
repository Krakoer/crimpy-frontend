<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { CoachSessionRequest, Exercise } from '$lib/api/client';
	import ItemList from '$lib/components/session/ItemList.svelte';

	let sessionId = $derived($page.params.id);

	let exercises = $state<Exercise[]>([]);
	let draft = $state<CoachSessionRequest>({ title: '', description: '', items: [] });
	let loading = $state(true);
	let saving = $state(false);
	let saveError = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);

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

		Promise.all([
			apiClient.getCoachSession(sessionId),
			apiClient.getExercises().catch(() => [])
		]).then(([session, ex]) => {
			draft = { title: session.title, description: session.description ?? '', items: session.items };
			exercises = ex;
			loading = false;
		}).catch(() => {
			goto('/sessions');
		});
	});

	async function handleSave() {
		if (!draft.title.trim()) return;
		saving = true;
		saveError = '';
		try {
			await apiClient.updateCoachSession(sessionId, {
				title: draft.title.trim(),
				description: draft.description?.trim() || undefined,
				items: draft.items
			});
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save session.';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		deleting = true;
		try {
			await apiClient.deleteCoachSession(sessionId);
			goto('/sessions');
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to delete session.';
			deleting = false;
		}
	}
</script>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl p-6">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<div>
				<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
					EDIT SESSION
				</h1>
				<button
					onclick={() => goto('/sessions')}
					style="font-family: monospace; font-size: 12px; color: #666;"
					class="transition-colors hover:text-black"
				>
					&larr; Sessions
				</button>
			</div>
			<button
				onclick={handleSave}
				disabled={saving || loading || !draft.title.trim()}
				class="border-2 px-4 py-2 font-bold transition-colors disabled:opacity-50"
				style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
			>
				{saving ? 'SAVING...' : 'SAVE SESSION'}
			</button>
		</div>

		{#if saveError}
			<div
				class="mb-4 border border-red-600 bg-red-50 p-3"
				style="font-family: monospace; font-size: 12px; color: #B85450;"
			>
				{saveError}
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
		{:else}
			<div class="mb-6 space-y-4">
				<div>
					<label
						class="mb-1 block font-medium"
						style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
					>
						TITLE *
					</label>
					<input
						type="text"
						bind:value={draft.title}
						class="w-full border-2 border-black px-3 py-2 text-xl font-bold outline-none focus:border-[#C6613F]"
						style="font-family: monospace;"
						placeholder="Session title"
					/>
				</div>
				<div>
					<label
						class="mb-1 block font-medium"
						style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
					>
						DESCRIPTION
					</label>
					<textarea
						bind:value={draft.description}
						rows="2"
						class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
						style="font-family: monospace; font-size: 13px;"
						placeholder="Optional description"
					></textarea>
				</div>
			</div>

			<div class="mb-2">
				<h2 class="font-bold" style="font-family: monospace; font-size: 12px; letter-spacing: 0.5px; color: #666;">
					CONTENT
				</h2>
			</div>

			<ItemList bind:items={draft.items} {exercises} />

			<div class="mt-12 border-t border-gray-200 pt-6">
				{#if confirmDelete}
					<p class="mb-3" style="font-family: monospace; font-size: 13px; color: #666;">
						Delete this session permanently?
					</p>
					<div class="flex gap-3">
						<button
							onclick={handleDelete}
							disabled={deleting}
							class="border border-red-600 px-4 py-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
							style="font-family: monospace; font-size: 13px;"
						>
							{deleting ? 'DELETING...' : 'CONFIRM DELETE'}
						</button>
						<button
							onclick={() => (confirmDelete = false)}
							class="border border-black px-4 py-2 transition-colors hover:bg-gray-100"
							style="font-family: monospace; font-size: 13px;"
						>
							CANCEL
						</button>
					</div>
				{:else}
					<button
						onclick={() => (confirmDelete = true)}
						class="text-red-600 transition-colors hover:underline"
						style="font-family: monospace; font-size: 13px;"
					>
						Delete session
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
