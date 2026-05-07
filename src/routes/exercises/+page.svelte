<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { Exercise, ExerciseRequest } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';

	let exercises = $state<Exercise[]>([]);
	let loading = $state(false);
	let search = $state('');
	let favoritesOnly = $state(false);

	type PanelMode = null | 'new' | Exercise;
	let panel = $state<PanelMode>(null);
	let viewExercise = $state<Exercise | null>(null);

	let form = $state<ExerciseRequest>({ name: '', description: '', comment: '', video_link: '' });
	let saving = $state(false);
	let saveError = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);

	let filtered = $derived.by(() => {
		const base = favoritesOnly ? exercises.filter((e) => e.is_favorite) : exercises;
		const q = search.trim().toLowerCase();
		return q ? base.filter((e) => e.name.toLowerCase().includes(q)) : base;
	});

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

		loadExercises();
	});

	async function loadExercises() {
		loading = true;
		try {
			exercises = await apiClient.getExercises();
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		form = { name: '', description: '', comment: '', video_link: '' };
		saveError = '';
		confirmDelete = false;
		panel = 'new';
	}

	function openEdit(exercise: Exercise) {
		form = {
			name: exercise.name,
			description: exercise.description ?? '',
			comment: exercise.comment ?? '',
			video_link: exercise.video_link ?? ''
		};
		saveError = '';
		confirmDelete = false;
		panel = exercise;
	}

	function closePanel() {
		panel = null;
	}

	async function handleSave() {
		if (!form.name.trim()) return;
		saving = true;
		saveError = '';
		try {
			const data: ExerciseRequest = {
				name: form.name.trim(),
				description: form.description?.trim() || undefined,
				comment: form.comment?.trim() || undefined,
				video_link: form.video_link?.trim() || undefined
			};
			if (panel === 'new') {
				await apiClient.createExercise(data);
				snackbar.show('Exercise created');
			} else if (panel && typeof panel === 'object') {
				await apiClient.updateExercise(panel.id, data);
				snackbar.show('Exercise saved');
			}
			await loadExercises();
			closePanel();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save exercise.';
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (viewExercise) viewExercise = null;
			else if (panel) closePanel();
		}
	}

	async function handleDelete() {
		if (!panel || panel === 'new' || typeof panel !== 'object') return;
		deleting = true;
		try {
			await apiClient.deleteExercise(panel.id);
			snackbar.show('Exercise deleted');
			await loadExercises();
			closePanel();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to delete exercise.';
		} finally {
			deleting = false;
		}
	}

	async function toggleFavorite(exercise: Exercise) {
		try {
			const updated = await apiClient.setExerciseFavorite(exercise.id, !exercise.is_favorite);
			const idx = exercises.findIndex((e) => e.id === exercise.id);
			if (idx !== -1) exercises[idx] = updated;
			if (viewExercise?.id === exercise.id) viewExercise = updated;
		} catch {
			snackbar.show('Failed to update favorite');
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-6xl p-6">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<div>
				<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
					EXERCISES
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
				onclick={openCreate}
				class="border-2 border-black px-4 py-2 font-bold transition-colors hover:bg-black hover:text-white"
				style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
			>
				+ NEW EXERCISE
			</button>
		</div>

		<div class="mb-6 flex gap-2">
			<input
				type="text"
				placeholder="Search exercises..."
				bind:value={search}
				class="flex-1 border border-black px-3 py-2 outline-none focus:border-2"
				style="font-family: monospace; font-size: 13px;"
			/>
			<button
				onclick={() => (favoritesOnly = !favoritesOnly)}
				class="border-2 px-3 py-2 font-bold transition-colors"
				style="font-family: monospace; font-size: 13px; {favoritesOnly ? 'background-color: #C6613F; color: white; border-color: #C6613F;' : 'border-color: black; color: black;'}"
			>
				FAV
			</button>
		</div>

		{#if loading}
			<div class="flex items-center gap-3 py-12">
				<div
					class="animate-spin"
					style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
				></div>
				<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
			</div>
		{:else if filtered.length === 0}
			<div class="py-12 text-center">
				<p style="font-family: monospace; font-size: 13px; color: #666;">
					{favoritesOnly
						? search
							? 'No favorites match your search.'
							: 'No favorites yet.'
						: search
							? 'No exercises match your search.'
							: 'No exercises yet. Create your first one.'}
				</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-200 border border-black">
				{#each filtered as exercise (exercise.id)}
					<div class="flex items-stretch">
						<button
							onclick={() => (viewExercise = exercise)}
							class="flex-1 p-4 text-left transition-colors hover:bg-gray-50"
						>
							<p class="font-bold" style="font-family: monospace; font-size: 14px;">
								{exercise.name}
							</p>
							{#if exercise.description}
								<p
									class="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
									style="font-family: monospace; font-size: 12px; color: #666; max-width: 60ch;"
								>
									{exercise.description}
								</p>
							{/if}
						</button>
						<button
							onclick={() => toggleFavorite(exercise)}
							class="border-l border-gray-200 px-4 transition-colors hover:bg-gray-50"
							title={exercise.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
							style="font-family: monospace; font-size: 12px; color: {exercise.is_favorite ? '#C6613F' : '#bbb'};"
						>
							fav
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if viewExercise !== null}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: rgba(0,0,0,0.4);"
		role="dialog"
		aria-modal="true"
	>
		<div class="w-full max-w-md border-2 border-black bg-white">
			<div class="flex items-center justify-between border-b border-black px-6 py-4">
				<h2 class="font-black" style="font-family: monospace; font-size: 16px; letter-spacing: -0.5px;">
					{viewExercise.name}
				</h2>
				<button
					onclick={() => (viewExercise = null)}
					class="text-gray-400 transition-colors hover:text-black"
					style="font-family: monospace; font-size: 18px; line-height: 1;"
					aria-label="Close"
				>
					x
				</button>
			</div>

			<div class="space-y-4 px-6 py-5">
				{#if viewExercise.description}
					<div>
						<p
							class="mb-1 font-medium"
							style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
						>
							DESCRIPTION
						</p>
						<p style="font-family: monospace; font-size: 13px;">{viewExercise.description}</p>
					</div>
				{/if}

				{#if viewExercise.comment}
					<div>
						<p
							class="mb-1 font-medium"
							style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
						>
							EXECUTION NOTES
						</p>
						<p style="font-family: monospace; font-size: 13px;">{viewExercise.comment}</p>
					</div>
				{/if}

				{#if viewExercise.video_link}
					<div>
						<p
							class="mb-1 font-medium"
							style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
						>
							VIDEO
						</p>
						<a
							href={viewExercise.video_link}
							target="_blank"
							rel="noopener noreferrer"
							class="underline transition-colors hover:text-gray-600"
							style="font-family: monospace; font-size: 13px;"
						>
							{viewExercise.video_link}
						</a>
					</div>
				{/if}

				{#if !viewExercise.description && !viewExercise.comment && !viewExercise.video_link}
					<p style="font-family: monospace; font-size: 13px; color: #bbb;">No details added.</p>
				{/if}
			</div>

			<div class="flex gap-3 border-t border-black px-6 py-4">
				<button
					onclick={() => {
						const ex = viewExercise;
						viewExercise = null;
						if (ex) openEdit(ex);
					}}
					class="flex-1 border-2 px-4 py-2 font-bold transition-colors"
					style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
				>
					EDIT
				</button>
				<button
					onclick={() => { if (viewExercise) toggleFavorite(viewExercise); }}
					class="border-2 px-4 py-2 font-bold transition-colors"
					style="font-family: monospace; font-size: 13px; {viewExercise?.is_favorite ? 'background-color: #C6613F; color: white; border-color: #C6613F;' : 'border-color: black; color: black;'}"
				>
					{viewExercise?.is_favorite ? 'UNFAV' : 'FAV'}
				</button>
				<button
					onclick={() => (viewExercise = null)}
					class="border border-black px-4 py-2 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 13px;"
				>
					CLOSE
				</button>
			</div>
		</div>
	</div>
{/if}

{#if panel !== null}
	<div class="fixed inset-0 z-10 flex">
		<!-- Backdrop -->
		<button
			class="flex-1 bg-black/20"
			onclick={closePanel}
			aria-label="Close panel"
		></button>

		<!-- Panel -->
		<div class="flex w-full max-w-md flex-col border-l-2 border-black bg-white">
			<div class="flex items-center justify-between border-b border-black px-6 py-4">
				<h2 class="font-bold" style="font-family: monospace; font-size: 14px; letter-spacing: 0.5px;">
					{panel === 'new' ? 'NEW EXERCISE' : 'EDIT EXERCISE'}
				</h2>
				<button
					onclick={closePanel}
					class="border border-black px-2 py-1 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 12px;"
				>
					X
				</button>
			</div>

			<div class="flex-1 overflow-y-auto px-6 py-4">
				{#if saveError}
					<div
						class="mb-4 border border-red-600 bg-red-50 p-3"
						style="font-family: monospace; font-size: 12px; color: #B85450;"
					>
						{saveError}
					</div>
				{/if}

				<div class="space-y-4">
					<div>
						<label
							class="mb-1 block font-medium"
							style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
						>
							NAME *
						</label>
						<input
							type="text"
							bind:value={form.name}
							class="w-full border border-black px-3 py-2 outline-none focus:border-2"
							style="font-family: monospace; font-size: 13px;"
							placeholder="Exercise name"
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
							bind:value={form.description}
							rows="3"
							class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
							style="font-family: monospace; font-size: 13px;"
							placeholder="What this exercise is"
						></textarea>
					</div>

					<div>
						<label
							class="mb-1 block font-medium"
							style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
						>
							EXECUTION NOTES
						</label>
						<textarea
							bind:value={form.comment}
							rows="3"
							class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
							style="font-family: monospace; font-size: 13px;"
							placeholder="How to perform it correctly"
						></textarea>
					</div>

					<div>
						<label
							class="mb-1 block font-medium"
							style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;"
						>
							VIDEO LINK
						</label>
						<input
							type="url"
							bind:value={form.video_link}
							class="w-full border border-black px-3 py-2 outline-none focus:border-2"
							style="font-family: monospace; font-size: 13px;"
							placeholder="https://..."
						/>
					</div>
				</div>
			</div>

			<div class="border-t border-black px-6 py-4">
				<div class="flex gap-3">
					<button
						onclick={handleSave}
						disabled={saving || !form.name.trim()}
						class="flex-1 border-2 px-4 py-2 font-bold transition-colors disabled:opacity-50"
						style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
					>
						{saving ? 'SAVING...' : 'SAVE'}
					</button>
					<button
						onclick={closePanel}
						class="border border-black px-4 py-2 transition-colors hover:bg-gray-100"
						style="font-family: monospace; font-size: 13px;"
					>
						CANCEL
					</button>
				</div>

				{#if panel !== 'new' && typeof panel === 'object'}
					<div class="mt-4 border-t border-gray-200 pt-4">
						{#if confirmDelete}
							<p class="mb-2" style="font-family: monospace; font-size: 12px; color: #666;">
								Delete this exercise permanently?
							</p>
							<div class="flex gap-2">
								<button
									onclick={handleDelete}
									disabled={deleting}
									class="border border-red-600 px-3 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
									style="font-family: monospace; font-size: 12px;"
								>
									{deleting ? 'DELETING...' : 'CONFIRM DELETE'}
								</button>
								<button
									onclick={() => (confirmDelete = false)}
									class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
									style="font-family: monospace; font-size: 12px;"
								>
									CANCEL
								</button>
							</div>
						{:else}
							<button
								onclick={() => (confirmDelete = true)}
								class="text-red-600 transition-colors hover:underline"
								style="font-family: monospace; font-size: 12px;"
							>
								Delete exercise
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
