<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';

	interface Props {
		item: TrainingItem;
		// The card padding the block lays itself out with, read the same way
		// ItemCommentDisplay reads it: a card body that is already padded passes
		// null, and the whole block disappears with the goal either way.
		inset?: string | null;
	}

	let { item, inset = '0 18px 12px' }: Props = $props();
</script>

{#if item.goal?.trim()}
	<div style={inset ? `padding: ${inset};` : ''}>
		<!-- Sage rather than the comment's terracotta, and labelled, so the two
		     notes on a card are told apart without reading them: this one is why
		     the block is in the program, the other is how to run it. -->
		<div
			style="display: flex; align-items: baseline; gap: 8px; padding: 6px 12px; background: var(--gn-fog); border-left: 3px solid var(--gn); border-radius: 0 var(--rs) var(--rs) 0;"
		>
			<span
				style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--gn-tx); flex-shrink: 0;"
				>GOAL</span
			>
			<span style="font-size: 12px; line-height: 1.5; color: var(--tx2); overflow-wrap: anywhere;"
				>{item.goal}</span
			>
		</div>
	</div>
{/if}
