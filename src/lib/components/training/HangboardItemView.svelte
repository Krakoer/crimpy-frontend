<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import { formatLoad } from '$lib/assessments';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';
	import {
		HANGBOARD_HANDS,
		hangboardGranularity,
		hangboardHand,
		hangboardReps,
		hangboardSets,
		isTwoHandedMode
	} from './hangboard-granularity';
	import {
		commonConfig,
		configLines,
		describeConfig,
		repsVaryWithinSets,
		sameConfig,
		storedConfig,
		type HangboardVariation
	} from './hangboard-config';

	interface Props {
		item: TrainingItem;
	}

	let { item }: Props = $props();

	let collapsed = $state(false);

	const HB_COLOR = '#4A7C8C';

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
	let variation = $derived<HangboardVariation>(
		hangboardGranularity(item) === 'uniform' ? 'uniform' : repsVaryWithinSets(item) ? 'rep' : 'set'
	);

	let variationLabel = $derived(
		variation === 'rep' ? 'VARIES BY REP' : variation === 'set' ? 'VARIES BY SET' : ''
	);

	let setRows = $derived.by(() => {
		if (variation === 'uniform') return [];
		return Array.from({ length: sets }, (_, index) => ({
			index,
			steps: Array.from({ length: variation === 'set' ? 1 : reps }, (_, position) => {
				const config = storedConfig(item, index, position);
				const customised = !sameConfig(config, base, twoHanded);
				const [edgeLine, detailLine] = configLines(config, twoHanded);
				return {
					position,
					customised,
					showValues: variation === 'set' || customised,
					badge: variation === 'set' ? `${reps} reps` : String(position + 1),
					edgeLine,
					detailLine,
					title:
						variation === 'set'
							? `Set ${index + 1}: ${describeConfig(config, twoHanded)}`
							: `Rep ${position + 1}: ${describeConfig(config, twoHanded)}`
				};
			})
		}));
	});

	let collapsedSummary = $derived(
		`${sets} sets x ${reps} reps, ${item.worktime_seconds ?? 0}s on / ${item.rest_seconds ?? 0}s off`
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

<div class="hb-card" style="--hb: {HB_COLOR};">
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
			Hangboard
			{#if collapsed}
				<span class="hb-summary">{collapsedSummary}</span>
			{/if}
		</span>
	</div>

	{#if !collapsed}
		<div class="hb-body">
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
					<div class="hb-sets">
						{#each setRows as row (row.index)}
							<div class="hb-set">
								<span class="hb-set-label">Set {row.index + 1}</span>
								<div class="hb-steps">
									{#each row.steps as step (step.position)}
										<div
											class="hb-step"
											class:hb-wide={step.showValues}
											class:hb-full={variation === 'set'}
											class:hb-custom={step.customised}
											title={step.title}
										>
											<span class="hb-step-badge">{step.badge}</span>
											{#if step.showValues}
												<span class="hb-step-edge">{step.edgeLine}</span>
												<span class="hb-step-detail">{step.detailLine}</span>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
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
		display: flex;
		flex-direction: column;
		gap: 16px;
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

	.hb-sets {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 380px;
		overflow: auto;
	}

	.hb-set {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.hb-set-label {
		width: 58px;
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--tx3);
	}

	.hb-steps {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		flex: 1;
		min-width: 0;
	}

	.hb-step {
		width: 40px;
		height: 40px;
		border-radius: var(--rs);
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx2);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hb-step.hb-wide {
		width: auto;
		min-width: 112px;
		height: auto;
		padding: 6px 10px;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
	}

	.hb-step.hb-full {
		flex: 1;
	}

	.hb-step.hb-custom {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, transparent);
		color: var(--hb);
	}

	.hb-step-badge {
		font-size: 12px;
		font-weight: 700;
	}

	.hb-step.hb-wide .hb-step-badge {
		font-size: 9px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.hb-step-edge {
		font-size: 11px;
		font-weight: 700;
	}

	.hb-step-detail {
		font-size: 10px;
		white-space: nowrap;
		opacity: 0.8;
	}
</style>
