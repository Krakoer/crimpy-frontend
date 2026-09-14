<script lang="ts">
	import { needsPassLabels, type AchievedEntry } from './results-context';

	interface Props {
		// What the athlete reached, one entry per pass that reported this field.
		entries: AchievedEntry[];
		// How one value reads, e.g. "28" or "17.5 kg".
		format: (value: number) => string;
	}

	let { entries, format }: Props = $props();

	// Named by pass only when the order no longer says which is which, so the
	// common single-pass exercise stays a bare number.
	let labelled = $derived(needsPassLabels(entries));

	// Sits directly under the number that was asked for, which is what puts
	// asked and achieved on one line for a coach reading down the card.
	let line = $derived(
		entries
			.map((e) => (labelled ? `#${e.occurrence + 1} ${format(e.value)}` : format(e.value)))
			.join(', ')
	);
</script>

{#if entries.length > 0}
	<span data-testid="achieved-under" style="font-size: 10px; color: var(--pr); font-weight: 700;">
		did {line}
	</span>
{/if}
