<script lang="ts">
	import type { Bodyweight } from '$lib/api/client';
	import { bodyweightTrend, formatChangeKg, formatKg, TREND_WINDOW_DAYS } from '$lib/bodyweight';

	interface Props {
		series: Bodyweight[];
		loading?: boolean;
		// The series could not be read. Distinct from an empty one: an athlete who
		// has never weighed themselves is a fact, a failed read is not knowing.
		failed?: boolean;
	}

	let { series, loading = false, failed = false }: Props = $props();

	let trend = $derived(bodyweightTrend(series));
	let change = $derived(trend?.changeKg === undefined ? '' : formatChangeKg(trend.changeKg));

	// Gaining and losing are neither good nor bad without knowing what the
	// athlete is training for, so the change is coloured as information rather
	// than as a verdict. The one thing worth a colour is that it moved.
	let changeColor = $derived(change === '' ? 'var(--tx3)' : 'var(--tx2)');

	function measuredOn(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); padding: 16px; box-shadow: var(--sh);"
>
	<div
		style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px;"
	>
		<div style="font-size: 12px; font-weight: 600; color: var(--tx); min-width: 0;">Bodyweight</div>
		<div style="font-size: 11px; color: var(--tx3); flex-shrink: 0;">kg</div>
	</div>

	{#if loading}
		<div style="font-size: 12.5px; color: var(--tx3);">Loading...</div>
	{:else if failed}
		<div style="font-size: 12.5px; color: var(--tx3);">
			Could not be loaded, so what is here now is not known.
		</div>
	{:else if trend}
		<div style="display: flex; align-items: baseline; gap: 8px;">
			<div style="font-size: 22px; font-weight: 700; color: var(--tx); letter-spacing: -0.02em;">
				{formatKg(trend.latest.weight_kg)}
			</div>
			{#if change}
				<div style="font-size: 12.5px; font-weight: 600; color: {changeColor};">
					{change}
				</div>
			{/if}
		</div>
		<div style="font-size: 11px; color: var(--tx3); margin-top: 4px;">
			{#if change}
				Measured {measuredOn(trend.latest.measured_at)}, against {formatKg(
					trend.previous!.weight_kg
				)} on {measuredOn(trend.previous!.measured_at)}
			{:else if trend.previous}
				Measured {measuredOn(trend.latest.measured_at)}, unchanged over {TREND_WINDOW_DAYS} days
			{:else}
				Measured {measuredOn(trend.latest.measured_at)}, nothing older to compare
			{/if}
		</div>
	{:else}
		<!-- Said out loud rather than drawn as a zero: a strength number cannot be
		     read as a ratio without this, so a coach needs to know it is missing. -->
		<div style="font-size: 12.5px; color: var(--tx3);">
			Not recorded yet, so a load set as a percentage of it cannot be read here.
		</div>
	{/if}
</div>
