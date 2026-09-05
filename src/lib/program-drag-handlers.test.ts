import { describe, expect, it, vi } from 'vitest';
import { createProgramDragHandlers } from './program-drag-handlers.svelte';
import { emptyDraft, type DraftSession, type WeekDrafts } from './program-draft';

function session(id: string, overrides: Partial<DraftSession> = {}): DraftSession {
	return { _id: id, training_id: 'training-1', overrides: [], ...overrides };
}

function draftsWithMonday(...ids: string[]): WeekDrafts {
	const drafts: WeekDrafts = { 1: emptyDraft() };
	drafts[1].days[1] = ids.map((id) => session(id));
	return drafts;
}

// isSortable is an instanceof check against dnd-kit's own classes, so a plain
// object stands in for the two things that are not sortables: a cell, which is
// the droppable a drop lands on, and a rail item, which is a bare draggable.
// Reordering by drag over needs the real classes and stays covered end to end.
const cell = (id: string) => ({ id });
const railItem = (id: string) => ({ id });

function harness(drafts: WeekDrafts, editMode = true) {
	const newSession = vi.fn((trainingId: string) => session('new', { training_id: trainingId }));
	const onLockedMoveRefused = vi.fn();
	const handlers = createProgramDragHandlers(
		() => drafts,
		() => editMode,
		newSession,
		onLockedMoveRefused
	);
	return { handlers, newSession, onLockedMoveRefused };
}

const end = (source: unknown, target: unknown, canceled = false) => ({
	canceled,
	operation: { source, target }
});

describe('createProgramDragHandlers onDragEnd', () => {
	it('adds a session where a training from the rail is dropped', () => {
		const drafts = draftsWithMonday('a');
		const { handlers, newSession } = harness(drafts);

		handlers.onDragStart();
		handlers.onDragEnd(end(railItem('__new__:training-7'), cell('cell:1:3')));

		expect(newSession).toHaveBeenCalledWith('training-7');
		expect(drafts[1].days[3].map((s) => s._id)).toEqual(['new']);
		expect(drafts[1].dirty).toBe(true);
	});

	it('gives a session dropped on the frequency cell the count that cell reads', () => {
		const drafts = draftsWithMonday('a');
		const { handlers } = harness(drafts);

		handlers.onDragStart();
		handlers.onDragEnd(end(railItem('__new__:training-7'), cell('freq:1')));

		expect(drafts[1].freqSessions.map((s) => s.times_per_week)).toEqual([1]);
	});

	it('adds nothing when the rail item is dropped on no cell', () => {
		const drafts = draftsWithMonday('a');
		const { handlers, newSession } = harness(drafts);

		handlers.onDragStart();
		handlers.onDragEnd(end(railItem('__new__:training-7'), null));

		expect(newSession).not.toHaveBeenCalled();
		expect(drafts[1].dirty).toBe(false);
	});

	it('adds nothing outside edit mode', () => {
		const drafts = draftsWithMonday('a');
		const { handlers, newSession } = harness(drafts, false);

		handlers.onDragStart();
		handlers.onDragEnd(end(railItem('__new__:training-7'), cell('cell:1:3')));

		expect(newSession).not.toHaveBeenCalled();
		expect(drafts[1].days[3]).toEqual([]);
	});

	it('puts the sessions back when the drag is cancelled', () => {
		const drafts = draftsWithMonday('a', 'b');
		const { handlers } = harness(drafts);

		handlers.onDragStart();
		drafts[1].days[3] = [drafts[1].days[1].splice(0, 1)[0]];
		drafts[1].dirty = true;
		handlers.onDragEnd(end(cell('cell:1:3'), cell('cell:1:3'), true));

		expect(drafts[1].days[1].map((s) => s._id)).toEqual(['a', 'b']);
		expect(drafts[1].days[3]).toEqual([]);
		expect(drafts[1].dirty).toBe(false);
	});

	// A save that lands mid-drag rebuilds the week from what the server returned,
	// so the pre-save arrays must not be put back on top of it.
	it('restores nothing after the snapshot has been dropped', () => {
		const drafts = draftsWithMonday('a');
		const { handlers } = harness(drafts);

		handlers.onDragStart();
		handlers.dropSnapshot();
		drafts[1].days[3] = [drafts[1].days[1].splice(0, 1)[0]];
		handlers.onDragEnd(end(cell('cell:1:3'), cell('cell:1:3'), true));

		expect(drafts[1].days[3].map((s) => s._id)).toEqual(['a']);
	});

	it('says why a played session would not leave its week', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].days[1][0].locked = true;
		drafts[2] = emptyDraft();
		const { handlers, onLockedMoveRefused } = harness(drafts);

		handlers.onDragStart();
		handlers.onDragEnd(end(cell('a'), cell('cell:2:0')));

		expect(onLockedMoveRefused).toHaveBeenCalledOnce();
	});

	it('stays quiet when a played session is moved inside its own week', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].days[1][0].locked = true;
		const { handlers, onLockedMoveRefused } = harness(drafts);

		handlers.onDragStart();
		handlers.onDragEnd(end(cell('a'), cell('cell:1:4')));

		expect(onLockedMoveRefused).not.toHaveBeenCalled();
	});

	it('stays quiet for a session that was never played', () => {
		const drafts = draftsWithMonday('a');
		drafts[2] = emptyDraft();
		const { handlers, onLockedMoveRefused } = harness(drafts);

		handlers.onDragStart();
		handlers.onDragEnd(end(cell('a'), cell('cell:2:0')));

		expect(onLockedMoveRefused).not.toHaveBeenCalled();
	});

	it('settles a week the drag left holding what it started with', () => {
		const drafts = draftsWithMonday('a');
		const { handlers } = harness(drafts);

		handlers.onDragStart();
		// What a pass over week two and back looks like by the time the drag ends.
		drafts[2] = emptyDraft();
		drafts[2].dirty = true;
		drafts[1].dirty = true;
		handlers.onDragEnd(end(cell('a'), cell('cell:1:1')));

		expect(drafts[2].dirty).toBe(false);
		expect(drafts[1].dirty).toBe(false);
	});
});
