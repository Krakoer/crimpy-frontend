<script lang="ts">
	interface Props {
		// What the athlete reached, one entry per pass that reported this field.
		values: number[];
		// How one value reads, e.g. "28 reps" or "17.5 kg".
		format: (value: number) => string;
	}

	let { values, format }: Props = $props();

	// Sits directly under the number that was asked for, which is what puts
	// asked and achieved on one line for a coach reading down the card.
	let line = $derived(values.map(format).join(', '));
</script>

{#if values.length > 0}
	<span data-testid="achieved-under" style="font-size: 10px; color: var(--pr); font-weight: 700;">
		did {line}
	</span>
{/if}
