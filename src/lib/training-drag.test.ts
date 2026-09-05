import { describe, it, expect } from 'vitest';
import type { TrainingItem, TrainingType } from '$lib/api/client';
import {
	applyDragOver,
	containerCollisionPriority,
	containerIdOf,
	findContainerArray,
	findItemInTree,
	insertNewItem,
	isValidMove,
	itemCollisionPriority,
	moveCrossContainer,
	parseNewItemId,
	ROOT_CONTAINER_ID,
	targetContainerId,
	targetInsertIndex
} from './training-drag';

function exercise(id: string): TrainingItem {
	return { type: 'exercise', _id: id };
}

function circuit(id: string, items: TrainingItem[] = []): TrainingItem {
	return { type: 'circuit', _id: id, items };
}

function group(id: string, items: TrainingItem[] = []): TrainingItem {
	return { type: 'group', _id: id, items };
}

const ids = (items: TrainingItem[]) => items.map((item) => item._id);

describe('collision priority', () => {
	it('ranks a nested list above the container block that holds it', () => {
		expect(containerCollisionPriority(1)).toBeGreaterThan(itemCollisionPriority(0));
	});

	it('ranks a block above the list it sits in', () => {
		expect(itemCollisionPriority(0)).toBeGreaterThan(containerCollisionPriority(0));
		expect(itemCollisionPriority(1)).toBeGreaterThan(containerCollisionPriority(1));
	});
});

describe('findItemInTree', () => {
	it('reports the root list for a top level block', () => {
		const items = [exercise('a'), circuit('c')];
		expect(findItemInTree(items, 'a')).toEqual({
			container: items,
			containerId: ROOT_CONTAINER_ID,
			index: 0
		});
	});

	it('reports the container id of a nested block', () => {
		const inner = exercise('a');
		const items = [circuit('c', [exercise('b'), inner])];
		const found = findItemInTree(items, 'a');
		expect(found?.containerId).toBe(containerIdOf('c'));
		expect(found?.index).toBe(1);
	});

	it('answers null for an unknown block', () => {
		expect(findItemInTree([exercise('a')], 'nope')).toBeNull();
	});
});

describe('findContainerArray', () => {
	it('answers the tree itself for the root', () => {
		const items = [exercise('a')];
		expect(findContainerArray(items, ROOT_CONTAINER_ID)).toBe(items);
	});

	it('gives an empty container a list to receive blocks in', () => {
		const empty: TrainingItem = { type: 'circuit', _id: 'c' };
		const container = findContainerArray([empty], containerIdOf('c'));
		expect(container).toEqual([]);
		expect(empty.items).toBe(container);
	});
});

describe('isValidMove', () => {
	const items = [circuit('c'), group('g')];

	it('takes any block at the root', () => {
		expect(isValidMove(items, 'workout', exercise('a'), ROOT_CONTAINER_ID)).toBe(true);
	});

	it('refuses a circuit inside another container', () => {
		expect(isValidMove(items, 'workout', circuit('x'), containerIdOf('c'))).toBe(false);
	});

	it('takes a group inside a root circuit only', () => {
		expect(isValidMove(items, 'workout', group('x'), containerIdOf('c'))).toBe(true);
		expect(isValidMove(items, 'workout', group('x'), containerIdOf('g'))).toBe(false);
	});

	it('takes an emom inside a root group only', () => {
		const emom: TrainingItem = { type: 'emom', _id: 'x' };
		expect(isValidMove(items, 'workout', emom, containerIdOf('g'))).toBe(true);
		expect(isValidMove(items, 'workout', emom, containerIdOf('c'))).toBe(false);
	});

	it('refuses the blocks a stretching training does not carry', () => {
		const stretching: TrainingType = 'stretching';
		expect(isValidMove([], stretching, group('x'), ROOT_CONTAINER_ID)).toBe(false);
		expect(isValidMove([], stretching, { type: 'repeater', _id: 'x' }, ROOT_CONTAINER_ID)).toBe(
			false
		);
		expect(isValidMove([circuit('c')], stretching, circuit('x'), ROOT_CONTAINER_ID)).toBe(false);
		expect(isValidMove([], stretching, exercise('x'), ROOT_CONTAINER_ID)).toBe(true);
	});
});

