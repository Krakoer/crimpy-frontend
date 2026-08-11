<script lang="ts">
	import type { TrainingItem, LoadUnit, Load } from '$lib/api/client';
	import { getContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import { HANGBOARD_LOAD_UNITS } from './load-units';
	import AssessmentRefFields from './AssessmentRefFields.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { assessmentTypesForField } from '$lib/assessments';
	import {
		HANGBOARD_GRANULARITIES,
		HANGBOARD_HANDS,
		hangboardGranularity,
		hangboardHand,
		hangboardHandCount,
		hangboardReps,
		hangboardRowCount,
		hangboardSets,
		isTwoHandedMode,
		saneCount,
		type HangboardGranularity,
		type HangboardHand
	} from './hangboard-granularity';

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

	const GRANULARITIES = HANGBOARD_GRANULARITIES;

	const LOAD_ASSESSMENTS = assessmentTypesForField('load');

	// Every assessment-relative load of an item shares one assessment and one
	// fallback: only the percentage varies from rep to rep, so the per-rep grid
	// keeps a single column per load.
	// Both hands share that assessment and fallback, so the loads of either hand
	// are driven by the same pair of fields and must be kept in step together.
	let assessmentLoads = $derived([...(item.loads ?? []), ...(item.left_loads ?? [])]);
	const firstAssessmentLoad = [...(item.loads ?? []), ...(item.left_loads ?? [])].find(
		(l) => l.unit === 'percent_assessment'
	);

	let loadAssessmentType = $state(firstAssessmentLoad?.assessment_type ?? LOAD_ASSESSMENTS[0]);
	let loadFallbackKg = $state(firstAssessmentLoad?.fallback ?? 0);

	let usesAssessmentLoad = $derived(assessmentLoads.some((l) => l.unit === 'percent_assessment'));

	$effect(() => {
		for (const load of assessmentLoads) {
			if (load.unit === 'percent_assessment') {
				load.assessment_type = loadAssessmentType;
				load.fallback = loadFallbackKg;
			} else if (load.assessment_type !== undefined) {
				load.assessment_type = undefined;
				load.fallback = undefined;
			}
		}
	});

	if (!item.hand) item.hand = 'both';
	if (!item.granularity) item.granularity = hangboardGranularity(item);
	if (!item.reps) item.reps = 6;
	if (!item.cycles) item.cycles = 3;
	if (!item.worktime_seconds) item.worktime_seconds = 7;
	if (!item.rest_seconds) item.rest_seconds = 3;
	if (!item.cycle_rest_seconds) item.cycle_rest_seconds = 180;

	const initialGranularity = hangboardGranularity(item);
	let granularity = $state<HangboardGranularity>(initialGranularity);

	// Index of each hand inside hand_positions, which stores the left hand first.
	const LEFT = 0;
	const RIGHT = 1;

	let uniformEdge = $state(item.edge_sizes_mm?.[0] ?? 20);
	// loads is the right hand of a two-handed mode and the only load otherwise,
	// so the primary uniform fields always feed it.
	let uniformLoadValue = $state(item.loads?.[0]?.value ?? 0);
	let uniformLoadUnit = $state<LoadUnit>(item.loads?.[0]?.unit ?? 'percent_bw');
	let uniformLoadValueL = $state(item.left_loads?.[0]?.value ?? item.loads?.[0]?.value ?? 0);
	let uniformLoadUnitL = $state<LoadUnit>(
		item.left_loads?.[0]?.unit ?? item.loads?.[0]?.unit ?? 'percent_bw'
	);
	let uniformHandPos = $state(
		item.hand_positions?.[isTwoHandedMode(hangboardHand(item)) ? RIGHT : LEFT]?.[0] ?? 'HC'
	);

	// Layout the stored arrays were built for, so a rebuild can read every value
	// back by its (set, rep) coordinates rather than by raw index.
	let layout = {
		granularity: initialGranularity,
		reps: hangboardReps(item),
		sets: hangboardSets(item),
		twoHanded: isTwoHandedMode(hangboardHand(item))
	};

	// The API validates each configuration array on its own and accepts an absent
	// one, so an item can arrive with any of them missing or sized for another
	// layout. The editor indexes all of them by row, so it normalises whatever it
	// is handed before rendering rather than trusting the stored shape.
	function isNormalized(): boolean {
		const rows = hangboardRowCount(item, granularity);
		const hand = hangboardHand(item);
		if (item.edge_sizes_mm?.length !== rows) return false;
		if (item.loads?.length !== rows) return false;
		if (isTwoHandedMode(hand)) {
			if (item.left_loads?.length !== rows) return false;
		} else if (item.left_loads) {
			return false;
		}
		const grips = item.hand_positions;
		if (grips?.length !== hangboardHandCount(hand)) return false;
		return grips.every((perHand) => perHand?.length === rows);
	}

	untrack(() => {
		if (!isNormalized()) rebuild(granularity);
	});

	function rebuild(next: HangboardGranularity) {
		const reps = hangboardReps(item);
		const sets = hangboardSets(item);
		const twoHanded = isTwoHandedMode(hangboardHand(item));
		const prev = layout;
		const prevEdges = item.edge_sizes_mm ?? [];
		const prevLoads = item.loads ?? [];
		const prevLeftLoads = item.left_loads ?? [];
		const prevGrips = item.hand_positions ?? [];

		const prevIndex = (s: number, r: number) => {
			if (prev.granularity === 'uniform') return 0;
			const rep = Math.min(r, prev.reps - 1);
			if (prev.granularity === 'rep') return rep;
			return Math.min(s, prev.sets - 1) * prev.reps + rep;
		};
		// A mode that used to share one load between the hands keeps feeding both
		// of them from loads, so switching to a split configuration starts from
		// the value that was already there.
		const prevLoad = (s: number, r: number, hand: number) => {
			const i = prevIndex(s, r);
			if (hand === LEFT && prev.twoHanded) return prevLeftLoads[i] ?? prevLoads[i];
			return prevLoads[i];
		};
		const prevGrip = (s: number, r: number, hand: number) =>
			(prevGrips[hand] ?? prevGrips[0])?.[prevIndex(s, r)];
		const defaultLoad = (hand: number): Load =>
			hand === LEFT
				? { value: uniformLoadValueL, unit: uniformLoadUnitL }
				: { value: uniformLoadValue, unit: uniformLoadUnit };

		const rows = next === 'uniform' ? 1 : next === 'set' ? sets * reps : reps;
		const coord = (i: number): [number, number] =>
			next === 'uniform' ? [0, 0] : next === 'set' ? [Math.floor(i / reps), i % reps] : [0, i];

		item.edge_sizes_mm = Array.from({ length: rows }, (_, i) => {
			const [s, r] = coord(i);
			return prevEdges[prevIndex(s, r)] ?? uniformEdge;
		});
		item.loads = Array.from({ length: rows }, (_, i) => {
			const [s, r] = coord(i);
			return { ...(prevLoad(s, r, RIGHT) ?? defaultLoad(RIGHT)) };
		});
		item.left_loads = twoHanded
			? Array.from({ length: rows }, (_, i) => {
					const [s, r] = coord(i);
					return { ...(prevLoad(s, r, LEFT) ?? defaultLoad(LEFT)) };
				})
			: undefined;
		item.hand_positions = Array.from(
			{ length: hangboardHandCount(hangboardHand(item)) },
			(_, hand) =>
				Array.from({ length: rows }, (_, i) => {
					const [s, r] = coord(i);
					return prevGrip(s, r, hand) ?? uniformHandPos;
				})
		);

		layout = { granularity: next, reps, sets, twoHanded };
		granularity = next;
		item.granularity = next;
	}

	// Downgrading to uniform replaces every row with the uniform fields, which
	// were captured at mount: seed them from the first row so the value left
	// behind is the one the coach was looking at.
	function seedUniformFromFirstRow() {
		uniformEdge = item.edge_sizes_mm?.[0] ?? uniformEdge;
		const primary = item.loads?.[0];
		if (primary) {
			uniformLoadValue = primary.value;
			uniformLoadUnit = primary.unit;
		}
		// A mode that shared one load between the hands has no left row to read, so
		// the left field starts from the shared value rather than a stale one.
		const left = item.left_loads?.[0] ?? item.loads?.[0];
		if (left) {
			uniformLoadValueL = left.value;
			uniformLoadUnitL = left.unit;
		}
		uniformHandPos = item.hand_positions?.[handGripIndex]?.[0] ?? uniformHandPos;
	}

	function setGranularity(next: HangboardGranularity) {
		if (next === granularity) return;
		if (next === 'uniform') seedUniformFromFirstRow();
		rebuild(next);
	}

	// Keep the legacy item-level flag in sync for older clients: an item counts
	// as "max effort" only when every rep of every hand is set to max.
	$effect(() => {
		const loads = [...(item.loads ?? []), ...(item.left_loads ?? [])];
		item.load_is_max = loads.length > 0 && loads.every((l) => l.unit === 'max');
	});

	// A number input holds intermediate values while being retyped: typing "12"
	// over a "3" goes through "1", and rebuilding then would truncate the grid
	// and lose every value in it. These fields are only committed to the item on
	// blur or Enter, which is when the grid is resized.
	let setsField = $state<number | null>(item.cycles ?? null);
	let repsField = $state<number | null>(item.reps ?? null);

	function commitSets() {
		const sets = saneCount(setsField);
		setsField = sets;
		if (sets === item.cycles) return;
		item.cycles = sets;
		if (granularity === 'set') rebuild(granularity);
	}

	function commitReps() {
		const reps = saneCount(repsField);
		repsField = reps;
		if (reps === item.reps) return;
		item.reps = reps;
		rebuild(granularity);
	}

	function setHand(next: HangboardHand) {
		if (next === item.hand) return;
		seedUniformFromFirstRow();
		item.hand = next;
		rebuild(granularity);
	}

	// A uniform item is exactly one row, and the uniform fields are that row. They
	// are written straight in: going through rebuild would read the row back over
	// the edit that just happened and discard it.
	function onUniformChange() {
		if (granularity !== 'uniform') return;
		item.edge_sizes_mm = [uniformEdge];
		item.loads = [{ value: uniformLoadValue, unit: uniformLoadUnit }];
		item.left_loads = twoHanded
			? [{ value: uniformLoadValueL, unit: uniformLoadUnitL }]
			: undefined;
		item.hand_positions = Array.from({ length: hangboardHandCount(hangboardHand(item)) }, () => [
			uniformHandPos
		]);
	}

	type RowSettings = {
		edge: number;
		grip: string;
		load: Load;
		loadLeft?: Load;
		gripLeft?: string;
	};

	let rowClipboard = $state<RowSettings | null>(null);
	let copiedRow = $state<number | null>(null);

	function captureRow(ri: number): RowSettings {
		return {
			edge: item.edge_sizes_mm![ri],
			grip: item.hand_positions![handGripIndex][ri],
			load: { ...item.loads![ri] },
			...(twoHanded
				? { loadLeft: { ...item.left_loads![ri] }, gripLeft: item.hand_positions![LEFT][ri] }
				: {})
		};
	}

	function applyRow(ri: number, src: RowSettings) {
		item.edge_sizes_mm![ri] = src.edge;
		item.hand_positions![handGripIndex][ri] = src.grip;
		item.loads![ri] = { ...src.load };
		if (twoHanded) {
			item.left_loads![ri] = { ...(src.loadLeft ?? src.load) };
			item.hand_positions![LEFT][ri] = src.gripLeft ?? src.grip;
		}
	}

	function copyRow(ri: number) {
		rowClipboard = captureRow(ri);
		copiedRow = ri;
	}

	function pasteRow(ri: number) {
		if (rowClipboard) applyRow(ri, rowClipboard);
	}

	let rowCount = $derived(hangboardRowCount(item, granularity));
	let repsPerSet = $derived(hangboardReps(item));
	let twoHanded = $derived(isTwoHandedMode(hangboardHand(item)));
	// Grips of the hand that loads feeds: the right one when the hands are
	// configured separately, the single shared array otherwise.
	let handGripIndex = $derived(twoHanded ? RIGHT : LEFT);
	let columnCount = $derived(twoHanded ? 9 : 6);
	// The hint describes the selected mode, so the radiogroup points at it and a
	// screen reader announces what the mode means, not just its label.
	const handHintId = `hangboard-hand-hint-${crypto.randomUUID()}`;
	let handHint = $derived(HANGBOARD_HANDS.find((h) => h.value === hangboardHand(item))?.hint ?? '');

	// Per-set rows belong to a set, so filling down stays inside it: propagating
	// across sets is what the set header button is for.
	function fillDownLimit(ri: number): number {
		if (granularity !== 'set') return rowCount;
		return (Math.floor(ri / repsPerSet) + 1) * repsPerSet;
	}

	let fillDownLabel = $derived(
		granularity === 'set'
			? 'Fill the rows below in this set with this one'
			: 'Fill all rows below with this one'
	);

	function fillDown(ri: number) {
		const src = captureRow(ri);
		rowClipboard = src;
		copiedRow = ri;
		for (let r = ri + 1; r < fillDownLimit(ri); r++) applyRow(r, src);
	}

	function fillSetsBelow(setIdx: number) {
		for (let s = setIdx + 1; s < hangboardSets(item); s++) {
			for (let r = 0; r < repsPerSet; r++)
				applyRow(s * repsPerSet + r, captureRow(setIdx * repsPerSet + r));
		}
	}

	let collapsedSummary = $derived.by(() => {
		const edge = item.edge_sizes_mm?.[0] ?? 20;
		const grip = item.hand_positions?.[handGripIndex]?.[0] ?? 'HC';
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
						aria-label="Sets"
						bind:value={setsField}
						onchange={commitSets}
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
						aria-label="Reps"
						bind:value={repsField}
						onchange={commitReps}
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
				<div style="display: flex; flex-direction: column; gap: 2px;">
					<span style={labelStyle}>HANDS</span>
					<div
						style="display: flex; gap: 3px;"
						role="radiogroup"
						aria-label="Hands"
						aria-describedby={handHintId}
					>
						{#each HANGBOARD_HANDS as h (h.value)}
							<button
								onclick={() => setHand(h.value)}
								title={h.hint}
								role="radio"
								aria-checked={hangboardHand(item) === h.value}
								style="
									padding: 5px 9px; border-radius: 5px;
									border: 1px solid {hangboardHand(item) === h.value ? HB_COLOR : 'var(--bd)'};
									background: {hangboardHand(item) === h.value ? HB_COLOR + '18' : '#fff'};
									color: {hangboardHand(item) === h.value ? HB_COLOR : 'var(--tx3)'};
									font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);
								">{h.label}</button
							>
						{/each}
					</div>
				</div>
			</div>

			<div id={handHintId} style="font-size: 11px; color: var(--tx3); margin-bottom: 14px;">
				{handHint}
			</div>

			<!-- Row 2: config granularity + uniform or per-row grid -->
			<div
				style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;"
			>
				<span style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
					>CONFIG GRANULARITY</span
				>
				<div style="display: flex; gap: 4px;">
					{#each GRANULARITIES as g (g.value)}
						<button
							onclick={() => setGranularity(g.value)}
							style="
								padding: 3px 10px; font-size: 11px; font-weight: 600;
								border-radius: 999px; border: 1px solid {granularity === g.value ? HB_COLOR : 'var(--bd)'};
								background: {granularity === g.value ? HB_COLOR + '15' : '#fff'};
								color: {granularity === g.value ? HB_COLOR : 'var(--tx3)'};
								cursor: pointer; font-family: var(--font);
							">{g.label}</button
						>
					{/each}
				</div>
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

			{#if granularity === 'uniform'}
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
						{#if !twoHanded}
							<div style="display: flex; gap: 4px;">
								{#if uniformLoadUnit !== 'max'}
									<input
										type="number"
										min="0"
										aria-label="Load"
										bind:value={uniformLoadValue}
										oninput={onUniformChange}
										style="width: 56px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
									/>
								{/if}
								<select
									aria-label="Load unit"
									bind:value={uniformLoadUnit}
									onchange={onUniformChange}
									style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
								>
									{#each HANGBOARD_LOAD_UNITS as u (u.value)}<option value={u.value}
											>{u.label}</option
										>{/each}
								</select>
							</div>
						{:else}
							<div style="display: flex; flex-direction: column; gap: 3px;">
								<div style="display: flex; align-items: center; gap: 4px;">
									<span style="font-size: 10px; color: var(--tx3); width: 10px;">L</span>
									{#if uniformLoadUnitL !== 'max'}
										<input
											type="number"
											min="0"
											aria-label="Left load"
											bind:value={uniformLoadValueL}
											oninput={onUniformChange}
											style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
										/>
									{/if}
									<select
										aria-label="Left load unit"
										bind:value={uniformLoadUnitL}
										onchange={onUniformChange}
										style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
									>
										{#each HANGBOARD_LOAD_UNITS as u (u.value)}<option value={u.value}
												>{u.label}</option
											>{/each}
									</select>
								</div>
								<div style="display: flex; align-items: center; gap: 4px;">
									<span style="font-size: 10px; color: var(--tx3); width: 10px;">R</span>
									{#if uniformLoadUnit !== 'max'}
										<input
											type="number"
											min="0"
											aria-label="Right load"
											bind:value={uniformLoadValue}
											oninput={onUniformChange}
											style="width: 52px; padding: 5px 4px; text-align: center; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff;"
										/>
									{/if}
									<select
										aria-label="Right load unit"
										bind:value={uniformLoadUnit}
										onchange={onUniformChange}
										style="padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;"
									>
										{#each HANGBOARD_LOAD_UNITS as u (u.value)}<option value={u.value}
												>{u.label}</option
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
					{#if granularity === 'set'}
						Copy a row, then paste it onto another, or fill the rows below it in the same set. Each
						set is configured on its own; use the set header to copy a whole set into the ones
						below.
					{:else}
						Copy a row, then paste it onto another, or fill all rows below it.
					{/if}
				</div>
				<div style="overflow-x: auto;">
					<table class="hb-table" style="--hb: {HB_COLOR};">
						<thead>
							<tr>
								<th class="hb-rep-col">Rep</th>
								<th>Edge<span class="hb-unit">mm</span></th>
								{#if !twoHanded}
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
							{#each Array.from({ length: rowCount }, (_, i) => i) as ri (ri)}
								{#if granularity === 'set' && ri % repsPerSet === 0}
									<tr class="hb-set-row">
										<td class="hb-set-cell" colspan={columnCount}>
											<span>Set {ri / repsPerSet + 1}</span>
											{#if ri + repsPerSet < rowCount}
												<button
													type="button"
													class="hb-act-btn"
													title="Copy this set into the sets below"
													aria-label="Copy this set into the sets below"
													onclick={() => fillSetsBelow(ri / repsPerSet)}
												>
													<Icon name="arrow-down" size={13} color="currentColor" />
												</button>
											{/if}
										</td>
									</tr>
								{/if}
								<tr class:hb-copied={copiedRow === ri}>
									<td class="hb-rep">{(ri % repsPerSet) + 1}</td>
									<td>
										<input
											class="hb-in"
											type="number"
											min="1"
											bind:value={item.edge_sizes_mm![ri]}
										/>
									</td>
									{#if !twoHanded}
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
												{#each HANGBOARD_LOAD_UNITS as u (u.value)}<option value={u.value}
														>{u.label}</option
													>{/each}
											</select>
										</td>
										<td>
											<select class="hb-sel" bind:value={item.hand_positions![LEFT][ri]}>
												{#each HAND_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
											</select>
										</td>
									{:else}
										<td>
											{#if item.left_loads![ri].unit === 'max'}
												<span class="hb-max">MAX</span>
											{:else}
												<input
													class="hb-in"
													type="number"
													min="0"
													bind:value={item.left_loads![ri].value}
												/>
											{/if}
										</td>
										<td>
											<select class="hb-sel" bind:value={item.left_loads![ri].unit}>
												{#each HANGBOARD_LOAD_UNITS as u (u.value)}<option value={u.value}
														>{u.label}</option
													>{/each}
											</select>
										</td>
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
												{#each HANGBOARD_LOAD_UNITS as u (u.value)}<option value={u.value}
														>{u.label}</option
													>{/each}
											</select>
										</td>
										<td>
											<select class="hb-sel" bind:value={item.hand_positions![LEFT][ri]}>
												{#each HAND_POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
											</select>
										</td>
										<td>
											<select class="hb-sel" bind:value={item.hand_positions![RIGHT][ri]}>
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
											title={fillDownLabel}
											aria-label={fillDownLabel}
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

	.hb-set-row td {
		border-bottom: 1px solid var(--bd);
	}

	.hb-table tbody tr.hb-set-row:hover td {
		background: color-mix(in srgb, var(--hb) 8%, transparent);
	}

	.hb-set-cell {
		padding: 8px 8px 4px;
		background: color-mix(in srgb, var(--hb) 8%, transparent);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--hb);
	}

	.hb-set-cell span {
		margin-right: 8px;
		vertical-align: middle;
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
