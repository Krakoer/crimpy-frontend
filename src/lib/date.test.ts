import { describe, expect, it } from 'vitest';
import { mondayOf, timeAgo, toDateOnly } from './date';

describe('toDateOnly', () => {
	it('keeps the calendar day a local Date is on', () => {
		expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
	});

	it('pads a single digit month and day', () => {
		expect(toDateOnly(new Date(2026, 8, 7))).toBe('2026-09-07');
	});

	it('does not slide a local midnight back a day, the way toISOString does', () => {
		// This is the whole reason the helper exists. West of UTC, a Date built
		// at local midnight is the previous day in UTC, so formatting it through
		// toISOString would match a program week against the wrong Monday.
		const localMidnight = new Date(2026, 0, 5);
		const shiftedByUtc = new Date(localMidnight.getTime() - 8 * 60 * 60 * 1000).toISOString();

		expect(toDateOnly(localMidnight)).toBe('2026-01-05');
		expect(shiftedByUtc.slice(0, 10)).toBe('2026-01-04');
	});

	it('agrees with the Monday the week helper returns', () => {
		// A program week start is always a Monday, and the availability lookup
		// matches on this string, so the two have to line up exactly.
		const monday = new Date(`${mondayOf('2026-01-08')}T00:00:00`);

		expect(toDateOnly(monday)).toBe('2026-01-05');
		expect(monday.getDay()).toBe(1);
	});
});

describe('mondayOf', () => {
	it('returns the same day for a Monday', () => {
		expect(mondayOf('2026-01-05')).toBe('2026-01-05');
	});

	it('walks back to the Monday of a mid week day', () => {
		expect(mondayOf('2026-01-08')).toBe('2026-01-05');
	});

	it('treats Sunday as the end of its week, not the start of the next', () => {
		// The Date constructor counts from Sunday, so this is the case that
		// needs the special branch.
		expect(mondayOf('2026-01-11')).toBe('2026-01-05');
	});
});

describe('timeAgo', () => {
	const now = new Date('2026-06-10T12:00:00Z');

	it('calls the last minute just now', () => {
		expect(timeAgo('2026-06-10T11:59:30Z', now)).toBe('just now');
	});

	it('counts minutes then hours inside the day', () => {
		expect(timeAgo('2026-06-10T11:20:00Z', now)).toBe('40m ago');
		expect(timeAgo('2026-06-10T05:00:00Z', now)).toBe('7h ago');
	});

	it('names yesterday and the days under a week', () => {
		expect(timeAgo('2026-06-09T10:00:00Z', now)).toBe('yesterday');
		expect(timeAgo('2026-06-07T10:00:00Z', now)).toBe('3 days ago');
	});

	it('falls back to the date once a week has passed', () => {
		expect(timeAgo('2026-05-30T10:00:00Z', now)).toBe('30 May');
	});

	it('does not report a negative age for a session dated ahead', () => {
		// A coachee can log a session with tomorrow's date, and "-1 days ago"
		// would be the result of subtracting without this guard.
		expect(timeAgo('2026-06-11T12:00:00Z', now)).toBe('just now');
	});
});
