<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';

	interface Props {
		item: TrainingItem;
		// The card padding the block lays itself out with. A card body that is
		// already padded, such as the hangboard one, passes null; the whole block
		// disappears with the comment either way, which is why the padding lives
		// here rather than on a wrapper the caller would leave behind empty.
		inset?: string | null;
	}

	let { item, inset = '0 18px 12px' }: Props = $props();
</script>

{#if item.comment?.trim()}
	<div style={inset ? `padding: ${inset};` : ''}>
		<div
			style="padding: 8px 12px; background: var(--pr-fog); border-left: 3px solid var(--pr); border-radius: 0 var(--rs) var(--rs) 0;"
		>
			<span
				style="font-size: 12px; line-height: 1.5; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;"
				>{item.comment}</span
			>
		</div>
	</div>
{/if}
