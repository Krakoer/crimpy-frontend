<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto, beforeNavigate } from '$app/navigation';
	import type {
		TrainingRequest,
		Exercise,
		Tag,
		TrainingItem,
		TrainingItemType,
		TrainingType
	} from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import ItemList from '$lib/components/training/ItemList.svelte';
	import TrainingPreview from '$lib/components/training/TrainingPreview.svelte';
	import CreateExerciseModal from '$lib/components/training/CreateExerciseModal.svelte';
	import SidePanelDraggable from '$lib/components/training/SidePanelDraggable.svelte';
	import TagFilterSelect from '$lib/components/TagFilterSelect.svelte';
	import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
	import { PointerActivationConstraints } from '@dnd-kit/dom';
	import { isSortable } from '@dnd-kit/svelte/sortable';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';

	function ensureClientIds(items: TrainingItem[]) {
		for (const item of items) {
			if (!item._id) item._id = crypto.randomUUID();
			if (item.items) ensureClientIds(item.items);
		}
	}

	function collectExerciseIds(items: TrainingItem[]): string[] {
		const ids: string[] = [];
		for (const item of items) {
			if (item.type === 'exercise' && item.exercise_id) ids.push(item.exercise_id);
			if (item.items) ids.push(...collectExerciseIds(item.items));
		}
		return ids;
	}

	function stripClientIds(items: TrainingItem[]): TrainingItem[] {
		return items.map(({ _id, ...rest }) => ({
			...rest,
			items: rest.items ? stripClientIds(rest.items) : undefined
		}));
	}

	type FindResult = { container: TrainingItem[]; containerId: string; index: number };

	function findItemInTree(
		treeItems: TrainingItem[],
		targetId: string,
		cid = 'root'
	): FindResult | null {
		for (let i = 0; i < treeItems.length; i++) {
			if (treeItems[i]._id === targetId)
				return { container: treeItems, containerId: cid, index: i };
			if (treeItems[i].items) {
				const found = findItemInTree(
					treeItems[i].items!,
					targetId,
					'container:' + treeItems[i]._id!
				);
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
		if (draft.training_type === 'stretching') {
			if (movedItem.type === 'group' || movedItem.type === 'repeater') return false;
			if (movedItem.type === 'circuit' && draft.items.some((i) => i.type === 'circuit'))
				return false;
		}
		if (targetContainerId === 'root') return true;
		if (movedItem.type === 'circuit') return false;
		if (movedItem.type === 'group') {
			const containerItemId = targetContainerId.slice(10);
			const containerItem = findItemById(draft.items, containerItemId);
			return containerItem?.type === 'circuit';
		}
		return true;
	}

	let itemsSnapshot: TrainingItem[] | null = null;
	let lastSwapKey = '';
	let lastSwapTime = 0;
	const SWAP_COOLDOWN_MS = 150;

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
		lastSwapKey = '';
		lastSwapTime = 0;
		itemsSnapshot = structuredClone($state.snapshot(draft.items) as TrainingItem[]);
	}

	function onDragOver(event: { operation: { source: unknown; target: unknown } }) {
		const { source, target } = event.operation;
		if (!source || !target) return;
		if (!isSortable(source as never)) return;

		const srcId = String((source as { id: string }).id);
		let swapKey: string;

		if (isSortable(target as never)) {
			const tgt = target as { id: string; group?: string; index: number };
			const tgtId = String(tgt.id);
			const tgtContainerId = tgt.group ?? 'root';
			const tgtIndex = tgt.index;
			swapKey = `${srcId}:${tgtId}`;
			const now = Date.now();
			if (swapKey === lastSwapKey && now - lastSwapTime < SWAP_COOLDOWN_MS) return;
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
			lastSwapKey = swapKey;
			lastSwapTime = now;
		} else {
			const tgtId = String((target as { id: string }).id);
			swapKey = `${srcId}:container:${tgtId}`;
			const now = Date.now();
			if (swapKey === lastSwapKey && now - lastSwapTime < SWAP_COOLDOWN_MS) return;
			moveCrossContainer(srcId, tgtId, Infinity);
			lastSwapKey = swapKey;
			lastSwapTime = now;
		}
	}

	function onDragEnd(event: {
		canceled: boolean;
		operation: { source: unknown; target: unknown };
	}) {
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

			let targetContainerId: string;
			let insertIndex: number;

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

	const dndSensors = [
		PointerSensor.configure({
			activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })]
		})
	];

	let trainingId = $derived($page.params.id as string);

	const TYPE_COLORS: Record<TrainingType, string> = {
		workout: 'var(--pr)',
		climbing: 'var(--gd)',
		stretching: 'var(--gn)'
	};
	const TYPE_LABELS: Record<TrainingType, string> = {
		workout: 'Workout',
		climbing: 'Climbing',
		stretching: 'Stretching'
	};

	let exercises = $state<Exercise[]>([]);
	let draft = $state<TrainingRequest>({
		title: '',
		description: '',
		training_type: 'workout',
		goal: '',
		comment: '',
		items: []
	});
	let savedSnapshot = $state<string | null>(null);

	let isDirty = $derived(
		savedSnapshot !== null && JSON.stringify($state.snapshot(draft)) !== savedSnapshot
	);

	let showCreateExerciseModal = $state(false);
	let isEditing = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let saveError = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let showLeaveModal = $state(false);
	let pendingUrl = $state<string | null>(null);

	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.ctrlKey && e.key === 's') {
				e.preventDefault();
				if (isDirty) handleSave();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	beforeNavigate(({ cancel, to }) => {
		if (isDirty) {
			cancel();
			pendingUrl = to?.url?.pathname ?? null;
			showLeaveModal = true;
		}
	});

	function confirmLeave() {
		showLeaveModal = false;
		savedSnapshot = JSON.stringify($state.snapshot(draft));
		if (pendingUrl) goto(pendingUrl);
		pendingUrl = null;
	}

	function cancelLeave() {
		showLeaveModal = false;
		pendingUrl = null;
	}

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
			result = result.filter((e) =>
				filterExerciseTags.every((t) => e.tags?.some((et) => et.id === t.id))
			);
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
				const p = await apiClient.getExercises({
					name: rootExerciseSearch.trim() || undefined,
					tags: filterExerciseTags.length > 0 ? filterExerciseTags.map((t) => t.id) : undefined,
					limit: SIDEBAR_PAGE_SIZE,
					offset: 0
				});
				sidebarResults = p.exercises;
				sidebarTotal = p.total;
				sidebarOffset = p.exercises.length;
			}
		} finally {
			sidebarLoading = false;
		}
	}

	async function loadMoreSidebar() {
		if (sidebarLoadingMore || !sidebarHasMore) return;
		sidebarLoadingMore = true;
		try {
			const p = await apiClient.getExercises({
				name: rootExerciseSearch.trim() || undefined,
				tags: filterExerciseTags.length > 0 ? filterExerciseTags.map((t) => t.id) : undefined,
				limit: SIDEBAR_PAGE_SIZE,
				offset: sidebarOffset
			});
			sidebarResults = [...sidebarResults, ...p.exercises];
			sidebarTotal = p.total;
			sidebarOffset += p.exercises.length;
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
		loadSidebarExercises();
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
		} else if (type === 'group') {
			base.group_title = 'Group';
			base.items = [];
		} else if (type === 'repeater') {
			base.cycles = 3;
			base.cycle_rest_seconds = 180;
			base.reps = 6;
			base.worktime_seconds = 7;
			base.rest_seconds = 3;
			base.hand = 'both';
			base.edge_sizes_mm = [20];
			base.loads = [{ value: 100, unit: 'percent_bw' }];
			base.hand_positions = [['HC', 'HC', 'HC', 'HC', 'HC', 'HC']];
		}
		return base;
	}

	function addRootItem(type: TrainingItemType, exerciseId?: string) {
		if (draft.training_type === 'stretching') {
			if (type === 'group' || type === 'repeater') return;
			if (type === 'circuit' && draft.items.some((i) => i.type === 'circuit')) return;
		}
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

		apiClient
			.getTraining(trainingId)
			.then(async (training) => {
				const items = training.items ?? [];
				ensureClientIds(items);
				draft = {
					title: training.title,
					description: training.description ?? '',
					training_type: training.training_type ?? 'workout',
					goal: training.goal ?? '',
					comment: training.comment ?? '',
					items
				};
				const ids = [...new Set(collectExerciseIds(items))];
				if (ids.length > 0) {
					const fetched = await Promise.all(
						ids.map((id) => apiClient.getExercise(id).catch(() => null))
					);
					exercises = fetched.filter(Boolean) as Exercise[];
				}
				savedSnapshot = JSON.stringify($state.snapshot(draft));
				loading = false;
				if (draft.training_type === 'stretching') {
					applyStretchingFilter();
				} else {
					loadSidebarExercises();
				}
			})
			.catch(() => {
				goto('/trainings');
			});
	});

	async function handleSave() {
		const title = draft.title.trim();
		if (!title) return;
		saving = true;
		saveError = '';
		try {
			await apiClient.updateTraining(trainingId, {
				title,
				description: draft.description?.trim() || undefined,
				training_type: draft.training_type,
				goal: draft.goal?.trim() || undefined,
				comment: draft.comment?.trim() || undefined,
				items: draft.training_type === 'climbing' ? [] : stripClientIds(draft.items)
			});
			savedSnapshot = JSON.stringify($state.snapshot(draft));
			snackbar.show('Training saved');
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save training.';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		deleting = true;
		try {
			await apiClient.deleteTraining(trainingId);
			snackbar.show('Training deleted');
			goto('/trainings');
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to delete training.';
			deleting = false;
		}
	}

	const structureButtons = [
		{ type: 'circuit' as TrainingItemType, label: 'Circuit', icon: 'link', color: 'var(--pr)' },
		{ type: 'group' as TrainingItemType, label: 'Group', icon: 'filter', color: 'var(--tx2)' },
		{ type: 'repeater' as TrainingItemType, label: 'Hangboard', icon: 'grip', color: '#4A7C8C' }
	];

	let allowedStructureButtons = $derived(
		draft.training_type === 'stretching'
			? structureButtons.filter(
					(b) => b.type === 'circuit' && !draft.items.some((i) => i.type === 'circuit')
				)
			: structureButtons
	);
</script>

<svelte:head>
	<title>{draft.title || 'Training'}{isDirty ? ' *' : ''} - Crimpy</title>
</svelte:head>

<AppShell
	title={draft.title || 'Training'}
	breadcrumbs={[
		{ label: 'Studio' },
		{ label: 'Trainings', href: '/trainings' },
		{ label: draft.title || 'Training' }
	]}
>
	{#snippet actions()}
		{#if !loading}
			{#if !isEditing}
				<button
					onclick={() => (isEditing = true)}
					style="
						display: inline-flex; align-items: center; gap: 7px;
						padding: 8px 16px; border-radius: var(--rs);
						background: var(--pr); color: #fff; border: 1px solid var(--pr);
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					"
				>
					<Icon name="edit" size={13} color="#fff" />
					Edit
				</button>
			{:else}
				<button
					onclick={() => (isEditing = false)}
					style="
						display: inline-flex; align-items: center; gap: 7px;
						padding: 8px 14px; border-radius: var(--rs);
						background: #fff; color: var(--tx); border: 1px solid var(--bd);
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					"
				>
					<Icon name="arrow-left" size={13} color="var(--tx2)" />
					Back
				</button>
				{#if confirmDelete}
					<button
						onclick={handleDelete}
						disabled={deleting}
						style="
							display: inline-flex; align-items: center; gap: 7px;
							padding: 8px 14px; border-radius: var(--rs);
							background: #fdf3f3; color: var(--rd); border: 1px solid var(--rd);
							font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
							opacity: {deleting ? 0.6 : 1};
						">{deleting ? 'Deleting...' : 'Confirm delete'}</button
					>
					<button
						onclick={() => (confirmDelete = false)}
						style="
							display: inline-flex; align-items: center;
							padding: 8px 14px; border-radius: var(--rs);
							background: #fff; color: var(--tx3); border: 1px solid var(--bd);
							font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
						">Cancel</button
					>
				{:else}
					<button
						onclick={() => (confirmDelete = true)}
						style="
							display: inline-flex; align-items: center; justify-content: center;
							width: 34px; height: 34px; border-radius: var(--rs);
							background: #fff; border: 1px solid var(--bd); cursor: pointer;
						"
						title="Delete training"
					>
						<Icon name="trash" size={14} color="var(--tx3)" />
					</button>
				{/if}
				<button
					onclick={handleSave}
					disabled={saving || !draft.title.trim()}
					style="
						display: inline-flex; align-items: center; gap: 7px;
						padding: 8px 16px; border-radius: var(--rs);
						background: {isDirty ? 'var(--pr)' : '#fff'};
						color: {isDirty ? '#fff' : 'var(--tx2)'};
						border: 1px solid {isDirty ? 'var(--pr)' : 'var(--bd)'};
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
						opacity: {saving || !draft.title.trim() ? 0.6 : 1};
					"
				>
					<Icon name="check" size={13} color={isDirty ? '#fff' : 'var(--tx3)'} />
					{saving ? 'Saving...' : isDirty ? 'Save training' : 'Saved'}
				</button>
			{/if}
		{/if}
	{/snippet}

	{#if loading}
		<div style="padding: 40px; display: flex; align-items: center; gap: 10px; color: var(--tx3);">
			<div
				style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite;"
			></div>
			Loading...
		</div>
	{:else if !isEditing}
		<div style="padding: 20px 28px 40px;">
			<div
				style="
				background: #fff; border-radius: var(--rl); border: 1px solid var(--bd);
				padding: 20px 24px; box-shadow: var(--sh); margin-bottom: 16px;
			"
			>
				<h2 style="font-size: 18px; font-weight: 700; color: var(--tx); margin-bottom: 4px;">
					{draft.title}
				</h2>
				{#if draft.description}
					<p style="font-size: 13px; color: var(--tx2); margin-bottom: 8px;">{draft.description}</p>
				{/if}
				{#if draft.goal}
					<p style="font-size: 12px; color: var(--tx3);">
						<span style="font-weight: 600;">Goal:</span>
						{draft.goal}
					</p>
				{/if}
			</div>
			{#if draft.training_type === 'climbing'}
				{#if draft.comment}
					<div
						style="
						background: #fff; border-radius: var(--rl); border: 1px solid var(--bd);
						padding: 20px 24px; box-shadow: var(--sh);
						border-left: 3px solid var(--gd);
					"
					>
						<p style="font-size: 13px; color: var(--tx); line-height: 1.6; white-space: pre-wrap;">
							{draft.comment}
						</p>
					</div>
				{/if}
			{:else}
				<TrainingPreview items={draft.items} {exercises} />
			{/if}
		</div>
	{:else if draft.training_type !== 'climbing'}
		<DragDropProvider sensors={dndSensors} {onDragStart} {onDragOver} {onDragEnd}>
			<div class="flex items-start">
				<!-- Main content -->
				<div class="flex-1" style="padding: 20px 28px 40px; min-width: 0;">
					<!-- Meta card -->
					<div
						style="
						background: #fff; border-radius: var(--rl); border: 1px solid var(--bd);
						padding: 18px 22px; box-shadow: var(--sh); margin-bottom: 16px;
					"
					>
						<div
							style="display: grid; grid-template-columns: 1fr auto; gap: 16px; margin-bottom: 12px;"
						>
							<div>
								<input
									type="text"
									bind:value={draft.title}
									placeholder="Training title"
									style="
										width: 100%; border: none; outline: none; background: transparent;
										font-family: var(--font); font-size: 20px; font-weight: 700; color: var(--tx);
										letter-spacing: -0.01em;
									"
								/>
								<input
									type="text"
									bind:value={draft.description}
									placeholder="Description (optional)"
									style="
										width: 100%; border: none; outline: none; background: transparent;
										font-family: var(--font); font-size: 13px; color: var(--tx2); margin-top: 4px;
									"
								/>
							</div>
							<div style="display: flex; gap: 4px; align-self: flex-start;">
								{#each ['workout', 'climbing', 'stretching'] as TrainingType[] as t (t)}
									<button
										onclick={() => handleTypeChange(t)}
										style="
											padding: 5px 12px; font-size: 12px; font-weight: 600;
											border-radius: var(--rs); font-family: var(--font);
											border: 1.5px solid {draft.training_type === t ? TYPE_COLORS[t] : 'var(--bd)'};
											background: {draft.training_type === t ? TYPE_COLORS[t] : '#fff'};
											color: {draft.training_type === t ? '#fff' : 'var(--tx2)'};
											cursor: pointer; transition: all 0.15s;
										">{TYPE_LABELS[t]}</button
									>
								{/each}
							</div>
						</div>
						<div style="display: flex; align-items: center; gap: 8px;">
							<span
								style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
								>GOAL</span
							>
							<input
								type="text"
								bind:value={draft.goal}
								placeholder="Training goal..."
								style="flex: 1; border: none; outline: none; background: transparent; font-family: var(--font); font-size: 12.5px; color: var(--tx2);"
							/>
						</div>
					</div>

					{#if saveError}
						<div
							style="margin-bottom: 12px; padding: 10px 14px; border-radius: var(--rs); border: 1px solid #e57373; background: #fff5f5; font-size: 13px; color: #c62828;"
						>
							{saveError}
						</div>
					{/if}

					<ItemList
						bind:items={draft.items}
						{exercises}
						allowedTypes={draft.training_type === 'stretching'
							? draft.items.some((i) => i.type === 'circuit')
								? ['exercise']
								: ['exercise', 'circuit']
							: ['exercise', 'circuit', 'group', 'repeater']}
						circuitInnerAllowedTypes={draft.training_type === 'stretching'
							? ['exercise']
							: undefined}
					/>
				</div>

				<!-- Right rail -->
				<div
					style="
					width: 260px; flex-shrink: 0; border-left: 1px solid var(--bd);
					background: var(--panel); display: flex; flex-direction: column;
					position: sticky; top: 0; align-self: flex-start; max-height: calc(100vh - 65px);
				"
				>
					{#if allowedStructureButtons.length > 0}
						<div style="padding: 14px 14px 10px; border-bottom: 1px solid var(--bd2);">
							<div
								style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; font-weight: 600; margin-bottom: 8px;"
							>
								ADD BLOCK
							</div>
							<div style="display: flex; flex-wrap: wrap; gap: 6px;">
								{#each allowedStructureButtons as btn (btn.type)}
									<SidePanelDraggable
										id={'__new__:' + btn.type}
										onclick={() => addRootItem(btn.type)}
										style="
											display: flex; align-items: center; gap: 6px;
											padding: 7px 12px; border-radius: var(--rs);
											border: 1px solid var(--bd); background: #fff;
											font-family: var(--font); font-size: 12px; font-weight: 600;
											color: {btn.color};
										"
									>
										<Icon name={btn.icon} size={13} color={btn.color} />
										{btn.label}
									</SidePanelDraggable>
								{/each}
							</div>
						</div>
					{/if}

					<div style="padding: 12px 14px 8px; border-bottom: 1px solid var(--bd2);">
						<div
							style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;"
						>
							<span style="font-size: 12px; font-weight: 700; color: var(--tx);">Exercises</span>
							<div style="display: flex; gap: 4px;">
								<button
									onclick={toggleSidebarFavorites}
									title="Show favorites only"
									style="
										padding: 3px 8px; border-radius: var(--rs); font-size: 11px; font-weight: 600;
										border: 1px solid {favoritesOnlyExercises ? 'var(--pr)' : 'var(--bd)'};
										background: {favoritesOnlyExercises ? 'var(--pr-lt)' : '#fff'};
										color: {favoritesOnlyExercises ? 'var(--pr)' : 'var(--tx3)'};
										cursor: pointer; font-family: var(--font);
									">Fav</button
								>
								<button
									onclick={() => (showCreateExerciseModal = true)}
									title="Create new exercise"
									style="
										width: 24px; height: 24px; border-radius: var(--rs);
										border: 1px dashed var(--bd); background: #fff; color: var(--tx3);
										cursor: pointer; display: flex; align-items: center; justify-content: center;
									"
								>
									<Icon name="plus" size={12} color="var(--tx3)" />
								</button>
							</div>
						</div>
						<div
							style="
							display: flex; align-items: center; gap: 7px;
							background: var(--panel2); border: 1px solid var(--bd); border-radius: var(--rs);
							padding: 6px 10px;
						"
						>
							<Icon name="search" size={13} color="var(--tx3)" />
							<input
								type="text"
								value={rootExerciseSearch}
								oninput={(e) => handleSidebarSearch(e.currentTarget.value)}
								placeholder="Find exercise..."
								style="flex: 1; border: none; outline: none; background: transparent; font-family: var(--font); font-size: 12px; color: var(--tx);"
							/>
							{#if rootExerciseSearch}
								<span
									onclick={() => handleSidebarSearch('')}
									style="cursor: pointer; color: var(--tx3); font-size: 11px;"
									role="button"
									tabindex="0"
									onkeydown={(e) => e.key === 'Enter' && handleSidebarSearch('')}>x</span
								>
							{/if}
						</div>
						<div style="margin-top: 6px;">
							<TagFilterSelect
								selectedTags={filterExerciseTags}
								onchange={handleSidebarTagsChange}
							/>
						</div>
					</div>

					<div
						class="flex-1 overflow-auto"
						style="padding: 6px 10px; display: flex; flex-direction: column; gap: 3px;"
					>
						{#if sidebarLoading}
							<div style="padding: 16px; text-align: center; font-size: 12px; color: var(--tx3);">
								Loading...
							</div>
						{:else if sidebarResults.length > 0}
							{#each sidebarResults as ex (ex.id)}
								<SidePanelDraggable
									id={'__new__:exercise:' + ex.id}
									onclick={() => addExerciseToTraining(ex)}
									style="
										display: flex; align-items: center; gap: 8px;
										padding: 7px 10px; border-radius: var(--rs);
										background: #fff; border: 1px solid var(--bd);
										text-align: left; font-family: var(--font);
										transition: border-color 0.1s;
									"
								>
									<div
										style="
										width: 22px; height: 22px; border-radius: 5px;
										background: var(--pr-fog); color: var(--pr);
										display: flex; align-items: center; justify-content: center;
										font-size: 8px; font-weight: 700; flex-shrink: 0;
									"
									>
										EX
									</div>
									<div style="flex: 1; min-width: 0;">
										<div
											style="font-size: 12px; font-weight: 600; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
										>
											{ex.name}
										</div>
										{#if ex.tags && ex.tags.length > 0}
											<div style="font-size: 10px; color: var(--tx3);">
												{ex.tags.map((t) => t.name).join(' · ')}
											</div>
										{/if}
									</div>
									<Icon name="plus" size={12} color="var(--tx3)" />
								</SidePanelDraggable>
							{/each}
							{#if sidebarHasMore}
								<button
									onclick={loadMoreSidebar}
									disabled={sidebarLoadingMore}
									style="
										width: 100%; padding: 6px; border-radius: var(--rs);
										border: 1px dashed var(--bd); background: transparent;
										font-size: 11px; color: var(--tx3); cursor: pointer;
										font-family: var(--font); opacity: {sidebarLoadingMore ? 0.5 : 1};
									">{sidebarLoadingMore ? '...' : 'Load more'}</button
								>
							{/if}
						{:else}
							<div style="padding: 16px; text-align: center; font-size: 12px; color: var(--tx3);">
								No exercises found
							</div>
						{/if}
					</div>
				</div>
			</div>
		</DragDropProvider>
	{:else}
		<!-- Climbing type: show meta + comment editor -->
		<div style="padding: 20px 28px 40px;">
			<div
				style="
				background: #fff; border-radius: var(--rl); border: 1px solid var(--bd);
				padding: 18px 22px; box-shadow: var(--sh); margin-bottom: 16px;
			"
			>
				<div
					style="display: grid; grid-template-columns: 1fr auto; gap: 16px; margin-bottom: 12px;"
				>
					<div>
						<input
							type="text"
							bind:value={draft.title}
							placeholder="Training title"
							style="
								width: 100%; border: none; outline: none; background: transparent;
								font-family: var(--font); font-size: 20px; font-weight: 700; color: var(--tx);
								letter-spacing: -0.01em;
							"
						/>
						<input
							type="text"
							bind:value={draft.description}
							placeholder="Description (optional)"
							style="
								width: 100%; border: none; outline: none; background: transparent;
								font-family: var(--font); font-size: 13px; color: var(--tx2); margin-top: 4px;
							"
						/>
					</div>
					<div style="display: flex; gap: 4px; align-self: flex-start;">
						{#each ['workout', 'climbing', 'stretching'] as TrainingType[] as t (t)}
							<button
								onclick={() => handleTypeChange(t)}
								style="
									padding: 5px 12px; font-size: 12px; font-weight: 600;
									border-radius: var(--rs); font-family: var(--font);
									border: 1.5px solid {draft.training_type === t ? TYPE_COLORS[t] : 'var(--bd)'};
									background: {draft.training_type === t ? TYPE_COLORS[t] : '#fff'};
									color: {draft.training_type === t ? '#fff' : 'var(--tx2)'};
									cursor: pointer; transition: all 0.15s;
								">{TYPE_LABELS[t]}</button
							>
						{/each}
					</div>
				</div>
				<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
					<span
						style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>GOAL</span
					>
					<input
						type="text"
						bind:value={draft.goal}
						placeholder="Training goal..."
						style="flex: 1; border: none; outline: none; background: transparent; font-family: var(--font); font-size: 12.5px; color: var(--tx2);"
					/>
				</div>
				<textarea
					bind:value={draft.comment}
					rows="8"
					placeholder="Describe the session: volume, intensity, focus points, duration..."
					style="
						width: 100%; resize: none; border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 10px 12px; outline: none; font-family: var(--font); font-size: 13px;
						color: var(--tx); background: var(--panel2); line-height: 1.5;
					"
				></textarea>
			</div>

			{#if saveError}
				<div
					style="margin-bottom: 12px; padding: 10px 14px; border-radius: var(--rs); border: 1px solid #e57373; background: #fff5f5; font-size: 13px; color: #c62828;"
				>
					{saveError}
				</div>
			{/if}
		</div>
	{/if}
</AppShell>

{#if showCreateExerciseModal}
	<CreateExerciseModal
		onCreated={onExerciseCreated}
		onClose={() => (showCreateExerciseModal = false)}
		initialTags={draft.training_type === 'stretching' ? filterExerciseTags : []}
	/>
{/if}

{#if showLeaveModal}
	<div
		style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(45,36,29,0.3);"
	>
		<div
			style="
			background: #fff; border-radius: var(--rl); border: 1px solid var(--bd);
			box-shadow: 0 20px 60px rgba(0,0,0,0.15); padding: 28px 32px; min-width: 340px;
		"
		>
			<p style="font-size: 16px; font-weight: 700; color: var(--tx); margin-bottom: 6px;">
				Unsaved changes
			</p>
			<p style="font-size: 13.5px; color: var(--tx2); margin-bottom: 24px;">
				Leave without saving?
			</p>
			<div style="display: flex; gap: 10px;">
				<button
					onclick={confirmLeave}
					style="
						padding: 9px 18px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: #fff; color: var(--tx);
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					">Leave</button
				>
				<button
					onclick={cancelLeave}
					style="
						padding: 9px 18px; border-radius: var(--rs);
						border: 1px solid var(--pr); background: var(--pr); color: #fff;
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					">Stay</button
				>
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
