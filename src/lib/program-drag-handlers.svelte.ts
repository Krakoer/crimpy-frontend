import { isSortable } from '@dnd-kit/svelte/sortable';
import {
	cellSessions,
	lockedSessionWeek,
	moveSession,
	parseCell,
	restoreWeekSessions,
	sessionForCell,
	settleWeekSessions,
	snapshotWeekSessions,
	type DraftSession,
	type SessionDrop,
	type WeekDrafts,
	type WeekSessionsSnapshot
} from '$lib/program-draft';
import { createDragOverLatch } from '$lib/dnd-drag-over-latch';
import { newItemPayload } from '$lib/dnd-new-item';

export interface ProgramDragHandlers {
	onDragStart(): void;
	onDragOver(event: { operation: { source: unknown; target: unknown } }): void;
	onDragEnd(event: { canceled: boolean; operation: { source: unknown; target: unknown } }): void;
	// A save that lands mid-drag rebuilds the week it saved from what the server
	// returned, fresh local keys and all. Cancelling the drag after that must not
	// put the pre-save arrays back on top of them, so the drag gives up its
	// snapshot outright. It gives up settling with it: the weeks the pointer
	// crossed stay dirty, which is the right way round, since nothing is left to
	// tell whether they ended where they started.
	dropSnapshot(): void;
}

// The cell a drop lands in and the index inside it. A sortable target is one of
// the sessions, so the drop takes its place; anything else is the cell itself
// and the session goes to the end.
function dropTarget(target: unknown): SessionDrop | null {
	const id = String((target as { id: string }).id);
	if (isSortable(target as never)) {
		const sortable = target as { id: string; group?: string; index: number };
		const cell = parseCell(String(sortable.group ?? ''));
		return cell ? { cell, overSessionID: id, index: sortable.index } : null;
	}
	const cell = parseCell(id);
	return cell ? { cell, overSessionID: null, index: Infinity } : null;
}

const detach = <T>(value: T): T => $state.snapshot(value) as T;

/**
 * The week grid and the training rail beside it, driven the way the training
 * editor's tree is: the move runs on drag over so the cells show the result
 * before the drop, and the snapshot taken at the start is what a cancel goes
 * back to.
 *
 * The page keeps what only it can answer: how a new session is built, and how a
 * refused move is reported.
 */
export function createProgramDragHandlers(
	drafts: () => WeekDrafts,
	editMode: () => boolean,
	newSession: (trainingId: string) => DraftSession,
	onLockedMoveRefused: () => void
): ProgramDragHandlers {
	let sessionsSnapshot: WeekSessionsSnapshot | null = null;
	const latch = createDragOverLatch();

	return {
		onDragStart() {
			latch.clear();
			sessionsSnapshot = snapshotWeekSessions(drafts(), detach);
		},

		dropSnapshot() {
			sessionsSnapshot = null;
		},

		onDragOver({ operation: { source, target } }) {
			if (!editMode() || !source) return;
			// A training dragged out of the library has nothing to move yet: it is
			// created on drop.
			if (!isSortable(source as never)) return;
			if (!target) {
				latch.clear();
				return;
			}

			const sourceId = String((source as { id: string }).id);
			if (!latch.accepts(sourceId, String((target as { id: string }).id))) return;

			const drop = dropTarget(target);
			if (!drop) return;

			// Rescheduling a played session is fine, moving it to another week is
			// not: it would drop the row out of the week it was prescribed in.
			const lockedWn = lockedSessionWeek(drafts(), sourceId);
			if (lockedWn !== null && lockedWn !== drop.cell.wn) return;

			moveSession(drafts(), sourceId, drop);
		},

		onDragEnd({ canceled, operation: { source, target } }) {
			const snapshot = sessionsSnapshot;
			sessionsSnapshot = null;

			if (canceled || !editMode()) {
				if (snapshot) restoreWeekSessions(drafts(), snapshot);
				return;
			}

			const sourceId = source ? String((source as { id: string }).id) : '';
			const drop = target ? dropTarget(target) : null;

			// A training out of the library moved nothing on the way in, so it is
			// the one drop that makes its own change rather than settling one the
			// drag already made.
			const newTrainingId = newItemPayload(sourceId);
			if (newTrainingId !== null) {
				if (!drop) return;
				const sessions = cellSessions(drafts(), drop.cell);
				sessions.splice(
					Math.min(drop.index, sessions.length),
					0,
					sessionForCell(newSession(newTrainingId), drop.cell)
				);
				drafts()[drop.cell.wn].dirty = true;
				return;
			}

			// The move itself already happened on drag over, week by week as the
			// pointer crossed them. What is left is settling which of those weeks
			// the drag actually changed, and telling the coach why a played session
			// refused to follow the pointer.
			if (snapshot) settleWeekSessions(drafts(), snapshot, detach);
			if (!drop) return;

			const lockedWn = lockedSessionWeek(drafts(), sourceId);
			if (lockedWn !== null && lockedWn !== drop.cell.wn) onLockedMoveRefused();
		}
	};
}
