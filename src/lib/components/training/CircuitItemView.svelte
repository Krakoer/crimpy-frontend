<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ItemListView from './ItemListView.svelte';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		depth: number;
	}

	let { item, exercises, depth }: Props = $props();

	let collapsed = $state(false);

	function fmtTime(seconds: number): string {
		if (seconds <= 0) return '0s';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		if (m > 0 && s > 0) return `${m}mn ${s}s`;
		if (m > 0) return `${m}mn`;
		return `${s}s`;
	}

	let collapsedSummary = $derived.by(() => {
		const sets = item.cycles ?? 1;
		const rest = item.cycle_rest_seconds ?? 0;
		const count = item.items?.length ?? 0;
		return `${sets} sets · ${fmtTime(rest)} rest · ${count} items`;
	});

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
			style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px;"
		>
			Circuit
			<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">{collapsedSummary}</span>
		</span>
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2); padding: 12px 14px;">
			<div
				style="padding-left: 10px; border-left: 2px solid color-mix(in srgb, var(--pr) 20%, transparent);"
			>
				<ItemListView items={item.items ?? []} {exercises} depth={depth + 1} />
			</div>
		</div>
	{/if}
</div>
