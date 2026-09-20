<script lang="ts">
	import { unitLabel } from '$lib/assessments';
	import {
		formatRatio,
		formatRatioBasis,
		missingRatioLabel,
		type BodyweightReading
	} from './bodyweight-ratio';

	interface Props {
		// LEFT, RIGHT or LATEST: which of the measurement's numbers this is.
		label: string;
		// The hand's own colour, which is how the two are told apart at a glance.
		labelColor: string;
		// Absent for a hand the athlete has never measured, which reads as a dash
		// rather than as a zero.
		reading: BodyweightReading | null;
		unit: string;
		// The card this sits on decides how big the number is. Nothing else about
		// it differs between the results tab and the summary beside the sessions,
		// and two copies of this markup would drift the moment one is fixed.
		size: number;
		// The value as its own unit prints it, for the case where there is no ratio
		// to print instead.
		format: (value: number | null | undefined) => string;
	}

	let { label, labelColor, reading, unit, size, format }: Props = $props();

	let headline = $derived.by(() => {
		if (!reading) return format(undefined);
		return reading.ratio === undefined ? format(reading.raw) : formatRatio(reading.ratio);
	});
</script>

<div style="min-width: 0;">
	<div style="font-size: 10px; color: {labelColor}; font-weight: 600; letter-spacing: 0.06em;">
		{label}
	</div>
	<div style="font-size: {size}px; font-weight: 700; color: var(--tx); line-height: 1;">
		{headline}
	</div>
	{#if reading && reading.ratio !== undefined}
		<!-- The load that produced the ratio stays beside it, with the day the
		     weigh-in was taken: a ratio a coach cannot check against a weight and a
		     date is a number they have to take on trust. -->
		<div style="font-size: 11px; color: var(--tx3); margin-top: 4px;">
			{formatRatioBasis(reading)}
		</div>
	{:else if reading?.missing}
		<!-- The number above is the load itself, so the line says its unit and why
		     there is no ratio. A weigh-in that went stale is a caution the athlete
		     can fix by stepping on the scales; one that never happened is an
		     absence. -->
		<div
			style="font-size: 11px; margin-top: 4px; color: {reading.missing === 'stale'
				? 'var(--gd-tx)'
				: 'var(--rd)'};"
		>
			{unitLabel(unit)}, {missingRatioLabel(reading.missing)}
		</div>
	{/if}
</div>
