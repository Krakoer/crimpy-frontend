<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		children: Snippet;
	}

	let { id, children }: Props = $props();

	const droppable = createDroppable({ get id() { return id; } });
</script>

<div
	{@attach droppable.attach}
	style:outline={droppable.isDropTarget ? '2px dashed #C6613F' : undefined}
	style:background-color={droppable.isDropTarget ? '#FFF5F0' : undefined}
	style="position: relative; transition: background-color 0.1s;"
>
	{@render children()}
</div>
