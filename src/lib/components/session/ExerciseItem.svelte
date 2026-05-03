<script lang="ts">
	import type { Exercise, SessionItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		item: SessionItem;
		exercises: Exercise[];
		onRemove: () => void;
		onMoveUp: (() => void) | null;
		onMoveDown: (() => void) | null;
	}

	let { item = $bindable(), exercises, onRemove, onMoveUp, onMoveDown }: Props = $props();

	let collapsed = $state(false);

	const LOAD_UNITS: { value: LoadUnit; label: string }[] = [
		{ value: 'bw', label: 'BW' },
		{ value: 'percent_bw', label: '% BW' },
		{ value: 'kg', label: 'kg' },
		{ value: 'lbs', label: 'lbs' }
	];

	let exerciseName = $derived(
		exercises.find((e) => e.id === item.exercise_id)?.name ?? 'New exercise'
	);

	let durationMin = $state(Math.floor((item.reps ?? 0) / 60));
	let durationSec = $state((item.reps ?? 0) % 60);

	$effect(() => {
		item.reps = durationMin * 60 + durationSec;
	});

	let restMin = $state(Math.floor((item.rest_seconds ?? 0) / 60));
	let restSec = $state((item.rest_seconds ?? 0) % 60);

	$effect(() => {
		item.rest_seconds = restMin * 60 + restSec;
	});

	function toggleRepsUnit() {
		item.reps_unit = item.reps_unit === 'seconds' ? 'count' : 'seconds';
	}

	function addLoad() {
		if (!item.loads) item.loads = [];
		item.loads.push({ value: 0, unit: 'bw' });
	}

	function removeLoad(i: number) {
		item.loads?.splice(i, 1);
	}

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div class="group border border-black bg-white" style="border-radius: 4px;">
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 11px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'V'}
		</button>
		<span class="flex-1 truncate font-bold" style="font-family: monospace; font-size: 13px;">
			{exerciseName}
		</span>
		<div class="flex shrink-0 items-center gap-2">
			<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				{#if onMoveUp}
					<button
						onclick={onMoveUp}
						class="px-1 text-gray-400 transition-colors hover:text-black"
						style="font-family: monospace; font-size: 10px;"
						aria-label="Move up"
					>^</button>
				{/if}
				{#if onMoveDown}
					<button
						onclick={onMoveDown}
						class="px-1 text-gray-400 transition-colors hover:text-black"
						style="font-family: monospace; font-size: 10px;"
						aria-label="Move down"
					>v</button>
				{/if}
			</div>
			<button
				onclick={onRemove}
				class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-500 hover:text-red-500"
				style="font-family: monospace; font-size: 11px;"
			>
				Delete
			</button>
		</div>
	</div>

	{#if !collapsed}
		<div class="space-y-3 border-t border-gray-200 px-3 py-3">
			<select
				bind:value={item.exercise_id}
				class="w-full border border-gray-200 px-2 py-1 outline-none focus:border-black"
				style="font-family: monospace; font-size: 12px;"
			>
				<option value="">-- Select exercise --</option>
				{#each exercises as ex (ex.id)}
					<option value={ex.id}>{ex.name}</option>
				{/each}
			</select>

			{#if item.reps_unit === 'seconds'}
				<div class="flex flex-wrap gap-6">
					<div>
						<div class="mb-1 flex items-center gap-1">
							<span style="font-family: monospace; font-size: 10px; color: #999;">Length</span>
							<button
								onclick={toggleRepsUnit}
								class="text-gray-400 transition-colors hover:text-black"
								style="font-family: monospace; font-size: 10px;"
								title="Switch to reps"
							>v</button>
						</div>
						<div class="flex items-center gap-1">
							<input
								type="number"
								min="0"
								bind:value={durationMin}
								class="w-12 border border-gray-300 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px;"
							/>
							<span class="text-gray-500" style="font-family: monospace; font-size: 12px;">mn</span>
							<input
								type="number"
								min="0"
								max="59"
								bind:value={durationSec}
								class="w-12 border border-gray-300 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px;"
							/>
							<span class="text-gray-500" style="font-family: monospace; font-size: 12px;">s</span>
						</div>
					</div>
					<div>
						<p class="mb-1" style="font-family: monospace; font-size: 10px; color: #999;">Rest</p>
						<div class="flex items-center gap-1">
							<input
								type="number"
								min="0"
								bind:value={restMin}
								class="w-12 border border-gray-300 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px;"
							/>
							<span class="text-gray-500" style="font-family: monospace; font-size: 12px;">mn</span>
							<input
								type="number"
								min="0"
								max="59"
								bind:value={restSec}
								class="w-12 border border-gray-300 px-1 py-0.5 text-center outline-none focus:border-black"
								style="font-family: monospace; font-size: 13px;"
							/>
							<span class="text-gray-500" style="font-family: monospace; font-size: 12px;">s</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex flex-wrap gap-6">
					<div>
						<div class="mb-1 flex items-center gap-1">
							<span style="font-family: monospace; font-size: 10px; color: #999;">Reps</span>
							<button
								onclick={toggleRepsUnit}
								class="text-gray-400 transition-colors hover:text-black"
								style="font-family: monospace; font-size: 10px;"
								title="Switch to duration"
							>v</button>
						</div>
						<input
							type="number"
							min="1"
							bind:value={item.reps}
							class="w-16 border border-gray-300 px-2 py-0.5 text-center outline-none focus:border-black"
							style="font-family: monospace; font-size: 13px;"
						/>
					</div>
					<div>
						<div class="mb-1 flex items-center justify-between gap-4">
							<span style="font-family: monospace; font-size: 10px; color: #999;">Load</span>
							<button
								onclick={addLoad}
								class="text-gray-400 transition-colors hover:text-black"
								style="font-family: monospace; font-size: 10px;"
							>+ add</button>
						</div>
						{#if item.loads && item.loads.length > 0}
							{#each item.loads as load, i (i)}
								<div class="mb-1 flex items-center gap-1">
									<input
										type="number"
										min="0"
										step="0.5"
										bind:value={load.value}
										class="w-14 border border-gray-300 px-1 py-0.5 text-center outline-none focus:border-black"
										style="font-family: monospace; font-size: 12px;"
									/>
									<select
										bind:value={load.unit}
										class="border border-gray-300 px-1 py-0.5 outline-none focus:border-black"
										style="font-family: monospace; font-size: 12px;"
									>
										{#each LOAD_UNITS as u}
											<option value={u.value}>{u.label}</option>
										{/each}
									</select>
									<button
										onclick={() => removeLoad(i)}
										class="text-gray-400 transition-colors hover:text-red-600"
										style="font-family: monospace; font-size: 11px;"
										aria-label="Remove load"
									>x</button>
								</div>
							{/each}
						{:else}
							<button
								onclick={addLoad}
								class="border border-dashed border-gray-300 px-3 py-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600"
								style="font-family: monospace; font-size: 11px;"
							>
								+ add load
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
