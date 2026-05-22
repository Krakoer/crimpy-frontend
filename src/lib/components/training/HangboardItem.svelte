<script lang="ts">
	import type { TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
		onRemove: () => void;
	}

	let { item = $bindable(), onRemove }: Props = $props();

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	const HB_COLOR = '#4A7C8C';

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

	let perRep = $state((item.edge_sizes_mm?.length ?? 0) > 1);

	let uniformEdge = $state(item.edge_sizes_mm?.[0] ?? 20);
	let uniformLoadValue = $state(item.loads?.[0]?.value ?? 0);
	let uniformLoadUnit = $state<LoadUnit>(item.loads?.[0]?.unit ?? 'percent_bw');
	let uniformLoadValueR = $state(item.loads?.[1]?.value ?? item.loads?.[0]?.value ?? 0);
	let uniformLoadUnitR = $state<LoadUnit>(item.loads?.[1]?.unit ?? item.loads?.[0]?.unit ?? 'percent_bw');
	let uniformHandPos = $state(item.hand_positions?.[0]?.[0] ?? 'HC');

	if (item.both_hands === undefined) item.both_hands = true;
	if (!item.reps) item.reps = 6;
	if (!item.cycles) item.cycles = 3;
	if (!item.hb_worktime_seconds) item.hb_worktime_seconds = 7;
	if (!item.rest_seconds) item.rest_seconds = 3;
	if (!item.cycle_rest_seconds) item.cycle_rest_seconds = 180;
	untrack(() => {
		if (!item.edge_sizes_mm?.length) {
			item.edge_sizes_mm = [uniformEdge];
			item.loads = [{ value: uniformLoadValue, unit: uniformLoadUnit }];
			item.hand_positions = [Array.from({ length: item.reps ?? 1 }, () => uniformHandPos)];
		}
	});

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
				item.loads = Array.from({ length: n }, (_, i) => {
					const load = prev_load[i] ?? { value: uniformLoadValue, unit: uniformLoadUnit };
					return [load, { ...load }];
				}).flat();
			} else {
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

	let collapsedSummary = $derived.by(() => {
		const edge = item.edge_sizes_mm?.[0] ?? 20;
		const grip = item.hand_positions?.[0]?.[0] ?? 'HC';
		return `${item.cycles}x${item.reps} · ${item.hb_worktime_seconds}s on / ${item.rest_seconds}s off · ${edge}mm ${grip}`;
	});

	const inputStyle = 'width: 44px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;';
	const labelStyle = 'font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;';
</script>

<div style="background: #fff; border-radius: var(--rl); border: 1px solid color-mix(in srgb, {HB_COLOR} 30%, transparent); box-shadow: var(--sh); overflow: hidden;">
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed ? '#fff' : 'var(--panel2)'};"
		onclick={() => { if (!confirmDelete) collapsed = !collapsed; }}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && !confirmDelete && (collapsed = !collapsed)}
	>
		<div style="width: 4px; height: 20px; background: {HB_COLOR}; border-radius: 2px; flex-shrink: 0;"></div>
		<div style="transform: {collapsed ? 'rotate(0deg)' : 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;">
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span style="font-size: 13px; font-weight: 700; color: {HB_COLOR}; flex: 1; display: flex; align-items: center; gap: 8px;">
			Hangboard
			<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">{collapsedSummary}</span>
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
		<div style="border-top: 1px solid var(--bd2); padding: 14px 18px;">
			<!-- Row 1: sets x reps, work/rest, set rest, hands -->
			<div style="display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; align-items: flex-end;">
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>SETS</span>
					<input type="number" min="1" bind:value={item.cycles} onclick={(e) => e.stopPropagation()} style={inputStyle} />
				</div>
				<span style="font-size: 16px; color: var(--tx3); padding-bottom: 6px;">x</span>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>REPS</span>
					<input type="number" min="1" bind:value={item.reps} oninput={onRepsChange} onclick={(e) => e.stopPropagation()} style={inputStyle} />
				</div>
				<div style="width: 1px; height: 30px; background: var(--bd);"></div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>WORK</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input type="number" min="1" bind:value={item.hb_worktime_seconds} onclick={(e) => e.stopPropagation()} style={inputStyle} />
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>REP REST</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input type="number" min="0" bind:value={item.rest_seconds} onclick={(e) => e.stopPropagation()} style={inputStyle} />
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>SET REST</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input type="number" min="0" bind:value={item.cycle_rest_seconds} onclick={(e) => e.stopPropagation()} style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;" />
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
				<div style="width: 1px; height: 30px; background: var(--bd);"></div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>HANDS</span>
					<button
						onclick={onBothHandsToggle}
						style="
							padding: 5px 10px; border-radius: 5px;
							border: 1px solid {item.both_hands ? HB_COLOR : 'var(--bd)'};
							background: {item.both_hands ? HB_COLOR + '18' : '#fff'};
							color: {item.both_hands ? HB_COLOR : 'var(--tx3)'};
							font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);
						"
					>{item.both_hands ? 'Both' : 'L / R'}</button>
				</div>
			</div>

			<!-- Row 2: rep config toggle + uniform or per-rep -->
			<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
				<span style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;">REP CONFIG</span>
				<button
					onclick={togglePerRep}
					style="
						padding: 3px 10px; font-size: 11px; font-weight: 600;
						border-radius: 999px; border: 1px solid {perRep ? HB_COLOR : 'var(--bd)'};
						background: {perRep ? HB_COLOR + '15' : '#fff'};
						color: {perRep ? HB_COLOR : 'var(--tx3)'};
						cursor: pointer; font-family: var(--font);
					"
				>{perRep ? 'Per-rep ON' : 'Uniform'}</button>
			</div>

			{#if !perRep}
				<div style="display: flex; gap: 16px; flex-wrap: wrap;">
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<label for="hb-edge" style={labelStyle}>EDGE (mm)</label>
						<input id="hb-edge" type="number" min="1" bind:value={uniformEdge} oninput={onUniformChange}
							style="width: 64px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;" />
					</div>
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<span style={labelStyle}>LOAD</span>
						{#if item.both_hands}
							<div style="display: flex; gap: 4px;">
								<input type="number" min="0" bind:value={uniformLoadValue} oninput={onUniformChange}
									style="width: 56px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;" />
								<select bind:value={uniformLoadUnit} onchange={onUniformChange}
									style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;">
									{#each LOAD_UNITS as u}<option value={u.value}>{u.label}</option>{/each}
								</select>
							</div>
						{:else}
							<div style="display: flex; flex-direction: column; gap: 3px;">
								<div style="display: flex; align-items: center; gap: 4px;">
									<span style="font-size: 10px; color: var(--tx3); width: 10px;">L</span>
									<input type="number" min="0" bind:value={uniformLoadValue} oninput={onUniformChange}
										style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;" />
									<select bind:value={uniformLoadUnit} onchange={onUniformChange}
										style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;">
										{#each LOAD_UNITS as u}<option value={u.value}>{u.label}</option>{/each}
									</select>
								</div>
								<div style="display: flex; align-items: center; gap: 4px;">
									<span style="font-size: 10px; color: var(--tx3); width: 10px;">R</span>
									<input type="number" min="0" bind:value={uniformLoadValueR} oninput={onUniformChange}
										style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;" />
									<select bind:value={uniformLoadUnitR} onchange={onUniformChange}
										style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;">
										{#each LOAD_UNITS as u}<option value={u.value}>{u.label}</option>{/each}
									</select>
								</div>
							</div>
						{/if}
					</div>
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<label for="hb-grip" style={labelStyle}>GRIP</label>
						<select id="hb-grip" bind:value={uniformHandPos} onchange={onUniformChange}
							style="padding: 5px 8px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;">
							{#each HAND_POSITIONS as p}<option value={p}>{p}</option>{/each}
						</select>
					</div>
				</div>
			{:else}
				<div style="overflow-x: auto;">
					<table style="border-collapse: collapse; font-family: var(--font); font-size: 12px; min-width: 350px;">
						<thead>
							<tr>
								{#each (item.both_hands ? ['Rep', 'Edge (mm)', 'Load', 'Unit', 'Grip'] : ['Rep', 'Edge (mm)', 'L Load', 'L Unit', 'R Load', 'R Unit', 'L Grip', 'R Grip']) as h}
									<th style="padding: 5px 8px; background: var(--panel2); font-weight: 600; color: var(--tx3); text-align: center; font-size: 10px; letter-spacing: 0.04em; border: 1px solid var(--bd2);">{h}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each Array.from({ length: item.reps ?? 1 }, (_, i) => i) as ri}
								<tr>
									<td style="padding: 4px 6px; text-align: center; font-weight: 700; color: var(--tx); border: 1px solid var(--bd2);">{ri + 1}</td>
									<td style="padding: 2px; border: 1px solid var(--bd2);">
										<input type="number" min="1" bind:value={item.edge_sizes_mm![ri]}
											style="width: 100%; padding: 4px 2px; text-align: center; border: none; outline: none; font-family: var(--font); font-size: 12px;" />
									</td>
									{#if item.both_hands}
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<input type="number" min="0" bind:value={item.loads![ri].value}
												style="width: 100%; padding: 4px 2px; text-align: center; border: none; outline: none; font-family: var(--font); font-size: 12px;" />
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<select bind:value={item.loads![ri].unit} style="width: 100%; border: none; outline: none; font-family: var(--font); font-size: 11px;">
												{#each LOAD_UNITS as u}<option value={u.value}>{u.label}</option>{/each}
											</select>
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<select bind:value={item.hand_positions![0][ri]} style="width: 100%; border: none; outline: none; font-family: var(--font); font-size: 11px;">
												{#each HAND_POSITIONS as p}<option value={p}>{p}</option>{/each}
											</select>
										</td>
									{:else}
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<input type="number" min="0" bind:value={item.loads![2 * ri].value}
												style="width: 100%; padding: 4px 2px; text-align: center; border: none; outline: none; font-family: var(--font); font-size: 12px;" />
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<select bind:value={item.loads![2 * ri].unit} style="width: 100%; border: none; outline: none; font-family: var(--font); font-size: 11px;">
												{#each LOAD_UNITS as u}<option value={u.value}>{u.label}</option>{/each}
											</select>
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<input type="number" min="0" bind:value={item.loads![2 * ri + 1].value}
												style="width: 100%; padding: 4px 2px; text-align: center; border: none; outline: none; font-family: var(--font); font-size: 12px;" />
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<select bind:value={item.loads![2 * ri + 1].unit} style="width: 100%; border: none; outline: none; font-family: var(--font); font-size: 11px;">
												{#each LOAD_UNITS as u}<option value={u.value}>{u.label}</option>{/each}
											</select>
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<select bind:value={item.hand_positions![0][ri]} style="width: 100%; border: none; outline: none; font-family: var(--font); font-size: 11px;">
												{#each HAND_POSITIONS as p}<option value={p}>{p}</option>{/each}
											</select>
										</td>
										<td style="padding: 2px; border: 1px solid var(--bd2);">
											<select bind:value={item.hand_positions![1][ri]} style="width: 100%; border: none; outline: none; font-family: var(--font); font-size: 11px;">
												{#each HAND_POSITIONS as p}<option value={p}>{p}</option>{/each}
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
	{/if}
</div>
