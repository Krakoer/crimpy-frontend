import type { TrainingItem } from '$lib/api/client';

// How finely a hangboard item varies its edge, load and grip.
// 'uniform': one value for the whole item.
// 'rep':     one value per rep, repeated in every set.
// 'set':     one value per (set, rep) pair.
export type HangboardGranularity = 'uniform' | 'rep' | 'set';

export function hangboardReps(item: TrainingItem): number {
	return Math.max(1, item.reps ?? 1);
}

export function hangboardSets(item: TrainingItem): number {
	return Math.max(1, item.cycles ?? 1);
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
