<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		disabled?: boolean;
		children: Snippet;
	}

	let { id, disabled = false, children }: Props = $props();

	const draggable = createDraggable({ get id() { return id; } });
</script>

<div
	{@attach draggable.attach}
	style="touch-action: none; cursor: {disabled ? 'default' : 'grab'};"
	style:pointer-events={disabled ? 'none' : undefined}
	style:opacity={draggable.isDragging ? '0.4' : undefined}
>
	{@render children()}
</div>
