<script lang="ts">
	import type { Exercise, SessionItem } from '$lib/api/client';
	import ItemList from './ItemList.svelte';

	interface Props {
		item: SessionItem;
		exercises: Exercise[];
		onRemove: () => void;
		onMoveUp: (() => void) | null;
		onMoveDown: (() => void) | null;
		depth: number;
	}

	let { item, exercises, onRemove, onMoveUp, onMoveDown, depth }: Props = $props();

	let collapsed = $state(false);

	if (!item.items) item.items = [];
</script>

<div class="border border-black" style="border-left: 3px solid #888;">
	<div class="flex items-center gap-2 px-3 py-2" style="background-color: #F8F8F8;">
		<span
			class="shrink-0 px-1.5 py-0.5"
			style="font-family: monospace; font-size: 10px; font-weight: bold; background-color: #888; color: white; letter-spacing: 0.5px;"
		>
			SECTION
		</span>
		<input
			type="text"
			bind:value={item.section_title}
			class="flex-1 border-0 bg-transparent font-bold outline-none"
			style="font-family: monospace; font-size: 13px;"
			placeholder="Section title"
		/>
		<div class="flex shrink-0 gap-1">
			<button
				onclick={() => (collapsed = !collapsed)}
				class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:bg-gray-100"
				style="font-family: monospace; font-size: 11px;"
			>
				{collapsed ? '+' : '-'}
			</button>
			{#if onMoveUp}
				<button
					onclick={onMoveUp}
					class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 11px;"
					aria-label="Move up"
				>
					^
				</button>
			{/if}
			{#if onMoveDown}
				<button
					onclick={onMoveDown}
					class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 11px;"
					aria-label="Move down"
				>
					v
				</button>
			{/if}
			<button
				onclick={onRemove}
				class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:border-red-600 hover:text-red-600"
				style="font-family: monospace; font-size: 11px;"
				aria-label="Remove section"
			>
				x
			</button>
		</div>
	</div>

	{#if !collapsed}
		<div class="p-3">
			<ItemList
				bind:items={item.items!}
				{exercises}
				allowedTypes={['exercise', 'hangboard']}
				depth={depth + 1}
			/>
		</div>
	{/if}
</div>
