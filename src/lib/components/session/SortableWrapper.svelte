<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createSortable } from '@dnd-kit/svelte/sortable';

	interface Props {
		id: string;
		group: string;
		index: number;
		children: Snippet;
	}

	let { id, group, index, children }: Props = $props();

	const sortable = createSortable({
		id,
		get group() { return group; },
		get index() { return index; }
	});
</script>

<div {@attach sortable.attach} class="group relative" style:opacity={sortable.isDragging ? '0.4' : undefined}>
	<button
		{@attach sortable.attachHandle}
		class="absolute inset-y-0 left-0 z-10 flex w-5 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
		style="color: #bbb;"
		tabindex="-1"
		aria-label="Drag to reorder"
	>
		<svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
			<circle cx="2" cy="2" r="1.2" />
			<circle cx="2" cy="7" r="1.2" />
			<circle cx="2" cy="12" r="1.2" />
			<circle cx="6" cy="2" r="1.2" />
			<circle cx="6" cy="7" r="1.2" />
			<circle cx="6" cy="12" r="1.2" />
		</svg>
	</button>
	{@render children()}
</div>
