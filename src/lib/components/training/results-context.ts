import type { SessionItemResult } from '$lib/api/client';

// What the athlete reported, keyed by the prescription item it answers. A
// session sets it around the tree it shows, so an item view can say what the
// athlete managed without every list and container in between carrying the
// results down as a prop. Absent everywhere else, which is what makes the same
// views usable in the training editor.
export const ITEM_RESULTS_KEY = Symbol('item-results');

export type ItemResultsByItem = Record<string, SessionItemResult[]>;

export function groupResultsByItem(results: SessionItemResult[]): ItemResultsByItem {
	const byItem: ItemResultsByItem = {};
	for (const result of results) {
		(byItem[result.training_item_id] ??= []).push(result);
	}
	for (const list of Object.values(byItem)) {
		list.sort((a, b) => a.occurrence - b.occurrence);
	}
	return byItem;
}

// Which reported number a view is asking for.
export type AchievedField = 'reps' | 'cycles' | 'load_kg' | 'duration_seconds';

// One reported value and which pass through the item reported it. The pass is
// carried rather than dropped because a view showing several of them has to be
// able to say which is which.
export interface AchievedEntry {
	occurrence: number;
	value: number;
}

export interface AchievedNote {
	occurrence: number;
	note: string;
}

// What one item achieved for a field, in the order the passes were played. A
// pass that said nothing about the field is left out rather than counted as a
// zero, so four passes of which two were annotated read as two numbers.
export function achievedEntries(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined,
	field: AchievedField
): AchievedEntry[] {
	if (!byItem || !itemId) return [];
	const entries: AchievedEntry[] = [];
	for (const result of byItem[itemId] ?? []) {
		const value = result[field];
		if (value === undefined || value === null) continue;
		entries.push({ occurrence: result.occurrence, value });
	}
	return entries;
}

export function achievedValues(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined,
	field: AchievedField
): number[] {
	return achievedEntries(byItem, itemId, field).map((entry) => entry.value);
}

// The lines the athlete wrote about one item, in the order the passes were
// played. This is the column the whole feature exists for, so it is read on its
// own rather than off a pass a caller has to unpack.
export function achievedNotes(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined
): AchievedNote[] {
	if (!byItem || !itemId) return [];
	const notes: AchievedNote[] = [];
	for (const result of byItem[itemId] ?? []) {
		const note = result.note?.trim();
		if (!note) continue;
		notes.push({ occurrence: result.occurrence, note });
	}
	return notes;
}

// Whether entries have to name the pass they came from. Passes reported in an
// unbroken run from the first are told apart by their order alone; a gap means
// the position in the list no longer matches the pass, and a coach reading
// "did 8, 7" off sets 1 and 4 would take it for sets 1 and 2.
export function needsPassLabels(entries: { occurrence: number }[]): boolean {
	return entries.some((entry, index) => entry.occurrence !== index);
}
