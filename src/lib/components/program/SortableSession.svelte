<script lang="ts">
	import { createSortable } from '@dnd-kit/svelte/sortable';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		group: string;
		index: number;
		disabled?: boolean;
		children: Snippet;
	}

	let { id, group, index, disabled = false, children }: Props = $props();

	const sortable = createSortable({
		get id() {
			return id;
		},
		get group() {
			return group;
		},
		get index() {
			return index;
		},
		get disabled() {
			return disabled;
		}
	});
</script>

<!-- Sortable rather than merely draggable, so a session dropped onto another one
	takes its place in the cell instead of landing at the end. The order inside a
	cell is what the save turns into the position the server stores.

	A played session still drags: its day and its order are not part of what was
	prescribed. Only leaving its own week is refused, and the page checks that on
	drag over and on drop. -->
<div
	{@attach sortable.attach}
	style="touch-action: none; cursor: {disabled ? 'default' : 'grab'};"
	style:pointer-events={disabled ? 'none' : undefined}
	style:opacity={sortable.isDragging ? '0.4' : undefined}
>
	{@render children()}
</div>
