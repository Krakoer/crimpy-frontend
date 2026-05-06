<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ExerciseItemView from './ExerciseItemView.svelte';
	import HangboardItemView from './HangboardItemView.svelte';
	import CircuitItemView from './CircuitItemView.svelte';
	import SectionItemView from './SectionItemView.svelte';
	import { setContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		items: TrainingItem[];
		exercises: Exercise[];
		depth?: number;
	}

	let { items, exercises, depth = 0 }: Props = $props();

	let collapseSignals = $state({ collapse: 0, expand: 0 });

	if (depth === 0) {
		setContext(COLLAPSE_KEY, collapseSignals);
	}
</script>

<div class="space-y-2">
	{#if depth === 0}
		<div class="mb-4 flex gap-2">
			<button
				onclick={() => {
					collapseSignals.collapse++;
				}}
				class="border border-gray-200 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
				style="font-family: monospace; font-size: 15px;"
			>
				Collapse all
			</button>
			<button
				onclick={() => {
					collapseSignals.expand++;
				}}
				class="border border-gray-200 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
				style="font-family: monospace; font-size: 15px;"
			>
				Expand all
			</button>
		</div>
	{/if}

	{#each items as item (item._id ?? item.id)}
		{#if item.type === 'exercise'}
			<ExerciseItemView {item} {exercises} />
		{:else if item.type === 'hangboard'}
			<HangboardItemView {item} />
		{:else if item.type === 'circuit'}
			<CircuitItemView {item} {exercises} {depth} />
		{:else if item.type === 'section'}
			<SectionItemView {item} {exercises} {depth} />
		{/if}
	{/each}

	{#if items.length === 0}
		<p style="font-family: monospace; font-size: 13px; color: #bbb;">No items</p>
	{/if}
</div>
