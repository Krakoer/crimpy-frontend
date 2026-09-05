import { describe, expect, it } from 'vitest';
import {
	cellID,
	cellSessions,
	draftSessions,
	duplicatedDraftSession,
	emptyDraft,
	isWeekDirty,
	locateSession,
	lockedSessionWeek,
	moveSession,
	parseCell,
	restoreWeekSessions,
	sessionForCell,
	snapshotWeekSessions,
	weekFingerprint,
	type DraftSession,
	type WeekDraft,
	type WeekDrafts
} from './program-draft';

function session(id: string, overrides: Partial<DraftSession> = {}): DraftSession {
	return { _id: id, training_id: 'training-1', overrides: [], ...overrides };
}

// A week as it comes back from the server: what it holds now is what was saved,
// which is what every later edit is measured against.
function loaded(draft: WeekDraft): WeekDraft {
	draft.savedSnapshot = weekFingerprint(draft);
	return draft;
}

function draftsWithMonday(...ids: string[]): WeekDrafts {
	const drafts: WeekDrafts = { 1: emptyDraft() };
	drafts[1].days[1] = ids.map((id) => session(id));
	loaded(drafts[1]);
	return drafts;
}

const clone = <T>(value: T): T => structuredClone(value);

const ids = (sessions: DraftSession[]) => sessions.map((s) => s._id);

describe('parseCell', () => {
	it('reads the three cell kinds back', () => {
		expect(parseCell('cell:2:4')).toEqual({ kind: 'day', wn: 2, day: 4 });
		expect(parseCell('freq:3')).toEqual({ kind: 'freq', wn: 3 });
		expect(parseCell('everyday:5')).toEqual({ kind: 'everyday', wn: 5 });
	});

	it('refuses an id that is not a cell', () => {
		expect(parseCell('__new__:training-1')).toBeNull();
		expect(parseCell('cell:x:1')).toBeNull();
		expect(parseCell('freq:x')).toBeNull();
	});

	it('round trips through cellID', () => {
		for (const id of ['cell:2:4', 'freq:3', 'everyday:5']) {
			expect(cellID(parseCell(id)!)).toBe(id);
		}
	});
});

describe('cellSessions', () => {
	it('opens the week draft of a cell that has never been visited', () => {
		const drafts: WeekDrafts = {};
		expect(cellSessions(drafts, { kind: 'day', wn: 4, day: 0 })).toEqual([]);
		expect(drafts[4]).toBeDefined();
	});

	it('hands back the array the cell holds', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].freqSessions = [{ ...session('b'), times_per_week: 2 }];
		drafts[1].everydaySessions = [session('c')];

		expect(ids(cellSessions(drafts, { kind: 'day', wn: 1, day: 1 }))).toEqual(['a']);
		expect(ids(cellSessions(drafts, { kind: 'freq', wn: 1 }))).toEqual(['b']);
		expect(ids(cellSessions(drafts, { kind: 'everyday', wn: 1 }))).toEqual(['c']);
	});
});

describe('locateSession', () => {
	it('finds a session wherever it sits', () => {
		const drafts = draftsWithMonday('a', 'b');
		expect(locateSession(drafts, 'b')).toMatchObject({
			cell: { kind: 'day', wn: 1, day: 1 },
			index: 1
		});
	});

	it('returns null for a session no week holds', () => {
		expect(locateSession(draftsWithMonday('a'), 'gone')).toBeNull();
	});
});

describe('lockedSessionWeek', () => {
	it('names the week of a played session', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].days[1][0].locked = true;
		expect(lockedSessionWeek(drafts, 'a')).toBe(1);
	});

	it('answers null for a session free to move', () => {
		expect(lockedSessionWeek(draftsWithMonday('a'), 'a')).toBeNull();
	});

	it('answers null for a session no week holds', () => {
		expect(lockedSessionWeek(draftsWithMonday('a'), 'gone')).toBeNull();
	});
});

