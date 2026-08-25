<script lang="ts">
	import type { AssessmentResponse } from '$lib/api/client';
	import { gripLabel } from '$lib/sessions';
	import { formatRecordValue, singleValue } from './assessment-records';

	interface Props {
		records: AssessmentResponse[];
		formatDate: (iso: string) => string;
	}

	let { records, formatDate }: Props = $props();

	const columns = 'display: grid; grid-template-columns: 90px 1.4fr 1fr 0.7fr 0.7fr;';
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
				font-size: 10.5px; color: var(--tx3); font-weight: 600;
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
			<div
				style="
					{columns} min-width: 520px;
					padding: 11px 20px; align-items: center;
					border-bottom: {i < records.length - 1 ? '1px solid var(--bd2)' : 'none'};
					font-size: 13px;
				"
			>
				<div style="color: var(--tx2); font-size: 12px;">{formatDate(record.updated_at)}</div>
				<div style="font-weight: 600; color: var(--tx);">{record.label}</div>
				<div style="color: var(--tx3); font-size: 12px;">
					{record.training_id ? '' : gripLabel(record.grip_position ?? 0)}
				</div>
				{#if record.per_hand}
					<div style="text-align: right; font-weight: 600;">
						{formatRecordValue(record.left_value, record.unit)}
					</div>
					<div style="text-align: right; font-weight: 600;">
						{formatRecordValue(record.right_value, record.unit)}
					</div>
				{:else}
					<!-- A single value is not a hand, so it spans the two numeric columns
					     rather than sitting under one of them. -->
					<div style="grid-column: span 2; text-align: right; font-weight: 600;">
						{formatRecordValue(singleValue(record), record.unit)}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
