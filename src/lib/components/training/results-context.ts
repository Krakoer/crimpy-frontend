import type { SessionItemResult } from '$lib/api/client';

// The counts a run recorded, keyed by the prescription item they answer. A
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

// What one item achieved for a field, in the order the passes were played.
export function achievedValues(
	byItem: ItemResultsByItem | undefined,
	itemId: string | undefined,
	field: 'reps' | 'cycles'
): number[] {
	if (!byItem || !itemId) return [];
	return (byItem[itemId] ?? []).filter((r) => r.field === field).map((r) => r.value);
}
