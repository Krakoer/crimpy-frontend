<script lang="ts">
	import { onMount } from 'svelte';
	import type { Exercise, Tag } from '$lib/api/client';
	import { apiClient } from '$lib/api/client';
	import TagFilterSelect from '$lib/components/TagFilterSelect.svelte';
	import Icon from '$lib/components/Icon.svelte';

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

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
/>

<div
	style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
>
	<div
		style="
			display: flex; flex-direction: column; width: 100%; max-width: 420px; max-height: 80vh;
			background: #fff; border-radius: var(--rl);
			box-shadow: var(--sh-hi); border: 1px solid var(--bd);
			overflow: hidden;
		"
	>
		<div
			style="
				display: flex; align-items: center; justify-content: space-between;
				padding: 18px 24px; border-bottom: 1px solid var(--bd); flex-shrink: 0;
			"
		>
			<h2 style="font-size: 15px; font-weight: 700; color: var(--tx);">Select exercise</h2>
			<button
				onclick={onClose}
				style="
					display: flex; align-items: center; justify-content: center;
					width: 28px; height: 28px; border-radius: var(--rs);
					border: 1px solid var(--bd); background: #fff;
					cursor: pointer; font-size: 16px; color: var(--tx2);
				"
				aria-label="Close">x</button
			>
		</div>

		<div
			style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--bd2); flex-shrink: 0;"
		>
			<div
				style="
					display: flex; flex: 1; align-items: center; gap: 8px;
					background: #fff; border: 1px solid var(--bd); border-radius: var(--rs);
					padding: 7px 10px;
				"
			>
				<Icon name="search" size={14} color="var(--tx3)" />
				<input
					type="text"
					value={search}
					oninput={(e) => handleSearchInput(e.currentTarget.value)}
					placeholder="Search exercises..."
					style="
						flex: 1; border: none; outline: none; background: transparent;
						font-family: var(--font); font-size: 13px; color: var(--tx);
					"
					use:focusOnMount
				/>
			</div>
			<button
				onclick={toggleFavoritesOnly}
				title="Show favorites only"
				style="
					display: flex; align-items: center; justify-content: center;
					width: 34px; height: 34px; border-radius: var(--rs); flex-shrink: 0;
					border: 1px solid {favoritesOnly ? 'var(--pr)' : 'var(--bd)'};
					background: {favoritesOnly ? 'var(--pr-fog)' : '#fff'};
					cursor: pointer;
				"
			>
				<Icon
					name="star"
					size={15}
					color={favoritesOnly ? 'var(--pr)' : 'var(--tx3)'}
					fill={favoritesOnly ? 'var(--pr)' : 'none'}
				/>
			</button>
		</div>

		<div style="padding: 10px 16px; border-bottom: 1px solid var(--bd2); flex-shrink: 0;">
			<TagFilterSelect selectedTags={filterTags} onchange={handleTagsChange} />
		</div>

		<div style="flex: 1; overflow-y: auto;">
			{#if loading}
				<div
					style="display: flex; align-items: center; gap: 10px; padding: 24px 16px; color: var(--tx3); font-size: 13px; font-family: var(--font);"
				>
					<div
						style="width: 14px; height: 14px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;"
					></div>
					Loading...
				</div>
			{:else if exercises.length === 0}
				<p
					style="padding: 24px 16px; font-size: 13px; color: var(--tx3); font-family: var(--font);"
				>
					No exercises found.
				</p>
			{:else}
				{#each exercises as ex (ex.id)}
					<button
						onclick={() => onSelect(ex)}
						style="
							display: block; width: 100%; padding: 11px 16px; text-align: left;
							background: none; border: none; border-bottom: 1px solid var(--bd2);
							cursor: pointer; font-family: var(--font);
						"
						onmouseenter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
						onmouseleave={(e) => (e.currentTarget.style.background = '')}
					>
						<div style="font-size: 13.5px; font-weight: 600; color: var(--tx);">{ex.name}</div>
						{#if ex.description}
							<div
								style="font-size: 12px; color: var(--tx3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
							>
								{ex.description}
							</div>
						{/if}
						{#if ex.tags?.length}
							<div style="margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px;">
								{#each ex.tags as tag (tag.id)}
									<span
										style="font-size: 10px; padding: 2px 7px; border-radius: 999px; color: #fff; background: {tag.color};"
										>{tag.name}</span
									>
								{/each}
							</div>
						{/if}
					</button>
				{/each}
				{#if hasMore}
					<button
						onclick={loadMore}
						disabled={loadingMore}
						style="
							display: block; width: 100%; padding: 12px 16px; text-align: center;
							background: none; border: none; cursor: pointer;
							font-size: 12.5px; font-weight: 600; color: var(--tx2); font-family: var(--font);
							opacity: {loadingMore ? 0.6 : 1};
						"
						onmouseenter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
						onmouseleave={(e) => (e.currentTarget.style.background = '')}
					>
						{loadingMore ? 'Loading...' : `Load more (${exercises.length} / ${total})`}
					</button>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
