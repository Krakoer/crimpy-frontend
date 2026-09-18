<script lang="ts">
	import { apiClient, type AssessmentResponse, type AssessmentSnapshot } from '$lib/api/client';
	import { gripLabel } from '$lib/sessions';
	import { unitLabel } from '$lib/assessments';
	import {
		compareSnapshots,
		formatDay,
		formatPercent,
		formatScore,
		testedDays,
		type ComparedHand,
		type ComparedValue,
		type ComparisonRow
	} from './assessment-comparison';

	interface Props {
		// The athlete whose snapshots are read. The comparison asks the server for
		// the state of things on a date rather than folding the records itself,
		// since a snapshot also carries the bodyweight in effect then.
		userId: string;
		// The athlete's results, used only to offer the days they actually tested
		// on: a date nothing was measured near compares two copies of the same
		// thing.
		records: AssessmentResponse[];
	}

	let { userId, records }: Props = $props();

	const days = $derived(testedDays(records));

	// What the coach picked, empty until they do. The pair actually read falls
	// back to the most recent change, which is the comparison asked for most
	// often, and a choice that no longer names a test day falls back with it
	// rather than leaving the table asking for a date the athlete never tested on.
	let pickedFrom = $state('');
	let pickedTo = $state('');

	const toDay = $derived(days.includes(pickedTo) ? pickedTo : (days[0] ?? ''));
	const fromDay = $derived(days.includes(pickedFrom) ? pickedFrom : (days[1] ?? days[0] ?? ''));

	let rows = $state<ComparisonRow[]>([]);
	let loading = $state(false);
	let failed = $state(false);

	// Guards against a slower earlier request landing after a faster later one
	// and drawing a comparison of dates nobody is looking at any more.
	let latestRequest = 0;

	$effect(() => {
		const from = fromDay;
		const to = toDay;
		if (!from || !to) return;
		const request = ++latestRequest;
		loading = true;
		Promise.all([
			apiClient.getClientAssessmentSnapshot(userId, from),
			apiClient.getClientAssessmentSnapshot(userId, to)
		])
			.then(([before, after]: AssessmentSnapshot[]) => {
				if (request !== latestRequest) return;
				rows = compareSnapshots(before, after);
				failed = false;
			})
			.catch(() => {
				if (request !== latestRequest) return;
				rows = [];
				failed = true;
			})
			.finally(() => {
				if (request === latestRequest) loading = false;
			});
	});

	// A value measured on another day than the one asked for was carried forward
	// by the snapshot, which the row says rather than passing it off as the state
	// of that date.
	function carriedFrom(value: ComparedValue, day: string): string {
		return value.measuredAt.slice(0, 10) === day ? '' : formatDay(value.measuredAt.slice(0, 10));
	}

	function progressionColor(hand: ComparedHand): string {
		if (hand.delta === undefined) return 'var(--tx3)';
		if (hand.percent !== undefined && Math.abs(hand.percent) < 0.05) return 'var(--tx2)';
		return hand.delta > 0 ? 'var(--gn-tx)' : 'var(--rd)';
	}

	function progressionLabel(hand: ComparedHand): string {
		if (hand.unchanged) return 'not retested';
		if (!hand.before && !hand.after) return '--';
		if (!hand.before) return 'first measured';
		if (!hand.after) return 'not measured';
		if (hand.percent !== undefined) return formatPercent(hand.percent);
		// A percentage of a zero result is not a percentage, so the absolute
		// change answers for it.
		if (hand.delta !== undefined) {
			return `${hand.delta > 0 ? '+' : ''}${hand.delta.toFixed(1)}`;
		}
		return 'no weight on file';
	}

	function handLabel(hand: ComparedHand): string {
		if (hand.hand === 'left') return 'L';
		if (hand.hand === 'right') return 'R';
		return '';
	}

	const columns = 'display: grid; grid-template-columns: 1.6fr 0.9fr 1fr 1fr 0.9fr;';
	const headerCell =
		'font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;';
	const selectStyle =
		'padding: 5px 8px; border: 1px solid var(--bd); border-radius: var(--rs); background: var(--panel); color: var(--tx); font-family: var(--font); font-size: 12px; font-weight: 600; cursor: pointer;';
</script>