describe('sessionForCell', () => {
	it('gives a session entering the frequency column a count', () => {
		expect(sessionForCell(session('a'), { kind: 'freq', wn: 1 })).toMatchObject({
			times_per_week: 1
		});
	});

	it('keeps the count a session left the frequency column with', () => {
		const moved = session('a', { times_per_week: 3 });
		expect(sessionForCell(moved, { kind: 'freq', wn: 1 })).toMatchObject({ times_per_week: 3 });
		expect(sessionForCell(moved, { kind: 'day', wn: 1, day: 2 })).toMatchObject({
			times_per_week: 3
		});
	});
});

describe('moveSession inside one cell', () => {
	const monday = { kind: 'day', wn: 1, day: 1 } as const;

	it('takes the slot after the session dropped on when moving down', () => {
		const drafts = draftsWithMonday('a', 'b', 'c');
		moveSession(drafts, 'a', { cell: monday, overSessionID: 'c', index: 2 });
		expect(ids(drafts[1].days[1])).toEqual(['b', 'c', 'a']);
	});

	it('swaps with the session below when it is the next one', () => {
		const drafts = draftsWithMonday('a', 'b');
		moveSession(drafts, 'a', { cell: monday, overSessionID: 'b', index: 1 });
		expect(ids(drafts[1].days[1])).toEqual(['b', 'a']);
	});

	it('takes the slot of the session dropped on when moving up', () => {
		const drafts = draftsWithMonday('a', 'b', 'c');
		moveSession(drafts, 'c', { cell: monday, overSessionID: 'a', index: 0 });
		expect(ids(drafts[1].days[1])).toEqual(['c', 'a', 'b']);
	});

	it('ignores a drop on the empty part of the cell it already sits in', () => {
		const drafts = draftsWithMonday('a', 'b');
		moveSession(drafts, 'a', { cell: monday, overSessionID: null, index: Infinity });
		expect(ids(drafts[1].days[1])).toEqual(['a', 'b']);
	});

	it('leaves the week alone when a session is dropped on itself', () => {
		const drafts = draftsWithMonday('a', 'b');
		moveSession(drafts, 'a', { cell: monday, overSessionID: 'a', index: 0 });
		expect(ids(drafts[1].days[1])).toEqual(['a', 'b']);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	it('leaves the week holding unsaved changes', () => {
		const drafts = draftsWithMonday('a', 'b');
		moveSession(drafts, 'a', { cell: monday, overSessionID: 'b', index: 1 });
		expect(isWeekDirty(drafts[1])).toBe(true);
	});
});

describe('moveSession across cells', () => {
	it('drops the session at the index of the target cell', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].days[2] = [session('b'), session('c')];
		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 2 },
			overSessionID: 'c',
			index: 1
		});
		expect(ids(drafts[1].days[1])).toEqual([]);
		expect(ids(drafts[1].days[2])).toEqual(['b', 'a', 'c']);
	});

	it('appends when the drop is on the cell itself', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].days[2] = [session('b')];
		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 2 },
			overSessionID: null,
			index: Infinity
		});
		expect(ids(drafts[1].days[2])).toEqual(['b', 'a']);
	});

	it('gives the session a weekly count when the target is the frequency column', () => {
		const drafts = draftsWithMonday('a');
		moveSession(drafts, 'a', {
			cell: { kind: 'freq', wn: 1 },
			overSessionID: null,
			index: Infinity
		});
		expect(drafts[1].freqSessions[0]).toMatchObject({ _id: 'a', times_per_week: 1 });
	});

	it('leaves both weeks holding unsaved changes', () => {
		const drafts = draftsWithMonday('a');
		drafts[2] = emptyDraft();
		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 2, day: 0 },
			overSessionID: null,
			index: Infinity
		});
		expect(isWeekDirty(drafts[1])).toBe(true);
		expect(isWeekDirty(drafts[2])).toBe(true);
	});

	it('opens the target week when the drag reaches one never visited', () => {
		const drafts = draftsWithMonday('a');
		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 3, day: 0 },
			overSessionID: null,
			index: Infinity
		});
		expect(ids(drafts[3].days[0])).toEqual(['a']);
	});

	it('does nothing for a session no week holds', () => {
		const drafts = draftsWithMonday('a');
		moveSession(drafts, 'gone', {
			cell: { kind: 'day', wn: 1, day: 2 },
			overSessionID: null,
			index: Infinity
		});
		expect(ids(drafts[1].days[1])).toEqual(['a']);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});
});

