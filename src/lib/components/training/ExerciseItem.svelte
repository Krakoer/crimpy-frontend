<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import { EXERCISE_LOAD_UNITS } from './load-units';
	import SelectExerciseModal from './SelectExerciseModal.svelte';
	import AssessmentRefFields from './AssessmentRefFields.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		assessmentLabel,
		assessmentsForField,
		formatLoad,
		type AssessmentCatalog,
		type VariableField
	} from '$lib/assessments';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		catalog: AssessmentCatalog;
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), exercises, catalog, onRemove, onDuplicate }: Props = $props();

	const MAX_COMMENT_LENGTH = 200;

	let collapsed = $state(false);
	let showEditModal = $state(false);
	let confirmDelete = $state(false);

	let loadAssessments = $derived(assessmentsForField('load', catalog));

	let exerciseName = $derived(
		exercises.find((e) => e.id === item.exercise_id)?.name ?? 'Unknown exercise'
	);

	let isDuration = $state((item.duration ?? 0) !== 0 && (item.reps ?? 0) === 0);

	let durationMin = $state(Math.floor((item.duration ?? 0) / 60));
	let durationSec = $state((item.duration ?? 0) % 60);

	$effect(() => {
		if (isDuration) {
			item.duration = durationMin * 60 + durationSec;
		}
	});

	let restMin = $state(Math.floor((item.rest_seconds ?? 0) / 60));
	let restSec = $state((item.rest_seconds ?? 0) % 60);

	$effect(() => {
		item.rest_seconds = restMin * 60 + restSec;
	});

	function addLoad() {
		item.loads = [{ value: 0, unit: 'kg' }];
	}

	function removeLoad() {
		item.loads = undefined;
	}

	// An assessment-relative load carries the percentage in its value and needs
	// an assessment plus the kilograms to fall back on; the other units do not.
	function onLoadUnitChange() {
		const load = item.loads?.[0];
		if (!load) return;
		if (load.unit === 'percent_assessment') {
			load.assessment_id ??= loadAssessments[0];
			load.fallback ??= 0;
			if (load.value === 0) load.value = 80;
		} else {
			load.assessment_id = undefined;
			load.fallback = undefined;
		}
	}

	// Reps and duration are exclusive, so only the active one can be variable.
	let variableField = $derived<'duration' | 'reps'>(isDuration ? 'duration' : 'reps');
	let variableTarget = $derived(item.variable_targets?.[variableField]);
	let canBeVariable = $derived(assessmentsForField(variableField, catalog).length > 0);

	// The reps and duration inputs edit the fallback once the field is variable,
	// so the plain value a client without assessment data reads stays right.
	function toggleVariable(field: VariableField & ('duration' | 'reps'), on: boolean) {
		const targets = { ...(item.variable_targets ?? {}) };
		if (on) {
			targets[field] = {
				assessment_id: assessmentsForField(field, catalog)[0],
				percent: 75,
				fallback: (field === 'duration' ? item.duration : item.reps) ?? 0
			};
		} else {
			delete targets[field];
		}
		item.variable_targets = Object.keys(targets).length > 0 ? targets : undefined;
	}

	$effect(() => {
		const target = item.variable_targets?.duration;
		if (target) target.fallback = durationMin * 60 + durationSec;
	});

	$effect(() => {
		const target = item.variable_targets?.reps;
		if (target) target.fallback = item.reps ?? 0;
	});

	function setDurationMode() {
		durationMin = 0;
		durationSec = 0;
		item.reps = 0;
		toggleVariable('reps', false);
		isDuration = true;
	}

	function setRepsMode() {
		item.duration = 0;
		if (!item.reps || item.reps === 0) item.reps = 1;
		toggleVariable('duration', false);
		isDuration = false;
	}

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
		const parts: string[] = [];
		const durationTarget = item.variable_targets?.duration;
		const repsTarget = item.variable_targets?.reps;
		if (isDuration) {
			if (durationTarget) {
				parts.push(
					`${durationTarget.percent}% ${assessmentLabel(durationTarget.assessment_id, catalog)}`
				);
			} else {
				const m = Math.floor((item.duration ?? 0) / 60);
				const s = (item.duration ?? 0) % 60;
				parts.push(m > 0 ? `${m}m${s > 0 ? s + 's' : ''}` : `${s}s`);
			}
		} else if (repsTarget) {
			parts.push(`${repsTarget.percent}% ${assessmentLabel(repsTarget.assessment_id, catalog)}`);
		} else {
			parts.push(`${item.reps ?? 0} reps`);
		}
		const rest = item.rest_seconds ?? 0;
		if (rest > 0) parts.push(`${rest}s rest`);
		const load = item.loads?.[0];
		if (load && !(load.unit === 'percent_bw' && load.value === 100)) {
			parts.push(formatLoad(load, catalog));
		}
		return parts.join(' · ');
	});
