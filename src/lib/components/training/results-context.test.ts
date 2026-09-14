import { describe, expect, it } from 'vitest';
import type { SessionItemResult } from '$lib/api/client';
import {
	achievedEntries,
	achievedNotes,
	achievedValues,
	groupResultsByItem,
	needsPassLabels
} from './results-context';

function result(overrides: Partial<SessionItemResult> = {}): SessionItemResult {
	return {
		id: 'r-1',
		session_id: 's-1',
		training_item_id: 'item-1',
		occurrence: 0,
		updated_at: '2026-09-14T10:00:00Z',
		...overrides
	};
}

describe('groupResultsByItem', () => {
	it('keys by item and orders the passes as they were played', () => {
		const byItem = groupResultsByItem([
			result({ id: 'r-2', occurrence: 2, reps: 15 }),
			result({ id: 'r-1', occurrence: 0, reps: 23 }),
			result({ id: 'r-3', training_item_id: 'item-2', reps: 9 })
		]);

		expect(byItem['item-1'].map((r) => r.occurrence)).toEqual([0, 2]);
		expect(byItem['item-2']).toHaveLength(1);
	});
});

describe('achievedEntries', () => {
	it('skips a pass that said nothing about the field asked for', () => {
		const byItem = groupResultsByItem([
			result({ id: 'r-1', occurrence: 0, reps: 8, load_kg: 17.5 }),
			result({ id: 'r-2', occurrence: 1, note: 'shoulder twinged, stopped' }),
			result({ id: 'r-3', occurrence: 2, reps: 6 })
		]);

		// A pass that reported no load is left out rather than counted as 0 kg.
		expect(achievedEntries(byItem, 'item-1', 'load_kg')).toEqual([{ occurrence: 0, value: 17.5 }]);
		expect(achievedValues(byItem, 'item-1', 'reps')).toEqual([8, 6]);
	});

	it('is empty for an item nothing was reported against', () => {
		expect(achievedEntries(groupResultsByItem([]), 'item-1', 'reps')).toEqual([]);
		expect(achievedEntries(undefined, 'item-1', 'reps')).toEqual([]);
		expect(achievedEntries(groupResultsByItem([]), undefined, 'reps')).toEqual([]);
	});

	it('keeps a reported zero, which is a result and not an absence', () => {
		const byItem = groupResultsByItem([result({ reps: 0 })]);
		expect(achievedValues(byItem, 'item-1', 'reps')).toEqual([0]);
	});
});

describe('achievedNotes', () => {
	it('trims the lines and drops one that is only whitespace', () => {
		const byItem = groupResultsByItem([
			result({ id: 'r-1', occurrence: 0, note: '  hard on the shoulders  ' }),
			result({ id: 'r-2', occurrence: 1, note: '   ' }),
			result({ id: 'r-3', occurrence: 2, reps: 4 })
		]);

		expect(achievedNotes(byItem, 'item-1')).toEqual([
			{ occurrence: 0, note: 'hard on the shoulders' }
		]);
	});
});

describe('needsPassLabels', () => {
	it('leaves an unbroken run from the first pass unlabelled', () => {
		expect(needsPassLabels([{ occurrence: 0 }, { occurrence: 1 }, { occurrence: 2 }])).toBe(false);
		expect(needsPassLabels([])).toBe(false);
	});

	it('labels a gap, which is what stops sets 1 and 4 reading as sets 1 and 2', () => {
		expect(needsPassLabels([{ occurrence: 0 }, { occurrence: 3 }])).toBe(true);
		expect(needsPassLabels([{ occurrence: 1 }])).toBe(true);
	});
});
