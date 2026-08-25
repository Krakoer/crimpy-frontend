<script lang="ts">
	import type { TrainingItem, Load, LoadUnit } from '$lib/api/client';
	import { untrack } from 'svelte';
	import { HANGBOARD_LOAD_UNITS, loadUnitHasValue } from './load-units';
	import AssessmentRefFields from './AssessmentRefFields.svelte';
	import HangboardCard from './HangboardCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { assessmentsForField, type AssessmentCatalog } from '$lib/assessments';
	import {
		HANGBOARD_HANDS,
		hangboardGranularity,
		hangboardHand,
		hangboardReps,
		hangboardSets,
		isTwoHandedMode,
		saneCount,
		type HangboardHand
	} from './hangboard-granularity';
	import {
		HANGBOARD_GRIPS,
		HANGBOARD_VARIATIONS,
		buildSessionMap,
		cloneConfig,
		commonConfig,
		configRow,
		currentLayout,
		normalizeHangboardItem,
		readConfig,
		rebuildArrays,
		repsVaryWithinSets,
		sameConfig,
		storedRowCount,
		storedVariation,
		writeConfig,
		type HangboardVariation,
		type RepConfig,
		type StoredLayout
	} from './hangboard-config';
	import HangboardSessionMap from './HangboardSessionMap.svelte';

	interface Props {
		item: TrainingItem;
		catalog: AssessmentCatalog;
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), catalog, onRemove, onDuplicate }: Props = $props();

	let collapsed = $state(false);
	let cardElement = $state<HTMLDivElement | null>(null);

	let loadAssessments = $derived(assessmentsForField('load', catalog));

	// Every assessment-relative load of an item shares one assessment and one
	// fallback: only the percentage varies from rep to rep, so the editor keeps a
	// single reference for the whole item.
	// Both hands share that assessment and fallback, so the loads of either hand
	// are driven by the same pair of fields and must be kept in step together.
	let assessmentLoads = $derived([...(item.loads ?? []), ...(item.left_loads ?? [])]);
	const firstAssessmentLoad = [...(item.loads ?? []), ...(item.left_loads ?? [])].find(
		(l) => l.unit === 'percent_assessment'
	);

	// Left unset until the catalog has loaded, which happens after the first
	// render: seeding it from an empty catalog would pin it to undefined.
	let loadAssessmentId = $state<string | undefined>(firstAssessmentLoad?.assessment_id);
	let loadFallbackKg = $state(firstAssessmentLoad?.fallback ?? 0);

	let usesAssessmentLoad = $derived(assessmentLoads.some((l) => l.unit === 'percent_assessment'));

	$effect(() => {
		loadAssessmentId ??= loadAssessments[0];
		for (const load of assessmentLoads) {
			if (load.unit === 'percent_assessment') {
				load.assessment_id = loadAssessmentId;
				load.fallback = loadFallbackKg;
			} else if (load.assessment_id !== undefined) {
				load.assessment_id = undefined;
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

	// An item declares one row, one row per rep, or one row per rep of every set,
	// and any of its arrays can be missing. The editor addresses every rep of
	// every set, so a stored item is rewritten into the layout its own values
	// call for. The draft is normalised on load, before the unsaved-changes
	// baseline is taken, so this only has work to do for an item built here.
	const adopted = untrack(() => {
		normalizeHangboardItem(item);
		const variation = storedVariation(item);
		return { variation, layout: currentLayout(item, variation) };
	});

	let variation = $state<HangboardVariation>(adopted.variation);
	let layout: StoredLayout = adopted.layout;

	// The configuration most of the item uses. Deriving it rather than tracking
	// it by hand is what keeps it honest: an edit made through a selection moves
	// what the item mostly prescribes, and the base has to follow or a later
	// collapse to a single configuration would resurrect a value nothing uses.
	let base = $derived(commonConfig(item));

	let sets = $derived(hangboardSets(item));
	let reps = $derived(hangboardReps(item));
	let twoHanded = $derived(isTwoHandedMode(hangboardHand(item)));

	let selection = $state<number[]>([]);
	let selected = $derived(new Set(selection));
	let anchor = $state<number | null>(null);
	let clipboard = $state<RepConfig[] | null>(null);
	let editHand = $state<'both' | 'left' | 'right'>('both');

	// A change that would drop a configuration the coach entered is held here
	// until they confirm it. Only the change is kept, never the sentence
	// describing it: an edit made while the bar is up has to be reflected in
	// what it says, or the coach confirms a loss that is no longer the one
	// they were shown.
	type PendingChange =
		| { kind: 'variation'; value: HangboardVariation }
		| { kind: 'hand'; value: HangboardHand }
		| { kind: 'sets'; value: number }
		| { kind: 'reps'; value: number };

	let pendingChange = $state<PendingChange | null>(null);

	const EDIT_HANDS = [
		{ value: 'both' as const, label: 'Both' },
		{ value: 'left' as const, label: 'Left' },
		{ value: 'right' as const, label: 'Right' }
	];

	function configAt(address: number): RepConfig {
		return readConfig(item, configRow(variation, address), twoHanded, base);
	}

	function isCustomised(address: number): boolean {
		return !sameConfig(configAt(address), base, twoHanded);
	}

	// Keep the legacy item-level flag in sync for older clients: an item counts
	// as "max effort" only when every rep of every hand is set to max. An item
	// that never carried the flag is left alone while it stays false, so simply
	// opening a training does not count as an edit.
	$effect(() => {
		const loads = [...(item.loads ?? []), ...(item.left_loads ?? [])];
		const isMax = loads.length > 0 && loads.every((l) => l.unit === 'max');
		if ((item.load_is_max ?? false) !== isMax) item.load_is_max = isMax;
	});

	// A number input holds intermediate values while being retyped: typing "12"
	// over a "3" goes through "1", and resizing then would truncate the grid and
	// lose every value in it. These fields are only committed to the item on
	// blur or Enter, which is when the grid is resized.
	let setsField = $state<number | null>(item.cycles ?? null);
	let repsField = $state<number | null>(item.reps ?? null);

	// The seed is read before the set count, rep count or hand changes, since
	// the base follows the item and would otherwise be recomputed against a
	// grid the arrays have not been rewritten for yet.
	function resizeGrid(seed: RepConfig) {
		rebuildArrays(item, variation, layout, seed);
		layout = currentLayout(item, variation);
		clearSelection();
	}

	function commitSets() {
		const next = saneCount(setsField);
		setsField = next;
		if (next === item.cycles) return;
		requestChange({ kind: 'sets', value: next });
	}

	function commitReps() {
		const next = saneCount(repsField);
		repsField = next;
		if (next === item.reps) return;
		requestChange({ kind: 'reps', value: next });
	}

	function resizeSets(next: number) {
		const seed = cloneConfig(base);
		item.cycles = next;
		resizeGrid(seed);
	}

	function resizeReps(next: number) {
		const seed = cloneConfig(base);
		item.reps = next;
		resizeGrid(seed);
	}

	function setHand(next: HangboardHand) {
		if (next === hangboardHand(item)) return;
		const seed = cloneConfig(base);
		item.hand = next;
		editHand = 'both';
		resizeGrid(seed);
	}

	function clearSelection() {
		selection = [];
		anchor = null;
	}

	function selectAddresses(addresses: number[]) {
		selection = [...new Set(addresses)].sort((a, b) => a - b);
	}

	// A set-by-set item is edited one set at a time, so a click anywhere in a set
	// takes the whole set with it.
	function selectionUnit(address: number): number[] {
		if (variation !== 'set') return [address];
		const start = Math.floor(address / reps) * reps;
		return Array.from({ length: reps }, (_, i) => start + i);
	}

	// Keeps the shortcuts answering after a click, on browsers that leave focus
	// on the body when a button is pressed.
	function focusCard() {
		cardElement?.focus({ preventScroll: true });
	}

	function onStepClick(address: number, event: MouseEvent) {
		focusCard();
		const unit = selectionUnit(address);
		if (event.shiftKey && anchor !== null) {
			const low = Math.min(anchor, address);
			const high = Math.max(anchor, address);
			const from = variation === 'set' ? Math.floor(low / reps) * reps : low;
			const to = variation === 'set' ? (Math.floor(high / reps) + 1) * reps - 1 : high;
			selectAddresses(Array.from({ length: to - from + 1 }, (_, i) => from + i));
			return;
		}
		if (event.metaKey || event.ctrlKey) {
			const present = unit.every((a) => selected.has(a));
			selectAddresses(
				present ? selection.filter((a) => !unit.includes(a)) : [...selection, ...unit]
			);
			anchor = address;
			return;
		}
		const same = selection.length === unit.length && unit.every((a) => selected.has(a));
		if (same) {
			clearSelection();
			return;
		}
		selectAddresses(unit);
		anchor = address;
	}

	function selectSet(setIndex: number) {
		focusCard();
		const start = setIndex * reps;
		const range = Array.from({ length: reps }, (_, i) => start + i);
		if (range.every((a) => selected.has(a)) && selection.length === range.length) {
			clearSelection();
			return;
		}
		selectAddresses(range);
		anchor = start;
	}

	function selectAll() {
		focusCard();
		selectAddresses(Array.from({ length: sets * reps }, (_, i) => i));
		anchor = 0;
	}

	type EditSide = 'left' | 'right';

	let editSides = $derived<EditSide[]>(
		!twoHanded || editHand === 'right'
			? ['right']
			: editHand === 'left'
				? ['left']
				: ['left', 'right']
	);

	function loadOf(config: RepConfig, side: EditSide): Load {
		return side === 'left' ? config.loadLeft : config.loadRight;
	}

	function assignGrip(config: RepConfig, side: EditSide, grip: string) {
		if (side === 'left') config.gripLeft = grip;
		else config.gripRight = grip;
	}

	function assignLoad(config: RepConfig, side: EditSide, load: Load) {
		if (side === 'left') config.loadLeft = load;
		else config.loadRight = load;
	}

	type ConfigField = 'edge' | 'grip' | 'loadValue' | 'loadUnit';

	function change(field: ConfigField, value: number | string): (config: RepConfig) => void {
		return (config) => {
			if (field === 'edge') {
				config.edge = value as number;
				return;
			}
			for (const side of editSides) {
				if (field === 'grip') {
					assignGrip(config, side, value as string);
				} else if (field === 'loadValue') {
					assignLoad(config, side, { ...loadOf(config, side), value: value as number });
				} else {
					const unit = value as LoadUnit;
					assignLoad(config, side, {
						...loadOf(config, side),
						unit,
						value: loadUnitHasValue(unit) ? loadOf(config, side).value : 0
					});
				}
			}
		};
	}

	// Editing with nothing selected moves the base everything falls back to. Reps
	// that were sitting on the old base follow it, so only the ones the coach
	// customised on purpose stay behind.
	function applyToBase(mutate: (config: RepConfig) => void) {
		const previous = base;
		const next = cloneConfig(previous);
		mutate(next);
		const rows = storedRowCount(item, variation);
		for (let row = 0; row < rows; row++) {
			if (sameConfig(readConfig(item, row, twoHanded, next), previous, twoHanded)) {
				writeConfig(item, row, next, twoHanded);
			}
		}
	}

	function applyToSelection(mutate: (config: RepConfig) => void) {
		for (const address of selection) {
			const next = configAt(address);
			mutate(next);
			writeConfig(item, configRow(variation, address), next, twoHanded);
		}
	}

	function applyField(field: ConfigField, value: number | string) {
		const mutate = change(field, value);
		if (selection.length) applyToSelection(mutate);
		else applyToBase(mutate);
	}

	function resetToBase() {
		for (const address of selection) {
			writeConfig(item, configRow(variation, address), base, twoHanded);
		}
	}

	function copySelection() {
		if (!selection.length) return;
		clipboard = selection.map(configAt);
	}

	// A clipboard shorter than the target repeats over it, so a single rep fills
	// a whole selection and a copied set tiles over the sets it is pasted onto.
	function pasteOnto(addresses: number[], configs: RepConfig[]) {
		if (!configs.length) return;
		addresses.forEach((address, position) => {
			writeConfig(
				item,
				configRow(variation, address),
				configs[position % configs.length],
				twoHanded
			);
		});
	}

	function pasteSelection() {
		if (clipboard) pasteOnto(selection, clipboard);
	}

	function setAddresses(setIndex: number): number[] {
		const start = setIndex * reps;
		return Array.from({ length: reps }, (_, i) => start + i);
	}

	function copySet(setIndex: number) {
		clipboard = setAddresses(setIndex).map(configAt);
	}

	function pasteSet(setIndex: number) {
		if (clipboard) pasteOnto(setAddresses(setIndex), clipboard);
	}

	function applySetBelow(setIndex: number) {
		const configs = setAddresses(setIndex).map(configAt);
		const targets: number[] = [];
		for (let set = setIndex + 1; set < sets; set++) targets.push(...setAddresses(set));
		pasteOnto(targets, configs);
	}

	// A set-by-set item shows one tile per set, so what the coach counts on
	// screen, and what a warning has to name, is sets rather than reps.
	function customisedAddresses(): number[] {
		if (variation === 'uniform') return [];
		const step = variation === 'set' ? reps : 1;
		const found: number[] = [];
		for (let address = 0; address < sets * reps; address += step) {
			if (isCustomised(address)) found.push(address);
		}
		return found;
	}

	let customisedCount = $derived(customisedAddresses().length);
	let customisedUnit = $derived(variation === 'set' ? 'set' : 'rep');

	function countLabel(count: number, unit: string): string {
		return `${count} customised ${unit}${count > 1 ? 's' : ''}`;
	}

	// Sets and reps that a shrink would delete, so a warning names what is
	// actually lost rather than everything the item has customised.
	function customisedInDroppedSets(keep: number): number {
		return customisedAddresses().filter((address) => Math.floor(address / reps) >= keep).length;
	}

	// Reps of a set are identical when the sets are what varies, so shortening a
	// set only loses a configuration when every rep carries its own.
	function customisedInDroppedReps(keep: number): number {
		if (variation !== 'rep') return 0;
		return customisedAddresses().filter((address) => address % reps >= keep).length;
	}

	function handsDiffer(): boolean {
		if (!twoHanded) return false;
		const rows = storedRowCount(item, variation);
		for (let row = 0; row < rows; row++) {
			const config = readConfig(item, row, true, base);
			if (config.gripLeft !== config.gripRight) return true;
			if (config.loadLeft.value !== config.loadRight.value) return true;
			if (config.loadLeft.unit !== config.loadRight.unit) return true;
		}
		return false;
	}

	function changeLoss(change: PendingChange): string | null {
		if (change.kind === 'variation') {
			if (change.value === variation) return null;
			if (change.value === 'uniform' && customisedCount > 0) {
				return `Switching to a single configuration clears ${countLabel(customisedCount, customisedUnit)}.`;
			}
			if (change.value === 'set' && variation === 'rep' && repsVaryWithinSets(item)) {
				return 'Varying by set makes every rep of a set identical. Each rep will follow the first rep of its set.';
			}
			return null;
		}
		if (change.kind === 'hand') {
			const dropsLeftHand = twoHanded && !isTwoHandedMode(change.value);
			return dropsLeftHand && handsDiffer()
				? 'Working the hands together drops the separate left hand configuration.'
				: null;
		}
		if (change.kind === 'sets') {
			const lost = change.value < sets ? customisedInDroppedSets(change.value) : 0;
			return lost > 0
				? `Dropping to ${change.value} sets deletes ${countLabel(lost, customisedUnit)}.`
				: null;
		}
		const lost = change.value < reps ? customisedInDroppedReps(change.value) : 0;
		return lost > 0 ? `Dropping to ${change.value} reps deletes ${countLabel(lost, 'rep')}.` : null;
	}

	let pendingMessage = $derived(pendingChange ? changeLoss(pendingChange) : null);

	function requestChange(change: PendingChange) {
		if (changeLoss(change)) {
			pendingChange = change;
			return;
		}
		pendingChange = null;
		applyChange(change);
	}

	function applyChange(change: PendingChange) {
		pendingChange = null;
		if (change.kind === 'variation') applyVariation(change.value);
		else if (change.kind === 'hand') setHand(change.value);
		else if (change.kind === 'sets') resizeSets(change.value);
		else resizeReps(change.value);
	}

	function confirmChange() {
		if (pendingChange) applyChange(pendingChange);
	}

	// The count fields carry the value the coach typed while the bar is up, so
	// backing out has to put back what the item still holds.
	function cancelChange() {
		pendingChange = null;
		setsField = item.cycles ?? null;
		repsField = item.reps ?? null;
	}

	function applyVariation(next: HangboardVariation) {
		if (next === variation) return;
		const surviving = cloneConfig(base);
		if (next === 'uniform') {
			rebuildArrays(item, next, layout, surviving);
			writeConfig(item, 0, surviving, twoHanded);
		} else if (variation === 'uniform') {
			rebuildArrays(item, next, layout, surviving);
		} else if (next === 'set') {
			flattenSetsToFirstRep();
		}
		variation = next;
		layout = currentLayout(item, next);
		clearSelection();
	}

	function flattenSetsToFirstRep() {
		for (let set = 0; set < sets; set++) {
			const first = configAt(set * reps);
			for (let rep = 1; rep < reps; rep++) {
				writeConfig(item, configRow(variation, set * reps + rep), first, twoHanded);
			}
		}
	}

	function uniqueValue<T>(values: T[]): T | null {
		return values.every((value) => value === values[0]) ? values[0] : null;
	}

	let inspected = $derived(selection.length ? selection.map(configAt) : [base]);
	let inspectedLoads = $derived(inspected.flatMap((c) => editSides.map((side) => loadOf(c, side))));
	let edgeValue = $derived(uniqueValue(inspected.map((c) => c.edge)));
	let gripValue = $derived(
		uniqueValue(
			inspected.flatMap((c) =>
				editSides.map((side) => (side === 'left' ? c.gripLeft : c.gripRight))
			)
		)
	);
	let loadUnitValue = $derived(uniqueValue(inspectedLoads.map((l) => l.unit)));
	let loadNumberValue = $derived(uniqueValue(inspectedLoads.map((l) => l.value)));

	let hasSelection = $derived(selection.length > 0);
	let canReset = $derived(selection.some(isCustomised));
	let selectedSets = $derived(new Set(selection.map((a) => Math.floor(a / reps))).size);

	let inspectorTitle = $derived.by(() => {
		if (!hasSelection) return 'Base configuration';
		const firstSet = Math.floor(selection[0] / reps) + 1;
		if (variation === 'set') {
			return selectedSets === 1 ? `Set ${firstSet}` : `${selectedSets} sets selected`;
		}
		return selection.length === 1
			? `Set ${firstSet}, rep ${(selection[0] % reps) + 1}`
			: `${selection.length} reps selected`;
	});

	let handSuffix = $derived(
		twoHanded
			? editHand === 'left'
				? ', left hand'
				: editHand === 'right'
					? ', right hand'
					: ', both hands'
			: ''
	);
	let inspectorSubtitle = $derived(
		hasSelection
			? `Edits apply to the selection${handSuffix}`
			: `Applies everywhere unless customised${handSuffix}`
	);

	// A copied set carries one configuration per rep, so what the coach reads is
	// the units they picked rather than the rows behind them.
	let clipboardUnits = $derived(
		!clipboard
			? 0
			: variation === 'set'
				? Math.max(1, Math.round(clipboard.length / reps))
				: clipboard.length
	);
	let clipboardLabel = $derived(
		!clipboard
			? ''
			: clipboardUnits === 1
				? `1 ${customisedUnit} (${clipboard[0].edge}mm)`
				: `${clipboardUnits} ${customisedUnit}s`
	);
	let pasteTitle = $derived(
		clipboard ? `Paste ${clipboardLabel} onto the selection` : 'Nothing copied yet'
	);

	let setRows = $derived(
		buildSessionMap({ sets, reps, variation, base, twoHanded, configAt, catalog, selected })
	);

	// The hint describes the selected mode, so the radiogroup points at it and a
	// screen reader announces what the mode means, not just its label.
	const handHintId = `hangboard-hand-hint-${crypto.randomUUID()}`;
	const edgeFieldId = `hangboard-edge-${crypto.randomUUID()}`;
	let handHint = $derived(HANGBOARD_HANDS.find((h) => h.value === hangboardHand(item))?.hint ?? '');
	let variationHint = $derived(HANGBOARD_VARIATIONS.find((v) => v.value === variation)?.hint ?? '');
	let mapHint = $derived(
		variation === 'set'
			? 'Click a set to edit it. Shift-click for a range.'
			: 'Click reps to edit. Shift-click for a range, ctrl-click to add.'
	);

	let collapsedSummary = $derived.by(() => {
		const custom = customisedCount ? `, ${customisedCount} custom` : '';
		return `${item.cycles}x${item.reps}, ${item.worktime_seconds}s on / ${item.rest_seconds}s off, ${base.edge}mm ${base.gripRight}${custom}`;
	});

	function isTypingTarget(target: EventTarget | null): boolean {
		const tag = (target as HTMLElement | null)?.tagName;
		return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
	}

	// Copying a rep must not take the clipboard from a coach who highlighted
	// text in the card and meant to copy that.
	function hasTextSelection(): boolean {
		return !!window.getSelection()?.toString();
	}

	// The shortcuts belong to the card the coach is working in: a training can
	// hold several hangboard items, and only the one holding focus may answer.
	// Clicking a button does not move focus on every browser, so selecting in
	// the map focuses the card itself rather than relying on the tile.
	function onWindowKeyDown(event: KeyboardEvent) {
		if (collapsed || !cardElement?.contains(document.activeElement)) return;
		if (isTypingTarget(event.target)) return;
		if (event.key === 'Escape' && selection.length) {
			clearSelection();
			return;
		}
		const modifier = event.metaKey || event.ctrlKey;
		if (modifier && (event.key === 'c' || event.key === 'C') && selection.length) {
			if (hasTextSelection()) return;
			event.preventDefault();
			copySelection();
		} else if (
			modifier &&
			(event.key === 'v' || event.key === 'V') &&
			selection.length &&
			clipboard
		) {
			event.preventDefault();
			pasteSelection();
		} else if ((event.key === 'Backspace' || event.key === 'Delete') && canReset) {
			event.preventDefault();
			resetToBase();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<HangboardCard
	title="Hangboard"
	summary={collapsedSummary}
	{onRemove}
	{onDuplicate}
	bind:element={cardElement}
	bind:collapsed
>
	{#snippet body()}
		<div class="hb-sentence">
			<input
				class="hb-count"
				type="number"
				min="1"
				aria-label="Sets"
				bind:value={setsField}
				onchange={commitSets}
			/>
			<span>sets of</span>
			<input
				class="hb-count"
				type="number"
				min="1"
				aria-label="Reps"
				bind:value={repsField}
				onchange={commitReps}
			/>
			<span>reps,</span>
			<input
				class="hb-count"
				type="number"
				min="1"
				aria-label="Work seconds"
				bind:value={item.worktime_seconds}
			/>
			<span>s hang /</span>
			<input
				class="hb-count"
				type="number"
				min="0"
				aria-label="Rest seconds"
				bind:value={item.rest_seconds}
			/>
			<span>s rest,</span>
			<input
				class="hb-count hb-count-wide"
				type="number"
				min="0"
				aria-label="Set rest seconds"
				bind:value={item.cycle_rest_seconds}
			/>
			<span>s between sets</span>
		</div>

		<div class="hb-row">
			<span class="hb-label">Hands</span>
			<div class="hb-pills" role="radiogroup" aria-label="Hands" aria-describedby={handHintId}>
				{#each HANGBOARD_HANDS as h (h.value)}
					<button
						class="hb-pill"
						class:hb-on={hangboardHand(item) === h.value}
						onclick={() => requestChange({ kind: 'hand', value: h.value })}
						title={h.hint}
						role="radio"
						aria-checked={hangboardHand(item) === h.value}>{h.label}</button
					>
				{/each}
			</div>
			<span id={handHintId} class="hb-hint">{handHint}</span>
		</div>

		<div class="hb-inspector" class:hb-focused={hasSelection}>
			<div class="hb-row">
				<span class="hb-inspector-title">{inspectorTitle}</span>
				<span class="hb-hint">{inspectorSubtitle}</span>
				<span class="hb-spacer"></span>
				{#if hasSelection}
					<button class="hb-pill" onclick={copySelection} title="Copy this configuration"
						>Copy</button
					>
					<button class="hb-pill" onclick={pasteSelection} disabled={!clipboard} title={pasteTitle}
						>Paste</button
					>
				{/if}
				{#if canReset}
					<button class="hb-pill" onclick={resetToBase}>Reset to base</button>
				{/if}
			</div>

			{#if twoHanded}
				<div class="hb-row">
					<span class="hb-label">Editing</span>
					<div class="hb-tabs" role="radiogroup" aria-label="Hand being edited">
						{#each EDIT_HANDS as tab (tab.value)}
							<button
								class="hb-tab"
								class:hb-on={editHand === tab.value}
								onclick={() => (editHand = tab.value)}
								role="radio"
								aria-checked={editHand === tab.value}>{tab.label}</button
							>
						{/each}
					</div>
				</div>
			{/if}

			<div class="hb-fields">
				<div class="hb-field">
					<label class="hb-label" for={edgeFieldId}>Edge (mm)</label>
					<input
						id={edgeFieldId}
						class="hb-input"
						type="number"
						min="1"
						value={edgeValue ?? ''}
						placeholder={edgeValue === null ? 'Mixed' : ''}
						onchange={(e) => applyField('edge', saneCount(e.currentTarget.valueAsNumber))}
					/>
				</div>

				<div class="hb-field">
					<span class="hb-label">Grip</span>
					<div class="hb-pills" role="radiogroup" aria-label="Grip">
						{#each HANGBOARD_GRIPS as grip (grip.value)}
							<button
								class="hb-pill"
								class:hb-on={gripValue === grip.value}
								onclick={() => applyField('grip', grip.value)}
								title={grip.hint}
								role="radio"
								aria-checked={gripValue === grip.value}>{grip.value}</button
							>
						{/each}
					</div>
				</div>

				<div class="hb-field">
					<span class="hb-label">Load</span>
					<div class="hb-load">
						{#if loadUnitValue === null || loadUnitHasValue(loadUnitValue)}
							<input
								class="hb-input"
								type="number"
								min="0"
								aria-label="Load"
								value={loadNumberValue ?? ''}
								placeholder={loadNumberValue === null ? 'Mixed' : ''}
								onchange={(e) => applyField('loadValue', e.currentTarget.valueAsNumber || 0)}
							/>
						{/if}
						<select
							class="hb-select"
							aria-label="Load unit"
							value={loadUnitValue ?? ''}
							onchange={(e) => applyField('loadUnit', e.currentTarget.value)}
						>
							{#if loadUnitValue === null}
								<option value="" disabled>Mixed</option>
							{/if}
							{#each HANGBOARD_LOAD_UNITS as unit (unit.value)}
								<option value={unit.value}>{unit.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>

			{#if usesAssessmentLoad}
				<div class="hb-assessment">
					<span class="hb-hint">Loads set in percent</span>
					<AssessmentRefFields
						field="load"
						bind:assessmentId={
							() => loadAssessmentId ?? loadAssessments[0], (v) => (loadAssessmentId = v)
						}
						bind:fallback={loadFallbackKg}
						fallbackUnit="kg"
						{catalog}
					/>
				</div>
			{/if}
		</div>

		<div class="hb-row">
			<span class="hb-label">Vary by</span>
			<div class="hb-tabs" role="radiogroup" aria-label="What can vary">
				{#each HANGBOARD_VARIATIONS as option (option.value)}
					<button
						class="hb-tab"
						class:hb-on={variation === option.value}
						onclick={() => requestChange({ kind: 'variation', value: option.value })}
						title={option.hint}
						role="radio"
						aria-checked={variation === option.value}>{option.label}</button
					>
				{/each}
			</div>
			<span class="hb-hint">{variationHint}</span>
		</div>

		{#if pendingMessage}
			<div class="hb-confirm" role="alertdialog" aria-label="Confirm the change">
				<span class="hb-confirm-message">{pendingMessage}</span>
				<button class="hb-pill" onclick={cancelChange}>Cancel</button>
				<button class="hb-pill hb-primary" onclick={confirmChange}>Continue</button>
			</div>
		{/if}

		{#if variation !== 'uniform'}
			<div class="hb-map">
				<div class="hb-row">
					<span class="hb-label">Session map</span>
					<span class="hb-hint">{mapHint} Ctrl-C and Ctrl-V copy and paste, Esc clears.</span>
					<span class="hb-spacer"></span>
					<button class="hb-pill" onclick={selectAll}>Select all</button>
					{#if hasSelection}
						<button class="hb-pill" onclick={clearSelection}>Clear</button>
					{/if}
				</div>

				<HangboardSessionMap rows={setRows} {onStepClick} onSelectSet={selectSet}>
					{#snippet setActions(index: number)}
						<div class="hb-set-actions">
							<button
								class="hb-act-btn"
								onclick={() => copySet(index)}
								title="Copy this set"
								aria-label="Copy this set"
							>
								<Icon name="copy" size={13} color="currentColor" />
							</button>
							<button
								class="hb-act-btn"
								onclick={() => pasteSet(index)}
								disabled={!clipboard}
								title="Paste onto this set"
								aria-label="Paste onto this set"
							>
								<Icon name="paste" size={13} color="currentColor" />
							</button>
							{#if index < sets - 1}
								<button
									class="hb-act-btn"
									onclick={() => applySetBelow(index)}
									title="Copy this set into the sets below"
									aria-label="Copy this set into the sets below"
								>
									<Icon name="arrow-down" size={13} color="currentColor" />
								</button>
							{/if}
						</div>
					{/snippet}
				</HangboardSessionMap>

				<div class="hb-legend">
					<span><span class="hb-swatch"></span>base configuration</span>
					<span><span class="hb-swatch hb-swatch-custom"></span>customised, values shown</span>
					{#if clipboard}
						<span>Clipboard: {clipboardLabel}</span>
					{/if}
				</div>
			</div>
		{/if}
	{/snippet}
</HangboardCard>

<style>
	.hb-sentence {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--tx2);
		line-height: 2;
	}

	.hb-count {
		width: 44px;
		padding: 3px 2px;
		text-align: center;
		border: none;
		border-bottom: 1.5px solid var(--bd);
		background: transparent;
		font-family: var(--font);
		font-size: 15px;
		font-weight: 700;
		color: var(--tx);
		outline: none;
	}

	.hb-count-wide {
		width: 52px;
	}

	.hb-count:focus {
		border-bottom-color: var(--hb);
	}

	.hb-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.hb-spacer {
		flex: 1;
	}

	.hb-label {
		font-size: 10px;
		color: var(--tx3);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hb-hint {
		font-size: 11px;
		color: var(--tx3);
	}

	.hb-pills {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.hb-pill {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx2);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font);
	}

	.hb-pill.hb-on {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, transparent);
		color: var(--hb);
		font-weight: 700;
	}

	.hb-pill.hb-primary {
		border-color: var(--hb);
		background: var(--hb);
		color: #fff;
		font-weight: 700;
	}

	.hb-pill:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.hb-tabs {
		display: flex;
		gap: 3px;
		background: var(--panel2);
		padding: 3px;
		border-radius: 999px;
	}

	.hb-tab {
		padding: 4px 12px;
		border-radius: 999px;
		border: none;
		background: transparent;
		color: var(--tx3);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font);
	}

	.hb-tab.hb-on {
		background: #fff;
		color: var(--hb);
		font-weight: 700;
		box-shadow: var(--sh);
	}

	.hb-inspector {
		border: 1px solid var(--bd2);
		border-radius: var(--rl);
		background: var(--panel2);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.hb-inspector.hb-focused {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 6%, transparent);
	}

	.hb-inspector-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--tx);
	}

	.hb-fields {
		display: flex;
		gap: 18px;
		flex-wrap: wrap;
		align-items: flex-end;
	}

	.hb-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.hb-load {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.hb-input,
	.hb-select {
		padding: 5px 6px;
		border: 1px solid var(--bd);
		border-radius: var(--rs);
		background: #fff;
		font-family: var(--font);
		font-size: 13px;
		color: var(--tx);
		outline: none;
	}

	.hb-input {
		width: 72px;
		text-align: center;
	}

	.hb-select {
		font-size: 12px;
		cursor: pointer;
	}

	.hb-input:focus,
	.hb-select:focus {
		border-color: var(--hb);
	}

	.hb-assessment {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.hb-confirm {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		border: 1px solid var(--gd);
		border-radius: var(--r);
		background: var(--panel2);
		padding: 10px 14px;
	}

	.hb-confirm-message {
		flex: 1;
		min-width: 220px;
		font-size: 12px;
		color: var(--tx2);
	}

	.hb-map {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Fixed so the tiles of every set end on the same edge, whether or not the
	   set carries the "apply below" action. */
	.hb-set-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
		width: 80px;
	}

	.hb-act-btn {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx3);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.hb-act-btn:hover:not(:disabled) {
		color: var(--hb);
		border-color: var(--hb);
	}

	.hb-act-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.hb-legend {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		font-size: 10px;
		color: var(--tx3);
	}

	.hb-legend span {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.hb-swatch {
		width: 9px;
		height: 9px;
		border-radius: 3px;
		border: 1px solid var(--bd);
		background: #fff;
	}

	.hb-swatch-custom {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, transparent);
	}

	.hb-pill:focus-visible,
	.hb-tab:focus-visible,
	.hb-act-btn:focus-visible {
		outline: 2px solid var(--hb);
		outline-offset: 2px;
	}
</style>
