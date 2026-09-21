<script lang="ts">
	import { formatUnitValue, unitLabel } from '$lib/assessments';
	import { formatRatio, type BodyweightReading } from './bodyweight-ratio';

	interface Props {
		// LEFT, RIGHT or LATEST: which of the measurement's numbers this is.
		label: string;
		// The hand's own colour, which is how the two are told apart at a glance.
		// It is written at 10px on a white card, so a caller hands over the text
		// form of its accent rather than the accent: no accent in the palette
		// clears the 4.5:1 floor on white. See Krakoer/crimpy#128.
		labelColor: string;
		// Absent for a hand the athlete has never measured, which reads as a dash
		// rather than as a zero.
		reading: BodyweightReading | null;
		unit: string;
		// The card this sits on decides how big the number is. Nothing else about
		// it differs between the results tab and the summary beside the sessions,
		// and two copies of this markup would drift the moment one is fixed.
		size: number;
	}

	let { label, labelColor, reading, unit, size }: Props = $props();

	// The unit decides how the number prints, so it is not also asked for as a
	// formatter: two props saying one thing are two props that can disagree.
	let headline = $derived.by(() => {
		if (!reading) return formatUnitValue(undefined, unit);
		return reading.ratio === undefined
			? formatUnitValue(reading.raw, unit)
			: formatRatio(reading.ratio);
	});

	// Only the load, which is the part that differs between the two hands. The
	// weight it was divided by and the day it was taken belong to the session, so
	// the card names them once underneath rather than under each hand, where they
	// would be said twice and wrap mid date in a column half a card wide.
	let load = $derived(
		reading && reading.ratio !== undefined
			? `${formatUnitValue(reading.raw, unit)} ${unitLabel(unit)}`
			: ''
	);
</script>

<div style="min-width: 0;">
	<div style="font-size: 10px; color: {labelColor}; font-weight: 600; letter-spacing: 0.06em;">
		{label}
	</div>
	<div style="font-size: {size}px; font-weight: 700; color: var(--tx); line-height: 1;">
		{headline}
	</div>
	{#if load}
		<div style="font-size: 11px; color: var(--tx3); margin-top: 4px;">{load}</div>
	{/if}
</div>
