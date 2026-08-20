<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		disabled?: boolean;
		locked?: boolean;
		children: Snippet;
	}

	let { id, disabled = false, locked = false, children }: Props = $props();

	const draggable = createDraggable({
		get id() {
			return id;
		},
		get disabled() {
			return disabled || locked;
		}
	});
</script>

<!-- A locked session cannot be dragged either, but it keeps its pointer events
	so the coach can hover it and read why it is frozen. -->
<div
	{@attach draggable.attach}
	style="touch-action: none; cursor: {disabled || locked ? 'default' : 'grab'};"
	style:pointer-events={disabled ? 'none' : undefined}
	style:opacity={draggable.isDragging ? '0.4' : undefined}
>
	{@render children()}
</div>
