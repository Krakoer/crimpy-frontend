<script lang="ts">
	import { gripLabel } from '$lib/sessions';
	import {
		formatRecordValue,
		singleValue,
		unitLabel,
		type RecordedAssessment
	} from './assessment-records';

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
			{unitLabel(assessment.unit)}
		</div>
	</div>
	{#if assessment.hasGrips}
		<div style="font-size: 11px; color: var(--tx3); margin-bottom: 10px;">
			{gripLabel(selectedGrip)}
		</div>
	{/if}
	<div style="display: flex; gap: 20px; align-items: center;">
		{#if assessment.perHand}
			<div>
				<div style="font-size: 10px; color: var(--gn); font-weight: 600; letter-spacing: 0.06em;">
					LEFT
				</div>
				<div style="font-size: 22px; font-weight: 700; color: var(--tx); line-height: 1;">
					{format(latest?.left_value)}
				</div>
			</div>
			<div>
				<div style="font-size: 10px; color: var(--pr); font-weight: 600; letter-spacing: 0.06em;">
					RIGHT
				</div>
				<div style="font-size: 22px; font-weight: 700; color: var(--tx); line-height: 1;">
					{format(latest?.right_value)}
				</div>
			</div>
		{:else}
			<div>
				<div style="font-size: 10px; color: var(--pr); font-weight: 600; letter-spacing: 0.06em;">
					LATEST
				</div>
				<div style="font-size: 22px; font-weight: 700; color: var(--tx); line-height: 1;">
					{format(singleValue(latest))}
				</div>
			</div>
		{/if}
	</div>
</div>
