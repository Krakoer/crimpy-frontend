<script lang="ts">
	import type { Exercise, SessionItem } from '$lib/api/client';
	import ItemList from './ItemList.svelte';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		item: SessionItem;
		exercises: Exercise[];
		onRemove: () => void;
		onMoveUp: (() => void) | null;
		onMoveDown: (() => void) | null;
		depth: number;
	}

	let { item = $bindable(), exercises, onRemove, onMoveUp, onMoveDown, depth }: Props = $props();

	let collapsed = $state(false);

	if (!item.items) item.items = [];

	let restMin = $state(Math.floor((item.cycle_rest_seconds ?? 0) / 60));
	let restSec = $state((item.cycle_rest_seconds ?? 0) % 60);

	$effect(() => {
		item.cycle_rest_seconds = restMin * 60 + restSec;
	});

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div class="group border border-black" style="border-radius: 4px;">
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 11px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'V'}
		</button>
		<span class="shrink-0 font-bold" style="font-family: monospace; font-size: 13px;">Circuit</span>
		<div class="flex flex-1 flex-wrap items-center gap-1" style="font-family: monospace; font-size: 12px;">
			<input
				type="number"
				min="1"
				bind:value={item.cycles}
				class="w-9 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
				style="font-family: monospace; font-size: 12px;"
			/>
			<span style="color: #aaa;">sets with</span>
			<input
				type="number"
				min="0"
				bind:value={restMin}
				class="w-9 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
				style="font-family: monospace; font-size: 12px;"
			/>
			<span style="color: #aaa;">mn</span>
			<input
				type="number"
				min="0"
				max="59"
				bind:value={restSec}
				class="w-9 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
				style="font-family: monospace; font-size: 12px;"
			/>
			<span style="color: #aaa;">s rest</span>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				{#if onMoveUp}
					<button
						onclick={onMoveUp}
						class="px-1 text-gray-400 transition-colors hover:text-black"
						style="font-family: monospace; font-size: 10px;"
						aria-label="Move up"
					>^</button>
				{/if}
				{#if onMoveDown}
					<button
						onclick={onMoveDown}
						class="px-1 text-gray-400 transition-colors hover:text-black"
						style="font-family: monospace; font-size: 10px;"
						aria-label="Move down"
					>v</button>
				{/if}
			</div>
			<button
				onclick={onRemove}
				class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-500 hover:text-red-500"
				style="font-family: monospace; font-size: 11px;"
			>
				Delete
			</button>
		</div>
	</div>

	{#if !collapsed}
		<div class="border-t border-gray-200 p-3">
			<ItemList
				bind:items={item.items!}
				{exercises}
				allowedTypes={depth < 1 ? ['exercise', 'section', 'hangboard'] : ['exercise', 'hangboard']}
				depth={depth + 1}
			/>
		</div>
	{/if}
</div>
