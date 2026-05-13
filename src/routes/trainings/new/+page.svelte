<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { CoachTrainingRequest, Exercise, Tag, TrainingItem, TrainingItemType, TrainingType } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import ItemList from '$lib/components/training/ItemList.svelte';
	import CreateExerciseModal from '$lib/components/training/CreateExerciseModal.svelte';
	import SidePanelDraggable from '$lib/components/training/SidePanelDraggable.svelte';
	import TagFilterSelect from '$lib/components/TagFilterSelect.svelte';
	import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
	import { PointerActivationConstraints } from '@dnd-kit/dom';
	import { isSortable } from '@dnd-kit/svelte/sortable';

	type FindResult = { container: TrainingItem[]; containerId: string; index: number };

	function findItemInTree(treeItems: TrainingItem[], targetId: string, cid = 'root'): FindResult | null {
		for (let i = 0; i < treeItems.length; i++) {
			if (treeItems[i]._id === targetId) return { container: treeItems, containerId: cid, index: i };
			if (treeItems[i].items) {
				const found = findItemInTree(treeItems[i].items!, targetId, 'container:' + treeItems[i]._id!);
				if (found) return found;
			}
		}
		return null;
	}

	function findContainerArray(treeItems: TrainingItem[], cid: string): TrainingItem[] | null {
		if (cid === 'root') return treeItems;
		const itemId = cid.startsWith('container:') ? cid.slice(10) : cid;
		for (const item of treeItems) {
			if (item._id === itemId) return item.items ?? (item.items = []);
			if (item.items) {
				const found = findContainerArray(item.items, cid);
				if (found !== null) return found;
			}
		}
		return null;
	}

	function findItemById(treeItems: TrainingItem[], id: string): TrainingItem | null {
		for (const item of treeItems) {
			if (item._id === id) return item;
			if (item.items) {
				const found = findItemById(item.items, id);
				if (found) return found;
			}
		}
		return null;
	}

	function isValidMove(movedItem: TrainingItem, targetContainerId: string): boolean {
		if (targetContainerId === 'root') return true;
		if (movedItem.type === 'circuit') return false;
		if (movedItem.type === 'section') {
			const containerItemId = targetContainerId.slice(10);
			const containerItem = findItemById(draft.items, containerItemId);
			return containerItem?.type === 'circuit';
		}
		return true;
	}

	let itemsSnapshot: TrainingItem[] | null = null;
	let dragOverTimer: ReturnType<typeof setTimeout> | null = null;

	function clearDragOverTimer() {
		if (dragOverTimer) { clearTimeout(dragOverTimer); dragOverTimer = null; }
	}

	function moveCrossContainer(sourceId: string, targetContainerId: string, insertIndex: number) {
		const activeResult = findItemInTree(draft.items, sourceId);
		if (!activeResult) return;
		const movedItem = activeResult.container[activeResult.index];
		if (activeResult.containerId === targetContainerId) return;
		if (!isValidMove(movedItem, targetContainerId)) return;
		const targetContainer = findContainerArray(draft.items, targetContainerId);
		if (!targetContainer) return;
		const [item] = activeResult.container.splice(activeResult.index, 1);
		const clampedIndex = Math.min(insertIndex, targetContainer.length);
		targetContainer.splice(clampedIndex, 0, item);
	}

	function onDragStart() {
		clearDragOverTimer();
		itemsSnapshot = structuredClone($state.snapshot(draft.items) as TrainingItem[]);
	}

	function onDragOver(event: { operation: { source: unknown; target: unknown } }) {
		const { source, target } = event.operation;
		if (!source || !target) return;
		if (!isSortable(source as never)) return;

		const srcId = String((source as { id: string }).id);
		let op: () => void;

		if (isSortable(target as never)) {
			const tgt = target as { id: string; group?: string; index: number };
			const tgtId = String(tgt.id);
			const tgtContainerId = tgt.group ?? 'root';
			const tgtIndex = tgt.index;
			op = () => {
				const activeResult = findItemInTree(draft.items, srcId);
				if (!activeResult) return;
				if (activeResult.containerId === tgtContainerId) {
					const overResult = findItemInTree(draft.items, tgtId);
					if (!overResult || activeResult.index === overResult.index) return;
					const [item] = activeResult.container.splice(activeResult.index, 1);
					const newOverResult = findItemInTree(draft.items, tgtId);
					const insertAt = newOverResult ? newOverResult.index : overResult.index;
					activeResult.container.splice(insertAt, 0, item);
				} else {
					moveCrossContainer(srcId, tgtContainerId, tgtIndex);
				}
			};
		} else {
			const tgtId = String((target as { id: string }).id);
			op = () => moveCrossContainer(srcId, tgtId, Infinity);
		}

		clearDragOverTimer();
		dragOverTimer = setTimeout(op, 200);
	}

	function onDragEnd(event: { canceled: boolean; operation: { source: unknown; target: unknown } }) {
		clearDragOverTimer();
		if (event.canceled) {
			if (itemsSnapshot) draft.items = itemsSnapshot as typeof draft.items;
			itemsSnapshot = null;
			return;
		}
		itemsSnapshot = null;

		const { source, target } = event.operation;
		if (!source || !isSortable(source as never)) {
			if (!source) return;
			const srcId = String((source as { id: string }).id);
			if (!srcId.startsWith('__new__:')) return;
			const rest = srcId.slice(8);
			const colonIdx = rest.indexOf(':');
			const type = (colonIdx === -1 ? rest : rest.slice(0, colonIdx)) as TrainingItemType;
			const exerciseId = colonIdx === -1 ? undefined : rest.slice(colonIdx + 1);

			if (!target) return;

			let targetContainerId = 'root';
			let insertIndex = draft.items.length;

			if (isSortable(target as never)) {
				const tgt = target as { group?: string; index: number };
				targetContainerId = tgt.group ?? 'root';
				insertIndex = tgt.index;
			} else {
				targetContainerId = String((target as { id: string }).id);
				insertIndex = Infinity;
			}

			if (!isValidMove({ type } as TrainingItem, targetContainerId)) return;
			const container = findContainerArray(draft.items, targetContainerId);
			if (!container) return;
			container.splice(Math.min(insertIndex, container.length), 0, createNewItem(type, exerciseId));
			if (type === 'exercise' && exerciseId) {
				const ex = sidebarResults.find((e) => e.id === exerciseId);
				if (ex && !exercises.find((e) => e.id === exerciseId)) exercises.push(ex);
			}
		}
	}

	const dndSensors = [PointerSensor.configure({
		activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })]
	})];

	const TYPE_COLORS: Record<TrainingType, string> = { workout: '#C6613F', climbing: '#D4A644', stretching: '#5A8C5A' };

	let exercises = $state<Exercise[]>([]);
	let draft = $state<CoachTrainingRequest>({ title: '', description: '', training_type: 'workout', goal: '', comment: '', items: [] });
	let saving = $state(false);
	let saveError = $state('');
	let showCreateExerciseModal = $state(false);
	const SIDEBAR_PAGE_SIZE = 20;
	let rootExerciseSearch = $state('');
	let favoritesOnlyExercises = $state(false);
	let filterExerciseTags = $state<Tag[]>([]);
	let sidebarResults = $state<Exercise[]>([]);
	let sidebarTotal = $state(0);
	let sidebarOffset = $state(0);
	let sidebarLoading = $state(false);
	let sidebarLoadingMore = $state(false);
	let sidebarHasMore = $derived(!favoritesOnlyExercises && sidebarResults.length < sidebarTotal);
	let sidebarDebounce: ReturnType<typeof setTimeout> | null = null;

	function applySidebarFilters(list: Exercise[]): Exercise[] {
		const q = rootExerciseSearch.trim().toLowerCase();
		let result = list;
		if (q) result = result.filter((e) => e.name.toLowerCase().includes(q));
		if (filterExerciseTags.length > 0) {
			result = result.filter((e) => filterExerciseTags.every((t) => e.tags?.some((et) => et.id === t.id)));
		}
		return result;
	}

	async function loadSidebarExercises() {
		sidebarLoading = true;
		sidebarOffset = 0;
		sidebarResults = [];
		try {
			if (favoritesOnlyExercises) {
				const favs = await apiClient.getFavoriteExercises();
				sidebarResults = applySidebarFilters(favs);
				sidebarTotal = sidebarResults.length;
			} else {
				const page = await apiClient.getExercises({
					name: rootExerciseSearch.trim() || undefined,
					tags: filterExerciseTags.length > 0 ? filterExerciseTags.map((t) => t.id) : undefined,
					limit: SIDEBAR_PAGE_SIZE,
					offset: 0
				});
				sidebarResults = page.exercises;
				sidebarTotal = page.total;
				sidebarOffset = page.exercises.length;
			}
		} finally {
			sidebarLoading = false;
		}
	}

	async function loadMoreSidebar() {
		if (sidebarLoadingMore || !sidebarHasMore) return;
		sidebarLoadingMore = true;
		try {
			const page = await apiClient.getExercises({
				name: rootExerciseSearch.trim() || undefined,
				tags: filterExerciseTags.length > 0 ? filterExerciseTags.map((t) => t.id) : undefined,
				limit: SIDEBAR_PAGE_SIZE,
				offset: sidebarOffset
			});
			sidebarResults = [...sidebarResults, ...page.exercises];
			sidebarTotal = page.total;
			sidebarOffset += page.exercises.length;
		} finally {
			sidebarLoadingMore = false;
		}
	}

	function handleSidebarSearch(value: string) {
		rootExerciseSearch = value;
		if (sidebarDebounce) clearTimeout(sidebarDebounce);
		sidebarDebounce = setTimeout(loadSidebarExercises, 250);
	}

	function toggleSidebarFavorites() {
		favoritesOnlyExercises = !favoritesOnlyExercises;
		loadSidebarExercises();
	}

	function handleSidebarTagsChange(tags: Tag[]) {
		filterExerciseTags = tags;
		loadSidebarExercises();
	}

	async function applyStretchingFilter() {
		const tags = await apiClient.getTags();
		const stretchingTag = tags.find((t) => t.is_builtin);
		if (stretchingTag) {
			filterExerciseTags = [stretchingTag];
			loadSidebarExercises();
		}
	}

	function handleTypeChange(type: TrainingType) {
		const prev = draft.training_type;
		draft.training_type = type;
		if (type === 'stretching' && prev !== 'stretching') {
			applyStretchingFilter();
		} else if (type !== 'stretching' && prev === 'stretching') {
			filterExerciseTags = [];
			loadSidebarExercises();
		}
	}

	function addExerciseToTraining(exercise: Exercise) {
		if (!exercises.find((e) => e.id === exercise.id)) exercises.push(exercise);
		addRootItem('exercise', exercise.id);
	}

	function onExerciseCreated(exercise: Exercise) {
		if (!exercises.find((e) => e.id === exercise.id)) exercises.push(exercise);
		showCreateExerciseModal = false;
	}

	function createNewItem(type: TrainingItemType, exerciseId?: string): TrainingItem {
		const base: TrainingItem = { type, _id: crypto.randomUUID() };
		if (type === 'exercise') {
			base.exercise_id = exerciseId;
			base.reps = 1;
			base.rest_seconds = 0;
		} else if (type === 'circuit') {
			base.cycles = 3;
			base.cycle_rest_seconds = 120;
			base.items = [];
		} else if (type === 'section') {
			base.section_title = 'Section';
			base.items = [];
		} else if (type === 'hangboard') {
			base.cycles = 3;
			base.cycle_rest_seconds = 180;
			base.reps = 6;
			base.hb_worktime_seconds = 7;
			base.rest_seconds = 3;
			base.both_hands = true;
			base.edge_sizes_mm = [20];
			base.loads = [{ value: 100, unit: 'percent_bw' }];
			base.hand_positions = [['HC', 'HC', 'HC', 'HC', 'HC', 'HC']];
		}
		return base;
	}

	function addRootItem(type: TrainingItemType, exerciseId?: string) {
		draft.items.push(createNewItem(type, exerciseId));
	}

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

		loadSidebarExercises();
	});

	async function handleSave() {
		if (!draft.title.trim()) return;
		saving = true;
		saveError = '';
		try {
			const training = await apiClient.createCoachTraining({
				title: draft.title.trim(),
				description: draft.description?.trim() || undefined,
				training_type: draft.training_type,
				goal: draft.goal?.trim() || undefined,
				comment: draft.comment?.trim() || undefined,
				items: draft.training_type === 'climbing' ? [] : draft.items
			});
			snackbar.show('Training created');
			goto(`/trainings/${training.id}`);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save training.';
			saving = false;
		}
	}
