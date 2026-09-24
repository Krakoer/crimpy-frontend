<script lang="ts">
	import type { AssessmentResponse } from '$lib/api/client';
	import { gripLabel } from '$lib/sessions';
	import { formatRecordValue, singleValue, unitLabel } from './assessment-records';
	import {
		denominatorNoteColor,
		formatDenominatorNote,
		formatRatio,
		readRecordDenominator,
		readRecordRatio,
		type BodyweightReading
	} from './bodyweight-ratio';

	interface Props {
		records: AssessmentResponse[];
		formatDate: (iso: string) => string;
	}

	let { records, formatDate }: Props = $props();

	const columns = 'display: grid; grid-template-columns: 90px 1.4fr 1fr 0.7fr 0.7fr;';

	// The number the cell leads with: the ratio where there is one, the load the
	// athlete pulled otherwise.
	function cellValue(
		reading: BodyweightReading | null,
		value: number | null | undefined,
		unit: string
	): string {
		if (!reading) return formatRecordValue(value, unit);
		return reading.ratio === undefined
			? formatRecordValue(reading.raw, unit)
			: formatRatio(reading.ratio);
	}

	// The load a ratio was built from, under the ratio and per hand: the two hands
	// of one session are two different loads, so this cannot be folded into the
	// row's note the way the weight and its day can. Empty where the cell already
	// holds the load.
	function cellLoad(reading: BodyweightReading | null, unit: string): string {
		if (!reading || reading.ratio === undefined) return '';
		return `${formatRecordValue(reading.raw, unit)} ${unitLabel(unit)}`;
	}
</script>

<div
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="padding: 14px 20px; border-bottom: 1px solid var(--bd2); display: flex; align-items: center; justify-content: space-between;"
	>
		<h3 style="font-size: 14px; font-weight: 700; color: var(--tx);">Assessment history</h3>
	</div>
	<div style="overflow-x: auto;">
		<div
			style="
				{columns} min-width: 520px;
				padding: 10px 20px; border-bottom: 1px solid var(--bd2);
				font-size: 10.5px; color: var(--tx3-sm); font-weight: 600;
				letter-spacing: 0.06em; text-transform: uppercase;
				background: var(--panel2);
			"
		>
			<div>Date</div>
			<div>Assessment</div>
			<div>Grip</div>
			<div style="text-align: right;">Left</div>
			<div style="text-align: right;">Right</div>
		</div>
		{#each records as record, i (record.id)}
			{@const basis = readRecordDenominator(record)}
			<div
				style="
					{columns} min-width: 520px;
					padding: 11px 20px; align-items: center;
					border-bottom: {i < records.length - 1 ? '1px solid var(--bd2)' : 'none'};
					font-size: 13px;
				"
			>
				<div style="color: var(--tx2); font-size: 12px;">{formatDate(record.session_date)}</div>
				<div style="min-width: 0;">
					<div style="font-weight: 600; color: var(--tx);">{record.label}</div>
					{#if basis}
						<!-- The weigh-in the row divides by, with the day it was taken, so a
						     coach can tell a denominator measured the same morning from one
						     weeks old. Where there is none, the reason stands in its place
						     and the numbers beside it are kilograms. -->
						<div style="font-size: 11px; color: {denominatorNoteColor(basis)};">
							{formatDenominatorNote(basis, unitLabel(record.unit))}
						</div>
					{/if}
				</div>
				<div style="color: var(--tx3-sm); font-size: 12px;">
					{record.training_id ? '' : gripLabel(record.grip_position ?? 0)}
				</div>
				{#if record.per_hand}
					{@render valueCell(record, record.left_value, '')}
					{@render valueCell(record, record.right_value, '')}
				{:else}
					<!-- A single value is not a hand, so it spans the two numeric columns
					     rather than sitting under one of them. -->
					{@render valueCell(record, singleValue(record), 'grid-column: span 2;')}
				{/if}
			</div>
		{/each}
	</div>
</div>

{#snippet valueCell(record: AssessmentResponse, value: number | null | undefined, span: string)}
	{@const reading = readRecordRatio(record, value)}
	{@const load = cellLoad(reading, record.unit)}
	<div style="{span} text-align: right;">
		<div style="font-weight: 600;">{cellValue(reading, value, record.unit)}</div>
		{#if load}
			<div style="font-size: 11px; color: var(--tx3-sm);">{load}</div>
		{/if}
	</div>
{/snippet}
