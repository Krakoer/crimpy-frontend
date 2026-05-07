<script lang="ts">
	import { onMount } from 'svelte';
	import type { Exercise, Tag } from '$lib/api/client';
	import { apiClient } from '$lib/api/client';
	import TagFilterSelect from '$lib/components/TagFilterSelect.svelte';

	interface Props {
		onSelect: (exercise: Exercise) => void;
		onClose: () => void;
	}

	let { onSelect, onClose }: Props = $props();

	const PAGE_SIZE = 30;

	let exercises = $state<Exercise[]>([]);
	let total = $state(0);
	let currentOffset = $state(0);
	let loading = $state(false);
	let loadingMore = $state(false);
	let search = $state('');
	let favoritesOnly = $state(false);
	let filterTags = $state<Tag[]>([]);

	let hasMore = $derived(!favoritesOnly && exercises.length < total);

	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	onMount(() => {
		loadExercises();
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
					tags: filterTags.length > 0 ? filterTags.map((t) => t.id) : undefined,
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
				tags: filterTags.length > 0 ? filterTags.map((t) => t.id) : undefined,
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
		if (filterTags.length > 0) {
			result = result.filter((e) => filterTags.every((t) => e.tags?.some((et) => et.id === t.id)));
		}
		return result;
	}

	function handleSearchInput(value: string) {
		search = value;
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(loadExercises, 250);
	}

	function toggleFavoritesOnly() {
		favoritesOnly = !favoritesOnly;
		loadExercises();
	}

	function handleTagsChange(tags: Tag[]) {
		filterTags = tags;
		loadExercises();
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center"
	style="background: rgba(0,0,0,0.4);"
	role="dialog"
	aria-modal="true"
>
	<div class="flex w-full max-w-sm flex-col border-2 border-black bg-white" style="max-height: 80vh;">
		<div class="flex items-center justify-between border-b border-black px-5 py-3">
			<h2 class="font-black" style="font-family: monospace; font-size: 15px; letter-spacing: -0.5px;">
				Select exercise
			</h2>
			<button
				onclick={onClose}
				class="text-gray-400 transition-colors hover:text-black"
				style="font-family: monospace; font-size: 18px; line-height: 1;"
				aria-label="Close"
			>
				x
			</button>
		</div>

		<div class="flex gap-2 border-b border-gray-100 px-5 py-3">
			<input
				type="text"
				value={search}
				oninput={(e) => handleSearchInput(e.currentTarget.value)}
				placeholder="Search..."
				class="flex-1 border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
				style="font-family: monospace; font-size: 14px;"
				use:focusOnMount
			/>
			<button
				onclick={toggleFavoritesOnly}
				class="border px-2 py-1 transition-colors"
				style="font-family: monospace; font-size: 12px; {favoritesOnly ? 'background-color: #C6613F; color: white; border-color: #C6613F;' : 'border-color: #ccc; color: #999;'}"
				title="Show favorites only"
			>
				fav
			</button>
		</div>

		<div class="border-b border-gray-100 px-5 py-3">
			<TagFilterSelect
				selectedTags={filterTags}
				onchange={handleTagsChange}
			/>
		</div>

		<div class="flex-1 overflow-y-auto px-5 py-2">
			{#if loading}
				<p style="font-family: monospace; font-size: 13px; color: #bbb; padding: 8px 0;">
					Loading...
				</p>
			{:else if exercises.length === 0}
				<p style="font-family: monospace; font-size: 13px; color: #bbb; padding: 8px 0;">
					No exercises found
				</p>
			{:else}
				{#each exercises as ex (ex.id)}
					<button
						onclick={() => onSelect(ex)}
						class="w-full border-b border-gray-50 px-2 py-2 text-left transition-colors hover:bg-gray-50"
						style="font-family: monospace; font-size: 14px;"
					>
						{ex.name}
						{#if ex.description}
							<span style="font-size: 12px; color: #999; margin-left: 8px;">{ex.description}</span>
						{/if}
					</button>
				{/each}
				{#if hasMore}
					<button
						onclick={loadMore}
						disabled={loadingMore}
						class="w-full py-2 text-center transition-colors hover:bg-gray-50 disabled:opacity-50"
						style="font-family: monospace; font-size: 12px; color: #999;"
					>
						{loadingMore ? 'Loading...' : 'Load more'}
					</button>
				{/if}
			{/if}
		</div>
	</div>
</div>
