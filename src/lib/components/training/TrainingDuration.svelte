<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import { formatLength, trainingDurationSeconds } from '$lib/training-duration';

	// How long the training runs, as the athlete's app reads it on the card
	// they start it from. Nothing is shown when nothing in it is timed: a log
	// only training, an empty one, or one made only of self paced steps. Null
	// items mean they could not be read, which says so rather than passing for
	// a training with nothing timed in it.
	interface Props {
		items: TrainingItem[] | null;
		size?: 'sm' | 'md';
	}

	let { items, size = 'sm' }: Props = $props();

	let seconds = $derived(items === null ? null : trainingDurationSeconds(items));
</script>

{#if seconds === null || seconds > 0}
	<span
		data-testid="training-duration"
		title={seconds === null
			? 'Duration unknown: the blocks of this training could not be read with the list.'
			: 'Total duration: timed work and rest. Self-paced steps are not counted.'}
		style="
			display: inline-flex; align-items: center; gap: 4px;
			font-size: {size === 'md' ? '12.5px' : '11.5px'}; color: var(--tx2);
			font-variant-numeric: tabular-nums; white-space: nowrap;
		"
	>
		<Icon name="stopwatch" size={size === 'md' ? 13 : 12} color="var(--tx3)" />
		{seconds === null ? '--' : formatLength(seconds)}
	</span>
{/if}
