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

// What one item achieved for a field, in the order the passes were played. A
// pass that said nothing about the field is left out rather than counted as a
// zero, so four passes of which two were annotated read as two numbers.
export function achievedValues(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined,
	field: AchievedField
): number[] {
	if (!byItem || !itemId) return [];
	return (byItem[itemId] ?? [])
		.map((r) => r[field])
		.filter((value): value is number => value !== undefined && value !== null);
}

// What one item achieved as the athlete reported it, one entry per pass that
// said anything, so a view can show the numbers and the note together.
export function achievedPasses(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined
): SessionItemResult[] {
	if (!byItem || !itemId) return [];
	return byItem[itemId] ?? [];
}

// The lines the athlete wrote about one item, in the order the passes were
// played. This is the column the whole feature exists for, so it is read on its
// own rather than off a pass a caller has to unpack.
export function achievedNotes(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined
): string[] {
	return achievedPasses(byItem, itemId)
		.map((r) => r.note?.trim())
		.filter((note): note is string => !!note);
}