<div
	role="region"
	aria-label="Assessment comparison"
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		class="flex flex-wrap items-center justify-between gap-3"
		style="padding: 14px 20px; border-bottom: 1px solid var(--bd2);"
	>
		<div>
			<h3 style="font-size: 14px; font-weight: 700; color: var(--tx);">Compare two dates</h3>
			<p style="font-size: 12px; color: var(--tx2); margin-top: 2px;">
				Every assessment side by side, as it stood on each of the two test days.
			</p>
		</div>
		{#if days.length > 0}
			<div class="flex items-center gap-2">
				<label style={headerCell} for="comparison-from">From</label>
				<select
					id="comparison-from"
					value={fromDay}
					onchange={(e) => (pickedFrom = e.currentTarget.value)}
					style={selectStyle}
				>
					{#each days as day (day)}
						<option value={day}>{formatDay(day)}</option>
					{/each}
				</select>
				<label style={headerCell} for="comparison-to">To</label>
				<select
					id="comparison-to"
					value={toDay}
					onchange={(e) => (pickedTo = e.currentTarget.value)}
					style={selectStyle}
				>
					{#each days as day (day)}
						<option value={day}>{formatDay(day)}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	{#if days.length < 2}
		<div style="padding: 28px 20px; text-align: center; color: var(--tx3); font-size: 13px;">
			Two test days are needed to compare. The athlete has tested on
			{days.length === 1 ? 'one day' : 'none'} so far.
		</div>
	{:else if failed}
		<div style="padding: 28px 20px; text-align: center; color: var(--rd); font-size: 13px;">
			The comparison could not be loaded, so nothing here says how the athlete moved.
		</div>
	{:else if loading}
		<div style="padding: 28px 20px; text-align: center; color: var(--tx3); font-size: 13px;">
			Reading both dates...
		</div>
	{:else if rows.length === 0}
		<div style="padding: 28px 20px; text-align: center; color: var(--tx3); font-size: 13px;">
			Nothing had been measured by either of these dates.
		</div>
	{:else}
		<div style="overflow-x: auto;">
			<div
				style="
					{columns} min-width: 620px;
					padding: 10px 20px; border-bottom: 1px solid var(--bd2);
					{headerCell} background: var(--panel2);
				"
			>
				<div>Assessment</div>
				<div>Grip</div>
				<div style="text-align: right;">{formatDay(fromDay)}</div>
				<div style="text-align: right;">{formatDay(toDay)}</div>
				<div style="text-align: right;">Progression</div>
			</div>
			{#each rows as row, i (row.key)}
				<div
					style="
						{columns} min-width: 620px;
						padding: 11px 20px; align-items: center;
						border-bottom: {i < rows.length - 1 ? '1px solid var(--bd2)' : 'none'};
						font-size: 13px;
					"
				>
					<div style="min-width: 0;">
						<div style="font-weight: 600; color: var(--tx);">{row.label}</div>
						<div style="font-size: 11px; color: var(--tx3);">
							{row.bodyweightRelative ? 'ratio to bodyweight' : unitLabel(row.unit)}
						</div>
					</div>
					<div style="color: var(--tx3); font-size: 12px;">
						{row.hasGrips ? gripLabel(row.gripPosition) : ''}
					</div>

					<div style="display: flex; flex-direction: column; gap: 6px;">
						{#each row.hands as hand (hand.hand)}
							{@render valueCell(hand, hand.before, fromDay, row)}
						{/each}
					</div>
					<div style="display: flex; flex-direction: column; gap: 6px;">
						{#each row.hands as hand (hand.hand)}
							{@render valueCell(hand, hand.after, toDay, row)}
						{/each}
					</div>
					<div style="display: flex; flex-direction: column; gap: 6px;">
						{#each row.hands as hand (hand.hand)}
							<div
								style="text-align: right; font-weight: 600; font-size: 12.5px; color: {progressionColor(
									hand
								)};"
							>
								{progressionLabel(hand)}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#snippet valueCell(
	hand: ComparedHand,
	value: ComparedValue | undefined,
	day: string,
	row: ComparisonRow
)}
	<div style="text-align: right;">
		{#if !value}
			<span style="color: var(--tx3); font-size: 12px;">
				{handLabel(hand) ? handLabel(hand) + ' ' : ''}not measured
			</span>
		{:else}
			<div style="font-weight: 600; color: var(--tx);">
				{#if handLabel(hand)}
					<span style="color: var(--tx3); font-weight: 600; font-size: 11px;"
						>{handLabel(hand)}</span
					>
				{/if}
				{formatScore(value, row.unit)}
			</div>
			{#if value.bodyweightKg !== undefined}
				<div style="font-size: 11px; color: var(--tx3);">
					{value.raw.toFixed(1)} kg at {value.bodyweightKg.toFixed(1)} kg
				</div>
			{:else if row.bodyweightRelative}
				<div style="font-size: 11px; color: var(--rd);">
					{value.raw.toFixed(1)} kg, no weight on file
				</div>
			{/if}
			{#if carriedFrom(value, day)}
				<div style="font-size: 11px; color: var(--tx3);">
					measured {carriedFrom(value, day)}
				</div>
			{/if}
		{/if}
	</div>
{/snippet}
