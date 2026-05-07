<script lang="ts">
	import type { Exercise, TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import SelectExerciseModal from './SelectExerciseModal.svelte';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
		onRemove: () => void;
	}

	let { item = $bindable(), exercises, onRemove }: Props = $props();

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

	let isDuration = $state((item.duration ?? 0) !== 0);

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
</script>

<div
	class="bg-white"
	style="border-left: 3px solid #C6613F; border-top: 1px solid #1d1d1d; border-right: 1px solid #1d1d1d; border-bottom: 1px solid #1d1d1d; box-shadow: 2px 2px 0 0 rgba(29,29,29,0.1);"
>
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 13px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'v'}
		</button>

		{#if confirmDelete}
			<span class="flex-1 truncate" style="font-family: monospace; font-size: 13px; color: #B85450;">
				Delete "{exerciseName}"?
			</span>
			<button
				onclick={onRemove}
				class="border border-red-300 px-2 py-0.5 text-red-500 transition-colors hover:bg-red-50"
				style="font-family: monospace; font-size: 12px;"
			>
				yes
			</button>
			<button
				onclick={() => (confirmDelete = false)}
				class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-600"
				style="font-family: monospace; font-size: 12px;"
			>
				no
			</button>
		{:else}
			<span class="flex-1 truncate font-bold" style="font-family: monospace; font-size: 14px;">
				{exerciseName}
			</span>
			<div class="flex shrink-0 items-center gap-1">
				<button
					onclick={() => (showEditModal = true)}
					class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-700"
					style="font-family: monospace; font-size: 12px;"
				>
					edit
				</button>
				<button
					onclick={() => (confirmDelete = true)}
					class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-400 hover:text-red-500"
					style="font-family: monospace; font-size: 12px;"
				>
					del
				</button>
			</div>
		{/if}
	</div>

	{#if !collapsed}
		<div class="space-y-3 border-t border-gray-100 px-3 py-3">
			<div class="grid grid-cols-3">
				<div class="flex flex-col items-center">
					<select
						value={isDuration ? 'duration' : 'reps'}
						onchange={(e) => e.currentTarget.value === 'duration' ? setDurationMode() : setRepsMode()}
						class="mb-1 px-2 py-0.5 outline-none focus:border-black"
						style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; cursor: pointer; appearance: auto;"
					>
						<option value="reps">REPS</option>
						<option value="duration">DURATION</option>
					</select>
					{#if isDuration}
						<div class="flex items-center gap-1">
							<input
								type="number"
								min="0"
								bind:value={durationMin}
								class="w-12 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 15px;"
							/>
							<span style="font-family: monospace; font-size: 13px; color: #999;">mn</span>
							<input
								type="number"
								min="0"
								max="59"
								bind:value={durationSec}
								class="w-12 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 15px;"
							/>
							<span style="font-family: monospace; font-size: 13px; color: #999;">s</span>
						</div>
					{:else}
						<input
							type="number"
							min="1"
							bind:value={item.reps}
							class="w-16 border border-gray-200 px-2 py-0.5 text-center outline-none focus:border-black"
							style="font-family: monospace; font-size: 15px;"
						/>
					{/if}
				</div>

				{#if item.loads && item.loads.length > 0}
					<div class="flex flex-col items-center">
						<p style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">Load</p>
						<div class="flex items-center gap-1">
							<input
								type="number"
								min="0"
								step="0.5"
								bind:value={item.loads[0].value}
								class="w-16 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 15px;"
							/>
							<select
								bind:value={item.loads[0].unit}
								class="border border-gray-200 px-1 py-0.5 outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px;"
							>
								{#each LOAD_UNITS as u}
									<option value={u.value}>{u.label}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}

				<div class="flex flex-col items-center">
					<p style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">Rest</p>
					<div class="flex items-center gap-1">
						<input
							type="number"
							min="0"
							bind:value={restMin}
							class="w-12 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
							style="font-family: monospace; font-size: 15px;"
						/>
						<span style="font-family: monospace; font-size: 13px; color: #999;">mn</span>
						<input
							type="number"
							min="0"
							max="59"
							bind:value={restSec}
							class="w-12 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
							style="font-family: monospace; font-size: 15px;"
						/>
						<span style="font-family: monospace; font-size: 13px; color: #999;">s</span>
					</div>
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
