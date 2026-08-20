<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		disabled?: boolean;
		children: Snippet;
	}

	let { id, disabled = false, children }: Props = $props();

	const draggable = createDraggable({
		get id() {
			return id;
		},
		get disabled() {
			return disabled;
		}
	});
</script>

<!-- A played session still drags: its day and its order are not part of what was
	prescribed. Only leaving its own week is refused, and the page checks that on
	drop. -->
<div
	{@attach draggable.attach}
	style="touch-action: none; cursor: {disabled ? 'default' : 'grab'};"
	style:pointer-events={disabled ? 'none' : undefined}
	style:opacity={draggable.isDragging ? '0.4' : undefined}
>
	{@render children()}
</div>
