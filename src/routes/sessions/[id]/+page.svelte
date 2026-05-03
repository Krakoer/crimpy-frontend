<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { CoachSessionRequest, Exercise } from '$lib/api/client';
	import ItemList from '$lib/components/session/ItemList.svelte';

	let sessionId = $derived($page.params.id as string);

	let exercises = $state<Exercise[]>([]);
	let draft = $state<CoachSessionRequest>({ title: '', description: '', items: [] });
	let loading = $state(true);
	let saving = $state(false);
	let saveError = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let editingMeta = $state(false);
	let editTitle = $state('');
	let editDescription = $state('');

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
			editTitle = session.title;
			editDescription = session.description ?? '';
			exercises = ex;
			loading = false;
		}).catch(() => {
			goto('/sessions');
		});
	});

	function enterEditMode() {
		editTitle = draft.title;
		editDescription = draft.description ?? '';
		editingMeta = true;
	}

	async function handleSave() {
		const title = editingMeta ? editTitle.trim() : draft.title.trim();
		if (!title) return;
		saving = true;
		saveError = '';
		try {
			if (editingMeta) {
				draft.title = title;
				draft.description = editDescription.trim();
			}
			await apiClient.updateCoachSession(sessionId, {
				title: draft.title.trim(),
				description: draft.description?.trim() || undefined,
				items: draft.items
			});
			editingMeta = false;
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
		<div class="mb-8 border-b-2 border-black pb-4">
			<button
				onclick={() => goto('/sessions')}
				style="font-family: monospace; font-size: 12px; color: #666;"
				class="mb-2 block transition-colors hover:text-black"
			>
				&larr; sessions
			</button>
			<div class="flex items-start justify-between gap-4">
				<div class="flex-1">
					{#if editingMeta}
						<div class="space-y-2">
							<input
								type="text"
								bind:value={editTitle}
								class="w-full border-2 border-black px-3 py-2 text-2xl font-black outline-none focus:border-[#C6613F]"
								style="font-family: monospace; letter-spacing: -0.5px;"
								placeholder="Session title"
							/>
							<textarea
								bind:value={editDescription}
								rows="2"
								class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
								style="font-family: monospace; font-size: 13px;"
								placeholder="Optional description"
							></textarea>
						</div>
					{:else}
						<div class="flex items-baseline gap-3">
							<h1
								class="text-3xl font-black"
								style="font-family: monospace; letter-spacing: -0.5px;"
							>
								{draft.title || 'Untitled'}
							</h1>
							<button
								onclick={enterEditMode}
								class="border border-gray-300 px-2 py-0.5 text-gray-500 transition-colors hover:border-black hover:text-black"
								style="font-family: monospace; font-size: 11px;"
							>
								edit
							</button>
						</div>
						{#if draft.description}
							<p class="mt-1" style="font-family: monospace; font-size: 13px; color: #888;">
								{draft.description}
							</p>
						{/if}
					{/if}
				</div>
				<button
					onclick={handleSave}
					disabled={saving || loading || (editingMeta ? !editTitle.trim() : !draft.title.trim())}
					class="shrink-0 border-2 px-4 py-2 font-bold transition-colors disabled:opacity-50"
					style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
				>
					{saving ? 'SAVING...' : 'SAVE'}
				</button>
			</div>
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
