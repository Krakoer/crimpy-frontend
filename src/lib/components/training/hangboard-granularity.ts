import type { TrainingItem } from '$lib/api/client';

// How finely a hangboard item varies its edge, load and grip.
// 'uniform': one value for the whole item.
// 'rep':     one value per rep, repeated in every set.
// 'set':     one value per (set, rep) pair.
export type HangboardGranularity = 'uniform' | 'rep' | 'set';

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

// Number of configuration rows the item carries for the given granularity.
export function hangboardRowCount(item: TrainingItem, granularity: HangboardGranularity): number {
	if (granularity === 'uniform') return 1;
	const reps = hangboardReps(item);
	return granularity === 'set' ? hangboardSets(item) * reps : reps;
}

// The arrays carry no granularity marker: their length tells the layout apart.
// A single entry is uniform, one entry per rep is per-rep, and sets x reps
// entries are per set and rep, indexed set * reps + rep.
export function hangboardGranularity(item: TrainingItem): HangboardGranularity {
	const entries = item.edge_sizes_mm?.length ?? 0;
	if (entries <= 1) return 'uniform';
	const sets = hangboardSets(item);
	if (sets > 1 && entries === sets * hangboardReps(item)) return 'set';
	return 'rep';
}
