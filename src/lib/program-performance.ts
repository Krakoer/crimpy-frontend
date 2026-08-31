import type { SessionResponse } from '$lib/api/client';

// What the athlete actually did, read against the program that asked for it. A
// coach editing next week needs last week's runs next to the prescription: the
// load that was missed, the note left after a painful session.

// Program weeks run Monday to Sunday from the program start date, which the API
// sends as a plain day. Read as a day and parsed at local midnight, the way
// $lib/date does, so a session played late on a Sunday evening stays in the week
// the athlete played it in rather than sliding into the next one through a UTC
// offset.
export function weekStart(programStartDate: string, weekNumber: number): Date {
	const start = new Date(`${programStartDate.slice(0, 10)}T00:00:00`);
	start.setDate(start.getDate() + (weekNumber - 1) * 7);
	return start;
}

// The sessions played in one program week, oldest first. Driven by the date the
// session was played rather than by the row it points at, so a run the athlete
// did off program still shows up in the week a coach is looking at.
export function sessionsOfWeek(
	sessions: SessionResponse[],
	programStartDate: string,
	weekNumber: number
): SessionResponse[] {
	const start = weekStart(programStartDate, weekNumber).getTime();
	const end = weekStart(programStartDate, weekNumber + 1).getTime();
	return sessions
		.filter((session) => {
			const played = new Date(session.date).getTime();
			return played >= start && played < end;
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
