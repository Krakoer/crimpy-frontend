import type { SessionOverride } from '$lib/api/client';
import type { ScheduledRow } from '$lib/program-overrides';
import { arrayMove } from '$lib/sortable';

// _id is a local key for drag and drop only. id is the server row the session
// came from, and sending it back is what stops the save from recreating the
// row played sessions point at. originWn is the week that row belongs to, so
// a session dragged to another week and back still saves under its own id.
// locked is set by the server on a session the coachee has already played.
// What was prescribed then must keep describing what was played, so its
// training and its overrides are frozen and the row may not be dropped.
// times_per_week only means anything in the frequency column, but every
// session carries it: a drag passing over a day cell on its way back would
// otherwise shed the count the coach prescribed. What decides whether it is
// sent is the cell the session is saved from, not whether it is still here.
export type DraftSession = {
	_id: string;
	id?: string;
	originWn?: number;
	training_id: string;
	notes?: string;
	locked?: boolean;
	times_per_week?: number;
	overrides: SessionOverride[];
};
export type DaySession = DraftSession;
export type FreqSession = DraftSession & { times_per_week: number };
export type EverydaySession = DraftSession;

export type WeekDraft = {
	notes: string;
	days: DaySession[][];
	freqSessions: FreqSession[];
	everydaySessions: EverydaySession[];
	dirty: boolean;
	saving: boolean;
	saveError: string;
	deleteConfirm: boolean;
	deleting: boolean;
};

// The weeks the coach has opened, by week number.
export type WeekDrafts = Record<number, WeekDraft>;

export function emptyDraft(): WeekDraft {
	return {
		notes: '',
		days: Array.from({ length: 7 }, () => []),
		freqSessions: [],
		everydaySessions: [],
		dirty: false,
		saving: false,
		saveError: '',
		deleteConfirm: false,
		deleting: false
	};
}

// The id is kept as the session moves. Whether it is sent is decided at save
// time by comparing originWn to the week being saved, so a mis-drop into
// another week that the coach immediately undoes does not lose the row.
export function movedDraftSession(session: DraftSession): DraftSession {
	return {
		_id: session._id,
		id: session.id,
		originWn: session.originWn,
		training_id: session.training_id,
		notes: session.notes,
		locked: session.locked,
		times_per_week: session.times_per_week,
		overrides: session.overrides
	};
}

// A duplicate is a new row in the target week, so it starts without an id and
// nobody has played it yet.
export function duplicatedDraftSession<T extends DraftSession>(session: T): T {
	return {
		...session,
		_id: crypto.randomUUID(),
		id: undefined,
		originWn: undefined,
		locked: false
	};
}

export function draftSessions(draft: WeekDraft): DraftSession[] {
	return [...draft.days.flat(), ...draft.freqSessions, ...draft.everydaySessions];
}

// Where a session sits in a week. The id doubles as the drop target id of the
// cell and as the sortable group of the sessions inside it, so a drop on the
// empty part of a cell and a drop on one of its sessions resolve to the same
// place.
export type SessionCell =
	| { kind: 'day'; wn: number; day: number }
	| { kind: 'freq'; wn: number }
	| { kind: 'everyday'; wn: number };

// The cell a drop lands in and the index inside it. overSessionID is the
// session dropped onto, null when the drop is on the cell itself.
export type SessionDrop = { cell: SessionCell; overSessionID: string | null; index: number };

export type SessionLocation = { cell: SessionCell; sessions: DraftSession[]; index: number };

export function parseCell(id: string): SessionCell | null {
	if (id.startsWith('cell:')) {
		const [, wnStr, dayStr] = id.split(':');
		const wn = parseInt(wnStr);
		const day = parseInt(dayStr);
		if (isNaN(wn) || isNaN(day)) return null;
		return { kind: 'day', wn, day };
	}
	if (id.startsWith('freq:')) {
		const wn = parseInt(id.slice(5));
		return isNaN(wn) ? null : { kind: 'freq', wn };
	}
	if (id.startsWith('everyday:')) {
		const wn = parseInt(id.slice(9));
		return isNaN(wn) ? null : { kind: 'everyday', wn };
	}
	return null;
}

export function cellID(cell: SessionCell): string {
	if (cell.kind === 'day') return `cell:${cell.wn}:${cell.day}`;
	return `${cell.kind}:${cell.wn}`;
}

// The array a cell holds, creating the week draft if the cell belongs to one
// that has not been opened yet.
export function cellSessions(drafts: WeekDrafts, cell: SessionCell): DraftSession[] {
	if (!drafts[cell.wn]) drafts[cell.wn] = emptyDraft();
	const draft = drafts[cell.wn];
	if (cell.kind === 'day') return draft.days[cell.day];
	if (cell.kind === 'freq') return draft.freqSessions;
	return draft.everydaySessions;
}

