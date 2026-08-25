<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ItemListView from './ItemListView.svelte';
	import type { AssessmentCatalog } from '$lib/assessments';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import { ITEM_RESULTS_KEY, achievedValues, type ItemResultsByItem } from './results-context';
	import AchievedBadge from './AchievedBadge.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { formatInterval } from './emom-format';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		catalog: AssessmentCatalog;
		depth: number;
	}

	let { item, exercises, depth, catalog }: Props = $props();

	let collapsed = $state(false);

	let rounds = $derived(item.cycles ?? 1);

	let collapsedSummary = $derived.by(() => {
		const count = item.items?.length ?? 0;
		return `${rounds} rounds · every ${formatInterval(item.interval_seconds ?? 60)} · ${count} items`;
	});

	const results = getContext<ItemResultsByItem | undefined>(ITEM_RESULTS_KEY);
	let achievedRounds = $derived(achievedValues(results, item.id, 'cycles'));

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(
		COLLAPSE_KEY
	);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div
	style="background: #fff; border-radius: var(--rl); border: 1px solid color-mix(in srgb, var(--pr) 30%, transparent); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed
			? '#fff'
			: 'var(--panel2)'};"
		onclick={() => (collapsed = !collapsed)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && (collapsed = !collapsed)}
	>
		<div
			style="width: 4px; height: 20px; background: var(--pr); border-radius: 2px; flex-shrink: 0;"
		></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span
			style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;"
		>
			EMOM
			<span
				style="font-size: 11px; color: var(--tx3); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
				>{collapsedSummary}</span
			>
		</span>
		<AchievedBadge values={achievedRounds} unit="rounds" prescribed={rounds} />
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2); padding: 12px 14px;">
			<div
				style="padding-left: 10px; border-left: 2px solid color-mix(in srgb, var(--pr) 20%, transparent);"
			>
				<ItemListView items={item.items ?? []} {exercises} depth={depth + 1} {catalog} />
			</div>
		</div>
	{/if}
</div>
