<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';

	interface Props {
		item: TrainingItem;
		// A program week reads the comment rather than edits it: a note to the
		// athlete is written once, on the training.
		overriding: boolean;
	}

	let { item, overriding }: Props = $props();

	const MAX_COMMENT_LENGTH = 2000;
</script>

{#if overriding}
	{#if item.comment}
		<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
			<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
				>COMMENT</span
			>
			<p
				style="margin: 0; font-size: 12px; line-height: 1.4; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;"
			>
				{item.comment}
			</p>
		</div>
	{/if}
{:else}
	<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
		<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
			>COMMENT</span
		>
		<textarea
			bind:value={item.comment}
			maxlength={MAX_COMMENT_LENGTH}
			rows="2"
			placeholder="Optional note for the athlete (e.g. 3 sec pause at the bottom of each rep)"
			onclick={(e) => e.stopPropagation()}
			style="width: 100%; resize: vertical; min-height: 38px; padding: 6px 8px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; line-height: 1.4; color: var(--tx); outline: none; background: #fff;"
		></textarea>
		<span style="font-size: 10px; color: var(--tx3); align-self: flex-end;"
			>{(item.comment ?? '').length}/{MAX_COMMENT_LENGTH}</span
		>
	</div>
{/if}