export function locateSession(drafts: WeekDrafts, sessionId: string): SessionLocation | null {
	for (const wnStr of Object.keys(drafts)) {
		const wn = parseInt(wnStr);
		const draft = drafts[wn];
		for (let day = 0; day < 7; day++) {
			const index = draft.days[day].findIndex((s) => s._id === sessionId);
			if (index !== -1) {
				return { cell: { kind: 'day', wn, day }, sessions: draft.days[day], index };
			}
		}
		const freqIndex = draft.freqSessions.findIndex((s) => s._id === sessionId);
		if (freqIndex !== -1) {
			return { cell: { kind: 'freq', wn }, sessions: draft.freqSessions, index: freqIndex };
		}
		const everydayIndex = draft.everydaySessions.findIndex((s) => s._id === sessionId);
		if (everydayIndex !== -1) {
			return {
				cell: { kind: 'everyday', wn },
				sessions: draft.everydaySessions,
				index: everydayIndex
			};
		}
	}
	return null;
}

// A frequency cell is the only one that reads the count, so a session entering
// it must end up with one. A session that never had it starts at 1; one coming
// back from another cell gets the count it left with. Going through here is
// what lets cellSessions hand back a plain DraftSession array for any cell:
// nothing else puts a session into freqSessions.
export function sessionForCell(session: DraftSession, cell: SessionCell): DraftSession {
	const moved = movedDraftSession(session);
	if (cell.kind !== 'freq') return moved;
	const freqSession: FreqSession = { ...moved, times_per_week: session.times_per_week ?? 1 };
	return freqSession;
}

export function moveSession(drafts: WeekDrafts, sessionId: string, drop: SessionDrop): void {
	const from = locateSession(drafts, sessionId);
	if (!from) return;
	const target = cellSessions(drafts, drop.cell);

	if (from.sessions === target) {
		if (drop.overSessionID === null) return;
		const overIndex = target.findIndex((s) => s._id === drop.overSessionID);
		// A session dropped on itself has not moved, so the week is left alone
		// rather than flagged dirty over a drag that changed nothing.
		if (overIndex === -1 || overIndex === from.index) return;
		arrayMove(target, from.index, overIndex);
	} else {
		const [session] = from.sessions.splice(from.index, 1);
		target.splice(Math.min(drop.index, target.length), 0, sessionForCell(session, drop.cell));
	}

	drafts[from.cell.wn].dirty = true;
	drafts[drop.cell.wn].dirty = true;
}

// Only the session arrays are snapshotted, not the whole draft: a save that
// lands mid-drag clears its own flags and restoring the draft wholesale would
// bring them back. Such a save drops the snapshot outright, so a cancel after
// it restores nothing rather than what the week held before the save.
export type WeekSessionsSnapshot = Record<
	number,
	{
		days: DaySession[][];
		freqSessions: FreqSession[];
		everydaySessions: EverydaySession[];
		dirty: boolean;
	}
>;

// The sessions live in reactive state, so the caller says how to detach a copy
// from it. The page passes $state.snapshot, which is the one piece of this
// module that would otherwise have to know about Svelte.
export type DeepClone = <T>(value: T) => T;

export function snapshotWeekSessions(drafts: WeekDrafts, clone: DeepClone): WeekSessionsSnapshot {
	const snapshot: WeekSessionsSnapshot = {};
	for (const wnStr of Object.keys(drafts)) {
		const wn = parseInt(wnStr);
		const draft = drafts[wn];
		snapshot[wn] = clone({
			days: draft.days,
			freqSessions: draft.freqSessions,
			everydaySessions: draft.everydaySessions,
			dirty: draft.dirty
		});
	}
	return snapshot;
}

// A week absent from the snapshot was opened by the drag itself, so it is
// emptied rather than left holding a copy of the session being restored.
export function restoreWeekSessions(drafts: WeekDrafts, snapshot: WeekSessionsSnapshot): void {
	for (const wnStr of Object.keys(drafts)) {
		const wn = parseInt(wnStr);
		const draft = drafts[wn];
		const saved = snapshot[wn];
		draft.days = saved ? saved.days : Array.from({ length: 7 }, () => []);
		draft.freqSessions = saved ? saved.freqSessions : [];
		draft.everydaySessions = saved ? saved.everydaySessions : [];
		draft.dirty = saved ? saved.dirty : false;
	}
}

// The days a week grid lays out, Monday first, which is the order day_of_week
// counts in.
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Which cell of the week holds a session, in the words the grid column uses.
export function sessionPlacement(draft: WeekDraft, sessionID: string): string {
	for (let day = 0; day < 7; day++) {
		if (draft.days[day].some((session) => session._id === sessionID)) return DAY_LABELS[day];
	}
	const frequency = draft.freqSessions.find((session) => session._id === sessionID);
	if (frequency) return `${frequency.times_per_week} per week`;
	if (draft.everydaySessions.some((session) => session._id === sessionID)) return 'Every day';
	return '';
}

// Every row of the program that schedules one training, in week order, with the
// one being edited marked. A week may schedule the same training more than once,
// so each row stands on its own rather than being folded into its week.
export function scheduledRows(
	drafts: WeekDrafts,
	weekNumbers: number[],
	trainingID: string,
	currentSessionID: string
): ScheduledRow[] {
	const rows: ScheduledRow[] = [];
	for (const week of weekNumbers) {
		const draft = drafts[week];
		if (!draft) continue;
		for (const session of draftSessions(draft)) {
			if (session.training_id !== trainingID) continue;
			rows.push({
				key: session._id,
				week,
				placement: sessionPlacement(draft, session._id),
				overrides: session.overrides,
				current: session._id === currentSessionID
			});
		}
	}
	return rows;
}
