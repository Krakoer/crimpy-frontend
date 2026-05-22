<script lang="ts">
	import type { Exercise, TrainingItem, TrainingItemType } from '$lib/api/client';
	import ExerciseItem from './ExerciseItem.svelte';
	import HangboardItem from './HangboardItem.svelte';
	import CircuitItem from './CircuitItem.svelte';
	import SectionItem from './SectionItem.svelte';
	import SortableWrapper from './SortableWrapper.svelte';
	import AddZone from './AddZone.svelte';
	import { setContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		items: TrainingItem[];
		exercises: Exercise[];
		allowedTypes?: TrainingItemType[];
		circuitInnerAllowedTypes?: TrainingItemType[];
		depth?: number;
		containerId?: string;
	}

	let {
		items = $bindable(),
		exercises,
		allowedTypes = ['exercise', 'circuit', 'section', 'hangboard'],
		circuitInnerAllowedTypes,
		depth = 0,
		containerId = 'root'
	}: Props = $props();

	let collapseSignals = $state({ collapse: 0, expand: 0 });

	untrack(() => {
		if (depth === 0) setContext(COLLAPSE_KEY, collapseSignals);
	});

	function addItem(type: TrainingItemType, exerciseId?: string) {
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
			base.loads = [{ value: 0, unit: 'percent_bw' }];
			base.hand_positions = [['HC', 'HC', 'HC', 'HC', 'HC', 'HC']];
		}
		items.push(base);
	}

	function removeItem(index: number) {
		items.splice(index, 1);
	}
</script>

<div class="flex flex-col gap-2">
	{#if depth === 0}
		<div style="display: flex; gap: 8px; margin-bottom: 4px; padding: 0 4px; align-items: center;">
			<span
				onclick={() => { collapseSignals.expand++; }}
				style="font-size: 12px; color: var(--pr); font-weight: 600; cursor: pointer;"
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && collapseSignals.expand++}
			>Expand all</span>
			<span style="color: var(--tx3);">·</span>
			<span
				onclick={() => { collapseSignals.collapse++; }}
				style="font-size: 12px; color: var(--tx3); font-weight: 600; cursor: pointer;"
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && collapseSignals.collapse++}
			>Collapse all</span>
			<div style="flex: 1;"></div>
			<span style="font-size: 12px; color: var(--tx3);">{items.length} blocks</span>
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
					innerAllowedTypes={circuitInnerAllowedTypes}
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

	<AddZone {containerId} {allowedTypes} onAdd={addItem} />
</div>
