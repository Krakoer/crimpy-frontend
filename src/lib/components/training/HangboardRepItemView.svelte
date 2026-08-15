<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import { formatLoad } from '$lib/assessments';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';
	import { HANGBOARD_REP_HANDS, hangboardHand } from './hangboard-granularity';
	import { HANGBOARD_COLOR, storedConfig } from './hangboard-config';

	interface Props {
		item: TrainingItem;
	}

	let { item }: Props = $props();

	let collapsed = $state(false);

	// A hang rep stands for one rep of one set, so it reads back from the first
	// coordinate of whatever layout it declares.
	let config = $derived(storedConfig(item, 0, 0));
	let hand = $derived(hangboardHand(item));
	let handLabel = $derived(HANGBOARD_REP_HANDS.find((h) => h.value === hand)?.label ?? 'Both');
	let handHint = $derived(HANGBOARD_REP_HANDS.find((h) => h.value === hand)?.hint ?? '');

	let collapsedSummary = $derived(
		`${item.worktime_seconds ?? 0}s hang / ${item.rest_seconds ?? 0}s rest`
	);

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

<div class="hb-card" style="--hb: {HANGBOARD_COLOR};">
	<div
		class="hb-header"
		style="background: {collapsed ? '#fff' : 'var(--panel2)'};"
		onclick={() => (collapsed = !collapsed)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && (collapsed = !collapsed)}
	>
		<div class="hb-accent"></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span class="hb-title">
			Hang rep
			{#if collapsed}
				<span class="hb-summary">{collapsedSummary}</span>
			{/if}
		</span>
	</div>

	{#if !collapsed}
		<div class="hb-body">
			<div class="hb-facts">
				<div class="hb-fact">
					<span class="hb-label">Work</span>
					<span class="hb-value">{item.worktime_seconds ?? 0}s</span>
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
					<span class="hb-value">{formatLoad(config.loadRight)}</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.hb-card {
		background: #fff;
		border-radius: var(--rl);
		border: 1px solid color-mix(in srgb, var(--hb) 30%, transparent);
		box-shadow: var(--sh);
		overflow: hidden;
	}

	.hb-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		cursor: pointer;
	}

	.hb-accent {
		width: 4px;
		height: 20px;
		background: var(--hb);
		border-radius: 2px;
		flex-shrink: 0;
	}

	.hb-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--hb);
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.hb-summary {
		font-size: 11px;
		color: var(--tx3);
		font-weight: 500;
	}

	.hb-body {
		border-top: 1px solid var(--bd2);
		padding: 14px 18px;
	}

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
</style>
