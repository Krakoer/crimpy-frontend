<script lang="ts">
	import type { AssessmentCatalog } from '$lib/assessments';
	import type { Exercise, TrainingItem, TrainingItemType } from '$lib/api/client';
	import ItemList from './ItemList.svelte';
	import { containerIdOf } from '$lib/training-drag';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import { OVERRIDE_KEY, type OverrideMode } from './override-context';
	import Icon from '$lib/components/Icon.svelte';
	import { containerChildTypes } from './container-rules';
	import { formatInterval } from './emom-format';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		catalog: AssessmentCatalog;
		onRemove: () => void;
		onDuplicate: () => void;
		depth: number;
		innerAllowedTypes?: readonly TrainingItemType[];
	}

	let {
		item = $bindable(),
		exercises,
		catalog,
		onRemove,
		onDuplicate,
		depth,
		innerAllowedTypes
	}: Props = $props();

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	if (!item.items) item.items = [];

	// A program week changes what the emom prescribes, never the blocks it holds.
	const overriding = getContext<OverrideMode | undefined>(OVERRIDE_KEY) !== undefined;

	// What makes the block every minute on the minute belongs to the training: the
	// override the clients merge carries no interval, so a week may change how
	// many rounds are run but not the clock they start on.
	const INTERVAL_FIXED_REASON =
		'The interval belongs to the training and cannot be changed for one week';

	let intervalMin = $state(Math.floor((item.interval_seconds ?? 60) / 60));
	let intervalSec = $state((item.interval_seconds ?? 60) % 60);

	// An interval of nothing is a block with no clock to start its rounds on, and
	// the server refuses it. The editor holds the floor at one second so a coach
	// clearing both boxes on the way to typing a new value cannot save one.
	$effect(() => {
		item.interval_seconds = Math.max(1, intervalMin * 60 + intervalSec);
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

	let collapsedSummary = $derived.by(() => {
		const rounds = item.cycles ?? 1;
		const count = item.items?.length ?? 0;
		return `${rounds} rounds · every ${formatInterval(item.interval_seconds ?? 60)} · ${count} items`;
	});
</script>

<div
	style="background: #fff; border-radius: var(--rl); border: 1px solid color-mix(in srgb, var(--pr) 30%, transparent); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed
			? '#fff'
			: 'var(--panel2)'};"
		onclick={() => {
			if (!confirmDelete) collapsed = !collapsed;
		}}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && !confirmDelete && (collapsed = !collapsed)}
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
			EMOM
			<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">{collapsedSummary}</span>
		</span>
		{#if !overriding}
			<div
				style="display: flex; gap: 3px; flex-shrink: 0;"
				onclick={(e) => e.stopPropagation()}
				role="none"
			>
				{#if confirmDelete}
					<button
						onclick={onRemove}
						style="padding: 3px 8px; border-radius: 4px; border: 1px solid #e57373; background: #fff; color: #e57373; font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font);"
						>Delete</button
					>
					<button
						onclick={() => (confirmDelete = false)}
						style="padding: 3px 8px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; color: var(--tx3); font-size: 11px; cursor: pointer; font-family: var(--font);"
						>Cancel</button
					>
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
		{/if}
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2); padding: 12px 14px;">
			<div
				style="display: flex; gap: 16px; margin-bottom: 14px; align-items: flex-end; flex-wrap: wrap;"
			>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>ROUNDS</span
					>
					<input
						type="number"
						min="1"
						aria-label="Rounds"
						bind:value={item.cycles}
						onclick={(e) => e.stopPropagation()}
						style="width: 44px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
					/>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>EVERY</span
					>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input
							type="number"
							min="0"
							aria-label="Interval minutes"
							bind:value={intervalMin}
							disabled={overriding}
							title={overriding ? INTERVAL_FIXED_REASON : undefined}
							onclick={(e) => e.stopPropagation()}
							style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 10px; color: var(--tx3);">m</span>
						<input
							type="number"
							min="0"
							max="59"
							aria-label="Interval seconds"
							bind:value={intervalSec}
							disabled={overriding}
							title={overriding ? INTERVAL_FIXED_REASON : undefined}
							onclick={(e) => e.stopPropagation()}
							style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
				<span style="font-size: 11px; color: var(--tx3); padding-bottom: 5px;">
					Each round starts on the clock. What is left of the interval is the rest.
				</span>
			</div>

			<div
				style="padding-left: 10px; border-left: 2px solid color-mix(in srgb, var(--pr) 20%, transparent);"
			>
				<ItemList
					bind:items={item.items!}
					{exercises}
					{catalog}
					allowedTypes={containerChildTypes('emom', depth, innerAllowedTypes)}
					{innerAllowedTypes}
					depth={depth + 1}
					containerId={containerIdOf(item._id!)}
				/>
			</div>
		</div>
	{/if}
</div>
