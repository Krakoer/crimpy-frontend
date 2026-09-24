<script lang="ts">
	import type { AssessmentCatalog } from '$lib/assessments';
	import type { TrainingItem } from '$lib/api/client';
	import { formatLoad } from '$lib/assessments';
	import HangboardCard from './HangboardCard.svelte';
	import { HANGBOARD_REP_HANDS, hangboardHand } from './hangboard-granularity';
	import { storedConfig } from './hangboard-config';
	import { getContext } from 'svelte';
	import { ITEM_RESULTS_KEY, achievedEntries, type ItemResultsByItem } from './results-context';
	import AchievedNotes from './AchievedNotes.svelte';
	import AchievedUnder from './AchievedUnder.svelte';
	import ItemCommentDisplay from './ItemCommentDisplay.svelte';
	import ItemGoalDisplay from './ItemGoalDisplay.svelte';
	import ItemProtocolDisplay from './ItemProtocolDisplay.svelte';

	interface Props {
		item: TrainingItem;
		catalog: AssessmentCatalog;
	}

	let { item, catalog }: Props = $props();

	// A hang rep stands for one rep of one set, so it reads back from the first
	// coordinate of whatever layout it declares.
	let config = $derived(storedConfig(item, 0, 0));
	let hand = $derived(hangboardHand(item));
	let handLabel = $derived(HANGBOARD_REP_HANDS.find((h) => h.value === hand)?.label ?? 'Both');
	let handHint = $derived(HANGBOARD_REP_HANDS.find((h) => h.value === hand)?.hint ?? '');

	let collapsedSummary = $derived(
		`${item.worktime_seconds ?? 0}s hang / ${item.rest_seconds ?? 0}s rest`
	);

	const results = getContext<ItemResultsByItem | undefined>(ITEM_RESULTS_KEY);
	let achievedLoad = $derived(achievedEntries(results, item.id, 'load_kg'));
	let achievedDuration = $derived(achievedEntries(results, item.id, 'duration_seconds'));
</script>

<HangboardCard title="Hang rep" summary={collapsedSummary} summaryOnlyWhenCollapsed>
	{#snippet body()}
		<div class="hb-facts">
			<div class="hb-fact">
				<span class="hb-label">Work</span>
				<span class="hb-value">{item.worktime_seconds ?? 0}s</span>
				<AchievedUnder entries={achievedDuration} format={(v) => `${v}s`} />
			</div>
			<div class="hb-fact">
				<span class="hb-label">Rest</span>
				<span class="hb-value">{item.rest_seconds ?? 0}s</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Hand</span>
				<span class="hb-value" title={handHint}>{handLabel}</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Edge (mm)</span>
				<span class="hb-value">{config.edge}</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Grip</span>
				<span class="hb-value">{config.gripRight}</span>
			</div>
			<div class="hb-fact">
				<span class="hb-label">Load</span>
				<span class="hb-value">{formatLoad(config.loadRight, catalog)}</span>
				<AchievedUnder entries={achievedLoad} format={(v) => `${v} kg`} />
			</div>
		</div>

		<ItemGoalDisplay {item} inset={null} />
		<ItemProtocolDisplay {item} inset={null} />

		<ItemCommentDisplay {item} inset={null} />

		<AchievedNotes itemId={item.id} inset={null} />
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
		color: var(--tx3-sm);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hb-value {
		font-size: 14px;
		font-weight: 700;
		color: var(--tx);
	}
</style>
