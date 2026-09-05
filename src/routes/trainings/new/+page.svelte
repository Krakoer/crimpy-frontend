<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type {
		TrainingRequest,
		Exercise,
		Tag,
		TrainingItemType,
		TrainingType
	} from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import { assessmentCatalog } from '$lib/stores/assessmentCatalog.svelte';
	import AssessmentDefinitionFields from '$lib/components/training/AssessmentDefinitionFields.svelte';
	import {
		emptyAssessmentDraft,
		type AssessmentDraft
	} from '$lib/components/training/assessment-draft';
	import ItemList from '$lib/components/training/ItemList.svelte';
	import { STRUCTURE_BLOCKS } from '$lib/block-presentation';
	import { createTrainingItem } from '$lib/components/training/create-item';
	import CreateExerciseModal from '$lib/components/training/CreateExerciseModal.svelte';
	import SidePanelDraggable from '$lib/components/training/SidePanelDraggable.svelte';
	import TagFilterSelect from '$lib/components/TagFilterSelect.svelte';
	import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import { TRAINING_TYPES, TRAINING_TYPE_INFO } from '$lib/trainingTypes';
	import { PointerActivationConstraints } from '@dnd-kit/dom';
	import { createTrainingDragHandlers } from '$lib/training-drag-handlers.svelte';

	const { onDragStart, onDragOver, onDragEnd } = createTrainingDragHandlers(
		() => draft,
		(type, exerciseId) => {
			if (type !== 'exercise' || !exerciseId) return;
			const dropped = sidebarResults.find((e) => e.id === exerciseId);
			if (dropped && !exercises.find((e) => e.id === exerciseId)) exercises.push(dropped);
		}
	);

	const dndSensors = [
		PointerSensor.configure({
			activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })]
		})
	];

	function emptyDraft(): TrainingRequest {
		return {
			title: '',
			description: '',
			training_type: 'workout',
			goal: '',
			comment: '',
			items: []
		};
	}

	let exercises = $state<Exercise[]>([]);
	let draft = $state<TrainingRequest>(emptyDraft());
	let saving = $state(false);
	let saveError = $state('');
	// A log-only training carries no items, so there is nothing for the athlete to
	// step through and their app offers to log it as done instead of running it.
	// Kept apart from the type, so any label can be either.
	let logOnly = $state(false);
	let assessment = $state<AssessmentDraft>(emptyAssessmentDraft());
	let showCreateExerciseModal = $state(false);
	let createExerciseModalDirty = $state(false);
	let leavingAfterCreate = $state(false);

	const emptyDraftSnapshot = JSON.stringify({
		draft: emptyDraft(),
		logOnly: false,
		assessment: emptyAssessmentDraft()
	});
	let isDirty = $derived(
		JSON.stringify({
			draft: $state.snapshot(draft),
			logOnly,
			assessment: $state.snapshot(assessment)
		}) !== emptyDraftSnapshot
	);
	let guardDirty = $derived(
		!leavingAfterCreate && (isDirty || (showCreateExerciseModal && createExerciseModalDirty))
	);
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

	function addRootItem(type: TrainingItemType, exerciseId?: string) {
		if (draft.training_type === 'stretching') {
			if (type === 'group' || type === 'repeater' || type === 'hangboard_rep' || type === 'emom')
				return;
			if (type === 'circuit' && draft.items.some((i) => i.type === 'circuit')) return;
		}
		draft.items.push(createTrainingItem(type, exerciseId));
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
		assessmentCatalog.load();
	});

	async function handleSave() {
		if (!draft.title.trim()) return;
		// Checked before the training is created: the server refuses a definition
		// with no question, and the training would already exist by then, leaving
		// an orphan behind and a second one on the retry.
		if (assessment.enabled && !assessment.prompt.trim()) {
			saveError = 'An assessment needs a question for the athlete to answer.';
			return;
		}
		saving = true;
		saveError = '';
		try {
			const training = await apiClient.createTraining({
				title: draft.title.trim(),
				description: draft.description?.trim() || undefined,
				training_type: draft.training_type,
				goal: draft.goal?.trim() || undefined,
				comment: draft.comment?.trim() || undefined,
				items: logOnly ? [] : draft.items
			});
			if (assessment.enabled) {
				await apiClient.createAssessmentDefinition({
					training_id: training.id,
					label: draft.title.trim(),
					prompt: assessment.prompt.trim(),
					unit: assessment.unit,
					per_hand: assessment.perHand
				});
				await assessmentCatalog.refresh();
			}
			snackbar.show(assessment.enabled ? 'Assessment created' : 'Training created');
			leavingAfterCreate = true;
			goto(`/trainings/${training.id}`);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save training.';
			saving = false;
		}
	}

	let allowedStructureButtons = $derived(
		draft.training_type === 'stretching'
			? STRUCTURE_BLOCKS.filter(
					(b) => b.type === 'circuit' && !draft.items.some((i) => i.type === 'circuit')
				)
			: STRUCTURE_BLOCKS
	);
