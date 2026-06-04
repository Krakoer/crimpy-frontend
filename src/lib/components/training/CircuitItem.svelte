<script lang="ts">
	import type { Exercise, TrainingItem, TrainingItemType } from '$lib/api/client';
	import ItemList from './ItemList.svelte';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		onRemove: () => void;
		onDuplicate: () => void;
		depth: number;
		innerAllowedTypes?: TrainingItemType[];
	}

	let { item = $bindable(), exercises, onRemove, onDuplicate, depth, innerAllowedTypes }: Props = $props();

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	if (!item.items) item.items = [];

	let restMin = $state(Math.floor((item.cycle_rest_seconds ?? 0) / 60));
	let restSec = $state((item.cycle_rest_seconds ?? 0) % 60);

	$effect(() => {
		item.cycle_rest_seconds = restMin * 60 + restSec;
	});

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});

	let collapsedSummary = $derived.by(() => {
		const sets = item.cycles ?? 3;
		const rest = item.cycle_rest_seconds ?? 0;
		const m = Math.floor(rest / 60);
		const s = rest % 60;
		const restStr = m > 0 ? `${m}m${s > 0 ? s + 's' : ''}` : `${s}s`;
		const count = item.items?.length ?? 0;
		return `${sets} sets · ${restStr} rest · ${count} items`;
	});
</script>

<div style="background: #fff; border-radius: var(--rl); border: 1px solid color-mix(in srgb, var(--pr) 30%, transparent); box-shadow: var(--sh); overflow: hidden;">
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed ? '#fff' : 'var(--panel2)'};"
		onclick={() => { if (!confirmDelete) collapsed = !collapsed; }}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && !confirmDelete && (collapsed = !collapsed)}
	>
		<div style="width: 4px; height: 20px; background: var(--pr); border-radius: 2px; flex-shrink: 0;"></div>
		<div style="transform: {collapsed ? 'rotate(0deg)' : 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;">
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px;">
			Circuit
			<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">{collapsedSummary}</span>
		</span>
		<div style="display: flex; gap: 3px; flex-shrink: 0;" onclick={(e) => e.stopPropagation()} role="none">
			{#if confirmDelete}
				<button
					onclick={onRemove}
					style="padding: 3px 8px; border-radius: 4px; border: 1px solid #e57373; background: #fff; color: #e57373; font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font);"
				>Delete</button>
				<button
					onclick={() => (confirmDelete = false)}
					style="padding: 3px 8px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; color: var(--tx3); font-size: 11px; cursor: pointer; font-family: var(--font);"
				>Cancel</button>
			{:else}
				<button
					onclick={onDuplicate}
					title="Duplicate"
					style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
				>
					<Icon name="copy" size={11} color="var(--tx3)" />
				</button>
				<button
					onclick={() => (confirmDelete = true)}
					title="Delete"
					style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
				>
					<Icon name="trash" size={11} color="var(--tx3)" />
				</button>
			{/if}
		</div>
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2); padding: 12px 14px;">
			<div style="display: flex; gap: 16px; margin-bottom: 14px; align-items: flex-end; flex-wrap: wrap;">
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;">SETS</span>
					<input
						type="number" min="1" bind:value={item.cycles}
						onclick={(e) => e.stopPropagation()}
						style="width: 44px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
					/>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;">SET REST</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input
							type="number" min="0" bind:value={restMin}
							onclick={(e) => e.stopPropagation()}
							style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 10px; color: var(--tx3);">m</span>
						<input
							type="number" min="0" max="59" bind:value={restSec}
							onclick={(e) => e.stopPropagation()}
							style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
			</div>

			<div style="padding-left: 10px; border-left: 2px solid color-mix(in srgb, var(--pr) 20%, transparent);">
				<ItemList
					bind:items={item.items!}
					{exercises}
					allowedTypes={innerAllowedTypes ?? (depth < 1 ? ['exercise', 'section', 'repeater'] : ['exercise', 'repeater'])}
					depth={depth + 1}
					containerId={'container:' + item._id}
				/>
			</div>
		</div>
	{/if}
</div>
