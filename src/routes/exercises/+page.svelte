<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { Exercise, ExerciseRequest, Tag } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import TagSelect from '$lib/components/TagSelect.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';

	const PAGE_SIZE = 20;

	let exercises = $state<Exercise[]>([]);
	let total = $state(0);
	let currentOffset = $state(0);
	let allTags = $state<Tag[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let search = $state('');
	let favoritesOnly = $state(false);
	let filterTagIds = $state<string[]>([]);

	let hasMore = $derived(!favoritesOnly && exercises.length < total);

	type PanelMode = null | 'new' | Exercise;
	let panel = $state<PanelMode>(null);
	let viewExercise = $state<Exercise | null>(null);

	let form = $state<ExerciseRequest>({ name: '', description: '', comment: '', video_link: '' });
	let selectedTags = $state<Tag[]>([]);
	let saving = $state(false);
	let saveError = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);

	let panelBaseline = $state<string | null>(null);

	function snapshotOf(formValue: ExerciseRequest, tags: Tag[]): string {
		return JSON.stringify({
			form: $state.snapshot(formValue),
			tagIds: tags.map((t) => t.id)
		});
	}

	function panelSnapshot(): string {
		return snapshotOf(form, selectedTags);
	}

	let isDirty = $derived(panelBaseline !== null && panelSnapshot() !== panelBaseline);

	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

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
		apiClient
			.getTags()
			.then((tags) => (allTags = tags))
			.catch(() => {});
	});

	async function loadExercises() {
		loading = true;
		currentOffset = 0;
		exercises = [];
		try {
			if (favoritesOnly) {
				const favs = await apiClient.getFavoriteExercises();
				exercises = applyLocalFilters(favs);
				total = exercises.length;
			} else {
				const page = await apiClient.getExercises({
					name: search.trim() || undefined,
					tags: filterTagIds.length > 0 ? filterTagIds : undefined,
					limit: PAGE_SIZE,
					offset: 0
				});
				exercises = page.exercises;
				total = page.total;
				currentOffset = page.exercises.length;
			}
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const page = await apiClient.getExercises({
				name: search.trim() || undefined,
				tags: filterTagIds.length > 0 ? filterTagIds : undefined,
				limit: PAGE_SIZE,
				offset: currentOffset
			});
			exercises = [...exercises, ...page.exercises];
			total = page.total;
			currentOffset += page.exercises.length;
		} finally {
			loadingMore = false;
		}
	}

	function applyLocalFilters(list: Exercise[]): Exercise[] {
		const q = search.trim().toLowerCase();
		let result = list;
		if (q) result = result.filter((e) => e.name.toLowerCase().includes(q));
		if (filterTagIds.length > 0) {
			result = result.filter((e) => filterTagIds.every((id) => e.tags?.some((t) => t.id === id)));
		}
		return result;
	}

	function handleSearchInput(value: string) {
		search = value;
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(loadExercises, 250);
	}

	function toggleFilterTag(id: string) {
		if (filterTagIds.includes(id)) {
			filterTagIds = filterTagIds.filter((t) => t !== id);
		} else {
			filterTagIds = [...filterTagIds, id];
		}
		loadExercises();
	}

	function toggleFavoritesOnly() {
		favoritesOnly = !favoritesOnly;
		loadExercises();
	}

	function openCreate() {
		form = { name: '', description: '', comment: '', video_link: '' };
		selectedTags = [];
		saveError = '';
		confirmDelete = false;
		panel = 'new';
		panelBaseline = panelSnapshot();
	}

	async function openEdit(exercise: Exercise) {
		const savedForm: ExerciseRequest = {
			name: exercise.name,
			description: exercise.description ?? '',
			comment: exercise.comment ?? '',
			video_link: exercise.video_link ?? ''
		};
		let savedTags = exercise.tags ?? [];
		form = { ...savedForm };
		selectedTags = savedTags;
		saveError = '';
		confirmDelete = false;
		panel = exercise;
		panelBaseline = snapshotOf(savedForm, savedTags);
		try {
			const full = await apiClient.getExercise(exercise.id);
			savedTags = full.tags ?? [];
			selectedTags = savedTags;
			panel = full;
			panelBaseline = snapshotOf(savedForm, savedTags);
		} catch {
			// use what we have
		}
	}

	function closePanel() {
		panel = null;
		panelBaseline = null;
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
				const exercise = await apiClient.createExercise(data);
				await Promise.all(
					selectedTags.map((t) => apiClient.assignTagToExercise(exercise.id, t.id))
				);
				snackbar.show('Exercise created');
			} else if (panel && typeof panel === 'object') {
				const exerciseId = panel.id;
				const prevTags = panel.tags ?? [];
				await apiClient.updateExercise(exerciseId, data);
				const prevIds = new Set(prevTags.map((t) => t.id));
				const newIds = new Set(selectedTags.map((t) => t.id));
				await Promise.all([
					...selectedTags
						.filter((t) => !prevIds.has(t.id))
						.map((t) => apiClient.assignTagToExercise(exerciseId, t.id)),
					...prevTags
						.filter((t) => !newIds.has(t.id))
						.map((t) => apiClient.unassignTagFromExercise(exerciseId, t.id))
				]);
				snackbar.show('Exercise saved');
			}
			await loadExercises();
			apiClient
				.getTags()
				.then((tags) => (allTags = tags))
				.catch(() => {});
			closePanel();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save exercise.';
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === 's' && panel) {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Escape') {
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

<AppShell title="Exercise library" breadcrumbs={[{ label: 'Studio' }, { label: 'Exercises' }]}>
	{#snippet actions()}
		<button
			onclick={openCreate}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 9px 16px; border-radius: var(--rs);
				background: var(--pr); color: #fff; border: 1px solid var(--pr);
				font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
			"
		>
			<Icon name="plus" size={14} color="#fff" />
			New exercise
		</button>
	{/snippet}

	<div
		style="padding: 24px 32px 40px; display: grid; grid-template-columns: 220px 1fr; gap: 18px; align-items: flex-start;"
	>
		<!-- Sidebar filter -->
		<aside style="position: sticky; top: 24px; display: flex; flex-direction: column; gap: 14px;">
			<!-- Category filters -->
			<div
				style="background: #fff; border: 1px solid var(--bd); border-radius: var(--rl); padding: 14px; box-shadow: var(--sh);"
			>
				<div
					style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;"
				>
					Favorites
				</div>
				<button
					onclick={toggleFavoritesOnly}
					style="
						display: flex; align-items: center; justify-content: space-between;
						width: 100%; padding: 7px 10px; border-radius: 6px;
						border: none; cursor: pointer; font-family: var(--font); font-size: 13px;
						background: {favoritesOnly ? 'var(--pr-fog)' : 'transparent'};
						color: {favoritesOnly ? 'var(--pr)' : 'var(--tx2)'};
						font-weight: {favoritesOnly ? 600 : 500};
					"
				>
					<span>Favorites only</span>
					{#if favoritesOnly}<Icon name="check" size={13} color="var(--pr)" />{/if}
				</button>
			</div>

			<!-- Tags -->
			{#if allTags.length > 0}
				<div
					style="background: #fff; border: 1px solid var(--bd); border-radius: var(--rl); padding: 14px; box-shadow: var(--sh);"
				>
					<div
						style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;"
					>
						Tags
					</div>
					<div style="display: flex; flex-wrap: wrap; gap: 6px;">
						{#each allTags as tag (tag.id)}
							{@const active = filterTagIds.includes(tag.id)}
							<button
								onclick={() => toggleFilterTag(tag.id)}
								style="
									font-size: 11px; padding: 4px 9px; border-radius: 999px;
									background: {active ? tag.color : 'var(--panel2)'};
									border: 1px solid {active ? tag.color : 'var(--bd)'};
									color: {active ? '#fff' : 'var(--tx2)'};
									font-weight: 500; cursor: pointer; font-family: var(--font);
								"
							>
								{tag.name}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</aside>

		<!-- Exercise list -->
		<div style="display: flex; flex-direction: column; gap: 14px;">
			<!-- Toolbar -->
			<div style="display: flex; align-items: center; justify-content: space-between;">
				<div style="font-size: 13px; color: var(--tx2);">
					<span style="color: var(--tx); font-weight: 600;">{exercises.length}</span>
					{#if total > exercises.length}
						<span style="color: var(--tx3);"> of {total} exercises</span>
					{:else}
						<span style="color: var(--tx3);"> exercise{exercises.length === 1 ? '' : 's'}</span>
					{/if}
				</div>
				<div
					style="
						display: flex; align-items: center; gap: 8px;
						background: #fff; border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 7px 10px; width: 240px;
					"
				>
					<Icon name="search" size={14} color="var(--tx3)" />
					<input
						type="text"
						placeholder="Search exercises..."
						value={search}
						oninput={(e) => handleSearchInput(e.currentTarget.value)}
						style="
							flex: 1; border: none; outline: none; background: transparent;
							font-family: var(--font); font-size: 13px; color: var(--tx);
						"
					/>
				</div>
			</div>

			{#if loading}
				<div
					style="display: flex; align-items: center; gap: 12px; padding: 32px 0; color: var(--tx3); font-size: 13px;"
				>
					<div
						style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite;"
					></div>
					Loading exercises...
				</div>
			{:else if exercises.length === 0}
				<div style="padding: 48px 0; text-align: center; color: var(--tx3); font-size: 13.5px;">
					{favoritesOnly
						? search
							? 'No favorites match your search.'
							: 'No favorites yet.'
						: search
							? 'No exercises match your search.'
							: 'No exercises yet. Create your first one.'}
				</div>
			{:else}
				<div
					style="background: #fff; border: 1px solid var(--bd); border-radius: var(--rl); overflow: hidden; box-shadow: var(--sh);"
				>
					{#each exercises as exercise, i (exercise.id)}
						<div
							style="
								display: flex; align-items: stretch;
								border-bottom: {i < exercises.length - 1 ? '1px solid var(--bd2)' : 'none'};
							"
						>
							<button
								onclick={() => (viewExercise = exercise)}
								style="
									flex: 1; padding: 14px 20px; text-align: left;
									background: none; border: none; cursor: pointer;
									font-family: var(--font);
								"
							>
								<div
									style="font-size: 14px; font-weight: 600; color: var(--tx); margin-bottom: 2px;"
								>
									{exercise.name}
								</div>
								{#if exercise.description}
									<div
										style="font-size: 12.5px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60ch;"
									>
										{exercise.description}
									</div>
								{/if}
								{#if exercise.tags?.length}
									<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
										{#each exercise.tags as tag (tag.id)}
											<span
												style="font-size: 10px; padding: 2px 7px; border-radius: 999px; color: #fff; background: {tag.color};"
											>
												{tag.name}
											</span>
										{/each}
									</div>
								{/if}
							</button>
							<button
								onclick={() => toggleFavorite(exercise)}
								title={exercise.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
								style="
									border-left: 1px solid var(--bd2); padding: 0 16px;
									background: none; cursor: pointer;
									color: {exercise.is_favorite ? 'var(--pr)' : 'var(--tx3)'};
									font-size: 12px; font-family: var(--font); font-weight: 600;
								"
							>
								<Icon
									name="star"
									size={16}
									color={exercise.is_favorite ? 'var(--pr)' : 'var(--tx3)'}
									fill={exercise.is_favorite ? 'var(--pr)' : 'none'}
								/>
							</button>
						</div>
					{/each}
				</div>

				{#if hasMore}
					<div style="text-align: center;">
						<button
							onclick={loadMore}
							disabled={loadingMore}
							style="
								border: 1px solid var(--bd); padding: 9px 24px; border-radius: var(--rs);
								background: #fff; color: var(--tx2); font-size: 13px; font-weight: 600;
								cursor: pointer; font-family: var(--font);
								opacity: {loadingMore ? 0.6 : 1};
							"
						>
							{loadingMore ? 'Loading...' : `Load more (${exercises.length} / ${total})`}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</AppShell>

<UnsavedChangesGuard dirty={isDirty} />

<!-- View exercise dialog -->
{#if viewExercise !== null}
	<div
		style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(45,36,29,0.4);"
		role="dialog"
		aria-modal="true"
	>
		<div
			style="
				width: 100%; max-width: 480px;
				background: #fff; border-radius: var(--rl);
				box-shadow: var(--sh-hi);
				border: 1px solid var(--bd);
				overflow: hidden;
			"
		>
			<div
				style="
					display: flex; align-items: center; justify-content: space-between;
					padding: 18px 24px; border-bottom: 1px solid var(--bd); gap: 12px;
				"
			>
				<div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
					<button
						onclick={() => {
							if (viewExercise) toggleFavorite(viewExercise);
						}}
						title={viewExercise?.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
						style="
							background: none; border: none; cursor: pointer; padding: 0;
							display: flex; align-items: center; flex-shrink: 0;
						"
					>
						<Icon
							name="star"
							size={20}
							color={viewExercise?.is_favorite ? 'var(--pr)' : 'var(--tx3)'}
							fill={viewExercise?.is_favorite ? 'var(--pr)' : 'none'}
						/>
					</button>
					<h2
						style="font-size: 16px; font-weight: 700; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
					>
						{viewExercise.name}
					</h2>
				</div>
				<button
					onclick={() => (viewExercise = null)}
					style="
						display: flex; align-items: center; justify-content: center;
						width: 28px; height: 28px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: #fff;
						cursor: pointer; color: var(--tx2); font-size: 16px; flex-shrink: 0;
					"
					aria-label="Close"
				>
					x
				</button>
			</div>

			<div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 14px;">
				{#if viewExercise.description}
					<div>
						<div
							style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;"
						>
							Description
						</div>
						<p style="font-size: 13.5px; color: var(--tx); line-height: 1.5;">
							{viewExercise.description}
						</p>
					</div>
				{/if}
				{#if viewExercise.comment}
					<div>
						<div
							style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;"
						>
							Execution notes
						</div>
						<p style="font-size: 13.5px; color: var(--tx); line-height: 1.5;">
							{viewExercise.comment}
						</p>
					</div>
				{/if}
				{#if viewExercise.video_link}
					<div>
						<div
							style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;"
						>
							Video
						</div>
						<a
							href={viewExercise.video_link}
							target="_blank"
							rel="noopener noreferrer"
							style="font-size: 13px; color: var(--pr); text-decoration: underline;"
						>
							{viewExercise.video_link}
						</a>
					</div>
				{/if}
				{#if !viewExercise.description && !viewExercise.comment && !viewExercise.video_link}
					<p style="font-size: 13.5px; color: var(--tx3);">No details added.</p>
				{/if}
			</div>

			<div
				style="
					display: flex; gap: 10px; padding: 16px 24px;
					border-top: 1px solid var(--bd);
				"
			>
				<button
					onclick={() => {
						const ex = viewExercise;
						viewExercise = null;
						if (ex) openEdit(ex);
					}}
					style="
						flex: 1; padding: 9px 16px; border-radius: var(--rs);
						background: var(--pr); color: #fff; border: 1px solid var(--pr);
						font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
					"
				>
					Edit
				</button>
				<button
					onclick={() => (viewExercise = null)}
					style="
						padding: 9px 16px; border-radius: var(--rs);
						background: #fff; color: var(--tx); border: 1px solid var(--bd);
						font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
					"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit/Create panel -->
{#if panel !== null}
	<div style="position: fixed; inset: 0; z-index: 40; display: flex;">
		<button
			style="flex: 1; background: rgba(45,36,29,0.2); border: none; cursor: pointer;"
			onclick={closePanel}
			aria-label="Close panel"
		></button>

		<div
			style="
				display: flex; flex-direction: column;
				width: 100%; max-width: 440px;
				border-left: 1px solid var(--bd); background: #fff;
				box-shadow: var(--sh-hi);
			"
		>
			<div
				style="
					display: flex; align-items: center; justify-content: space-between;
					padding: 18px 24px; border-bottom: 1px solid var(--bd);
					flex-shrink: 0;
				"
			>
				<h2 style="font-size: 15px; font-weight: 700; color: var(--tx);">
					{panel === 'new' ? 'New exercise' : 'Edit exercise'}
				</h2>
				<button
					onclick={closePanel}
					style="
						display: flex; align-items: center; justify-content: center;
						width: 28px; height: 28px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: #fff;
						cursor: pointer; font-size: 14px; color: var(--tx2);
					"
				>
					x
				</button>
			</div>

			<div
				style="flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;"
			>
				{#if saveError}
					<div
						style="border: 1px solid var(--rd); background: #fff5f5; border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
					>
						{saveError}
					</div>
				{/if}

				<div>
					<label
						for="ex-name"
						style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
					>
						Name *
					</label>
					<input
						id="ex-name"
						type="text"
						bind:value={form.name}
						placeholder="Exercise name"
						style="
							width: 100%; border: 1px solid var(--bd); border-radius: var(--rs);
							padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
							outline: none; background: #fff;
						"
					/>
				</div>

				<div>
					<label
						for="ex-description"
						style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
					>
						Description
					</label>
					<textarea
						id="ex-description"
						bind:value={form.description}
						rows="3"
						placeholder="What this exercise is"
						style="
							width: 100%; border: 1px solid var(--bd); border-radius: var(--rs);
							padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
							outline: none; background: #fff; resize: none;
						"
					></textarea>
				</div>

				<div>
					<label
						for="ex-comment"
						style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
					>
						Execution notes
					</label>
					<textarea
						id="ex-comment"
						bind:value={form.comment}
						rows="3"
						placeholder="How to perform it correctly"
						style="
							width: 100%; border: 1px solid var(--bd); border-radius: var(--rs);
							padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
							outline: none; background: #fff; resize: none;
						"
					></textarea>
				</div>

				<div>
					<label
						for="ex-video-link"
						style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
					>
						Video link
					</label>
					<input
						id="ex-video-link"
						type="url"
						bind:value={form.video_link}
						placeholder="https://..."
						style="
							width: 100%; border: 1px solid var(--bd); border-radius: var(--rs);
							padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
							outline: none; background: #fff;
						"
					/>
				</div>

				<div>
					<div
						style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
					>
						Tags
					</div>
					<TagSelect {selectedTags} onchange={(tags) => (selectedTags = tags)} />
				</div>
			</div>

			<div style="border-top: 1px solid var(--bd); padding: 16px 24px; flex-shrink: 0;">
				<div style="display: flex; gap: 10px;">
					<button
						onclick={handleSave}
						disabled={saving || !form.name.trim()}
						style="
							flex: 1; padding: 9px 16px; border-radius: var(--rs);
							background: var(--pr); color: #fff; border: 1px solid var(--pr);
							font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
							opacity: {saving || !form.name.trim() ? 0.6 : 1};
						"
					>
						{saving ? 'Saving...' : 'Save'}
					</button>
					<button
						onclick={closePanel}
						style="
							padding: 9px 16px; border-radius: var(--rs);
							background: #fff; color: var(--tx); border: 1px solid var(--bd);
							font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
						"
					>
						Cancel
					</button>
				</div>

				{#if panel !== 'new' && typeof panel === 'object'}
					<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--bd2);">
						{#if confirmDelete}
							<p style="font-size: 12.5px; color: var(--tx2); margin-bottom: 10px;">
								Delete this exercise permanently?
							</p>
							<div style="display: flex; gap: 8px;">
								<button
									onclick={handleDelete}
									disabled={deleting}
									style="
										padding: 7px 14px; border-radius: var(--rs);
										border: 1px solid var(--rd); color: var(--rd);
										background: #fff5f5; font-size: 12.5px; font-weight: 600;
										cursor: pointer; font-family: var(--font);
										opacity: {deleting ? 0.6 : 1};
									"
								>
									{deleting ? 'Deleting...' : 'Confirm delete'}
								</button>
								<button
									onclick={() => (confirmDelete = false)}
									style="
										padding: 7px 14px; border-radius: var(--rs);
										border: 1px solid var(--bd); color: var(--tx2);
										background: #fff; font-size: 12.5px; font-weight: 600;
										cursor: pointer; font-family: var(--font);
									"
								>
									Cancel
								</button>
							</div>
						{:else}
							<button
								onclick={() => (confirmDelete = true)}
								style="font-size: 12.5px; color: var(--rd); background: none; border: none; cursor: pointer; font-family: var(--font);"
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

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
