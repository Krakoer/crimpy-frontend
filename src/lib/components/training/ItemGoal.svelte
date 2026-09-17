<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';

	interface Props {
		item: TrainingItem;
		// A program week reads the goal rather than edits it: what a block is for
		// holds across the weeks that retune its numbers, so it is written once,
		// on the training. This is what keeps it apart from the comment beside it.
		overriding: boolean;
	}

	let { item, overriding }: Props = $props();

	// Matches maxItemGoalLen in crimpy-backend. A goal names what the block
	// trains rather than explaining it, so it is a line and not a paragraph.
	const MAX_GOAL_LENGTH = 200;
</script>

{#if overriding}
	{#if item.goal?.trim()}
		<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
			<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
				>GOAL</span
			>
			<p
				style="margin: 0; font-size: 12px; line-height: 1.4; color: var(--tx2); overflow-wrap: anywhere;"
			>
				{item.goal}
			</p>
		</div>
	{/if}
{:else}
	<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
		<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
			>GOAL</span
		>
		<input
			type="text"
			bind:value={item.goal}
			maxlength={MAX_GOAL_LENGTH}
			placeholder="What this block trains (e.g. finger endurance)"
			onclick={(e) => e.stopPropagation()}
			style="width: 100%; padding: 6px 8px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; line-height: 1.4; color: var(--tx); outline: none; background: #fff;"
		/>
		<span style="font-size: 10px; color: var(--tx3); align-self: flex-end;"
			>{(item.goal ?? '').length}/{MAX_GOAL_LENGTH}</span
		>
	</div>
{/if}
