<script lang="ts">
	import type { SessionItem, LoadUnit } from '$lib/api/client';

	interface Props {
		item: SessionItem;
		onRemove: () => void;
		onMoveUp: (() => void) | null;
		onMoveDown: (() => void) | null;
	}

	let { item, onRemove, onMoveUp, onMoveDown }: Props = $props();

	const HAND_POSITIONS = ['3FD', 'HC', 'FC', 'OC'];
	const LOAD_UNITS: { value: LoadUnit; label: string }[] = [
		{ value: 'bw', label: 'BW' },
		{ value: 'percent_bw', label: '% BW' },
		{ value: 'kg', label: 'kg' },
		{ value: 'lbs', label: 'lbs' }
	];

	let perRep = $state(false);

	let uniformEdge = $state(20);
	let uniformLoadValue = $state(0);
	let uniformLoadUnit = $state<LoadUnit>('percent_bw');
	let uniformHandPos = $state('HC');

	function syncArraysToReps() {
		const n = item.reps ?? 1;
		if (!perRep) {
			item.edge_sizes_mm = [uniformEdge];
			item.loads = [{ value: uniformLoadValue, unit: uniformLoadUnit }];
			item.hand_positions = item.both_hands ? [[...Array(n).fill(uniformHandPos)]] : [[...Array(n).fill(uniformHandPos)], [...Array(n).fill(uniformHandPos)]];
		} else {
			const current_edge = item.edge_sizes_mm ?? [];
			const current_load = item.loads ?? [];
			item.edge_sizes_mm = Array.from({ length: n }, (_, i) => current_edge[i] ?? uniformEdge);
			item.loads = Array.from({ length: n }, (_, i) => current_load[i] ?? { value: uniformLoadValue, unit: uniformLoadUnit });
			const hp = item.hand_positions ?? [];
			if (item.both_hands) {
				item.hand_positions = [Array.from({ length: n }, (_, i) => hp[0]?.[i] ?? uniformHandPos)];
			} else {
				item.hand_positions = [
					Array.from({ length: n }, (_, i) => hp[0]?.[i] ?? uniformHandPos),
					Array.from({ length: n }, (_, i) => hp[1]?.[i] ?? uniformHandPos)
				];
			}
		}
	}

	function togglePerRep() {
		perRep = !perRep;
		syncArraysToReps();
	}

	function onRepsChange() {
		syncArraysToReps();
	}

	$effect(() => {
		if (!item.both_hands) {
			item.both_hands = true;
		}
		if (!item.reps) item.reps = 6;
		if (!item.cycles) item.cycles = 3;
		if (!item.hb_worktime_seconds) item.hb_worktime_seconds = 7;
		if (!item.rest_seconds) item.rest_seconds = 3;
		if (!item.cycle_rest_seconds) item.cycle_rest_seconds = 180;
		syncArraysToReps();
	});
</script>

