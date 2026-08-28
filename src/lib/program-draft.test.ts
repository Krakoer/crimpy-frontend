import { describe, expect, it } from 'vitest';
import {
	cellID,
	cellSessions,
	draftSessions,
	duplicatedDraftSession,
	emptyDraft,
	locateSession,
	moveSession,
	parseCell,
	restoreWeekSessions,
	sessionForCell,
	snapshotWeekSessions,
	type DraftSession,
	type WeekDrafts
} from './program-draft';

function session(id: string, overrides: Partial<DraftSession> = {}): DraftSession {
	return { _id: id, training_id: 'training-1', overrides: [], ...overrides };
}

function draftsWithMonday(...ids: string[]): WeekDrafts {
	const drafts: WeekDrafts = { 1: emptyDraft() };
	drafts[1].days[1] = ids.map((id) => session(id));
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
		expect(drafts[1].dirty).toBe(false);
	});

	it('marks the week dirty', () => {
		const drafts = draftsWithMonday('a', 'b');
		moveSession(drafts, 'a', { cell: monday, overSessionID: 'b', index: 1 });
		expect(drafts[1].dirty).toBe(true);
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

	it('marks both weeks dirty', () => {
		const drafts = draftsWithMonday('a');
		drafts[2] = emptyDraft();
		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 2, day: 0 },
			overSessionID: null,
			index: Infinity
		});
		expect(drafts[1].dirty).toBe(true);
		expect(drafts[2].dirty).toBe(true);
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
		expect(drafts[1].dirty).toBe(false);
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
		expect(drafts[1].dirty).toBe(false);
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

	it('keeps a week that was already dirty dirty', () => {
		const drafts = draftsWithMonday('a');
		drafts[1].dirty = true;
		const snapshot = snapshotWeekSessions(drafts, clone);

		moveSession(drafts, 'a', {
			cell: { kind: 'day', wn: 1, day: 3 },
			overSessionID: null,
			index: Infinity
		});
		restoreWeekSessions(drafts, snapshot);

		expect(drafts[1].dirty).toBe(true);
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
