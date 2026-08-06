<script lang="ts">
	import type { TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import AssessmentRefFields from './AssessmentRefFields.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { assessmentTypesForField } from '$lib/assessments';

	interface Props {
		item: TrainingItem;
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), onRemove, onDuplicate }: Props = $props();

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	const HB_COLOR = '#4A7C8C';

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(
		COLLAPSE_KEY
	);

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
		{ value: 'lbs', label: 'lbs' },
		{ value: 'max', label: 'Max' },
		{ value: 'percent_assessment', label: '% assess' }
	];

	const LOAD_ASSESSMENTS = assessmentTypesForField('load');

	// Every assessment-relative load of an item shares one assessment and one
	// fallback: only the percentage varies from rep to rep, so the per-rep grid
	// keeps a single column per load.
	let loadAssessmentType = $state(
		item.loads?.find((l) => l.unit === 'percent_assessment')?.assessment_type ?? LOAD_ASSESSMENTS[0]
	);
	let loadFallbackKg = $state(
		item.loads?.find((l) => l.unit === 'percent_assessment')?.fallback ?? 0
	);

	let usesAssessmentLoad = $derived(
		(item.loads ?? []).some((l) => l.unit === 'percent_assessment')
	);

	$effect(() => {
		for (const load of item.loads ?? []) {
			if (load.unit === 'percent_assessment') {
				load.assessment_type = loadAssessmentType;
				load.fallback = loadFallbackKg;
			} else if (load.assessment_type !== undefined) {
				load.assessment_type = undefined;
				load.fallback = undefined;
			}
		}
	});

	let perRep = $state((item.edge_sizes_mm?.length ?? 0) > 1);

	let uniformEdge = $state(item.edge_sizes_mm?.[0] ?? 20);
	let uniformLoadValue = $state(item.loads?.[0]?.value ?? 0);
	let uniformLoadUnit = $state<LoadUnit>(item.loads?.[0]?.unit ?? 'percent_bw');
	let uniformLoadValueR = $state(item.loads?.[1]?.value ?? item.loads?.[0]?.value ?? 0);
	let uniformLoadUnitR = $state<LoadUnit>(
		item.loads?.[1]?.unit ?? item.loads?.[0]?.unit ?? 'percent_bw'
	);
	let uniformHandPos = $state(item.hand_positions?.[0]?.[0] ?? 'HC');

	if (!item.hand) item.hand = 'both';
	if (!item.reps) item.reps = 6;
	if (!item.cycles) item.cycles = 3;
	if (!item.worktime_seconds) item.worktime_seconds = 7;
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
			if (item.hand !== 'split') {
				item.loads = [{ value: uniformLoadValue, unit: uniformLoadUnit }];
			} else {
				item.loads = [
					{ value: uniformLoadValue, unit: uniformLoadUnit },
					{ value: uniformLoadValueR, unit: uniformLoadUnitR }
				];
			}
			if (item.hand !== 'split') {
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
			if (item.hand !== 'split') {
				item.loads = Array.from(
					{ length: n },
					(_, i) => prev_load[i] ?? { value: uniformLoadValue, unit: uniformLoadUnit }
				);
				item.hand_positions = [
					Array.from({ length: n }, (_, i) => prev_hp[0]?.[i] ?? uniformHandPos)
				];
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

	// Keep the legacy item-level flag in sync for older clients: an item counts
	// as "max effort" only when every rep is set to max.
	$effect(() => {
		const loads = item.loads ?? [];
		item.load_is_max = loads.length > 0 && loads.every((l) => l.unit === 'max');
	});

	function onRepsChange() {
		resizeArraysToReps();
	}

	function onBothHandsToggle() {
		const n = item.reps ?? 1;
		if (perRep) {
			const prev_load = item.loads ?? [];
			if (item.hand !== 'split') {
				item.loads = Array.from({ length: n }, (_, i) => {
					const load = prev_load[i] ?? { value: uniformLoadValue, unit: uniformLoadUnit };
					return [load, { ...load }];
				}).flat();
			} else {
				item.loads = Array.from(
					{ length: n },
					(_, i) => prev_load[2 * i] ?? { value: uniformLoadValue, unit: uniformLoadUnit }
				);
			}
		}
		item.hand = item.hand === 'split' ? 'both' : 'split';
		resizeArraysToReps();
	}

	function onUniformChange() {
		if (!perRep) resizeArraysToReps();
	}

	type RowSettings = {
		edge: number;
		grip: string;
		load: { value: number; unit: LoadUnit };
		loadR?: { value: number; unit: LoadUnit };
		gripR?: string;
	};

	let rowClipboard = $state<RowSettings | null>(null);
	let copiedRow = $state<number | null>(null);

	function captureRow(ri: number): RowSettings {
		const split = item.hand === 'split';
		return {
			edge: item.edge_sizes_mm![ri],
			grip: item.hand_positions![0][ri],
			load: { ...item.loads![split ? 2 * ri : ri] },
			...(split
				? { loadR: { ...item.loads![2 * ri + 1] }, gripR: item.hand_positions![1][ri] }
				: {})
		};
	}

	function applyRow(ri: number, src: RowSettings) {
		item.edge_sizes_mm![ri] = src.edge;
		item.hand_positions![0][ri] = src.grip;
		if (item.hand !== 'split') {
			item.loads![ri] = { ...src.load };
		} else {
			item.loads![2 * ri] = { ...src.load };
			item.loads![2 * ri + 1] = { ...(src.loadR ?? src.load) };
			item.hand_positions![1][ri] = src.gripR ?? src.grip;
		}
	}

	function copyRow(ri: number) {
		rowClipboard = captureRow(ri);
		copiedRow = ri;
	}

	function pasteRow(ri: number) {
		if (rowClipboard) applyRow(ri, rowClipboard);
	}

	function fillDown(ri: number) {
		const src = captureRow(ri);
		rowClipboard = src;
		copiedRow = ri;
		const n = item.reps ?? 1;
		for (let r = ri + 1; r < n; r++) applyRow(r, src);
	}

	let collapsedSummary = $derived.by(() => {
		const edge = item.edge_sizes_mm?.[0] ?? 20;
		const grip = item.hand_positions?.[0]?.[0] ?? 'HC';
		return `${item.cycles}x${item.reps} · ${item.worktime_seconds}s on / ${item.rest_seconds}s off · ${edge}mm ${grip}`;
	});

	const inputStyle =
		'width: 44px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;';
	const labelStyle =
		'font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;';
</script>

<div
	style="background: #fff; border-radius: var(--rl); border: 1px solid color-mix(in srgb, {HB_COLOR} 30%, transparent); box-shadow: var(--sh); overflow: hidden;"
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
			style="width: 4px; height: 20px; background: {HB_COLOR}; border-radius: 2px; flex-shrink: 0;"
		></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span
			style="font-size: 13px; font-weight: 700; color: {HB_COLOR}; flex: 1; display: flex; align-items: center; gap: 8px;"
		>
			Hangboard
			<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">{collapsedSummary}</span>
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
		<div style="border-top: 1px solid var(--bd2); padding: 14px 18px;">
			<!-- Row 1: sets x reps, work/rest, set rest, hands -->
			<div
				style="display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; align-items: flex-end;"
			>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>SETS</span>
					<input
						type="number"
						min="1"
						bind:value={item.cycles}
						onclick={(e) => e.stopPropagation()}
						style={inputStyle}
					/>
				</div>
				<span style="font-size: 16px; color: var(--tx3); padding-bottom: 6px;">x</span>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>REPS</span>
					<input
						type="number"
						min="1"
						bind:value={item.reps}
						oninput={onRepsChange}
						onclick={(e) => e.stopPropagation()}
						style={inputStyle}
					/>
				</div>
				<div style="width: 1px; height: 30px; background: var(--bd);"></div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>WORK</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input
							type="number"
							min="1"
							bind:value={item.worktime_seconds}
							onclick={(e) => e.stopPropagation()}
							style={inputStyle}
						/>
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>REP REST</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input
							type="number"
							min="0"
							bind:value={item.rest_seconds}
							onclick={(e) => e.stopPropagation()}
							style={inputStyle}
						/>
						<span style="font-size: 10px; color: var(--tx3);">s</span>
					</div>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style={labelStyle}>SET REST</span>
					<div style="display: flex; align-items: center; gap: 2px;">
						<input
							type="number"
							min="0"
							bind:value={item.cycle_rest_seconds}
							onclick={(e) => e.stopPropagation()}
							style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
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
							border: 1px solid {item.hand !== 'split' ? HB_COLOR : 'var(--bd)'};
							background: {item.hand !== 'split' ? HB_COLOR + '18' : '#fff'};
							color: {item.hand !== 'split' ? HB_COLOR : 'var(--tx3)'};
							font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);
						">{item.hand !== 'split' ? 'Both' : 'L / R'}</button
					>
				</div>
			</div>

			<!-- Row 2: rep config toggle + uniform or per-rep -->
			<div
				style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;"
			>
				<span style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
					>REP CONFIG</span
				>
				<button
					onclick={togglePerRep}
					style="
						padding: 3px 10px; font-size: 11px; font-weight: 600;
						border-radius: 999px; border: 1px solid {perRep ? HB_COLOR : 'var(--bd)'};
						background: {perRep ? HB_COLOR + '15' : '#fff'};
						color: {perRep ? HB_COLOR : 'var(--tx3)'};
						cursor: pointer; font-family: var(--font);
					">{perRep ? 'Per-rep ON' : 'Uniform'}</button
				>
			</div>

			{#if usesAssessmentLoad}
				<div
					style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px 10px; border-radius: var(--rs); background: var(--pr-fog);"
				>
					<span style="font-size: 11px; color: var(--tx2);">Loads set in percent</span>
					<AssessmentRefFields
						field="load"
						bind:assessmentType={loadAssessmentType}
						bind:fallback={loadFallbackKg}
						fallbackUnit="kg"
					/>
				</div>
			{/if}

			{#if !perRep}
				<div style="display: flex; gap: 16px; flex-wrap: wrap;">
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<label for="hb-edge" style={labelStyle}>EDGE (mm)</label>
						<input
							id="hb-edge"
							type="number"
							min="1"
							bind:value={uniformEdge}
							oninput={onUniformChange}
							style="width: 64px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
						/>
					</div>
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<span style={labelStyle}>LOAD</span>
						{#if item.hand !== 'split'}
							<div style="display: flex; gap: 4px;">
								{#if uniformLoadUnit !== 'max'}
									<input
										type="number"
										min="0"
										bind:value={uniformLoadValue}
										oninput={onUniformChange}
										style="width: 56px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
									/>
								{/if}
								<select
									bind:value={uniformLoadUnit}
									onchange={onUniformChange}
									style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
								>
									{#each LOAD_UNITS as u (u.value)}<option value={u.value}>{u.label}</option>{/each}
								</select>
							</div>
						{:else}
							<div style="display: flex; flex-direction: column; gap: 3px;">
								<div style="display: flex; align-items: center; gap: 4px;">
									<span style="font-size: 10px; color: var(--tx3); width: 10px;">L</span>
									{#if uniformLoadUnit !== 'max'}
										<input
											type="number"
											min="0"
											bind:value={uniformLoadValue}
											oninput={onUniformChange}
											style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
										/>
									{/if}
									<select
										bind:value={uniformLoadUnit}
										onchange={onUniformChange}
										style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
									>
										{#each LOAD_UNITS as u (u.value)}<option value={u.value}>{u.label}</option
											>{/each}
									</select>
								</div>
								<div style="display: flex; align-items: center; gap: 4px;">
									<span style="font-size: 10px; color: var(--tx3); width: 10px;">R</span>
									{#if uniformLoadUnitR !== 'max'}
										<input
											type="number"
											min="0"
											bind:value={uniformLoadValueR}
											oninput={onUniformChange}
											style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
										/>
									{/if}
									<select
										bind:value={uniformLoadUnitR}
										onchange={onUniformChange}
										style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
									>
										{#each LOAD_UNITS as u (u.value)}<option value={u.value}>{u.label}</option
											>{/each}
									</select>
								</div>
							</div>
						{/if}
					</div>
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<label for="hb-grip" style={labelStyle}>GRIP</label>
						<select
							id="hb-grip"
							bind:value={uniformHandPos}
							onchange={onUniformChange}
							style="padding: 5px 8px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
						>
							{#each HAND_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
						</select>
					</div>
				</div>
			{:else}
				<div class="hb-rep-hint">
					Copy a row, then paste it onto another, or fill all rows below it.
				</div>
				<div style="overflow-x: auto;">
					<table class="hb-table" style="--hb: {HB_COLOR};">
						<thead>
							<tr>
								<th class="hb-rep-col">Rep</th>
								<th>Edge<span class="hb-unit">mm</span></th>
								{#if item.hand !== 'split'}
									<th>Load</th>
									<th>Unit</th>
									<th>Grip</th>
								{:else}
									<th>L Load</th>
									<th>L Unit</th>
									<th>R Load</th>
									<th>R Unit</th>
									<th>L Grip</th>
									<th>R Grip</th>
								{/if}
								<th class="hb-act-col"></th>
							</tr>
						</thead>
						<tbody>
							{#each Array.from({ length: item.reps ?? 1 }, (_, i) => i) as ri (ri)}
								<tr class:hb-copied={copiedRow === ri}>
									<td class="hb-rep">{ri + 1}</td>
									<td>
										<input
											class="hb-in"
											type="number"
											min="1"
											bind:value={item.edge_sizes_mm![ri]}
										/>
									</td>
									{#if item.hand !== 'split'}
										<td>
											{#if item.loads![ri].unit === 'max'}
												<span class="hb-max">MAX</span>
											{:else}
												<input
													class="hb-in"
													type="number"
													min="0"
													bind:value={item.loads![ri].value}
												/>
											{/if}
										</td>
										<td>
											<select class="hb-sel" bind:value={item.loads![ri].unit}>
												{#each LOAD_UNITS as u (u.value)}<option value={u.value}>{u.label}</option
													>{/each}
											</select>
										</td>
										<td>
											<select class="hb-sel" bind:value={item.hand_positions![0][ri]}>
												{#each HAND_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
											</select>
										</td>
									{:else}
										<td>
											{#if item.loads![2 * ri].unit === 'max'}
												<span class="hb-max">MAX</span>
											{:else}
												<input
													class="hb-in"
													type="number"
													min="0"
													bind:value={item.loads![2 * ri].value}
												/>
											{/if}
										</td>
										<td>
											<select class="hb-sel" bind:value={item.loads![2 * ri].unit}>
												{#each LOAD_UNITS as u (u.value)}<option value={u.value}>{u.label}</option
													>{/each}
											</select>
										</td>
										<td>
											{#if item.loads![2 * ri + 1].unit === 'max'}
												<span class="hb-max">MAX</span>
											{:else}
												<input
													class="hb-in"
													type="number"
													min="0"
													bind:value={item.loads![2 * ri + 1].value}
												/>
											{/if}
										</td>
										<td>
											<select class="hb-sel" bind:value={item.loads![2 * ri + 1].unit}>
												{#each LOAD_UNITS as u (u.value)}<option value={u.value}>{u.label}</option
													>{/each}
											</select>
										</td>
										<td>
											<select class="hb-sel" bind:value={item.hand_positions![0][ri]}>
												{#each HAND_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
											</select>
										</td>
										<td>
											<select class="hb-sel" bind:value={item.hand_positions![1][ri]}>
												{#each HAND_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
											</select>
										</td>
									{/if}
									<td class="hb-act">
										<button
											type="button"
											class="hb-act-btn"
											class:hb-on={copiedRow === ri}
											title="Copy this row"
											aria-label="Copy this row"
											onclick={() => copyRow(ri)}
										>
											<Icon name="copy" size={13} color="currentColor" />
										</button>
										<button
											type="button"
											class="hb-act-btn"
											disabled={rowClipboard === null}
											title="Paste onto this row"
											aria-label="Paste onto this row"
											onclick={() => pasteRow(ri)}
										>
											<Icon name="paste" size={13} color="currentColor" />
										</button>
										<button
											type="button"
											class="hb-act-btn"
											title="Fill all rows below with this one"
											aria-label="Fill all rows below with this one"
											onclick={() => fillDown(ri)}
										>
											<Icon name="arrow-down" size={13} color="currentColor" />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.hb-rep-hint {
		font-size: 11px;
		color: var(--tx3);
		margin-bottom: 10px;
	}

	.hb-table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		min-width: 360px;
		font-family: var(--font);
		font-size: 13px;
		color: var(--tx);
	}

	.hb-table th {
		padding: 6px 8px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--tx3);
		text-align: center;
		white-space: nowrap;
		border-bottom: 1px solid var(--bd);
	}

	.hb-table th .hb-unit {
		margin-left: 3px;
		font-weight: 500;
		text-transform: none;
		opacity: 0.7;
	}

	.hb-rep-col {
		width: 34px;
	}

	.hb-act-col {
		width: 92px;
	}

	.hb-table td {
		padding: 3px 4px;
		border-bottom: 1px solid var(--bd2);
		vertical-align: middle;
	}

	.hb-table tbody tr:last-child td {
		border-bottom: none;
	}

	.hb-table tbody tr:hover td {
		background: var(--panel2);
	}

	.hb-table tbody tr.hb-copied td {
		background: color-mix(in srgb, var(--hb) 10%, transparent);
	}

	.hb-rep {
		text-align: center;
		font-weight: 700;
		color: var(--tx2);
	}

	.hb-max {
		display: inline-block;
		width: 100%;
		text-align: center;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--hb);
	}

	.hb-in,
	.hb-sel {
		width: 100%;
		min-width: 44px;
		box-sizing: border-box;
		padding: 5px 4px;
		text-align: center;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		font-family: var(--font);
		font-size: 13px;
		color: var(--tx);
		outline: none;
		transition:
			border-color 0.12s,
			background 0.12s;
	}

	.hb-sel {
		cursor: pointer;
		font-size: 12px;
	}

	.hb-in:hover,
	.hb-sel:hover {
		background: #fff;
		border-color: var(--bd);
	}

	.hb-in:focus,
	.hb-sel:focus {
		background: #fff;
		border-color: var(--hb);
	}

	.hb-act {
		white-space: nowrap;
		text-align: center;
	}

	.hb-act-btn {
		width: 26px;
		height: 26px;
		margin: 0 1px;
		border-radius: 6px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx3);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		vertical-align: middle;
		transition:
			color 0.12s,
			border-color 0.12s,
			background 0.12s;
	}

	.hb-act-btn:hover:not(:disabled) {
		color: var(--hb);
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 8%, #fff);
	}

	.hb-act-btn.hb-on {
		color: var(--hb);
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, #fff);
	}

	.hb-act-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