<div class="border border-black bg-white">
	<div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
		<span
			class="shrink-0 px-1.5 py-0.5 text-white"
			style="font-family: monospace; font-size: 10px; font-weight: bold; background-color: #4A7C8C; letter-spacing: 0.5px;"
		>
			HB
		</span>
		<span class="flex-1 font-bold" style="font-family: monospace; font-size: 13px;">HANGBOARD</span>
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

	<div class="grid grid-cols-3 gap-px bg-gray-200">
		<div class="bg-white px-2 py-2 text-center">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">SETS</label>
			<input
				type="number"
				min="1"
				bind:value={item.cycles}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
			/>
		</div>
		<div class="bg-white px-2 py-2 text-center">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">REPS</label>
			<input
				type="number"
				min="1"
				bind:value={item.reps}
				oninput={onRepsChange}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
			/>
		</div>
		<div class="bg-white px-2 py-2 text-center">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">SET REST (s)</label>
			<input
				type="number"
				min="0"
				bind:value={item.cycle_rest_seconds}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
			/>
		</div>
		<div class="bg-white px-2 py-2 text-center">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">WORK (s)</label>
			<input
				type="number"
				min="1"
				bind:value={item.hb_worktime_seconds}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
			/>
		</div>
		<div class="bg-white px-2 py-2 text-center">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">REP REST (s)</label>
			<input
				type="number"
				min="0"
				bind:value={item.rest_seconds}
				class="w-full border-0 text-center outline-none"
				style="font-family: monospace; font-size: 13px;"
			/>
		</div>
		<div class="bg-white px-2 py-2 text-center">
			<label class="mb-1 block" style="font-family: monospace; font-size: 10px; color: #999;">BOTH HANDS</label>
			<button
				onclick={() => { item.both_hands = !item.both_hands; syncArraysToReps(); }}
				class="w-full border px-1 py-0.5 text-center transition-colors"
				style="font-family: monospace; font-size: 12px; border-color: {item.both_hands ? '#C6613F' : '#ccc'}; color: {item.both_hands ? '#C6613F' : '#999'};"
			>
				{item.both_hands ? 'YES' : 'NO'}
			</button>
		</div>
	</div>

	<div class="border-t border-gray-200 px-3 py-2">
		<div class="mb-2 flex items-center justify-between">
			<span style="font-family: monospace; font-size: 10px; color: #999;">REP PARAMETERS</span>
			<button
				onclick={togglePerRep}
				class="border px-2 py-0.5 transition-colors"
				style="font-family: monospace; font-size: 11px; border-color: {perRep ? '#C6613F' : '#ccc'}; color: {perRep ? '#C6613F' : '#999'};"
			>
				{perRep ? 'PER-REP ON' : 'PER-REP OFF'}
			</button>
		</div>

		{#if !perRep}
			<div class="grid grid-cols-3 gap-2">
				<div>
					<label class="mb-0.5 block" style="font-family: monospace; font-size: 10px; color: #999;">EDGE (mm)</label>
					<input
						type="number"
						min="1"
						bind:value={uniformEdge}
						oninput={syncArraysToReps}
						class="w-full border border-gray-300 px-2 py-1 text-center outline-none"
						style="font-family: monospace; font-size: 12px;"
					/>
				</div>
				<div>
					<label class="mb-0.5 block" style="font-family: monospace; font-size: 10px; color: #999;">LOAD</label>
					<div class="flex gap-1">
						<input
							type="number"
							min="0"
							bind:value={uniformLoadValue}
							oninput={syncArraysToReps}
							class="w-14 border border-gray-300 px-1 py-1 text-center outline-none"
							style="font-family: monospace; font-size: 12px;"
						/>
						<select
							bind:value={uniformLoadUnit}
							onchange={syncArraysToReps}
							class="flex-1 border border-gray-300 px-1 py-1 outline-none"
							style="font-family: monospace; font-size: 11px;"
						>
							{#each LOAD_UNITS as u}
								<option value={u.value}>{u.label}</option>
							{/each}
						</select>
					</div>
				</div>
				<div>
					<label class="mb-0.5 block" style="font-family: monospace; font-size: 10px; color: #999;">GRIP</label>
					<select
						bind:value={uniformHandPos}
						onchange={syncArraysToReps}
						class="w-full border border-gray-300 px-1 py-1 outline-none"
						style="font-family: monospace; font-size: 12px;"
					>
						{#each HAND_POSITIONS as p}
							<option value={p}>{p}</option>
						{/each}
					</select>
				</div>
			</div>
		{:else}
			<!-- Per-rep grid -->
			<div class="overflow-x-auto">
				<table class="w-full border-collapse" style="font-family: monospace; font-size: 11px;">
					<thead>
						<tr class="bg-gray-50">
							<th class="border border-gray-200 px-2 py-1 text-left font-medium" style="color: #999;">REP</th>
							<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">EDGE (mm)</th>
							<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">LOAD</th>
							<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">UNIT</th>
							{#if item.both_hands}
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">GRIP</th>
							{:else}
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">L GRIP</th>
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">R GRIP</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each Array.from({ length: item.reps ?? 1 }, (_, i) => i) as repIdx}
							<tr>
								<td class="border border-gray-200 px-2 py-1 text-center font-bold">{repIdx + 1}</td>
								<td class="border border-gray-200 px-1 py-1">
									<input
										type="number"
										min="1"
										bind:value={item.edge_sizes_mm![repIdx]}
										class="w-full border-0 text-center outline-none"
										style="font-family: monospace; font-size: 11px;"
									/>
								</td>
								<td class="border border-gray-200 px-1 py-1">
									<input
										type="number"
										min="0"
										bind:value={item.loads![repIdx].value}
										class="w-full border-0 text-center outline-none"
										style="font-family: monospace; font-size: 11px;"
									/>
								</td>
								<td class="border border-gray-200 px-1 py-1">
									<select
										bind:value={item.loads![repIdx].unit}
										class="w-full border-0 outline-none"
										style="font-family: monospace; font-size: 11px;"
									>
										{#each LOAD_UNITS as u}
											<option value={u.value}>{u.label}</option>
										{/each}
									</select>
								</td>
								{#if item.both_hands}
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.hand_positions![0][repIdx]}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 11px;"
										>
											{#each HAND_POSITIONS as p}
												<option value={p}>{p}</option>
											{/each}
										</select>
									</td>
								{:else}
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.hand_positions![0][repIdx]}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 11px;"
										>
											{#each HAND_POSITIONS as p}
												<option value={p}>{p}</option>
											{/each}
										</select>
									</td>
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.hand_positions![1][repIdx]}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 11px;"
										>
											{#each HAND_POSITIONS as p}
												<option value={p}>{p}</option>
											{/each}
										</select>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