describe('snapshot and restore', () => {
	it('brings the sessions back where they were', () => {
		const drafts = draftsWithMonday('a', 'b');
		const snapshot = snapshotWeekSessions(drafts, clone);

		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 3 },
			overSessionID: null,
			index: Infinity
		});
		restoreWeekSessions(drafts, snapshot);

		expect(ids(drafts[1].days[1])).toEqual(['a', 'b']);
		expect(ids(drafts[1].days[3])).toEqual([]);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	it('empties a week the drag itself opened', () => {
		const drafts = draftsWithMonday('a');
		const snapshot = snapshotWeekSessions(drafts, clone);

		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 6, day: 0 },
			overSessionID: null,
			index: Infinity
		});
		restoreWeekSessions(drafts, snapshot);

		expect(ids(drafts[6].days[0])).toEqual([]);
		expect(ids(drafts[1].days[1])).toEqual(['a']);
	});

	it('leaves a week edited before the drag holding its unsaved changes', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].days[5] = [session('b')];
		const snapshot = snapshotWeekSessions(drafts, clone);

		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 3 },
			overSessionID: null,
			index: Infinity
		});
		restoreWeekSessions(drafts, snapshot);

		expect(ids(drafts[1].days[5])).toEqual(['b']);
		expect(isWeekDirty(drafts[1])).toBe(true);
	});
});

