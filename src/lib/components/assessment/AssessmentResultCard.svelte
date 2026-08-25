<script lang="ts">
	import AssessmentChart from '$lib/components/AssessmentChart.svelte';
	import { gripLabel } from '$lib/sessions';
	import {
		formatRecordValue,
		singleValue,
		unitLabel,
		type RecordedAssessment
	} from './assessment-records';

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

	// The progress across the whole history, on the hand that carries the result
	// for a single value assessment and on the right hand otherwise, which is
	// what the two big numbers above already lead with.
	let delta = $derived.by(() => {
		if (history.length < 2) return null;
		const first = assessment.perHand ? history[0].right_value : singleValue(history[0]);
		const last = assessment.perHand
			? history[history.length - 1].right_value
			: singleValue(history[history.length - 1]);
		if (first === null || first === undefined || last === null || last === undefined) return null;
		return last - first;
	});
</script>

<div
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); padding: 20px; box-shadow: var(--sh);"
>
	<div
		style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px;"
	>
		<div style="font-size: 13px; font-weight: 700; color: var(--tx); min-width: 0;">
			{assessment.label}
		</div>
		<div style="font-size: 11px; color: var(--tx3); flex-shrink: 0;">
			{unitLabel(assessment.unit)}
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
						color: {grip === selectedGrip ? 'var(--pr)' : 'var(--tx3)'};
					">{gripLabel(grip)}</button
				>
			{/each}
		</div>
	{:else if grips.length === 1}
		<div style="font-size: 11px; color: var(--tx3); margin-bottom: 10px;">
			{gripLabel(grips[0])}
		</div>
	{/if}

	<div style="display: flex; gap: 20px; margin-bottom: 14px;">
		{#if assessment.perHand}
			<div>
				<div style="font-size: 10px; color: var(--gn); font-weight: 600; letter-spacing: 0.06em;">
					LEFT
				</div>
				<div style="font-size: 26px; font-weight: 700; color: var(--tx); line-height: 1;">
					{format(latest?.left_value)}
				</div>
			</div>
			<div>
				<div style="font-size: 10px; color: var(--pr); font-weight: 600; letter-spacing: 0.06em;">
					RIGHT
				</div>
				<div style="font-size: 26px; font-weight: 700; color: var(--tx); line-height: 1;">
					{format(latest?.right_value)}
				</div>
			</div>
		{:else}
			<div>
				<div style="font-size: 10px; color: var(--pr); font-weight: 600; letter-spacing: 0.06em;">
					LATEST
				</div>
				<div style="font-size: 26px; font-weight: 700; color: var(--tx); line-height: 1;">
					{format(singleValue(latest))}
				</div>
			</div>
		{/if}
	</div>

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
					{delta >= 0 ? '+' : ''}{format(delta)}
					{unitLabel(assessment.unit)} overall
				</span>
			{/if}
		</div>
	{/if}
</div>