</script>

<div
	style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
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
			style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;"
		>
			<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
				>{exerciseName}</span
			>
			{#if collapsed && collapsedSummary}
				<span style="font-size: 11px; color: var(--tx3); font-weight: 500; flex-shrink: 0;"
					>{collapsedSummary}</span
				>
			{/if}
		</span>
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
					onclick={() => (showEditModal = true)}
					title="Change exercise"
					style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
				>
					<Icon name="edit" size={11} color="var(--tx3)" />
				</button>
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
		<div
			style="padding: 14px 18px; border-top: 1px solid var(--bd2); display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;"
		>
			<!-- Reps vs Duration toggle -->
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<div
					style="display: flex; gap: 2px; background: var(--panel2); border-radius: 5px; padding: 2px;"
				>
					<button
						onclick={() => setRepsMode()}
						style="padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; background: {!isDuration
							? '#fff'
							: 'transparent'}; color: {!isDuration
							? 'var(--pr)'
							: 'var(--tx3)'}; font-family: var(--font); box-shadow: {!isDuration
							? 'var(--sh)'
							: 'none'};">Reps</button
					>
					<button
						onclick={() => setDurationMode()}
						style="padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; background: {isDuration
							? '#fff'
							: 'transparent'}; color: {isDuration
							? 'var(--pr)'
							: 'var(--tx3)'}; font-family: var(--font); box-shadow: {isDuration
							? 'var(--sh)'
							: 'none'};">Duration</button
					>
				</div>
				{#if variableTarget}
					<div style="display: flex; align-items: center; gap: 4px;">
						<input
							type="number"
							min="1"
							bind:value={variableTarget.percent}
							onclick={(e) => e.stopPropagation()}
							style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 11px; color: var(--tx3);">% of</span>
						<select
							bind:value={variableTarget.assessment_id}
							onclick={(e) => e.stopPropagation()}
							style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
						>
							{#each assessmentsForField(variableField, catalog) as id (id)}
								<option value={id}>{catalog[id].label}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div style="display: flex; align-items: center; gap: 4px;">
					{#if variableTarget}
						<span
							style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
							>FALLBACK</span
						>
					{/if}
					{#if isDuration}
						<div style="display: flex; align-items: center; gap: 2px;">
							<input
								type="number"
								min="0"
								bind:value={durationMin}
								onclick={(e) => e.stopPropagation()}
								style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
							/>
							<span style="font-size: 10px; color: var(--tx3);">m</span>
							<input
								type="number"
								min="0"
								max="59"
								bind:value={durationSec}
								onclick={(e) => e.stopPropagation()}
								style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
							/>
							<span style="font-size: 10px; color: var(--tx3);">s</span>
						</div>
					{:else}
						<input
							type="number"
							min="1"
							bind:value={item.reps}
							onclick={(e) => e.stopPropagation()}
							style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
					{/if}
					{#if canBeVariable}
						<button
							onclick={(e) => {
								e.stopPropagation();
								toggleVariable(variableField, !variableTarget);
							}}
							title={variableTarget
								? 'Use a fixed value'
								: 'Set as a percentage of an assessment result'}
							style="padding: 4px 8px; border-radius: 5px; border: 1px solid {variableTarget
								? 'var(--pr)'
								: 'var(--bd)'}; background: {variableTarget
								? 'var(--pr-fog)'
								: '#fff'}; color: {variableTarget
								? 'var(--pr)'
								: 'var(--tx3)'}; font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font);"
							>%</button
						>
					{/if}
				</div>
			</div>

			<!-- Load (optional) -->
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<span
					style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; text-align: center;"
					>LOAD</span
				>
				{#if item.loads && item.loads.length > 0}
					<div style="display: flex; gap: 4px; align-items: center;">
						<input
							type="number"
							min="0"
							step="0.5"
							bind:value={item.loads[0].value}
							onclick={(e) => e.stopPropagation()}
							style="width: 56px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<select
							bind:value={item.loads[0].unit}
							onchange={onLoadUnitChange}
							onclick={(e) => e.stopPropagation()}
							style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
						>
							{#each EXERCISE_LOAD_UNITS as u (u.value)}
								<option value={u.value}>{u.label}</option>
							{/each}
						</select>
						<button
							onclick={(e) => {
								e.stopPropagation();
								removeLoad();
							}}
							title="Remove load"
							style="width: 30px; height: 30px; flex-shrink: 0; border-radius: 5px; border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
						>
							<Icon name="x" size={11} color="var(--tx3)" />
						</button>
					</div>
					{#if item.loads[0].unit === 'percent_assessment'}
						<AssessmentRefFields
							field="load"
							bind:assessmentId={
								() => item.loads![0].assessment_id ?? loadAssessments[0],
								(v) => (item.loads![0].assessment_id = v)
							}
							bind:fallback={
								() => item.loads![0].fallback ?? 0, (v) => (item.loads![0].fallback = v)
							}
							fallbackUnit="kg"
							{catalog}
						/>
					{/if}
				{:else}
					<button
						onclick={(e) => {
							e.stopPropagation();
							addLoad();
						}}
						style="display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 5px; border: 1px dashed var(--bd); background: #fff; color: var(--tx3); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);"
					>
						<Icon name="plus" size={11} color="var(--tx3)" />
						Add
					</button>
				{/if}
			</div>

			<!-- Rest -->
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<span
					style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; text-align: center;"
					>REST</span
				>
				<div style="display: flex; align-items: center; gap: 2px;">
					<input
						type="number"
						min="0"
						bind:value={restMin}
						onclick={(e) => e.stopPropagation()}
						style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
					/>
					<span style="font-size: 10px; color: var(--tx3);">m</span>
					<input
						type="number"
						min="0"
						max="59"
						bind:value={restSec}
						onclick={(e) => e.stopPropagation()}
						style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
					/>
					<span style="font-size: 10px; color: var(--tx3);">s</span>
				</div>
			</div>

			<!-- Comment -->
			<div style="display: flex; flex-direction: column; gap: 4px; flex-basis: 100%; width: 100%;">
				<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
					>COMMENT</span
				>
				<textarea
					bind:value={item.comment}
					maxlength={MAX_COMMENT_LENGTH}
					rows="2"
					placeholder="Optional note for the athlete (e.g. first rep in pronation, second in supination)"
					onclick={(e) => e.stopPropagation()}
					style="width: 100%; resize: vertical; min-height: 38px; padding: 6px 8px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; line-height: 1.4; color: var(--tx); outline: none; background: #fff;"
				></textarea>
				<span style="font-size: 10px; color: var(--tx3); align-self: flex-end;"
					>{(item.comment ?? '').length}/{MAX_COMMENT_LENGTH}</span
				>
			</div>
		</div>
	{/if}
</div>

{#if showEditModal}
	<SelectExerciseModal
		onSelect={(exercise) => {
			item.exercise_id = exercise.id;
			showEditModal = false;
		}}
		onClose={() => {
			showEditModal = false;
		}}
	/>
{/if}
