import { describe, expect, it } from 'vitest';
import type { SessionResponse } from '$lib/api/client';
import {
	SESSION_RPE_ANCHORS,
	sessionRpe,
	sessionRpeColor,
	sessionRpeTint,
	sessionRpeTitle
} from './rpe';

function session(overrides: Partial<SessionResponse> = {}): SessionResponse {
	return {
		id: 'session-1',
		user_id: 'athlete',
		name: 'Board session',
		date: '2026-09-16T14:00:00Z',
		duration: 3600,
		notes: '',
		activity: 0,
		origin: 'logged',
		is_assessment: false,
		coach_reply_read: false,
		rpe_failed: false,
		updated_at: '2026-09-16T14:00:00Z',
		...overrides
	};
}

describe('sessionRpe', () => {
	it('reads a session nobody rated as carrying no answer', () => {
		expect(sessionRpe(session())).toBeNull();
		expect(sessionRpe(session({ rpe: null }))).toBeNull();
	});

	it('carries the anchor of every value the scale names', () => {
		for (const value of [5, 6, 7, 8, 9, 10]) {
			const rpe = sessionRpe(session({ rpe: value }));
			expect(rpe).not.toBeNull();
			expect(rpe?.value).toBe(value);
			expect(rpe?.short).toBe(String(value));
			expect(rpe?.anchor).toBe(SESSION_RPE_ANCHORS[value]);
			expect(rpe?.failed).toBe(false);
		}
	});

	it('reads a failure as ECHEC rather than as a number', () => {
		const rpe = sessionRpe(session({ rpe_failed: true }));

		expect(rpe?.failed).toBe(true);
		expect(rpe?.value).toBeNull();
		expect(rpe?.short).toBe('ECHEC');
		expect(rpe?.anchor).toBe('Could not be carried through');
	});

	// The store cannot hold both, but a client reading a server that widened the
	// scale should not show a number the athlete did not give.
	it('lets a failure win over a number sent beside it', () => {
		const rpe = sessionRpe(session({ rpe: 8, rpe_failed: true }));

		expect(rpe?.failed).toBe(true);
		expect(rpe?.value).toBeNull();
	});

	it('degrades a value it has no anchor for rather than inventing one', () => {
		const rpe = sessionRpe(session({ rpe: 3 }));

		expect(rpe?.short).toBe('3');
		expect(rpe?.anchor).toBe('Reported by the athlete');
	});

	// The week grid gives a session one short line, so a five character ECHEC
	// would leave the name a single letter.
	it('marks a failure with one glyph where there is no room for the word', () => {
		expect(sessionRpe(session({ rpe_failed: true }))?.mark).toBe('X');
		expect(sessionRpe(session({ rpe: 9 }))?.mark).toBe('9');
	});
});

describe('sessionRpeColor', () => {
	const colorOf = (overrides: Partial<SessionResponse>) =>
		sessionRpeColor(sessionRpe(session(overrides))!);

	it('reads the scale as four bands, so a week is scanned by colour', () => {
		expect(colorOf({ rpe: 5 })).toBe('var(--gn-tx)');
		expect(colorOf({ rpe: 7 })).toBe('var(--gn-tx)');
		expect(colorOf({ rpe: 8 })).toBe('var(--gd)');
		expect(colorOf({ rpe: 9 })).toBe('var(--pr-dk)');
		expect(colorOf({ rpe: 10 })).toBe('var(--pr-dk)');
		expect(colorOf({ rpe_failed: true })).toBe('var(--rd)');
	});
});

describe('sessionRpeTint', () => {
	it('grounds each band on the tint of its own hue', () => {
		const tintOf = (overrides: Partial<SessionResponse>) =>
			sessionRpeTint(sessionRpe(session(overrides))!);

		expect(tintOf({ rpe: 7 })).toBe('var(--gn-lt)');
		expect(tintOf({ rpe: 8 })).toBe('var(--gd-lt)');
		expect(tintOf({ rpe: 9 })).toBe('var(--pr-lt)');
		expect(tintOf({ rpe_failed: true })).toBe('var(--rd-lt)');
	});
});

describe('sessionRpeTitle', () => {
	it('names the scale, since a bare number sits on two of them', () => {
		expect(sessionRpeTitle(sessionRpe(session({ rpe: 9 }))!)).toBe(
			'Session RPE 9: needs two full rest days'
		);
	});

	it('names a failure by the word rather than by its glyph', () => {
		expect(sessionRpeTitle(sessionRpe(session({ rpe_failed: true }))!)).toBe(
			'Session RPE ECHEC: could not be carried through'
		);
	});
});
