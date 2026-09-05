<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		onclick?: () => void;
		class?: string;
		style?: string;
		children: Snippet;
	}

	let { id, onclick, class: cls = '', style: baseStyle = '', children }: Props = $props();

	const draggable = createDraggable({
		get id() {
			return id;
		}
	});

	// A button only where a click does something. The training editor's palette
	// adds the block on click, so it says so and answers Enter and Space. The
	// program rail has nothing to click, and announcing a button that answers no
	// key is worse than announcing nothing: dnd-kit labels the element as a drag
	// source by itself, and the keyboard sensor picks the training up from there.
	const clickableAttributes = $derived(onclick ? { role: 'button', tabindex: 0 } : {});
</script>

<!-- touch-action stays off whatever else the item does: it is always a drag
	source, and a browser that keeps the gesture for scrolling cancels the drag
	before the sensor sees it. -->
<div
	{@attach draggable.attach}
	{...clickableAttributes}
	{onclick}
	onkeydown={(e) => {
		if (onclick && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onclick();
		}
	}}
	class={cls}
	style="{baseStyle}; touch-action: none; cursor: grab;"
	style:opacity={draggable.isDragging ? '0.5' : undefined}
>
	{@render children()}
</div>
