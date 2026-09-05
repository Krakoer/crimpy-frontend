<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		disabled?: boolean;
		children: Snippet;
	}

	let { id, disabled = false, children }: Props = $props();

	// A cell outside edit mode takes no drops. Saying so here rather than only in
	// the styles is what keeps it out of the collision pass entirely, instead of
	// leaving it an accepting target that merely declines to look like one.
	const droppable = createDroppable({
		get id() {
			return id;
		},
		get disabled() {
			return disabled;
		}
	});
</script>

<div
	{@attach droppable.attach}
	data-testid={id}
	style:outline={droppable.isDropTarget ? '2px dashed var(--pr)' : undefined}
	style:background-color={droppable.isDropTarget ? 'var(--pr-fog)' : undefined}
	style="position: relative; transition: background-color 0.1s;"
>
	{@render children()}
</div>
