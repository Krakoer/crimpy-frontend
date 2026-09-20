<script lang="ts">
	import { gripLabel } from '$lib/sessions';
	import { singleValue, unitLabel, type RecordedAssessment } from './assessment-records';
	import {
		denominatorNoteColor,
		formatDenominatorNote,
		readRecordDenominator,
		readRecordRatio
	} from './bodyweight-ratio';
	import LatestValue from './LatestValue.svelte';

	interface Props {
		assessment: RecordedAssessment;
		selectedGrip: number;
	}

	let { assessment, selectedGrip }: Props = $props();

	let history = $derived(
		assessment.hasGrips
			? assessment.records.filter((r) => (r.grip_position ?? 0) === selectedGrip)
			: assessment.records
	);
	let latest = $derived(history.at(-1));

	// Read by the one rule the whole tab reads a bodyweight relative result by,
	// so the summary beside the sessions and the card on the assessments tab
	// cannot print two different numbers for the same measurement.
	function reading(value: number | null | undefined) {
		return latest ? readRecordRatio(latest, value) : null;
	}

	let bodyweightRelative = $derived(assessment.bodyweightRelative);
	let readingLabel = $derived(
		bodyweightRelative ? 'ratio to bodyweight' : unitLabel(assessment.unit)
	);
	let latestLeft = $derived(reading(latest?.left_value));
	let latestRight = $derived(reading(latest?.right_value));
	let latestSingle = $derived(reading(singleValue(latest)));
	let denominator = $derived(latest ? readRecordDenominator(latest) : null);
</script>

<div
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); padding: 16px; box-shadow: var(--sh);"
>
	<div
		style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px;"
	>
		<div style="font-size: 12px; font-weight: 600; color: var(--tx); min-width: 0;">
			{assessment.label}
		</div>
		<div style="font-size: 11px; color: var(--tx3); flex-shrink: 0;">
			{readingLabel}
		</div>
	</div>
	{#if assessment.hasGrips}
		<div style="font-size: 11px; color: var(--tx3); margin-bottom: 10px;">
			{gripLabel(selectedGrip)}
		</div>
	{/if}
	<div style="display: flex; gap: 20px; align-items: flex-start;">
		{#if assessment.perHand}
			<LatestValue
				label="LEFT"
				labelColor="var(--gn)"
				reading={latestLeft}
				unit={assessment.unit}
				size={22}
			/>
			<LatestValue
				label="RIGHT"
				labelColor="var(--pr)"
				reading={latestRight}
				unit={assessment.unit}
				size={22}
			/>
		{:else}
			<LatestValue
				label="LATEST"
				labelColor="var(--pr)"
				reading={latestSingle}
				unit={assessment.unit}
				size={22}
			/>
		{/if}
	</div>

	{#if denominator}
		<!-- Named once, because one session is one weigh-in: saying it under each
		     hand repeats it and wraps mid date in a column half a card wide. The
		     load itself stays per hand, above. -->
		<div
			style="font-size: 11px; margin-top: 6px; color: {denominatorNoteColor(denominator)};"
			data-testid="denominator-note"
		>
			{formatDenominatorNote(denominator, unitLabel(assessment.unit))}
		</div>
	{/if}
</div>
