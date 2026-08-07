import type { HangboardGranularity, HangboardHand, TrainingItem } from '$lib/api/client';

export type { HangboardGranularity, HangboardHand };

// A cleared or half-typed number input leaves null on the item, and a count of
// zero or less would collapse the configuration grid: everything reading a set
// or rep count goes through this floor.
export function saneCount(value: number | null | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

export function hangboardReps(item: TrainingItem): number {
	return saneCount(item.reps);
}

export function hangboardSets(item: TrainingItem): number {
	return saneCount(item.cycles);
}

// The item declares its own layout, so nothing is inferred from array lengths.
export function hangboardGranularity(item: TrainingItem): HangboardGranularity {
	return item.granularity ?? 'uniform';
}

// Number of configuration rows the item carries for the given granularity.
export function hangboardRowCount(item: TrainingItem, granularity: HangboardGranularity): number {
	if (granularity === 'uniform') return 1;
	const reps = hangboardReps(item);
	return granularity === 'set' ? hangboardSets(item) * reps : reps;
}

export function hangboardHand(item: TrainingItem): HangboardHand {
	return item.hand ?? 'both';
}

// Modes that hang one hand at a time carry a separate configuration for each.
export function isTwoHandedMode(hand: HangboardHand): boolean {
	return hand === 'alternate' || hand === 'split';
}

// Number of grip arrays an item stores: one per hand when the hands are worked
// separately, one shared array otherwise.
export function hangboardHandCount(hand: HangboardHand): number {
	return isTwoHandedMode(hand) ? 2 : 1;
}

export const HANGBOARD_HANDS: { value: HangboardHand; label: string; hint: string }[] = [
	{ value: 'both', label: 'Both', hint: 'Both hands on the board at once' },
	{ value: 'alternate', label: 'Alternate', hint: 'Right then left within each rep' },
	{ value: 'split', label: 'Split', hint: 'A whole set on one hand, then the other' },
	{ value: 'left', label: 'Left', hint: 'Left hand only' },
	{ value: 'right', label: 'Right', hint: 'Right hand only' }
];

export const HANGBOARD_GRANULARITIES: { value: HangboardGranularity; label: string }[] = [
	{ value: 'uniform', label: 'Uniform' },
	{ value: 'rep', label: 'Per-rep' },
	{ value: 'set', label: 'Per-set' }
];

// Fields a new hangboard item starts with. The declared shape lives here rather
// than in each place that can create one: they drifted apart the last time it
// changed.
export function applyHangboardDefaults(item: TrainingItem): TrainingItem {
	item.cycles = 3;
	item.cycle_rest_seconds = 180;
	item.reps = 6;
	item.worktime_seconds = 7;
	item.rest_seconds = 3;
	item.hand = 'both';
	item.granularity = 'uniform';
	item.edge_sizes_mm = [20];
	item.loads = [{ value: 100, unit: 'percent_bw' }];
	item.hand_positions = [['HC']];
	return item;
}
