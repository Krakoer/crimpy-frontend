<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ExerciseItemView from './ExerciseItemView.svelte';
	import HangboardItemView from './HangboardItemView.svelte';
	import HangboardRepItemView from './HangboardRepItemView.svelte';
	import CircuitItemView from './CircuitItemView.svelte';
	import GroupItemView from './GroupItemView.svelte';
	import { setContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		items: TrainingItem[];
		exercises: Exercise[];
		depth?: number;
		// The collapse controls belong to the training editor. A read-only view
		// of a tree, such as a session's prescription, turns them off.
		showControls?: boolean;
	}

	let { items, exercises, depth = 0, showControls = true }: Props = $props();

	let collapseSignals = $state({ collapse: 0, expand: 0 });

	untrack(() => {
		if (depth === 0) setContext(COLLAPSE_KEY, collapseSignals);
	});
</script>

<div class="space-y-2">
	{#if depth === 0 && showControls}
		<div style="display: flex; gap: 6px; margin-bottom: 12px;">
			<button
				onclick={() => {
					collapseSignals.collapse++;
				}}
				style="
					padding: 5px 12px; border-radius: var(--rs);
					border: 1px solid var(--bd); background: #fff;
					font-size: 12px; font-weight: 600; color: var(--tx2);
					cursor: pointer; font-family: var(--font);
				">Collapse all</button
			>
			<button
				onclick={() => {
					collapseSignals.expand++;
				}}
				style="
					padding: 5px 12px; border-radius: var(--rs);
					border: 1px solid var(--bd); background: #fff;
					font-size: 12px; font-weight: 600; color: var(--tx2);
					cursor: pointer; font-family: var(--font);
				">Expand all</button
			>
		</div>
	{/if}

	{#each items as item (item._id ?? item.id)}
		{#if item.type === 'exercise'}
			<ExerciseItemView {item} {exercises} />
		{:else if item.type === 'repeater'}
			<HangboardItemView {item} />
		{:else if item.type === 'hangboard_rep'}
			<HangboardRepItemView {item} />
		{:else if item.type === 'circuit'}
			<CircuitItemView {item} {exercises} {depth} />
		{:else if item.type === 'group'}
			<GroupItemView {item} {exercises} {depth} />
		{/if}
	{/each}

	{#if items.length === 0}
		<p style="font-size: 13px; color: var(--tx3); padding: 8px 0;">No items</p>
	{/if}
</div>
