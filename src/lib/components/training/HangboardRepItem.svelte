<script lang="ts">
	import type { LoadUnit, TrainingItem } from '$lib/api/client';
	import { getContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import { HANGBOARD_LOAD_UNITS, loadUnitHasValue } from './load-units';
	import AssessmentRefFields from './AssessmentRefFields.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { assessmentTypesForField } from '$lib/assessments';
	import { HANGBOARD_REP_HANDS, hangboardHand, saneCount } from './hangboard-granularity';
	import {
		HANGBOARD_COLOR,
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
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), onRemove, onDuplicate }: Props = $props();

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(
		COLLAPSE_KEY
	);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});

	item.hand ??= 'both';
	item.worktime_seconds ??= 7;
	item.rest_seconds ??= 3;

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

	const LOAD_ASSESSMENTS = assessmentTypesForField('load');
	const storedLoad = item.loads?.[CONFIG_ROW];

	let loadAssessmentType = $state(storedLoad?.assessment_type ?? LOAD_ASSESSMENTS[0]);
	let loadFallbackKg = $state(storedLoad?.fallback ?? 0);
	let usesAssessmentLoad = $derived(config.loadRight.unit === 'percent_assessment');

	// The assessment a percentage applies to and the kilograms it falls back on
	// are edited next to the load rather than written into it, so they are kept
	// on the stored load here and cleared once it stops being a percentage.
	$effect(() => {
		const load = item.loads?.[CONFIG_ROW];
		if (!load) return;
		if (load.unit === 'percent_assessment') {
			load.assessment_type = loadAssessmentType;
			load.fallback = loadFallbackKg;
		} else if (load.assessment_type !== undefined) {
			load.assessment_type = undefined;
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
		`${item.worktime_seconds}s hang / ${item.rest_seconds}s rest, ${describeConfig(config, TWO_HANDED)}, ${handLabel.toLowerCase()}`
	);
</script>

<div class="hb-card" style="--hb: {HANGBOARD_COLOR};">
	<div
		class="hb-header"
		style="background: {collapsed ? '#fff' : 'var(--panel2)'};"
		onclick={() => {
			if (!confirmDelete) collapsed = !collapsed;
		}}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && !confirmDelete && (collapsed = !collapsed)}
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
			<span class="hb-summary">{collapsedSummary}</span>
		</span>
		<div
			style="display: flex; gap: 3px; flex-shrink: 0;"
			onclick={(e) => e.stopPropagation()}
			role="none"
		>
			{#if confirmDelete}
				<button class="hb-pill hb-danger" onclick={onRemove}>Delete</button>
				<button class="hb-pill" onclick={() => (confirmDelete = false)}>Cancel</button>
			{:else}
				<button class="hb-act-btn" onclick={onDuplicate} title="Duplicate" aria-label="Duplicate">
					<Icon name="copy" size={11} color="currentColor" />
				</button>
				<button
					class="hb-act-btn"
					onclick={() => (confirmDelete = true)}
					title="Delete"
					aria-label="Delete"
				>
					<Icon name="trash" size={11} color="currentColor" />
				</button>
			{/if}
		</div>
	</div>

	{#if !collapsed}
		<div class="hb-body">
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
							title={option.hint}
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
						onchange={(e) =>
							apply((next) => (next.edge = saneCount(e.currentTarget.valueAsNumber)))}
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
						bind:assessmentType={loadAssessmentType}
						bind:fallback={loadFallbackKg}
						fallbackUnit="kg"
					/>
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hb-body {
		border-top: 1px solid var(--bd2);
		padding: 16px 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

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

	.hb-pill.hb-danger {
		border-color: #e57373;
		color: #e57373;
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

	.hb-act-btn {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx3);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.hb-act-btn:hover {
		color: var(--hb);
		border-color: var(--hb);
	}

	.hb-pill:focus-visible,
	.hb-act-btn:focus-visible {
		outline: 2px solid var(--hb);
		outline-offset: 2px;
	}
</style>
