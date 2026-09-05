import { describe, it, expect } from 'vitest';
import type { TrainingItem } from '$lib/api/client';
import { createTrainingItem, prepareEditableTree } from './create-item';

describe('createTrainingItem', () => {
	it('gives every container the list it holds', () => {
		for (const type of ['circuit', 'group', 'emom'] as const) {
			expect(createTrainingItem(type).items).toEqual([]);
		}
	});

	it('leaves a leaf block without one', () => {
		expect(createTrainingItem('exercise').items).toBeUndefined();
	});
});

describe('prepareEditableTree', () => {
	it('names every block in the tree', () => {
		const items: TrainingItem[] = [
			{ type: 'circuit', items: [{ type: 'exercise' }] },
			{ type: 'exercise' }
		];
		prepareEditableTree(items);
		const ids = [items[0]._id, items[0].items![0]._id, items[1]._id];
		expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
		expect(new Set(ids).size).toBe(3);
	});

	it('keeps the name a block already carries', () => {
		const items: TrainingItem[] = [{ type: 'exercise', _id: 'kept' }];
		prepareEditableTree(items);
		expect(items[0]._id).toBe('kept');
	});

	// The API omits the list of an empty container, and a drop into one has to
	// find it there rather than create it mid-drag.
	it('gives a container the API left empty a list to receive blocks in', () => {
		const items: TrainingItem[] = [{ type: 'circuit' }, { type: 'group' }, { type: 'emom' }];
		prepareEditableTree(items);
		expect(items.map((item) => item.items)).toEqual([[], [], []]);
	});

	it('leaves a leaf block without one', () => {
		const items: TrainingItem[] = [{ type: 'exercise' }, { type: 'repeater' }];
		prepareEditableTree(items);
		expect(items.every((item) => item.items === undefined)).toBe(true);
	});
});
