<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { CoachSessionRequest, Exercise } from '$lib/api/client';
	import ItemList from '$lib/components/session/ItemList.svelte';

	let exercises = $state<Exercise[]>([]);
	let draft = $state<CoachSessionRequest>({ title: '', description: '', items: [] });
	let saving = $state(false);
	let saveError = $state('');

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

		apiClient.getExercises().then((ex) => (exercises = ex)).catch(() => {});
	});

	async function handleSave() {
		if (!draft.title.trim()) return;
		saving = true;
		saveError = '';
		try {
			const session = await apiClient.createCoachSession({
				title: draft.title.trim(),
				description: draft.description?.trim() || undefined,
				items: draft.items
			});
			goto(`/sessions/${session.id}`);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save session.';
			saving = false;
		}
	}
</script>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl p-6">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<div>
				<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
					NEW SESSION
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
				disabled={saving || !draft.title.trim()}
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
	</div>
</div>