</script>

<AppShell
	title={draft.title || 'New training'}
	breadcrumbs={[
		{ label: 'Studio' },
		{ label: 'Trainings', href: '/trainings' },
		{ label: 'New training' }
	]}
>
	{#snippet actions()}
		<button
			onclick={handleSave}
			disabled={saving || !draft.title.trim()}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 8px 16px; border-radius: var(--rs);
				background: var(--pr); color: #fff; border: 1px solid var(--pr);
				font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
				opacity: {saving || !draft.title.trim() ? 0.6 : 1};
			"
		>
			<Icon name="check" size={13} color="#fff" />
			{saving ? 'Saving...' : 'Save training'}
		</button>
	{/snippet}

	{#if !logOnly}
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
								{#each TRAINING_TYPES as t (t)}
									<button
										onclick={() => handleTypeChange(t)}
										style="
											padding: 5px 12px; font-size: 12px; font-weight: 600;
											border-radius: var(--rs); font-family: var(--font);
											border: 1.5px solid {draft.training_type === t ? TRAINING_TYPE_INFO[t].color : 'var(--bd)'};
											background: {draft.training_type === t ? TRAINING_TYPE_INFO[t].color : '#fff'};
											color: {draft.training_type === t ? '#fff' : 'var(--tx2)'};
											cursor: pointer; transition: all 0.15s;
										">{TRAINING_TYPE_INFO[t].label}</button
									>
								{/each}
							</div>
							<label
								style="
									display: flex; align-items: center; gap: 7px; cursor: pointer;
									font-size: 12px; color: var(--tx2); font-family: var(--font);
									align-self: flex-start; margin-top: 8px;
								"
							>
								<input type="checkbox" bind:checked={logOnly} style="cursor: pointer;" />
								Log only (nothing to run, the athlete just marks it as done)
							</label>
						</div>
						<div style="margin-bottom: 12px;">
							<AssessmentDefinitionFields bind:draft={assessment} />
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
						catalog={assessmentCatalog.catalog}
						allowedTypes={draft.training_type === 'stretching'
							? draft.items.some((i) => i.type === 'circuit')
								? ['exercise']
								: ['exercise', 'circuit']
							: ['exercise', 'circuit', 'emom', 'group', 'repeater', 'hangboard_rep']}
						innerAllowedTypes={draft.training_type === 'stretching' ? ['exercise'] : undefined}
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
					<!-- Structure buttons -->
					{#if allowedStructureButtons.length > 0}
						<div style="padding: 14px 14px 10px; border-bottom: 1px solid var(--bd2);">
							<div
								style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; font-weight: 600; margin-bottom: 8px;"
							>
								ADD BLOCK
							</div>
							<div data-testid="block-palette" style="display: flex; flex-wrap: wrap; gap: 6px;">
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

					<!-- Exercise library -->
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
		<div style="padding: 20px 28px 40px;">
			<!-- Meta card (log only - no item tree) -->
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
						{#each TRAINING_TYPES as t (t)}
							<button
								onclick={() => handleTypeChange(t)}
								style="
									padding: 5px 12px; font-size: 12px; font-weight: 600;
									border-radius: var(--rs); font-family: var(--font);
									border: 1.5px solid {draft.training_type === t ? TRAINING_TYPE_INFO[t].color : 'var(--bd)'};
									background: {draft.training_type === t ? TRAINING_TYPE_INFO[t].color : '#fff'};
									color: {draft.training_type === t ? '#fff' : 'var(--tx2)'};
									cursor: pointer; transition: all 0.15s;
								">{TRAINING_TYPE_INFO[t].label}</button
							>
						{/each}
					</div>
					<label
						style="
							display: flex; align-items: center; gap: 7px; cursor: pointer;
							font-size: 12px; color: var(--tx2); font-family: var(--font);
							align-self: flex-start; margin-top: 8px;
						"
					>
						<input type="checkbox" bind:checked={logOnly} style="cursor: pointer;" />
						Log only (nothing to run, the athlete just marks it as done)
					</label>
					<div style="margin-top: 10px;">
						<AssessmentDefinitionFields bind:draft={assessment} />
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
					rows="5"
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
		onDirtyChange={(dirty) => (createExerciseModalDirty = dirty)}
	/>
{/if}

<UnsavedChangesGuard dirty={guardDirty} />
