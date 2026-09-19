<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';

	interface Props {
		item: TrainingItem;
		// The card padding the block lays itself out with, read the same way
		// ItemGoalDisplay and ItemCommentDisplay read it: a card body that is
		// already padded passes null, and the whole block disappears with the
		// protocol either way.
		inset?: string | null;
	}

	let { item, inset = '0 18px 12px' }: Props = $props();
</script>

{#if item.protocol?.trim()}
	<div style={inset ? `padding: ${inset};` : ''}>
		<!-- Gold, a third colour beside the goal's sage and the comment's
		     terracotta, and labelled, so the three notes on a card are told apart
		     without reading them: this one is the rule that decides what the
		     numbers above it become. -->
		<div
			style="display: flex; align-items: baseline; gap: 8px; padding: 8px 12px; background: var(--gd-fog); border-left: 3px solid var(--gd); border-radius: 0 var(--rs) var(--rs) 0;"
		>
			<span
				style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--gd-tx); flex-shrink: 0;"
				>PROTOCOL</span
			>
			<span
				style="font-size: 12px; line-height: 1.5; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;"
				>{item.protocol}</span
			>
		</div>
	</div>
{/if}
