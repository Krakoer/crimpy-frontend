<script lang="ts">
	import AssessmentChart from '$lib/components/AssessmentChart.svelte';
	import { gripLabel } from '$lib/sessions';
	import {
		formatRecordValue,
		singleValue,
		unitLabel,
		type RecordedAssessment
	} from './assessment-records';
	import {
		denominatorNoteColor,
		formatDenominatorNote,
		formatRatio,
		readingLabel,
		readRecordDenominator,
		readRecordRatio
	} from './bodyweight-ratio';
	import LatestValue from './LatestValue.svelte';

	interface Props {
		assessment: RecordedAssessment;
		// A hangboard assessment is measured on a named grip, so its history is
		// read one grip at a time. Everything else has a single history.
		selectedGrip: number;
		onSelectGrip: (grip: number) => void;
		showChart: boolean;
		onToggleChart: () => void;
	}

	let { assessment, selectedGrip, onSelectGrip, showChart, onToggleChart }: Props = $props();

	let grips = $derived(
		assessment.hasGrips
			? [...new Set(assessment.records.map((r) => r.grip_position ?? 0))].sort((a, b) => a - b)
			: []
	);

	let history = $derived(
		assessment.hasGrips
			? assessment.records.filter((r) => (r.grip_position ?? 0) === selectedGrip)
			: assessment.records
	);

	let latest = $derived(history.at(-1));

	function format(value: number | null | undefined): string {
		return formatRecordValue(value, assessment.unit);
	}

	let bodyweightRelative = $derived(assessment.bodyweightRelative);

	// The headline number is the ratio when the assessment reads as one and the
	// weigh-in beside the result is near enough to divide by, the raw load
	// otherwise. Every surface on this tab asks the same function, so a result
	// cannot read one way here and another in the comparison below.
	function reading(record: (typeof history)[number] | undefined, value: number | null | undefined) {
		return record ? readRecordRatio(record, value) : null;
	}

	let latestLeft = $derived(reading(latest, latest?.left_value));
	let latestRight = $derived(reading(latest, latest?.right_value));
	let latestSingle = $derived(reading(latest, singleValue(latest)));
	let denominator = $derived(latest ? readRecordDenominator(latest) : null);

	// The progress across the whole history, on the hand that carries the result
	// for a single value assessment and on the right hand otherwise, which is
	// what the two big numbers above already lead with.
	//
	// A bodyweight relative assessment is compared as the ratios the card leads
	// with, and only when both ends have one: a change in kilograms sitting under
	// two ratios would be read as a change in them.
	let ends = $derived.by(() => {
		if (history.length < 2) return null;
		const firstRecord = history[0];
		const lastRecord = history[history.length - 1];
		const pick = (record: (typeof history)[number]) =>
			assessment.perHand ? record.right_value : singleValue(record);
		const first = reading(firstRecord, pick(firstRecord));
		const last = reading(lastRecord, pick(lastRecord));
		return first && last ? { first, last } : null;
	});

	let delta = $derived.by(() => {
		if (!ends) return null;
		if (bodyweightRelative) {
			if (ends.first.ratio === undefined || ends.last.ratio === undefined) return null;
			return ends.last.ratio - ends.first.ratio;
		}
		return ends.last.raw - ends.first.raw;
	});

	// Only when a denominator is what is missing. A hand the athlete did not
	// measure that day is a different absence, and the footer stays quiet for it
	// the way it already does on an assessment that is not read as a ratio.
	let noRatioToCompare = $derived(
		delta === null &&
			ends !== null &&
			(ends.first.missing !== undefined || ends.last.missing !== undefined)
	);
</script>

<div
	role="listitem"
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); padding: 20px; box-shadow: var(--sh);"
>
	<div
		style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px;"
	>
		<div style="font-size: 13px; font-weight: 700; color: var(--tx); min-width: 0;">
			{assessment.label}
		</div>
		<div style="font-size: 11px; color: var(--tx3); flex-shrink: 0;">
			{readingLabel(bodyweightRelative, assessment.unit)}
		</div>
	</div>

	{#if grips.length > 1}
		<div style="display: flex; gap: 4px; margin-bottom: 8px; overflow-x: auto;">
			{#each grips as grip (grip)}
				<button
					onclick={() => onSelectGrip(grip)}
					style="
						padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600;
						border: none; cursor: pointer; white-space: nowrap; font-family: var(--font);
						background: {grip === selectedGrip ? 'var(--pr-fog)' : 'var(--bd2)'};
						color: {grip === selectedGrip ? 'var(--pr-tx)' : 'var(--tx3)'};
					">{gripLabel(grip)}</button
				>
			{/each}
		</div>
	{:else if grips.length === 1}
		<div style="font-size: 11px; color: var(--tx3); margin-bottom: 10px;">
			{gripLabel(grips[0])}
		</div>
	{/if}

	<div style="display: flex; gap: 20px; margin-bottom: 14px; align-items: flex-start;">
		{#if assessment.perHand}
			<LatestValue
				label="LEFT"
				labelColor="var(--gn)"
				reading={latestLeft}
				unit={assessment.unit}
				size={26}
			/>
			<LatestValue
				label="RIGHT"
				labelColor="var(--pr)"
				reading={latestRight}
				unit={assessment.unit}
				size={26}
			/>
		{:else}
			<LatestValue
				label="LATEST"
				labelColor="var(--pr)"
				reading={latestSingle}
				unit={assessment.unit}
				size={26}
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

	{#if history.length >= 2}
		<button
			onclick={onToggleChart}
			style="
				font-size: 11.5px; color: {showChart ? 'var(--pr)' : 'var(--tx3)'};
				background: none; border: none; cursor: pointer; padding: 0;
				font-family: var(--font); font-weight: 600; margin-bottom: 8px;
			">{showChart ? 'Hide chart' : 'Show chart'}</button
		>

		{#if showChart}
			<div style="border-top: 1px solid var(--bd2); padding-top: 8px;">
				<AssessmentChart
					{history}
					unit={unitLabel(assessment.unit)}
					formatValue={(v) => formatRecordValue(v, assessment.unit)}
					perHand={assessment.perHand}
					{bodyweightRelative}
				/>
			</div>
		{/if}

		<div
			style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--tx3); margin-top: 6px;"
		>
			<span>{history.length} records</span>
			{#if delta !== null}
				<span>·</span>
				<span style="color: {delta >= 0 ? 'var(--gn)' : 'var(--rd)'}; font-weight: 600;">
					{delta >= 0 ? '+' : ''}{bodyweightRelative
						? formatRatio(delta)
						: `${format(delta)} ${unitLabel(assessment.unit)}`} overall
				</span>
			{:else if noRatioToCompare}
				<!-- Said rather than left blank, in the same words the comparison
				     panel uses for the same state, since one end of the history has
				     no ratio and a change in kilograms under two ratios would be
				     read as a change in them. -->
				<span>·</span>
				<span>no ratio to compare</span>
			{/if}
		</div>
	{/if}
</div>
