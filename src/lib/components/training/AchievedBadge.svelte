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
</script>

{#if values.length > 0}
	<span
		data-testid="achieved-badge"
		style="
			display: inline-flex; align-items: baseline; gap: 5px;
			padding: 2px 9px; border-radius: 999px;
			background: var(--pr-fog); color: var(--pr);
			font-size: 11px; font-weight: 700; white-space: nowrap;
		"
	>
		<span style="font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.8;"
			>Did</span
		>
		{values.join(', ')}{#if prescribed !== undefined}<span style="font-weight: 600; opacity: 0.75;"
				>/{prescribed}</span
			>{/if}
		<span style="font-weight: 600; opacity: 0.75;">{unit}</span>
	</span>
{/if}