describe('moveCrossContainer', () => {
	it('moves a root block into an empty circuit', () => {
		const target = circuit('c');
		const items = [exercise('a'), exercise('b'), target];
		moveCrossContainer(items, 'workout', 'b', containerIdOf('c'), Infinity);
		expect(ids(items)).toEqual(['a', 'c']);
		expect(ids(target.items!)).toEqual(['b']);
	});

	it('appends past the end of the target list', () => {
		const target = circuit('c', [exercise('x')]);
		const items = [exercise('a'), target];
		moveCrossContainer(items, 'workout', 'a', containerIdOf('c'), Infinity);
		expect(ids(target.items!)).toEqual(['x', 'a']);
	});

	it('moves a nested block back out to the root', () => {
		const source = circuit('c', [exercise('a')]);
		const items = [source];
		moveCrossContainer(items, 'workout', 'a', ROOT_CONTAINER_ID, Infinity);
		expect(ids(items)).toEqual(['c', 'a']);
		expect(source.items).toEqual([]);
	});

	it('leaves the tree alone when the container refuses the block', () => {
		const target = circuit('c');
		const items = [circuit('other'), target];
		moveCrossContainer(items, 'workout', 'other', containerIdOf('c'), Infinity);
		expect(ids(items)).toEqual(['other', 'c']);
		expect(target.items).toEqual([]);
	});

	it('refuses to drop a container inside its own list', () => {
		const held = group('g');
		const outer = circuit('c', [held]);
		const items = [outer];
		moveCrossContainer(items, 'workout', 'c', containerIdOf('g'), Infinity);
		expect(ids(items)).toEqual(['c']);
		expect(ids(outer.items!)).toEqual(['g']);
		expect(held.items).toEqual([]);
	});

	it('leaves the tree alone when the block is already in the target', () => {
		const target = circuit('c', [exercise('a')]);
		moveCrossContainer([target], 'workout', 'a', containerIdOf('c'), Infinity);
		expect(ids(target.items!)).toEqual(['a']);
	});
});

describe('applyDragOver', () => {
	const sortableTarget = (id: string, groupId: string, index: number) => ({
		id,
		group: groupId,
		index
	});

	it('reorders inside one list when hovering another block of it', () => {
		const items = [exercise('a'), exercise('b'), exercise('c')];
		applyDragOver(items, 'workout', 'a', sortableTarget('c', ROOT_CONTAINER_ID, 2), true);
		expect(ids(items)).toEqual(['b', 'c', 'a']);
	});

	it('does nothing when the block is hovering itself', () => {
		const items = [exercise('a'), exercise('b')];
		applyDragOver(items, 'workout', 'a', sortableTarget('a', ROOT_CONTAINER_ID, 0), true);
		expect(ids(items)).toEqual(['a', 'b']);
	});

	it('drops the block into the list under the pointer', () => {
		const target = circuit('c');
		const items = [exercise('a'), target];
		applyDragOver(items, 'workout', 'a', { id: containerIdOf('c') }, false);
		expect(ids(items)).toEqual(['c']);
		expect(ids(target.items!)).toEqual(['a']);
	});

	it('drops the block at the slot of the nested block it hovers', () => {
		const target = circuit('c', [exercise('x'), exercise('y')]);
		const items = [exercise('a'), target];
		applyDragOver(items, 'workout', 'a', sortableTarget('y', containerIdOf('c'), 1), true);
		expect(ids(items)).toEqual(['c']);
		expect(ids(target.items!)).toEqual(['x', 'a', 'y']);
	});
});

describe('drop target reading', () => {
	it('reads a sortable target as its own list and slot', () => {
		const target = { id: 'b', group: containerIdOf('c'), index: 2 };
		expect(targetContainerId(target, true)).toBe(containerIdOf('c'));
		expect(targetInsertIndex(target, true)).toBe(2);
	});

	it('reads a container target as the end of that list', () => {
		const target = { id: containerIdOf('c') };
		expect(targetContainerId(target, false)).toBe(containerIdOf('c'));
		expect(targetInsertIndex(target, false)).toBe(Infinity);
	});

	it('falls back to the root for a sortable with no group', () => {
		expect(targetContainerId({ id: 'b', index: 0 }, true)).toBe(ROOT_CONTAINER_ID);
	});
});

describe('insertNewItem', () => {
	it('adds a block at the hovered slot', () => {
		const items = [exercise('a'), exercise('b')];
		expect(insertNewItem(items, 'workout', 'exercise', 'ex-1', ROOT_CONTAINER_ID, 1)).toBe(true);
		expect(items).toHaveLength(3);
		expect(items[1].exercise_id).toBe('ex-1');
	});

	it('refuses a block the target container does not take', () => {
		const target = circuit('c');
		expect(insertNewItem([target], 'workout', 'circuit', undefined, containerIdOf('c'), 0)).toBe(
			false
		);
		expect(target.items).toEqual([]);
	});
});

describe('parseNewItemId', () => {
	it('reads a block type on its own', () => {
		expect(parseNewItemId('__new__:circuit')).toEqual({ type: 'circuit' });
	});

	it('reads a block type and its exercise', () => {
		expect(parseNewItemId('__new__:exercise:abc-123')).toEqual({
			type: 'exercise',
			exerciseId: 'abc-123'
		});
	});

	it('answers null for a sortable id', () => {
		expect(parseNewItemId('9f0a-uuid')).toBeNull();
	});
});
