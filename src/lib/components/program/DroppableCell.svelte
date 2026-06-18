<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		disabled?: boolean;
		children: Snippet;
	}

	let { id, disabled = false, children }: Props = $props();

	const droppable = createDroppable({
		get id() {
			return id;
		}
	});
</script>

<div
	{@attach droppable.attach}
	style:outline={!disabled && droppable.isDropTarget ? '2px dashed #C6613F' : undefined}
	style:background-color={!disabled && droppable.isDropTarget ? '#FFF5F0' : undefined}
	style="position: relative; transition: background-color 0.1s;"
>
	{@render children()}
</div>
