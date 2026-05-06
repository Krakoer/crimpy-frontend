<script lang="ts">
	import type { TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		item: TrainingItem;
		onRemove: () => void;
	}

	let { item = $bindable(), onRemove }: Props = $props();

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});

	const HAND_POSITIONS = ['3FD', 'HC', 'FC', 'OC'];
	const LOAD_UNITS: { value: LoadUnit; label: string }[] = [
		{ value: 'bw', label: 'BW' },
		{ value: 'percent_bw', label: '% BW' },
		{ value: 'kg', label: 'kg' },
		{ value: 'lbs', label: 'lbs' }
	];

	// Detect per-rep mode from edge array length only (loads can be 2 for per-hand without being per-rep)
	let perRep = $state((item.edge_sizes_mm?.length ?? 0) > 1);

	// Seed uniform controls from item's first element (or defaults)
	let uniformEdge = $state(item.edge_sizes_mm?.[0] ?? 20);
	let uniformLoadValue = $state(item.loads?.[0]?.value ?? 0);
	let uniformLoadUnit = $state<LoadUnit>(item.loads?.[0]?.unit ?? 'percent_bw');
	let uniformLoadValueR = $state(item.loads?.[1]?.value ?? item.loads?.[0]?.value ?? 0);
	let uniformLoadUnitR = $state<LoadUnit>(item.loads?.[1]?.unit ?? item.loads?.[0]?.unit ?? 'percent_bw');
	let uniformHandPos = $state(item.hand_positions?.[0]?.[0] ?? 'HC');

	// One-time initialization of scalar fields (runs synchronously, not in an effect)
	if (item.both_hands === undefined) item.both_hands = true;
	if (!item.reps) item.reps = 6;
	if (!item.cycles) item.cycles = 3;
	if (!item.hb_worktime_seconds) item.hb_worktime_seconds = 7;
	if (!item.rest_seconds) item.rest_seconds = 3;
	if (!item.cycle_rest_seconds) item.cycle_rest_seconds = 180;
	// Initialize arrays for brand-new items that have no data yet
	if (!item.edge_sizes_mm?.length) {
		item.edge_sizes_mm = [uniformEdge];
		item.loads = [{ value: uniformLoadValue, unit: uniformLoadUnit }];
		item.hand_positions = [Array.from({ length: item.reps }, () => uniformHandPos)];
	}

	function resizeArraysToReps() {
		const n = item.reps ?? 1;
		if (!perRep) {
			item.edge_sizes_mm = [uniformEdge];
			if (item.both_hands) {
				item.loads = [{ value: uniformLoadValue, unit: uniformLoadUnit }];
			} else {
				item.loads = [
					{ value: uniformLoadValue, unit: uniformLoadUnit },
					{ value: uniformLoadValueR, unit: uniformLoadUnitR }
				];
			}
			if (item.both_hands) {
				item.hand_positions = [Array.from({ length: n }, () => uniformHandPos)];
			} else {
				item.hand_positions = [
					Array.from({ length: n }, () => uniformHandPos),
					Array.from({ length: n }, () => uniformHandPos)
				];
			}
		} else {
			const prev_edge = item.edge_sizes_mm ?? [];
			const prev_load = item.loads ?? [];
			const prev_hp = item.hand_positions ?? [];
			item.edge_sizes_mm = Array.from({ length: n }, (_, i) => prev_edge[i] ?? uniformEdge);
			if (item.both_hands) {
				item.loads = Array.from({ length: n }, (_, i) => prev_load[i] ?? { value: uniformLoadValue, unit: uniformLoadUnit });
				item.hand_positions = [Array.from({ length: n }, (_, i) => prev_hp[0]?.[i] ?? uniformHandPos)];
			} else {
				item.loads = Array.from({ length: n }, (_, i) => [
					prev_load[2 * i] ?? { value: uniformLoadValue, unit: uniformLoadUnit },
					prev_load[2 * i + 1] ?? { value: uniformLoadValueR, unit: uniformLoadUnitR }
				]).flat();
				item.hand_positions = [
					Array.from({ length: n }, (_, i) => prev_hp[0]?.[i] ?? uniformHandPos),
					Array.from({ length: n }, (_, i) => prev_hp[1]?.[i] ?? uniformHandPos)
				];
			}
		}
	}

	function togglePerRep() {
		perRep = !perRep;
		resizeArraysToReps();
	}

	function onRepsChange() {
		resizeArraysToReps();
	}

	function onBothHandsToggle() {
		const n = item.reps ?? 1;
		if (perRep) {
			const prev_load = item.loads ?? [];
			if (item.both_hands) {
				// Switching to per-hand: interleave, duplicating each rep's load as the initial R value
				item.loads = Array.from({ length: n }, (_, i) => {
					const load = prev_load[i] ?? { value: uniformLoadValue, unit: uniformLoadUnit };
					return [load, { ...load }];
				}).flat();
			} else {
				// Switching back to both-hands: de-interleave, keeping L loads
				item.loads = Array.from({ length: n }, (_, i) =>
					prev_load[2 * i] ?? { value: uniformLoadValue, unit: uniformLoadUnit }
				);
			}
		}
		item.both_hands = !item.both_hands;
		resizeArraysToReps();
	}

	function onUniformChange() {
		if (!perRep) resizeArraysToReps();
	}
