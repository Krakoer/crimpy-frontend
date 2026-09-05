<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import { pointerIntersection } from '@dnd-kit/collision';
	import { createDragSourceGuard } from './drag-source-guard.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		collisionPriority: number;
		// A nested list says so when a block is about to land in it. The root list
		// stays quiet: everything already sits in it.
		highlighted?: boolean;
		children: Snippet<[boolean]>;
	}

	let { id, collisionPriority, highlighted = false, children }: Props = $props();

	const guard = createDragSourceGuard();

	const droppable = createDroppable({
		get id() {
			return id;
		},
		get disabled() {
			return guard.insideDragSource;
		},
		get collisionPriority() {
			return collisionPriority;
		},
		collisionDetector: pointerIntersection
	});
</script>

<div
	{@attach droppable.attach}
	{@attach guard.attach}
	class="flex flex-col gap-2"
	style="border-radius: var(--rs); transition: background 0.15s;"
	style:background={highlighted && droppable.isDropTarget ? 'var(--pr-fog)' : undefined}
>
	{@render children(droppable.isDropTarget)}
</div>
