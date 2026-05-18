<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		children: Snippet;
	}

	let { id, children }: Props = $props();

	const draggable = createDraggable({ get id() { return id; } });
</script>

<div
	{@attach draggable.attach}
	style="touch-action: none; cursor: grab;"
	style:opacity={draggable.isDragging ? '0.4' : undefined}
>
	{@render children()}
</div>
