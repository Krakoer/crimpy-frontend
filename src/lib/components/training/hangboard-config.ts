import type { Load, TrainingItem } from '$lib/api/client';
import { formatLoad } from '$lib/assessments';
import {
	hangboardGranularity,
	hangboardHand,
	hangboardHandCount,
	hangboardReps,
	hangboardSets,
	isTwoHandedMode,
	type HangboardGranularity
} from './hangboard-granularity';

// What the coach is allowed to vary. It is not the stored granularity: 'set'
// and 'rep' both store one row per rep of every set, and which of the two an
// item is read back as follows from whether its reps vary inside a set.
export type HangboardVariation = 'uniform' | 'set' | 'rep';

// One rep as the editor works with it. A mode that hangs both hands together
// uses the right fields only; the left ones mirror them.
export interface RepConfig {
	edge: number;
	gripLeft: string;
	gripRight: string;
	loadLeft: Load;
	loadRight: Load;
}

// Layout the stored arrays were built for, so a rebuild can read every value
// back by its (set, rep) coordinates rather than by raw index.
export interface StoredLayout {
	granularity: HangboardGranularity;
	sets: number;
	reps: number;
	twoHanded: boolean;
}

// Index of each hand inside hand_positions, which stores the left hand first.
const LEFT = 0;
const RIGHT = 1;

export const HANGBOARD_GRIPS: { value: string; hint: string }[] = [
	{ value: '3FD', hint: 'Three-finger drag' },
	{ value: 'HC', hint: 'Half crimp' },
	{ value: 'FC', hint: 'Full crimp' },
	{ value: 'OC', hint: 'Open hand' }
];

export const HANGBOARD_VARIATIONS: {
	value: HangboardVariation;
	label: string;
	hint: string;
}[] = [
	{ value: 'uniform', label: 'Nothing', hint: 'Every rep uses the same configuration' },
	{ value: 'set', label: 'Set', hint: 'Each set can differ, reps inside a set are identical' },
	{ value: 'rep', label: 'Rep', hint: 'Every rep can differ' }
];

// Grips of the hand that loads feeds: the right one when the hands are
// configured separately, the single shared array otherwise.
function gripHandIndex(twoHanded: boolean): number {
	return twoHanded ? RIGHT : LEFT;
}

export function wireGranularity(variation: HangboardVariation): HangboardGranularity {
	return variation === 'uniform' ? 'uniform' : 'set';
}

// Row of the configuration arrays a rep reads from: a uniform item holds one
// row for everything, any other variation one row per rep of every set.
export function configRow(variation: HangboardVariation, address: number): number {
	return variation === 'uniform' ? 0 : address;
}

export function storedRowCount(item: TrainingItem, variation: HangboardVariation): number {
	return variation === 'uniform' ? 1 : hangboardSets(item) * hangboardReps(item);
}

export function currentLayout(item: TrainingItem, variation: HangboardVariation): StoredLayout {
	return {
		granularity: wireGranularity(variation),
		sets: hangboardSets(item),
		reps: hangboardReps(item),
		twoHanded: isTwoHandedMode(hangboardHand(item))
	};
}

export function cloneConfig(config: RepConfig): RepConfig {
	return { ...config, loadLeft: { ...config.loadLeft }, loadRight: { ...config.loadRight } };
}

// The assessment reference of a percentage load is shared by the whole item, so
// the value and the unit are what tells two loads apart.
function sameLoad(a: Load, b: Load): boolean {
	return a.value === b.value && a.unit === b.unit;
}

export function sameConfig(a: RepConfig, b: RepConfig, twoHanded: boolean): boolean {
	if (a.edge !== b.edge) return false;
	if (a.gripRight !== b.gripRight || !sameLoad(a.loadRight, b.loadRight)) return false;
	if (!twoHanded) return true;
	return a.gripLeft === b.gripLeft && sameLoad(a.loadLeft, b.loadLeft);
}

// Mirrors the right hand onto the left, which is what a mode hanging both hands
// together prescribes and what a switch to a two-handed mode starts from.
export function mirrorRightHand(config: RepConfig): RepConfig {
	return { ...config, gripLeft: config.gripRight, loadLeft: { ...config.loadRight } };
}

