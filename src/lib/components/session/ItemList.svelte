<script lang="ts">
	import type { Exercise, SessionItem, SessionItemType } from '$lib/api/client';
	import ExerciseItem from './ExerciseItem.svelte';
	import HangboardItem from './HangboardItem.svelte';
	import CircuitItem from './CircuitItem.svelte';
	import SectionItem from './SectionItem.svelte';
	import SortableWrapper from './SortableWrapper.svelte';
	import AddZone from './AddZone.svelte';
	import { setContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		items: SessionItem[];
		exercises: Exercise[];
		allowedTypes?: SessionItemType[];
		depth?: number;
		containerId?: string;
	}

	let {
		items = $bindable(),
		exercises,
		allowedTypes = ['exercise', 'circuit', 'section', 'hangboard'],
		depth = 0,
		containerId = 'root'
	}: Props = $props();

	let collapseSignals = $state({ collapse: 0, expand: 0 });

	if (depth === 0) {
		setContext(COLLAPSE_KEY, collapseSignals);
	}

	function addItem(type: SessionItemType, exerciseId?: string) {
		const base: SessionItem = { type, _id: crypto.randomUUID() };
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
			base.loads = [{ value: 0, unit: 'percent_bw' }];
			base.hand_positions = [['HC', 'HC', 'HC', 'HC', 'HC', 'HC']];
		}
		items.push(base);
	}

	function removeItem(index: number) {
		items.splice(index, 1);
	}
</script>

<div class="space-y-2">
	{#if depth === 0}
		<div class="mb-4 flex gap-2">
			<button
				onclick={() => { collapseSignals.collapse++; }}
				class="border border-gray-200 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
				style="font-family: monospace; font-size: 15px;"
			>
				Collapse all
			</button>
			<button
				onclick={() => { collapseSignals.expand++; }}
				class="border border-gray-200 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
				style="font-family: monospace; font-size: 15px;"
			>
				Expand all
			</button>
		</div>
	{/if}

	{#each items as item, i (item._id)}
		<SortableWrapper id={item._id!} group={containerId} index={i}>
			{#if item.type === 'exercise'}
				<ExerciseItem bind:item={items[i]} {exercises} onRemove={() => removeItem(i)} />
			{:else if item.type === 'hangboard'}
				<HangboardItem bind:item={items[i]} onRemove={() => removeItem(i)} />
			{:else if item.type === 'circuit'}
				<CircuitItem
					bind:item={items[i]}
					{exercises}
					onRemove={() => removeItem(i)}
					{depth}
				/>
			{:else if item.type === 'section'}
				<SectionItem
					bind:item={items[i]}
					{exercises}
					onRemove={() => removeItem(i)}
					{depth}
				/>
			{/if}
		</SortableWrapper>
	{/each}

	<AddZone {containerId} {allowedTypes} {exercises} onAdd={addItem} />
</div>