</script>

<div class="border border-black bg-white" style="border-left: 3px solid #4A7C8C; border-radius: 4px;">
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 15px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'V'}
		</button>
		{#if confirmDelete}
			<span class="flex-1 truncate" style="font-family: monospace; font-size: 13px; color: #B85450;">
				Delete hangboard?
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
			<span
				class="shrink-0 font-bold"
				style="font-family: monospace; font-size: 14px; color: #4A7C8C; letter-spacing: 0.5px;"
			>HANGBOARD</span>
			<div class="flex-1"></div>
			<button
				onclick={() => (confirmDelete = true)}
				class="border border-gray-200 px-2 py-0.5 text-gray-400 transition-colors hover:border-red-400 hover:text-red-500"
				style="font-family: monospace; font-size: 12px;"
			>
				del
			</button>
		{/if}
	</div>

	{#if !collapsed}
	<div class="border-t border-gray-100">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
			<div class="flex items-center gap-1.5">
				<span style="font-family: monospace; font-size: 14px; color: #999;">Sets</span>
				<input
					type="number"
					min="1"
					bind:value={item.cycles}
					class="w-10 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
					style="font-family: monospace; font-size: 14px;"
				/>
			</div>
			<span style="color: #ccc; font-size: 15px;">x</span>
			<div class="flex items-center gap-1.5">
				<span style="font-family: monospace; font-size: 14px; color: #999;">Reps</span>
				<input
					type="number"
					min="1"
					bind:value={item.reps}
					oninput={onRepsChange}
					class="w-10 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
					style="font-family: monospace; font-size: 14px;"
				/>
			</div>
			<div class="h-3 w-px bg-gray-200"></div>
			<div class="flex items-center gap-1.5">
				<span style="font-family: monospace; font-size: 14px; color: #999;">Work</span>
				<input
					type="number"
					min="1"
					bind:value={item.hb_worktime_seconds}
					class="w-10 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
					style="font-family: monospace; font-size: 14px;"
				/>
				<span style="font-family: monospace; font-size: 14px; color: #aaa;">s</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span style="font-family: monospace; font-size: 14px; color: #999;">Rep rest</span>
				<input
					type="number"
					min="0"
					bind:value={item.rest_seconds}
					class="w-10 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
					style="font-family: monospace; font-size: 14px;"
				/>
				<span style="font-family: monospace; font-size: 14px; color: #aaa;">s</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span style="font-family: monospace; font-size: 14px; color: #999;">Set rest</span>
				<input
					type="number"
					min="0"
					bind:value={item.cycle_rest_seconds}
					class="w-12 border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-black"
					style="font-family: monospace; font-size: 14px;"
				/>
				<span style="font-family: monospace; font-size: 14px; color: #aaa;">s</span>
			</div>
			<div class="h-3 w-px bg-gray-200"></div>
			<div class="flex items-center gap-1.5">
				<span style="font-family: monospace; font-size: 14px; color: #999;">Both hands</span>
				<button
					onclick={onBothHandsToggle}
					class="border px-2 py-0.5 text-center transition-colors"
					style="font-family: monospace; font-size: 15px; width: 2.6rem; border-color: {item.both_hands ? '#C6613F' : '#ddd'}; color: {item.both_hands ? '#C6613F' : '#aaa'};"
				>
					{item.both_hands ? 'yes' : 'no'}
				</button>
			</div>
		</div>

	<div class="border-t border-gray-200 px-3 py-2">
		<div class="mb-2 flex items-center justify-between">
			<span style="font-family: monospace; font-size: 14px; color: #999;">REP PARAMETERS</span>
			<button
				onclick={togglePerRep}
				class="border px-2 py-0.5 transition-colors"
				style="font-family: monospace; font-size: 15px; border-color: {perRep ? '#C6613F' : '#ccc'}; color: {perRep ? '#C6613F' : '#999'};"
			>
				{perRep ? 'PER-REP ON' : 'PER-REP OFF'}
			</button>
		</div>

		{#if !perRep}
			<div class="grid grid-cols-3 gap-2">
				<div>
					<label class="mb-0.5 block" style="font-family: monospace; font-size: 14px; color: #999;">EDGE (mm)</label>
					<input
						type="number"
						min="1"
						bind:value={uniformEdge}
						oninput={onUniformChange}
						class="w-full border border-gray-300 px-2 py-1 text-center outline-none"
						style="font-family: monospace; font-size: 14px;"
					/>
				</div>
				<div>
					<label class="mb-0.5 block" style="font-family: monospace; font-size: 14px; color: #999;">LOAD</label>
					{#if item.both_hands}
						<div class="flex gap-1">
							<input
								type="number"
								min="0"
								bind:value={uniformLoadValue}
								oninput={onUniformChange}
								class="w-14 border border-gray-300 px-1 py-1 text-center outline-none"
								style="font-family: monospace; font-size: 14px;"
							/>
							<select
								bind:value={uniformLoadUnit}
								onchange={onUniformChange}
								class="flex-1 border border-gray-300 px-1 py-1 outline-none"
								style="font-family: monospace; font-size: 15px;"
							>
								{#each LOAD_UNITS as u}
									<option value={u.value}>{u.label}</option>
								{/each}
							</select>
						</div>
					{:else}
						<div class="flex flex-col gap-1">
							<div class="flex items-center gap-1">
								<span style="font-family: monospace; font-size: 11px; color: #999; width: 10px;">L</span>
								<input
									type="number"
									min="0"
									bind:value={uniformLoadValue}
									oninput={onUniformChange}
									class="w-14 border border-gray-300 px-1 py-1 text-center outline-none"
									style="font-family: monospace; font-size: 14px;"
								/>
								<select
									bind:value={uniformLoadUnit}
									onchange={onUniformChange}
									class="flex-1 border border-gray-300 px-1 py-1 outline-none"
									style="font-family: monospace; font-size: 15px;"
								>
									{#each LOAD_UNITS as u}
										<option value={u.value}>{u.label}</option>
									{/each}
								</select>
							</div>
							<div class="flex items-center gap-1">
								<span style="font-family: monospace; font-size: 11px; color: #999; width: 10px;">R</span>
								<input
									type="number"
									min="0"
									bind:value={uniformLoadValueR}
									oninput={onUniformChange}
									class="w-14 border border-gray-300 px-1 py-1 text-center outline-none"
									style="font-family: monospace; font-size: 14px;"
								/>
								<select
									bind:value={uniformLoadUnitR}
									onchange={onUniformChange}
									class="flex-1 border border-gray-300 px-1 py-1 outline-none"
									style="font-family: monospace; font-size: 15px;"
								>
									{#each LOAD_UNITS as u}
										<option value={u.value}>{u.label}</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}
				</div>
				<div>
					<label class="mb-0.5 block" style="font-family: monospace; font-size: 14px; color: #999;">GRIP</label>
					<select
						bind:value={uniformHandPos}
						onchange={onUniformChange}
						class="w-full border border-gray-300 px-1 py-1 outline-none"
						style="font-family: monospace; font-size: 14px;"
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
				<table class="w-full border-collapse" style="font-family: monospace; font-size: 15px;">
					<thead>
						<tr class="bg-gray-50">
							<th class="border border-gray-200 px-2 py-1 text-left font-medium" style="color: #999;">REP</th>
							<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">EDGE (mm)</th>
							{#if item.both_hands}
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">LOAD</th>
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">UNIT</th>
							{:else}
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">L LOAD</th>
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">L UNIT</th>
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">R LOAD</th>
								<th class="border border-gray-200 px-2 py-1 text-center font-medium" style="color: #999;">R UNIT</th>
							{/if}
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
										style="font-family: monospace; font-size: 15px;"
									/>
								</td>
								{#if item.both_hands}
									<td class="border border-gray-200 px-1 py-1">
										<input
											type="number"
											min="0"
											bind:value={item.loads![repIdx].value}
											class="w-full border-0 text-center outline-none"
											style="font-family: monospace; font-size: 15px;"
										/>
									</td>
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.loads![repIdx].unit}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 15px;"
										>
											{#each LOAD_UNITS as u}
												<option value={u.value}>{u.label}</option>
											{/each}
										</select>
									</td>
								{:else}
									<td class="border border-gray-200 px-1 py-1">
										<input
											type="number"
											min="0"
											bind:value={item.loads![2 * repIdx].value}
											class="w-full border-0 text-center outline-none"
											style="font-family: monospace; font-size: 15px;"
										/>
									</td>
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.loads![2 * repIdx].unit}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 15px;"
										>
											{#each LOAD_UNITS as u}
												<option value={u.value}>{u.label}</option>
											{/each}
										</select>
									</td>
									<td class="border border-gray-200 px-1 py-1">
										<input
											type="number"
											min="0"
											bind:value={item.loads![2 * repIdx + 1].value}
											class="w-full border-0 text-center outline-none"
											style="font-family: monospace; font-size: 15px;"
										/>
									</td>
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.loads![2 * repIdx + 1].unit}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 15px;"
										>
											{#each LOAD_UNITS as u}
												<option value={u.value}>{u.label}</option>
											{/each}
										</select>
									</td>
								{/if}
								{#if item.both_hands}
									<td class="border border-gray-200 px-1 py-1">
										<select
											bind:value={item.hand_positions![0][repIdx]}
											class="w-full border-0 outline-none"
											style="font-family: monospace; font-size: 15px;"
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
											style="font-family: monospace; font-size: 15px;"
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
											style="font-family: monospace; font-size: 15px;"
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
	{/if}
</div>