export function readConfig(
	item: TrainingItem,
	row: number,
	twoHanded: boolean,
	fallback: RepConfig
): RepConfig {
	const grips = item.hand_positions ?? [];
	const gripRight = grips[gripHandIndex(twoHanded)]?.[row] ?? fallback.gripRight;
	const loadRight = item.loads?.[row] ?? fallback.loadRight;
	return {
		edge: item.edge_sizes_mm?.[row] ?? fallback.edge,
		gripRight,
		gripLeft: twoHanded ? (grips[LEFT]?.[row] ?? gripRight) : gripRight,
		loadRight: { ...loadRight },
		loadLeft: { ...(twoHanded ? (item.left_loads?.[row] ?? loadRight) : loadRight) }
	};
}

export function writeConfig(
	item: TrainingItem,
	row: number,
	config: RepConfig,
	twoHanded: boolean
): void {
	item.edge_sizes_mm![row] = config.edge;
	item.hand_positions![gripHandIndex(twoHanded)][row] = config.gripRight;
	item.loads![row] = { ...config.loadRight };
	if (twoHanded) {
		item.hand_positions![LEFT][row] = config.gripLeft;
		item.left_loads![row] = { ...config.loadLeft };
	}
}

// The API validates each configuration array on its own and accepts an absent
// one, so an item can arrive with any of them missing or sized for another
// layout. Everything downstream reads rows by their (set, rep) coordinates, so
// whatever is stored is rewritten into the layout the variation declares.
export function rebuildArrays(
	item: TrainingItem,
	variation: HangboardVariation,
	previous: StoredLayout,
	fallback: RepConfig
): void {
	const reps = hangboardReps(item);
	const twoHanded = isTwoHandedMode(hangboardHand(item));
	const storedEdges = item.edge_sizes_mm ?? [];
	const storedLoads = item.loads ?? [];
	const storedLeftLoads = item.left_loads ?? [];
	const storedGrips = item.hand_positions ?? [];

	const storedRow = (set: number, rep: number) => {
		if (previous.granularity === 'uniform') return 0;
		const boundedRep = Math.min(rep, previous.reps - 1);
		if (previous.granularity === 'rep') return boundedRep;
		return Math.min(set, previous.sets - 1) * previous.reps + boundedRep;
	};
	// A mode that shared one load between the hands keeps feeding both of them
	// from loads, so switching to a split configuration starts from the value
	// that was already there.
	const storedLoad = (set: number, rep: number, hand: number) => {
		const row = storedRow(set, rep);
		if (hand === LEFT && previous.twoHanded) return storedLeftLoads[row] ?? storedLoads[row];
		return storedLoads[row];
	};
	// Collapsing two hands into one keeps the hand loads describes, so the grip
	// that survives is the one the coach was reading next to it.
	const storedGrip = (set: number, rep: number, hand: number) => {
		const sourceHand = twoHanded ? hand : gripHandIndex(previous.twoHanded);
		return (storedGrips[sourceHand] ?? storedGrips[0])?.[storedRow(set, rep)];
	};

	const rows = storedRowCount(item, variation);
	const coordinates = (row: number): [number, number] =>
		variation === 'uniform' ? [0, 0] : [Math.floor(row / reps), row % reps];

	item.edge_sizes_mm = Array.from({ length: rows }, (_, row) => {
		const [set, rep] = coordinates(row);
		return storedEdges[storedRow(set, rep)] ?? fallback.edge;
	});
	item.loads = Array.from({ length: rows }, (_, row) => {
		const [set, rep] = coordinates(row);
		return { ...(storedLoad(set, rep, RIGHT) ?? fallback.loadRight) };
	});
	item.left_loads = twoHanded
		? Array.from({ length: rows }, (_, row) => {
				const [set, rep] = coordinates(row);
				return { ...(storedLoad(set, rep, LEFT) ?? fallback.loadLeft) };
			})
		: undefined;
	item.hand_positions = Array.from({ length: hangboardHandCount(hangboardHand(item)) }, (_, hand) =>
		Array.from({ length: rows }, (_, row) => {
			const [set, rep] = coordinates(row);
			return storedGrip(set, rep, hand) ?? (hand === LEFT ? fallback.gripLeft : fallback.gripRight);
		})
	);
	item.granularity = wireGranularity(variation);
}