</script>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-6xl p-6">
		<div class="mb-6 border-b-2 border-black pb-4">
			<button
				onclick={() => goto('/trainings')}
				style="font-family: monospace; font-size: 14px; color: #666;"
				class="mb-2 block transition-colors hover:text-black"
			>
				&larr; trainings
			</button>
			<div class="flex items-start justify-between gap-4">
				<div class="flex-1 space-y-2">
					<input
						type="text"
						bind:value={draft.title}
						class="w-full border-2 border-black px-3 py-2 text-2xl font-black outline-none focus:border-[#C6613F]"
						style="font-family: monospace; letter-spacing: -0.5px;"
						placeholder="Training title"
					/>
					<textarea
						bind:value={draft.description}
						rows="2"
						class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
						style="font-family: monospace; font-size: 15px;"
						placeholder="Optional description"
					></textarea>
					<div class="flex gap-1">
						{#each (['workout', 'stretching', 'climbing'] as TrainingType[]) as t}
							<button
								onclick={() => handleTypeChange(t)}
								class="border px-3 py-1 transition-colors"
								style="font-family: monospace; font-size: 12px; {draft.training_type === t ? `background-color: ${TYPE_COLORS[t]}; color: white; border-color: ${TYPE_COLORS[t]};` : 'border-color: #ccc; color: #999;'}"
							>{t.toUpperCase()}</button>
						{/each}
					</div>
					<textarea
						bind:value={draft.goal}
						rows="1"
						class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
						style="font-family: monospace; font-size: 13px;"
						placeholder="Goal (optional)"
					></textarea>
					{#if draft.training_type === 'climbing'}
					<textarea
						bind:value={draft.comment}
						rows="4"
						class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
						style="font-family: monospace; font-size: 13px;"
						placeholder="Describe the session: volume, intensity, focus points, duration..."
					></textarea>
					{/if}
				</div>
				<button
					onclick={handleSave}
					disabled={saving || !draft.title.trim() || (draft.training_type === 'climbing' && !draft.comment?.trim())}
					class="shrink-0 border-2 px-4 py-2 font-bold transition-colors disabled:opacity-50"
					style="font-family: monospace; font-size: 15px; background-color: #C6613F; color: white; border-color: #C6613F;"
				>
					{saving ? 'SAVING...' : 'SAVE TRAINING'}
				</button>
			</div>
		</div>

		{#if saveError}
			<div
				class="mb-4 border border-red-600 bg-red-50 p-3"
				style="font-family: monospace; font-size: 14px; color: #B85450;"
			>
				{saveError}
			</div>
		{/if}

		{#if draft.training_type !== 'climbing'}
		<DragDropProvider sensors={dndSensors} {onDragStart} {onDragOver} {onDragEnd}>
			<div class="flex gap-6 items-start">
				<div class="min-w-0 flex-1">
					<ItemList bind:items={draft.items} {exercises} />
				</div>

				<div class="w-60 shrink-0 sticky top-6 space-y-3 p-4">
					<div class="space-y-2">
						<div class="flex gap-2">
							{#each (['circuit', 'section'] as TrainingItemType[]) as type}
								<SidePanelDraggable
									id={'__new__:' + type}
									onclick={() => addRootItem(type)}
									class="w-full border border-black px-3 py-2 transition-colors hover:border-gray-600 hover:text-gray-700"
									style="font-family: monospace; font-size: 14px;"
								>
									{type.charAt(0).toUpperCase() + type.slice(1)} +
								</SidePanelDraggable>
							{/each}
						</div>
						<SidePanelDraggable
							id="__new__:hangboard"
							onclick={() => addRootItem('hangboard')}
							class="w-full border border-black px-3 py-2 transition-colors hover:border-gray-600 hover:text-gray-700"
							style="font-family: monospace; font-size: 14px;"
						>
							Hangboard +
						</SidePanelDraggable>
					</div>

					<div class="border-t border-gray-100 pt-3 space-y-2">
						<div class="flex items-center justify-between">
							<p style="font-family: monospace; font-size: 24px; text-transform: uppercase; letter-spacing: 0.5px;">
								Exercises
							</p>
							<div class="flex gap-1">
								<button
									onclick={toggleSidebarFavorites}
									class="border px-2 py-0.5 transition-colors"
									style="font-family: monospace; font-size: 12px; {favoritesOnlyExercises ? 'background-color: #C6613F; color: white; border-color: #C6613F;' : 'border-color: #ccc; color: #999;'}"
									title="Show favorites only"
								>
									fav
								</button>
								<button
									onclick={() => (showCreateExerciseModal = true)}
									class="border border-dashed border-gray-300 px-2 py-0.5 text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-700"
									style="font-family: monospace; font-size: 14px;"
									title="Create new exercise"
								>
									+
								</button>
							</div>
						</div>
						<input
							type="text"
							value={rootExerciseSearch}
							oninput={(e) => handleSidebarSearch(e.currentTarget.value)}
							placeholder="Search..."
							class="w-full border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
							style="font-family: monospace; font-size: 14px;"
						/>
						<TagFilterSelect
							selectedTags={filterExerciseTags}
							onchange={handleSidebarTagsChange}
						/>
						<div class="flex flex-wrap gap-1.5">
							{#if sidebarLoading}
								<span style="font-family: monospace; font-size: 13px; color: #bbb;">Loading...</span>
							{:else if sidebarResults.length > 0}
								{#each sidebarResults as ex (ex.id)}
									<SidePanelDraggable
										id={'__new__:exercise:' + ex.id}
										onclick={() => addExerciseToTraining(ex)}
										class="border border-black px-2 py-1 transition-colors hover:border-gray-600 hover:text-gray-700"
										style="font-family: monospace; font-size: 14px;"
									>
										{ex.name} +
									</SidePanelDraggable>
								{/each}
								{#if sidebarHasMore}
									<button
										onclick={loadMoreSidebar}
										disabled={sidebarLoadingMore}
										class="w-full border border-dashed border-gray-300 px-2 py-1 text-center text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600 disabled:opacity-50"
										style="font-family: monospace; font-size: 12px;"
									>
										{sidebarLoadingMore ? '...' : 'more'}
									</button>
								{/if}
							{:else}
								<span style="font-family: monospace; font-size: 13px; color: #bbb;">No results</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</DragDropProvider>
		{/if}
	</div>
</div>

{#if showCreateExerciseModal}
	<CreateExerciseModal
		onCreated={onExerciseCreated}
		onClose={() => (showCreateExerciseModal = false)}
	/>
{/if}