// The flag this replaced was set by the edit that touched a week and never
// cleared by the one that put it back, so a week holding exactly what was
// loaded still reported unsaved changes.
describe('isWeekDirty', () => {
	function moveTo(drafts: WeekDrafts, id: string, wn: number, day: number) {
		moveSession(drafts, id, {
			cell: { kind: 'day', wn, day },
			overSessionID: null,
			index: Infinity
		});
	}

	it('reads a week as saved as it was loaded', () => {
		const drafts = draftsWithMonday('a', 'b');
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	it('clears a week a session was only dragged through', () => {
		const drafts: WeekDrafts = { 1: draftsWithMonday('a')[1], 2: emptyDraft(), 3: emptyDraft() };

		moveTo(drafts, 'a', 2, 1);
		expect(isWeekDirty(drafts[2])).toBe(true);
		moveTo(drafts, 'a', 3, 1);

		expect(isWeekDirty(drafts[2])).toBe(false);
		expect(isWeekDirty(drafts[1])).toBe(true);
		expect(isWeekDirty(drafts[3])).toBe(true);
	});

	// The case one drag cannot settle: the session is dropped into week two by
	// one gesture and taken back out by another, so nothing week two saw knows
	// the pair cancels out.
	it('clears a week a session was dropped into and dragged back out of', () => {
		const drafts: WeekDrafts = { 1: draftsWithMonday('a')[1], 2: emptyDraft() };

		moveTo(drafts, 'a', 2, 0);
		expect(isWeekDirty(drafts[2])).toBe(true);

		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 1 },
			overSessionID: null,
			index: Infinity
		});

		expect(isWeekDirty(drafts[1])).toBe(false);
		expect(isWeekDirty(drafts[2])).toBe(false);
	});

	it('clears a week a session left and came back to', () => {
		const drafts = draftsWithMonday('a', 'b');

		moveTo(drafts, 'a', 1, 3);
		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 1 },
			overSessionID: 'b',
			index: 0
		});

		expect(ids(drafts[1].days[1])).toEqual(['a', 'b']);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	it('keeps a week the drag really changed dirty', () => {
		const drafts = draftsWithMonday('a', 'b');
		moveTo(drafts, 'a', 1, 3);
		expect(isWeekDirty(drafts[1])).toBe(true);
	});

	// weekDetailToDraft builds a frequency session by spreading, so its keys end
	// with times_per_week, while movedDraftSession puts that key in the middle.
	// Comparing serialisations rather than content read the two as different.
	it('clears a frequency session dragged onto a day and back', () => {
		const drafts: WeekDrafts = { 1: emptyDraft() };
		drafts[1].freqSessions = [{ ...session('a'), times_per_week: 2 }];
		loaded(drafts[1]);

		moveTo(drafts, 'a', 1, 2);
		moveSession(drafts, 'a', {
			cell: { kind: 'freq', wn: 1 },
			overSessionID: null,
			index: Infinity
		});

		expect(drafts[1].freqSessions.map((s) => s.times_per_week)).toEqual([2]);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	// Only the frequency column saves the count, so a day session that picked one
	// up on its way through is not a day session that changed.
	it('clears a day session dragged over the frequency cell and back', () => {
		const drafts = draftsWithMonday('a');

		moveSession(drafts, 'a', {
			cell: { kind: 'freq', wn: 1 },
			overSessionID: null,
			index: Infinity
		});
		moveTo(drafts, 'a', 1, 1);

		expect(ids(drafts[1].days[1])).toEqual(['a']);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	// The count is what the frequency column saves, so changing it is a real edit.
	it('reads a changed frequency count as unsaved', () => {
		const drafts: WeekDrafts = { 1: emptyDraft() };
		drafts[1].freqSessions = [{ ...session('a'), times_per_week: 2 }];
		loaded(drafts[1]);

		drafts[1].freqSessions[0].times_per_week = 3;

		expect(isWeekDirty(drafts[1])).toBe(true);
	});

	it('leaves a week the drag opened and left empty clean', () => {
		const drafts = draftsWithMonday('a');

		moveTo(drafts, 'a', 6, 0);
		moveTo(drafts, 'a', 1, 1);

		expect(isWeekDirty(drafts[6])).toBe(false);
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	it('reads edited notes as unsaved and typed back notes as saved', () => {
		const drafts = draftsWithMonday('a');

		drafts[1].notes = 'Deload';
		expect(isWeekDirty(drafts[1])).toBe(true);

		drafts[1].notes = '';
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	// The save trims the notes, so whitespace on its own writes nothing.
	it('ignores whitespace the save would trim off the notes', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].notes = '  ';
		expect(isWeekDirty(drafts[1])).toBe(false);
	});

	// The parameters modal writes into the session the same way a drag does.
	it('reads an override set and taken back off as saved', () => {
		const drafts = draftsWithMonday('a');

		drafts[1].days[1][0].overrides = [{ item_id: 'item-1', overrides: { reps: 4 } }];
		expect(isWeekDirty(drafts[1])).toBe(true);

		drafts[1].days[1][0].overrides = [];
		expect(isWeekDirty(drafts[1])).toBe(false);
	});
});

describe('draft sessions', () => {
	it('lists every session of a week once', () => {
		const drafts = draftsWithMonday('a', 'b');
		drafts[1].freqSessions = [{ ...session('c'), times_per_week: 2 }];
		drafts[1].everydaySessions = [session('d')];
		expect(ids(draftSessions(drafts[1]))).toEqual(['a', 'b', 'c', 'd']);
	});

	it('gives a duplicate its own local key and no server row', () => {
		const original = session('a', { id: 'row-1', originWn: 2, locked: true });
		const copy = duplicatedDraftSession(original);
		expect(copy._id).not.toBe(original._id);
		expect(copy.id).toBeUndefined();
		expect(copy.originWn).toBeUndefined();
		expect(copy.locked).toBe(false);
		expect(copy.training_id).toBe(original.training_id);
	});
});
