import { describe, expect, it } from 'vitest';
import { arrayMove } from './sortable';

describe('arrayMove', () => {
	it('takes the slot after the item dropped on when moving down', () => {
		const items = ['a', 'b', 'c', 'd'];
		arrayMove(items, 0, 2);
		expect(items).toEqual(['b', 'c', 'a', 'd']);
	});

	it('swaps with the item below when it is the next one', () => {
		const items = ['a', 'b'];
		arrayMove(items, 0, 1);
		expect(items).toEqual(['b', 'a']);
	});

	it('reaches the last slot', () => {
		const items = ['a', 'b', 'c'];
		arrayMove(items, 0, 2);
		expect(items).toEqual(['b', 'c', 'a']);
	});

	it('takes the slot of the item dropped on when moving up', () => {
		const items = ['a', 'b', 'c', 'd'];
		arrayMove(items, 3, 1);
		expect(items).toEqual(['a', 'd', 'b', 'c']);
	});

	it('leaves the list alone when the item is dropped on itself', () => {
		const items = ['a', 'b', 'c'];
		arrayMove(items, 1, 1);
		expect(items).toEqual(['a', 'b', 'c']);
	});

	it('leaves the list alone when an index is outside it', () => {
		const items = ['a', 'b'];
		arrayMove(items, 2, 0);
		arrayMove(items, 0, 5);
		arrayMove(items, -1, 1);
		expect(items).toEqual(['a', 'b']);
	});
});
