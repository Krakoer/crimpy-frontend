<script lang="ts">
	interface Props {
		// The counts the athlete reached, one per pass through the item.
		values: number[];
		// What the counts are, e.g. "reps" or "rounds".
		unit: string;
		// What was asked for, when there was a number to ask for. An emom names
		// its rounds; an AMRAP names nothing, which is the point of it.
		prescribed?: number;
	}

	let { values, unit, prescribed }: Props = $props();

	// A ten round emom records ten counts, which do not fit on the header line of
	// a card nested two levels deep. The first few carry the shape of the block
	// (they are the ones that fell off), and the rest are counted rather than
	// listed; the title attribute keeps every one of them reachable.
	const SHOWN = 4;
	let shown = $derived(values.slice(0, SHOWN).join(', '));
	let hidden = $derived(values.length - SHOWN);
	let full = $derived(values.join(', '));
</script>

{#if values.length > 0}
	<span
		data-testid="achieved-badge"
		title={full}
		style="
			display: inline-flex; align-items: baseline; gap: 5px; flex-shrink: 0;
			padding: 2px 9px; border-radius: 999px;
			background: var(--pr-fog); color: var(--pr);
			font-size: 11px; font-weight: 700; white-space: nowrap;
		"
	>
		<span style="font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.8;"
			>Did</span
		>
		{shown}{#if hidden > 0}<span style="font-weight: 600; opacity: 0.75;">+{hidden}</span
			>{/if}{#if prescribed !== undefined}<span style="font-weight: 600; opacity: 0.75;"
				>/{prescribed}</span
			>{/if}
		<span style="font-weight: 600; opacity: 0.75;">{unit}</span>
	</span>
{/if}
