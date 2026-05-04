<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';

	interface Props {
		containerId: string;
	}

	let { containerId }: Props = $props();

	const droppable = createDroppable({ id: containerId });
</script>

<div
	{@attach droppable.attach}
	class="flex min-h-10 items-center justify-center border border-dashed border-gray-200"
	style="font-family: monospace; font-size: 15px; color: #ccc; border-radius: 4px;"
>
	drop here
</div>
