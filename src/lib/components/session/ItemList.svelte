<script lang="ts">
	import type { Exercise, SessionItem, SessionItemType } from '$lib/api/client';
	import ExerciseItem from './ExerciseItem.svelte';
	import HangboardItem from './HangboardItem.svelte';
	import CircuitItem from './CircuitItem.svelte';
	import SectionItem from './SectionItem.svelte';

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

	function addItem(type: SessionItemType) {
		const base: SessionItem = { type };
		if (type === 'exercise') {
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

	const TYPE_LABELS: Record<SessionItemType, string> = {
		exercise: 'EXERCISE',
		circuit: 'CIRCUIT',
		section: 'SECTION',
		hangboard: 'HANGBOARD'
	};
</script>

<div class="space-y-2">
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

	<div class="flex flex-wrap gap-2 pt-1">
		{#each allowedTypes as type}
			<button
				onclick={() => addItem(type)}
				class="border border-dashed border-gray-400 px-3 py-1 text-gray-500 transition-colors hover:border-black hover:text-black"
				style="font-family: monospace; font-size: 11px;"
			>
				+ {TYPE_LABELS[type]}
			</button>
		{/each}
	</div>
</div>
