<script lang="ts">
	import { gripLabel } from '$lib/sessions';
	import {
		denominatorSources,
		latestOnHand,
		originNote,
		singleValue,
		unitLabel,
		type LatestHand,
		type RecordedAssessment
	} from './assessment-records';
	import {
		denominatorNoteColor,
		formatDenominatorNote,
		readingLabel,
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

	// Read by the one rule the whole tab reads a bodyweight relative result by,
	// so the summary beside the sessions and the card on the assessments tab
	// cannot print two different numbers for the same measurement.
	//
	// Per hand rather than off the newest row: a pull kept from a training
	// carries one hand, and the other still stands at its own last measurement.
	function reading(last: LatestHand | undefined) {
		return last ? readRecordRatio(last.record, last.value) : null;
	}

	function noteOf(last: LatestHand | undefined): string {
		return last ? originNote(last.record) : '';
	}

	let bodyweightRelative = $derived(assessment.bodyweightRelative);
	let lastLeft = $derived(latestOnHand(history, (r) => r.left_value));
	let lastRight = $derived(latestOnHand(history, (r) => r.right_value));
	let lastSingle = $derived(latestOnHand(history, singleValue));
	let latestLeft = $derived(reading(lastLeft));
	let latestRight = $derived(reading(lastRight));
	let latestSingle = $derived(reading(lastSingle));
	// The weigh-in of the row each headline number came from, not of the newest
	// row: see denominatorSources.
	let denominators = $derived(
		denominatorSources(assessment.perHand, lastLeft, lastRight, lastSingle).flatMap(
			({ label, record }) => {
				const reading = readRecordDenominator(record);
				return reading ? [{ label, reading }] : [];
			}
		)
	);
	// Ink for every metric: this card sits beside the sessions, where a hue
	// means a session activity, and it draws no chart its labels would have to
	// be the legend of. The hands are no longer two colours. See
	// Krakoer/crimpy#164.
	const labelColor = 'var(--tx)';
</script>

<div
	data-testid="assessment-summary-card"
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); padding: 16px; box-shadow: var(--sh);"
>
	<div
		style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px;"
	>
		<div style="font-size: 12px; font-weight: 600; color: var(--tx); min-width: 0;">
			{assessment.label}
		</div>
		<div style="font-size: 11px; color: var(--tx3-sm); flex-shrink: 0;">
			{readingLabel(bodyweightRelative, assessment.unit)}
		</div>
	</div>
	{#if assessment.hasGrips}
		<div style="font-size: 11px; color: var(--tx3-sm); margin-bottom: 10px;">
			{gripLabel(selectedGrip)}
		</div>
	{/if}
	<div style="display: flex; gap: 20px; align-items: flex-start;">
		{#if assessment.perHand}
			<LatestValue
				label="LEFT"
				{labelColor}
				reading={latestLeft}
				unit={assessment.unit}
				size={22}
				note={noteOf(lastLeft)}
			/>
			<LatestValue
				label="RIGHT"
				{labelColor}
				reading={latestRight}
				unit={assessment.unit}
				size={22}
				note={noteOf(lastRight)}
			/>
		{:else}
			<LatestValue
				label="LATEST"
				{labelColor}
				reading={latestSingle}
				unit={assessment.unit}
				size={22}
				note={noteOf(lastSingle)}
			/>
		{/if}
	</div>

	{#each denominators as { label, reading } (label)}
		<!-- Named once, because one session is one weigh-in: saying it under each
		     hand repeats it and wraps mid date in a column half a card wide. The
		     load itself stays per hand, above. -->
		<div
			style="font-size: 11px; margin-top: 6px; color: {denominatorNoteColor(reading)};"
			data-testid="denominator-note"
		>
			{label ? `${label}: ` : ''}{formatDenominatorNote(reading, unitLabel(assessment.unit))}
		</div>
	{/each}
</div>
