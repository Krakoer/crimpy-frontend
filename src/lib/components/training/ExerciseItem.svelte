<script lang="ts">
	import type { Exercise, TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import SelectExerciseModal from './SelectExerciseModal.svelte';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), exercises, onRemove, onDuplicate }: Props = $props();

	let collapsed = $state(false);
	let showEditModal = $state(false);
	let confirmDelete = $state(false);

	const LOAD_UNITS: { value: LoadUnit; label: string }[] = [
		{ value: 'bw', label: 'BW' },
		{ value: 'percent_bw', label: '% BW' },
		{ value: 'kg', label: 'kg' },
		{ value: 'lbs', label: 'lbs' }
	];

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

	if (!item.loads || item.loads.length === 0) {
		item.loads = [{ value: 100, unit: 'percent_bw' }];
	}

	function setDurationMode() {
		durationMin = 0;
		durationSec = 0;
		item.reps = 0;
		isDuration = true;
	}

	function setRepsMode() {
		item.duration = 0;
		if (!item.reps || item.reps === 0) item.reps = 1;
		isDuration = false;
	}

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});

	let collapsedSummary = $derived.by(() => {
		const parts: string[] = [];
		if (isDuration) {
			const m = Math.floor((item.duration ?? 0) / 60);
			const s = (item.duration ?? 0) % 60;
			parts.push(m > 0 ? `${m}m${s > 0 ? s + 's' : ''}` : `${s}s`);
		} else {
			parts.push(`${item.reps ?? 0} reps`);
		}
		const rest = item.rest_seconds ?? 0;
		if (rest > 0) parts.push(`${rest}s rest`);
		const load = item.loads?.[0];
		if (load && !(load.unit === 'percent_bw' && load.value === 100)) {
			parts.push(`${load.value} ${load.unit}`);
		}
		return parts.join(' · ');
	});
</script>

<div style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;">
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
		<span style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;">
			<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{exerciseName}</span>
			{#if collapsed && collapsedSummary}
				<span style="font-size: 11px; color: var(--tx3); font-weight: 500; flex-shrink: 0;">{collapsedSummary}</span>
			{/if}
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
		<div style="padding: 14px 18px; border-top: 1px solid var(--bd2); display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;">
			<!-- Reps vs Duration toggle -->
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<div style="display: flex; gap: 2px; background: var(--panel2); border-radius: 5px; padding: 2px;">
					<button
						onclick={() => setRepsMode()}
						style="padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; background: {!isDuration ? '#fff' : 'transparent'}; color: {!isDuration ? 'var(--pr)' : 'var(--tx3)'}; font-family: var(--font); box-shadow: {!isDuration ? 'var(--sh)' : 'none'};"
					>Reps</button>
					<button
						onclick={() => setDurationMode()}
						style="padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; background: {isDuration ? '#fff' : 'transparent'}; color: {isDuration ? 'var(--pr)' : 'var(--tx3)'}; font-family: var(--font); box-shadow: {isDuration ? 'var(--sh)' : 'none'};"
					>Duration</button>
				</div>
				{#if isDuration}
					<div style="display: flex; align-items: center; gap: 2px;">
						<input
							type="number" min="0" bind:value={durationMin}
							onclick={(e) => e.stopPropagation()}
							style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 10px; color: var(--tx3);">m</span>
						<input
							type="number" min="0" max="59" bind:value={durationSec}
							onclick={(e) => e.stopPropagation()}
							style="width: 36px; padding: 5px 2px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				{:else}
					<input
						type="number" min="1" bind:value={item.reps}
						onclick={(e) => e.stopPropagation()}
						style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
					/>
				{/if}
			</div>

			<!-- Load -->
			{#if item.loads && item.loads.length > 0}
				<div style="display: flex; flex-direction: column; gap: 4px;">
					<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; text-align: center;">LOAD</span>
					<div style="display: flex; gap: 4px; align-items: center;">
						<input
							type="number" min="0" step="0.5" bind:value={item.loads[0].value}
							onclick={(e) => e.stopPropagation()}
							style="width: 56px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
						<select
							bind:value={item.loads[0].unit}
							onclick={(e) => e.stopPropagation()}
							style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
						>
							{#each LOAD_UNITS as u}
								<option value={u.value}>{u.label}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}

			<!-- Rest -->
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; text-align: center;">REST</span>
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
	{/if}
</div>

{#if showEditModal}
	<SelectExerciseModal
		onSelect={(exercise) => {
			item.exercise_id = exercise.id;
			showEditModal = false;
		}}
		onClose={() => { showEditModal = false; }}
	/>
{/if}
