<script lang="ts">
	import type { Exercise, SessionItem, Load, LoadUnit, RepsUnit } from '$lib/api/client';

	interface Props {
		item: SessionItem;
		exercises: Exercise[];
		onRemove: () => void;
		onMoveUp: (() => void) | null;
		onMoveDown: (() => void) | null;
	}

	let { item, exercises, onRemove, onMoveUp, onMoveDown }: Props = $props();

	const LOAD_UNITS: { value: LoadUnit; label: string }[] = [
		{ value: 'bw', label: 'BW' },
		{ value: 'percent_bw', label: '% BW' },
		{ value: 'kg', label: 'kg' },
		{ value: 'lbs', label: 'lbs' }
	];

	function addLoad() {
		if (!item.loads) item.loads = [];
		item.loads.push({ value: 0, unit: 'bw' });
	}

	function removeLoad(i: number) {
		item.loads?.splice(i, 1);
	}

	function toggleRepsUnit() {
		item.reps_unit = item.reps_unit === 'seconds' ? 'count' : 'seconds';
	}
</script>

<div class="border border-black bg-white">
	<div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
		<span
			class="shrink-0 px-1.5 py-0.5 text-white"
			style="font-family: monospace; font-size: 10px; font-weight: bold; background-color: #555; letter-spacing: 0.5px;"
		>
			EX
		</span>
		<div class="flex-1">
			<select
				bind:value={item.exercise_id}
				class="w-full border-0 bg-transparent outline-none"
				style="font-family: monospace; font-size: 13px;"
			>
				<option value="">-- Select exercise --</option>
				{#each exercises as ex (ex.id)}
					<option value={ex.id}>{ex.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex shrink-0 gap-1">
			{#if onMoveUp}
				<button
					onclick={onMoveUp}
					class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 11px;"
					aria-label="Move up"
				>
					^
				</button>
			{/if}
			{#if onMoveDown}
				<button
					onclick={onMoveDown}
					class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 11px;"
					aria-label="Move down"
				>
					v
				</button>
			{/if}
			<button
				onclick={onRemove}
				class="border border-gray-300 px-1.5 py-0.5 text-gray-500 transition-colors hover:border-red-600 hover:text-red-600"
				style="font-family: monospace; font-size: 11px;"
				aria-label="Remove"
			>
				x
			</button>
		</div>
	</div>

	<div class="grid grid-cols-3 gap-px bg-gray-200 text-center">
		<div class="bg-white px-2 py-2">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">REPS</label>
			<input
				type="number"
				min="1"
				bind:value={item.reps}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
				placeholder="--"
			/>
		</div>
		<div class="bg-white px-2 py-2">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">UNIT</label>
			<button
				onclick={toggleRepsUnit}
				class="w-full border border-gray-300 px-2 py-0.5 transition-colors hover:bg-gray-100"
				style="font-family: monospace; font-size: 12px;"
			>
				{item.reps_unit === 'seconds' ? 'SEC' : 'REPS'}
			</button>
		</div>
		<div class="bg-white px-2 py-2">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">REST (s)</label>
			<input
				type="number"
				min="0"
				bind:value={item.rest_seconds}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
				placeholder="--"
			/>
		</div>
	</div>

	{#if item.loads && item.loads.length > 0}
		<div class="border-t border-gray-200 px-3 py-2">
			<p style="font-family: monospace; font-size: 10px; color: #999; margin-bottom: 4px;">LOAD</p>
			{#each item.loads as load, i (i)}
				<div class="mb-1 flex items-center gap-1">
					<input
						type="number"
						min="0"
						bind:value={load.value}
						class="w-16 border border-gray-300 px-2 py-0.5 text-center outline-none"
						style="font-family: monospace; font-size: 12px;"
					/>
					<select
						bind:value={load.unit}
						class="border border-gray-300 px-1 py-0.5 outline-none"
						style="font-family: monospace; font-size: 12px;"
					>
						{#each LOAD_UNITS as u}
							<option value={u.value}>{u.label}</option>
						{/each}
					</select>
					<button
						onclick={() => removeLoad(i)}
						class="border border-gray-300 px-1.5 py-0.5 text-gray-500 hover:border-red-600 hover:text-red-600"
						style="font-family: monospace; font-size: 11px;"
					>
						x
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="border-t border-gray-200 px-3 py-1.5">
		<button
			onclick={addLoad}
			class="text-gray-500 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 11px;"
		>
			+ add load
		</button>
	</div>
</div>
