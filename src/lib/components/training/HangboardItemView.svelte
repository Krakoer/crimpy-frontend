<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import { formatLoad } from '$lib/assessments';
	import HangboardCard from './HangboardCard.svelte';
	import {
		HANGBOARD_HANDS,
		hangboardHand,
		hangboardReps,
		hangboardSets,
		isTwoHandedMode
	} from './hangboard-granularity';
	import { buildSessionMap, commonConfig, storedConfig, storedVariation } from './hangboard-config';
	import HangboardSessionMap from './HangboardSessionMap.svelte';

	interface Props {
		item: TrainingItem;
	}

	let { item }: Props = $props();

	let sets = $derived(hangboardSets(item));
	let reps = $derived(hangboardReps(item));
	let twoHanded = $derived(isTwoHandedMode(hangboardHand(item)));
	let base = $derived(commonConfig(item));
	let handLabel = $derived(
		HANGBOARD_HANDS.find((h) => h.value === hangboardHand(item))?.label ?? 'Both'
	);
	let handHint = $derived(HANGBOARD_HANDS.find((h) => h.value === hangboardHand(item))?.hint ?? '');

	// What varies is read from the values rather than from the declared layout,
	// the same way the editor reads it, so both show the same shape.
	let variation = $derived(storedVariation(item));

	let variationLabel = $derived(
		variation === 'rep' ? 'VARIES BY REP' : variation === 'set' ? 'VARIES BY SET' : ''
	);

	let setRows = $derived(
		buildSessionMap({
			sets,
			reps,
			variation,
			base,
			twoHanded,
			configAt: (address) => storedConfig(item, Math.floor(address / reps), address % reps)
		})
	);

	let collapsedSummary = $derived(
		`${sets} sets x ${reps} reps, ${item.worktime_seconds ?? 0}s on / ${item.rest_seconds ?? 0}s off`
	);
</script>

<HangboardCard title="Hangboard" summary={collapsedSummary} summaryOnlyWhenCollapsed>
	{#snippet body()}
		<div class="hb-facts">
			<div class="hb-fact">
				<span class="hb-label">Sets</span>
				<span class="hb-value">{sets}</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Reps</span>
				<span class="hb-value">{reps}</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Work</span>
				<span class="hb-value">{item.worktime_seconds ?? 0}s</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Rep rest</span>
				<span class="hb-value">{item.rest_seconds ?? 0}s</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Set rest</span>
				<span class="hb-value">{item.cycle_rest_seconds ?? 0}s</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Hand</span>
				<span class="hb-value" title={handHint}>{handLabel}</span>
			</div>
		</div>

		<div class="hb-section">
			<div class="hb-section-head">
				<span class="hb-label">Base configuration</span>
				{#if variationLabel}
					<span class="hb-tag">{variationLabel}</span>
				{/if}
			</div>
			<div class="hb-facts">
				<div class="hb-fact">
					<span class="hb-label">Edge (mm)</span>
					<span class="hb-value">{base.edge}</span>
				</div>
				{#if !twoHanded}
					<div class="hb-fact">
						<span class="hb-label">Grip</span>
						<span class="hb-value">{base.gripRight}</span>
					</div>
					<div class="hb-fact">
						<span class="hb-label">Load</span>
						<span class="hb-value">{formatLoad(base.loadRight)}</span>
					</div>
				{:else}
					<div class="hb-fact">
						<span class="hb-label">Left</span>
						<span class="hb-value">{base.gripLeft} {formatLoad(base.loadLeft)}</span>
					</div>
					<div class="hb-fact">
						<span class="hb-label">Right</span>
						<span class="hb-value">{base.gripRight} {formatLoad(base.loadRight)}</span>
					</div>
				{/if}
			</div>
		</div>

		{#if variation !== 'uniform'}
			<div class="hb-section">
				<span class="hb-label">Session map</span>
				<HangboardSessionMap rows={setRows} />
			</div>
		{/if}
	{/snippet}
</HangboardCard>

<style>
	.hb-facts {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.hb-fact {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.hb-label {
		font-size: 10px;
		color: var(--tx3);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hb-value {
		font-size: 14px;
		font-weight: 700;
		color: var(--tx);
	}

	.hb-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.hb-section-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.hb-tag {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--hb);
	}
</style>
