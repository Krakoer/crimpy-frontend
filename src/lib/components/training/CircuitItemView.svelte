<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ItemListView from './ItemListView.svelte';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		depth: number;
	}

	let { item, exercises, depth }: Props = $props();

	let collapsed = $state(false);

	function fmtTime(seconds: number): string {
		if (seconds <= 0) return '0s';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		if (m > 0 && s > 0) return `${m}mn ${s}s`;
		if (m > 0) return `${m}mn`;
		return `${s}s`;
	}

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div class="border border-black" style="border-radius: 4px;">
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 15px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'V'}
		</button>
		<span class="shrink-0 font-bold" style="font-family: monospace; font-size: 15px;">Circuit</span>
		<span style="font-family: monospace; font-size: 14px; color: #aaa;">
			{item.cycles ?? 1} sets with {fmtTime(item.cycle_rest_seconds ?? 0)} rest
		</span>
	</div>

	{#if !collapsed}
		<div class="border-t border-gray-200 p-3">
			<ItemListView items={item.items ?? []} {exercises} depth={depth + 1} />
		</div>
	{/if}
</div>
