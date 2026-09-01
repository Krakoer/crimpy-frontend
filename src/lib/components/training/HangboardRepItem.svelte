<script lang="ts">
	import type { LoadUnit, TrainingItem } from '$lib/api/client';
	import { getContext, untrack } from 'svelte';
	import { HANGBOARD_LOAD_UNITS, loadUnitHasValue } from './load-units';
	import AssessmentRefFields from './AssessmentRefFields.svelte';
	import HangboardCard from './HangboardCard.svelte';
	import { applyHangboardRepReadDefaults } from './item-defaults';
	import { OVERRIDE_KEY, type OverrideMode } from './override-context';
	import { assessmentsForField, type AssessmentCatalog } from '$lib/assessments';
	import { HANGBOARD_REP_HANDS, hangboardHand, saneCount } from './hangboard-granularity';
	import {
		HANGBOARD_GRIPS,
		cloneConfig,
		defaultRepConfig,
		describeConfig,
		normalizeHangboardItem,
		readConfig,
		writeConfig,
		type RepConfig
	} from './hangboard-config';

	interface Props {
		item: TrainingItem;
		catalog: AssessmentCatalog;
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), catalog, onRemove, onDuplicate }: Props = $props();

	// A program week changes what the hang asks for, not what it is. Two controls
	// stay with the training there. The hand mode, because a mode that hangs both
	// hands together needs the left loads gone and a sparse override has no way to
	// say so. The load unit, because a max effort is still carried by the item's
	// own load_is_max flag for older clients, and no override may move it, so a
	// week switching between max and kilograms would read one way in the app and
	// another in the plan.
	const overriding = getContext<OverrideMode | undefined>(OVERRIDE_KEY) !== undefined;
	const FIXED_BY_TRAINING = 'This belongs to the training and is the same in every week';

	applyHangboardRepReadDefaults(item);

	// A hang rep may arrive from the app with any of its configuration arrays
	// missing, so it is rewritten into the single row it stands for before the
	// fields below read or write it. The draft is normalised on load, before the
	// unsaved-changes baseline is taken, so this only has work to do for an item
	// built here.
	untrack(() => normalizeHangboardItem(item));

	// A single hang is worked with both hands together or with one of them, and
	// none of those modes carries a separate configuration per hand.
	const TWO_HANDED = false;
	const CONFIG_ROW = 0;

	let config = $derived(readConfig(item, CONFIG_ROW, TWO_HANDED, defaultRepConfig()));

	function apply(mutate: (config: RepConfig) => void) {
		const next = cloneConfig(config);
		mutate(next);
		writeConfig(item, CONFIG_ROW, next, TWO_HANDED);
	}

	function setLoadUnit(unit: LoadUnit) {
		apply((next) => {
			next.loadRight = {
				...next.loadRight,
				unit,
				value: loadUnitHasValue(unit) ? next.loadRight.value : 0
			};
		});
	}

	const storedLoad = item.loads?.[CONFIG_ROW];

	// Left unset until the catalog has loaded, which happens after the first
	// render: seeding it from an empty catalog would pin it to undefined.
	let loadAssessmentId = $state<string | undefined>(storedLoad?.assessment_id);
	let loadAssessments = $derived(assessmentsForField('load', catalog));
	let loadFallbackKg = $state(storedLoad?.fallback ?? 0);
	let usesAssessmentLoad = $derived(config.loadRight.unit === 'percent_assessment');

	// The assessment a percentage applies to and the kilograms it falls back on
	// are edited next to the load rather than written into it, so they are kept
	// on the stored load here and cleared once it stops being a percentage.
	$effect(() => {
		const load = item.loads?.[CONFIG_ROW];
		if (!load) return;
		loadAssessmentId ??= loadAssessments[0];
		if (load.unit === 'percent_assessment') {
			load.assessment_id = loadAssessmentId;
			load.fallback = loadFallbackKg;
		} else if (load.assessment_id !== undefined) {
			load.assessment_id = undefined;
			load.fallback = undefined;
		}
	});

	// Keep the legacy item-level flag in sync for older clients, which read a max
	// effort from it rather than from the load unit.
	$effect(() => {
		const isMax = config.loadRight.unit === 'max';
		if ((item.load_is_max ?? false) !== isMax) item.load_is_max = isMax;
	});

	const handHintId = `hangboard-rep-hand-hint-${crypto.randomUUID()}`;
	const edgeFieldId = `hangboard-rep-edge-${crypto.randomUUID()}`;

	let hand = $derived(hangboardHand(item));
	let handHint = $derived(HANGBOARD_REP_HANDS.find((h) => h.value === hand)?.hint ?? '');
	let handLabel = $derived(HANGBOARD_REP_HANDS.find((h) => h.value === hand)?.label ?? 'Both');
	let collapsedSummary = $derived(
		`${item.worktime_seconds}s hang / ${item.rest_seconds}s rest, ${describeConfig(config, TWO_HANDED, catalog)}, ${handLabel.toLowerCase()}`
	);
</script>

<HangboardCard
	title="Hang rep"
	summary={collapsedSummary}
	onRemove={overriding ? undefined : onRemove}
	onDuplicate={overriding ? undefined : onDuplicate}