// Whether the arrays already carry exactly what the declared layout says, which
// is the only case an item can be edited without being rewritten first.
export function isStoredAsDeclared(item: TrainingItem, variation: HangboardVariation): boolean {
	const rows = storedRowCount(item, variation);
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

// Row a rep reads from in the layout the item itself declares. It is what the
// read-only view goes through, since it never rewrites what the API returned.
function declaredRow(item: TrainingItem, set: number, rep: number): number {
	const granularity = hangboardGranularity(item);
	if (granularity === 'uniform') return 0;
	const reps = hangboardReps(item);
	const boundedRep = Math.min(rep, reps - 1);
	return granularity === 'rep' ? boundedRep : set * reps + boundedRep;
}

export function storedConfig(item: TrainingItem, set: number, rep: number): RepConfig {
	const twoHanded = isTwoHandedMode(hangboardHand(item));
	return readConfig(item, declaredRow(item, set, rep), twoHanded, defaultRepConfig());
}

export function repsVaryWithinSets(item: TrainingItem): boolean {
	const twoHanded = isTwoHandedMode(hangboardHand(item));
	const sets = hangboardSets(item);
	const reps = hangboardReps(item);
	for (let set = 0; set < sets; set++) {
		const first = storedConfig(item, set, 0);
		for (let rep = 1; rep < reps; rep++) {
			if (!sameConfig(storedConfig(item, set, rep), first, twoHanded)) return true;
		}
	}
	return false;
}

// What a rep the item says nothing about falls back to. It matches the item
// defaults, so a hangboard added to a training reads the same either way.
export function defaultRepConfig(): RepConfig {
	return {
		edge: 20,
		gripLeft: 'HC',
		gripRight: 'HC',
		loadLeft: { value: 100, unit: 'percent_bw' },
		loadRight: { value: 100, unit: 'percent_bw' }
	};
}

function configKey(config: RepConfig, twoHanded: boolean): string {
	const right = `${config.gripRight}/${config.loadRight.value}${config.loadRight.unit}`;
	if (!twoHanded) return `${config.edge}|${right}`;
	return `${config.edge}|${right}|${config.gripLeft}/${config.loadLeft.value}${config.loadLeft.unit}`;
}

// The configuration most of the item already uses, which is the one the coach
// reads as the base that the customised reps depart from.
export function commonConfig(item: TrainingItem): RepConfig {
	const twoHanded = isTwoHandedMode(hangboardHand(item));
	const sets = hangboardSets(item);
	const reps = hangboardReps(item);
	const counts = new Map<string, { config: RepConfig; count: number }>();
	let best = storedConfig(item, 0, 0);
	let bestCount = 0;
	for (let set = 0; set < sets; set++) {
		for (let rep = 0; rep < reps; rep++) {
			const config = storedConfig(item, set, rep);
			const key = configKey(config, twoHanded);
			const seen = counts.get(key) ?? { config, count: 0 };
			seen.count++;
			counts.set(key, seen);
			if (seen.count > bestCount) {
				best = seen.config;
				bestCount = seen.count;
			}
		}
	}
	return best;
}

// The two lines a rep shows in the session map: its edge, then its grip and
// load, split per hand only when the hands differ.
export function configLines(config: RepConfig, twoHanded: boolean): [string, string] {
	const right = `${config.gripRight} ${formatLoad(config.loadRight)}`;
	if (!twoHanded) return [`${config.edge}mm`, right];
	const left = `${config.gripLeft} ${formatLoad(config.loadLeft)}`;
	if (left === right) return [`${config.edge}mm`, right];
	return [`${config.edge}mm`, `L ${left} / R ${right}`];
}

export function describeConfig(config: RepConfig, twoHanded: boolean): string {
	const [edge, detail] = configLines(config, twoHanded);
	return `${edge}, ${detail}`;
}
