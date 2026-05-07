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

	const draggable = createDraggable({ get id() { return id; } });
</script>

<button
	{@attach draggable.attach}
	{onclick}
	class={cls}
	style="{baseStyle}; touch-action: none; cursor: grab;"
	style:opacity={draggable.isDragging ? '0.5' : undefined}
>
	{@render children()}
</button>