>
	{#snippet body()}
		<div class="hb-sentence">
			<input
				class="hb-count"
				type="number"
				min="1"
				aria-label="Work seconds"
				bind:value={item.worktime_seconds}
			/>
			<span>s hang /</span>
			<input
				class="hb-count"
				type="number"
				min="0"
				aria-label="Rest seconds"
				bind:value={item.rest_seconds}
			/>
			<span>s rest before the next item</span>
		</div>

		<div class="hb-row">
			<span class="hb-label">Hands</span>
			<div class="hb-pills" role="radiogroup" aria-label="Hands" aria-describedby={handHintId}>
				{#each HANGBOARD_REP_HANDS as option (option.value)}
					<button
						class="hb-pill"
						class:hb-on={hand === option.value}
						onclick={() => (item.hand = option.value)}
						disabled={overriding}
						title={overriding ? FIXED_BY_TRAINING : option.hint}
						role="radio"
						aria-checked={hand === option.value}>{option.label}</button
					>
				{/each}
			</div>
			<span id={handHintId} class="hb-hint">{handHint}</span>
		</div>

		<div class="hb-fields">
			<div class="hb-field">
				<label class="hb-label" for={edgeFieldId}>Edge (mm)</label>
				<input
					id={edgeFieldId}
					class="hb-input"
					type="number"
					min="1"
					value={config.edge}
					onchange={(e) => apply((next) => (next.edge = saneCount(e.currentTarget.valueAsNumber)))}
				/>
			</div>

			<div class="hb-field">
				<span class="hb-label">Grip</span>
				<div class="hb-pills" role="radiogroup" aria-label="Grip">
					{#each HANGBOARD_GRIPS as grip (grip.value)}
						<button
							class="hb-pill"
							class:hb-on={config.gripRight === grip.value}
							onclick={() => apply((next) => (next.gripRight = grip.value))}
							title={grip.hint}
							role="radio"
							aria-checked={config.gripRight === grip.value}>{grip.value}</button
						>
					{/each}
				</div>
			</div>

			<div class="hb-field">
				<span class="hb-label">Load</span>
				<div class="hb-load">
					{#if loadUnitHasValue(config.loadRight.unit)}
						<input
							class="hb-input"
							type="number"
							min="0"
							aria-label="Load"
							value={config.loadRight.value}
							onchange={(e) =>
								apply(
									(next) =>
										(next.loadRight = {
											...next.loadRight,
											value: e.currentTarget.valueAsNumber || 0
										})
								)}
						/>
					{/if}
					<select
						class="hb-select"
						aria-label="Load unit"
						value={config.loadRight.unit}
						disabled={overriding}
						title={overriding ? FIXED_BY_TRAINING : undefined}
						onchange={(e) => setLoadUnit(e.currentTarget.value as LoadUnit)}
					>
						{#each HANGBOARD_LOAD_UNITS as unit (unit.value)}
							<option value={unit.value}>{unit.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		{#if usesAssessmentLoad}
			<div class="hb-assessment">
				<span class="hb-hint">Load set in percent</span>
				<AssessmentRefFields
					field="load"
					bind:assessmentId={
						() => loadAssessmentId ?? loadAssessments[0], (v) => (loadAssessmentId = v)
					}
					bind:fallback={loadFallbackKg}
					fallbackUnit="kg"
					{catalog}
				/>
			</div>
		{/if}
	{/snippet}
</HangboardCard>

<style>
	.hb-sentence {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--tx2);
		line-height: 2;
	}

	.hb-count {
		width: 44px;
		padding: 3px 2px;
		text-align: center;
		border: none;
		border-bottom: 1.5px solid var(--bd);
		background: transparent;
		font-family: var(--font);
		font-size: 15px;
		font-weight: 700;
		color: var(--tx);
		outline: none;
	}

	.hb-count:focus {
		border-bottom-color: var(--hb);
	}

	.hb-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.hb-label {
		font-size: 10px;
		color: var(--tx3);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hb-hint {
		font-size: 11px;
		color: var(--tx3);
	}

	.hb-pills {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.hb-pill {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx2);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font);
	}

	.hb-pill.hb-on {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, transparent);
		color: var(--hb);
		font-weight: 700;
	}

	.hb-fields {
		display: flex;
		gap: 18px;
		flex-wrap: wrap;
		align-items: flex-end;
	}

	.hb-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.hb-load {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.hb-input,
	.hb-select {
		padding: 5px 6px;
		border: 1px solid var(--bd);
		border-radius: var(--rs);
		background: #fff;
		font-family: var(--font);
		font-size: 13px;
		color: var(--tx);
		outline: none;
	}

	.hb-input {
		width: 72px;
		text-align: center;
	}

	.hb-select {
		font-size: 12px;
		cursor: pointer;
	}

	.hb-input:focus,
	.hb-select:focus {
		border-color: var(--hb);
	}

	.hb-assessment {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.hb-pill:focus-visible {
		outline: 2px solid var(--hb);
		outline-offset: 2px;
	}
</style>
