import { describe, expect, it } from 'vitest';
import { createDragOverLatch } from './dnd-drag-over-latch';

describe('createDragOverLatch', () => {
	it('takes a target the first time the pointer reaches it', () => {
		const latch = createDragOverLatch();
		expect(latch.accepts('a', 'b')).toBe(true);
	});

	it('refuses the same target twice running', () => {
		const latch = createDragOverLatch();
		latch.accepts('a', 'b');
		expect(latch.accepts('a', 'b')).toBe(false);
	});

	it('refuses the dragged item hovering itself', () => {
		const latch = createDragOverLatch();
		expect(latch.accepts('a', 'a')).toBe(false);
	});

	// The swap slides the target out from under the pointer and puts the dragged
	// item there instead, so the very next event reports the item hovering
	// itself. That must not count as leaving the target it just swapped with, or
	// drifting back onto it would swap the pair straight back.
	it('does not let the item hovering itself clear the latch', () => {
		const latch = createDragOverLatch();
		latch.accepts('a', 'b');
		latch.accepts('a', 'a');
		expect(latch.accepts('a', 'b')).toBe(false);
	});

	it('takes a target again once the pointer has left every one', () => {
		const latch = createDragOverLatch();
		latch.accepts('a', 'b');
		latch.clear();
		expect(latch.accepts('a', 'b')).toBe(true);
	});

	it('takes a different target straight away', () => {
		const latch = createDragOverLatch();
		latch.accepts('a', 'b');
		expect(latch.accepts('a', 'c')).toBe(true);
	});
});
