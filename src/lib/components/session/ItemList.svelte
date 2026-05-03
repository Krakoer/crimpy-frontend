<script lang="ts">
	import type { Exercise, SessionItem, SessionItemType } from '$lib/api/client';
	import ExerciseItem from './ExerciseItem.svelte';
	import HangboardItem from './HangboardItem.svelte';
	import CircuitItem from './CircuitItem.svelte';
	import SectionItem from './SectionItem.svelte';
	import { setContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		items: SessionItem[];
		exercises: Exercise[];
		allowedTypes?: SessionItemType[];
		depth?: number;
	}

	let {
		items = $bindable(),
		exercises,
		allowedTypes = ['exercise', 'circuit', 'section', 'hangboard'],
		depth = 0
	}: Props = $props();

	let collapseSignals = $state({ collapse: 0, expand: 0 });
	let exerciseSearch = $state('');

	if (depth === 0) {
		setContext(COLLAPSE_KEY, collapseSignals);
	}

	let filteredExercises = $derived(
		exerciseSearch.trim()
			? exercises.filter((e) => e.name.toLowerCase().includes(exerciseSearch.toLowerCase()))
			: exercises
	);

	function addItem(type: SessionItemType, exerciseId?: string) {
		const base: SessionItem = { type };
		if (type === 'exercise') {
			base.exercise_id = exerciseId;
			base.reps = 1;
			base.reps_unit = 'count';
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
			base.loads = [{ value: 0, unit: 'percent_bw' }];
			base.hand_positions = [['HC', 'HC', 'HC', 'HC', 'HC', 'HC']];
		}
		items.push(base);
	}

	function removeItem(index: number) {
		items.splice(index, 1);
	}

	function moveUp(index: number) {
		if (index === 0) return;
		const tmp = items[index - 1];
		items[index - 1] = items[index];
		items[index] = tmp;
	}

	function moveDown(index: number) {
		if (index >= items.length - 1) return;
		const tmp = items[index + 1];
		items[index + 1] = items[index];
		items[index] = tmp;
	}

	let containerTypes = $derived(
		allowedTypes.filter((t): t is 'circuit' | 'section' | 'hangboard' =>
			t === 'circuit' || t === 'section' || t === 'hangboard'
		)
	);
</script>

<div class="space-y-2">
	{#if depth === 0}
		<div class="mb-4 flex gap-2">
			<button
				onclick={() => { collapseSignals.collapse++; }}
				class="border border-gray-200 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
				style="font-family: monospace; font-size: 11px;"
			>
				Collapse all
			</button>
			<button
				onclick={() => { collapseSignals.expand++; }}
				class="border border-gray-200 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
				style="font-family: monospace; font-size: 11px;"
			>
				Expand all
			</button>
		</div>
	{/if}

	{#each items as item, i (i)}
		{#if item.type === 'exercise'}
			<ExerciseItem
				bind:item={items[i]}
				{exercises}
				onRemove={() => removeItem(i)}
				onMoveUp={i > 0 ? () => moveUp(i) : null}
				onMoveDown={i < items.length - 1 ? () => moveDown(i) : null}
			/>
		{:else if item.type === 'hangboard'}
			<HangboardItem
				bind:item={items[i]}
				onRemove={() => removeItem(i)}
				onMoveUp={i > 0 ? () => moveUp(i) : null}
				onMoveDown={i < items.length - 1 ? () => moveDown(i) : null}
			/>
		{:else if item.type === 'circuit'}
			<CircuitItem
				bind:item={items[i]}
				{exercises}
				onRemove={() => removeItem(i)}
				onMoveUp={i > 0 ? () => moveUp(i) : null}
				onMoveDown={i < items.length - 1 ? () => moveDown(i) : null}
				{depth}
			/>
		{:else if item.type === 'section'}
			<SectionItem
				bind:item={items[i]}
				{exercises}
				onRemove={() => removeItem(i)}
				onMoveUp={i > 0 ? () => moveUp(i) : null}
				onMoveDown={i < items.length - 1 ? () => moveDown(i) : null}
				{depth}
			/>
		{/if}
	{/each}

	<div class="mt-1 space-y-2 border-t border-gray-100 pt-3">
		{#if containerTypes.length > 0}
			<div class="flex flex-wrap gap-1.5">
				{#each containerTypes as type}
					<button
						onclick={() => addItem(type)}
						class="border border-dashed border-gray-300 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
						style="font-family: monospace; font-size: 11px;"
					>
						{type.charAt(0).toUpperCase() + type.slice(1)} +
					</button>
				{/each}
			</div>
		{/if}

		{#if allowedTypes.includes('exercise')}
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<input
					type="text"
					bind:value={exerciseSearch}
					placeholder="Search exercises..."
					class="border border-gray-200 px-2 py-0.5 outline-none focus:border-gray-400"
					style="font-family: monospace; font-size: 11px; width: 160px;"
				/>
				{#if exercises.length === 0}
					<button
						onclick={() => addItem('exercise')}
						class="border border-dashed border-gray-300 px-3 py-0.5 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
						style="font-family: monospace; font-size: 11px;"
					>
						+ exercise
					</button>
				{:else if filteredExercises.length > 0}
					{#each filteredExercises as ex (ex.id)}
						<button
							onclick={() => addItem('exercise', ex.id)}
							class="border border-dashed border-gray-300 px-2 py-0.5 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
							style="font-family: monospace; font-size: 11px;"
						>
							{ex.name} +
						</button>
					{/each}
				{:else}
					<span style="font-family: monospace; font-size: 11px; color: #bbb;">No exercises found</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
