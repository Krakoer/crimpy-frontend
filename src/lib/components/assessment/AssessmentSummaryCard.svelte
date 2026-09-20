<script lang="ts">
	import { gripLabel } from '$lib/sessions';
	import {
		formatRecordValue,
		singleValue,
		unitLabel,
		type RecordedAssessment
	} from './assessment-records';
	import {
		formatRatio,
		formatRatioBasis,
		missingRatioLabel,
		readRecordRatio,
		type BodyweightReading
	} from './bodyweight-ratio';

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

	function format(value: number | null | undefined): string {
		return formatRecordValue(value, assessment.unit);
	}

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

	function headline(value: BodyweightReading | null): string {
		if (!value) return format(undefined);
		return value.ratio === undefined ? format(value.raw) : formatRatio(value.ratio);
	}
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
			{@render latestValue('LEFT', 'var(--gn)', latestLeft)}
			{@render latestValue('RIGHT', 'var(--pr)', latestRight)}
		{:else}
			{@render latestValue('LATEST', 'var(--pr)', latestSingle)}
		{/if}
	</div>
</div>

<!-- The load and the day the weigh-in was taken stay beside the ratio, and the
     reason stands in their place when there is no ratio to show. -->
{#snippet latestValue(label: string, color: string, value: BodyweightReading | null)}
	<div style="min-width: 0;">
		<div style="font-size: 10px; color: {color}; font-weight: 600; letter-spacing: 0.06em;">
			{label}
		</div>
		<div style="font-size: 22px; font-weight: 700; color: var(--tx); line-height: 1;">
			{headline(value)}
		</div>
		{#if value && value.ratio !== undefined}
			<div style="font-size: 11px; color: var(--tx3); margin-top: 4px;">
				{formatRatioBasis(value)}
			</div>
		{:else if value?.missing}
			<div
				style="font-size: 11px; margin-top: 4px; color: {value.missing === 'stale'
					? 'var(--gd-tx)'
					: 'var(--rd)'};"
			>
				{unitLabel(assessment.unit)}, {missingRatioLabel(value.missing)}
			</div>
		{/if}
	</div>
{/snippet}
