import { describe, expect, it } from 'vitest';
import type { SessionResponse } from '$lib/api/client';
import { sessionsByProgramSession, sessionsOfWeek, weekStart } from './program-performance';

function session(
	id: string,
	date: string,
	overrides: Partial<SessionResponse> = {}
): SessionResponse {
	return {
		id,
		user_id: 'athlete',
		name: `Session ${id}`,
		date,
		duration: 1800,
		notes: '',
		activity: 0,
		origin: 'played',
		is_assessment: false,
		coach_reply_read: false,
		updated_at: date,
		...overrides
	};
}

const MONDAY = '2026-03-02';

describe('weekStart', () => {
	it('starts week one on the program start date', () => {
		expect(weekStart(MONDAY, 1)).toEqual(new Date('2026-03-02T00:00:00'));
	});

	it('adds seven days per week', () => {
		expect(weekStart(MONDAY, 3)).toEqual(new Date('2026-03-16T00:00:00'));
	});

	it('crosses a daylight saving change without drifting off midnight', () => {
		expect(weekStart('2026-03-23', 3)).toEqual(new Date('2026-04-06T00:00:00'));
	});
});

describe('sessionsOfWeek', () => {
	const sessions = [
		session('before', '2026-03-01T18:00:00'),
		session('monday', '2026-03-02T09:00:00'),
		session('sunday-late', '2026-03-08T22:30:00'),
		session('next-monday', '2026-03-09T07:00:00')
	];

	it('keeps the sessions played inside the week', () => {
		expect(sessionsOfWeek(sessions, MONDAY, 1).map((s) => s.id)).toEqual(['monday', 'sunday-late']);
	});

	it('reads the following week from the same start date', () => {
		expect(sessionsOfWeek(sessions, MONDAY, 2).map((s) => s.id)).toEqual(['next-monday']);
	});

	it('orders the week oldest first whatever order it was given', () => {
		const shuffled = [sessions[2], sessions[1]];
		expect(sessionsOfWeek(shuffled, MONDAY, 1).map((s) => s.id)).toEqual(['monday', 'sunday-late']);
	});
});

describe('sessionsByProgramSession', () => {
	it('leaves out the runs played off program', () => {
		const byRow = sessionsByProgramSession([session('free', '2026-03-02T09:00:00')]);
		expect(byRow.size).toBe(0);
	});

	it('groups every run played from one prescribed row, oldest first', () => {
		const byRow = sessionsByProgramSession([
			session('second', '2026-03-05T09:00:00', { program_session_id: 'row-1' }),
			session('first', '2026-03-03T09:00:00', { program_session_id: 'row-1' }),
			session('other', '2026-03-04T09:00:00', { program_session_id: 'row-2' })
		]);
		expect(byRow.get('row-1')?.map((s) => s.id)).toEqual(['first', 'second']);
		expect(byRow.get('row-2')?.map((s) => s.id)).toEqual(['other']);
	});
});
