<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';

	interface Props {
		item: TrainingItem;
		// A program week reads the protocol rather than edits it: the rule is
		// what the block is, and a week that resolves differently is retuning the
		// numbers the rule reads rather than the rule.
		overriding: boolean;
	}

	let { item, overriding }: Props = $props();

	// Matches maxItemProtocolLen in crimpy-backend. A protocol is prose with a
	// condition in it rather than a label, so it gets the comment's room.
	const MAX_PROTOCOL_LENGTH = 2000;
</script>

{#if overriding}
	{#if item.protocol?.trim()}
		<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
			<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
				>PROTOCOL</span
			>
			<p
				style="margin: 0; font-size: 12px; line-height: 1.4; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;"
			>
				{item.protocol}
			</p>
		</div>
	{/if}
{:else}
	<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
		<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
			>PROTOCOL</span
		>
		<textarea
			aria-label="Protocol"
			bind:value={item.protocol}
			maxlength={MAX_PROTOCOL_LENGTH}
			rows="2"
			placeholder="The rule the athlete resolves (e.g. to failure or 40s; past 40s add 5kg, short of it put your feet on the ground)"
			onclick={(e) => e.stopPropagation()}
			style="width: 100%; resize: vertical; min-height: 38px; padding: 6px 8px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; line-height: 1.4; color: var(--tx); outline: none; background: #fff;"
		></textarea>
		<span style="font-size: 10px; color: var(--tx3); align-self: flex-end;"
			>{(item.protocol ?? '').length}/{MAX_PROTOCOL_LENGTH}</span
		>
	</div>
{/if}
