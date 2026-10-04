import type { SessionResponse } from '$lib/api/client';
import { startOfWeek, toDateOnly } from '$lib/date';
import { currentTrainingDay, trainingDayOf } from '$lib/sessions';

// What the athlete actually did, read against the program that asked for it. A
// coach editing next week needs last week's runs next to the prescription: the
// load that was missed, the note left after a painful session.

// Program weeks run Monday to Sunday from the Monday of the program's start
// date, which the API sends as a plain day. Read as a day and parsed at local
// midnight, the way $lib/date does, so a session played late on a Sunday evening
// stays in the week the athlete played it in rather than sliding into the next
// one through a UTC offset. A legacy program stored off a Monday is read from
// the Monday before, the way the app reads it, so its weeks still open on a
// Monday and line up with an availability declaration.
export function weekStart(programStartDate: string, weekNumber: number): Date {
	const start = startOfWeek(new Date(`${programStartDate.slice(0, 10)}T00:00:00`));
	start.setDate(start.getDate() + (weekNumber - 1) * 7);
	return start;
}

// The program week a training day falls in, 1 for the week the program opens
// on. Below 1 before the program starts and past its duration once it is over,
// so the caller decides how to read either side. Counted in calendar days
// rather than elapsed milliseconds, so a daylight saving change neither ends a
// week an hour early nor late.
export function programWeekOn(programStartDate: string, day: Date): number {
	const first = weekStart(programStartDate, 1);
	const monday = startOfWeek(day);
	const days = Math.round(
		(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) -
			Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) /
			86400000
	);
	return Math.floor(days / 7) + 1;
}

// The program week being trained now. A week turns over on Monday at the same
// 04:00 a training day does, so a session begun just after midnight on the
// Monday still counts in the week it closes, and so does this.
export function currentProgramWeek(programStartDate: string, now: Date = new Date()): number {
	return programWeekOn(programStartDate, currentTrainingDay(now));
}

export type ProgramStatus = { state: 'upcoming' | 'active' | 'completed'; week: number };

// Where a program stands now, by the week being trained: upcoming before its
// first Monday, active through its last week, completed once that week is over.
export function programStatus(
	programStartDate: string,
	durationWeeks?: number,
	now: Date = new Date()
): ProgramStatus {
	const week = currentProgramWeek(programStartDate, now);
	if (week < 1) return { state: 'upcoming', week: 0 };
	if (durationWeeks && week > durationWeeks) return { state: 'completed', week: durationWeeks };
	return { state: 'active', week };
}

// The calendar weeks a program covers, as the Mondays an availability request
// is bounded by: the first week of the program and its last, both included.
export function programWeekRange(
	programStartDate: string,
	weekCount: number
): { from: string; to: string } {
	const lastWeek = Math.max(weekCount, 1);
	return {
		from: toDateOnly(weekStart(programStartDate, 1)),
		to: toDateOnly(weekStart(programStartDate, lastWeek))
	};
}

// The sessions played in one program week, oldest first. Driven by the training
// day the session counts for rather than by the row it points at, so a run the
// athlete did off program still shows up in the week a coach is looking at, and
// one begun after midnight on the Monday stays in the week it closed.
export function sessionsOfWeek(
	sessions: SessionResponse[],
	programStartDate: string,
	weekNumber: number
): SessionResponse[] {
	const start = weekStart(programStartDate, weekNumber).getTime();
	const end = weekStart(programStartDate, weekNumber + 1).getTime();
	return sessions
		.filter((session) => {
			const day = trainingDayOf(session).getTime();
			return day >= start && day < end;
		})
		.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// The sessions played from each prescribed row, keyed by that row's id. A row
// can hold more than one: a frequency session is played as many times as it was
// prescribed, and nothing stops an athlete from running the same day twice.
export function sessionsByProgramSession(
	sessions: SessionResponse[]
): Map<string, SessionResponse[]> {
	const byRow = new Map<string, SessionResponse[]>();
	for (const session of sessions) {
		if (!session.program_session_id) continue;
		const played = byRow.get(session.program_session_id);
		if (played) played.push(session);
		else byRow.set(session.program_session_id, [session]);
	}
	for (const played of byRow.values()) {
		played.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}
	return byRow;
}
