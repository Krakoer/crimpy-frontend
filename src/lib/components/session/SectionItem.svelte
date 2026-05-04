<script lang="ts">
	import type { Exercise, SessionItem } from '$lib/api/client';
	import ItemList from './ItemList.svelte';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		item: SessionItem;
		exercises: Exercise[];
		onRemove: () => void;
		depth: number;
	}

	let { item = $bindable(), exercises, onRemove, depth }: Props = $props();

	let collapsed = $state(false);

	if (!item.items) item.items = [];

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div class="border border-black" style="border-left: 3px solid #888; border-radius: 4px;">
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 15px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'V'}
		</button>
		<span
			class="shrink-0"
			style="font-family: monospace; font-size: 14px; color: #aaa; letter-spacing: 0.5px;"
		>SECTION</span>
		<input
			type="text"
			bind:value={item.section_title}
			class="flex-1 border-0 bg-transparent font-bold outline-none"
			style="font-family: monospace; font-size: 15px;"
			placeholder="Section title"
		/>
		<div class="flex shrink-0 items-center gap-2">
			<button
				onclick={onRemove}
				class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-500 hover:text-red-500"
				style="font-family: monospace; font-size: 15px;"
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
				allowedTypes={['exercise', 'hangboard']}
				depth={depth + 1}
				containerId={'container:' + item._id}
			/>
		</div>
	{/if}
</div>
